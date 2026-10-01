import { stableSort, type HexId, type PieceId, type PlayerId } from '../../core/index.js';
import type { PieceRuntimeState, PieceState } from '../../domain/piece/index.js';
import type { GameState, RuleEvent, RuleViolation } from '../kernel/model.js';
import { rollDie } from '../kernel/rng.js';
import {
  TRANSPORT_POINTS_STATUS,
  dedupeStackOrders,
  definitionOf,
  friendlyCombatUnitsAt,
  hexDistanceBetween,
  hexOf,
  isExtender,
  isTransportPoint,
  locatedHexOf,
  movementAllowanceTicks,
  pieceById,
  piecesAt,
  stepOf,
  transportPointsOf,
  usageOf,
  withStatus,
  withUsage,
} from '../pieces.js';
import { CAPTURE_PERCENT, DUMP_BLOWING_PERCENT, roundOcs } from '../tables/ocs-4.3.js';
import { movementCostModel } from '../terrain.js';
import { violation } from '../validation/violation.js';
import { extenderRange, friendlySourceHexes, traceSupplyAvailableAt } from './supply.js';

/**
 * Transport Points (13.2), Extenders (12.7), dump blowing (12.11a), and the capture or displacement
 * of trucks and Extenders (9.14c/d).
 */

/** Largest Transport Point counter in the counter mix (a five-point truck with an Extender back). */
export const MAXIMUM_TRANSPORT_POINTS = 5;
/** 12.7: five Transport Points of one type make an Extender. */
export const EXTENDER_TRANSPORT_POINTS = 5;
/** 9.14c: Transport Points with an MA over 10 use the Trucks column and displace up to 10 Hexes. */
const TRUCK_DISPLACEMENT_HEXES = 10;
const WAGON_DISPLACEMENT_HEXES = 5;

type Transition = { readonly state: GameState; readonly events: readonly RuleEvent[] };

const upsert = (pieceState: PieceRuntimeState, piece: PieceState): PieceRuntimeState => {
  const exists = pieceState.pieces.some(({ id }) => id === piece.id);
  return dedupeStackOrders({ ...pieceState, pieces: exists ? pieceState.pieces.map((entry) => entry.id === piece.id ? piece : entry) : [...pieceState.pieces, piece] });
};

const nextOrder = (state: GameState, hexId: HexId, movingId: PieceId): number =>
  state.pieceState.pieces.reduce((highest, piece) => piece.id !== movingId && piece.location.kind === 'ON_MAP' && piece.location.hexId === hexId
    ? Math.max(highest, piece.stackOrder) : highest, -1) + 1;

/** A new Piece ID derived from an existing one, unique for this revision. */
const derivedId = (state: GameState, baseId: PieceId, tag: string): PieceId => {
  let index = 0;
  let candidate = `${baseId}#${tag}${state.revision}`;
  while (state.pieceState.pieces.some(({ id }) => id === candidate)) { index += 1; candidate = `${baseId}#${tag}${state.revision}.${index}`; }
  return candidate as PieceId;
};

export const cargoOf = (state: GameState, truck: PieceState): readonly PieceState[] =>
  state.pieceState.relations.flatMap((relation) => relation.kind === 'CARGO' && relation.containerId === truck.id
    ? state.pieceState.pieces.filter(({ id }) => id === relation.cargoId) : []);

export const loadedTokens = (state: GameState, truck: PieceState): number =>
  cargoOf(state, truck).reduce((total, piece) => total + (piece.resourceQuantity ?? 0), 0);

/** 13.2c: a Transport Point carries up to its size in SP (four Tokens each). */
export const capacityTokens = (state: GameState, truck: PieceState): number => transportPointsOf(state, truck) * 4;

const printedMaTicks = (state: GameState, piece: PieceState): number => Number(stepOf(state, piece)?.movementPointTicks ?? 0);

/** 13.2f: loading or unloading costs 10% of the printed MA, rounded normally (45 MA pays 5 MP). */
export const loadCostTicks = (state: GameState, truck: PieceState): number => roundOcs(printedMaTicks(state, truck) / 4 * 0.1) * 4;

const remainingTicks = (state: GameState, piece: PieceState): number =>
  movementAllowanceTicks(state, piece) - usageOf(state, piece).movementSpentTicks;

const transportPhase = (state: GameState, actorId: PlayerId): RuleViolation | null =>
  state.sequence.phase === 'MOVEMENT' && state.sequence.segment === 'MOVEMENT' && actorId === state.sequence.phasingPlayerId
    ? null
    : violation('INVALID_TRANSPORT_PHASE', ['sequence'], 'Transport Points act in the friendly Movement Segment (they are always in Move Mode).', '13.2d');

const truckViolations = (state: GameState, actorId: PlayerId, truck: PieceState | undefined, path: readonly (string | number)[]): RuleViolation[] => {
  if (!truck || truck.ownerId !== actorId || !isTransportPoint(state, truck) || hexOf(truck) === null) {
    return [violation('INVALID_TRANSPORT_POINT', path, 'Choose one of your Transport Points on the map.', '13.2')];
  }
  const usage = usageOf(state, truck);
  const issues: RuleViolation[] = [];
  if (usage.moved && state.currentMoverId !== truck.id) issues.push(violation('MOVEMENT_ALREADY_FINISHED', path, 'This Transport Point already finished moving.', '6.1g'));
  return issues;
};

/** The truck acts as the unit now moving (6.1g); its load cost is spent from its MA. */
const spendAsMover = (state: GameState, truck: PieceState, ticks: number): GameState => {
  const previous = state.currentMoverId !== null && state.currentMoverId !== truck.id ? pieceById(state, state.currentMoverId) : undefined;
  let usage = state.usage;
  if (previous) usage = withUsage({ ...state, usage }, { ...usageOf(state, previous), moved: true });
  const current = usageOf({ ...state, usage }, truck);
  return {
    ...state,
    currentMoverId: truck.id,
    usage: withUsage({ ...state, usage }, {
      ...current, moved: true, phaseStartHexId: current.phaseStartHexId ?? hexOf(truck),
      movementSpentTicks: current.movementSpentTicks + ticks,
    }),
  };
};

// ─── Loading and unloading (13.2f, 12.2a) ────────────────────────────────────────────────────

const groundDumpsAt = (state: GameState, playerId: PlayerId, hexId: HexId): readonly PieceState[] =>
  piecesAt(state, hexId).filter((piece) => piece.ownerId === playerId && definitionOf(state, piece)?.family === 'RESOURCE' && (piece.resourceQuantity ?? 0) > 0);

export const validateLoad = (state: GameState, actorId: PlayerId, truckId: PieceId, dumpId: PieceId, tokens: number): readonly RuleViolation[] => {
  const issues: RuleViolation[] = [];
  const phase = transportPhase(state, actorId);
  if (phase) issues.push(phase);
  const truck = pieceById(state, truckId);
  issues.push(...truckViolations(state, actorId, truck, ['truckId']));
  if (issues.length > 0) return issues;
  if (isExtender(state, truck!)) issues.push(violation('EXTENDER_CANNOT_TRANSPORT', ['truckId'], 'Extenders never move SP.', '12.7a'));
  const dump = pieceById(state, dumpId);
  if (!dump || !groundDumpsAt(state, actorId, hexOf(truck!)!).some(({ id }) => id === dumpId)) {
    issues.push(violation('DUMP_NOT_IN_HEX', ['dumpId'], 'A Transport Point loads from a dump in its own Hex.', '13.2f'));
    return issues;
  }
  const loadable = (dump.resourceQuantity ?? 0) - usageOf(state, dump).unloadedTokens;
  if (!Number.isSafeInteger(tokens) || tokens <= 0 || tokens > loadable) {
    issues.push(violation('INVALID_LOAD_QUANTITY', ['tokens'], loadable < (dump.resourceQuantity ?? 0)
      ? 'SP unloaded this phase cannot be loaded again this phase.' : 'Load a positive number of Tokens the dump holds.', '12.2a'));
  }
  if (loadedTokens(state, truck!) + tokens > capacityTokens(state, truck!)) {
    issues.push(violation('TRANSPORT_CAPACITY_EXCEEDED', ['tokens'], 'A Transport Point carries up to its size in SP.', '13.2c'));
  }
  if (remainingTicks(state, truck!) < loadCostTicks(state, truck!)) {
    issues.push(violation('INSUFFICIENT_MP_TO_LOAD', ['truckId'], 'Loading costs 10% of the printed MA.', '13.2f'));
  }
  return issues;
};

const setCargo = (pieceState: PieceRuntimeState, cargoId: PieceId, containerId: PieceId | null, quantity: number, unitDefinitionId: PieceState['definitionId']): PieceRuntimeState => {
  const relations = pieceState.relations.filter((relation) => !(relation.kind === 'CARGO' && relation.cargoId === cargoId));
  return containerId === null || quantity <= 0 ? { ...pieceState, relations }
    : { ...pieceState, relations: [...relations, { kind: 'CARGO', cargoId, containerId, loadQuantity: quantity, unitDefinitionId }] };
};

const unitOf = (state: GameState, dump: PieceState) => definitionOf(state, dump)!.resource!.unitDefinitionId;

export const applyLoad = (state: GameState, truckId: PieceId, dumpId: PieceId, tokens: number): Transition => {
  const truck = pieceById(state, truckId)!;
  const dump = pieceById(state, dumpId)!;
  let next = spendAsMover(state, truck, loadCostTicks(state, truck));
  let pieceState = next.pieceState;
  const existing = cargoOf(next, truck).find(({ definitionId }) => definitionId === dump.definitionId);
  const remaining = (dump.resourceQuantity ?? 0) - tokens;
  if (existing) {
    const quantity = (existing.resourceQuantity ?? 0) + tokens;
    pieceState = setCargo(upsert(pieceState, { ...existing, resourceQuantity: quantity }), existing.id, truck.id, quantity, unitOf(next, dump));
    pieceState = upsert(pieceState, remaining > 0 ? { ...dump, resourceQuantity: remaining } : { ...dump, resourceQuantity: 0, location: { kind: 'ELIMINATED' } });
  } else if (remaining <= 0) {
    pieceState = setCargo(upsert(pieceState, { ...dump, location: { kind: 'CONTAINER', containerId: truck.id } }), dump.id, truck.id, tokens, unitOf(next, dump));
  } else {
    const cargoId = derivedId(next, dump.id, 'load');
    pieceState = upsert(pieceState, { ...dump, resourceQuantity: remaining });
    pieceState = setCargo(upsert(pieceState, { ...dump, id: cargoId, resourceQuantity: tokens, location: { kind: 'CONTAINER', containerId: truck.id }, stackOrder: 0 }), cargoId, truck.id, tokens, unitOf(next, dump));
  }
  next = { ...next, pieceState };
  return { state: next, events: [{ kind: 'SUPPLY_TRANSFERRED', sequence: 0, truckId, tokens, loaded: true }] };
};

export const validateUnload = (state: GameState, actorId: PlayerId, truckId: PieceId, tokens: number): readonly RuleViolation[] => {
  const issues: RuleViolation[] = [];
  const phase = transportPhase(state, actorId);
  if (phase) issues.push(phase);
  const truck = pieceById(state, truckId);
  issues.push(...truckViolations(state, actorId, truck, ['truckId']));
  if (issues.length > 0) return issues;
  const hexId = hexOf(truck!)!;
  if (!Number.isSafeInteger(tokens) || tokens <= 0 || tokens > loadedTokens(state, truck!)) {
    issues.push(violation('INVALID_UNLOAD_QUANTITY', ['tokens'], 'Unload a positive number of the Tokens carried.', '13.2f'));
  }
  if (friendlyCombatUnitsAt(state, actorId, hexId).length === 0 && groundDumpsAt(state, actorId, hexId).length === 0) {
    issues.push(violation('INVALID_UNLOAD_HEX', ['truckId'], 'SP can be unloaded only with a friendly combat unit or an existing unloaded dump.', '13.2f'));
  }
  if (remainingTicks(state, truck!) < loadCostTicks(state, truck!)) {
    issues.push(violation('INSUFFICIENT_MP_TO_UNLOAD', ['truckId'], 'Unloading costs 10% of the printed MA.', '13.2f'));
  }
  return issues;
};

export const applyUnload = (state: GameState, truckId: PieceId, tokens: number): Transition => {
  const truck = pieceById(state, truckId)!;
  const hexId = hexOf(truck)!;
  let next = spendAsMover(state, truck, loadCostTicks(state, truck));
  let pieceState = next.pieceState;
  let left = tokens;
  for (const cargo of cargoOf(next, truck)) {
    if (left <= 0) break;
    const take = Math.min(left, cargo.resourceQuantity ?? 0);
    left -= take;
    const target = groundDumpsAt({ ...next, pieceState }, truck.ownerId, hexId).find(({ definitionId }) => definitionId === cargo.definitionId);
    const remainingCargo = (cargo.resourceQuantity ?? 0) - take;
    if (target) {
      pieceState = upsert(pieceState, { ...target, resourceQuantity: (target.resourceQuantity ?? 0) + take });
      next = { ...next, pieceState, usage: withUsage({ ...next, pieceState }, { ...usageOf(next, target), unloadedTokens: usageOf(next, target).unloadedTokens + take }) };
    } else {
      const groundId = remainingCargo > 0 ? derivedId({ ...next, pieceState }, cargo.id, 'unload') : cargo.id;
      pieceState = upsert(pieceState, { ...cargo, id: groundId, resourceQuantity: take, location: { kind: 'ON_MAP', hexId }, stackOrder: nextOrder({ ...next, pieceState }, hexId, groundId) });
      if (groundId === cargo.id) pieceState = setCargo(pieceState, cargo.id, null, 0, unitOf(next, cargo));
      next = { ...next, pieceState, usage: withUsage({ ...next, pieceState }, { ...usageOf({ ...next, pieceState }, pieceById({ ...next, pieceState }, groundId)!), unloadedTokens: take }) };
    }
    if (remainingCargo > 0) {
      pieceState = setCargo(upsert(next.pieceState, { ...cargo, resourceQuantity: remainingCargo }), cargo.id, truck.id, remainingCargo, unitOf(next, cargo));
      next = { ...next, pieceState };
    } else if (target) {
      pieceState = setCargo(upsert(next.pieceState, { ...cargo, resourceQuantity: 0, location: { kind: 'ELIMINATED' } }), cargo.id, null, 0, unitOf(next, cargo));
      next = { ...next, pieceState };
    }
    pieceState = next.pieceState;
  }
  return { state: next, events: [{ kind: 'SUPPLY_TRANSFERRED', sequence: 0, truckId, tokens, loaded: false }] };
};

// ─── Combining and dividing (13.2c) ──────────────────────────────────────────────────────────

export const validateCombine = (state: GameState, actorId: PlayerId, truckIds: readonly PieceId[]): readonly RuleViolation[] => {
  const issues: RuleViolation[] = [];
  const phase = transportPhase(state, actorId);
  if (phase) issues.push(phase);
  const trucks = truckIds.map((id) => pieceById(state, id));
  if (truckIds.length < 2 || new Set(truckIds).size !== truckIds.length) issues.push(violation('INVALID_COMBINE', ['truckIds'], 'Combine two or more different Transport Points.', '13.2c'));
  for (const [index, truck] of trucks.entries()) issues.push(...truckViolations(state, actorId, truck, ['truckIds', index]));
  if (issues.length > 0) return issues;
  const pieces = trucks as PieceState[];
  if (new Set(pieces.map((piece) => hexOf(piece))).size !== 1 || new Set(pieces.map(({ definitionId }) => definitionId)).size !== 1) {
    issues.push(violation('COMBINE_REQUIRES_SAME_HEX_AND_TYPE', ['truckIds'], 'Only Transport Points of one type in one Hex combine.', '13.2c'));
  }
  if (pieces.some((piece) => isExtender(state, piece))) issues.push(violation('EXTENDER_CANNOT_COMBINE', ['truckIds'], 'Flip an Extender back before combining it.', '12.7d'));
  if (pieces.reduce((total, piece) => total + transportPointsOf(state, piece), 0) > MAXIMUM_TRANSPORT_POINTS) {
    issues.push(violation('COUNTER_MIX_LIMIT', ['truckIds'], `No Transport Point counter is larger than ${MAXIMUM_TRANSPORT_POINTS} points.`, '13.2c'));
  }
  return issues;
};

export const applyCombine = (state: GameState, truckIds: readonly PieceId[]): Transition => {
  const [keeper, ...others] = truckIds.map((id) => pieceById(state, id)!);
  const points = [keeper!, ...others].reduce((total, piece) => total + transportPointsOf(state, piece), 0);
  let pieceState = upsert(state.pieceState, withStatus(keeper!, TRANSPORT_POINTS_STATUS, { kind: 'INTEGER', value: points }));
  for (const other of others) {
    // Cargo moves to the combined counter.
    pieceState = {
      ...pieceState,
      relations: pieceState.relations.map((relation) => relation.kind === 'CARGO' && relation.containerId === other.id ? { ...relation, containerId: keeper!.id } : relation),
      pieces: pieceState.pieces.map((piece) => piece.location.kind === 'CONTAINER' && piece.location.containerId === other.id
        ? { ...piece, location: { kind: 'CONTAINER', containerId: keeper!.id } } : piece),
    };
    pieceState = dedupeStackOrders(pieceState);
    pieceState = upsert(pieceState, { ...other, location: { kind: 'ELIMINATED' } });
  }
  // 6.1f: the combined counter has spent as much as the most-used part.
  const spent = Math.max(...[keeper!, ...others].map((piece) => usageOf(state, piece).movementSpentTicks));
  const next: GameState = { ...state, pieceState };
  return {
    state: { ...next, usage: withUsage(next, { ...usageOf(next, keeper!), movementSpentTicks: spent }) },
    events: [{ kind: 'TRANSPORT_REORGANIZED', sequence: 0, pieceIds: truckIds }],
  };
};

export const validateDivide = (state: GameState, actorId: PlayerId, truckId: PieceId, points: number): readonly RuleViolation[] => {
  const issues: RuleViolation[] = [];
  const phase = transportPhase(state, actorId);
  if (phase) issues.push(phase);
  const truck = pieceById(state, truckId);
  issues.push(...truckViolations(state, actorId, truck, ['truckId']));
  if (issues.length > 0) return issues;
  if (isExtender(state, truck!)) issues.push(violation('EXTENDER_CANNOT_DIVIDE', ['truckId'], 'Flip an Extender back before dividing it.', '12.7d'));
  const size = transportPointsOf(state, truck!);
  if (!Number.isSafeInteger(points) || points < 1 || points >= size) {
    issues.push(violation('INVALID_DIVIDE', ['points'], 'Split off at least one point and leave at least one.', '13.2c'));
  } else if (loadedTokens(state, truck!) > size * 4) {
    issues.push(violation('INVALID_DIVIDE', ['points'], 'The load must fit the divided counters.', '13.2c'));
  }
  return issues;
};

export const applyDivide = (state: GameState, truckId: PieceId, points: number): Transition => {
  const truck = pieceById(state, truckId)!;
  const size = transportPointsOf(state, truck);
  const newId = derivedId(state, truck.id, 'split');
  let pieceState = upsert(state.pieceState, withStatus(truck, TRANSPORT_POINTS_STATUS, { kind: 'INTEGER', value: size - points }));
  const split: PieceState = withStatus({ ...truck, id: newId, stackOrder: nextOrder(state, hexOf(truck)!, newId) }, TRANSPORT_POINTS_STATUS, { kind: 'INTEGER', value: points });
  pieceState = upsert(pieceState, split);
  // Cargo beyond the smaller counter's capacity moves to the split-off counter.
  let overflow = loadedTokens(state, truck) - (size - points) * 4;
  for (const cargo of cargoOf(state, truck)) {
    if (overflow <= 0) break;
    const move = Math.min(overflow, cargo.resourceQuantity ?? 0);
    overflow -= move;
    const unit = unitOf(state, cargo);
    const keep = (cargo.resourceQuantity ?? 0) - move;
    const movedId = keep > 0 ? derivedId({ ...state, pieceState }, cargo.id, 'split') : cargo.id;
    if (keep > 0) pieceState = setCargo(upsert(pieceState, { ...cargo, resourceQuantity: keep }), cargo.id, truck.id, keep, unit);
    pieceState = setCargo(upsert(pieceState, { ...cargo, id: movedId, resourceQuantity: move, location: { kind: 'CONTAINER', containerId: newId } }), movedId, newId, move, unit);
  }
  const next: GameState = { ...state, pieceState };
  return {
    state: { ...next, usage: withUsage(next, { ...usageOf(state, truck), pieceId: newId }) },
    events: [{ kind: 'TRANSPORT_REORGANIZED', sequence: 0, pieceIds: [truck.id, newId] }],
  };
};

// ─── Extenders (12.7, 9.14d) ─────────────────────────────────────────────────────────────────

const hasExtenderFace = (state: GameState, piece: PieceState): boolean =>
  definitionOf(state, piece)?.faces.some(({ id }) => id === 'extender') ?? false;

/** Would an Extender at `hexId` connect to a Supply Source (12.7d)? */
const extenderConnectsAt = (state: GameState, truck: PieceState, hexId: HexId): boolean => {
  // An Extender is a source when linked to one (12.7a): recompute the sources with it in place.
  const probe: GameState = { ...state, pieceState: upsert(state.pieceState, { ...truck, currentFaceId: 'extender' as PieceState['currentFaceId'] }) };
  return friendlySourceHexes(probe, truck.ownerId).includes(hexId);
};

export const validateFormExtender = (state: GameState, actorId: PlayerId, truckId: PieceId): readonly RuleViolation[] => {
  const issues: RuleViolation[] = [];
  const phase = transportPhase(state, actorId);
  if (phase) issues.push(phase);
  const truck = pieceById(state, truckId);
  issues.push(...truckViolations(state, actorId, truck, ['truckId']));
  if (issues.length > 0) return issues;
  if (!hasExtenderFace(state, truck!)) issues.push(violation('NO_EXTENDER_COUNTER', ['truckId'], 'This counter type has no Extender side.', '12.7'));
  if (isExtender(state, truck!)) issues.push(violation('ALREADY_EXTENDER', ['truckId'], 'This counter is already an Extender.', '12.7'));
  if (transportPointsOf(state, truck!) !== EXTENDER_TRANSPORT_POINTS) {
    issues.push(violation('EXTENDER_NEEDS_FIVE_POINTS', ['truckId'], 'Combine five Transport Points of one type in the Hex first.', '12.7'));
  }
  if (loadedTokens(state, truck!) > 0) issues.push(violation('LOADED_TRANSPORT_CANNOT_EXTEND', ['truckId'], 'A loaded Transport Point must unload first.', '12.7d'));
  if (remainingTicks(state, truck!) < printedMaTicks(state, truck!) / 2) {
    issues.push(violation('EXTENDER_NEEDS_HALF_MA', ['truckId'], 'Switching into an Extender costs half the MA.', '12.7d'));
  }
  if (issues.length === 0 && !extenderConnectsAt(state, truck!, hexOf(truck!)!)) {
    issues.push(violation('EXTENDER_NOT_CONNECTED', ['truckId'], 'An Extender cannot be created where it cannot connect to a trace supply source.', '12.7d'));
  }
  return issues;
};

export const applyFormExtender = (state: GameState, truckId: PieceId): Transition => {
  const truck = pieceById(state, truckId)!;
  const next = spendAsMover(state, truck, printedMaTicks(state, truck) / 2);
  return {
    state: { ...next, pieceState: upsert(next.pieceState, { ...pieceById(next, truckId)!, currentFaceId: 'extender' as PieceState['currentFaceId'] }) },
    events: [{ kind: 'TRANSPORT_REORGANIZED', sequence: 0, pieceIds: [truckId] }],
  };
};

export const validateDissolveExtender = (state: GameState, actorId: PlayerId, extenderId: PieceId): readonly RuleViolation[] => {
  const issues: RuleViolation[] = [];
  const phase = transportPhase(state, actorId);
  if (phase) issues.push(phase);
  const extender = pieceById(state, extenderId);
  issues.push(...truckViolations(state, actorId, extender, ['extenderId']));
  if (issues.length === 0 && !isExtender(state, extender!)) issues.push(violation('NOT_AN_EXTENDER', ['extenderId'], 'Only Extenders flip back to Transport Points.', '12.7d'));
  return issues;
};

export const applyDissolveExtender = (state: GameState, extenderId: PieceId): Transition => {
  const extender = pieceById(state, extenderId)!;
  const flipped: GameState = { ...state, pieceState: upsert(state.pieceState, { ...extender, currentFaceId: 'move' as PieceState['currentFaceId'] }) };
  // 12.7d: flipping back costs half the (Transport Point) MA.
  const truck = pieceById(flipped, extenderId)!;
  const next = spendAsMover(flipped, truck, printedMaTicks(flipped, truck) / 2);
  return { state: next, events: [{ kind: 'TRANSPORT_REORGANIZED', sequence: 0, pieceIds: [extenderId] }] };
};

/**
 * 9.14d: Hexes an Extender may collapse to: within its range in Truck MP (enemy units, ZOCs and
 * prohibited terrain have no effect) and currently in trace supply.
 */
export const extenderCollapseHexes = (state: GameState, extender: PieceState, fromHexId: HexId): readonly HexId[] => {
  const range = extenderRange(state, extender);
  const model = movementCostModel(state, range.mobility, true, 'DRY');
  const best = new Map<HexId, number>([[fromHexId, 0]]);
  const frontier: Array<[HexId, number]> = [[fromHexId, 0]];
  while (frontier.length > 0) {
    frontier.sort((left, right) => left[1] - right[1]);
    const [hexId, cost] = frontier.shift()!;
    for (const hex of state.scenario.mapDefinition.hexes) {
      if (hexDistanceBetween(hexId, hex.id) !== 1) continue;
      const step = model.evaluate(hexId, hex.id);
      // Prohibited terrain has no effect on a displacement: count it as a 1 MP step.
      const ticks = step.kind === 'COST' && !step.all ? step.cost.totalTicks : 4;
      const total = cost + ticks;
      if (total > range.ticks || total >= (best.get(hex.id) ?? Number.POSITIVE_INFINITY)) continue;
      best.set(hex.id, total);
      frontier.push([hex.id, total]);
    }
  }
  const occupiable = movementCostModel(state, 'truck', true, 'DRY');
  return stableSort([...best.keys()].filter((hexId) => hexId !== fromHexId
    && traceSupplyAvailableAt(state, extender.ownerId, hexId)
    && !piecesAt(state, hexId).some((piece) => piece.ownerId !== extender.ownerId)
    && state.scenario.mapDefinition.hexes.some((hex) => hexDistanceBetween(hex.id, hexId) === 1 && occupiable.evaluate(hex.id, hexId).kind === 'COST')),
  (left, right) => hexDistanceBetween(fromHexId, left) - hexDistanceBetween(fromHexId, right) || String(left).localeCompare(String(right)));
};

export const validateCollapseExtender = (state: GameState, actorId: PlayerId, extenderId: PieceId, hexId: HexId): readonly RuleViolation[] => {
  const issues = [...validateDissolveExtender(state, actorId, extenderId)];
  if (issues.length > 0) return issues;
  const extender = pieceById(state, extenderId)!;
  if (!extenderCollapseHexes(state, extender, hexOf(extender)!).includes(hexId)) {
    issues.push(violation('INVALID_COLLAPSE_HEX', ['hexId'], 'Collapse to a Hex in trace supply within the Extender range.', '9.14d'));
  }
  return issues;
};

/** Collapse an Extender to `hexId` as its move (9.14d): it flips to its Transport Point side there. */
export const applyCollapseExtender = (state: GameState, extenderId: PieceId, hexId: HexId): Transition => {
  const extender = pieceById(state, extenderId)!;
  let next = spendAsMover(state, extender, 0);
  next = {
    ...next,
    pieceState: upsert(next.pieceState, {
      ...pieceById(next, extenderId)!, currentFaceId: 'move' as PieceState['currentFaceId'],
      location: { kind: 'ON_MAP', hexId }, stackOrder: nextOrder(next, hexId, extenderId),
    }),
  };
  const usage = usageOf(next, pieceById(next, extenderId)!);
  next = { ...next, usage: withUsage(next, { ...usage, movementSpentTicks: movementAllowanceTicks(next, pieceById(next, extenderId)!) }) };
  return { state: next, events: [{ kind: 'PIECE_DISPLACED', sequence: 0, pieceId: extenderId, toHexId: hexId }] };
};

// ─── Blowing dumps (12.11a) ──────────────────────────────────────────────────────────────────

export const validateBlowDump = (state: GameState, actorId: PlayerId, dumpId: PieceId, tokens: number): readonly RuleViolation[] => {
  const issues: RuleViolation[] = [];
  const { phase, segment } = state.sequence;
  if (segment !== 'MOVEMENT' || !['MOVEMENT', 'REACTION', 'EXPLOITATION'].includes(phase) || actorId !== state.sequence.actingPlayerId) {
    issues.push(violation('INVALID_BLOWING_PHASE', ['sequence'], 'Dumps are blown in the friendly Movement Segments of the Movement, Reaction and Exploitation Phases.', '12.11a'));
  }
  const dump = pieceById(state, dumpId);
  if (!dump || dump.ownerId !== actorId || definitionOf(state, dump)?.family !== 'RESOURCE' || locatedHexOf(state, dump) === null) {
    issues.push(violation('INVALID_DUMP', ['dumpId'], 'Blow one of your own dumps on the map (loaded or not).', '12.11a'));
    return issues;
  }
  if (usageOf(state, dump).blown) issues.push(violation('DUMP_ALREADY_BLOWN', ['dumpId'], 'A dump can be blown only once per phase.', '12.11a'));
  if (!Number.isSafeInteger(tokens) || tokens <= 0 || tokens > (dump.resourceQuantity ?? 0)) {
    issues.push(violation('INVALID_BLOW_QUANTITY', ['tokens'], 'Blow all or part of the SP in the dump.', '12.11a'));
  }
  return issues;
};

export const applyBlowDump = (state: GameState, dumpId: PieceId, tokens: number): Transition => {
  const dump = pieceById(state, dumpId)!;
  const die = rollDie(state.rng);
  // Round losses to the nearest Token.
  const destroyed = Math.min(tokens, roundOcs(tokens * DUMP_BLOWING_PERCENT[die.value]! / 100));
  const remaining = (dump.resourceQuantity ?? 0) - destroyed;
  let pieceState = upsert(state.pieceState, remaining > 0 ? { ...dump, resourceQuantity: remaining } : { ...dump, resourceQuantity: 0, location: { kind: 'ELIMINATED' } });
  if (dump.location.kind === 'CONTAINER') pieceState = setCargo(pieceState, dump.id, remaining > 0 ? dump.location.containerId : null, remaining, unitOf(state, dump));
  const next: GameState = { ...state, rng: die.rng, pieceState };
  return {
    state: { ...next, usage: withUsage(next, { ...usageOf(next, dump), blown: true }) },
    events: [{ kind: 'DUMP_BLOWN', sequence: 0, resourcePieceId: dumpId, destroyed }],
  };
};

// ─── Capture (9.14b/c/d) ─────────────────────────────────────────────────────────────────────

/** Hexes a displaced Transport Point may be placed in (9.14c): within range, free of enemy units, and not prohibited. */
export const captureDisplacementHexes = (state: GameState, truck: PieceState, fromHexId: HexId, range: number): readonly HexId[] => {
  const model = movementCostModel(state, 'truck', true, 'DRY');
  return stableSort(state.scenario.mapDefinition.hexes.map(({ id }) => id).filter((hexId) => hexId !== fromHexId
    && hexDistanceBetween(fromHexId, hexId) <= range
    && !piecesAt(state, hexId).some((piece) => piece.ownerId !== truck.ownerId)
    && state.scenario.mapDefinition.hexes.some((hex) => hexDistanceBetween(hex.id, hexId) === 1 && model.evaluate(hex.id, hexId).kind === 'COST')),
  (left, right) => hexDistanceBetween(fromHexId, left) - hexDistanceBetween(fromHexId, right) || String(left).localeCompare(String(right)));
};

/**
 * 9.14b-d: an Attack-Capable unit entering a Hex with enemy dumps, Transport Points, or Extenders.
 * Dumps roll on the Dump column; trucks roll once on the Trucks (MA > 10) or Wagons column for their
 * combined points, loaded SP sharing their fate; the rest displace by the owner's choice. Extenders
 * collapse instead of being captured.
 */
export const captureAt = (state: GameState, capturerId: PlayerId, hexId: HexId, events: RuleEvent[]): GameState => {
  let next = state;
  const enemy = piecesAt(next, hexId).filter((piece) => piece.ownerId !== capturerId);
  // Extenders collapse first (9.14d); with no legal Hex they flip and are checked as trucks.
  for (const extender of enemy.filter((piece) => isExtender(next, piece))) {
    if (extenderCollapseHexes(next, extender, hexId).length > 0) {
      next = { ...next, interrupts: [...next.interrupts, { kind: 'DISPLACEMENT', reason: 'EXTENDER_COLLAPSE', ownerId: extender.ownerId, fromHexId: hexId, pieceIds: [extender.id], range: extenderRange(next, extender).ticks }] };
    } else {
      next = { ...next, pieceState: upsert(next.pieceState, { ...extender, currentFaceId: 'move' as PieceState['currentFaceId'] }) };
    }
  }
  for (const dump of piecesAt(next, hexId).filter((piece) => piece.ownerId !== capturerId && definitionOf(next, piece)?.family === 'RESOURCE')) {
    const die = rollDie(next.rng);
    const quantity = dump.resourceQuantity ?? 0;
    const captured = roundOcs(quantity * CAPTURE_PERCENT.DUMP[die.value]! / 100);
    next = {
      ...next,
      rng: die.rng,
      pieceState: upsert(next.pieceState, captured > 0
        ? { ...dump, ownerId: capturerId, resourceQuantity: captured }
        : { ...dump, resourceQuantity: 0, location: { kind: 'ELIMINATED' } }),
    };
    events.push({ kind: 'SUPPLY_CAPTURED', sequence: events.length, resourcePieceId: dump.id, captured, destroyed: quantity - captured });
  }
  const trucks = piecesAt(next, hexId).filter((piece) => piece.ownerId !== capturerId && isTransportPoint(next, piece) && !isExtender(next, piece)
    && queuedDisplacement(next, piece.id) === false);
  for (const column of ['TRUCKS', 'WAGONS'] as const) {
    const group = trucks.filter((piece) => (printedMaTicks(next, piece) > 40) === (column === 'TRUCKS'));
    if (group.length === 0) continue;
    const die = rollDie(next.rng);
    next = { ...next, rng: die.rng };
    const percent = CAPTURE_PERCENT[column][die.value]!;
    const owner = group[0]!.ownerId;
    // Loaded SP share the trucks' fate (9.14c): set the load aside and share it out afterwards.
    const loads = new Map<string, { definitionId: PieceState['definitionId']; tokens: number; template: PieceState }>();
    for (const truck of group) {
      for (const cargo of cargoOf(next, truck)) {
        const entry = loads.get(String(cargo.definitionId)) ?? { definitionId: cargo.definitionId, tokens: 0, template: cargo };
        entry.tokens += cargo.resourceQuantity ?? 0;
        loads.set(String(cargo.definitionId), entry);
        next = { ...next, pieceState: setCargo(upsert(next.pieceState, { ...cargo, resourceQuantity: 0, location: { kind: 'ELIMINATED' } }), cargo.id, null, 0, unitOf(next, cargo)) };
      }
    }
    const total = group.reduce((sum, piece) => sum + transportPointsOf(next, piece), 0);
    let toCapture = roundOcs(total * percent / 100);
    const displaced: PieceId[] = [];
    const captured: PieceId[] = [];
    for (const truck of stableSort(group, (left, right) => transportPointsOf(next, right) - transportPointsOf(next, left))) {
      const size = transportPointsOf(next, truck);
      if (toCapture >= size) {
        next = { ...next, pieceState: upsert(next.pieceState, { ...pieceById(next, truck.id)!, ownerId: capturerId }) };
        captured.push(truck.id);
        toCapture -= size;
      } else if (toCapture > 0) {
        const before = new Set(next.pieceState.pieces.map(({ id }) => id));
        const divided = applyDivide(next, truck.id, toCapture).state;
        const split = divided.pieceState.pieces.find(({ id }) => !before.has(id))!;
        next = { ...divided, usage: next.usage, pieceState: upsert(divided.pieceState, { ...split, ownerId: capturerId }) };
        captured.push(split.id);
        displaced.push(truck.id);
        toCapture = 0;
      } else {
        displaced.push(truck.id);
      }
    }
    for (const load of loads.values()) {
      const capturedTokens = roundOcs(load.tokens * percent / 100);
      next = loadInto(next, captured, capturerId, load.template, capturedTokens);
      next = loadInto(next, displaced, owner, load.template, load.tokens - capturedTokens);
    }
    if (displaced.length > 0) {
      next = { ...next, interrupts: [...next.interrupts, {
        kind: 'DISPLACEMENT', reason: 'CAPTURE', ownerId: owner, fromHexId: hexId, pieceIds: displaced,
        range: column === 'TRUCKS' ? TRUCK_DISPLACEMENT_HEXES : WAGON_DISPLACEMENT_HEXES,
      }] };
    }
  }
  return next;
};

const queuedDisplacement = (state: GameState, pieceId: PieceId): boolean =>
  state.interrupts.some((interrupt) => interrupt.kind === 'DISPLACEMENT' && interrupt.pieceIds.includes(pieceId));

/** Load `tokens` of a dump type onto trucks up to their capacity, creating new cargo counters. */
const loadInto = (state: GameState, truckIds: readonly PieceId[], ownerId: PlayerId, template: PieceState, tokens: number): GameState => {
  let next = state;
  let left = tokens;
  for (const truckId of truckIds) {
    if (left <= 0) break;
    const truck = pieceById(next, truckId)!;
    const room = capacityTokens(next, truck) - loadedTokens(next, truck);
    const take = Math.min(room, left);
    if (take <= 0) continue;
    left -= take;
    const cargoId = derivedId(next, template.id, 'cargo');
    next = { ...next, pieceState: setCargo(upsert(next.pieceState, {
      ...template, id: cargoId, ownerId, resourceQuantity: take, location: { kind: 'CONTAINER', containerId: truckId }, stackOrder: 0,
    }), cargoId, truckId, take, unitOf(next, template)) };
  }
  return next;
};

/** Place a displaced truck or collapsed Extender (9.14c/d). */
export const applyDisplacement = (state: GameState, pieceId: PieceId, hexId: HexId | null): GameState => {
  const piece = pieceById(state, pieceId)!;
  if (hexId === null) {
    let pieceState = upsert(state.pieceState, { ...piece, location: { kind: 'ELIMINATED' } });
    for (const cargo of cargoOf(state, piece)) pieceState = setCargo(upsert(pieceState, { ...cargo, location: { kind: 'ELIMINATED' } }), cargo.id, null, 0, unitOf(state, cargo));
    return { ...state, pieceState };
  }
  return {
    ...state,
    pieceState: upsert(state.pieceState, {
      ...piece, currentFaceId: isExtender(state, piece) ? 'move' as PieceState['currentFaceId'] : piece.currentFaceId,
      location: { kind: 'ON_MAP', hexId }, stackOrder: nextOrder(state, hexId, pieceId),
    }),
  };
};
