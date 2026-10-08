import { describe, expect, it } from 'vitest';
import {
  AIR_MISSION_LABELS,
  AIR_NEW_GAME_REQUEST,
  ALLIED,
  AXIS,
  DEFAULT_NEW_GAME_REQUEST,
  MISSION_LOSS_TABLE,
  airBaseLevel,
  airCombatResult,
  applyRuleAction,
  atStep,
  buildGeneratedRuleState,
  flakModifiers,
  generateRandomOob,
  generatedPieceId,
  isActiveAircraft,
  isAirStrip,
  isEngineerCapable,
  largestFirstPayments,
  parseFacilityResult,
  parseGameStateJson,
  prepareNewGame,
  previewAirBarrage,
  queryMovementPath,
  serializeGeneratedOob,
  serializeGameState,
  settleDecisions,
  withAircraftActive,
  withAirBaseLevel,
  ruleEngine,
  type GameState,
  type HexId,
  type NewGameRequest,
  type PieceId,
  type RuleEvent,
  type TransitionResult,
} from '../../src/index.js';

const STANDARD_AIR: NewGameRequest = { ...AIR_NEW_GAME_REQUEST, oob: { ...AIR_NEW_GAME_REQUEST.oob, scale: 'STANDARD' } };
const ids = (request: NewGameRequest) => {
  const id = (fragment: string) => generatedPieceId(fragment, request);
  return {
    aF1: id('allied:air-fighter-1'), aF2: id('allied:air-fighter-2'), aB1: id('allied:air-bomber-1'), aBase: id('allied:air-base-1'),
    aSup: id('allied:independent-supply-1'), aLeg: id('allied:f2-combat-1'), aHq: id('allied:independent-hq-1'),
    xF1: id('axis:air-fighter-1'), xF2: id('axis:air-fighter-2'), xB1: id('axis:air-bomber-1'), xBase: id('axis:air-base-1'),
    xTrk: id('axis:f1-combat-1'), xHq: id('axis:independent-hq-1'), xSup: id('axis:independent-supply-1'),
  };
};
const U = ids(AIR_NEW_GAME_REQUEST);

/** Hex in the map's fourth row at printed column `column` (0-based). */
const hex = (column: number, row = 4): HexId => `${column - Math.floor(row / 2)},${row}` as HexId;
const ALLIED_BASE = hex(1);
const AXIS_BASE = hex(16);
const TARGET = hex(8);

const piece = (state: GameState, id: string) => state.pieceState.pieces.find((candidate) => candidate.id === id)!;
const codes = (result: TransitionResult): readonly string[] => result.ok ? [] : result.violations.map(({ code }) => code);
const ok = (result: TransitionResult): GameState => {
  expect(result.ok, result.ok ? '' : result.violations.map(({ code, message }) => `${code}: ${message}`).join('; ')).toBe(true);
  return result.state;
};
const withPiece = (state: GameState, id: PieceId, patch: (current: GameState['pieceState']['pieces'][number]) => GameState['pieceState']['pieces'][number]): GameState => ({
  ...state, pieceState: { ...state.pieceState, pieces: state.pieceState.pieces.map((entry) => entry.id === id ? patch(entry) : entry) },
});
const inactive = (state: GameState, ...pieceIds: PieceId[]): GameState =>
  pieceIds.reduce((current, id) => withPiece(current, id, (entry) => withAircraftActive(entry, false)), state);

/** Both Air Bases with their aircraft, one Axis unit at the target, the Allied dump at its base. */
const airState = (extra: Record<string, readonly [string, null | 'COMBAT' | 'MOVE', string?]> = {}, terrain: Record<string, string> = {}): GameState => buildGeneratedRuleState({
  [U.aBase]: [ALLIED_BASE, null], [U.aF1]: [ALLIED_BASE, null], [U.aF2]: [ALLIED_BASE, null], [U.aB1]: [ALLIED_BASE, null],
  [U.aSup]: [ALLIED_BASE, null],
  [U.xBase]: [AXIS_BASE, null], [U.xF1]: [AXIS_BASE, null], [U.xF2]: [AXIS_BASE, null], [U.xB1]: [AXIS_BASE, null],
  [U.xTrk]: [TARGET, 'COMBAT', 'combat'],
  ...extra,
}, terrain, { request: AIR_NEW_GAME_REQUEST });

const mission = (state: GameState, actor: typeof ALLIED, body: { mission: keyof typeof AIR_MISSION_LABELS; aircraftIds: PieceId[]; targetHexId: HexId; target?: 'COMBAT_UNITS' | 'AIR_BASE' | null }) =>
  applyRuleAction(state, actor, { kind: 'DECLARE_AIR_MISSION', target: null, ...body });

const allEvents: RuleEvent[] = [];
const settle = (state: GameState, pick?: (decision: NonNullable<GameState['pendingDecision']>) => string) =>
  settleDecisions(state, pick ?? ((decision) => decision.kind === 'INTERCEPTION' ? 'decline' : decision.options[0]!.id));

describe('generated air forces (A7)', () => {
  it('adds aircraft and an Air Base per side only when requested, leaving ground forces byte-identical', () => {
    const base = { seed: 7, scale: 'COMPACT' as const, divisionsPerSide: 2, armoredDivisionsPerSide: 0 };
    const ground = generateRandomOob(base);
    const explicitNone = generateRandomOob({ ...base, air: 'NONE' });
    const air = generateRandomOob({ ...base, air: 'STANDARD' });
    expect(ground.ok && explicitNone.ok && air.ok).toBe(true);
    if (!ground.ok || !explicitNone.ok || !air.ok) return;
    expect(serializeGeneratedOob(explicitNone.value)).toEqual(serializeGeneratedOob(ground.value));
    for (const side of ['ALLIED', 'AXIS'] as const) {
      // Two Fighters and a Tactical Bomber at start, and one Fighter reinforcement (13.6), built in with air forces.
      expect(air.value.metrics.rolesBySide[side].AIRCRAFT).toBe(4);
      expect(air.value.metrics.rolesBySide[side].AIR_BASE).toBe(1);
      expect(air.value.metrics.rolesBySide[side].COMBAT).toBe(ground.value.metrics.rolesBySide[side].COMBAT);
    }
    expect(air.value.metrics.balanceRatio).toBeGreaterThanOrEqual(0.9);
  });

  it('deploys every aircraft Active at a friendly Air Base in its own rear (IV-E, 14.2a)', () => {
    for (const request of [AIR_NEW_GAME_REQUEST, STANDARD_AIR]) {
      const prepared = prepareNewGame(request);
      expect(prepared.ok).toBe(true);
      if (!prepared.ok) return;
      const pieces = prepared.value.scenario.initialPieceState.pieces;
      const definitions = new Map(prepared.value.scenario.pieceCatalog.definitions.map((definition) => [definition.id, definition]));
      const bases = pieces.filter((entry) => definitions.get(entry.definitionId)?.family === 'FACILITY');
      // Reinforcing aircraft (13.6) wait in the reinforcement Box until their Game Turn.
      const planes = pieces.filter((entry) => definitions.get(entry.definitionId)?.family === 'AIR' && entry.location.kind !== 'OFF_MAP_BOX');
      expect(bases.length).toBe(request === STANDARD_AIR ? 4 : 2);
      for (const plane of planes) {
        expect(plane.statuses).toEqual([]);
        expect(bases.some((base) => base.ownerId === plane.ownerId && base.location.kind === 'ON_MAP' && plane.location.kind === 'ON_MAP' && base.location.hexId === plane.location.hexId)).toBe(true);
      }
    }
  });
});

describe('Air Combat, Flak and Mission Loss tables (14.3e, 14.4e/f)', () => {
  it('reads the Air Combat Table and the rulebook example (9 + 2 - 4 = 7: both abort)', () => {
    expect(airCombatResult(9 + 2 - 4)).toBe('BOTH_ABORT');
    expect(airCombatResult(6)).toBe('ATTACKER_ABORTS');
    expect(airCombatResult(8)).toBe('DEFENDER_ABORTS');
    expect(MISSION_LOSS_TABLE[4]).toEqual(['#1', '#2', '#3', '#4', 'W', 'S']);
    expect(MISSION_LOSS_TABLE[3]).toEqual(['#1', '#1', '#2', '#2', '#3', '#3']);
  });

  it('applies the Flak modifiers: three aircraft, HQ, Air Base Level and Patrol Zone (14.11 example: +2)', () => {
    const state = airState({ [U.xHq]: [AXIS_BASE, 'MOVE'] });
    const modifiers = flakModifiers(state, [U.aF1, U.aF2, U.aB1], 'BARRAGE', AXIS_BASE, ALLIED);
    expect(modifiers.map(({ reason }) => reason)).toEqual([
      'Three or more aircraft', 'HQ in the target hex', 'Air Base Level 2', 'Enemy Patrol Zone, mission has a Fighter',
    ]);
    expect(modifiers.reduce((sum, { value }) => sum + value, 0)).toBe(5);
    // Outside any Patrol Zone and without fighters: no PZ modifier.
    const quiet = inactive(state, U.xF1, U.xF2);
    expect(flakModifiers(quiet, [U.aB1], 'TRAINBUSTING', TARGET, ALLIED)).toEqual([]);
    expect(flakModifiers(state, [U.aB1], 'TRAINBUSTING', TARGET, ALLIED).map(({ value }) => value)).toEqual([2, 1]);
  });

  it('parses the Barrage vs Facility Table results (10.0c)', () => {
    expect(parseFacilityResult('2*(3)')).toEqual({ text: '2*(3)', levels: 2, trainbusting: true, aircraftCheck: 3 });
    expect(parseFacilityResult('(5)')).toEqual({ text: '(5)', levels: 0, trainbusting: false, aircraftCheck: 5 });
    expect(parseFacilityResult('-')).toEqual({ text: '-', levels: 0, trainbusting: false, aircraftCheck: null });
  });
});

describe('Air barrage shifts (14.7, rulebook Stuka example)', () => {
  it('unspotted 1 RE in close terrain from 17-24 resolves on the 2 column; short range shifts right', () => {
    const state = airState({}, { [TARGET]: 'terrain:woods' });
    // P-38 (10) + A-20 (10) = 20: the 17-24 column, like the example's Stuka.
    const far = previewAirBarrage(state, ALLIED, [{ pieceId: U.aF1, baseHexId: hex(-4) }, { pieceId: U.aB1, baseHexId: hex(-4) }], TARGET);
    expect(far.strength).toBe(20);
    expect(far.shifts.map(({ reason, shift }) => `${reason} ${shift}`)).toEqual(['Density -1', 'Terrain -1', 'No spotter -3']);
    expect(far.finalColumn).toBe(1);
    const near = previewAirBarrage(state, ALLIED, [{ pieceId: U.aF1, baseHexId: ALLIED_BASE }, { pieceId: U.aB1, baseHexId: ALLIED_BASE }], TARGET);
    expect(near.shifts.at(-1)).toEqual({ reason: 'Short range', shift: 1 });
    expect(near.finalColumn).toBe(2);
  });
});

describe('Aircraft Refit (15.1)', () => {
  it('refits up to twice the Level for 1T drawn to the base, once per phase', () => {
    let state = atStep(inactive(airState(), U.aF1, U.aF2, U.aB1), 'AIRCRAFT_REFIT', 'NONE', ALLIED);
    const before = piece(state, U.aSup).resourceQuantity!;
    state = ok(applyRuleAction(state, ALLIED, { kind: 'REFIT_AIRCRAFT', baseId: U.aBase, aircraftIds: [U.aF1, U.aB1], sourcePieceId: U.aSup }));
    expect(isActiveAircraft(piece(state, U.aF1))).toBe(true);
    expect(isActiveAircraft(piece(state, U.aF2))).toBe(false);
    expect(piece(state, U.aSup).resourceQuantity).toBe(before - 1);
    expect(codes(applyRuleAction(state, ALLIED, { kind: 'REFIT_AIRCRAFT', baseId: U.aBase, aircraftIds: [U.aF2], sourcePieceId: U.aSup }))).toContain('BASE_ALREADY_REFIT');
  });

  it('cannot refit in an un-negated enemy ZOC; a friendly combat unit in the hex negates it (4.5b)', () => {
    const threatened = { [U.xTrk]: [hex(2), 'COMBAT', 'combat'] as const };
    const state = atStep(inactive(airState(threatened), U.aF1), 'AIRCRAFT_REFIT', 'NONE', ALLIED);
    expect(codes(applyRuleAction(state, ALLIED, { kind: 'REFIT_AIRCRAFT', baseId: U.aBase, aircraftIds: [U.aF1], sourcePieceId: U.aSup }))).toContain('REFIT_IN_ENEMY_ZOC');
    const negated = atStep(inactive(airState({ ...threatened, [U.aLeg]: [ALLIED_BASE, 'COMBAT', 'combat'] }), U.aF1), 'AIRCRAFT_REFIT', 'NONE', ALLIED);
    ok(applyRuleAction(negated, ALLIED, { kind: 'REFIT_AIRCRAFT', baseId: U.aBase, aircraftIds: [U.aF1], sourcePieceId: U.aSup }));
  });
});

describe('Air missions (14.2-14.8)', () => {
  it('flies an air barrage: interception offered in the Patrol Zone, Flak, result, return Inactive', () => {
    let state = atStep(airState(), 'MOVEMENT', 'BARRAGE', ALLIED);
    expect(codes(mission(atStep(state, 'MOVEMENT', 'MOVEMENT', ALLIED), ALLIED, { mission: 'BARRAGE', aircraftIds: [U.aB1], targetHexId: TARGET, target: 'COMBAT_UNITS' }))).toContain('INVALID_AIR_SEGMENT');
    const declared = mission(state, ALLIED, { mission: 'BARRAGE', aircraftIds: [U.aF1, U.aB1], targetHexId: TARGET, target: 'COMBAT_UNITS' });
    state = ok(declared);
    // The target is 8 hexes from the Axis base with Active Fighters: the Axis player may intercept.
    expect(state.pendingDecision?.kind).toBe('INTERCEPTION');
    expect(state.pendingDecision?.ownerId).toBe(AXIS);
    const settled = settle(state);
    state = settled.state;
    expect(state.activeTransaction).toBeNull();
    expect(state.ledger.barragedHexIds).toContain(TARGET);
    for (const id of [U.aF1, U.aB1]) {
      const plane = piece(state, id);
      if (plane.location.kind === 'ON_MAP') {
        expect(plane.location.hexId).toBe(ALLIED_BASE);
        expect(isActiveAircraft(plane)).toBe(false);
      }
    }
    expect(codes(mission(state, ALLIED, { mission: 'BARRAGE', aircraftIds: [U.aF2], targetHexId: TARGET, target: 'COMBAT_UNITS' }))).toContain('HEX_ALREADY_BARRAGED');
  });

  it('resolves an Interception as Air Combat before Flak (14.5)', () => {
    let state = ok(mission(atStep(airState(), 'MOVEMENT', 'BARRAGE', ALLIED), ALLIED, { mission: 'BARRAGE', aircraftIds: [U.aF1, U.aB1], targetHexId: TARGET, target: 'COMBAT_UNITS' }));
    const choices: string[] = [];
    state = settle(state, (decision) => {
      choices.push(decision.kind);
      return decision.kind === 'INTERCEPTION' ? decision.options.find(({ id }) => id.startsWith('intercept:'))!.id : decision.options[0]!.id;
    }).state;
    expect(choices[0]).toBe('INTERCEPTION');
    expect(state.activeTransaction).toBeNull();
    // The interceptor ends at its own base, Active if it won.
    for (const id of [U.xF1, U.xF2]) expect(piece(state, id).location).toEqual({ kind: 'ON_MAP', hexId: AXIS_BASE });
  });

  it('sweeps an enemy Air Base with a Fighter: Air Combat rounds, aborted aircraft Inactive (14.3, 14.6)', () => {
    let state = atStep(airState(), 'MOVEMENT', 'MOVEMENT', ALLIED);
    expect(codes(mission(state, ALLIED, { mission: 'FIGHTER_SWEEP', aircraftIds: [U.aF1], targetHexId: TARGET }))).toContain('NO_ENEMY_AIRCRAFT');
    const result = mission(state, ALLIED, { mission: 'FIGHTER_SWEEP', aircraftIds: [U.aF1], targetHexId: AXIS_BASE });
    state = ok(result);
    const events: string[] = result.ok ? result.events.map(({ kind }) => kind) : [];
    let guard = 0;
    while (state.pendingDecision && guard++ < 40) {
      const decision = state.pendingDecision;
      const next = applyRuleAction(state, decision.ownerId, { kind: 'RESPOND_DECISION', decisionId: decision.id, choiceId: decision.kind === 'AIR_ABORT' ? 'fight' : decision.options[0]!.id });
      state = ok(next);
      if (next.ok) events.push(...next.events.map(({ kind }) => kind));
    }
    expect(events).toContain('AIR_COMBAT_ROUND');
    expect(state.activeTransaction).toBeNull();
    const fighter = piece(state, U.aF1);
    if (fighter.location.kind === 'ON_MAP') {
      expect(fighter.location.hexId).toBe(ALLIED_BASE);
      expect(isActiveAircraft(fighter)).toBe(false);
    }
    // The Ju 88's parenthesized rating means it is never picked by the attacker and only meets a Fighter if chosen.
    expect(state.air.missionFlownIds).toContain(U.aF1);
  });

  it('places a Trainbusting marker that costs enemy movement +1 MP and clears at the enemy Clean Up (14.8)', () => {
    let state = atStep(airState({ [U.xTrk]: [hex(9), 'MOVE', 'move'] }), 'MOVEMENT', 'MOVEMENT', AXIS);
    const plain = queryMovementPath(state, AXIS, U.xTrk, [hex(9), hex(8)]).value!.totalTicks;
    const marked: GameState = { ...state, air: { ...state.air, trainbusting: [{ hexId: hex(8), ownerId: ALLIED }] } };
    expect(queryMovementPath(marked, AXIS, U.xTrk, [hex(9), hex(8)]).value!.totalTicks).toBe(plain + 4);
    // Adjacent hexes are in the zone for Truck and Track movement.
    const adjacent: GameState = { ...state, air: { ...state.air, trainbusting: [{ hexId: hex(7), ownerId: ALLIED }] } };
    expect(queryMovementPath(adjacent, AXIS, U.xTrk, [hex(9), hex(8)]).value!.totalTicks).toBe(plain + 4);
    // A friendly marker has no effect.
    const own: GameState = { ...state, air: { ...state.air, trainbusting: [{ hexId: hex(8), ownerId: AXIS }] } };
    expect(queryMovementPath(own, AXIS, U.xTrk, [hex(9), hex(8)]).value!.totalTicks).toBe(plain);
    // Removed in the next Clean Up of the marker owner's enemy.
    state = atStep(marked, 'CLEAN_UP', 'NONE', ALLIED);
    const alliedCleanup = ok(applyRuleAction(state, ALLIED, { kind: 'ADVANCE_SEQUENCE' }));
    expect(alliedCleanup.air.trainbusting).toHaveLength(1);
    const axisCleanup = ok(applyRuleAction(atStep(marked, 'CLEAN_UP', 'NONE', AXIS), AXIS, { kind: 'ADVANCE_SEQUENCE' }));
    expect(axisCleanup.air.trainbusting).toHaveLength(0);
  });

  it('flies a Trainbusting mission to any hex in range (14.8a)', () => {
    let state = ok(mission(atStep(airState(), 'MOVEMENT', 'BARRAGE', ALLIED), ALLIED, { mission: 'TRAINBUSTING', aircraftIds: [U.aF1, U.aF2, U.aB1], targetHexId: hex(6) }));
    state = settle(state).state;
    expect(state.activeTransaction).toBeNull();
    expect(state.ledger.barragedHexIds).toContain(hex(6));
    expect(state.air.trainbusting.every(({ ownerId, hexId }) => ownerId === ALLIED && hexId === hex(6))).toBe(true);
  });

  it('barrages an Air Base on the Facility Table: Levels never drop below 1 (10.0c, 15.0c)', () => {
    let state = ok(mission(atStep(airState(), 'MOVEMENT', 'BARRAGE', ALLIED), ALLIED, { mission: 'BARRAGE', aircraftIds: [U.aF1, U.aF2, U.aB1], targetHexId: AXIS_BASE, target: 'AIR_BASE' }));
    state = settle(state).state;
    expect(airBaseLevel(state, piece(state, U.xBase))).toBeGreaterThanOrEqual(1);
    expect(airBaseLevel(state, piece(state, U.xBase))).toBeLessThanOrEqual(2);
  });

  it('rejects Hip Shoots by air forces the game rules do not list (14.7d B)', () => {
    const state = atStep(airState({ [U.aLeg]: [hex(7), 'COMBAT', 'combat'] }), 'MOVEMENT', 'MOVEMENT', ALLIED);
    expect(codes(mission(state, ALLIED, { mission: 'HIP_SHOOT', aircraftIds: [U.aF1], targetHexId: TARGET, target: 'COMBAT_UNITS' }))).toContain('HIP_SHOOT_NOT_ALLOWED');
  });

  it('allows one mission per phase and only Active aircraft (14.1a, 14.2e)', () => {
    const state = atStep(inactive(airState(), U.aF2), 'MOVEMENT', 'BARRAGE', ALLIED);
    expect(codes(mission(state, ALLIED, { mission: 'BARRAGE', aircraftIds: [U.aF2], targetHexId: TARGET, target: 'COMBAT_UNITS' }))).toContain('AIRCRAFT_INACTIVE');
    const flown: GameState = { ...state, air: { ...state.air, missionFlownIds: [U.aF1] } };
    expect(codes(mission(flown, ALLIED, { mission: 'BARRAGE', aircraftIds: [U.aF1], targetHexId: TARGET, target: 'COMBAT_UNITS' }))).toContain('AIRCRAFT_ALREADY_FLEW');
    expect(codes(mission(atStep(state, 'COMBAT', 'BARRAGE', ALLIED), ALLIED, { mission: 'BARRAGE', aircraftIds: [U.aF1], targetHexId: TARGET, target: 'COMBAT_UNITS' }))).toContain('INVALID_AIR_PHASE');
  });
});

describe('Air Bases (9.14f, 13.9, 14.11, 15.4)', () => {
  const S = ids(STANDARD_AIR);
  const second = hex(1, 8);
  const standardState = (extra: Record<string, readonly [string, null | 'COMBAT' | 'MOVE', string?]> = {}) => buildGeneratedRuleState({
    [S.aBase]: [ALLIED_BASE, null], [generatedPieceId('allied:air-base-2', STANDARD_AIR)]: [second, null],
    [S.aF1]: [ALLIED_BASE, null], [S.aB1]: [ALLIED_BASE, null],
    [S.xBase]: [AXIS_BASE, null], [S.xTrk]: [hex(2), 'MOVE', 'move'],
    ...extra,
  }, {}, { request: STANDARD_AIR });

  it('transfers between bases: a Fighter within range stays Active, a bomber goes Inactive (14.11)', () => {
    let state = atStep(standardState(), 'MOVEMENT', 'MOVEMENT', ALLIED);
    state = settle(ok(mission(state, ALLIED, { mission: 'BASE_TRANSFER', aircraftIds: [S.aF1, S.aB1], targetHexId: second }))).state;
    expect(piece(state, S.aF1).location).toEqual({ kind: 'ON_MAP', hexId: second });
    expect(isActiveAircraft(piece(state, S.aF1))).toBe(true);
    expect(isActiveAircraft(piece(state, S.aB1))).toBe(false);
    expect(codes(mission(state, ALLIED, { mission: 'BASE_TRANSFER', aircraftIds: [S.aF1], targetHexId: ALLIED_BASE }))).toContain('AIRCRAFT_ALREADY_FLEW');
  });

  it('offers the base the aircraft took off from first and names it when it chooses where to return', () => {
    // The target is next to the first base, so that base is the nearer one, but the bomber took off from the second.
    let state = atStep(standardState({ [S.aB1]: [second, null], [S.aF1]: [second, null] }), 'MOVEMENT', 'BARRAGE', ALLIED);
    state = ok(mission(state, ALLIED, { mission: 'BARRAGE', aircraftIds: [S.aB1], targetHexId: hex(2), target: 'COMBAT_UNITS' }));
    let guard = 0;
    while (state.pendingDecision && state.pendingDecision.kind !== 'AIR_RETURN' && guard++ < 20) {
      const decision = state.pendingDecision;
      state = ok(applyRuleAction(state, decision.ownerId, { kind: 'RESPOND_DECISION', decisionId: decision.id, choiceId: decision.kind === 'INTERCEPTION' ? 'decline' : decision.options[0]!.id }));
    }
    const decision = state.pendingDecision!;
    expect(decision.kind).toBe('AIR_RETURN');
    expect(decision.options.map(({ hexId }) => hexId)).toEqual([second, ALLIED_BASE]);
    expect(decision.options[0]!.label).toMatch(/^Original Air Base at /u);
    expect(decision.options[1]!.label).toMatch(/^Air Base at /u);
    expect(decision.prompt).toContain(`It took off from ${second}.`);
  });

  it('captures an Air Base: aircraft roll and displace Inactive to another base or are lost (9.14f)', () => {
    let state = atStep(standardState(), 'MOVEMENT', 'MOVEMENT', AXIS);
    state = ok(applyRuleAction(state, AXIS, { kind: 'MOVE_PIECE', pieceId: S.xTrk, path: [hex(2), ALLIED_BASE] }));
    state = settle(state).state;
    expect(piece(state, S.aBase).ownerId).toBe(AXIS);
    for (const id of [S.aF1, S.aB1]) {
      const plane = piece(state, id);
      if (plane.location.kind === 'ON_MAP') {
        expect(plane.location.hexId).toBe(second);
        expect(isActiveAircraft(plane)).toBe(false);
      }
    }
  });

  it('reduces a friendly Air Base with one RE in Combat Mode that does not move (15.4)', () => {
    const level3 = withPiece(atStep(standardState({ [S.aLeg]: [ALLIED_BASE, 'COMBAT', 'combat'] }), 'MOVEMENT', 'MOVEMENT', ALLIED), S.aBase,
      (entry) => ({ ...entry, statuses: [{ statusDefinitionId: 'status:air-base-level' as never, value: { kind: 'INTEGER', value: 2 } }] }));
    const reduced = ok(applyRuleAction(level3, ALLIED, { kind: 'REDUCE_AIR_BASE', baseId: S.aBase, pieceIds: [S.aLeg] }));
    expect(airBaseLevel(reduced, piece(reduced, S.aBase))).toBe(1);
    expect(codes(applyRuleAction(reduced, ALLIED, { kind: 'REDUCE_AIR_BASE', baseId: S.aBase, pieceIds: [S.aLeg] }))).toEqual(expect.arrayContaining(['AIR_BASE_MINIMUM_LEVEL', 'BASE_ALREADY_REDUCED']));
    expect(codes(applyRuleAction(reduced, ALLIED, { kind: 'MOVE_PIECE', pieceId: S.aLeg, path: [ALLIED_BASE, hex(2)] })).length).toBeGreaterThan(0);
  });

  it('combines two reduced aircraft of the same type and values (13.9-4)', () => {
    let state = atStep(airState(), 'MOVEMENT', 'MOVEMENT', ALLIED);
    state = withPiece(withPiece(state, U.aF1, (entry) => ({ ...entry, remainingSteps: 1 })), U.aF2, (entry) => ({ ...entry, remainingSteps: 1 }));
    const same = piece(state, U.aF1).definitionId !== piece(state, U.aF2).definitionId;
    expect(same).toBe(true);
    state = ok(applyRuleAction(state, ALLIED, { kind: 'COMBINE_AIRCRAFT', aircraftIds: [U.aF1, U.aF2] }));
    expect(piece(state, U.aF1).remainingSteps).toBe(2);
    expect(piece(state, U.aF2).location).toEqual({ kind: 'ELIMINATED' });
  });
});

describe('Air Base construction (13.8d, 15.2, 15.3)', () => {
  const SITE = hex(3);
  // The Allied HQ stands two hexes from the site in Combat Mode; the Allied dump sits at its Air Base next to it.
  const buildState = (mode: 'COMBAT' | 'MOVE' = 'COMBAT') => atStep(airState({ [U.aHq]: [hex(2), mode, mode === 'COMBAT' ? 'combat' : 'move'] }), 'MOVEMENT', 'MOVEMENT', ALLIED);
  const build = (state: GameState, facility: 'AIR_STRIP' | 'AIR_BASE', cost: number, hexId: HexId = SITE, engineerId: PieceId = U.aHq) =>
    applyRuleAction(state, ALLIED, { kind: 'BUILD_AIR_BASE', engineerId, hexId, facility, payments: largestFirstPayments(state, ALLIED, hexId, cost) ?? [] });
  const baseAt = (state: GameState, hexId: HexId) => state.pieceState.pieces.find((entry) => entry.location.kind === 'ON_MAP' && entry.location.hexId === hexId && /air-built|air-base/u.test(String(entry.id)) && entry.ownerId === ALLIED);

  it('lets an HQ in Combat Mode build an Air Strip for 1T, and then it cannot move', () => {
    const start = buildState();
    expect(isEngineerCapable(start, piece(start, U.aHq))).toBe(true);
    const tokensBefore = start.pieceState.pieces.filter(({ definitionId }) => String(definitionId).includes('supply')).reduce((sum, entry) => sum + (entry.ownerId === ALLIED ? entry.resourceQuantity ?? 0 : 0), 0);
    const state = ok(build(start, 'AIR_STRIP', 1));
    const strip = baseAt(state, SITE)!;
    expect(isAirStrip(state, strip)).toBe(true);
    expect(airBaseLevel(state, strip)).toBe(0);
    expect(state.air.builtHexIds).toEqual([SITE]);
    expect(state.air.builderIds).toEqual([U.aHq]);
    const after = state.pieceState.pieces.filter(({ definitionId }) => String(definitionId).includes('supply')).reduce((sum, entry) => sum + (entry.ownerId === ALLIED ? entry.resourceQuantity ?? 0 : 0), 0);
    expect(tokensBefore - after).toBe(1);
    expect(codes(applyRuleAction(state, ALLIED, { kind: 'MOVE_PIECE', pieceId: U.aHq, path: [hex(2), hex(1)] }))).toContain('ENGINEER_BUILT');
    // One hex, one task per phase (13.8d).
    expect(codes(build(state, 'AIR_STRIP', 1, hex(4)))).toContain('ENGINEER_ALREADY_BUILT');
  });

  it('builds a Level-1 Air Base for 1 SP, improves it one Level per turn up to 3 (15.3)', () => {
    // Three Levels cost 3 SP: give the dump 12T and more.
    let state = ok(build(withPiece(buildState(), U.aSup, (entry) => ({ ...entry, resourceQuantity: 40 })), 'AIR_BASE', 4));
    expect(airBaseLevel(state, baseAt(state, SITE)!)).toBe(1);
    // A second engineer or the same phase cannot raise it again.
    expect(codes(build(state, 'AIR_BASE', 4))).toEqual(expect.arrayContaining(['LEVEL_ONE_PER_TURN']));
    for (const expected of [2, 3]) {
      state = { ...state, air: { ...state.air, builtHexIds: [], builderIds: [] }, usage: [] };
      state = ok(build(state, 'AIR_BASE', 4));
      expect(airBaseLevel(state, baseAt(state, SITE)!)).toBe(expected);
    }
    state = { ...state, air: { ...state.air, builtHexIds: [], builderIds: [] }, usage: [] };
    expect(codes(build(state, 'AIR_BASE', 4))).toContain('AIR_BASE_MAXIMUM_LEVEL');
  });

  it('upgrades an Air Strip to a Level-1 Air Base for 3T and keeps one base per hex (15.2A, 15.0a)', () => {
    let state = ok(build(buildState(), 'AIR_STRIP', 1));
    const stripId = baseAt(state, SITE)!.id;
    state = { ...state, air: { ...state.air, builtHexIds: [], builderIds: [] }, usage: [] };
    expect(codes(build(state, 'AIR_STRIP', 1))).toContain('ALREADY_AIR_STRIP');
    state = ok(build(state, 'AIR_BASE', 3));
    const base = baseAt(state, SITE)!;
    expect(base.id).toBe(stripId);
    expect(isAirStrip(state, base)).toBe(false);
    expect(airBaseLevel(state, base)).toBe(1);
  });

  it('refuses the wrong cost, a unit that is not Engineer-Capable, a site beyond 2 hexes, and other phases', () => {
    const start = buildState();
    expect(codes(applyRuleAction(start, ALLIED, { kind: 'BUILD_AIR_BASE', engineerId: U.aHq, hexId: SITE, facility: 'AIR_BASE', payments: largestFirstPayments(start, ALLIED, SITE, 3) ?? [] }))).toContain('CONSTRUCTION_COST');
    expect(codes(build(buildState('MOVE'), 'AIR_STRIP', 1))).toContain('NOT_ENGINEER_CAPABLE');
    expect(codes(build(start, 'AIR_STRIP', 1, hex(8)))).toContain('CONSTRUCTION_OUT_OF_RANGE');
    expect(codes(build(atStep(start, 'MOVEMENT', 'BARRAGE', ALLIED), 'AIR_STRIP', 1))).toContain('INVALID_CONSTRUCTION_PHASE');
    expect(codes(build(start, 'AIR_STRIP', 1, AXIS_BASE))).toEqual(expect.arrayContaining(['CONSTRUCTION_OUT_OF_RANGE']));
  });

  it('offers builds as legal candidates and lets an HQ reduce an Air Base without a garrison (13.8d, 15.4)', () => {
    const start = buildState();
    const offered = ruleEngine.getActionCandidates(start, { actorId: ALLIED, kind: 'BUILD_AIR_BASE', pieceId: U.aHq, budget: 50 });
    expect(offered.actions.length).toBeGreaterThan(0);
    for (const action of offered.actions) expect(ruleEngine.validateAction(start, action).allowed).toBe(true);
    // Raise the Allied base next to the HQ to Level 2, then reduce it with the HQ alone.
    const level2 = withPiece(start, U.aBase, (entry) => withAirBaseLevel(entry, 2));
    const reduced = ok(applyRuleAction(level2, ALLIED, { kind: 'REDUCE_AIR_BASE', baseId: U.aBase, pieceIds: [], engineerId: U.aHq }));
    expect(airBaseLevel(reduced, piece(reduced, U.aBase))).toBe(1);
    expect(reduced.air.builderIds).toContain(U.aHq);
  });
});

describe('air state persistence', () => {
  it('round-trips an air mission waiting on an Interception decision', () => {
    const state = ok(mission(atStep(airState(), 'MOVEMENT', 'BARRAGE', ALLIED), ALLIED, { mission: 'BARRAGE', aircraftIds: [U.aF1, U.aB1], targetHexId: TARGET, target: 'COMBAT_UNITS' }));
    const serialized = serializeGameState(state);
    expect(serialized.ok).toBe(true);
    if (!serialized.ok) return;
    const parsed = parseGameStateJson(serialized.value);
    expect(parsed.ok).toBe(true);
    if (!parsed.ok) return;
    const again = serializeGameState(parsed.value);
    expect(again.ok && again.value).toBe(serialized.value);
  });

  it('keeps ground-only games unchanged: the default request has no air units', () => {
    const prepared = prepareNewGame(DEFAULT_NEW_GAME_REQUEST);
    expect(prepared.ok && prepared.value.scenario.pieceCatalog.definitions.some(({ family, facility }) => family === 'AIR'
      // Hedgehogs (16.0) are ground facilities every game has; no Air Base or Air Strip is generated.
      || (family === 'FACILITY' && facility?.facilityTypeDefinitionId !== 'facility:hedgehog'))).toBe(false);
    void allEvents;
  });
});
