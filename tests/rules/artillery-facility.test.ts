import { describe, expect, it } from 'vitest';
import {
  AIR_NEW_GAME_REQUEST, ALLIED, AXIS, airBaseLevel, applyRuleAction, atStep, buildGeneratedRuleState,
  generatedPieceId, hashGameState, createGameplayFixture, createUiController, gameplayRequestId, parseGameStateJson, portAt, portFeatureState, ruleEngine,
  serializeGameState, upsertMapFeatureState, withAircraftActive, withAirBaseLevel,
  type AirBarrageTarget, type GameAction, type GameActionBody, type GameState, type HexId, type PieceId, type RuleEvent,
} from '../../src/index.js';
import { previewBarrage } from '../../src/rules/combat/combat.js';
import { FACILITY_TABLE_COLUMNS, FACILITY_TABLE_ROWS, facilityColumnIndex, parseFacilityResult } from '../../src/rules/tables/ocs-4.3.js';
import { rollDie } from '../../src/rules/kernel/rng.js';

const id = (fragment: string) => generatedPieceId(fragment, AIR_NEW_GAME_REQUEST);
const U = { gun: id('allied:f1-artillery-1'), gun2: id('allied:independent-artillery-1'), dump: id('allied:independent-supply-1'), base: id('axis:air-base-1'), plane: id('axis:air-fighter-1'), plane2: id('axis:air-bomber-1'), ground: id('axis:f1-combat-1') };
const ORIGIN = '5,5' as HexId;
const TARGET = '6,5' as HexId;
const piece = (state: GameState, pieceId: PieceId) => state.pieceState.pieces.find(({ id: candidate }) => candidate === pieceId)!;
const changePiece = (state: GameState, pieceId: PieceId, change: (input: GameState['pieceState']['pieces'][number]) => GameState['pieceState']['pieces'][number]): GameState => ({
  ...state, pieceState: { ...state.pieceState, pieces: state.pieceState.pieces.map((entry) => entry.id === pieceId ? change(entry) : entry) },
});
const fixture = (strength = 12, mixed = true): GameState => {
  let state = atStep(buildGeneratedRuleState({
    [U.gun]: [ORIGIN, 'COMBAT', 'combat'], [U.gun2]: [ORIGIN, 'COMBAT', 'combat'], [U.dump]: [ORIGIN, null],
    [U.base]: [TARGET, null], [U.plane]: [TARGET, null], [U.plane2]: [TARGET, null],
    ...(mixed ? { [U.ground]: [TARGET, 'COMBAT', 'combat'] as const } : {}),
  }, {}, { request: AIR_NEW_GAME_REQUEST }), 'COMBAT', 'BARRAGE', ALLIED);
  const gunDefinitionId = piece(state, U.gun).definitionId;
  state = { ...state, scenario: { ...state.scenario, pieceCatalog: { ...state.scenario.pieceCatalog,
    definitions: state.scenario.pieceCatalog.definitions.map((definition) => definition.id !== gunDefinitionId ? definition : { ...definition,
      faces: definition.faces.map((face) => ({ ...face, steps: face.steps.map((step) => ({ ...step, ratings: step.ratings.map((rating) => rating.ratingDefinitionId === 'rating:barrage-strength' ? { ...rating, value: strength } : rating) })) })),
    }),
  } } };
  state = changePiece(state, U.dump, (dump) => ({ ...dump, resourceQuantity: 24 }));
  state = changePiece(state, U.base, (base) => withAirBaseLevel(base, 3));
  state = changePiece(state, U.plane2, (plane) => withAircraftActive(plane, false));
  return { ...state, rng: { state: 48, draws: 0 }, mapState: upsertMapFeatureState(state.mapState, portFeatureState(TARGET, 8, AXIS)) };
};
const declaration = (target: AirBarrageTarget): GameActionBody => ({ kind: 'DECLARE_BARRAGE', target, firerIds: [U.gun], targetPieceIds: target === 'COMBAT_UNITS' ? [U.ground] : [], targetHexId: TARGET });
const fire = (state: GameState, target: AirBarrageTarget) => applyRuleAction(state, ALLIED, declaration(target));
const codes = (result: ReturnType<typeof fire>) => result.ok ? [] : result.violations.map(({ code }) => code);
const settle = (input: GameState): { state: GameState; events: RuleEvent[] } => {
  let state = input;
  const events: RuleEvent[] = [];
  for (let guard = 0; state.pendingDecision && guard < 20; guard += 1) {
    const decision = state.pendingDecision;
    const next = applyRuleAction(state, decision.ownerId, { kind: 'RESPOND_DECISION', decisionId: decision.id, choiceId: decision.options[0]!.id });
    expect(next.ok).toBe(true);
    events.push(...next.events);
    state = next.state;
  }
  return { state, events };
};
const asAction = (state: GameState, target: AirBarrageTarget): GameAction => ({ actionId: 'action:facility-preview' as never, actorId: ALLIED, expectedRevision: state.revision, ...declaration(target) });

describe('artillery facility barrages (10.0c, 10.1b)', () => {
  it('offers empty enemy facilities and every explicit target in a mixed hex', () => {
    for (const mixed of [false, true]) {
      const state = fixture(12, mixed);
      const targets = ruleEngine.getActionCandidates(state, { actorId: ALLIED, kind: 'DECLARE_BARRAGE', pieceId: U.gun, budget: 50 }).actions
        .flatMap((action) => action.kind === 'DECLARE_BARRAGE' && action.targetHexId === TARGET ? [action.target] : []);
      expect(targets).toEqual(mixed ? ['COMBAT_UNITS', 'AIR_BASE', 'PORT'] : ['AIR_BASE', 'PORT']);
    }
  });

  it.each([1, 2, 3, 5, 11, 21, 41, 81])('charges the Facility Table column at strength %i without shifts or a spotter', (strength) => {
    const start = fixture(strength);
    const preview = previewBarrage(start, ALLIED, [U.gun], TARGET, 'PORT');
    const column = facilityColumnIndex(strength);
    expect(preview).toMatchObject({ strength, initialColumn: column, finalColumn: column, shifts: [], supplyTokens: FACILITY_TABLE_COLUMNS[column]!.supplyTokens });
    const fired = fire(start, 'PORT');
    expect(fired.ok, JSON.stringify(codes(fired))).toBe(true);
    expect(piece(start, U.dump).resourceQuantity! - piece(fired.state, U.dump).resourceQuantity!).toBe(preview.supplyTokens);
    const facts = ruleEngine.explain(start, asAction(start, 'PORT')).facts;
    expect(facts.find(({ key }) => key === 'barrage.table')?.value).toBe('Barrage vs Facility Table');
    expect(facts.find(({ key }) => key === 'barrage.dice')?.value).toBe('1d6');
  });

  it('damages only the selected port, caps hits at four, and reports one real die', () => {
    const start = fixture(81);
    const damaged = { ...start, mapState: upsertMapFeatureState(start.mapState, { ...portFeatureState(TARGET, 8, AXIS), damage: 3 }) };
    const fired = fire(damaged, 'PORT');
    expect(fired.ok).toBe(true);
    expect(portAt(fired.state, TARGET)?.damage).toBe(4);
    expect(piece(fired.state, U.ground)).toEqual(piece(start, U.ground));
    expect(piece(fired.state, U.base)).toEqual(piece(start, U.base));
    expect(piece(fired.state, U.plane)).toEqual(piece(start, U.plane));
    expect(fired.events.filter(({ kind }) => kind === 'FACILITY_DIE_ROLLED')).toMatchObject([{ value: 6, purpose: 'FACILITY' }]);
    expect(fired.events.some(({ kind }) => kind === 'DICE_ROLLED')).toBe(false);
    expect(fired.state.rng.draws - start.rng.draws).toBe(1);
    expect(fired.events.find(({ kind }) => kind === 'TRANSACTION_RESOLVED')).toMatchObject({ result: expect.stringContaining('die 6') });
  });

  it('ignores parenthesized and Trainbusting-only results against a port', () => {
    for (const strength of [1, 2]) {
      const start = fixture(strength);
      const fired = fire(start, 'PORT');
      expect(fired.ok).toBe(true);
      expect(portAt(fired.state, TARGET)?.damage).toBe(0);
      expect(piece(fired.state, U.plane)).toEqual(piece(start, U.plane));
      expect(fired.state.air.trainbusting).toEqual([]);
    }
  });

  it('reduces a numbered Air Base and checks every enemy plane independently, Active and Inactive', () => {
    const start = fixture(81);
    const die = rollDie(start.rng);
    const cell = parseFacilityResult(FACILITY_TABLE_ROWS[die.value]![facilityColumnIndex(81)]!);
    let rng = die.rng;
    const checks = [U.plane, U.plane2].sort().map((pieceId) => { const check = rollDie(rng); rng = check.rng; return { pieceId, value: check.value }; });
    const fired = fire(start, 'AIR_BASE');
    expect(fired.ok).toBe(true);
    expect(airBaseLevel(fired.state, piece(fired.state, U.base))).toBe(1);
    for (const { pieceId, value } of checks) {
      const before = piece(start, pieceId).remainingSteps!;
      expect(piece(fired.state, pieceId).remainingSteps).toBe(value >= cell.aircraftCheck! ? before - 1 : before);
    }
    expect(fired.events.filter((event) => event.kind === 'FACILITY_DIE_ROLLED' && event.purpose === 'AIRCRAFT_CHECK')).toMatchObject(checks);
    expect(fired.state.rng).toEqual(rng);
    expect(portAt(fired.state, TARGET)?.damage).toBe(0);
    expect(piece(fired.state, U.ground)).toEqual(piece(start, U.ground));
    const minimum = fire(changePiece(start, U.base, (base) => withAirBaseLevel(base, 1)), 'AIR_BASE');
    expect(airBaseLevel(minimum.state, piece(minimum.state, U.base))).toBe(1);
  });

  it('assigns aircraft checks in canonical piece order across save/load, including mixed-case IDs', () => {
    const initial = fixture(81);
    const state = { ...initial, pieceState: { ...initial.pieceState, pieces: initial.pieceState.pieces.map((plane) =>
      plane.id === U.plane ? { ...plane, id: 'piece:a' as PieceId }
        : plane.id === U.plane2 ? { ...plane, id: 'piece:Z' as PieceId } : plane) } };
    const snapshot = serializeGameState(state);
    expect(snapshot.ok).toBe(true);
    if (!snapshot.ok) return;
    const restored = parseGameStateJson(snapshot.value);
    expect(restored.ok).toBe(true);
    if (!restored.ok) return;
    const original = fire(state, 'AIR_BASE');
    const loaded = fire(restored.value, 'AIR_BASE');
    expect(original.ok && loaded.ok).toBe(true);
    expect(original.events.flatMap((event) => event.kind === 'FACILITY_DIE_ROLLED' && event.purpose === 'AIRCRAFT_CHECK' ? [event.pieceId] : []))
      .toEqual(['piece:Z', 'piece:a']);
    expect(serializeGameState(original.state)).toEqual(serializeGameState(loaded.state));
  });

  it.each(['AIR_BASE', 'PORT'] as const)('retains all artillery restrictions for %s', (target) => {
    const start = fixture();
    expect(codes(fire(atStep(start, 'MOVEMENT', 'BARRAGE', ALLIED), target))).toContain('INVALID_BARRAGE_PHASE');
    expect(codes(fire(atStep(start, 'REACTION', 'BARRAGE', ALLIED), target))).toContain('REACTION_REQUIRES_RELEASED_RESERVE');
    expect(codes(fire(atStep(start, 'EXPLOITATION', 'BARRAGE', ALLIED), target))).toContain('EXPLOITATION_REQUIRES_EXPLOIT_OR_RESERVE');
    for (const mode of ['RESERVE', 'STRAT'] as const) expect(codes(fire(changePiece(start, U.gun, (gun) => ({ ...gun, mode })), target))).toContain('ARTILLERY_MODE_CANNOT_BARRAGE');
    expect(codes(fire(changePiece(start, U.gun, (gun) => ({ ...gun, location: { kind: 'ON_MAP', hexId: '14,5' as HexId } })), target))).toContain('BARRAGE_OUT_OF_RANGE');
    expect(codes(fire(changePiece(start, U.dump, (dump) => ({ ...dump, resourceQuantity: 0 })), target))).toContain('BARRAGE_SUPPLY_UNAVAILABLE');
    const fired = fire(start, target);
    expect(fired.ok).toBe(true);
    for (const next of ['COMBAT_UNITS', 'AIR_BASE', 'PORT'] as const) expect(codes(fire(fired.state, next))).toEqual(expect.arrayContaining(['ARTILLERY_ALREADY_BARRAGED', 'HEX_ALREADY_BARRAGED']));
    expect(codes(applyRuleAction(start, ALLIED, { ...declaration(target), targetPieceIds: [U.ground] } as GameActionBody))).toContain('WHOLE_HEX_IS_TARGET');
  });

  it('keeps the legacy implicit combat target equivalent and refuses friendly or exhausted facilities', async () => {
    const state = fixture();
    const { target: _target, ...legacy } = declaration('COMBAT_UNITS') as Extract<GameActionBody, { kind: 'DECLARE_BARRAGE' }>;
    const old = applyRuleAction(state, ALLIED, legacy);
    const explicit = fire(state, 'COMBAT_UNITS');
    expect(old.ok && explicit.ok).toBe(true);
    expect(await hashGameState(settle(old.state).state)).toEqual(await hashGameState(settle(explicit.state).state));
    expect(codes(fire(changePiece(state, U.base, (base) => ({ ...base, ownerId: ALLIED })), 'AIR_BASE'))).toContain('NO_BARRAGE_TARGET');
    const friendlyPort = { ...state, mapState: upsertMapFeatureState(state.mapState, portFeatureState(TARGET, 8, ALLIED)) };
    expect(codes(fire(friendlyPort, 'PORT'))).toContain('NO_BARRAGE_TARGET');
    const full = { ...state, mapState: upsertMapFeatureState(state.mapState, { ...portFeatureState(TARGET, 8, AXIS), damage: 4 }) };
    expect(codes(fire(full, 'PORT'))).toContain('NO_BARRAGE_TARGET');
  });

  it('never reduces an Air Strip, while still checking its aircraft', () => {
    const start = fixture(81);
    const baseId = piece(start, U.base).definitionId;
    const strip: GameState = { ...start, scenario: { ...start.scenario, pieceCatalog: { ...start.scenario.pieceCatalog,
      definitions: start.scenario.pieceCatalog.definitions.map((definition) => definition.id === baseId ? { ...definition, facility: { ...definition.facility!, facilityTypeDefinitionId: 'facility:air-strip' as never } } : definition),
    } } };
    const fired = fire(strip, 'AIR_BASE');
    expect(fired.ok).toBe(true);
    expect(piece(fired.state, U.base)).toEqual(piece(strip, U.base));
    expect(fired.events.filter((event) => event.kind === 'FACILITY_DIE_ROLLED' && event.purpose === 'AIRCRAFT_CHECK')).toHaveLength(2);
  });

  it('operates the target draft and saves and replays the same generated facility attack', async () => {
    const start = fixture(12);
    const fixtureGame = await createGameplayFixture({ scenario: start.scenario, configuration: start.configuration });
    const snapshot = serializeGameState(start);
    const hash = await hashGameState(start);
    expect(snapshot.ok && hash.ok).toBe(true);
    if (!snapshot.ok || !hash.ok) return;
    const save = { ...fixtureGame.session.save(), initialSnapshot: snapshot.value, currentSnapshot: snapshot.value, initialStateHash: hash.value, finalStateHash: hash.value };
    const session = await fixtureGame.engine.loadSession(JSON.stringify(save));
    const controller = createUiController({ engine: fixtureGame.engine, session, scenario: start.scenario, bindings: save.bindings });
    controller.start();
    await controller.clickHex(TARGET);
    const first = controller.getSnapshot().draft!;
    expect(first.barrageTargets).toEqual(['COMBAT_UNITS', 'AIR_BASE', 'PORT']);
    controller.toggleParticipant(U.gun);
    const selection = controller.getSnapshot().draft!.selectedIds;
    controller.setBarrageTarget('PORT');
    expect(controller.getSnapshot().draft!.selectedIds).toEqual(selection);
    expect(controller.getSnapshot().draft!.action).toMatchObject({ kind: 'DECLARE_BARRAGE', target: 'PORT', targetPieceIds: [] });
    controller.toggleParticipant(U.gun);
    controller.setBarrageTarget('AIR_BASE');
    const action = controller.getSnapshot().draft!.action!;
    expect((await session.dispatch({ requestId: gameplayRequestId('facility-attack'), seatId: fixtureGame.seats[0], action })).status).toBe('ACCEPTED');
    const loaded = await fixtureGame.engine.loadSession(session.serializeSave());
    const replay = await fixtureGame.engine.loadReplay(JSON.stringify(session.exportReplay()), save.bindings);
    expect(loaded.getMetadata().stateHash).toBe(session.getMetadata().stateHash);
    expect(replay.getMetadata().stateHash).toBe(session.getMetadata().stateHash);
    expect(loaded.getHistory({ offset: 0, limit: 10, actionKind: null }).records[0]!.action).toMatchObject({ target: 'AIR_BASE' });
    const invalid = JSON.parse(session.serializeSave());
    invalid.acceptedActions[0].target = 'BUILDING';
    await expect(fixtureGame.engine.loadSession(JSON.stringify(invalid))).rejects.toThrow();
    controller.dispose();
    const legacySession = await fixtureGame.engine.loadSession(JSON.stringify(save));
    legacySession.start();
    const { target: _target, ...legacyAction } = asAction(start, 'COMBAT_UNITS') as Extract<GameAction, { kind: 'DECLARE_BARRAGE' }>;
    expect((await legacySession.dispatch({ requestId: gameplayRequestId('legacy-barrage'), seatId: fixtureGame.seats[0], action: legacyAction })).status).toBe('ACCEPTED');
    const legacyLoaded = await fixtureGame.engine.loadSession(legacySession.serializeSave());
    const legacyReplay = await fixtureGame.engine.loadReplay(JSON.stringify(legacySession.exportReplay()), save.bindings);
    expect(legacyLoaded.getMetadata().stateHash).toBe(legacySession.getMetadata().stateHash);
    expect(legacyReplay.getMetadata().stateHash).toBe(legacySession.getMetadata().stateHash);
    expect(legacyLoaded.getHistory({ offset: 0, limit: 1, actionKind: null }).records[0]!.action).not.toHaveProperty('target');
  });

  it('retains target and reservations across a pending save; cancellation restores usage and supply', () => {
    const start = fixture(81);
    const dump = piece(start, U.dump);
    const secondId = 'piece:facility-second-dump' as PieceId;
    const multiple = { ...start, pieceState: { ...start.pieceState, pieces: [...start.pieceState.pieces, { ...dump, id: secondId, stackOrder: 10 }] } };
    const oldPending = fire(multiple, 'COMBAT_UNITS');
    const oldSnapshot = serializeGameState(oldPending.state);
    expect(oldSnapshot.ok).toBe(true);
    if (!oldSnapshot.ok) return;
    const oldStored = JSON.parse(oldSnapshot.value);
    expect(oldStored.activeTransaction).not.toHaveProperty('barrageTarget');
    expect(oldStored.activeTransaction).not.toHaveProperty('facilityDie');
    const oldLoaded = parseGameStateJson(oldSnapshot.value);
    expect(oldLoaded.ok && oldLoaded.value.activeTransaction?.barrageTarget).toBe('COMBAT_UNITS');
    const fired = fire(multiple, 'AIR_BASE');
    expect(fired.ok).toBe(true);
    expect(fired.state.pendingDecision?.kind).toBe('SUPPLY_SOURCE');
    expect(fired.state.activeTransaction?.barrageTarget).toBe('AIR_BASE');
    const snapshot = serializeGameState(fired.state);
    expect(snapshot.ok).toBe(true);
    if (!snapshot.ok) return;
    const loaded = parseGameStateJson(snapshot.value);
    expect(loaded.ok).toBe(true);
    if (!loaded.ok) return;
    expect(loaded.value.activeTransaction?.barrageTarget).toBe('AIR_BASE');
    const original = settle(fired.state);
    const restored = settle(loaded.value);
    expect(JSON.stringify(serializeGameState(restored.state)) === JSON.stringify(serializeGameState(original.state))).toBe(true);
    const cancelled = applyRuleAction(loaded.value, ALLIED, { kind: 'CANCEL_TRANSACTION', transactionId: loaded.value.activeTransaction!.id });
    expect(cancelled.ok).toBe(true);
    expect(cancelled.state.ledger.barragedHexIds).not.toContain(TARGET);
    expect(cancelled.state.usage.find(({ pieceId }) => pieceId === U.gun)?.barraged ?? false).toBe(false);
    expect(piece(cancelled.state, U.dump).resourceQuantity).toBe(dump.resourceQuantity);
    expect(fire(cancelled.state, 'PORT').ok).toBe(true);
    const corrupt = JSON.parse(snapshot.value);
    corrupt.activeTransaction.barrageTarget = 'BUILDING';
    expect(parseGameStateJson(JSON.stringify(corrupt)).ok).toBe(false);
    corrupt.activeTransaction.barrageTarget = 'AIR_BASE';
    corrupt.activeTransaction.facilityDie = 7;
    expect(parseGameStateJson(JSON.stringify(corrupt)).ok).toBe(false);
  });
});
