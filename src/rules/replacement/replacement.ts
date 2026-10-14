import { stableSort, type DefinitionId, type HexId, type PieceId, type PlayerId } from '../../core/index.js';
import { isGroundUnitDefinition, upsertPieceState, type OcsMode, type PieceState } from '../../domain/piece/index.js';
import { nextStackOrder } from '../combat/combat.js';
import type { GameAction, GameState, RuleEvent, RuleViolation, UnitRebuild } from '../kernel/model.js';
import { rollTwoDice } from '../kernel/rng.js';
import { lostTruckPoints } from './ledger.js';
import { applyModeChange } from '../mode/mode.js';
import {
  INTERNAL_STOCKS_STATUS, OUT_OF_SUPPLY_STATUS, OUT_OF_TRACE_SINCE_STATUS, PRIOR_MODE_STATUS, RETURN_TURN_STATUS, TRANSPORT_POINTS_STATUS,
  definitionOf, enemyCombatUnitsAt, faceMode, friendlyCombatUnitsAt, hexDistanceBetween, hexOf, isHq, isTransportPoint, nextOrderAt, pieceById, printedSteps,
} from '../pieces.js';
import { violation } from '../validation/violation.js';
import { inEnemyZoc } from '../zoc/zoc.js';

/**
 * Replacement units (13.5): Personnel (Pax) and Equipment (Eq). Each Reinforcement Phase a side rolls its Variable
 * Replacement Table; the Repls arrive as counters placed at an entry hex or beside a friendly HQ, and are spent in Move
 * Mode to rebuild ground units by the side's Rebuild Table (13.5a-e) or, Eq only, aircraft (13.5f,
 * rules/air/replacement.ts). Games saved before the tables existed keep the fixed allotment and the generic per-counter
 * Rebuild Table they were played with: see docs/reports/replacement-tables-2026-10-14.md.
 */

type Transition = { readonly state: GameState; readonly events: readonly RuleEvent[] };
type RebuildUnitsAction = Extract<GameAction, { readonly kind: 'REBUILD_UNITS' }>;
export type ReplacementKind = 'PAX' | 'EQ';

export const REPLACEMENT_CAPABILITY = 'REPLACEMENT';
/** 13.5a: Repls must be at or within 2 hexes of a friendly HQ. */
export const REBUILD_HQ_RADIUS = 2;

const capabilityParameter = (state: GameState, piece: PieceState, key: string) =>
  definitionOf(state, piece)?.capabilities.find(({ id }) => id === REPLACEMENT_CAPABILITY)?.parameters.find((parameter) => parameter.key === key);

export const isReplacement = (state: GameState, piece: PieceState): boolean => definitionOf(state, piece)?.family === 'REPLACEMENT';

export const replacementKindOf = (state: GameState, piece: PieceState): ReplacementKind | null => {
  const kind = capabilityParameter(state, piece, 'kind');
  return isReplacement(state, piece) && kind?.kind === 'TEXT' && (kind.value === 'PAX' || kind.value === 'EQ') ? kind.value : null;
};

export const isEquipment = (state: GameState, piece: PieceState): boolean => replacementKindOf(state, piece) === 'EQ';

/** Repls in one counter. */
export const replacementsIn = (piece: PieceState): number => piece.resourceQuantity ?? 0;

/** 13.5: the Pax and Eq a side receives each Reinforcement Phase, from its Definitions (Pax first). */
export const replacementsPerTurn = (state: GameState, playerId: PlayerId): readonly { readonly definitionId: DefinitionId; readonly kind: ReplacementKind; readonly perTurn: number }[] => {
  const side = state.scenario.players.find(({ id }) => id === playerId)?.sideDefinitionId ?? null;
  const allotments: { definitionId: DefinitionId; kind: ReplacementKind; perTurn: number }[] = [];
  for (const definition of state.scenario.pieceCatalog.definitions) {
    if (definition.family !== 'REPLACEMENT' || definition.ownership.sideDefinitionId !== side) continue;
    const capability = definition.capabilities.find(({ id }) => id === REPLACEMENT_CAPABILITY);
    const kind = capability?.parameters.find(({ key }) => key === 'kind');
    const perTurn = capability?.parameters.find(({ key }) => key === 'perTurn');
    if (kind?.kind === 'TEXT' && (kind.value === 'PAX' || kind.value === 'EQ')) {
      allotments.push({ definitionId: definition.id, kind: kind.value, perTurn: perTurn?.kind === 'INTEGER' ? perTurn.value : 0 });
    }
  }
  return stableSort(allotments, (left, right) => (left.kind === 'PAX' ? 0 : 1) - (right.kind === 'PAX' ? 0 : 1));
};

/** The player's Variable Replacement Table (13.5), or null in a game saved before the tables existed. */
export const replacementTableOf = (state: GameState, playerId: PlayerId) =>
  state.configuration.replacementArrivals?.players.find((entry) => entry.playerId === playerId)?.rows ?? null;

/**
 * 2.3, 13.5: the player rolls his Variable Replacement Table (without one, he receives the fixed allotment). Each Repl is
 * an independent one-step unit waiting in the reinforcement Box; a historical face-less Definition gets one counter
 * holding the count.
 */
export const arriveReplacements = (state: GameState, playerId: PlayerId, events: RuleEvent[]): GameState => {
  const boxId = state.configuration.reinforcementBoxes.find((candidate) => candidate.playerId === playerId)?.boxId;
  const allotments = replacementsPerTurn(state, playerId);
  if (!boxId || allotments.length === 0) return state;
  let next = state;
  const counts: Record<ReplacementKind, number> = { PAX: 0, EQ: 0 };
  const table = replacementTableOf(state, playerId);
  if (table) {
    const roll = rollTwoDice(state.rng);
    const row = table.find(({ minimum, maximum }) => roll.roll.total >= minimum && roll.roll.total <= maximum);
    counts.PAX = row?.pax ?? 0;
    counts.EQ = row?.eq ?? 0;
    next = { ...next, rng: roll.rng };
    events.push({ kind: 'REPLACEMENT_TABLE_ROLLED', sequence: events.length, playerId, roll: roll.roll.total, pax: counts.PAX, eq: counts.EQ });
  } else {
    for (const { kind, perTurn } of allotments) counts[kind] += perTurn;
  }
  for (const allotment of allotments) {
    const quantity = counts[allotment.kind];
    counts[allotment.kind] = 0;
    if (quantity <= 0) continue;
    const definition = state.scenario.pieceCatalog.definitions.find(({ id }) => id === allotment.definitionId)!;
    const ground = isGroundUnitDefinition(definition);
    for (let index = 0; index < (ground ? quantity : 1); index += 1) {
      // Eq keep the id they had before Pax existed, so older replays name the same counter.
      const pieceId = `repl-arrival:${playerId}:${state.sequence.gameTurn}${allotment.kind === 'PAX' ? ':pax' : ''}${index > 0 ? `:${index + 1}` : ''}` as PieceId;
      events.push({ kind: 'REPLACEMENTS_ARRIVED', sequence: events.length, playerId, pieceId, replacement: allotment.kind, quantity: ground ? 1 : quantity });
      next = {
        ...next,
        pieceState: upsertPieceState(next.pieceState, {
          id: pieceId, definitionId: allotment.definitionId, ownerId: playerId, location: { kind: 'OFF_MAP_BOX', boxId },
          currentFaceId: ground ? definition.faces[0]!.id : null, remainingSteps: ground ? 1 : null,
          mode: ground ? 'MOVE' : null, statuses: [], resourceQuantity: ground ? 1 : quantity,
          stackOrder: nextOrderAt(next.pieceState.pieces, { kind: 'OFF_MAP_BOX', boxId }, pieceId),
        }),
      };
    }
  }
  return next;
};

/** Merge only historical face-less replacement counters when replaying older scenarios. */
export const mergeReplacementsAt = (state: GameState, hexId: HexId, ownerId: PlayerId): GameState => {
  let next = state;
  for (const kind of ['PAX', 'EQ'] as const) {
    // Legacy face-less counters retain their original replay behavior; combat replacements stay independent.
    const here = stableSort(next.pieceState.pieces.filter((piece) => piece.ownerId === ownerId && hexOf(piece) === hexId && replacementKindOf(next, piece) === kind && !isGroundUnitDefinition(definitionOf(next, piece))),
      (left, right) => replacementsIn(right) - replacementsIn(left) || String(left.id).localeCompare(String(right.id)));
    const [keeper, ...others] = here;
    if (!keeper || others.length === 0) continue;
    let pieceState = next.pieceState;
    for (const other of others) pieceState = upsertPieceState(pieceState, { ...other, resourceQuantity: 0, location: { kind: 'ELIMINATED' } });
    next = { ...next, pieceState: upsertPieceState(pieceState, { ...keeper, resourceQuantity: here.reduce((total, piece) => total + replacementsIn(piece), 0) }) };
  }
  return next;
};

/** The owner's Repl counter of `kind` in a hex, if any. */
export const replacementAt = (state: GameState, ownerId: PlayerId, hexId: HexId, kind: ReplacementKind): PieceState | undefined =>
  state.pieceState.pieces.find((piece) => piece.ownerId === ownerId && piece.location.kind === 'ON_MAP' && hexOf(piece) === hexId
    && replacementKindOf(state, piece) === kind && replacementsIn(piece) > 0 && (piece.mode === 'MOVE' || piece.mode === null));

/** How many Repls of `kind` the owner has in a hex. */
export const replacementsAt = (state: GameState, ownerId: PlayerId, hexId: HexId, kind: ReplacementKind): number => {
  return state.pieceState.pieces.filter((piece) => piece.ownerId === ownerId && hexOf(piece) === hexId
    && replacementKindOf(state, piece) === kind && (piece.mode === 'MOVE' || piece.mode === null))
    .reduce((total, piece) => total + replacementsIn(piece), 0);
};

/** Spend separate Move Mode replacement units deterministically, without merging their modes or movement usage. */
export const spendReplacementsAt = (state: GameState, ownerId: PlayerId, hexId: HexId, kind: ReplacementKind, count: number): GameState['pieceState'] => {
  let pieceState = state.pieceState;
  let left = count;
  for (const counter of stableSort(state.pieceState.pieces.filter((piece) => piece.ownerId === ownerId && hexOf(piece) === hexId
    && replacementKindOf(state, piece) === kind && (piece.mode === 'MOVE' || piece.mode === null)), (a, b) => String(a.id).localeCompare(String(b.id)))) {
    const used = Math.min(left, replacementsIn(counter));
    pieceState = spendReplacements(pieceState, counter, used);
    left -= used;
    if (left === 0) break;
  }
  return pieceState;
};

/** Spend `count` Repls from a counter; an emptied counter leaves the map. */
export const spendReplacements = (pieceState: GameState['pieceState'], counter: PieceState, count: number): GameState['pieceState'] => {
  if (count <= 0) return pieceState;
  const left = replacementsIn(counter) - count;
  return upsertPieceState(pieceState, left > 0 ? { ...counter, resourceQuantity: left } : { ...counter, resourceQuantity: 0, location: { kind: 'ELIMINATED' } });
};

/** 13.5a: an HQ in Combat Mode, or in DG Mode oriented toward Combat Mode (5.10e). */
export const hqCanRebuild = (state: GameState, piece: PieceState): boolean =>
  piece.location.kind === 'ON_MAP' && isHq(state, piece) && (piece.mode === 'COMBAT' || (piece.mode === 'DG' && faceMode(piece) === 'COMBAT'));

/** 4.5a K: Repl rebuilds cannot occur in enemy ZOC; retain the original calculation for historical face-less saves. */
export const replacementHexInEnemyZoc = (state: GameState, playerId: PlayerId, hexId: HexId): boolean => {
  const modern = state.scenario.pieceCatalog.definitions.some((definition) => definition.family === 'REPLACEMENT' && isGroundUnitDefinition(definition));
  return inEnemyZoc(state, playerId, hexId) && (modern || friendlyCombatUnitsAt(state, playerId, hexId).length === 0);
};

/** Guard imported/legacy positions too: nothing can be rebuilt into an enemy-occupied hex. */
const enemyHoldsReplacementHex = (state: GameState, playerId: PlayerId, hexId: HexId): boolean =>
  enemyCombatUnitsAt(state, playerId, hexId).length > 0;

/** An HQ of the player that can rebuild with Repls in `hexId` (13.5a), nearest first. */
export const rebuildHqsFor = (state: GameState, playerId: PlayerId, hexId: HexId): readonly PieceState[] =>
  stableSort(state.pieceState.pieces.filter((piece) => piece.ownerId === playerId && hqCanRebuild(state, piece) && hexDistanceBetween(hexOf(piece)!, hexId) <= REBUILD_HQ_RADIUS),
    (left, right) => hexDistanceBetween(hexOf(left)!, hexId) - hexDistanceBetween(hexOf(right)!, hexId) || String(left.id).localeCompare(String(right.id)));

// ─── 13.5a-d Ground rebuilds ────────────────────────────────────────────────────────────────────

/** A unit's row of its owner's Rebuild Table: the Pax and Eq each step costs, or each pair of units on a `pairs` row (13.5d). */
export interface RebuildPrice {
  readonly row: string;
  readonly label: string;
  readonly pax: number;
  readonly eq: number;
  readonly pairs: boolean;
}

/** The rule of games saved before Rebuild Tables existed: each Armor, Mech or artillery step 1 Eq, any other step 1 Pax. */
const LEGACY_EQ_PRICE: RebuildPrice = { row: 'eq', label: 'Armor, Mech and artillery units', pax: 0, eq: 1, pairs: false };
const LEGACY_PAX_PRICE: RebuildPrice = { row: 'pax', label: 'Other units', pax: 1, eq: 0, pairs: false };

/**
 * 13.5a: what rebuilding the unit costs by its owner's Rebuild Table, or null when it can never be rebuilt as a unit: the
 * no-rebuild dot (13.5c), generics such as Breakdowns (13.5b), Transport Points (13.5e, rebuilt separately) and any
 * unit the table does not list.
 */
export const rebuildPriceOf = (state: GameState, piece: PieceState): RebuildPrice | null => {
  const definition = definitionOf(state, piece);
  const counter = definition?.counter;
  if (definition?.family !== 'GROUND' || !counter || !counter.rebuildable || piece.remainingSteps === null || isTransportPoint(state, piece)) return null;
  const tables = state.configuration.rebuildTables;
  if (tables) {
    const row = tables.players.find(({ playerId }) => playerId === piece.ownerId)?.rows.find(({ definitionIds }) => definitionIds.includes(piece.definitionId));
    return row ? { row: row.id, label: row.label, pax: row.pax, eq: row.eq, pairs: row.pairs } : null;
  }
  return counter.combatCategory === 'ARMOR' || counter.combatCategory === 'MECH' || counter.kind === 'ARTILLERY' ? LEGACY_EQ_PRICE : LEGACY_PAX_PRICE;
};

/** The player's Rebuild Table rows (13.5a), for display; empty in a game saved before the tables existed. */
export const rebuildTableOf = (state: GameState, playerId: PlayerId) =>
  state.configuration.rebuildTables?.players.find((entry) => entry.playerId === playerId)?.rows ?? [];

/**
 * Pax and Eq that rebuilding these steps costs, from their prices: each step at its row's price; units of a `pairs` row
 * two for the row's price, an odd one paying it in full (13.5d); one Eq per truck point (13.5e). Pure, so the UI prices a
 * selection from the projected prices exactly as the rules do.
 */
export const priceRebuild = (entries: readonly { readonly price: RebuildPrice; readonly steps: number }[], truckPoints: number): Readonly<Record<ReplacementKind, number>> => {
  const cost = { PAX: 0, EQ: truckPoints };
  const paired = new Map<string, { price: RebuildPrice; units: number }>();
  for (const { price, steps } of entries) {
    if (price.pairs) {
      paired.set(price.row, { price, units: (paired.get(price.row)?.units ?? 0) + steps });
      continue;
    }
    cost.PAX += price.pax * steps;
    cost.EQ += price.eq * steps;
  }
  for (const { price, units } of paired.values()) {
    cost.PAX += price.pax * Math.ceil(units / 2);
    cost.EQ += price.eq * Math.ceil(units / 2);
  }
  return cost;
};

/**
 * Steps to rebuild by default from `entries` (reduced units first, then the Dead Pile), as many as `held` pays for, filling
 * a paid-for pair (13.5d) before opening another. Pure, shared by the rules' candidate action and the UI's default choice.
 */
export const allocateRebuild = <T extends { readonly price: RebuildPrice; readonly missing: number }>(entries: readonly T[], held: Readonly<Record<ReplacementKind, number>>)
  : { readonly chosen: readonly { readonly entry: T; readonly steps: number }[]; readonly left: Readonly<Record<ReplacementKind, number>> } => {
  const left = { ...held };
  const openPair = new Set<string>();
  const chosen: { entry: T; steps: number }[] = [];
  for (const entry of entries) {
    const { price, missing } = entry;
    if (price.pairs && openPair.has(price.row)) {
      openPair.delete(price.row);
      chosen.push({ entry, steps: 1 });
      continue;
    }
    let steps = Math.min(missing, price.pax > 0 ? Math.floor(left.PAX / price.pax) : missing, price.eq > 0 ? Math.floor(left.EQ / price.eq) : missing);
    if (price.pairs) steps = Math.min(steps, 1);
    if (steps <= 0) continue;
    left.PAX -= price.pax * steps;
    left.EQ -= price.eq * steps;
    if (price.pairs) openPair.add(price.row);
    chosen.push({ entry, steps });
  }
  return { chosen, left };
};

/** Steps a unit lacks: all of them in the Dead Pile, the lost ones on the map (13.5b). */
export const missingSteps = (state: GameState, piece: PieceState): number =>
  piece.location.kind === 'ELIMINATED' ? printedSteps(state, piece)
    : piece.location.kind === 'ON_MAP' ? Math.max(0, printedSteps(state, piece) - (piece.remainingSteps ?? 0)) : 0;

/** The player's units in the Dead Pile that the Rebuild Table can bring back. */
export const deadGroundUnits = (state: GameState, playerId: PlayerId): readonly PieceState[] =>
  state.pieceState.pieces.filter((piece) => piece.ownerId === playerId && piece.location.kind === 'ELIMINATED' && rebuildPriceOf(state, piece) !== null)
    .sort((left, right) => String(left.id).localeCompare(String(right.id)));

/** Reduced units of the player stacked in a hex (13.5a-2). */
export const reducedGroundUnitsAt = (state: GameState, playerId: PlayerId, hexId: HexId): readonly PieceState[] =>
  state.pieceState.pieces.filter((piece) => piece.ownerId === playerId && hexOf(piece) === hexId && piece.location.kind === 'ON_MAP'
    && rebuildPriceOf(state, piece) !== null && missingSteps(state, piece) > 0)
    .sort((left, right) => String(left.id).localeCompare(String(right.id)));

const VOLUNTARY_MODES: readonly OcsMode[] = ['COMBAT', 'MOVE', 'RESERVE', 'STRAT'];
const hasFace = (state: GameState, piece: PieceState, faceId: string): boolean => definitionOf(state, piece)?.faces.some(({ id }) => id === faceId) ?? false;

/** 13.5b: the voluntary modes a rebuilt Dead Pile unit may be placed in, in `hexId`. */
export const placementModes = (state: GameState, piece: PieceState, hexId: HexId): readonly OcsMode[] =>
  VOLUNTARY_MODES.filter((mode) => (mode !== 'COMBAT' || hasFace(state, piece, 'combat')) && (mode === 'COMBAT' || mode === 'RESERVE' || hasFace(state, piece, 'move'))
    // 5.7c, 5.8a: never Reserve or Strat in an enemy ZOC.
    && !((mode === 'RESERVE' || mode === 'STRAT') && inEnemyZoc(state, piece.ownerId, hexId)));

/** Statuses of a unit that do not survive the Dead Pile: supply, internal stocks, an involuntary mode, a Breakout return. */
const TRANSIENT_STATUSES = new Set<string>([OUT_OF_SUPPLY_STATUS, PRIOR_MODE_STATUS, INTERNAL_STOCKS_STATUS, OUT_OF_TRACE_SINCE_STATUS, RETURN_TURN_STATUS].map(String));

// ─── The rebuild action ─────────────────────────────────────────────────────────────────────────

/** Pax and Eq a rebuild costs by the Rebuild Table (see priceRebuild). */
export const rebuildCost = (state: GameState, units: readonly UnitRebuild[], truckPoints: number): Readonly<Record<ReplacementKind, number>> =>
  priceRebuild(units.flatMap(({ pieceId, steps }) => {
    const piece = pieceById(state, pieceId);
    const price = piece ? rebuildPriceOf(state, piece) : null;
    return price ? [{ price, steps }] : [];
  }), truckPoints);

export const validateRebuildUnits = (state: GameState, action: RebuildUnitsAction): readonly RuleViolation[] => {
  const issues: RuleViolation[] = [];
  if (state.sequence.phase !== 'REINFORCEMENT' || action.actorId !== state.sequence.actingPlayerId) {
    issues.push(violation('INVALID_REBUILD_PHASE', ['sequence'], 'Replacements rebuild in your Reinforcement Phase.', '13.5a'));
  }
  const pax = replacementAt(state, action.actorId, action.hexId, 'PAX');
  const eq = replacementAt(state, action.actorId, action.hexId, 'EQ');
  if (!pax && !eq) return [...issues, violation('NO_REPLACEMENTS_IN_HEX', ['hexId'], 'Rebuild with Pax or Eq of yours on the map, all in this hex.', '13.5a')];
  const hq = pieceById(state, action.hqId);
  if (!hq || hq.ownerId !== action.actorId || !hqCanRebuild(state, hq)) {
    issues.push(violation('NO_REBUILD_HQ', ['hqId'], 'Repls are spent at an HQ in Combat Mode (or DG oriented to Combat Mode).', '13.5a'));
  } else if (hexDistanceBetween(hexOf(hq)!, action.hexId) > REBUILD_HQ_RADIUS) {
    issues.push(violation('REPLACEMENTS_FAR_FROM_HQ', ['hexId'], 'The Repls must be at or within 2 hexes of the HQ.', '13.5a'));
  }
  if (replacementHexInEnemyZoc(state, action.actorId, action.hexId)) issues.push(violation('REPLACEMENTS_IN_ENEMY_ZOC', ['hexId'], 'The Repls may not be in an enemy ZOC.', '13.5a'));
  if (enemyHoldsReplacementHex(state, action.actorId, action.hexId)) issues.push(violation('REPLACEMENTS_WITH_ENEMY', ['hexId'], 'Enemy combat units hold the hex of these Repls; nothing can be rebuilt there.', '13.5a'));
  if (!Number.isSafeInteger(action.truckPoints) || action.truckPoints < 0) {
    return [...issues, violation('INVALID_TRUCK_REBUILD', ['truckPoints'], 'Truck points must be a whole number, zero or more.', '13.5e')];
  }
  if ((action.units.length === 0 && action.truckPoints === 0) || new Set(action.units.map(({ pieceId }) => pieceId)).size !== action.units.length) {
    return [...issues, violation('INVALID_REBUILD_UNITS', ['units'], 'Choose one or more distinct units, or trucks, to rebuild.', '13.5b')];
  }
  for (const [index, entry] of action.units.entries()) {
    const unit = pieceById(state, entry.pieceId);
    const price = unit ? rebuildPriceOf(state, unit) : null;
    if (!unit || unit.ownerId !== action.actorId || price === null || (unit.location.kind !== 'ELIMINATED' && unit.location.kind !== 'ON_MAP')) {
      issues.push(unit && unit.ownerId === action.actorId && definitionOf(state, unit)?.counter?.rebuildable === false
        ? violation('NO_REBUILD_UNIT', ['units', index, 'pieceId'], 'This unit cannot be rebuilt.', '13.5c')
        : violation('UNIT_NOT_REBUILDABLE', ['units', index, 'pieceId'], 'Rebuild ground units on your Rebuild Table from the Dead Pile, or reduced units stacked with the Repls.', '13.5a'));
      continue;
    }
    const missing = missingSteps(state, unit);
    if (!Number.isSafeInteger(entry.steps) || entry.steps < 1 || entry.steps > missing) {
      issues.push(violation('INVALID_REBUILD_STEPS', ['units', index, 'steps'], `This unit can regain from 1 to ${missing} step${missing === 1 ? '' : 's'}.`, '13.5b'));
    }
    if (unit.location.kind === 'ON_MAP') {
      if (hexOf(unit) !== action.hexId) issues.push(violation('REDUCED_UNIT_NOT_WITH_REPLACEMENTS', ['units', index, 'pieceId'], 'A reduced unit must be stacked with the Repls that rebuild it.', '13.5a'));
      if (entry.mode !== null) issues.push(violation('REBUILD_MODE_NOT_APPLICABLE', ['units', index, 'mode'], 'A unit rebuilt on the map keeps its mode.', '13.5b'));
    } else if (entry.mode === null || !placementModes(state, unit, action.hexId).includes(entry.mode)) {
      issues.push(violation('INVALID_REBUILD_MODE', ['units', index, 'mode'], 'Place a rebuilt unit in a voluntary mode its counter can show.', '13.5b'));
    }
  }
  if (action.truckPoints > lostTruckPoints(state, action.actorId)) {
    issues.push(violation('NO_TRUCKS_TO_REBUILD', ['truckPoints'], `Only trucks lost to enemy action can be rebuilt: ${lostTruckPoints(state, action.actorId)} point${lostTruckPoints(state, action.actorId) === 1 ? '' : 's'}.`, '13.5e'));
  }
  const cost = rebuildCost(state, action.units, action.truckPoints);
  const held = { PAX: replacementsAt(state, action.actorId, action.hexId, 'PAX'), EQ: replacementsAt(state, action.actorId, action.hexId, 'EQ') };
  if (cost.PAX > held.PAX) issues.push(violation('NOT_ENOUGH_PAX', ['units'], `This rebuild takes ${cost.PAX} Pax; the hex holds ${held.PAX}.`, '13.5a'));
  if (cost.EQ > held.EQ) issues.push(violation('NOT_ENOUGH_EQUIPMENT', ['units'], `This rebuild takes ${cost.EQ} Eq; the hex holds ${held.EQ}.`, '13.5a'));
  return issues;
};

export const applyRebuildUnits = (state: GameState, action: RebuildUnitsAction): Transition => {
  const events: RuleEvent[] = [];
  let pieceState = state.pieceState;
  for (const entry of action.units) {
    const unit = pieceById({ ...state, pieceState }, entry.pieceId)!;
    if (unit.location.kind === 'ELIMINATED') {
      // 13.5b: placed in the hex of the Repls, in a voluntary mode, without the markers it had when it died.
      const placed = applyModeChange({
        ...unit, mode: 'MOVE', remainingSteps: entry.steps,
        statuses: unit.statuses.filter(({ statusDefinitionId }) => !TRANSIENT_STATUSES.has(String(statusDefinitionId))),
        location: { kind: 'ON_MAP', hexId: action.hexId }, stackOrder: nextStackOrder(pieceState.pieces, action.hexId, unit.id),
      }, entry.mode!);
      pieceState = upsertPieceState(pieceState, placed);
      events.push({ kind: 'UNIT_REBUILT', sequence: events.length, pieceId: unit.id, hexId: action.hexId, steps: entry.steps, fromDeadPile: true });
    } else {
      pieceState = upsertPieceState(pieceState, { ...unit, remainingSteps: (unit.remainingSteps ?? 0) + entry.steps });
      events.push({ kind: 'UNIT_REBUILT', sequence: events.length, pieceId: unit.id, hexId: action.hexId, steps: entry.steps, fromDeadPile: false });
    }
  }
  let next: GameState = { ...state, pieceState };
  if (action.truckPoints > 0) next = rebuildTrucks(next, action, events);
  const cost = rebuildCost(state, action.units, action.truckPoints);
  pieceState = spendReplacementsAt(next, action.actorId, action.hexId, 'PAX', cost.PAX);
  pieceState = spendReplacementsAt({ ...next, pieceState }, action.actorId, action.hexId, 'EQ', cost.EQ);
  return { state: { ...next, pieceState }, events };
};

/** 13.5e: new truck counters, one per lost Definition drawn on, appear in the hex of the Eq in Move Mode. */
const rebuildTrucks = (state: GameState, action: RebuildUnitsAction, events: RuleEvent[]): GameState => {
  let next = state;
  let left = action.truckPoints;
  const created: PieceId[] = [];
  for (const record of state.replacements.lostTrucks.filter(({ ownerId }) => ownerId === action.actorId)) {
    if (left <= 0) break;
    const points = Math.min(left, record.points);
    left -= points;
    const definition = state.scenario.pieceCatalog.definitions.find(({ id }) => id === record.definitionId)!;
    const face = definition.faces.find(({ id }) => id === 'move') ?? definition.faces[0] ?? null;
    let index = 0;
    let pieceId = `rebuilt-truck:${action.actorId}:${state.revision}` as PieceId;
    while (next.pieceState.pieces.some(({ id }) => id === pieceId)) { index += 1; pieceId = `rebuilt-truck:${action.actorId}:${state.revision}.${index}` as PieceId; }
    const printed = definition.counter?.transportPoints ?? points;
    next = {
      ...next,
      pieceState: upsertPieceState(next.pieceState, {
        id: pieceId, definitionId: definition.id, ownerId: action.actorId, location: { kind: 'ON_MAP', hexId: action.hexId },
        currentFaceId: face?.id ?? null, remainingSteps: face && face.steps.length > 0 ? Math.max(...face.steps.map(({ remainingSteps }) => remainingSteps)) : null,
        mode: 'MOVE', statuses: points === printed ? [] : [{ statusDefinitionId: TRANSPORT_POINTS_STATUS, value: { kind: 'INTEGER', value: points } }],
        stackOrder: nextStackOrder(next.pieceState.pieces, action.hexId, pieceId), resourceQuantity: null,
      }),
      replacements: {
        ...next.replacements,
        lostTrucks: next.replacements.lostTrucks.flatMap((entry) => entry !== record ? [entry] : entry.points > points ? [{ ...entry, points: entry.points - points }] : []),
      },
    };
    created.push(pieceId);
  }
  events.push({ kind: 'TRUCKS_REBUILT', sequence: events.length, pieceIds: created, hexId: action.hexId, points: action.truckPoints });
  return next;
};

// ─── Options for candidates and the UI ─────────────────────────────────────────────────────────

export interface UnitRebuildOption {
  readonly hexId: HexId;
  readonly hq: PieceState;
  readonly pax: number;
  readonly eq: number;
  /** Units these Repls could rebuild: reduced units stacked with them, then the Dead Pile. */
  readonly units: readonly { readonly piece: PieceState; readonly price: RebuildPrice; readonly missing: number; readonly modes: readonly OcsMode[] }[];
  /** Truck points that could be rebuilt here (13.5e): lost to the enemy and paid for with Eq. */
  readonly truckPoints: number;
}

/** Rebuilds the player could make now, one entry per hex of Repls that is near an HQ and out of enemy ZOCs. */
export const unitRebuildOptions = (state: GameState, playerId: PlayerId): readonly UnitRebuildOption[] => {
  if (state.sequence.phase !== 'REINFORCEMENT') return [];
  const hexes = [...new Set(state.pieceState.pieces
    .filter((piece) => piece.ownerId === playerId && piece.location.kind === 'ON_MAP' && replacementKindOf(state, piece) !== null && replacementsIn(piece) > 0)
    .map((piece) => hexOf(piece)!))].sort();
  const dead = deadGroundUnits(state, playerId);
  const lost = lostTruckPoints(state, playerId);
  const options: UnitRebuildOption[] = [];
  for (const hexId of hexes) {
    if (replacementHexInEnemyZoc(state, playerId, hexId) || enemyHoldsReplacementHex(state, playerId, hexId)) continue;
    const hq = rebuildHqsFor(state, playerId, hexId)[0];
    if (!hq) continue;
    const pax = replacementsAt(state, playerId, hexId, 'PAX');
    const eq = replacementsAt(state, playerId, hexId, 'EQ');
    const units = [...reducedGroundUnitsAt(state, playerId, hexId), ...dead]
      .map((piece) => ({ piece, price: rebuildPriceOf(state, piece)!, missing: missingSteps(state, piece), modes: piece.location.kind === 'ELIMINATED' ? placementModes(state, piece, hexId) : [] }))
      .filter(({ price, modes, piece }) => price.pax <= pax && price.eq <= eq && (piece.location.kind === 'ON_MAP' || modes.length > 0));
    const truckPoints = Math.min(lost, eq);
    if (units.length === 0 && truckPoints === 0) continue;
    options.push({ hexId, hq, pax, eq, units, truckPoints });
  }
  return options;
};

/**
 * The rebuild one hex of Repls makes by default: reduced units first, then the Dead Pile, as many steps as the Repls pay
 * for (Dead Pile units placed in Combat Mode when their counter has that side), then trucks with the Eq left over.
 */
export const defaultUnitRebuild = (option: UnitRebuildOption): { readonly units: readonly UnitRebuild[]; readonly truckPoints: number } => {
  const { chosen, left } = allocateRebuild(option.units, { PAX: option.pax, EQ: option.eq });
  return {
    units: chosen.map(({ entry: { piece, modes }, steps }) => ({ pieceId: piece.id, steps, mode: piece.location.kind === 'ELIMINATED' ? (modes.includes('COMBAT') ? 'COMBAT' : modes[0]!) : null })),
    truckPoints: Math.min(option.truckPoints, left.EQ),
  };
};
