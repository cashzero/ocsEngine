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
import type { GameState, RuleViolation } from '../kernel/model.js';
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

const stepCost = (state: GameState, fromHexId: HexId, toHexId: HexId): MovementStepCost | undefined => {
  const map = createMapDefinitionIndex(state.scenario.mapDefinition);
  const target = map.getHex(toHexId);
  const from = parseHexCoordinateId(fromHexId);
  const to = parseHexCoordinateId(toHexId);
  if (!target || !from.ok || !to.ok) return undefined;
  const direction = HEX_DIRECTIONS.find((candidate) =>
    formatHexId(neighbor(from.value, candidate)) === toHexId);
  if (!direction) return undefined;
  const terrainTicks = Math.max(
    state.configuration.defaultTerrainCostTicks,
    ...target.terrainDefinitionIds.map((id) => state.configuration.terrainMovementCosts
      .find(({ terrainDefinitionId }) => terrainDefinitionId === id)?.costTicks
      ?? state.configuration.defaultTerrainCostTicks),
  );
  const canonical = canonicalizeHexside(directedHexside(from.value, direction));
  const edge = canonical.ok ? map.getHexside(canonical.value.id) : undefined;
  const hexsideTicks = edge?.featureDefinitionIds.reduce((total, id) => total
    + (state.configuration.hexsideMovementCosts
      .find(({ featureDefinitionId }) => featureDefinitionId === id)?.costTicks ?? 0), 0) ?? 0;
  return { fromHexId, toHexId, terrainTicks, hexsideTicks, totalTicks: terrainTicks + hexsideTicks };
};

const phaseAllowsMovement = (state: GameState): boolean =>
  ['MOVEMENT', 'REACTION', 'EXPLOITATION'].includes(state.sequence.phase)
  && state.sequence.segment === 'MOVEMENT';

export const queryMovementPath = (
  state: GameState,
  actorId: PlayerId,
  pieceId: PieceId,
  path: readonly HexId[],
): RuleQueryResult<MovementPathValue> => {
  const piece = createPieceStateIndex(state.pieceState).get(pieceId);
  const violations: RuleViolation[] = [];
  if (!piece) violations.push(violation('UNKNOWN_PIECE', ['pieceId'], `Unknown Piece ${pieceId}.`, '6.1'));
  else {
    if (piece.ownerId !== actorId) violations.push(violation('NOT_PIECE_OWNER', ['actorId'], 'Actor does not own the mover.', '6.1'));
    if (piece.location.kind !== 'ON_MAP') violations.push(violation('PIECE_NOT_ON_MAP', ['pieceId'], 'Mover must begin on-map.', '6.1'));
    else if (path[0] !== piece.location.hexId) violations.push(violation('PATH_ORIGIN_MISMATCH', ['path', 0], 'Path must begin at the Piece location.', '6.1'));
    if (piece.mode === null) violations.push(violation('PIECE_CANNOT_MOVE', ['pieceId'], 'Piece has no ground movement mode.', '6.1'));
    if (piece.mode === 'RESERVE' && ['REACTION', 'EXPLOITATION'].includes(state.sequence.phase)
      && !usageFor(state, pieceId)?.reserveReleased) violations.push(violation('RESERVE_NOT_RELEASED', ['pieceId'], 'Reserve must be released before moving.', '5.7b'));
  }
  if (actorId !== state.sequence.actingPlayerId) violations.push(violation('WRONG_ACTOR', ['actorId'], 'Actor does not own the current sequence step.', '2.3'));
  if (!phaseAllowsMovement(state)) violations.push(violation('INVALID_MOVEMENT_PHASE', ['sequence'], 'Ground movement requires a Movement Segment.', '6.1'));
  if (path.length < 2) violations.push(violation('EMPTY_MOVEMENT_PATH', ['path'], 'Movement path needs origin and destination.', '6.1'));

  const steps: MovementStepCost[] = [];
  if (piece) {
    for (let index = 1; index < path.length; index += 1) {
      const cost = stepCost(state, path[index - 1]!, path[index]!);
      if (!cost) {
        violations.push(violation('NON_ADJACENT_PATH_STEP', ['path', index], 'Path step is absent or non-adjacent.', '6.1'));
        continue;
      }
      steps.push(cost);
      const enemies = state.pieceState.pieces.filter((candidate) => candidate.ownerId !== actorId
        && candidate.location.kind === 'ON_MAP' && candidate.location.hexId === cost.toHexId);
      if (enemies.length > 0) violations.push(violation('ENEMY_OCCUPIED_HEX', ['path', index], 'Normal movement cannot enter an enemy-occupied Hex; declare Overrun.', '6.3'));
      if (!queryStacking(state, cost.toHexId, pieceId).allowed) violations.push(violation('STACKING_LIMIT_EXCEEDED', ['path', index], 'Movement would exceed stacking.', '4.8'));
      const zoc = queryZoc(state, actorId, cost.toHexId, 'MOVEMENT');
      if (piece.mode === 'STRAT' && !zoc.allowed) violations.push(violation('STRAT_ENTERING_ZOC', ['path', index], 'Strat Mode cannot enter enemy ZOC.', '5.8a'));
      if (!zoc.allowed && index < path.length - 1) violations.push(violation('MOVEMENT_CONTINUES_AFTER_ZOC', ['path', index], 'Movement must stop upon entering enemy ZOC.', '4.5'));
    }
  }
  const totalTicks = steps.reduce((total, step) => total + step.totalTicks, 0);
  const allowanceTicks = piece ? movementAllowanceTicks(state, pieceId) : 0;
  const alreadySpent = usageFor(state, pieceId)?.movementSpentTicks ?? 0;
  const normalBudget = totalTicks + alreadySpent <= allowanceTicks;
  const minimumMoveUsed = !normalBudget && path.length === 2 && alreadySpent === 0
    && state.configuration.minimumMoveTicks > 0;
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

export const queryReachableHexes = (
  state: GameState,
  actorId: PlayerId,
  pieceId: PieceId,
): RuleQueryResult<readonly ReachableHex[]> => {
  const piece = createPieceStateIndex(state.pieceState).get(pieceId);
  if (!piece || piece.location.kind !== 'ON_MAP') {
    return { allowed: false, value: [], reasons: [{ code: 'PIECE_NOT_ON_MAP', allowed: false, message: 'Piece is not on-map.', rule: '6.1' }], facts: [], dependencies: [] };
  }
  const originHexId = piece.location.hexId;
  const best = new Map<HexId, ReachableHex>();
  const queue: ReachableHex[] = [{ hexId: originHexId, costTicks: 0, path: [originHexId] }];
  while (queue.length > 0) {
    queue.sort((left, right) => left.costTicks - right.costTicks || String(left.hexId).localeCompare(String(right.hexId)));
    const current = queue.shift()!;
    if (best.has(current.hexId)) continue;
    best.set(current.hexId, current);
    const coordinate = parseHexCoordinateId(current.hexId);
    if (!coordinate.ok) continue;
    for (const direction of HEX_DIRECTIONS) {
      const nextId = formatHexId(neighbor(coordinate.value, direction));
      if (best.has(nextId)) continue;
      const path = [...current.path, nextId];
      const result = queryMovementPath(state, actorId, pieceId, path);
      if (result.allowed && result.value) queue.push({ hexId: nextId, costTicks: result.value.totalTicks, path });
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
