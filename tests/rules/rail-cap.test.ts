import { describe, expect, it } from 'vitest';
import {
  ALLIED,
  AXIS,
  applyRuleAction,
  atStep,
  buildGeneratedRuleState,
  featuresAlong,
  generatedPieceId,
  onGameTurn,
  parseGameStateJson,
  queryRailMoveOptions,
  railCapRemainingQuarters,
  ruleEngine,
  serializeGameState,
  transportPointsOf,
  type GameActionBody,
  type GameState,
  type MapAdditions,
  type Placement,
} from '../../src/index.js';

/**
 * Rail Cap transport (13.3a-e, 4.7, 12.2a, 13.6b, 14.8c) and the front-line clause of railroad control (13.3h).
 * The rule fixture's Allied map-edge source is -3,6; a railroad runs east along row 6. Rail Cap is counted in quarters.
 */
const U = {
  alLeg: generatedPieceId('allied:f2-combat-1'), alTrk: generatedPieceId('allied:f1-combat-1'), alTrk2: generatedPieceId('allied:f1-combat-2'),
  alHq: generatedPieceId('allied:independent-hq-1'), alTruck: generatedPieceId('allied:independent-transport-1'),
  alDump: generatedPieceId('allied:independent-supply-1'),
  axTrk: generatedPieceId('axis:f1-combat-1'), axTrk2: generatedPieceId('axis:f1-combat-2'), axTruck: generatedPieceId('axis:independent-transport-1'),
};
const row = (from: number, to: number): string[] => Array.from({ length: to - from + 1 }, (_, index) => `${from + index},6`);
const VILLAGE = 'settlement:village';
const STATIONS: MapAdditions = {
  hexsides: featuresAlong(row(-3, 12)),
  features: { '1,6': [VILLAGE], '10,6': [VILLAGE] },
  control: { '1,6': ALLIED, '10,6': ALLIED },
};

const piece = (state: GameState, id: string) => state.pieceState.pieces.find((candidate) => candidate.id === id)!;
/** A quiet fixture skips ahead to the next First Player roll; the tests set their own step instead. */
const withRailCap = (state: GameState, allied = 3, axis = 3): GameState => ({
  ...state,
  pendingDecision: null,
  configuration: { ...state.configuration, railCapacity: [{ playerId: ALLIED, points: allied }, { playerId: AXIS, points: axis }] },
});
/** The generated fixture has the New Game's default Rail Cap; a game made before Rail Cap has none. */
const withoutRailCap = (state: GameState): GameState => {
  const { railCapacity: _cap, ...configuration } = state.configuration;
  return { ...state, pendingDecision: null, configuration };
};
const railState = (placement: Placement, additions: MapAdditions = STATIONS, points = 3): GameState =>
  atStep(withRailCap(buildGeneratedRuleState(placement, {}, additions), points), 'MOVEMENT', 'MOVEMENT', ALLIED);
const rail = (state: GameState, body: Partial<Extract<GameActionBody, { kind: 'RAIL_MOVE' }>>) => applyRuleAction(state, ALLIED, {
  kind: 'RAIL_MOVE', fromHexId: '1,6' as never, toHexId: '10,6' as never, unitIds: [], supply: [], ...body,
} as GameActionBody);
const codes = (result: ReturnType<typeof rail>): readonly string[] => result.ok ? [] : result.violations.map(({ code }) => code);
const dumpAt = (state: GameState, hexId: string) => state.pieceState.pieces.find((candidate) => candidate.ownerId === ALLIED
  && candidate.location.kind === 'ON_MAP' && candidate.location.hexId === hexId && candidate.resourceQuantity !== null && candidate.resourceQuantity > 0);
const SUPPLY = [{ sourcePieceId: U.alDump, tokens: 4 }];

describe('OCS 4.3 Rail Cap: SP by rail (13.3a, 13.3b, 12.2a)', () => {
  it('moves 1 SP between two detrainable stations for 1 point, and the SP cannot be loaded again this phase', () => {
    const start = railState({ [U.alDump]: ['1,6', null], [U.alTruck]: ['10,6', null] });
    expect(railCapRemainingQuarters(start, ALLIED)).toBe(12);
    const moved = rail(start, { supply: SUPPLY });
    expect(moved.ok).toBe(true);
    if (!moved.ok) return;
    expect(dumpAt(moved.state, '10,6')?.resourceQuantity).toBe(4);
    expect(dumpAt(moved.state, '1,6')).toBeUndefined();
    expect(railCapRemainingQuarters(moved.state, ALLIED)).toBe(8);
    expect(moved.events.find(({ kind }) => kind === 'RAIL_MOVED')).toMatchObject({ tokens: 4, quarters: 4 });
    // 12.2a: SP unloaded (detrained) this phase cannot be loaded on a truck in the same phase.
    const load = applyRuleAction(moved.state, ALLIED, { kind: 'LOAD_SUPPLY', truckId: U.alTruck, dumpId: dumpAt(moved.state, '10,6')!.id, tokens: 1 });
    expect(load.ok).toBe(false);
  });

  it('keeps SP a truck unloaded at the station unloadable when rail SP merge into its dump (12.2a)', () => {
    let state = railState({ [U.alDump]: ['1,6', null], [U.alTruck]: ['1,6', null], [U.alLeg]: ['10,6', null] });
    const ok = (result: ReturnType<typeof rail>): GameState => { expect(codes(result)).toEqual([]); return result.ok ? result.state : state; };
    state = ok(applyRuleAction(state, ALLIED, { kind: 'LOAD_SUPPLY', truckId: U.alTruck, dumpId: U.alDump, tokens: 1 }));
    const path = ruleEngine.queryMovementRange(state, ALLIED, U.alTruck).value!.find(({ hexId }) => hexId === '10,6')!.path;
    state = ok(applyRuleAction(state, ALLIED, { kind: 'MOVE_PIECE', pieceId: U.alTruck, path } as GameActionBody));
    state = ok(applyRuleAction(state, ALLIED, { kind: 'UNLOAD_SUPPLY', truckId: U.alTruck, tokens: 1 }));
    const left = piece(state, U.alDump).resourceQuantity!;
    // The rail load is the larger dump, so it keeps the Hex's SP and folds the truck's Token into itself.
    expect(left).toBeGreaterThan(1);
    state = ok(rail(state, { supply: [{ sourcePieceId: U.alDump, tokens: left }] }));
    const dump = dumpAt(state, '10,6')!;
    expect(dump.resourceQuantity).toBe(left + 1);
    // Every Token there arrived this phase, by truck or by rail; the truck itself has finished moving (6.1g), so read the count.
    expect(state.usage.find(({ pieceId }) => pieceId === dump.id)?.unloadedTokens).toBe(left + 1);
  });

  it('refuses a move the Rail Cap left cannot pay, and Rail Cap is only for the Movement Phase', () => {
    const poor = railState({ [U.alDump]: ['1,6', null] }, STATIONS, 0);
    expect(codes(rail(poor, { supply: SUPPLY }))).toContain('RAIL_CAP_EXCEEDED');
    const combat = atStep(railState({ [U.alDump]: ['1,6', null] }), 'COMBAT', 'COMBAT', ALLIED);
    expect(codes(rail(combat, { supply: SUPPLY }))).toContain('INVALID_RAIL_PHASE');
    const none = atStep(withoutRailCap(buildGeneratedRuleState({ [U.alDump]: ['1,6', null] }, {}, STATIONS)), 'MOVEMENT', 'MOVEMENT', ALLIED);
    expect(codes(rail(none, { supply: SUPPLY }))).toContain('NO_RAIL_CAPACITY');
  });

  it('cannot save Rail Cap for later: the next Movement Phase starts with the full amount (13.3b)', () => {
    const moved = rail(railState({ [U.alDump]: ['1,6', null] }), { supply: SUPPLY });
    expect(moved.ok).toBe(true);
    if (!moved.ok) return;
    expect(railCapRemainingQuarters(moved.state, ALLIED)).toBe(8);
    expect(railCapRemainingQuarters(onGameTurn(moved.state, moved.state.sequence.gameTurn + 1), ALLIED)).toBe(12);
  });

  it('halves the cost on an all multi-track path and doubles it through a Trainbusting Zone (13.3a, 14.8c)', () => {
    const trunk: MapAdditions = { ...STATIONS, hexsides: featuresAlong(row(-3, 12), 'edge:multi-track-rail') };
    const halved = rail(railState({ [U.alDump]: ['1,6', null] }, trunk), { supply: SUPPLY });
    expect(halved.ok && halved.events.find(({ kind }) => kind === 'RAIL_MOVED')).toMatchObject({ quarters: 2 });
    const zoned = railState({ [U.alDump]: ['1,6', null] });
    const busted: GameState = { ...zoned, air: { ...zoned.air, trainbusting: [{ hexId: '6,5' as never, ownerId: AXIS }] } };
    const doubled = rail(busted, { supply: SUPPLY });
    expect(doubled.ok && doubled.events.find(({ kind }) => kind === 'RAIL_MOVED')).toMatchObject({ quarters: 8 });
  });
});

describe('OCS 4.3 Rail Cap: units and trucks (13.3e, 4.7)', () => {
  it('carries a Move Mode unit at its RE, halved for a Leg unit with MA 1-6 (4.7b); it may not move again', () => {
    const start = railState({ [U.alLeg]: ['1,6', 'MOVE', 'move'], [U.alTrk]: ['1,6', 'MOVE', 'move'] });
    const leg = rail(start, { unitIds: [U.alLeg] });
    expect(leg.ok).toBe(true);
    if (!leg.ok) return;
    const full = piece(start, U.alLeg).remainingSteps!;
    expect(leg.events.find(({ kind }) => kind === 'RAIL_MOVED')).toMatchObject({ quarters: full * 2 });
    expect(piece(leg.state, U.alLeg).location).toEqual({ kind: 'ON_MAP', hexId: '10,6' });
    const again = applyRuleAction(leg.state, ALLIED, { kind: 'MOVE_PIECE', pieceId: U.alLeg, path: ['10,6', '11,6'] as never });
    expect(again.ok).toBe(false);
    const tracked = rail(start, { unitIds: [U.alTrk] });
    expect(tracked.ok && tracked.events.find(({ kind }) => kind === 'RAIL_MOVED')).toMatchObject({ quarters: 4 });
  });

  it('refuses units outside Move Mode, units that spent more than half their MA, and units not in the entraining Hex', () => {
    const combat = railState({ [U.alTrk]: ['1,6', 'COMBAT', 'combat'] });
    expect(codes(rail(combat, { unitIds: [U.alTrk] }))).toContain('UNIT_CANNOT_ENTRAIN');
    const start = railState({ [U.alTrk]: ['1,6', 'MOVE', 'move'] });
    const tired: GameState = { ...start, usage: [{ ...ruleEngineUsage(U.alTrk), movementSpentTicks: 32 }] };
    expect(codes(rail(tired, { unitIds: [U.alTrk] }))).toContain('UNIT_CANNOT_ENTRAIN');
    const rested: GameState = { ...start, usage: [{ ...ruleEngineUsage(U.alTrk), movementSpentTicks: 28 }] };
    expect(rail(rested, { unitIds: [U.alTrk] }).ok).toBe(true);
    const elsewhere = railState({ [U.alTrk]: ['2,6', 'MOVE', 'move'] });
    expect(codes(rail(elsewhere, { unitIds: [U.alTrk] }))).toContain('UNIT_NOT_AT_ENTRAINING_HEX');
  });

  it('ships a loaded truck for its points only, with its load (4.7c)', () => {
    const start = railState({ [U.alTruck]: ['1,6', null], [U.alDump]: ['1,6', null] }, STATIONS, 10);
    const loaded = applyRuleAction(start, ALLIED, { kind: 'LOAD_SUPPLY', truckId: U.alTruck, dumpId: U.alDump, tokens: 4 });
    expect(loaded.ok).toBe(true);
    if (!loaded.ok) return;
    const moved = rail(loaded.state, { unitIds: [U.alTruck] });
    expect(moved.ok).toBe(true);
    if (!moved.ok) return;
    expect(moved.events.find(({ kind }) => kind === 'RAIL_MOVED')).toMatchObject({ quarters: transportPointsOf(start, piece(start, U.alTruck)) * 4 });
    const cargo = moved.state.pieceState.relations.find((relation) => relation.kind === 'CARGO' && relation.containerId === U.alTruck);
    expect(cargo).toBeDefined();
    expect(piece(moved.state, U.alTruck).location).toEqual({ kind: 'ON_MAP', hexId: '10,6' });
  });
});

describe('OCS 4.3 Rail Cap: where cargo can go (13.3c, 13.3e, 13.3h)', () => {
  it('detrains only in a detrainable Hex: a village or city, or a rail Hex with a Combat Mode HQ', () => {
    const bare = rail(railState({ [U.alDump]: ['1,6', null] }), { supply: SUPPLY, toHexId: '8,6' as never });
    expect(codes(bare)).toContain('NOT_DETRAINABLE');
    const hq = railState({ [U.alDump]: ['1,6', null], [U.alHq]: ['8,6', 'COMBAT', 'combat'] }, { ...STATIONS, control: { ...STATIONS.control, '8,6': ALLIED } });
    expect(rail(hq, { supply: SUPPLY, toHexId: '8,6' as never }).ok).toBe(true);
  });

  it('never passes an enemy ZOC, even one a friendly unit negates for trace supply, nor an enemy combat unit', () => {
    const zoc = railState({ [U.alDump]: ['1,6', null], [U.axTrk]: ['5,5', 'COMBAT', 'combat'], [U.alTrk]: ['4,6', 'COMBAT', 'combat'], [U.alTrk2]: ['5,6', 'COMBAT', 'combat'] });
    expect(codes(rail(zoc, { supply: SUPPLY }))).toContain('NOT_DETRAINABLE');
    const blocked = railState({ [U.alDump]: ['1,6', null], [U.axTrk]: ['7,6', 'MOVE'] });
    expect(codes(rail(blocked, { supply: SUPPLY }))).toContain('NOT_DETRAINABLE');
  });

  it('passes only stations the player controls; plain rail Hexes need no control (13.3h)', () => {
    const enemyStation = railState({ [U.alDump]: ['1,6', null] }, { ...STATIONS, features: { ...STATIONS.features, '5,6': [VILLAGE] }, control: { ...STATIONS.control, '5,6': AXIS } });
    expect(codes(rail(enemyStation, { supply: SUPPLY }))).toContain('NOT_DETRAINABLE');
    const neutralTrack = railState({ [U.alDump]: ['1,6', null] }, { ...STATIONS, control: { ...STATIONS.control, '5,6': null, '6,6': AXIS } });
    expect(rail(neutralTrack, { supply: SUPPLY }).ok).toBe(true);
  });

  it('cannot detrain where an enemy non-combat unit stands, though the path may pass one (4.8 D)', () => {
    const passing = railState({ [U.alDump]: ['1,6', null], [U.axTruck]: ['6,6', null] });
    expect(rail(passing, { supply: SUPPLY }).ok).toBe(true);
    const occupied = railState({ [U.alDump]: ['1,6', null], [U.axTruck]: ['10,6', null] });
    expect(codes(rail(occupied, { supply: SUPPLY }))).toContain('NOT_DETRAINABLE');
  });

  it('lists the destinations, cargo and Rail Cap left for the UI and the bot', () => {
    const start = railState({ [U.alDump]: ['1,6', null], [U.alTrk]: ['1,6', 'MOVE', 'move'], [U.alLeg]: ['1,6', 'COMBAT', 'combat'] });
    const options = queryRailMoveOptions(start, ALLIED, '1,6' as never).value!;
    expect(options.entrainProblem).toBeNull();
    expect(options.remainingQuarters).toBe(12);
    expect(options.destinations.map(({ hexId }) => hexId)).toEqual(['10,6']);
    expect(options.dumps).toEqual([{ pieceId: U.alDump, loadableTokens: 4 }]);
    expect(options.units.find(({ pieceId }) => pieceId === U.alLeg)?.problem).toMatch(/Move Mode/u);
    const candidates = ruleEngine.getActionCandidates(start, { actorId: ALLIED, kind: 'RAIL_MOVE', pieceId: null, budget: 10 });
    expect(candidates.actions.length).toBeGreaterThan(0);
  });
});

describe('OCS 4.3 13.6b: arrivals entrain off-map at a rail entry Hex', () => {
  const arriving = (): GameState => {
    const base = withRailCap(buildGeneratedRuleState({ [U.alDump]: ['-3,6', null] }, {}, STATIONS));
    // A new 2 SP arrival waits in the reinforcement Box; an old 4T dump already lies at the entry Hex.
    const box = base.configuration.reinforcementBoxes.find(({ playerId }) => playerId === ALLIED)!.boxId;
    const dump = piece(base, U.alDump);
    const arrival = { ...dump, id: 'supply-arrival:test' as never, resourceQuantity: 8, location: { kind: 'OFF_MAP_BOX' as const, boxId: box }, stackOrder: 0 };
    return atStep(onGameTurn({ ...base, pieceState: { ...base.pieceState, pieces: [...base.pieceState.pieces, arrival] } }, 2), 'REINFORCEMENT', 'NONE', ALLIED);
  };

  it('lets the SP that arrived this turn entrain at a non-detrainable entry Hex, but not older SP there', () => {
    const placed = applyRuleAction(arriving(), ALLIED, { kind: 'PLACE_REINFORCEMENT', pieceId: 'supply-arrival:test' as never, hexId: '-3,6' as never });
    expect(placed.ok).toBe(true);
    if (!placed.ok) return;
    expect(placed.state.rail?.arrivals).toEqual([{ playerId: ALLIED, gameTurn: 2, hexId: '-3,6', tokens: 8, pieceIds: [] }]);
    const movement = atStep(placed.state, 'MOVEMENT', 'MOVEMENT', ALLIED);
    const dump = dumpAt(movement, '-3,6')!;
    expect(dump.resourceQuantity).toBe(12);
    const tooMuch = applyRuleAction(movement, ALLIED, { kind: 'RAIL_MOVE', fromHexId: '-3,6' as never, toHexId: '10,6' as never, unitIds: [], supply: [{ sourcePieceId: dump.id, tokens: 12 }] });
    expect(tooMuch.ok ? [] : tooMuch.violations.map(({ code }) => code)).toContain('NOT_AN_ARRIVAL');
    const moved = applyRuleAction(movement, ALLIED, { kind: 'RAIL_MOVE', fromHexId: '-3,6' as never, toHexId: '10,6' as never, unitIds: [], supply: [{ sourcePieceId: dump.id, tokens: 8 }] });
    expect(moved.ok).toBe(true);
    if (!moved.ok) return;
    expect(dumpAt(moved.state, '-3,6')?.resourceQuantity).toBe(4);
    expect(dumpAt(moved.state, '10,6')?.resourceQuantity).toBe(8);
    expect(moved.state.rail?.arrivals[0]?.tokens).toBe(0);
  });

  it('keeps the Rail Cap ledger and the arrivals through a save', () => {
    const placed = applyRuleAction(arriving(), ALLIED, { kind: 'PLACE_REINFORCEMENT', pieceId: 'supply-arrival:test' as never, hexId: '-3,6' as never });
    if (!placed.ok) throw new Error('placement failed');
    const movement = atStep(placed.state, 'MOVEMENT', 'MOVEMENT', ALLIED);
    const moved = applyRuleAction(movement, ALLIED, { kind: 'RAIL_MOVE', fromHexId: '-3,6' as never, toHexId: '10,6' as never, unitIds: [], supply: [{ sourcePieceId: dumpAt(movement, '-3,6')!.id, tokens: 4 }] });
    if (!moved.ok) throw new Error('rail move failed');
    const saved = serializeGameState(moved.state);
    expect(saved.ok).toBe(true);
    if (!saved.ok) return;
    const loaded = parseGameStateJson(saved.value);
    expect(loaded.ok).toBe(true);
    if (!loaded.ok) return;
    expect(loaded.value.rail).toEqual(moved.state.rail);
    expect(loaded.value.configuration.railCapacity).toEqual(moved.state.configuration.railCapacity);
    expect(railCapRemainingQuarters(loaded.value, ALLIED)).toBe(8);
    expect(serializeGameState(loaded.value)).toEqual(saved);
  });
});

describe('OCS 4.3 13.3h: stations clearly behind a front change hands', () => {
  // Only the Allied side has Supply Sources here, so the Axis side reaches only what its own units reach.
  const sources = (state: GameState) => state.scenario.sources.filter(({ sideDefinitionId }) => sideDefinitionId === 'side:allied');
  const frontState = (placement: Placement, extra: MapAdditions = {}, cap = true): GameState => {
    const plain = buildGeneratedRuleState({}, {}, STATIONS);
    const additions: MapAdditions = { ...STATIONS, features: { ...STATIONS.features, '6,6': [VILLAGE], ...extra.features }, control: { ...STATIONS.control, '6,6': AXIS, ...extra.control } };
    const built = buildGeneratedRuleState(placement, {}, { ...additions, sources: sources(plain) });
    // Setting up already ran a step or two under the fixture's Rail Cap; put the station back in Axis hands.
    const reset: GameState = { ...built, mapState: { ...built.mapState, hexControl: built.mapState.hexControl.map((entry) => entry.hexId === '6,6' ? { ...entry, controllerId: AXIS } : entry) } };
    return atStep(cap ? withRailCap(reset) : withoutRailCap(reset), 'MOVEMENT', 'MOVEMENT', ALLIED);
  };
  const advance = (state: GameState) => {
    const result = applyRuleAction(state, ALLIED, { kind: 'ADVANCE_SEQUENCE' });
    if (!result.ok) throw new Error(result.violations.map(({ code }) => code).join(', '));
    return result;
  };
  const controller = (state: GameState, hexId: string) => state.mapState.hexControl.find((entry) => entry.hexId === hexId)?.controllerId ?? null;

  it('gives a station the enemy can no longer reach to the side that does', () => {
    const result = advance(frontState({ [U.alTrk]: ['3,6', 'COMBAT', 'combat'] }));
    expect(controller(result.state, '6,6')).toBe(ALLIED);
    expect(result.events.some((event) => event.kind === 'RAIL_CONTROL_CHANGED' && event.hexId === '6,6')).toBe(true);
  });

  it('leaves a station both sides reach (doubt) and an objective station as they are', () => {
    const contested = advance(frontState({ [U.alTrk]: ['3,6', 'COMBAT', 'combat'], [U.axTrk]: ['9,2', 'COMBAT', 'combat'] }));
    expect(controller(contested.state, '6,6')).toBe(AXIS);
    const plain = frontState({ [U.alTrk]: ['3,6', 'COMBAT', 'combat'] });
    const objective: GameState = { ...plain, configuration: { ...plain.configuration, objectives: [{ hexId: '6,6' as never, points: 1 }] } };
    expect(controller(advance(objective).state, '6,6')).toBe(AXIS);
  });

  it('does not change games made without Rail Cap', () => {
    expect(controller(advance(frontState({ [U.alTrk]: ['3,6', 'COMBAT', 'combat'] }, {}, false)).state, '6,6')).toBe(AXIS);
  });
});

/** A fresh usage ledger entry for a unit that has not acted this phase. */
const ruleEngineUsage = (pieceId: string) => ({
  pieceId: pieceId as never, movementSpentTicks: 0, moved: false, phaseStartHexId: null, attacked: false, barraged: false,
  reserveReleased: false, negationLocked: false, supplyPaid: false, fueled: false, fuelThrowHexId: null,
  recovered: false, breakoutAttempted: false, blown: false, unloadedTokens: 0,
});
