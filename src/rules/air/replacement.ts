import { stableSort, type HexId, type PieceId, type PlayerId } from '../../core/index.js';
import { upsertPieceState, type PieceState } from '../../domain/piece/index.js';
import { nextStackOrder } from '../combat/combat.js';
import type { GameAction, GameState, RuleEvent, RuleViolation } from '../kernel/model.js';
import { definitionOf, faceMode, friendlyCombatUnitsAt, hexDistanceBetween, hexOf, isHq, nextOrderAt, pieceById } from '../pieces.js';
import { violation } from '../validation/violation.js';
import { inEnemyZoc } from '../zoc/zoc.js';
import { activeAircraftAt, activeAircraftLimit, aircraftName, friendlyAirBaseAt, friendlyAirBases, isAircraft, withAircraftActive } from './aircraft.js';

/**
 * Equipment replacements (13.5) and the aircraft they rebuild (13.5f). Eq arrive in the Reinforcement Phase as counters
 * placed at an entry hex; spent at an HQ, each Eq rebuilds two aircraft steps at any friendly Air Base, arriving Active.
 * The per-turn allotment is the generator's own table (it replaces a game's Variable Replacement Table); see
 * docs/reports/M11-air-power.md.
 */

type Transition = { readonly state: GameState; readonly events: readonly RuleEvent[] };
type RebuildAction = Extract<GameAction, { readonly kind: 'REBUILD_AIRCRAFT' }>;

export const REPLACEMENT_CAPABILITY = 'REPLACEMENT';

/** 13.5a: Eq must be at or within 2 hexes of a friendly HQ. */
export const REBUILD_HQ_RADIUS = 2;
/** 13.5f: each Eq rebuilds two aircraft steps. */
export const STEPS_PER_EQ = 2;

const capabilityParameter = (state: GameState, piece: PieceState, key: string) =>
  definitionOf(state, piece)?.capabilities.find(({ id }) => id === REPLACEMENT_CAPABILITY)?.parameters.find((parameter) => parameter.key === key);

export const isReplacement = (state: GameState, piece: PieceState): boolean => definitionOf(state, piece)?.family === 'REPLACEMENT';

export const isEquipment = (state: GameState, piece: PieceState): boolean => {
  const kind = capabilityParameter(state, piece, 'kind');
  return isReplacement(state, piece) && kind?.kind === 'TEXT' && kind.value === 'EQ';
};

/** Eq in one counter. */
export const equipmentIn = (piece: PieceState): number => piece.resourceQuantity ?? 0;

/** 13.5: Eq a side receives each Reinforcement Phase, from its Definition. */
export const equipmentPerTurn = (state: GameState, playerId: PlayerId): { readonly definitionId: PieceState['definitionId']; readonly perTurn: number } | null => {
  const side = state.scenario.players.find(({ id }) => id === playerId)?.sideDefinitionId ?? null;
  for (const definition of state.scenario.pieceCatalog.definitions) {
    if (definition.family !== 'REPLACEMENT' || definition.ownership.sideDefinitionId !== side) continue;
    const capability = definition.capabilities.find(({ id }) => id === REPLACEMENT_CAPABILITY);
    const kind = capability?.parameters.find(({ key }) => key === 'kind');
    const perTurn = capability?.parameters.find(({ key }) => key === 'perTurn');
    if (kind?.kind === 'TEXT' && kind.value === 'EQ' && perTurn?.kind === 'INTEGER' && perTurn.value > 0) return { definitionId: definition.id, perTurn: perTurn.value };
  }
  return null;
};

/** 2.3, 13.5: the new Eq wait in the player's reinforcement Box and must be placed at an entry hex. */
export const arriveReplacements = (state: GameState, playerId: PlayerId, events: RuleEvent[]): GameState => {
  const allotment = equipmentPerTurn(state, playerId);
  const boxId = state.configuration.reinforcementBoxes.find((candidate) => candidate.playerId === playerId)?.boxId;
  if (!allotment || !boxId) return state;
  const definition = state.scenario.pieceCatalog.definitions.find(({ id }) => id === allotment.definitionId)!;
  const pieceId = `repl-arrival:${playerId}:${state.sequence.gameTurn}` as PieceId;
  events.push({ kind: 'REPLACEMENTS_ARRIVED', sequence: events.length, playerId, pieceId, equipment: allotment.perTurn });
  return {
    ...state,
    pieceState: upsertPieceState(state.pieceState, {
      id: pieceId, definitionId: definition.id, ownerId: playerId, location: { kind: 'OFF_MAP_BOX', boxId },
      currentFaceId: null, remainingSteps: null, mode: null, statuses: [], resourceQuantity: allotment.perTurn,
      stackOrder: nextOrderAt(state.pieceState.pieces, { kind: 'OFF_MAP_BOX', boxId }, pieceId),
    }),
  };
};

/** Eq placed in a hex join the Eq already there: one counter per owner and hex. */
export const mergeReplacementsAt = (state: GameState, hexId: HexId, ownerId: PlayerId): GameState => {
  const here = stableSort(state.pieceState.pieces.filter((piece) => piece.ownerId === ownerId && hexOf(piece) === hexId && isEquipment(state, piece)),
    (left, right) => equipmentIn(right) - equipmentIn(left) || String(left.id).localeCompare(String(right.id)));
  const [keeper, ...others] = here;
  if (!keeper || others.length === 0) return state;
  let pieceState = state.pieceState;
  for (const other of others) pieceState = upsertPieceState(pieceState, { ...other, resourceQuantity: 0, location: { kind: 'ELIMINATED' } });
  return { ...state, pieceState: upsertPieceState(pieceState, { ...keeper, resourceQuantity: here.reduce((total, piece) => total + equipmentIn(piece), 0) }) };
};

// ─── 13.5f Air rebuilds ─────────────────────────────────────────────────────────────────────────

/** 13.5a: an HQ in Combat Mode, or in DG Mode oriented toward Combat Mode (5.10e). */
export const hqCanRebuild = (state: GameState, piece: PieceState): boolean =>
  piece.location.kind === 'ON_MAP' && isHq(state, piece) && (piece.mode === 'COMBAT' || (piece.mode === 'DG' && faceMode(piece) === 'COMBAT'));

/** Steps an aircraft needs to be whole again: a Dead Pile aircraft needs both, a reduced one on the map needs one. */
export const stepsToRebuild = (piece: PieceState): number => piece.location.kind === 'ELIMINATED' ? 2 : piece.remainingSteps === 1 ? 1 : 0;

/** Eq the steps cost: Eq are never partly used (13.5f, 13.5d). */
export const equipmentFor = (steps: number): number => Math.ceil(steps / STEPS_PER_EQ);

export const aircraftInDeadPile = (state: GameState, playerId: PlayerId): readonly PieceState[] =>
  state.pieceState.pieces.filter((piece) => piece.ownerId === playerId && piece.location.kind === 'ELIMINATED' && isAircraft(state, piece))
    .sort((left, right) => String(left.id).localeCompare(String(right.id)));

/** 4.5a: the hex of the Eq may not be in an enemy ZOC (a friendly combat unit negates it, 4.5b). */
const zocBlocked = (state: GameState, playerId: PlayerId, hexId: HexId): boolean =>
  inEnemyZoc(state, playerId, hexId) && friendlyCombatUnitsAt(state, playerId, hexId).length === 0;

export const validateRebuildAircraft = (state: GameState, action: RebuildAction): readonly RuleViolation[] => {
  const issues: RuleViolation[] = [];
  if (state.sequence.phase !== 'REINFORCEMENT' || action.actorId !== state.sequence.actingPlayerId) {
    issues.push(violation('INVALID_REBUILD_PHASE', ['sequence'], 'Replacements rebuild in your Reinforcement Phase.', '13.5a'));
  }
  const eq = pieceById(state, action.eqPieceId);
  if (!eq || eq.ownerId !== action.actorId || eq.location.kind !== 'ON_MAP' || !isEquipment(state, eq)) {
    return [...issues, violation('EQUIPMENT_NOT_ON_MAP', ['eqPieceId'], 'Rebuild with Eq counters of yours that are on the map.', '13.5a')];
  }
  const eqHex = hexOf(eq)!;
  const hq = pieceById(state, action.hqId);
  if (!hq || hq.ownerId !== action.actorId || !hqCanRebuild(state, hq)) {
    issues.push(violation('NO_REBUILD_HQ', ['hqId'], 'The Eq are expended at an HQ in Combat Mode (or DG oriented to Combat Mode).', '13.5a'));
  } else if (hexDistanceBetween(hexOf(hq)!, eqHex) > REBUILD_HQ_RADIUS) {
    issues.push(violation('EQUIPMENT_FAR_FROM_HQ', ['eqPieceId'], 'The Eq must be at or within 2 hexes of the HQ.', '13.5a'));
  }
  if (zocBlocked(state, action.actorId, eqHex)) issues.push(violation('EQUIPMENT_IN_ENEMY_ZOC', ['eqPieceId'], 'The Eq may not be in an enemy ZOC.', '13.5a'));
  if (action.aircraftIds.length === 0 || new Set(action.aircraftIds).size !== action.aircraftIds.length) {
    return [...issues, violation('INVALID_REBUILD_AIRCRAFT', ['aircraftIds'], 'Choose one or more distinct aircraft to rebuild.', '13.5f')];
  }
  let steps = 0;
  let arriving = 0;
  for (const [index, id] of action.aircraftIds.entries()) {
    const plane = pieceById(state, id);
    if (!plane || plane.ownerId !== action.actorId || !isAircraft(state, plane) || stepsToRebuild(plane) === 0) {
      issues.push(violation('AIRCRAFT_NOT_REBUILDABLE', ['aircraftIds', index], 'Rebuild aircraft from the Dead Pile or reduced aircraft stacked with the Eq.', '13.5f'));
      continue;
    }
    if (plane.location.kind === 'ON_MAP' && hexOf(plane) !== eqHex) {
      issues.push(violation('REDUCED_AIRCRAFT_NOT_WITH_EQUIPMENT', ['aircraftIds', index], 'A reduced aircraft on the map must be stacked with the Eq that rebuild it.', '13.5a'));
    }
    steps += stepsToRebuild(plane);
    if (plane.location.kind === 'ELIMINATED') arriving += 1;
  }
  const needed = equipmentFor(steps);
  if (needed > equipmentIn(eq)) issues.push(violation('NOT_ENOUGH_EQUIPMENT', ['eqPieceId'], `Rebuilding ${steps} step${steps === 1 ? '' : 's'} takes ${needed} Eq (each rebuilds two steps); this counter holds ${equipmentIn(eq)}.`, '13.5f'));
  if (arriving > 0) {
    const base = action.baseId ? pieceById(state, action.baseId) : undefined;
    if (!base || base.ownerId !== action.actorId || base.location.kind !== 'ON_MAP' || !friendlyAirBaseAt(state, action.actorId, hexOf(base)!)) {
      issues.push(violation('REBUILD_NEEDS_AIR_BASE', ['baseId'], 'Aircraft from the Dead Pile arrive at a friendly Air Base.', '13.5f'));
    } else if (activeAircraftAt(state, action.actorId, hexOf(base)!).length + arriving > activeAircraftLimit(state, base)) {
      issues.push(violation('BASE_ACTIVE_LIMIT', ['baseId'], `This base can hold ${activeAircraftLimit(state, base)} Active aircraft.`, '14.2a'));
    }
  }
  return issues;
};

export const applyRebuildAircraft = (state: GameState, action: RebuildAction): Transition => {
  const eq = pieceById(state, action.eqPieceId)!;
  const events: RuleEvent[] = [];
  let pieceState = state.pieceState;
  let steps = 0;
  const baseHex = action.baseId ? hexOf(pieceById(state, action.baseId)!) : null;
  for (const id of action.aircraftIds) {
    const plane = pieceById({ ...state, pieceState }, id)!;
    steps += stepsToRebuild(plane);
    if (plane.location.kind === 'ELIMINATED' && baseHex) {
      pieceState = upsertPieceState(pieceState, withAircraftActive({
        ...plane, remainingSteps: 2, location: { kind: 'ON_MAP', hexId: baseHex },
        stackOrder: nextStackOrder(pieceState.pieces, baseHex, plane.id),
      }, true));
    } else {
      pieceState = upsertPieceState(pieceState, { ...plane, remainingSteps: 2 });
    }
    events.push({ kind: 'AIRCRAFT_REBUILT', sequence: events.length, pieceId: id, hexId: plane.location.kind === 'ELIMINATED' ? baseHex : hexOf(plane) });
  }
  const spent = equipmentFor(steps);
  const left = equipmentIn(eq) - spent;
  pieceState = upsertPieceState(pieceState, left > 0 ? { ...eq, resourceQuantity: left } : { ...eq, resourceQuantity: 0, location: { kind: 'ELIMINATED' } });
  return { state: { ...state, pieceState }, events };
};

/** Rebuilds the player could make now, for candidate generation and the UI. */
export const rebuildOptions = (state: GameState, playerId: PlayerId): readonly {
  readonly eq: PieceState;
  readonly hq: PieceState;
  readonly aircraftIds: readonly PieceId[];
  readonly baseIds: readonly PieceId[];
}[] => {
  if (state.sequence.phase !== 'REINFORCEMENT') return [];
  const options: { eq: PieceState; hq: PieceState; aircraftIds: PieceId[]; baseIds: PieceId[] }[] = [];
  const hqs = state.pieceState.pieces.filter((piece) => piece.ownerId === playerId && hqCanRebuild(state, piece));
  const dead = aircraftInDeadPile(state, playerId);
  for (const eq of state.pieceState.pieces.filter((piece) => piece.ownerId === playerId && piece.location.kind === 'ON_MAP' && isEquipment(state, piece) && equipmentIn(piece) > 0)) {
    const hex = hexOf(eq)!;
    if (zocBlocked(state, playerId, hex)) continue;
    const hq = hqs.find((candidate) => hexDistanceBetween(hexOf(candidate)!, hex) <= REBUILD_HQ_RADIUS);
    if (!hq) continue;
    const reduced = state.pieceState.pieces.filter((piece) => piece.ownerId === playerId && piece.location.kind === 'ON_MAP' && hexOf(piece) === hex && isAircraft(state, piece) && piece.remainingSteps === 1);
    const aircraftIds = [...reduced, ...dead].map(({ id }) => id);
    if (aircraftIds.length === 0) continue;
    const baseIds = friendlyAirBases(state, playerId).filter((base) => activeAircraftAt(state, playerId, hexOf(base)!).length < activeAircraftLimit(state, base)).map(({ id }) => id);
    options.push({ eq, hq, aircraftIds, baseIds });
  }
  return options;
};

/** Which aircraft one Eq counter should rebuild by default: as many as its Eq pay for, reduced ones first. */
export const defaultRebuild = (state: GameState, option: ReturnType<typeof rebuildOptions>[number]): readonly PieceId[] => {
  const chosen: PieceId[] = [];
  let steps = 0;
  const capacity = equipmentIn(option.eq) * STEPS_PER_EQ;
  for (const id of option.aircraftIds) {
    const cost = stepsToRebuild(pieceById(state, id)!);
    if (steps + cost > capacity) continue;
    chosen.push(id);
    steps += cost;
  }
  return chosen;
};

/** Aircraft name for messages. */
export const rebuildLabel = (state: GameState, pieceId: PieceId): string => aircraftName(state, pieceById(state, pieceId));
