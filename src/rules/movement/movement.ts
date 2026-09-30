import {
  HEX_DIRECTIONS,
  formatHexId,
  neighbor,
  parseHexCoordinateId,
  stableSort,
  type HexId,
  type PieceId,
  type PlayerId,
} from '../../core/index.js';
import { canonicalizeHexside, createMapDefinitionIndex, directedHexside } from '../../domain/map/index.js';
import { createPieceDefinitionCatalogIndex, createPieceStateIndex } from '../../domain/piece/index.js';
import type { GameState, MobilityType, RuleViolation } from '../kernel/model.js';
import type { RuleQueryResult } from '../query/model.js';
import { queryStacking } from '../stacking/stacking.js';
import { violation } from '../validation/violation.js';
import { queryZoc } from '../zoc/zoc.js';

export interface MovementStepCost {
  readonly fromHexId: HexId;
  readonly toHexId: HexId;
  readonly terrainTicks: number;
  readonly hexsideTicks: number;
  readonly totalTicks: number;
}

export interface MovementPathValue {
  readonly path: readonly HexId[];
  readonly steps: readonly MovementStepCost[];
  readonly totalTicks: number;
  readonly allowanceTicks: number;
  readonly minimumMoveUsed: boolean;
}

const usageFor = (state: GameState, pieceId: PieceId) => state.usage.find((entry) => entry.pieceId === pieceId);

export const movementAllowanceTicks = (state: GameState, pieceId: PieceId): number => {
  const piece = createPieceStateIndex(state.pieceState).get(pieceId);
  if (!piece || piece.currentFaceId === null || piece.remainingSteps === null) return 0;
  const definition = createPieceDefinitionCatalogIndex(state.scenario.pieceCatalog).get(piece.definitionId);
  const face = definition?.faces.find(({ id }) => id === piece.currentFaceId);
  const printed = face?.steps.find(({ remainingSteps }) => remainingSteps === piece.remainingSteps)
    ?.movementPointTicks ?? 0;
  if (piece.mode === 'STRAT') return printed * 2;
  if (piece.mode === 'RESERVE') {
    return state.sequence.phase === 'REACTION' ? Math.floor(printed / 2)
      : state.sequence.phase === 'EXPLOITATION' ? printed : Math.floor(printed / 4);
  }
  if (piece.mode === 'DG' || piece.mode === 'EXPLOITATION') return Math.floor(printed / 2);
  return printed;
};

const usageTicks = (state: GameState, pieceId: PieceId): number =>
  usageFor(state, pieceId)?.movementSpentTicks ?? 0;

const mobilityTypes: Readonly<Record<string, MobilityType>> = {
  'mobility:leg': 'leg', 'mobility:truck': 'truck', 'mobility:tracked': 'tracked',
};

/** Mobility type (3.1a) of the Piece's current printed face, or null when unknown. */
export const pieceMobilityType = (state: GameState, pieceId: PieceId): MobilityType | null => {
  const piece = createPieceStateIndex(state.pieceState).get(pieceId);
  if (!piece || piece.currentFaceId === null) return null;
  const face = createPieceDefinitionCatalogIndex(state.scenario.pieceCatalog).get(piece.definitionId)
    ?.faces.find(({ id }) => id === piece.currentFaceId);
  return face ? mobilityTypes[String(face.mobilityClassDefinitionId)] ?? null : null;
};

type StepEvaluation =
  | { readonly kind: 'NON_ADJACENT' }
  | { readonly kind: 'PROHIBITED'; readonly reverse: boolean }
  | { readonly kind: 'COST'; readonly cost: MovementStepCost; readonly all: boolean };

type HexCost = { readonly kind: 'MP'; readonly ticks: number } | { readonly kind: 'ALL' } | { readonly kind: 'PROHIBITED' };

/** Terrain costs resolved once per query so path search does not rebuild indexes per step. */
interface MovementCostModel {
  readonly evaluate: (fromHexId: HexId, toHexId: HexId) => StepEvaluation;
}

const createMovementCostModel = (state: GameState, mobility: MobilityType): MovementCostModel => {
  const map = createMapDefinitionIndex(state.scenario.mapDefinition);
  const configuration = state.configuration;
  const terrainCosts = new Map(configuration.terrainMovementCosts
    .map(({ terrainDefinitionId, costs }) => [String(terrainDefinitionId), costs[mobility]]));
  const hexsideCosts = new Map(configuration.hexsideMovementCosts
    .map(({ featureDefinitionId, costs }) => [String(featureDefinitionId), costs[mobility]]));
  const roadCosts = new Map(configuration.roadMovementCosts
    .map(({ featureDefinitionId, costs }) => [String(featureDefinitionId), costs[mobility]]));
  const hexCosts = new Map<HexId, HexCost | undefined>();

  // 6.2d: use the most costly terrain in the Hex; "ot" entries and unlisted features defer to it.
  const hexCost = (hexId: HexId): HexCost | undefined => {
    if (hexCosts.has(hexId)) return hexCosts.get(hexId);
    const definition = map.getHex(hexId);
    let result: HexCost | undefined;
    if (definition) {
      const listed = [
        ...definition.terrainDefinitionIds.map((id) => terrainCosts.get(String(id))
          ?? { kind: 'MP' as const, ticks: configuration.defaultTerrainCostTicks }),
        ...definition.features.flatMap(({ definitionId }) => terrainCosts.get(String(definitionId)) ?? []),
      ].filter((cost) => cost.kind !== 'OTHER_TERRAIN');
      const costs = listed.length > 0 ? listed : [{ kind: 'MP' as const, ticks: configuration.defaultTerrainCostTicks }];
      if (costs.some(({ kind }) => kind === 'PROHIBITED')) result = { kind: 'PROHIBITED' };
      else if (costs.some(({ kind }) => kind === 'ALL')) result = { kind: 'ALL' };
      else result = { kind: 'MP', ticks: Math.max(...costs.map((cost) => cost.kind === 'MP' ? cost.ticks : 0)) };
    }
    hexCosts.set(hexId, result);
    return result;
  };

  const evaluate = (fromHexId: HexId, toHexId: HexId): StepEvaluation => {
    const from = parseHexCoordinateId(fromHexId);
    const to = parseHexCoordinateId(toHexId);
    if (!from.ok || !to.ok) return { kind: 'NON_ADJACENT' };
    const direction = HEX_DIRECTIONS.find((candidate) => formatHexId(neighbor(from.value, candidate)) === toHexId);
    const target = hexCost(toHexId);
    const origin = hexCost(fromHexId);
    if (!direction || !target || !origin) return { kind: 'NON_ADJACENT' };
    const canonical = canonicalizeHexside(directedHexside(from.value, direction));
    const features = (canonical.ok ? map.getHexside(canonical.value.id)?.featureDefinitionIds : undefined) ?? [];

    // 6.2a: a road hexside pays the road cost and ignores the Hex and other hexside features;
    // the road also negates prohibited terrain and hexsides (6.2c) in both directions.
    const roadTicks = features.flatMap((id) => {
      const cost = roadCosts.get(String(id));
      return cost?.kind === 'MP' ? [cost.ticks] : [];
    });
    if (roadTicks.length > 0) {
      const ticks = Math.min(...roadTicks);
      return { kind: 'COST', all: false, cost: { fromHexId, toHexId, terrainTicks: ticks, hexsideTicks: 0, totalTicks: ticks } };
    }

    // 6.2b: additive hexside costs; prohibited or "All" hexsides apply like Hex terrain.
    const hexside = features.flatMap((id) => {
      const cost = hexsideCosts.get(String(id));
      return cost ? [cost] : [];
    });
    const hexsideProhibited = hexside.some(({ kind }) => kind === 'PROHIBITED');
    if (target.kind === 'PROHIBITED' || hexsideProhibited) return { kind: 'PROHIBITED', reverse: false };
    // 6.1d: A to B is legal only if B to A would be as well.
    if (origin.kind === 'PROHIBITED') return { kind: 'PROHIBITED', reverse: true };
    const hexsideTicks = hexside.reduce((total, cost) => total + (cost.kind === 'MP' ? cost.ticks : 0), 0);
    const terrainTicks = target.kind === 'MP' ? target.ticks : 0;
    const all = target.kind === 'ALL' || hexside.some(({ kind }) => kind === 'ALL');
    return {
      kind: 'COST', all,
      cost: { fromHexId, toHexId, terrainTicks, hexsideTicks, totalTicks: Math.max(0, terrainTicks + hexsideTicks) },
    };
  };
  return { evaluate };
};

const phaseAllowsMovement = (state: GameState): boolean =>
  ['MOVEMENT', 'REACTION', 'EXPLOITATION'].includes(state.sequence.phase)
  && state.sequence.segment === 'MOVEMENT';

/** Per-query caches for Hex-level constraints that do not depend on the path taken. */
interface MovementHexChecks {
  readonly enemyOccupied: (hexId: HexId) => boolean;
  readonly stackingAllowed: (hexId: HexId) => boolean;
  readonly zocAllowed: (hexId: HexId) => boolean;
}

const createMovementHexChecks = (state: GameState, actorId: PlayerId, pieceId: PieceId): MovementHexChecks => {
  const enemyHexes = new Set(state.pieceState.pieces
    .filter((candidate) => candidate.ownerId !== actorId && candidate.location.kind === 'ON_MAP')
    .map((candidate) => candidate.location.kind === 'ON_MAP' ? candidate.location.hexId : null));
  const memo = <T>(compute: (hexId: HexId) => T) => {
    const cache = new Map<HexId, T>();
    return (hexId: HexId): T => {
      if (!cache.has(hexId)) cache.set(hexId, compute(hexId));
      return cache.get(hexId)!;
    };
  };
  return {
    enemyOccupied: (hexId) => enemyHexes.has(hexId),
    stackingAllowed: memo((hexId) => queryStacking(state, hexId, pieceId).allowed),
    zocAllowed: memo((hexId) => queryZoc(state, actorId, hexId, 'MOVEMENT').allowed),
  };
};

export const queryMovementPath = (
  state: GameState,
  actorId: PlayerId,
  pieceId: PieceId,
  path: readonly HexId[],
): RuleQueryResult<MovementPathValue> => {
  const piece = createPieceStateIndex(state.pieceState).get(pieceId);
  const violations: RuleViolation[] = [];
  const mobility = piece ? pieceMobilityType(state, pieceId) : null;
  if (!piece) violations.push(violation('UNKNOWN_PIECE', ['pieceId'], `Unknown Piece ${pieceId}.`, '6.1'));
  else {
    if (piece.ownerId !== actorId) violations.push(violation('NOT_PIECE_OWNER', ['actorId'], 'Actor does not own the mover.', '6.1'));
    if (piece.location.kind !== 'ON_MAP') violations.push(violation('PIECE_NOT_ON_MAP', ['pieceId'], 'Mover must begin on-map.', '6.1'));
    else if (path[0] !== piece.location.hexId) violations.push(violation('PATH_ORIGIN_MISMATCH', ['path', 0], 'Path must begin at the Piece location.', '6.1'));
    if (piece.mode === null) violations.push(violation('PIECE_CANNOT_MOVE', ['pieceId'], 'Piece has no ground movement mode.', '6.1'));
    else if (mobility === null) violations.push(violation('UNKNOWN_MOBILITY_TYPE', ['pieceId'], 'Piece face has no Leg, Truck, or Tracked mobility type.', '3.1a'));
    if (piece.mode === 'RESERVE' && ['REACTION', 'EXPLOITATION'].includes(state.sequence.phase)
      && !usageFor(state, pieceId)?.reserveReleased) violations.push(violation('RESERVE_NOT_RELEASED', ['pieceId'], 'Reserve must be released before moving.', '5.7b'));
  }
  if (actorId !== state.sequence.actingPlayerId) violations.push(violation('WRONG_ACTOR', ['actorId'], 'Actor does not own the current sequence step.', '2.3'));
  if (!phaseAllowsMovement(state)) violations.push(violation('INVALID_MOVEMENT_PHASE', ['sequence'], 'Ground movement requires a Movement Segment.', '6.1'));
  if (path.length < 2) violations.push(violation('EMPTY_MOVEMENT_PATH', ['path'], 'Movement path needs origin and destination.', '6.1'));

  const allowanceTicks = piece ? movementAllowanceTicks(state, pieceId) : 0;
  const alreadySpent = usageTicks(state, pieceId);
  const steps: MovementStepCost[] = [];
  let enteredAllTerrain = false;
  if (piece && mobility !== null) {
    const costs = createMovementCostModel(state, mobility);
    const checks = createMovementHexChecks(state, actorId, pieceId);
    for (let index = 1; index < path.length; index += 1) {
      const step = costs.evaluate(path[index - 1]!, path[index]!);
      if (step.kind === 'NON_ADJACENT') {
        violations.push(violation('NON_ADJACENT_PATH_STEP', ['path', index], 'Path step is absent or non-adjacent.', '6.1'));
        continue;
      }
      if (step.kind === 'PROHIBITED') {
        violations.push(step.reverse
          ? violation('PROHIBITED_REVERSE_MOVE', ['path', index], 'A unit may not leave prohibited terrain where it could not have entered.', '6.1d')
          : violation('PROHIBITED_TERRAIN', ['path', index], 'Ground units cannot enter prohibited terrain.', '6.2c'));
        continue;
      }
      // "All" consumes the entire MA, so it can only be the first step of an unmoved unit.
      const cost = step.all ? { ...step.cost, totalTicks: Math.max(step.cost.totalTicks, allowanceTicks) } : step.cost;
      enteredAllTerrain ||= step.all;
      steps.push(cost);
      const toHexId = cost.toHexId;
      if (checks.enemyOccupied(toHexId)) violations.push(violation('ENEMY_OCCUPIED_HEX', ['path', index], 'Normal movement cannot enter an enemy-occupied Hex; declare Overrun.', '6.3'));
      if (!checks.stackingAllowed(toHexId)) violations.push(violation('STACKING_LIMIT_EXCEEDED', ['path', index], 'Movement would exceed stacking.', '4.8'));
      const zocAllowed = checks.zocAllowed(toHexId);
      if (piece.mode === 'STRAT' && !zocAllowed) violations.push(violation('STRAT_ENTERING_ZOC', ['path', index], 'Strat Mode cannot enter enemy ZOC.', '5.8a'));
      if (!zocAllowed && index < path.length - 1) violations.push(violation('MOVEMENT_CONTINUES_AFTER_ZOC', ['path', index], 'Movement must stop upon entering enemy ZOC.', '4.5'));
    }
  }
  const totalTicks = steps.reduce((total, step) => total + step.totalTicks, 0);
  const normalBudget = totalTicks + alreadySpent <= allowanceTicks && !(enteredAllTerrain && alreadySpent > 0);
  // 6.1c: one Hex regardless of cost, but never into prohibited terrain (reported above) and only with MA > 0.
  const minimumMoveUsed = !normalBudget && path.length === 2 && alreadySpent === 0
    && allowanceTicks > 0 && state.configuration.minimumMoveTicks > 0;
  if (!normalBudget && !minimumMoveUsed) violations.push(violation('INSUFFICIENT_MOVEMENT_ALLOWANCE', ['path'], `${totalTicks} ticks exceed remaining allowance.`, '6.1'));
  const allowed = violations.length === 0;
  return {
    allowed,
    value: { path: [...path], steps, totalTicks, allowanceTicks, minimumMoveUsed },
    reasons: violations.length === 0
      ? [{ code: 'MOVEMENT_PATH_LEGAL', allowed: true, message: `${totalTicks} ticks.`, rule: '6.1-6.3' }]
      : violations.map((entry) => ({ code: entry.code, allowed: false, message: entry.message, rule: entry.rule })),
    facts: [
      { key: 'movement.totalTicks', value: totalTicks, visibility: 'PUBLIC', ownerId: null },
      { key: 'movement.allowanceTicks', value: allowanceTicks, visibility: 'OWNER_ONLY', ownerId: actorId },
    ],
    dependencies: [
      { aggregate: 'GAME', revision: state.revision, key: `movement:${pieceId}` },
      { aggregate: 'MAP', revision: state.mapState.revision, key: 'movement-map' },
      { aggregate: 'PIECE', revision: state.pieceState.revision, key: 'movement-pieces' },
    ],
  };
};

export interface ReachableHex {
  readonly hexId: HexId;
  readonly costTicks: number;
  readonly path: readonly HexId[];
}

/**
 * Least-cost destinations using the same step rules as `queryMovementPath`. Hex constraints
 * (enemy occupation, stacking, ZOC stop) are path-independent, so a single Dijkstra pass is exact.
 */
export const queryReachableHexes = (
  state: GameState,
  actorId: PlayerId,
  pieceId: PieceId,
): RuleQueryResult<readonly ReachableHex[]> => {
  const piece = createPieceStateIndex(state.pieceState).get(pieceId);
  const mobility = pieceMobilityType(state, pieceId);
  if (!piece || piece.location.kind !== 'ON_MAP' || mobility === null) {
    return { allowed: false, value: [], reasons: [{ code: 'PIECE_NOT_ON_MAP', allowed: false, message: 'Piece is not on-map or has no mobility type.', rule: '6.1' }], facts: [], dependencies: [] };
  }
  const originHexId = piece.location.hexId;
  const remaining = movementAllowanceTicks(state, pieceId) - usageTicks(state, pieceId);
  const unmoved = usageTicks(state, pieceId) === 0;
  const minimumMove = unmoved && movementAllowanceTicks(state, pieceId) > 0 && state.configuration.minimumMoveTicks > 0;
  const costs = createMovementCostModel(state, mobility);
  const checks = createMovementHexChecks(state, actorId, pieceId);
  const best = new Map<HexId, ReachableHex>();
  const frontier = new Map<HexId, ReachableHex>([[originHexId, { hexId: originHexId, costTicks: 0, path: [originHexId] }]]);
  const terminal = new Set<HexId>();
  while (frontier.size > 0) {
    let current: ReachableHex | undefined;
    for (const entry of frontier.values()) {
      if (!current || entry.costTicks < current.costTicks
        || (entry.costTicks === current.costTicks && String(entry.hexId).localeCompare(String(current.hexId)) < 0)) current = entry;
    }
    frontier.delete(current!.hexId);
    best.set(current!.hexId, current!);
    if (terminal.has(current!.hexId)) continue;
    const coordinate = parseHexCoordinateId(current!.hexId);
    if (!coordinate.ok) continue;
    for (const direction of HEX_DIRECTIONS) {
      const nextId = formatHexId(neighbor(coordinate.value, direction));
      if (best.has(nextId)) continue;
      const step = costs.evaluate(current!.hexId, nextId);
      if (step.kind !== 'COST') continue;
      if (checks.enemyOccupied(nextId) || !checks.stackingAllowed(nextId)) continue;
      const zocAllowed = checks.zocAllowed(nextId);
      if (piece.mode === 'STRAT' && !zocAllowed) continue;
      const fromOrigin = current!.hexId === originHexId;
      const stepTicks = step.all ? Math.max(step.cost.totalTicks, movementAllowanceTicks(state, pieceId)) : step.cost.totalTicks;
      const costTicks = current!.costTicks + stepTicks;
      const withinBudget = costTicks <= remaining && !(step.all && !unmoved);
      if (!withinBudget && !(fromOrigin && minimumMove)) continue;
      const existing = frontier.get(nextId);
      if (existing && existing.costTicks <= costTicks) continue;
      frontier.set(nextId, { hexId: nextId, costTicks, path: [...current!.path, nextId] });
      // Entering enemy ZOC ends movement (4.5); a minimum or "All" move also ends it.
      if (!zocAllowed || !withinBudget || step.all) terminal.add(nextId);
      else terminal.delete(nextId);
    }
  }
  const reachable = stableSort([...best.values()].filter(({ hexId }) => hexId !== originHexId),
    (left, right) => left.costTicks - right.costTicks || String(left.hexId).localeCompare(String(right.hexId)));
  return {
    allowed: true,
    value: reachable,
    reasons: [{ code: 'REACHABLE_HEXES_ENUMERATED', allowed: true, message: `${reachable.length} reachable Hexes.`, rule: '6.1-6.3' }],
    facts: [{ key: 'movement.reachableCount', value: reachable.length, visibility: 'OWNER_ONLY', ownerId: actorId }],
    dependencies: [{ aggregate: 'GAME', revision: state.revision, key: `reachable:${pieceId}` }],
  };
};
