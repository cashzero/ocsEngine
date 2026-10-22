import { describe, expect, it } from 'vitest';
import {
  AIR_NEW_GAME_REQUEST, ALLIED, AXIS, atStep, buildGeneratedRuleState,
  createBotActionAccess, createBotRng, createGameplayFixture, createHeuristicPolicy, forecastFacilityBarrage,
  generatedPieceId, gameplayRequestId, hashGameState, portAt, portFeatureState, ruleEngine,
  serializeGameState, upsertMapFeatureState, withAircraftActive, withAirBaseLevel,
  type BotDecisionContext, type GameState, type HexId, type PieceId, type RuleFact,
} from '../../src/index.js';
import { rationPlan } from '../../src/rules/supply/ration-budget.js';
import { withUsage, usageOf } from '../../src/rules/pieces.js';

const id = (fragment: string) => generatedPieceId(fragment, AIR_NEW_GAME_REQUEST);
const U = { gun: id('allied:f1-artillery-1'), dump: id('allied:independent-supply-1'), base: id('axis:air-base-1'),
  plane: id('axis:air-fighter-1'), hidden: id('axis:air-bomber-1'), ground: id('axis:f1-combat-1'), spotter: id('allied:f1-combat-1') };
const ORIGIN = '5,5' as HexId, TARGET = '6,5' as HexId;
const changePiece = (state: GameState, pieceId: PieceId, change: (piece: GameState['pieceState']['pieces'][number]) => GameState['pieceState']['pieces'][number]): GameState => ({
  ...state, pieceState: { ...state.pieceState, pieces: state.pieceState.pieces.map(piece => piece.id === pieceId ? change(piece) : piece) },
});
const fixture = ({ strength = 12, port = false, base = false, plane = false, ground = false, spotter = false, tokens = 24, hits = 2 } = {}): GameState => {
  let state = atStep(buildGeneratedRuleState({
    [U.gun]: [ORIGIN, 'COMBAT', 'combat'], [U.dump]: [ORIGIN, null],
    ...(base ? { [U.base]: [TARGET, null] as const } : {}), ...(plane ? { [U.plane]: [TARGET, null] as const } : {}),
    ...(ground ? { [U.ground]: [TARGET, 'COMBAT', 'combat'] as const } : {}),
    ...(spotter ? { [U.spotter]: ['5,6', 'COMBAT', 'combat'] as const } : {}),
  }, {}, { request: AIR_NEW_GAME_REQUEST, sources: [] }), 'COMBAT', 'BARRAGE', ALLIED);
  const gunDefinition = state.pieceState.pieces.find(piece => piece.id === U.gun)!.definitionId;
  state = { ...state, scenario: { ...state.scenario, pieceCatalog: { ...state.scenario.pieceCatalog,
    definitions: state.scenario.pieceCatalog.definitions.map(definition => definition.id !== gunDefinition ? definition : { ...definition,
      faces: definition.faces.map(face => ({ ...face, steps: face.steps.map(step => ({ ...step, ratings: step.ratings.map(rating => rating.ratingDefinitionId === 'rating:barrage-strength' ? { ...rating, value: strength } : rating) })) })),
    }),
  } } };
  if (port) state = { ...state, scenario: { ...state.scenario, sources: [{ id: 'source:facility-test-port' as never, hexId: TARGET,
    sideDefinitionId: state.scenario.players.find(player => player.id === AXIS)!.sideDefinitionId }] } };
  state = changePiece(state, U.dump, dump => ({ ...dump, resourceQuantity: tokens }));
  state = changePiece(state, U.base, piece => withAirBaseLevel(piece, 3));
  return { ...state, rng: { state: 48, draws: 0 }, mapState: port ? upsertMapFeatureState(state.mapState, { ...portFeatureState(TARGET, 8, AXIS), damage: hits }) : state.mapState };
};
const context = (state: GameState): BotDecisionContext => {
  const actorId = state.pendingDecision?.ownerId ?? state.sequence.actingPlayerId;
  return { seatId: 'seat:facility-ai' as BotDecisionContext['seatId'], playerId: actorId,
    rng: createBotRng(7, 'facility-ai', 0), memory: { stepKey: 'facility-ai', actions: 0, notes: new Map() },
    view: { projection: ruleEngine.projectForViewer(state, actorId), pendingDecision: state.pendingDecision } as BotDecisionContext['view'],
    actions: {
      families: () => ruleEngine.getActionFamilies(state, actorId).filter(f => f.enabled).map(f => f.kind),
      candidates: (kind, pieceId = null, budget = 400) => ruleEngine.getActionCandidates(state, { actorId, kind, pieceId, budget }).actions,
      movementRange: pieceId => ruleEngine.queryMovementRange(state, actorId, pieceId).value!,
      explain: action => ({ current: true, explanation: ruleEngine.explain(state, action) }),
      traceCoverage: (pieceId = null) => ruleEngine.queryTraceCoverage(state, actorId, pieceId).value!,
      feedCoverage: (pieceId = null) => ruleEngine.queryFeedCoverage(state, actorId, pieceId).value!,
      drawReach: hexId => new Set((ruleEngine.queryDrawReach(state, actorId, hexId).value ?? []).map(String)),
      attackStrength: (attackerIds, targetHexId) => ruleEngine.queryAttackStrength(state, actorId, attackerIds, targetHexId).value!,
      projectedReach: (pieceId, fromHexId) => ruleEngine.queryProjectedReach(state, actorId, pieceId, fromHexId).value!,
    },
  };
};
const choose = (state: GameState) => createHeuristicPolicy({ scenario: state.scenario, turnLimit: state.configuration.turnLimit }).decide(context(state))!;
const facts = (kind: 'PORT' | 'AIR_BASE', column: number, supply = 2): RuleFact[] => Object.entries({ 'barrage.target': kind, 'barrage.finalColumn': column, 'barrage.supplyTokens': supply })
  .map(([key, value]) => ({ key, value, visibility: 'PUBLIC', ownerId: null }));
const portAction = (state: GameState) => ruleEngine.getActionCandidates(state, { actorId: ALLIED, kind: 'DECLARE_BARRAGE', pieceId: U.gun, budget: 100 }).actions.find(action => action.kind === 'DECLARE_BARRAGE' && action.target === 'PORT')!;

describe('facility forecasts use the six printed one-die rows', () => {
  it('separates rounded port capacity from base levels and independently rolled aircraft checks', () => {
    const port = forecastFacilityBarrage(facts('PORT', 4), { kind: 'PORT', printedTokens: 8, hits: 0 })!;
    expect(port.expectedPortCapacityTokensLost).toBeCloseTo(1);
    expect(port.expectedBaseLevelsLost).toBe(0);
    expect(port.expectedAircraftSteps).toBe(0);
    const base = forecastFacilityBarrage(facts('AIR_BASE', 4), { kind: 'AIR_BASE', level: 3, strip: false, visibleAircraft: 1 })!;
    expect(base.expectedBaseLevelsLost).toBeCloseTo(0.5);
    expect(base.expectedAircraftSteps).toBeCloseTo(10 / 36);
    expect(base.expectedPortCapacityTokensLost).toBe(0);
    const weak = forecastFacilityBarrage(facts('AIR_BASE', 0), { kind: 'AIR_BASE', level: 3, strip: false, visibleAircraft: 1 })!;
    expect(weak.expectedBaseLevelsLost).toBe(0);
    expect(weak.expectedAircraftSteps).toBeCloseTo(1 / 36);
  });
  it('caps port hits at four, respects rounding, never reduces a strip or base below Level 1', () => {
    expect(forecastFacilityBarrage(facts('PORT', 7), { kind: 'PORT', printedTokens: 8, hits: 3 })!.expectedPortCapacityTokensLost).toBeCloseTo(1);
    expect(forecastFacilityBarrage(facts('PORT', 7), { kind: 'PORT', printedTokens: 8, hits: 4 })!.expectedPortCapacityTokensLost).toBe(0);
    expect(forecastFacilityBarrage(facts('PORT', 4), { kind: 'PORT', printedTokens: 1, hits: 0 })!.expectedPortCapacityTokensLost).toBe(0);
    for (const strip of [false, true]) expect(forecastFacilityBarrage(facts('AIR_BASE', 7), { kind: 'AIR_BASE', level: strip ? 0 : 1, strip, visibleAircraft: 0 })!.expectedBaseLevelsLost).toBe(0);
  });
});

describe('the heuristic selects useful public facility targets', () => {
  it('chooses a port and charges its actual supply cost in the decision score', () => {
    const state = fixture({ port: true });
    const chosen = choose(state);
    expect(chosen.action).toMatchObject({ kind: 'DECLARE_BARRAGE', target: 'PORT', targetHexId: TARGET });
    expect(chosen.breakdown).toContainEqual({ term: 'port-capacity', value: 2.4 });
    expect(chosen.breakdown).toContainEqual({ term: 'supply', value: -2.4 });
    expect(ruleEngine.explain(state, chosen.action).allowed).toBe(true);
    const next = ruleEngine.applyAction(state, chosen.action);
    expect(next.ok).toBe(true);
    if (!next.ok) return;
    expect(next.state.pieceState.pieces.find(piece => piece.id === U.dump)!.resourceQuantity).toBe(22);
    expect(portAt(next.state, TARGET)?.damage).toBe(3);
    expect(ruleEngine.getActionCandidates(next.state, { actorId: ALLIED, kind: 'DECLARE_BARRAGE', pieceId: U.gun, budget: 100 }).actions).toEqual([]);
  });
  it('chooses a base using its public Level and visible plane, and an empty base when capacity loss justifies cost', () => {
    expect(choose(fixture({ base: true, plane: true })).action).toMatchObject({ kind: 'DECLARE_BARRAGE', target: 'AIR_BASE' });
    expect(choose(fixture({ strength: 21, base: true })).action).toMatchObject({ kind: 'DECLARE_BARRAGE', target: 'AIR_BASE' });
  });
  it('prefers a strong ground barrage when the expected combat effect exceeds facility damage', () => {
    const chosen = choose(changePiece(fixture({ strength: 81, ground: true, spotter: true, base: true, plane: true }), U.base, base => withAirBaseLevel(base, 1)));
    expect(chosen.action).toMatchObject({ kind: 'DECLARE_BARRAGE', target: 'COMBAT_UNITS' });
    expect(chosen.breakdown.some(({ term }) => term === 'steps')).toBe(true);
  });
  it('declines saturated ports, empty Level 1 bases, strips, weak shots, and unpaid shots', () => {
    const state = fixture({ port: true });
    const saturated = { ...state, mapState: upsertMapFeatureState(state.mapState, { ...portFeatureState(TARGET, 8, AXIS), damage: 4 }) };
    const small = { ...state, mapState: upsertMapFeatureState(state.mapState, portFeatureState(TARGET, 1, AXIS)) };
    const level1 = changePiece(fixture({ strength: 81, base: true }), U.base, base => withAirBaseLevel(base, 1));
    const baseDefinition = level1.pieceState.pieces.find(piece => piece.id === U.base)!.definitionId;
    const strip: GameState = { ...level1, scenario: { ...level1.scenario, pieceCatalog: { ...level1.scenario.pieceCatalog,
      definitions: level1.scenario.pieceCatalog.definitions.map(definition => definition.id !== baseDefinition || !definition.facility ? definition : { ...definition, facility: { ...definition.facility, facilityTypeDefinitionId: 'facility:air-strip' as never } }),
    } } };
    for (const input of [saturated, small, level1, strip, fixture({ port: true, hits: 0 }), fixture({ strength: 1, base: true, plane: true }), fixture({ port: true, tokens: 1 })]) {
      expect(choose(input).action.kind).toBe('ADVANCE_SEQUENCE');
    }
  });
  it('counts Supply Source loss only for a declared source and declines capacity damage after the final enemy turn', () => {
    const port = fixture({ port: true });
    const shippingOnly: GameState = { ...port, scenario: { ...port.scenario, sources: [] } };
    expect(choose(shippingOnly).action.kind).toBe('ADVANCE_SEQUENCE');
    for (const input of [port, fixture({ strength: 81, base: true })]) {
      const final: GameState = { ...input, sequence: { ...input.sequence, gameTurn: input.configuration.turnLimit, playerTurnIndex: 1 } };
      expect(choose(final).action.kind).toBe('ADVANCE_SEQUENCE');
    }
  });
  it('does not turn hidden counters into aircraft or change its score with hidden aircraft state', () => {
    const baseline = fixture({ base: true, plane: true });
    const hidden = changePiece(baseline, U.hidden, plane => withAircraftActive({ ...plane, location: { kind: 'ON_MAP', hexId: TARGET }, stackOrder: 0 }, false));
    const changed = changePiece(hidden, U.hidden, plane => ({ ...plane, remainingSteps: 1 }));
    expect(choose(hidden)).toEqual(choose(baseline));
    expect(choose(changed)).toEqual(choose(baseline));
    const empty1 = changePiece(fixture({ base: true }), U.base, base => withAirBaseLevel(base, 1));
    const hiddenOnly = changePiece(empty1, U.hidden, plane => withAircraftActive({ ...plane, location: { kind: 'ON_MAP', hexId: TARGET }, stackOrder: 0 }, false));
    expect(ruleEngine.projectForViewer(hiddenOnly, ALLIED).stacks.find(stack => stack.location.kind === 'ON_MAP' && stack.location.hexId === TARGET)?.hiddenCount).toBeGreaterThan(0);
    expect(choose(hiddenOnly).action.kind).toBe('ADVANCE_SEQUENCE');
  });
});

const reaction = (state: GameState): GameState => {
  const next = atStep(state, 'REACTION', 'BARRAGE', ALLIED, AXIS);
  const gun = next.pieceState.pieces.find(piece => piece.id === U.gun)!;
  return { ...next, usage: withUsage(next, { ...usageOf(next, gun), reserveReleased: true }) };
};

describe('facility payment preserves actual shared rations', () => {
  it('declines a legal barrage before the actor\'s coming Supply when it consumes the only joint ration', () => {
    const state = reaction(fixture({ port: true, tokens: 2 }));
    expect(rationPlan(state, ALLIED).demands.map(({ id }) => id)).toContain(U.gun);
    const action = portAction(state);
    expect(action).toBeDefined();
    const before = JSON.stringify(state);
    const explanation = ruleEngine.explain(state, action);
    expect(JSON.stringify(state)).toBe(before);
    expect(explanation.allowed).toBe(true);
    expect(explanation.facts).toContainEqual({ key: 'supply.rationCommitmentsPreserved', value: false, visibility: 'OWNER_ONLY', ownerId: ALLIED });
    expect(choose(state).action.kind).toBe('ADVANCE_SEQUENCE');
  });
  it('chooses a safe alternative dump instead of consuming a distant garrison\'s only shared stock', () => {
    let state = fixture({ port: true, tokens: 3 });
    const firstDump = state.pieceState.pieces.find(piece => piece.id === U.dump)!;
    const otherId = 'piece:zz-facility-surplus' as PieceId;
    state = changePiece(state, U.dump, dump => ({ ...dump, location: { kind: 'ON_MAP', hexId: '4,5' as HexId } }));
    state = { ...state, pieceState: { ...state.pieceState, pieces: [...state.pieceState.pieces,
      { ...firstDump, id: otherId, location: { kind: 'ON_MAP', hexId: '8,5' as HexId } }],
    } };
    const garrisonIds = ['allied:f1-combat-1', 'allied:f1-combat-2', 'allied:f2-combat-1'].map(id);
    for (const pieceId of garrisonIds) state = changePiece(state, pieceId, piece => ({ ...piece, location: { kind: 'ON_MAP', hexId: '0,5' as HexId }, stackOrder: garrisonIds.indexOf(pieceId), mode: 'COMBAT' }));
    state = reaction(state);
    const original = rationPlan(state, ALLIED).demands.map(({ id }) => id).sort();
    expect(original).toContain(U.gun);
    expect(original).toContain(garrisonIds[0]);
    expect(original.length).toBeGreaterThanOrEqual(3);
    const sources = rationPlan(state, ALLIED).demands.find(demand => demand.id === garrisonIds[0])!.sources;
    expect(sources).toContain(U.dump);
    expect(sources).not.toContain(otherId);
    const chosen = choose(state);
    expect(chosen.action).toMatchObject({ kind: 'DECLARE_BARRAGE', target: 'PORT' });
    const declared = ruleEngine.applyAction(state, chosen.action);
    if (!declared.ok) throw new Error(`Payment-route declaration rejected: ${JSON.stringify(declared.violations)}`);
    expect(declared.state.pendingDecision?.kind).toBe('SUPPLY_SOURCE');
    const payment = choose(declared.state);
    expect(payment.action).toMatchObject({ kind: 'RESPOND_DECISION', choiceId: `pay:${otherId}:2` });
    const unsafe = context(declared.state).actions.candidates('RESPOND_DECISION').find(action => action.kind === 'RESPOND_DECISION' && action.choiceId === `pay:${U.dump}:2`)!;
    expect(ruleEngine.explain(declared.state, unsafe).facts.find(({ key }) => key === 'supply.rationCommitmentsPreserved')?.value).toBe(false);
    const paid = ruleEngine.applyAction(declared.state, payment.action);
    if (!paid.ok) throw new Error('Safe alternate payment rejected');
    expect(rationPlan(paid.state, ALLIED).demands.map(({ id }) => id).sort()).toEqual(original);
    expect(paid.state.pieceState.pieces.find(piece => piece.id === U.dump)?.resourceQuantity).toBe(3);
    expect(paid.state.pieceState.pieces.find(piece => piece.id === otherId)?.resourceQuantity).toBe(1);
  });
  it('spends surplus before Supply, and does not charge a second current-turn ration in Combat or late Reaction', () => {
    const surplus = reaction(fixture({ port: true, tokens: 3 }));
    expect(choose(surplus).action).toMatchObject({ kind: 'DECLARE_BARRAGE', target: 'PORT' });
    const spent = ruleEngine.applyAction(surplus, choose(surplus).action);
    if (!spent.ok) throw new Error('Surplus barrage rejected');
    expect(rationPlan(spent.state, ALLIED).demands.map(({ id }) => id)).toContain(U.gun);
    for (const state of [fixture({ port: true, tokens: 2 }), { ...reaction(fixture({ port: true, tokens: 2 })), sequence: { ...surplus.sequence, playerTurnIndex: 1 as const } }]) {
      expect(ruleEngine.explain(state, portAction(state)).facts.find(({ key }) => key === 'supply.rationBudgetApplicable')?.value).toBe(false);
      expect(choose(state).action).toMatchObject({ target: 'PORT' });
    }
  });
});

describe('facility decisions through the real Gameplay session', () => {
  it.each(['PORT', 'AIR_BASE'] as const)('pays, resolves, saves, loads and replays its chosen %s attack', async target => {
    const original = fixture({ port: target === 'PORT', base: target === 'AIR_BASE', plane: target === 'AIR_BASE' });
    const dump = original.pieceState.pieces.find(piece => piece.id === U.dump)!;
    const state: GameState = { ...original, pieceState: { ...original.pieceState, pieces: [...original.pieceState.pieces,
      { ...dump, id: 'piece:zz-gameplay-surplus' as PieceId, stackOrder: 10 }],
    } };
    const game = await createGameplayFixture({ scenario: state.scenario, configuration: state.configuration });
    const snapshot = serializeGameState(state), hash = await hashGameState(state);
    if (!snapshot.ok || !hash.ok) throw new Error('Fixture serialization failed');
    const initial = { ...game.session.save(), initialSnapshot: snapshot.value, currentSnapshot: snapshot.value, initialStateHash: hash.value, finalStateHash: hash.value };
    const session = await game.engine.loadSession(JSON.stringify(initial));
    session.start();
    const policy = createHeuristicPolicy({ scenario: state.scenario, turnLimit: state.configuration.turnLimit });
    const first = policy.decide({ ...context(state), seatId: game.seats[0], view: session.getView(game.seats[0]), actions: createBotActionAccess(session, game.seats[0]) })!;
    expect(first.action).toMatchObject({ kind: 'DECLARE_BARRAGE', target });
    expect((await session.dispatch({ requestId: gameplayRequestId(`bot-${target}`), seatId: game.seats[0], action: first.action })).status).toBe('ACCEPTED');
    expect(session.getPendingDecision(game.seats[0])?.kind).toBe('SUPPLY_SOURCE');
    const pendingLoaded = await game.engine.loadSession(session.serializeSave());
    expect(pendingLoaded.getMetadata().stateHash).toBe(session.getMetadata().stateHash);
    for (let guard = 0; session.getPendingDecision(game.seats[0]) && guard < 20; guard += 1) {
      const view = session.getView(game.seats[0]);
      const chosen = policy.decide({ ...context(state), seatId: game.seats[0], view, actions: createBotActionAccess(session, game.seats[0]) })!;
      expect((await session.dispatch({ requestId: gameplayRequestId(`bot-${target}-pay-${guard}`), seatId: game.seats[0], action: chosen.action })).status).toBe('ACCEPTED');
    }
    expect(session.getView(game.seats[0]).projection?.combat).toBeNull();
    const loaded = await game.engine.loadSession(session.serializeSave());
    const replayed = await game.engine.loadReplay(JSON.stringify(session.exportReplay()), initial.bindings);
    expect(loaded.getMetadata().stateHash).toBe(session.getMetadata().stateHash);
    expect(replayed.getMetadata().stateHash).toBe(session.getMetadata().stateHash);
    const after = loaded.getView(game.seats[0]).projection!;
    expect(after.stacks.flatMap(stack => stack.pieces).find(piece => piece.id === U.dump)?.resourceQuantity).toBe(22);
    if (target === 'PORT') expect(after.ports?.find(port => port.hexId === TARGET)?.capacityTokens).toBe(3);
    else expect(after.stacks.flatMap(stack => stack.pieces).find(piece => piece.id === U.base)?.statusValues).toContainEqual({ statusDefinitionId: 'status:air-base-level', value: 2 });
  });
});
