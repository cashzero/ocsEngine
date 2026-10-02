import { describe, expect, it } from 'vitest';
import {
  ALLIED,
  AXIS,
  BTR_SUPPLY_TABLE,
  applyRuleAction,
  arrivingReinforcements,
  atStep,
  breakoutStatus,
  buildGeneratedRuleScenario,
  buildGeneratedRuleState,
  calculateCombatOdds,
  createGeneratedWeather,
  createInitialGameState,
  createRulesRng,
  declareTestCombat,
  dumpsReaching,
  friendlySourceHexes,
  generatedPieceId,
  hexDistanceBetween,
  internalStocksOf,
  overstackDecision,
  pieceHasTrace,
  previewBarrage,
  queryMovementPath,
  returnTurnOf,
  ruleEngine,
  settleDecisions,
  turnDate,
  withInternalStocks,
  type GameState,
  type HexId,
  type PieceId,
  type TransitionResult,
} from '../../src/index.js';

const U = {
  alTrk: generatedPieceId('allied:f1-combat-1'), alTrk2: generatedPieceId('allied:f1-combat-2'),
  alHq: generatedPieceId('allied:f1-command'), alArt: generatedPieceId('allied:f1-artillery-1'), alRecon: generatedPieceId('allied:f1-recon'),
  alLeg: generatedPieceId('allied:f2-combat-1'), alLeg2: generatedPieceId('allied:f2-combat-2'), alHq2: generatedPieceId('allied:f2-command'),
  alEng: generatedPieceId('allied:independent-engineer-1'), alTruck: generatedPieceId('allied:independent-transport-1'),
  alSup: generatedPieceId('allied:independent-supply-1'), alIndArt: generatedPieceId('allied:independent-artillery-1'),
  axTrk: generatedPieceId('axis:f1-combat-1'), axTrk2: generatedPieceId('axis:f1-combat-2'), axArt: generatedPieceId('axis:f1-artillery-1'),
  axTruck: generatedPieceId('axis:independent-transport-1'), axSup: generatedPieceId('axis:independent-supply-1'),
};
const codes = (result: TransitionResult): readonly string[] => result.ok ? [] : result.violations.map(({ code }) => code);
const piece = (state: GameState, id: string) => state.pieceState.pieces.find((candidate) => candidate.id === id)!;
const path = (...hexes: string[]) => hexes as HexId[];
const withPiece = (state: GameState, id: PieceId, patch: (current: GameState['pieceState']['pieces'][number]) => GameState['pieceState']['pieces'][number]): GameState => ({
  ...state, pieceState: { ...state.pieceState, pieces: state.pieceState.pieces.map((entry) => entry.id === id ? patch(entry) : entry) },
});
const ok = (result: TransitionResult): GameState => {
  expect(result.ok, result.ok ? '' : result.violations.map(({ code, message }) => `${code}: ${message}`).join('; ')).toBe(true);
  return result.state;
};
/** Every Hex of the default map set to one terrain. */
const allTerrain = (terrain: string): Record<string, string> => Object.fromEntries(
  buildGeneratedRuleScenario({}).scenario.mapDefinition.hexes.map(({ id }) => [id, terrain]));

describe('OCS 4.3 weather (17.0) with the BTR Weather Table', () => {
  it('dates each Game Turn on the BTR calendar', () => {
    const weather = createGeneratedWeather(10);
    expect(turnDate(weather, 1)).toEqual({ month: 10, day: 1 });
    expect(turnDate(weather, 9)).toEqual({ month: 10, day: 29 });
    expect(turnDate(weather, 10)).toEqual({ month: 11, day: 1 });
    // February has no 29th: its eighth turn is the 26th and the next is 1 March.
    expect(turnDate(createGeneratedWeather(2), 8)).toEqual({ month: 2, day: 26 });
    expect(turnDate(createGeneratedWeather(2), 9)).toEqual({ month: 3, day: 1 });
  });

  it('rolls the ground condition for the dated row (Snow is automatic in early January)', () => {
    const built = buildGeneratedRuleScenario({ [U.alLeg]: ['1,5', 'COMBAT', 'combat'] });
    const created = createInitialGameState(built.scenario, { ...built.configuration, weather: createGeneratedWeather(1) }, 7);
    expect(created.ok).toBe(true);
    if (!created.ok) return;
    expect(created.value.weather).toMatchObject({ groundCondition: 'SNOW', month: 1, day: 1, roll: null });
  });

  it('moves with the Mud column but keeps normal costs for supply paths (17.0c)', () => {
    const base = atStep(buildGeneratedRuleState({ [U.alEng]: ['1,5', 'MOVE', 'move'], [U.alLeg]: ['1,6', 'COMBAT', 'combat'], [U.alSup]: ['0,7', null] }), 'MOVEMENT', 'MOVEMENT', ALLIED);
    const mud: GameState = { ...base, weather: { ...base.weather, groundCondition: 'MUD' } };
    expect(queryMovementPath(base, ALLIED, U.alEng, path('1,5', '2,5')).value?.totalTicks).toBe(4);
    expect(queryMovementPath(mud, ALLIED, U.alEng, path('1,5', '2,5')).value?.totalTicks).toBe(32);
    expect(queryMovementPath(mud, ALLIED, U.alLeg, path('1,6', '2,6')).value?.totalTicks).toBe(8);
    const far = '4,5' as HexId;
    expect(dumpsReaching(mud, ALLIED, far).length).toBe(dumpsReaching(base, ALLIED, far).length);
    expect(dumpsReaching(mud, ALLIED, far).length).toBeGreaterThan(0);
  });
});

describe('OCS 4.3 fuel (12.5)', () => {
  const unfueled = (placement: Parameters<typeof buildGeneratedRuleState>[0]) =>
    atStep(buildGeneratedRuleState(placement, {}, { fueled: false }), 'MOVEMENT', 'MOVEMENT', ALLIED);

  it('stops Truck and Track units until fuel is paid, but not Leg units (12.5a)', () => {
    const state = unfueled({ [U.alTrk]: ['1,5', 'COMBAT', 'combat'], [U.alLeg]: ['1,7', 'COMBAT', 'combat'], [U.alSup]: ['1,6', null] });
    expect(codes(applyRuleAction(state, ALLIED, { kind: 'MOVE_PIECE', pieceId: U.alTrk, path: path('1,5', '2,5') }))).toContain('FUEL_REQUIRED');
    expect(applyRuleAction(state, ALLIED, { kind: 'MOVE_PIECE', pieceId: U.alLeg, path: path('1,7', '2,7') }).ok).toBe(true);
  });

  it('fuels one unit for one phase for 1T (12.5c C)', () => {
    const state = unfueled({ [U.alTrk]: ['1,5', 'COMBAT', 'combat'], [U.alSup]: ['1,6', null] });
    const paid = ok(applyRuleAction(state, ALLIED, { kind: 'PAY_FUEL', method: 'SINGLE_UNIT', pieceId: U.alTrk, sourcePieceId: U.alSup }));
    expect(piece(paid, U.alSup).resourceQuantity).toBe(3);
    expect(applyRuleAction(paid, ALLIED, { kind: 'MOVE_PIECE', pieceId: U.alTrk, path: path('1,5', '2,5') }).ok).toBe(true);
    // The next phase starts with a fresh usage ledger: the unit needs fuel again.
    expect(codes(applyRuleAction({ ...paid, usage: [] }, ALLIED, { kind: 'MOVE_PIECE', pieceId: U.alTrk, path: path('1,5', '2,5') }))).toContain('FUEL_REQUIRED');
  });

  it('fuels a whole formation for 1 SP until Clean Up (12.5c A, 12.5d)', () => {
    const state = unfueled({ [U.alTrk]: ['1,5', 'COMBAT', 'combat'], [U.alTrk2]: ['2,5', 'COMBAT', 'combat'], [U.alHq]: ['1,6', 'COMBAT', 'combat'], [U.alSup]: ['0,6', null] });
    const paid = ok(applyRuleAction(state, ALLIED, { kind: 'PAY_FUEL', method: 'FORMATION', pieceId: U.alTrk, sourcePieceId: U.alSup }));
    expect(piece(paid, U.alSup).location.kind).toBe('ELIMINATED');
    expect(paid.fuel.formations[0]?.coveredPieceIds).toEqual(expect.arrayContaining([U.alTrk, U.alTrk2]));
    const nextPhase = { ...paid, usage: [] };
    expect(applyRuleAction(nextPhase, ALLIED, { kind: 'MOVE_PIECE', pieceId: U.alTrk2, path: path('2,5', '3,5') }).ok).toBe(true);
    // Clean Up removes the phasing player's Formation and HQ fuel.
    const cleanup = ok(applyRuleAction(atStep(paid, 'CLEAN_UP', 'NONE', ALLIED), ALLIED, { kind: 'ADVANCE_SEQUENCE' }));
    expect(cleanup.fuel.formations.filter(({ playerId }) => playerId === ALLIED)).toEqual([]);
  });

  it('fuels an HQ and the independent units in its throw range for 1 SP (12.5c B, 12.5e)', () => {
    const state = unfueled({ [U.alHq]: ['1,6', 'COMBAT', 'combat'], [U.alEng]: ['4,6', 'MOVE', 'move'], [U.alTrk]: ['3,6', 'COMBAT', 'combat'], [U.alSup]: ['0,6', null] });
    const paid = ok(applyRuleAction(state, ALLIED, { kind: 'PAY_FUEL', method: 'HQ', pieceId: U.alHq, sourcePieceId: U.alSup }));
    expect(applyRuleAction(paid, ALLIED, { kind: 'MOVE_PIECE', pieceId: U.alEng, path: path('4,6', '5,6') }).ok).toBe(true);
    // A formation unit is not independent, so the HQ Method does not fuel it.
    expect(codes(applyRuleAction(paid, ALLIED, { kind: 'MOVE_PIECE', pieceId: U.alTrk, path: path('3,6', '3,7') }))).toContain('FUEL_REQUIRED');
  });

  it('requires fuel to overrun even from a standing start (12.5b)', () => {
    const state = unfueled({ [U.alTrk]: ['6,5', 'MOVE', 'move'], [U.axTrk]: ['7,5', 'MOVE', 'move'], [U.alSup]: ['5,5', null] });
    expect(codes(declareTestCombat(state, ALLIED, 'OVERRUN', [U.alTrk], '7,5'))).toContain('FUEL_REQUIRED');
  });

  it('only offers fuel to units that may move in the phase (no Reaction fuel for unreleased units)', () => {
    const state = atStep(buildGeneratedRuleState({ [U.alTrk]: ['1,5', 'COMBAT', 'combat'], [U.alSup]: ['1,6', null] }, {}, { fueled: false }), 'REACTION', 'MOVEMENT', ALLIED, AXIS);
    expect(ruleEngine.getActionCandidates(state, { actorId: ALLIED, kind: 'PAY_FUEL', pieceId: null, budget: 5 }).actions).toEqual([]);
  });
});

describe('OCS 4.3 internal stocks, trace supply and attrition (12.6, 12.8, 12.10, 13.1d)', () => {
  it('recovers internal stocks first, from dumps in reach (12.10e)', () => {
    let state = atStep(buildGeneratedRuleState({ [U.alLeg]: ['1,5', 'COMBAT', 'combat'], [U.alSup]: ['1,6', null] }), 'SUPPLY', 'NONE', ALLIED);
    state = withPiece(state, U.alLeg, (unit) => withInternalStocks(unit, 'LOW'));
    expect(codes(applyRuleAction(state, ALLIED, { kind: 'ADVANCE_SEQUENCE' }))).toContain('INTERNALS_MUST_RECOVER');
    const recovered = ok(applyRuleAction(state, ALLIED, { kind: 'RECOVER_INTERNALS', pieceId: U.alLeg, sourcePieceIds: [U.alSup] }));
    expect(internalStocksOf(piece(recovered, U.alLeg))).toBe('FULL');
    expect(piece(recovered, U.alSup).resourceQuantity).toBe(2);
  });

  it('spends what is in reach when it cannot fully recover (12.10eC)', () => {
    let state = atStep(buildGeneratedRuleState({ [U.alLeg]: ['1,5', 'COMBAT', 'combat'], [U.alSup]: ['1,6', null] }), 'SUPPLY', 'NONE', ALLIED);
    state = withPiece(withPiece(state, U.alLeg, (unit) => withInternalStocks(unit, 'EXHAUSTED')), U.alSup, (dump) => ({ ...dump, resourceQuantity: 2 }));
    const recovered = ok(applyRuleAction(state, ALLIED, { kind: 'RECOVER_INTERNALS', pieceId: U.alLeg, sourcePieceIds: [U.alSup] }));
    expect(internalStocksOf(piece(recovered, U.alLeg))).toBe('LOW');
    expect(piece(recovered, U.alSup).location.kind).toBe('ELIMINATED');
  });

  it('rolls attrition for Out of Supply stacks and lets the owner choose the losses (12.8b)', () => {
    let found = false;
    for (let seed = 1; seed < 80 && !found; seed += 1) {
      const state = atStep(buildGeneratedRuleState({ [U.alLeg]: ['10,5', 'COMBAT', 'combat'], [U.alLeg2]: ['10,5', 'COMBAT', 'combat'] }), 'SUPPLY', 'NONE', ALLIED);
      const advanced = ok(applyRuleAction({ ...state, rng: createRulesRng(seed) }, ALLIED, { kind: 'ADVANCE_SEQUENCE' }));
      expect(piece(advanced, U.alLeg).statuses.map(({ statusDefinitionId }) => statusDefinitionId)).toContain('status:out-of-supply');
      const rolled = applyRuleAction({ ...state, rng: createRulesRng(seed) }, ALLIED, { kind: 'ADVANCE_SEQUENCE' }).events.find((event) => event.kind === 'ATTRITION_ROLLED');
      expect(rolled).toBeDefined();
      if (advanced.pendingDecision?.kind === 'ATTRITION_LOSS') {
        expect(advanced.pendingDecision.ownerId).toBe(ALLIED);
        expect(advanced.pendingDecision.options.map(({ id }) => id)).toEqual(expect.arrayContaining([`piece:${U.alLeg}`, `piece:${U.alLeg2}`]));
        found = true;
      }
    }
    expect(found).toBe(true);
  });

  it('lets a divisional HQ throw only to its own division and independent units (13.1d)', () => {
    const state = buildGeneratedRuleState({
      [U.alHq]: ['-1,6', 'COMBAT', 'combat'], [U.alTrk]: ['6,6', 'COMBAT', 'combat'],
      [U.alLeg]: ['6,7', 'COMBAT', 'combat'], [U.alEng]: ['6,5', 'COMBAT', 'combat'],
    });
    expect(pieceHasTrace(state, piece(state, U.alTrk))).toBe(true);
    expect(pieceHasTrace(state, piece(state, U.alEng))).toBe(true);
    expect(pieceHasTrace(state, piece(state, U.alLeg))).toBe(false);
  });

  it('makes a formation trace through one HQ or one source; the player may pick which (12.6f)', () => {
    const built = buildGeneratedRuleScenario({ [U.alHq]: ['-1,6', 'COMBAT', 'combat'], [U.alTrk]: ['6,6', 'COMBAT', 'combat'], [U.alTrk2]: ['16,1', 'COMBAT', 'combat'] });
    const sources = [...built.scenario.sources, { ...built.scenario.sources[0]!, id: 'source:test:second' as never, hexId: '15,1' as HexId }];
    const created = createInitialGameState({ ...built.scenario, sources }, built.configuration, 7);
    if (!created.ok) throw new Error('state');
    const state = atStep(created.value, 'SUPPLY', 'NONE', ALLIED);
    // The HQ route covers the HQ and one regiment; the other regiment only draws from the far source.
    expect(pieceHasTrace(state, piece(state, U.alTrk))).toBe(true);
    expect(pieceHasTrace(state, piece(state, U.alTrk2))).toBe(false);
    const formationId = state.scenario.pieceCatalog.definitions.find(({ id }) => id === piece(state, U.alTrk2).definitionId)!.ownership.formationDefinitionId!;
    const chosen = ok(applyRuleAction(state, ALLIED, { kind: 'CHOOSE_FORMATION_TRACE', formationId, routeKey: 'DRAW:15,1' }));
    expect(pieceHasTrace(chosen, piece(chosen, U.alTrk2))).toBe(true);
    expect(pieceHasTrace(chosen, piece(chosen, U.alTrk))).toBe(false);
  });
});

describe('OCS 4.3 breakout (12.8e)', () => {
  it('lets a unit first cut off roll with +1, leaving for the Dead Pile or the reinforcement Box', () => {
    const state = atStep(buildGeneratedRuleState({ [U.alLeg]: ['10,5', 'COMBAT', 'combat'] }), 'MOVEMENT', 'BREAKOUT', ALLIED);
    expect(breakoutStatus(state, piece(state, U.alLeg))).toMatchObject({ eligible: true, firstTurn: true });
    const outcomes = new Set<string>();
    for (let seed = 1; seed < 40; seed += 1) {
      const result = ok(applyRuleAction({ ...state, rng: createRulesRng(seed) }, ALLIED, { kind: 'ATTEMPT_BREAKOUT', pieceId: U.alLeg }));
      const unit = piece(result, U.alLeg);
      outcomes.add(unit.location.kind);
      if (unit.location.kind === 'OFF_MAP_BOX') {
        const returnTurn = returnTurnOf(unit)!;
        expect(returnTurn).toBeGreaterThan(state.sequence.gameTurn);
        const arriving = arrivingReinforcements({ ...result, sequence: { ...result.sequence, gameTurn: returnTurn } }, ALLIED);
        expect(arriving.map(({ id }) => id)).toContain(U.alLeg);
        expect(arrivingReinforcements(result, ALLIED).map(({ id }) => id)).not.toContain(U.alLeg);
      }
    }
    expect([...outcomes].sort()).toEqual(['ELIMINATED', 'OFF_MAP_BOX']);
  });

  it('requires a path and a supplied friend within 15 hexes after the first turn', () => {
    const state = atStep(buildGeneratedRuleState({ [U.alLeg]: ['10,5', 'COMBAT', 'combat'] }), 'MOVEMENT', 'BREAKOUT', ALLIED);
    const marked = withPiece(state, U.alLeg, (unit) => ({ ...unit, statuses: [{ statusDefinitionId: 'status:out-of-trace-since' as never, value: { kind: 'INTEGER', value: 1 } }] }));
    expect(codes(applyRuleAction(marked, ALLIED, { kind: 'ATTEMPT_BREAKOUT', pieceId: U.alLeg }))).toContain('BREAKOUT_NOT_ELIGIBLE');
  });
});

describe('OCS 4.3 reinforcements and Supply Table (2.3, 13.6)', () => {
  it('rolls the Supply Table on entering the Reinforcement Phase and the SP must be placed', () => {
    const state = atStep(buildGeneratedRuleState({ [U.alLeg]: ['1,5', 'COMBAT', 'combat'] }), 'AIRCRAFT_REFIT', 'NONE', ALLIED);
    const result = applyRuleAction(state, ALLIED, { kind: 'ADVANCE_SEQUENCE' });
    const advanced = ok(result);
    const arrived = result.events.find((event) => event.kind === 'SUPPLY_ARRIVED');
    expect(arrived).toBeDefined();
    if (arrived?.kind !== 'SUPPLY_ARRIVED') return;
    const row = BTR_SUPPLY_TABLE.find(({ minimum, maximum }) => arrived.roll >= minimum && arrived.roll <= maximum)!;
    expect(arrived.tokens).toBe(row.points[state.configuration.supplyArrivals!.players[0]!.status - 1]! * 4);
    expect(advanced.sequence.phase).toBe('REINFORCEMENT');
    expect(codes(applyRuleAction(advanced, ALLIED, { kind: 'ADVANCE_SEQUENCE' }))).toContain('REINFORCEMENTS_CANNOT_BE_DELAYED');
    const placed = ok(applyRuleAction(advanced, ALLIED, { kind: 'PLACE_REINFORCEMENT', pieceId: arrived.pieceId, hexId: '-3,6' as HexId }));
    expect(piece(placed, arrived.pieceId)).toMatchObject({ location: { kind: 'ON_MAP', hexId: '-3,6' }, resourceQuantity: arrived.tokens });
  });

  it('uses the nearest unblocked map-edge hex when the entry is blocked (13.6b)', () => {
    let state = atStep(buildGeneratedRuleState({ [U.alLeg]: ['1,5', 'COMBAT', 'combat'], [U.axTrk]: ['-3,6', 'COMBAT', 'combat'] }), 'REINFORCEMENT', 'NONE', ALLIED);
    const boxId = state.configuration.reinforcementBoxes.find(({ playerId }) => playerId === ALLIED)!.boxId;
    state = withPiece(state, U.alLeg2, (unit) => ({ ...unit, location: { kind: 'OFF_MAP_BOX', boxId }, stackOrder: 0 }));
    expect(codes(applyRuleAction(state, ALLIED, { kind: 'PLACE_REINFORCEMENT', pieceId: U.alLeg2, hexId: '-3,6' as HexId }))).toContain('ENTRY_BLOCKED_BY_ENEMY');
    const options = ruleEngine.getActionCandidates(state, { actorId: ALLIED, kind: 'PLACE_REINFORCEMENT', pieceId: U.alLeg2, budget: 20 }).actions
      .flatMap((action) => action.kind === 'PLACE_REINFORCEMENT' ? [action.hexId] : []);
    expect(options.length).toBeGreaterThan(0);
    expect(options.every((hexId) => hexDistanceBetween(hexId, '-3,6' as HexId) === 1)).toBe(true);
    expect(applyRuleAction(state, ALLIED, { kind: 'PLACE_REINFORCEMENT', pieceId: U.alLeg2, hexId: options[0]! }).ok).toBe(true);
  });
});

describe('OCS 4.3 combat choices (9.2-9.4, 9.12, 4.8a)', () => {
  it('lets the defender choose the terrain that sets his strength and the Combat Table line (9.4c)', () => {
    const built = buildGeneratedRuleScenario({ [U.alTrk]: ['5,5', 'COMBAT', 'combat'], [U.axTrk]: ['6,5', 'COMBAT', 'combat'], [U.alSup]: ['4,5', null] });
    const mapDefinition = { ...built.scenario.mapDefinition, hexes: built.scenario.mapDefinition.hexes.map((hex) => hex.id === '6,5'
      ? { ...hex, terrainDefinitionIds: ['terrain:clear', 'terrain:woods'] as never } : hex) };
    const created = createInitialGameState({ ...built.scenario, mapDefinition }, built.configuration, 7);
    if (!created.ok) throw new Error('state');
    const state = atStep(created.value, 'COMBAT', 'COMBAT', ALLIED);
    let current = declareTestCombat(state, ALLIED, 'REGULAR', [U.alTrk], '6,5').state;
    while (current.pendingDecision && current.pendingDecision.kind !== 'DEFENDER_TERRAIN') {
      const pending = current.pendingDecision;
      current = ok(applyRuleAction(current, pending.ownerId, { kind: 'RESPOND_DECISION', decisionId: pending.id, choiceId: pending.options[0]!.id }));
    }
    const decision = current.pendingDecision!;
    expect(decision).toMatchObject({ kind: 'DEFENDER_TERRAIN', ownerId: AXIS });
    expect(decision.options.map(({ id }) => id)).toEqual(['terrain:terrain:clear', 'terrain:terrain:woods']);
    expect(calculateCombatOdds(current, [U.alTrk], [U.axTrk], '6,5' as HexId, [], U.alTrk, U.axTrk, 'terrain:woods').line).toBe('CLOSE');
    const rolled = applyRuleAction(current, AXIS, { kind: 'RESPOND_DECISION', decisionId: decision.id, choiceId: 'terrain:terrain:woods' });
    expect(rolled.events.some((event) => event.kind === 'DICE_ROLLED')).toBe(true);
  });

  it('lets the retreating owner pick each destination and split the stack (9.12c)', () => {
    let seen = false;
    for (let seed = 1; seed < 400 && !seen; seed += 1) {
      const state = atStep(buildGeneratedRuleState({ [U.alTrk]: ['5,5', 'COMBAT', 'combat'], [U.alTrk2]: ['5,6', 'COMBAT', 'combat'], [U.axTrk]: ['6,5', 'COMBAT', 'combat'], [U.axTrk2]: ['6,5', 'COMBAT', 'combat'], [U.alSup]: ['4,5', null] }), 'COMBAT', 'COMBAT', ALLIED);
      let current = declareTestCombat({ ...state, rng: createRulesRng(seed) }, ALLIED, 'REGULAR', [U.alTrk, U.alTrk2], '6,5').state;
      for (let guard = 0; current.pendingDecision && guard < 30; guard += 1) {
        const decision = current.pendingDecision;
        if (decision.kind === 'RETREAT_HEX' && decision.ownerId === AXIS && decision.options.some(({ id }) => id === 'split')) {
          expect(decision.options.filter(({ id }) => id.startsWith('hex:')).every(({ hexId }) => hexId !== null)).toBe(true);
          const split = ok(applyRuleAction(current, AXIS, { kind: 'RESPOND_DECISION', decisionId: decision.id, choiceId: 'split' }));
          expect(split.pendingDecision?.kind).toBe('RETREAT_HEX');
          expect(split.pendingDecision?.prompt).toMatch(/ends the retreat/u);
          seen = true;
          break;
        }
        const choice = decision.kind === 'OPTION_SPLIT' && decision.ownerId === AXIS
          ? decision.options.find(({ id }) => /^option:0:\d$/u.test(id))?.id ?? decision.options[0]!.id
          : decision.options.find(({ id }) => /^option:\d+:0$/u.test(id))?.id ?? decision.options[0]!.id;
        current = ok(applyRuleAction(current, decision.ownerId, { kind: 'RESPOND_DECISION', decisionId: decision.id, choiceId: choice }));
      }
    }
    expect(seen).toBe(true);
  });

  it('lets the attacker advance any subset, one unit at a time (9.12gD)', () => {
    let seen = false;
    for (let seed = 1; seed < 400 && !seen; seed += 1) {
      const state = atStep(buildGeneratedRuleState({ [U.alTrk]: ['5,5', 'COMBAT', 'combat'], [U.alTrk2]: ['5,6', 'COMBAT', 'combat'], [U.axArt]: ['6,5', 'MOVE', 'move'], [U.alSup]: ['4,5', null] }), 'COMBAT', 'COMBAT', ALLIED);
      let current = declareTestCombat({ ...state, rng: createRulesRng(seed) }, ALLIED, 'REGULAR', [U.alTrk, U.alTrk2], '6,5').state;
      for (let guard = 0; current.pendingDecision && guard < 30; guard += 1) {
        const decision = current.pendingDecision;
        if (decision.kind === 'ADVANCE_HEX') {
          expect(decision.options.map(({ id }) => id)).toEqual(expect.arrayContaining(['advance:done', 'advance:all', `advance:${U.alTrk}`, `advance:${U.alTrk2}`]));
          const one = ok(applyRuleAction(current, ALLIED, { kind: 'RESPOND_DECISION', decisionId: decision.id, choiceId: `advance:${U.alTrk}` }));
          expect(one.pendingDecision?.kind).toBe('ADVANCE_HEX');
          const done = ok(applyRuleAction(one, ALLIED, { kind: 'RESPOND_DECISION', decisionId: one.pendingDecision!.id, choiceId: 'advance:done' }));
          expect(piece(done, U.alTrk).location).toMatchObject({ hexId: '6,5' });
          expect(piece(done, U.alTrk2).location).toMatchObject({ hexId: '5,6' });
          seen = true;
          break;
        }
        const choice = decision.options.find(({ id }) => /^option:\d+:0$/u.test(id))?.id ?? decision.options[0]!.id;
        current = ok(applyRuleAction(current, decision.ownerId, { kind: 'RESPOND_DECISION', decisionId: decision.id, choiceId: choice }));
      }
    }
    expect(seen).toBe(true);
  });

  it('asks the overstacked side to eliminate units even when the other side is acting (4.8a)', () => {
    const state = atStep(buildGeneratedRuleState({ [U.axTrk]: ['6,5', 'COMBAT', 'combat'], [U.axTrk2]: ['6,5', 'COMBAT', 'combat'] }), 'COMBAT', 'COMBAT', ALLIED);
    // Two Axis half-RE battalions exceed this limit together; the Allied player is acting.
    const tight = { ...state, configuration: { ...state.configuration, stackingLimitReTicks: 3 } };
    expect(overstackDecision(tight)).toMatchObject({ kind: 'OVERSTACK_ELIMINATION', ownerId: AXIS });
  });
});

describe('OCS 4.3 transport, Extenders and dumps (9.14, 12.2, 12.7, 12.11, 13.2)', () => {
  it('loads and unloads at 10% of MA, uses SP aboard, and forbids leapfrogging (13.2f, 12.1b, 12.2a)', () => {
    const state = atStep(buildGeneratedRuleState({ [U.alTruck]: ['1,5', null], [U.alSup]: ['1,5', null], [U.alLeg]: ['4,5', 'COMBAT', 'combat'] }), 'MOVEMENT', 'MOVEMENT', ALLIED);
    const loaded = ok(applyRuleAction(state, ALLIED, { kind: 'LOAD_SUPPLY', truckId: U.alTruck, dumpId: U.alSup, tokens: 4 }));
    expect(piece(loaded, U.alSup).location).toEqual({ kind: 'CONTAINER', containerId: U.alTruck });
    expect(loaded.usage.find(({ pieceId }) => pieceId === U.alTruck)?.movementSpentTicks).toBe(20);
    expect(dumpsReaching(loaded, ALLIED, '2,5' as HexId).map(({ pieceId }) => pieceId)).toContain(U.alSup);
    const moved = ok(applyRuleAction(loaded, ALLIED, { kind: 'MOVE_PIECE', pieceId: U.alTruck, path: path('1,5', '2,5', '3,5', '4,5') }));
    const unloaded = ok(applyRuleAction(moved, ALLIED, { kind: 'UNLOAD_SUPPLY', truckId: U.alTruck, tokens: 4 }));
    expect(piece(unloaded, U.alSup).location).toEqual({ kind: 'ON_MAP', hexId: '4,5' });
    expect(codes(applyRuleAction(unloaded, ALLIED, { kind: 'LOAD_SUPPLY', truckId: U.alTruck, dumpId: U.alSup, tokens: 4 }))).toContain('INVALID_LOAD_QUANTITY');
  });

  it('offers Combine for the selected truck when another truck of its type shares the Hex (13.2c)', () => {
    const state = atStep(buildGeneratedRuleState({ [U.alTruck]: ['1,5', null] }), 'MOVEMENT', 'MOVEMENT', ALLIED);
    const known = new Set(state.pieceState.pieces.map(({ id }) => id));
    const divided = ok(applyRuleAction(state, ALLIED, { kind: 'DIVIDE_TRANSPORT', truckId: U.alTruck, points: 1 }));
    const splitId = divided.pieceState.pieces.find(({ id }) => !known.has(id))!.id;
    const combine = (pieceId: PieceId | null) => ruleEngine.getActionCandidates(divided, { actorId: ALLIED, kind: 'COMBINE_TRANSPORT', pieceId, budget: 5 }).actions;
    for (const selected of [null, U.alTruck, splitId]) {
      const actions = combine(selected);
      expect(actions.map(({ kind }) => kind), `selected ${selected}`).toEqual(['COMBINE_TRANSPORT']);
      expect(actions[0]!.kind === 'COMBINE_TRANSPORT' ? [...actions[0]!.truckIds].sort() : []).toEqual([U.alTruck, splitId].sort());
    }
    // A selected piece that is not one of the group does not get the action.
    expect(combine(U.alSup)).toEqual([]);
  });

  it('warns, before the move, that moving another unit ends a loaded truck\'s move (6.1g)', () => {
    const state = atStep(buildGeneratedRuleState({ [U.alTruck]: ['1,5', null], [U.alSup]: ['1,5', null], [U.alLeg]: ['4,5', 'MOVE', 'move'] }), 'MOVEMENT', 'MOVEMENT', ALLIED);
    const moveLeg = (from: GameState) => ruleEngine.explain(from, { actionId: 'probe', actorId: ALLIED, expectedRevision: from.revision, kind: 'MOVE_PIECE', pieceId: U.alLeg, path: path('4,5', '3,5') } as never);
    const fact = (explanation: ReturnType<typeof moveLeg>, key: string) => explanation.facts.find((entry) => entry.key === key)?.value;
    // No truck has started moving: nothing is given up.
    expect(fact(moveLeg(state), 'movement.endsOtherMover.pieceId')).toBeUndefined();
    const loaded = ok(applyRuleAction(state, ALLIED, { kind: 'LOAD_SUPPLY', truckId: U.alTruck, dumpId: U.alSup, tokens: 4 }));
    const explanation = moveLeg(loaded);
    expect(explanation.allowed).toBe(true);
    expect(fact(explanation, 'movement.endsOtherMover.pieceId')).toBe(U.alTruck);
    expect(fact(explanation, 'movement.endsOtherMover.loadTokens')).toBe(4);
    expect(fact(explanation, 'movement.endsOtherMover.remainingTicks')).toBe(180 - 20);
    // The warning is real: once the leg unit moves, the truck can no longer act.
    const after = ok(applyRuleAction(loaded, ALLIED, { kind: 'MOVE_PIECE', pieceId: U.alLeg, path: path('4,5', '3,5') }));
    expect(codes(applyRuleAction(after, ALLIED, { kind: 'UNLOAD_SUPPLY', truckId: U.alTruck, tokens: 4 }))).toContain('MOVEMENT_ALREADY_FINISHED');
    // A truck that is out of MP has nothing left to lose.
    const spent = withPiece(loaded, U.alTruck, (current) => current);
    expect(fact(moveLeg({ ...spent, usage: spent.usage.map((entry) => entry.pieceId === U.alTruck ? { ...entry, movementSpentTicks: 180 } : entry) }), 'movement.endsOtherMover.pieceId')).toBeUndefined();
  });

  describe('transport options for the UI (A1)', () => {
    const optionsOf = (state: GameState, truckId: PieceId = U.alTruck, actor = ALLIED) => ruleEngine.queryTransportOptions(state, actor, truckId);
    const loadAction = (state: GameState, dumpId: PieceId, tokens: number) => ({ actionId: 'probe', actorId: ALLIED, expectedRevision: state.revision, kind: 'LOAD_SUPPLY', truckId: U.alTruck, dumpId, tokens }) as never;
    const unloadAction = (state: GameState, tokens: number) => ({ actionId: 'probe', actorId: ALLIED, expectedRevision: state.revision, kind: 'UNLOAD_SUPPLY', truckId: U.alTruck, tokens }) as never;

    it('offers every Token count the engine accepts, with the MP it costs and what is left', () => {
      const state = atStep(buildGeneratedRuleState({ [U.alTruck]: ['1,5', null], [U.alSup]: ['1,5', null] }), 'MOVEMENT', 'MOVEMENT', ALLIED);
      const result = optionsOf(state);
      expect(result.allowed).toBe(true);
      const options = result.value!;
      expect(options.loadedTokens).toBe(0);
      expect(options.unload).toBeNull();
      const [load] = options.loads;
      expect(options.loads).toHaveLength(1);
      expect(load).toMatchObject({ kind: 'LOAD', pieceId: U.alSup, available: true, minTokens: 1, costTicks: 20, reasons: [] });
      expect(load!.remainingAfterTicks).toBe(options.remainingTicks - 20);
      // The range is exactly what the rules accept: every count inside is legal, one more is not.
      for (let tokens = load!.minTokens; tokens <= load!.maxTokens; tokens += 1) {
        expect(ruleEngine.validateAction(state, loadAction(state, U.alSup, tokens)).allowed, `${tokens}T`).toBe(true);
      }
      expect(ruleEngine.validateAction(state, loadAction(state, U.alSup, load!.maxTokens + 1)).allowed).toBe(false);
      // Loading part of it leaves the rest to load later and still shows an honest range.
      const part = ok(applyRuleAction(state, ALLIED, { kind: 'LOAD_SUPPLY', truckId: U.alTruck, dumpId: U.alSup, tokens: 1 }));
      expect(optionsOf(part).value!.loadedTokens).toBe(1);
      // The dump left in the Hex is a legal place to unload onto (13.2f), and the rules agree.
      const unload = optionsOf(part).value!.unload!;
      expect(unload).toMatchObject({ kind: 'UNLOAD', available: true, minTokens: 1, maxTokens: 1 });
      expect(ruleEngine.validateAction(part, unloadAction(part, 1)).allowed).toBe(true);
    });

    it('says why a load or an unload is not offered, with the rule (12.2a, 13.2f)', () => {
      const state = atStep(buildGeneratedRuleState({ [U.alTruck]: ['1,5', null], [U.alSup]: ['1,5', null], [U.alLeg]: ['4,5', 'COMBAT', 'combat'] }), 'MOVEMENT', 'MOVEMENT', ALLIED);
      const loaded = ok(applyRuleAction(state, ALLIED, { kind: 'LOAD_SUPPLY', truckId: U.alTruck, dumpId: U.alSup, tokens: 4 }));
      // Out in the open with no friendly combat unit or dump, the SP cannot be unloaded.
      const stuck = optionsOf(loaded).value!.unload!;
      expect(stuck.available).toBe(false);
      expect(stuck.reasons.map(({ code, rule }) => [code, rule])).toContainEqual(['INVALID_UNLOAD_HEX', '13.2f']);
      expect(ruleEngine.validateAction(loaded, unloadAction(loaded, 4)).allowed).toBe(false);
      // With a friendly combat unit it can, and the maximum is the whole load.
      const moved = ok(applyRuleAction(loaded, ALLIED, { kind: 'MOVE_PIECE', pieceId: U.alTruck, path: path('1,5', '2,5', '3,5', '4,5') }));
      const unload = optionsOf(moved).value!.unload!;
      expect(unload).toMatchObject({ available: true, minTokens: 1, maxTokens: 4, costTicks: 20 });
      expect(ruleEngine.validateAction(moved, unloadAction(moved, unload.maxTokens)).allowed).toBe(true);
      // SP unloaded this phase cannot be loaded again (12.2a).
      const unloaded = ok(applyRuleAction(moved, ALLIED, { kind: 'UNLOAD_SUPPLY', truckId: U.alTruck, tokens: 4 }));
      const again = optionsOf(unloaded).value!.loads.find(({ pieceId }) => pieceId === U.alSup)!;
      expect(again.available).toBe(false);
      expect(again.reasons.map(({ code, rule }) => [code, rule])).toContainEqual(['INVALID_LOAD_QUANTITY', '12.2a']);
      expect(again.reasons.map(({ message }) => message).join(' ')).toContain('unloaded this phase');
    });

    it('refuses to describe a piece that is not one of the asking player\'s Transport Points', () => {
      const state = atStep(buildGeneratedRuleState({ [U.alTruck]: ['1,5', null], [U.alLeg]: ['4,5', 'COMBAT', 'combat'] }), 'MOVEMENT', 'MOVEMENT', ALLIED);
      expect(optionsOf(state, U.alLeg).allowed).toBe(false);
      expect(optionsOf(state, U.alTruck, AXIS).allowed).toBe(false);
      expect(optionsOf(state, U.alTruck, AXIS).value).toBeNull();
    });
  });

  it('forms an Extender that becomes a supply source, and refuses one that cannot connect (12.7)', () => {
    const state = atStep(buildGeneratedRuleState({ [U.alTruck]: ['0,6', null], [U.alLeg]: ['4,6', 'COMBAT', 'combat'] }), 'MOVEMENT', 'MOVEMENT', ALLIED);
    expect(pieceHasTrace(state, piece(state, U.alLeg))).toBe(false);
    const formed = ok(applyRuleAction(state, ALLIED, { kind: 'FORM_EXTENDER', truckId: U.alTruck }));
    expect(friendlySourceHexes(formed, ALLIED)).toContain('0,6');
    expect(pieceHasTrace(formed, piece(formed, U.alLeg))).toBe(true);
    const far = atStep(buildGeneratedRuleState({ [U.alTruck]: ['8,6', null] }, allTerrain('terrain:woods')), 'MOVEMENT', 'MOVEMENT', ALLIED);
    expect(codes(applyRuleAction(far, ALLIED, { kind: 'FORM_EXTENDER', truckId: U.alTruck }))).toContain('EXTENDER_NOT_CONNECTED');
  });

  it('lets the owner place trucks that escape capture (9.14c)', () => {
    let seen = false;
    for (let seed = 1; seed < 60 && !seen; seed += 1) {
      const state = atStep(buildGeneratedRuleState({ [U.alTrk]: ['6,5', 'MOVE', 'move'], [U.axTruck]: ['8,5', null] }), 'MOVEMENT', 'MOVEMENT', ALLIED);
      const moved = ok(applyRuleAction({ ...state, rng: createRulesRng(seed) }, ALLIED, { kind: 'MOVE_PIECE', pieceId: U.alTrk, path: path('6,5', '7,5', '8,5') }));
      const decision = moved.pendingDecision;
      if (decision?.kind !== 'DISPLACEMENT_HEX') continue;
      expect(decision.ownerId).toBe(AXIS);
      expect(decision.options.every(({ hexId }) => hexId !== null && hexDistanceBetween(hexId, '8,5' as HexId) <= 10)).toBe(true);
      const target = decision.options[0]!;
      const placed = ok(applyRuleAction(moved, AXIS, { kind: 'RESPOND_DECISION', decisionId: decision.id, choiceId: target.id }));
      expect(placed.pieceState.pieces.find(({ id, ownerId }) => id === U.axTruck && ownerId === AXIS)?.location).toEqual({ kind: 'ON_MAP', hexId: target.hexId });
      seen = true;
    }
    expect(seen).toBe(true);
  });

  it('blows a dump once per phase, rounding to the nearest Token (12.11a)', () => {
    let checked = false;
    for (let seed = 1; seed < 20 && !checked; seed += 1) {
      const state = atStep(buildGeneratedRuleState({ [U.alSup]: ['1,5', null], [U.alLeg]: ['1,6', 'COMBAT', 'combat'] }), 'MOVEMENT', 'MOVEMENT', ALLIED);
      const blown = ok(applyRuleAction({ ...state, rng: createRulesRng(seed) }, ALLIED, { kind: 'BLOW_DUMP', dumpId: U.alSup, tokens: 4 }));
      if (piece(blown, U.alSup).location.kind === 'ELIMINATED') continue;
      expect([1, 2, 3]).toContain(4 - piece(blown, U.alSup).resourceQuantity!);
      expect(codes(applyRuleAction(blown, ALLIED, { kind: 'BLOW_DUMP', dumpId: U.alSup, tokens: 1 }))).toContain('DUMP_ALREADY_BLOWN');
      checked = true;
    }
    expect(checked).toBe(true);
  });

  it('counts a multi-unit formation as at most 3 RE for barrage density (10.0a)', () => {
    const state = atStep(buildGeneratedRuleState({
      [U.alHq]: ['6,5', 'COMBAT', 'combat'], [U.alTrk]: ['6,5', 'COMBAT', 'combat'], [U.alTrk2]: ['6,5', 'COMBAT', 'combat'],
      [U.alArt]: ['6,5', 'COMBAT', 'combat'], [U.alRecon]: ['6,5', 'COMBAT', 'combat'], [U.axArt]: ['8,5', 'COMBAT', 'combat'], [U.axSup]: ['9,5', null],
    }), 'COMBAT', 'BARRAGE', AXIS);
    const density = previewBarrage(state, AXIS, [U.axArt], '6,5' as HexId).shifts.find(({ reason }) => reason === 'Density');
    expect(density?.shift).toBe(0);
  });
});
