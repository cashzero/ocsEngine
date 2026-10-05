import { describe, expect, it } from 'vitest';
import {
  ALLIED,
  AXIS,
  BTR_SUPPLY_TABLE,
  RULE_FIXTURE_NEW_GAME_REQUEST,
  applyRuleAction,
  arrivingReinforcements,
  atStep,
  onGameTurn,
  breakoutStatus,
  buildGeneratedRuleScenario,
  buildGeneratedRuleState,
  calculateCombatOdds,
  createGeneratedWeather,
  createInitialGameState,
  createRulesRng,
  declareTestCombat,
  dumpsReaching,
  formationRouteOptions,
  friendlySourceHexes,
  generatedPieceId,
  hexDistanceBetween,
  internalStocksOf,
  mergeSupplyAt,
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
  alHq: generatedPieceId('allied:independent-hq-1'), alArt: generatedPieceId('allied:f1-artillery-1'), alRecon: generatedPieceId('allied:f1-recon'),
  alLeg: generatedPieceId('allied:f2-combat-1'), // Formation 2 is a single-unit infantry division, so the second "leg" slot borrows formation 1's second regiment.
  alLeg2: generatedPieceId('allied:f1-combat-2'),
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

  it('does not fuel a multi-step unit by the HQ Method, even with no Formation ID and after losing steps (3.2d, 3.2f, 12.5e)', () => {
    // The single-counter infantry division walks; put it on trucks so it needs fuel at all (12.5a).
    const motorized = (state: GameState): GameState => {
      const divisionId = piece(state, U.alLeg).definitionId;
      const definitions = state.scenario.pieceCatalog.definitions.map((definition) => definition.id !== divisionId ? definition
        : { ...definition, faces: definition.faces.map((face) => ({ ...face, mobilityClassDefinitionId: 'mobility:truck' as never })) });
      return { ...state, scenario: { ...state.scenario, pieceCatalog: { ...state.scenario.pieceCatalog, definitions } } };
    };
    const state = motorized(unfueled({ [U.alHq]: ['1,6', 'COMBAT', 'combat'], [U.alEng]: ['2,6', 'MOVE', 'move'], [U.alLeg]: ['2,5', 'MOVE', 'move'], [U.alSup]: ['0,6', null] }));
    expect(state.scenario.pieceCatalog.definitions.find(({ id }) => id === piece(state, U.alLeg).definitionId)?.ownership.formationDefinitionId).toBeNull();
    const preview = ruleEngine.queryFuelPreview(state, ALLIED, U.alHq).value!.find(({ method }) => method === 'HQ');
    expect(preview?.fueledPieceIds).toEqual(expect.arrayContaining([U.alHq, U.alEng]));
    expect(preview?.fueledPieceIds).not.toContain(U.alLeg);
    const paid = ok(applyRuleAction(state, ALLIED, { kind: 'PAY_FUEL', method: 'HQ', pieceId: U.alHq, sourcePieceId: U.alSup }));
    expect(applyRuleAction(paid, ALLIED, { kind: 'MOVE_PIECE', pieceId: U.alEng, path: path('2,6', '3,6') }).ok).toBe(true);
    expect(codes(applyRuleAction(paid, ALLIED, { kind: 'MOVE_PIECE', pieceId: U.alLeg, path: path('2,5', '3,5') }))).toContain('FUEL_REQUIRED');
    // A reduced division is still a multi-step unit, not a one-step independent.
    const reduced = withPiece(paid, U.alLeg, (current) => ({ ...current, remainingSteps: 1 }));
    expect(codes(applyRuleAction(reduced, ALLIED, { kind: 'MOVE_PIECE', pieceId: U.alLeg, path: path('2,5', '3,5') }))).toContain('FUEL_REQUIRED');
    // The Single-Unit Method still fuels it (12.5c C); the HQ Method above spent this dump's whole SP, so pay from the start.
    const single = ok(applyRuleAction(state, ALLIED, { kind: 'PAY_FUEL', method: 'SINGLE_UNIT', pieceId: U.alLeg, sourcePieceId: U.alSup }));
    expect(applyRuleAction(single, ALLIED, { kind: 'MOVE_PIECE', pieceId: U.alLeg, path: path('2,5', '3,5') }).ok).toBe(true);
  });

  it('does not offer the HQ Method to an HQ the Formation Method already fueled unless an independent unit still needs it', () => {
    const formationFueled = (placement: Parameters<typeof buildGeneratedRuleState>[0]): GameState => {
      const state = unfueled(placement);
      return { ...state, fuel: { ...state.fuel, formations: [{ playerId: ALLIED, formationId: state.pieceState.pieces.find(({ id }) => id === U.alHq)!.definitionId, coveredPieceIds: [U.alHq, U.alTrk] }] } };
    };
    const hqMethods = (state: GameState) => ruleEngine.getActionCandidates(state, { actorId: ALLIED, kind: 'PAY_FUEL', pieceId: U.alHq, budget: 10 }).actions
      .filter((action) => action.kind === 'PAY_FUEL' && action.method === 'HQ');
    // Only formation units around: the HQ is already fueled, so 1 SP for the HQ Method would buy nothing.
    const alone = formationFueled({ [U.alHq]: ['1,6', 'COMBAT', 'combat'], [U.alTrk]: ['1,5', 'COMBAT', 'combat'], [U.alSup]: ['0,6', null] });
    expect(hqMethods(alone)).toEqual([]);
    // An unfueled independent unit in its throw range still makes the HQ Method worth offering.
    const withIndependent = formationFueled({ [U.alHq]: ['1,6', 'COMBAT', 'combat'], [U.alTrk]: ['1,5', 'COMBAT', 'combat'], [U.alEng]: ['2,6', 'MOVE', 'move'], [U.alSup]: ['0,6', null] });
    expect(hqMethods(withIndependent).length).toBeGreaterThan(0);
    // The preview names the units the payment newly fuels: the independent one, not the HQ that Formation fuel already covers.
    const preview = ruleEngine.queryFuelPreview(withIndependent, ALLIED, U.alHq).value!.find(({ method }) => method === 'HQ');
    expect(preview?.fueledPieceIds).toEqual([U.alEng]);
    expect(preview?.tokens).toBe(4);
  });

  it('previews what each fuel payment buys, for the HQ and for a single unit', () => {
    const state = unfueled({ [U.alHq]: ['1,6', 'COMBAT', 'combat'], [U.alEng]: ['2,6', 'MOVE', 'move'], [U.alSup]: ['0,6', null] });
    const methods = ruleEngine.queryFuelPreview(state, ALLIED, U.alHq).value!;
    expect(methods.find(({ method }) => method === 'SINGLE_UNIT')?.fueledPieceIds).toEqual([U.alHq]);
    expect(methods.find(({ method }) => method === 'HQ')?.fueledPieceIds).toEqual(expect.arrayContaining([U.alHq, U.alEng]));
    // Someone else's unit is not previewed.
    expect(ruleEngine.queryFuelPreview(state, AXIS, U.alHq).allowed).toBe(false);
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
    let state = atStep(buildGeneratedRuleState({ [U.alTrk]: ['1,5', 'COMBAT', 'combat'], [U.alSup]: ['1,6', null] }), 'SUPPLY', 'NONE', ALLIED);
    state = withPiece(state, U.alTrk, (unit) => withInternalStocks(unit, 'LOW'));
    expect(codes(applyRuleAction(state, ALLIED, { kind: 'ADVANCE_SEQUENCE' }))).toContain('INTERNALS_MUST_RECOVER');
    const recovered = ok(applyRuleAction(state, ALLIED, { kind: 'RECOVER_INTERNALS', pieceId: U.alTrk, sourcePieceIds: [U.alSup] }));
    expect(internalStocksOf(piece(recovered, U.alTrk))).toBe('FULL');
    expect(piece(recovered, U.alSup).resourceQuantity).toBe(2);
  });

  it('spends what is in reach when it cannot fully recover (12.10eC)', () => {
    let state = atStep(buildGeneratedRuleState({ [U.alTrk]: ['1,5', 'COMBAT', 'combat'], [U.alSup]: ['1,6', null] }), 'SUPPLY', 'NONE', ALLIED);
    state = withPiece(withPiece(state, U.alTrk, (unit) => withInternalStocks(unit, 'EXHAUSTED')), U.alSup, (dump) => ({ ...dump, resourceQuantity: 2 }));
    const recovered = ok(applyRuleAction(state, ALLIED, { kind: 'RECOVER_INTERNALS', pieceId: U.alTrk, sourcePieceIds: [U.alSup] }));
    expect(internalStocksOf(piece(recovered, U.alTrk))).toBe('LOW');
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

  it('lets a corps HQ throw to any friendly unit, and a divisional HQ only to its own division and independent units (13.1d)', () => {
    // Generated HQs are corps HQs outside every formation; give this one formation 1's Formation ID to make it divisional.
    const divisional = (state: GameState): GameState => {
      const formationId = state.scenario.pieceCatalog.definitions.find(({ id }) => id === piece(state, U.alTrk).definitionId)!.ownership.formationDefinitionId;
      const hqDefinitionId = piece(state, U.alHq).definitionId;
      const definitions = state.scenario.pieceCatalog.definitions.map((definition) => definition.id !== hqDefinitionId ? definition
        : { ...definition, ownership: { ...definition.ownership, formationDefinitionId: formationId } });
      return { ...state, scenario: { ...state.scenario, pieceCatalog: { ...state.scenario.pieceCatalog, definitions } } };
    };
    const withEngineer = { [U.alHq]: ['-1,6', 'COMBAT', 'combat'], [U.alTrk]: ['6,6', 'COMBAT', 'combat'], [U.alEng]: ['6,5', 'COMBAT', 'combat'] } as const;
    const withDivision = { [U.alHq]: ['-1,6', 'COMBAT', 'combat'], [U.alTrk]: ['6,6', 'COMBAT', 'combat'], [U.alLeg]: ['6,5', 'COMBAT', 'combat'] } as const;
    // At 6,5 a unit is in trace only through the HQ's throw.
    const noHq = buildGeneratedRuleState({ [U.alTrk]: ['6,6', 'COMBAT', 'combat'], [U.alEng]: ['6,5', 'COMBAT', 'combat'], [U.alLeg]: ['6,4', 'COMBAT', 'combat'] });
    expect(pieceHasTrace(noHq, piece(noHq, U.alEng))).toBe(false);
    // A corps HQ throws to the single-counter infantry division as to anyone else.
    const corps = buildGeneratedRuleState(withDivision);
    expect(pieceHasTrace(corps, piece(corps, U.alLeg))).toBe(true);
    // A divisional HQ throws to its own regiment and to an independent engineer...
    const ownAndIndependent = divisional(buildGeneratedRuleState(withEngineer));
    expect(pieceHasTrace(ownAndIndependent, piece(ownAndIndependent, U.alTrk))).toBe(true);
    expect(pieceHasTrace(ownAndIndependent, piece(ownAndIndependent, U.alEng))).toBe(true);
    // ...but not to another division: the XX counter in the engineer's Hex is a multi-step unit, not an independent one (3.2f).
    const otherDivision = divisional(buildGeneratedRuleState(withDivision));
    expect(pieceHasTrace(otherDivision, piece(otherDivision, U.alLeg))).toBe(false);
  });

  it('traces a formation through one HQ or one source, picked automatically (12.6f)', () => {
    const built = buildGeneratedRuleScenario({ [U.alHq]: ['-1,6', 'COMBAT', 'combat'], [U.alTrk]: ['6,6', 'COMBAT', 'combat'], [U.alTrk2]: ['16,1', 'COMBAT', 'combat'] });
    const sources = [...built.scenario.sources, { ...built.scenario.sources[0]!, id: 'source:test:second' as never, hexId: '15,1' as HexId }];
    const created = createInitialGameState({ ...built.scenario, sources }, built.configuration, 7);
    if (!created.ok) throw new Error('state');
    const state = atStep(created.value, 'SUPPLY', 'NONE', ALLIED);
    // The common route is picked automatically (most members; ties go to a direct draw): the HQ and one regiment trace, the other must eat or go OOS.
    expect(pieceHasTrace(state, piece(state, U.alTrk))).toBe(false);
    expect(pieceHasTrace(state, piece(state, U.alTrk2))).toBe(true);
    const formationId = state.scenario.pieceCatalog.definitions.find(({ id }) => id === piece(state, U.alTrk2).definitionId)!.ownership.formationDefinitionId!;
    const chosen = ok(applyRuleAction(state, ALLIED, { kind: 'CHOOSE_FORMATION_TRACE', formationId, routeKey: 'DRAW' }));
    expect(pieceHasTrace(chosen, piece(chosen, U.alTrk2))).toBe(true);
    expect(pieceHasTrace(chosen, piece(chosen, U.alTrk))).toBe(false);
  });

  it('shows the same trace coverage the Supply Phase applies, for any unit or for the selected one (12.6, 13.1d)', () => {
    const state = atStep(buildGeneratedRuleState({
      [U.alHq]: ['-1,6', 'COMBAT', 'combat'], [U.alTrk]: ['6,6', 'COMBAT', 'combat'], [U.alTrk2]: ['16,1', 'COMBAT', 'combat'], [U.alEng]: ['6,5', 'COMBAT', 'combat'],
    }), 'SUPPLY', 'NONE', ALLIED);
    const any = ruleEngine.queryTraceCoverage(state, ALLIED, null);
    expect(any.allowed).toBe(true);
    const anyHexes = any.value!.hexIds;
    expect(anyHexes.length).toBeGreaterThan(0);
    expect(anyHexes.length).toBeLessThan(state.scenario.mapDefinition.hexes.length);
    // A unit's own coverage contains its hex exactly when the Supply Phase would find it in trace.
    for (const id of [U.alTrk, U.alTrk2, U.alEng, U.alHq]) {
      const own = ruleEngine.queryTraceCoverage(state, ALLIED, id).value!.hexIds;
      expect(own.includes(piece(state, id).location.kind === 'ON_MAP' ? (piece(state, id).location as { hexId: string }).hexId : ''), id).toBe(pieceHasTrace(state, piece(state, id)));
      // Whatever one unit may use, some friendly unit may use too.
      expect(own.every((hexId) => anyHexes.includes(hexId))).toBe(true);
    }
    expect(ruleEngine.queryTraceCoverage(state, AXIS, U.alTrk).allowed).toBe(false);
  });

  it('shows a selected HQ where it can trace for itself, and its regiments where the HQ throws (12.3b, 12.6)', () => {
    const at = (placements: Parameters<typeof buildGeneratedRuleState>[0]) => atStep(buildGeneratedRuleState(placements), 'SUPPLY', 'NONE', ALLIED);
    const coverage = (state: GameState, id: PieceId | null) => new Set(ruleEngine.queryTraceCoverage(state, ALLIED, id).value!.hexIds);
    // With the HQ cut off at 8,6, "any unit" coverage is the bare draw area around the sources.
    const drawArea = coverage(at({ [U.alHq]: ['8,6', 'COMBAT', 'combat'] }), null);
    const connected = at({ [U.alHq]: ['-1,6', 'COMBAT', 'combat'], [U.alTrk]: ['6,6', 'COMBAT', 'combat'] });
    const throwArea = coverage(connected, null);
    expect(throwArea.size).toBeGreaterThan(drawArea.size);
    // The HQ standing elsewhere would draw there; it does not throw to itself from where it stands now.
    expect(coverage(connected, U.alHq)).toEqual(drawArea);
    // Its regiment traces through the HQ's throw, so it sees the throw range.
    expect(coverage(connected, U.alTrk)).toEqual(throwArea);
    expect(coverage(connected, U.alTrk).has('6,6')).toBe(true);
    // A cut-off formation has no common route yet, so the HQ still sees where it could get back into trace.
    const cutOff = at({ [U.alHq]: ['8,6', 'COMBAT', 'combat'] });
    expect(pieceHasTrace(cutOff, piece(cutOff, U.alHq))).toBe(false);
    expect(coverage(cutOff, U.alHq)).toEqual(drawArea);
  });

  it('separates trace that runs straight to a Supply Source from trace that only an HQ throw delivers (12.3a, 12.3b)', () => {
    const at = (placements: Parameters<typeof buildGeneratedRuleState>[0]) => atStep(buildGeneratedRuleState(placements), 'SUPPLY', 'NONE', ALLIED);
    const query = (state: GameState, id: PieceId | null) => {
      const { hexIds, directHexIds } = ruleEngine.queryTraceCoverage(state, ALLIED, id).value!;
      return { all: new Set(hexIds), direct: new Set(directHexIds) };
    };
    const drawArea = query(at({ [U.alHq]: ['8,6', 'COMBAT', 'combat'] }), null).all;
    const connected = at({ [U.alHq]: ['-1,6', 'COMBAT', 'combat'], [U.alTrk]: ['6,6', 'COMBAT', 'combat'] });
    const any = query(connected, null);
    // Direct trace is the bare draw area; the HQ's throw adds hexes that are covered but not direct.
    expect(any.direct).toEqual(drawArea);
    expect([...any.direct].every((hexId) => any.all.has(hexId))).toBe(true);
    expect([...any.all].some((hexId) => !any.direct.has(hexId))).toBe(true);
    // A selected HQ only shows its own draw, all of it direct: where it can stand and still throw.
    const hq = query(connected, U.alHq);
    expect(hq.direct).toEqual(hq.all);
    // The regiment's formation traces through the HQ (12.6f), so none of its coverage is direct.
    const regiment = query(connected, U.alTrk);
    expect(regiment.all.has('6,6')).toBe(true);
    expect(regiment.direct.size).toBe(0);
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
  it('brings nothing on Game Turn 1: the setup already holds its supply and Repls (13.6)', () => {
    const state = atStep(buildGeneratedRuleState({ [U.alLeg]: ['1,5', 'COMBAT', 'combat'] }, {}, { replacements: true }), 'AIRCRAFT_REFIT', 'NONE', ALLIED);
    expect(state.sequence.gameTurn).toBe(1);
    const result = applyRuleAction(state, ALLIED, { kind: 'ADVANCE_SEQUENCE' });
    ok(result);
    expect(result.events.filter(({ kind }) => kind === 'SUPPLY_ARRIVED' || kind === 'REPLACEMENTS_ARRIVED')).toEqual([]);
    expect(arrivingReinforcements(atStep(result.state, 'REINFORCEMENT', 'NONE', ALLIED), ALLIED)).toEqual([]);
  });

  it('rolls the Supply Table on entering the Reinforcement Phase and the SP must be placed', () => {
    const state = atStep(onGameTurn(buildGeneratedRuleState({ [U.alLeg]: ['1,5', 'COMBAT', 'combat'] }), 2), 'AIRCRAFT_REFIT', 'NONE', ALLIED);
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
    // The side's other entry Hexes stay open; the blocked one is replaced by its nearest open map-edge Hexes.
    const otherEntries = state.scenario.entries.filter(({ sideDefinitionId, hexId }) => sideDefinitionId === 'side:allied' && hexId !== '-3,6')
      .map(({ hexId }) => String(hexId));
    expect(otherEntries.length).toBeGreaterThan(0);
    expect(options).toEqual(expect.arrayContaining(otherEntries));
    const substitutes = options.filter((hexId) => !otherEntries.includes(String(hexId)));
    expect(substitutes.length).toBeGreaterThan(0);
    expect(substitutes.every((hexId) => hexDistanceBetween(hexId, '-3,6' as HexId) === 1)).toBe(true);
    expect(applyRuleAction(state, ALLIED, { kind: 'PLACE_REINFORCEMENT', pieceId: U.alLeg2, hexId: substitutes[0]! }).ok).toBe(true);
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
  it('changes Hex control only when a combat unit enters, never a truck (13.3h)', () => {
    const control = { '2,5': AXIS, '3,5': AXIS } as const;
    const state = atStep(buildGeneratedRuleState({ [U.alTruck]: ['1,5', null], [U.alLeg]: ['1,6', 'MOVE', 'combat'] }, {}, { control }), 'MOVEMENT', 'MOVEMENT', ALLIED);
    const controller = (current: GameState, hexId: string) => current.mapState.hexControl.find((entry) => entry.hexId === hexId)?.controllerId ?? null;
    const trucked = ok(applyRuleAction(state, ALLIED, { kind: 'MOVE_PIECE', pieceId: U.alTruck, path: path('1,5', '2,5', '3,5') }));
    expect([controller(trucked, '2,5'), controller(trucked, '3,5')]).toEqual([AXIS, AXIS]);
    const marched = ok(applyRuleAction(state, ALLIED, { kind: 'MOVE_PIECE', pieceId: U.alLeg, path: path('1,6', '2,5') }));
    expect(controller(marched, '2,5')).toBe(ALLIED);
  });

  it('projects each objective with its holder at once, before Clean Up scores the game', () => {
    const base = atStep(buildGeneratedRuleState({ [U.alLeg]: ['1,6', 'MOVE', 'combat'] }, {}, { control: { '2,5': null } }), 'MOVEMENT', 'MOVEMENT', ALLIED);
    const state = { ...base, configuration: { ...base.configuration, objectives: [{ hexId: '2,5' as HexId, points: 3 }] } };
    const holder = (current: GameState, viewer: typeof ALLIED) => ruleEngine.projectForViewer(current, viewer).objectives;
    expect(holder(state, AXIS)).toEqual([{ hexId: '2,5', points: 3, controllerId: null }]);
    const marched = ok(applyRuleAction(state, ALLIED, { kind: 'MOVE_PIECE', pieceId: U.alLeg, path: path('1,6', '2,5') }));
    expect(holder(marched, AXIS)).toEqual([{ hexId: '2,5', points: 3, controllerId: ALLIED }]);
  });

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

  it('keeps the supply of one Hex in one dump counter, whichever dump it was printed as', () => {
    const dumpsAt = (state: GameState, hex: string) => state.pieceState.pieces.filter((candidate) => candidate.location.kind === 'ON_MAP'
      && candidate.location.hexId === hex && candidate.ownerId === ALLIED && (candidate.resourceQuantity ?? 0) > 0
      && state.scenario.pieceCatalog.definitions.find(({ id }) => id === candidate.definitionId)?.family === 'RESOURCE');
    const base = atStep(buildGeneratedRuleState({ [U.alTruck]: ['1,5', null], [U.alSup]: ['1,5', null], [U.alLeg]: ['4,5', 'COMBAT', 'combat'] }), 'MOVEMENT', 'MOVEMENT', ALLIED);
    // A second dump of the same kind that was printed as a different piece (the scenario has one definition per dump), waiting at the destination.
    const firstDefinition = base.scenario.pieceCatalog.definitions.find(({ id }) => id === piece(base, U.alSup).definitionId)!;
    const secondDefinition = { ...firstDefinition, id: 'definition:test-second-supply' as typeof firstDefinition.id };
    const secondPiece = { ...piece(base, U.alSup), id: 'piece:test-second-supply' as PieceId, definitionId: secondDefinition.id, location: { kind: 'ON_MAP' as const, hexId: '4,5' as HexId }, stackOrder: 9 };
    const second = secondPiece.id;
    const state: GameState = {
      ...base,
      scenario: { ...base.scenario, pieceCatalog: { ...base.scenario.pieceCatalog, definitions: [...base.scenario.pieceCatalog.definitions, secondDefinition] } },
      pieceState: { ...base.pieceState, pieces: [...base.pieceState.pieces, secondPiece] },
    };
    const waiting = piece(state, second).resourceQuantity!;
    const carried = piece(state, U.alSup).resourceQuantity!;
    const loaded = ok(applyRuleAction(state, ALLIED, { kind: 'LOAD_SUPPLY', truckId: U.alTruck, dumpId: U.alSup, tokens: carried }));
    const moved = ok(applyRuleAction(loaded, ALLIED, { kind: 'MOVE_PIECE', pieceId: U.alTruck, path: path('1,5', '2,5', '3,5', '4,5') }));
    // Unloading where another dump already stands adds to that dump; it does not leave a second counter beside it.
    const unloaded = ok(applyRuleAction(moved, ALLIED, { kind: 'UNLOAD_SUPPLY', truckId: U.alTruck, tokens: carried }));
    expect(dumpsAt(unloaded, '4,5').map(({ id, resourceQuantity }) => [id, resourceQuantity])).toEqual([[second, waiting + carried]]);
    // The load that was unloaded is gone as a counter (its tokens now belong to the dump).
    expect(piece(unloaded, U.alSup).location.kind).toBe('ELIMINATED');

    // A dump placed where the same kind of supply already lies (a reinforcement dump arriving) joins it as well.
    const crowded = { ...state, pieceState: { ...state.pieceState, pieces: state.pieceState.pieces.map((candidate) => candidate.id === U.alSup
      ? { ...candidate, location: { kind: 'ON_MAP' as const, hexId: '4,5' as HexId } } : candidate) } };
    expect(dumpsAt(crowded, '4,5')).toHaveLength(2);
    const merged = mergeSupplyAt(crowded, '4,5' as HexId, ALLIED);
    expect(dumpsAt(merged, '4,5').map(({ resourceQuantity }) => resourceQuantity)).toEqual([waiting + carried]);
    // Dumps of different owners never merge.
    expect(dumpsAt(mergeSupplyAt(crowded, '4,5' as HexId, AXIS), '4,5')).toHaveLength(2);
  });

  it('lets a truck that already moved divide and then combine again at no MP cost (13.2c, 6.1f)', () => {
    const state = atStep(buildGeneratedRuleState({ [U.alTruck]: ['1,5', null] }), 'MOVEMENT', 'MOVEMENT', ALLIED);
    const moved = ok(applyRuleAction(state, ALLIED, { kind: 'MOVE_PIECE', pieceId: U.alTruck, path: path('1,5', '2,5') }));
    const spent = moved.usage.find(({ pieceId }) => pieceId === U.alTruck)!.movementSpentTicks;
    expect(spent).toBeGreaterThan(0);
    const known = new Set(moved.pieceState.pieces.map(({ id }) => id));
    const divided = ok(applyRuleAction(moved, ALLIED, { kind: 'DIVIDE_TRANSPORT', truckId: U.alTruck, points: 1 }));
    const splitId = divided.pieceState.pieces.find(({ id }) => !known.has(id))!.id;
    // Both parts are in the same Hex and the move is not over for them: Combine is legal, for either one selected.
    for (const selected of [U.alTruck, splitId]) {
      const actions = ruleEngine.getActionCandidates(divided, { actorId: ALLIED, kind: 'COMBINE_TRANSPORT', pieceId: selected, budget: 5 }).actions;
      expect(actions.map(({ kind }) => kind), `selected ${selected}`).toEqual(['COMBINE_TRANSPORT']);
    }
    const combined = ok(applyRuleAction(divided, ALLIED, { kind: 'COMBINE_TRANSPORT', truckIds: [U.alTruck, splitId] }));
    // The combined counter has spent as much as the most-used part, and no more (6.1f).
    expect(combined.usage.find(({ pieceId }) => pieceId === U.alTruck)!.movementSpentTicks).toBe(spent);
    // The part split off may itself continue to move with what is left of the allowance.
    const explanation = ruleEngine.explain(divided, { actionId: 'probe', actorId: ALLIED, expectedRevision: divided.revision, kind: 'MOVE_PIECE', pieceId: splitId, path: path('2,5', '3,5') } as never);
    expect(explanation.allowed).toBe(true);
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

  it('counts a multi-unit formation as at most 3 RE for barrage density (10.0a), and an independent HQ outside that cap', () => {
    // STANDARD scale: three 1-RE regiments, artillery and recon make the formation 4 RE in one hex.
    const request = { ...RULE_FIXTURE_NEW_GAME_REQUEST, oob: { ...RULE_FIXTURE_NEW_GAME_REQUEST.oob, scale: 'STANDARD' as const } };
    const pid = (fragment: string) => generatedPieceId(fragment, request);
    const formation = Object.fromEntries(['allied:f1-combat-1', 'allied:f1-combat-2', 'allied:f1-combat-3', 'allied:f1-artillery-1', 'allied:f1-recon']
      .map((fragment) => [pid(fragment), ['6,5', 'COMBAT', 'combat'] as const]));
    const enemy = { [pid('axis:f1-artillery-1')]: ['8,5', 'COMBAT', 'combat'] as const, [pid('axis:independent-supply-1')]: ['9,5', null] as const };
    const density = (placement: Parameters<typeof buildGeneratedRuleState>[0]) => previewBarrage(
      atStep(buildGeneratedRuleState(placement, {}, { request }), 'COMBAT', 'BARRAGE', AXIS), AXIS, [pid('axis:f1-artillery-1')], '6,5' as HexId,
    ).shifts.find(({ reason }) => reason === 'Density')?.shift;
    // 4 RE counted as 3: no shift (uncapped, 4 RE would shift one column right).
    expect(density({ ...formation, ...enemy })).toBe(0);
    // The HQ belongs to no formation (3.2f), so its 1/2 RE adds to the capped 3 RE: 3.5 RE shifts one column.
    expect(density({ ...formation, [pid('allied:independent-hq-1')]: ['6,5', 'COMBAT', 'combat'], ...enemy })).toBe(1);
  });
});
