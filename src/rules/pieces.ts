import {
  formatHexId,
  hexDistance,
  neighbors,
  parseDefinitionId,
  parseHexCoordinateId,
  type DefinitionId,
  type HexId,
  type PieceId,
  type PlayerId,
} from '../core/index.js';
import {
  createPieceDefinitionCatalogIndex,
  type PieceDefinition,
  type PieceDefinitionCatalog,
  type PieceState,
} from '../domain/piece/index.js';
import type { CombatClass, GameState, InternalStocksLevel, MobilityType, PieceUsageState } from './kernel/model.js';

/** Derived Piece facts shared by every rule module. Nothing here mutates state. */

const catalogIndexes = new WeakMap<PieceDefinitionCatalog, ReturnType<typeof createPieceDefinitionCatalogIndex>>();

export const definitionOf = (state: GameState, piece: PieceState): PieceDefinition | undefined => {
  let index = catalogIndexes.get(state.scenario.pieceCatalog);
  if (!index) {
    index = createPieceDefinitionCatalogIndex(state.scenario.pieceCatalog);
    catalogIndexes.set(state.scenario.pieceCatalog, index);
  }
  return index.get(piece.definitionId);
};

const statusId = (value: string): DefinitionId => {
  const parsed = parseDefinitionId(value);
  if (!parsed.ok) throw new Error(`Status ID ${value} is invalid.`);
  return parsed.value;
};

export const OUT_OF_SUPPLY_STATUS = statusId('status:out-of-supply');
export const PRIOR_MODE_STATUS = statusId('status:mode-before-involuntary');
/** 12.10: TEXT LOW or EXHAUSTED under a unit whose internal stocks are used. */
export const INTERNAL_STOCKS_STATUS = statusId('status:internal-stocks');
/** 13.2c: current size of a Transport Point counter when it differs from the printed size. */
export const TRANSPORT_POINTS_STATUS = statusId('status:transport-points');
/** 12.8e: Game Turn in which the unit was first found out of trace supply. */
export const OUT_OF_TRACE_SINCE_STATUS = statusId('status:out-of-trace-since');
/** 12.8e: Game Turn on which a unit that broke out returns as a reinforcement. */
export const RETURN_TURN_STATUS = statusId('status:return-turn');
/**
 * TEXT name of one Piece when it differs from its Definition's. Breakdowns (20.0) share a generic Definition, but each is
 * numbered after the division that detached it ("1/101.Abn"), which a board-game counter pool cannot do.
 */
export const UNIT_NAME_STATUS = statusId('status:unit-name');

const integerStatus = (piece: PieceState, id: DefinitionId): number | null => {
  const value = piece.statuses.find(({ statusDefinitionId }) => statusDefinitionId === id)?.value;
  return value?.kind === 'INTEGER' ? value.value : null;
};

export const withStatus = (piece: PieceState, id: DefinitionId, value: PieceState['statuses'][number]['value'] | null): PieceState => ({
  ...piece,
  statuses: [
    ...piece.statuses.filter(({ statusDefinitionId }) => statusDefinitionId !== id),
    ...(value === null ? [] : [{ statusDefinitionId: id, value }]),
  ],
});

export const internalStocksOf = (piece: PieceState): InternalStocksLevel => {
  const value = piece.statuses.find(({ statusDefinitionId }) => statusDefinitionId === INTERNAL_STOCKS_STATUS)?.value;
  return value?.kind === 'TEXT' && (value.value === 'LOW' || value.value === 'EXHAUSTED') ? value.value : 'FULL';
};

export const withInternalStocks = (piece: PieceState, level: InternalStocksLevel): PieceState =>
  withStatus(piece, INTERNAL_STOCKS_STATUS, level === 'FULL' ? null : { kind: 'TEXT', value: level });

export const outOfTraceSince = (piece: PieceState): number | null => integerStatus(piece, OUT_OF_TRACE_SINCE_STATUS);
export const returnTurnOf = (piece: PieceState): number | null => integerStatus(piece, RETURN_TURN_STATUS);

export const pieceById = (state: GameState, pieceId: PieceId): PieceState | undefined =>
  state.pieceState.pieces.find(({ id }) => id === pieceId);

export const hexOf = (piece: PieceState): HexId | null =>
  piece.location.kind === 'ON_MAP' ? piece.location.hexId : null;

/** Hex of a Piece on the map, or of the Transport Point carrying it (13.2f). */
export const locatedHexOf = (state: GameState, piece: PieceState): HexId | null => {
  if (piece.location.kind === 'ON_MAP') return piece.location.hexId;
  if (piece.location.kind !== 'CONTAINER') return null;
  const containerId = piece.location.containerId;
  const container = state.pieceState.pieces.find(({ id }) => id === containerId);
  return container ? hexOf(container) : null;
};

export const faceOf = (state: GameState, piece: PieceState) =>
  definitionOf(state, piece)?.faces.find(({ id }) => id === piece.currentFaceId);

export const stepOf = (state: GameState, piece: PieceState) =>
  faceOf(state, piece)?.steps.find(({ remainingSteps }) => remainingSteps === piece.remainingSteps);

export const hasCapability = (state: GameState, piece: PieceState, capability: string): boolean =>
  definitionOf(state, piece)?.capabilities.some(({ id }) => id === capability) ?? false;

export const isHq = (state: GameState, piece: PieceState): boolean =>
  hasCapability(state, piece, 'HQ') || definitionOf(state, piece)?.counter?.kind === 'HQ';

export const isArtillery = (state: GameState, piece: PieceState): boolean =>
  hasCapability(state, piece, 'ARTILLERY') || definitionOf(state, piece)?.counter?.kind === 'ARTILLERY';

export const isTransportPoint = (state: GameState, piece: PieceState): boolean =>
  hasCapability(state, piece, 'TRANSPORT_CAPACITY') || definitionOf(state, piece)?.counter?.kind === 'TRANSPORT';

/** Transport Points in a truck counter (13.2c); an Extender keeps the five points it was made of. */
export const transportPointsOf = (state: GameState, piece: PieceState): number =>
  integerStatus(piece, TRANSPORT_POINTS_STATUS) ?? definitionOf(state, piece)?.counter?.transportPoints ?? 0;

/** 12.7: an Extender is a five-point Transport Point counter flipped to its Extender side. */
export const isExtender = (state: GameState, piece: PieceState): boolean =>
  isTransportPoint(state, piece) && piece.currentFaceId === 'extender';

/** Formation the unit belongs to (3.2f), or null. */
export const formationOf = (state: GameState, piece: PieceState): DefinitionId | null =>
  definitionOf(state, piece)?.ownership.formationDefinitionId ?? null;

const formationSizes = new WeakMap<object, Map<string, number>>();

/** A multi-unit formation has more than one counter (3.2f, 12.5c, 13.7). */
export const isMultiUnitFormation = (state: GameState, formationId: DefinitionId | null): boolean => {
  if (formationId === null) return false;
  let sizes = formationSizes.get(state.scenario.pieceCatalog);
  if (!sizes) {
    sizes = new Map();
    for (const definition of state.scenario.pieceCatalog.definitions) {
      const id = definition.ownership.formationDefinitionId;
      if (id !== null && definition.family === 'GROUND') sizes.set(String(id), (sizes.get(String(id)) ?? 0) + 1);
    }
    formationSizes.set(state.scenario.pieceCatalog, sizes);
  }
  return (sizes.get(String(formationId)) ?? 0) > 1;
};

/**
 * 3.2d: a multi-step ground unit (usually an infantry division on one counter, with an RE dot). It stays one after
 * losing steps, so this counts the printed steps, not the remaining ones.
 */
export const isMultiStepDefinition = (definition: PieceDefinition | null | undefined): boolean =>
  definition?.family === 'GROUND'
  && definition.faces.some(({ steps }) => steps.some(({ remainingSteps }) => remainingSteps > 1));

export const isMultiStepUnit = (state: GameState, piece: PieceState): boolean =>
  isMultiStepDefinition(definitionOf(state, piece));

/** 3.2f: units that are neither part of a multi-unit formation nor a multi-step unit. */
export const isIndependent = (state: GameState, piece: PieceState): boolean =>
  !isMultiUnitFormation(state, formationOf(state, piece)) && !isMultiStepUnit(state, piece);

/**
 * 13.1d: a divisional HQ belongs to a multi-unit formation. A series rule for games that print divisional HQs;
 * Beyond the Rhine has none (every HQ is independent), so generated scenarios never meet one.
 */
export const isDivisionalHq = (state: GameState, piece: PieceState): boolean =>
  isHq(state, piece) && isMultiUnitFormation(state, formationOf(state, piece));

/** 13.1d: divisional HQs supply only their own division's units and independent units of their nationality. */
export const hqMaySupply = (state: GameState, hq: PieceState, consumer: PieceState | null): boolean => {
  if (consumer === null || !isDivisionalHq(state, hq)) return true;
  if (formationOf(state, consumer) === formationOf(state, hq)) return true;
  const hqNationality = definitionOf(state, hq)?.ownership.nationalityDefinitionId ?? null;
  return isIndependent(state, consumer) && definitionOf(state, consumer)?.ownership.nationalityDefinitionId === hqNationality;
};

/** Combat units are ground units with a Combat Strength, including HQs and artillery (3.2, 13.1c, 13.4b). */
export const isCombatUnit = (state: GameState, piece: PieceState): boolean => {
  const definition = definitionOf(state, piece);
  return definition?.family === 'GROUND' && !isTransportPoint(state, piece) && piece.remainingSteps !== null;
};

export const isOnMapCombatUnit = (state: GameState, piece: PieceState): boolean =>
  piece.location.kind === 'ON_MAP' && isCombatUnit(state, piece);

/** 12.5a: combat units with a Truck or Track MA pay fuel to spend MP; trucks never do (13.2b). */
export const needsFuel = (state: GameState, piece: PieceState): boolean => {
  if (!isCombatUnit(state, piece)) return false;
  const mobility = mobilityOf(state, piece);
  return mobility === 'truck' || mobility === 'tracked';
};

export const isOutOfSupply = (piece: PieceState): boolean => piece.statuses.some(({ statusDefinitionId, value }) =>
  statusDefinitionId === OUT_OF_SUPPLY_STATUS && value.kind === 'FLAG' && value.value);

/** Printed Combat Strength on the current face; null when the counter prints none. */
export const printedStrength = (state: GameState, piece: PieceState): number | null =>
  stepOf(state, piece)?.combatStrength ?? null;

export const isDefensiveOnly = (state: GameState, piece: PieceState): boolean =>
  definitionOf(state, piece)?.counter?.defensiveOnly ?? false;

/** 4.4: printed, un-parenthesized strength and not in Strat or Reserve Mode. */
export const isAttackCapable = (state: GameState, piece: PieceState): boolean =>
  isCombatUnit(state, piece) && printedStrength(state, piece) !== null && !isDefensiveOnly(state, piece)
  && piece.mode !== 'STRAT' && piece.mode !== 'RESERVE';

export const combatClass = (state: GameState, piece: PieceState): CombatClass =>
  definitionOf(state, piece)?.counter?.combatCategory ?? 'OTHER';

/** 9.4e Anti-Tank effect level: 2 heavy, 1 light, 0 none. */
export const antiTankLevel = (state: GameState, piece: PieceState): number => {
  const counter = definitionOf(state, piece)?.counter;
  if (!counter) return 0;
  if (counter.combatCategory === 'ARMOR') return 2;
  if (counter.combatCategory === 'MECH') return counter.symbol === 'ARMOR' ? 2 : 1;
  return 0;
};

export const printedSteps = (state: GameState, piece: PieceState): number =>
  Math.max(1, ...(faceOf(state, piece)?.steps.map(({ remainingSteps }) => remainingSteps) ?? [1]));

export const reTicksOf = (state: GameState, piece: PieceState): number =>
  isCombatUnit(state, piece) ? Number(stepOf(state, piece)?.regimentalEquivalentTicks ?? 0) : 0;

const MOBILITY_TYPES: Readonly<Record<string, MobilityType>> = {
  'mobility:leg': 'leg', 'mobility:truck': 'truck', 'mobility:tracked': 'tracked',
};

export const mobilityOf = (state: GameState, piece: PieceState): MobilityType | null => {
  const face = faceOf(state, piece);
  return face ? MOBILITY_TYPES[String(face.mobilityClassDefinitionId)] ?? null : null;
};

/** Printed Action Rating as modified by mode (9.6a). HQs have AR 0 (13.1c). */
export const actionRating = (state: GameState, piece: PieceState): number => {
  if (piece.mode === 'STRAT') return 0;
  const printed = stepOf(state, piece)?.actionRating ?? 0;
  return Math.max(0, printed - (piece.mode === 'DG' ? 1 : 0));
};

export const barrageStrengthOf = (state: GameState, piece: PieceState): number => {
  const step = stepOf(state, piece);
  const rating = step?.ratings.find(({ ratingDefinitionId }) => ratingDefinitionId === 'rating:barrage-strength')?.value;
  const printed = typeof rating === 'number' ? rating : step?.combatStrength ?? 0;
  return piece.mode === 'DG' ? printed / 2 : printed;
};

/** HQ throw range (12.3b) in quarter-MP ticks, printed per face in whole MP. */
export const throwRangeTicks = (state: GameState, piece: PieceState): number =>
  isHq(state, piece) ? (stepOf(state, piece)?.range ?? 0) * 4 : 0;

/**
 * Mode shown by the counter's current face (5.2). A unit without a mode marker is in Combat or
 * Move Mode according to its face, and returns to that mode when a marker is removed.
 */
export const faceMode = (piece: PieceState): 'COMBAT' | 'MOVE' => piece.currentFaceId === 'combat' ? 'COMBAT' : 'MOVE';

/** Enter DG or Exploitation Mode; the orientation (face) is kept for Clean Up (5.9, 5.10). */
export const withInvoluntaryMode = (piece: PieceState, mode: 'DG' | 'EXPLOITATION'): PieceState => ({
  ...piece,
  mode,
  statuses: piece.statuses.filter(({ statusDefinitionId }) => statusDefinitionId !== PRIOR_MODE_STATUS),
});

export const withOutOfSupply = (piece: PieceState, outOfSupply: boolean): PieceState => ({
  ...piece,
  statuses: [
    ...piece.statuses.filter(({ statusDefinitionId }) => statusDefinitionId !== OUT_OF_SUPPLY_STATUS),
    ...(outOfSupply ? [{ statusDefinitionId: OUT_OF_SUPPLY_STATUS, value: { kind: 'FLAG' as const, value: true } }] : []),
  ],
});

export const piecesAt = (state: GameState, hexId: HexId): readonly PieceState[] =>
  state.pieceState.pieces.filter((piece) => piece.location.kind === 'ON_MAP' && piece.location.hexId === hexId);

export const enemyCombatUnitsAt = (state: GameState, playerId: PlayerId, hexId: HexId): readonly PieceState[] =>
  piecesAt(state, hexId).filter((piece) => piece.ownerId !== playerId && isCombatUnit(state, piece));

export const friendlyCombatUnitsAt = (state: GameState, playerId: PlayerId, hexId: HexId): readonly PieceState[] =>
  piecesAt(state, hexId).filter((piece) => piece.ownerId === playerId && isCombatUnit(state, piece));

/** Neighbours of each Hex ID seen so far: supply and movement ask for them millions of times on a large map. */
const adjacentCache = new Map<HexId, readonly HexId[]>();

export const adjacentHexIds = (hexId: HexId): readonly HexId[] => {
  const cached = adjacentCache.get(hexId);
  if (cached) return cached;
  const parsed = parseHexCoordinateId(hexId);
  const adjacent = Object.freeze(parsed.ok ? neighbors(parsed.value).map(formatHexId) : []);
  adjacentCache.set(hexId, adjacent);
  return adjacent;
};

export const hexDistanceBetween = (left: HexId, right: HexId): number => {
  const a = parseHexCoordinateId(left);
  const b = parseHexCoordinateId(right);
  return a.ok && b.ok ? hexDistance(a.value, b.value) : Number.POSITIVE_INFINITY;
};

export const isAdjacent = (left: HexId, right: HexId): boolean => hexDistanceBetween(left, right) === 1;

export const emptyUsage = (pieceId: PieceId, phaseStartHexId: HexId | null): PieceUsageState => ({
  pieceId, movementSpentTicks: 0, moved: false, phaseStartHexId, attacked: false, barraged: false,
  reserveReleased: false, negationLocked: false, supplyPaid: false, fueled: false, fuelThrowHexId: null,
  recovered: false, breakoutAttempted: false, blown: false, unloadedTokens: 0,
});

export const usageOf = (state: GameState, piece: PieceState): PieceUsageState =>
  state.usage.find((entry) => entry.pieceId === piece.id) ?? emptyUsage(piece.id, hexOf(piece));

export const withUsage = (state: GameState, usage: PieceUsageState): GameState['usage'] => {
  const others = state.usage.filter(({ pieceId }) => pieceId !== usage.pieceId);
  return [...others, usage].sort((left, right) => String(left.pieceId).localeCompare(String(right.pieceId)));
};

export const opponentOf = (state: GameState, playerId: PlayerId): PlayerId =>
  state.scenario.players.find(({ id }) => id !== playerId)?.id ?? playerId;

/** Friendly units that may move in the current phase (6.0, 7.0a, 11.0a). */
export const isEligibleMover = (state: GameState, piece: PieceState): boolean => {
  if (piece.mode === null || !(definitionOf(state, piece)?.family === 'GROUND')) return false;
  const released = usageOf(state, piece).reserveReleased;
  switch (state.sequence.phase) {
    case 'MOVEMENT': return true;
    case 'REACTION': return released;
    case 'EXPLOITATION': return released || piece.mode === 'EXPLOITATION';
    default: return false;
  }
};

/**
 * Movement Allowance in ticks for the current phase (5.7–5.10, 7.0, 11.0b). Reserves move a quarter
 * in the Movement Phase; released Reserves move half in Reaction and full in Exploitation; Exploit and
 * DG units move half; Strat units double.
 */
export const movementAllowanceTicks = (state: GameState, piece: PieceState): number => {
  const printed = Number(stepOf(state, piece)?.movementPointTicks ?? 0);
  const released = usageOf(state, piece).reserveReleased;
  // 6.1h: reduced allowances keep their fractions.
  if (piece.mode === 'STRAT') return printed * 2;
  if (piece.mode === 'RESERVE') return state.sequence.phase === 'MOVEMENT' ? printed / 4 : 0;
  let allowance = printed;
  if (state.sequence.phase === 'REACTION' && released) allowance /= 2;
  if (piece.mode === 'DG') allowance /= 2;
  if (piece.mode === 'EXPLOITATION') allowance /= 2;
  // 4.7d, 14.9d: a unit carried by air this phase has half its MA in all; in the Reaction Phase that comes on top of the halving above.
  if (usageOf(state, piece).airCarried) allowance /= 2;
  return allowance;
};

const locationKey = (location: PieceState['location']): string => {
  switch (location.kind) {
    case 'ON_MAP': return `map:${location.hexId}`;
    case 'OFF_MAP_BOX':
    case 'HOLDING_AREA': return `${location.kind}:${location.boxId}`;
    case 'TURN_TRACK': return `track:${location.trackId}:${location.position}`;
    case 'POOL': return `pool:${location.poolId}`;
    case 'CONTAINER': return `container:${location.containerId}`;
    case 'ELIMINATED': return 'eliminated';
  }
};

/** A stack order above every other Piece at `location`, so no two Pieces share a slot. */
export const nextOrderAt = (pieces: readonly PieceState[], location: PieceState['location'], movingId: PieceId): number => {
  if (location.kind === 'ELIMINATED') return 0;
  const key = locationKey(location);
  return pieces.reduce((highest, piece) => piece.id !== movingId && locationKey(piece.location) === key
    ? Math.max(highest, piece.stackOrder) : highest, -1) + 1;
};

/** Give Pieces that share a location and stack order distinct orders (the first keeps its slot). */
export const dedupeStackOrders = <T extends { readonly pieces: readonly PieceState[] }>(pieceState: T): T => {
  const used = new Map<string, Set<number>>();
  let changed = false;
  const pieces = pieceState.pieces.map((piece) => {
    if (piece.location.kind === 'ELIMINATED') return piece;
    const key = locationKey(piece.location);
    const set = used.get(key) ?? new Set<number>();
    used.set(key, set);
    if (!set.has(piece.stackOrder)) { set.add(piece.stackOrder); return piece; }
    changed = true;
    const order = nextOrderAt(pieceState.pieces, piece.location, piece.id) + set.size;
    set.add(order);
    return { ...piece, stackOrder: order };
  });
  return changed ? { ...pieceState, pieces } : pieceState;
};
