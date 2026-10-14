import { describe, expect, it } from 'vitest';
import {
  ALLIED,
  AXIS,
  REBUILD_TABLE_ROWS,
  REPLACEMENTS_PER_TURN,
  RULE_FIXTURE_NEW_GAME_REQUEST,
  applyRuleAction,
  atStep,
  buildGeneratedRuleState,
  consolidationOptions,
  generatedPieceId,
  hasOptionalActions,
  identicalCounters,
  onGameTurn,
  parseGameStateJson,
  priceRebuild,
  rebuildCost,
  rebuildPriceOf,
  rebuildTableOf,
  ruleEngine,
  serializeGameState,
  unitRebuildOptions,
  defaultUnitRebuild,
  validateGameState,
  variableReplacementTable,
  type GameState,
  type HexId,
  type NewGameRequest,
  type PieceId,
  type PieceState,
  type RuleEvent,
  type TransitionResult,
} from '../../src/index.js';
import { definitionOf, withInternalStocks } from '../../src/rules/pieces.js';

const hex = (column: number, row = 4): HexId => `${column - Math.floor(row / 2)},${row}` as HexId;
const ok = (result: TransitionResult): GameState => {
  expect(result.ok, result.ok ? '' : result.violations.map(({ code, message }) => `${code}: ${message}`).join('; ')).toBe(true);
  return result.state;
};
const codes = (result: TransitionResult): readonly string[] => result.ok ? [] : result.violations.map(({ code }) => code);
const piece = (state: GameState, pieceId: string) => state.pieceState.pieces.find((entry) => entry.id === pieceId)!;
const withPiece = (state: GameState, pieceId: PieceId, patch: (entry: PieceState) => PieceState): GameState => ({
  ...state, pieceState: { ...state.pieceState, pieces: state.pieceState.pieces.map((entry) => entry.id === pieceId ? patch(entry) : entry) },
});
const events = (result: TransitionResult): readonly RuleEvent[] => result.ok ? result.events : [];

/** 2d6 probability of each total. */
const P = (total: number): number => (6 - Math.abs(total - 7)) / 36;

describe('Variable Replacement Table (13.5)', () => {
  it('covers every 2d6 total at each scale and averages the old fixed allotment', () => {
    for (const scale of ['COMPACT', 'STANDARD', 'LARGE'] as const) {
      const rows = variableReplacementTable(scale);
      for (let total = 2; total <= 12; total += 1) expect(rows.filter(({ minimum, maximum }) => total >= minimum && total <= maximum)).toHaveLength(1);
      const mean = (key: 'pax' | 'eq') => rows.reduce((sum, row) => sum + P(row.minimum) * row[key], 0);
      expect(Math.abs(mean('pax') - REPLACEMENTS_PER_TURN[scale].PAX)).toBeLessThanOrEqual(0.1);
      expect(Math.abs(mean('eq') - REPLACEMENTS_PER_TURN[scale].EQ)).toBeLessThanOrEqual(0.1);
    }
  });

  it('is rolled in each Reinforcement Phase and brings one unit per Repl rolled', () => {
    const start = atStep(onGameTurn(buildGeneratedRuleState({ [generatedPieceId('allied:independent-hq-1')]: [hex(2), 'COMBAT', 'combat'] }, {}, { replacements: true }), 2), 'AIRCRAFT_REFIT', 'NONE', ALLIED);
    expect(start.configuration.replacementArrivals?.players.map(({ playerId }) => playerId)).toEqual([ALLIED, AXIS]);
    const result = applyRuleAction(start, ALLIED, { kind: 'ADVANCE_SEQUENCE' });
    const state = ok(result);
    const rolled = events(result).find((event) => event.kind === 'REPLACEMENT_TABLE_ROLLED');
    expect(rolled).toMatchObject({ playerId: ALLIED });
    if (rolled?.kind !== 'REPLACEMENT_TABLE_ROLLED') return;
    const row = variableReplacementTable('COMPACT').find(({ minimum }) => minimum === rolled.roll)!;
    expect([rolled.pax, rolled.eq]).toEqual([row.pax, row.eq]);
    const arrived = state.pieceState.pieces.filter((entry) => entry.ownerId === ALLIED && String(entry.id).startsWith(`repl-arrival:${ALLIED}:2`));
    const kind = (entry: PieceState) => String(definitionOf(state, entry)?.id).endsWith(':personnel') ? 'PAX' : 'EQ';
    expect(arrived.filter((entry) => kind(entry) === 'PAX')).toHaveLength(row.pax);
    expect(arrived.filter((entry) => kind(entry) === 'EQ')).toHaveLength(row.eq);
    expect(arrived.every((entry) => entry.remainingSteps === 1 && entry.mode === 'MOVE')).toBe(true);
    expect(state.rng.draws).toBeGreaterThan(start.rng.draws);
  });

  it('falls back to the fixed allotment, without a roll, in a game saved before the table existed', () => {
    const built = buildGeneratedRuleState({ [generatedPieceId('allied:independent-hq-1')]: [hex(2), 'COMBAT', 'combat'] }, {}, { replacements: true });
    const { replacementArrivals: _dropped, ...configuration } = built.configuration;
    const start = atStep(onGameTurn({ ...built, configuration }, 2), 'AIRCRAFT_REFIT', 'NONE', ALLIED);
    const result = applyRuleAction(start, ALLIED, { kind: 'ADVANCE_SEQUENCE' });
    ok(result);
    expect(events(result).some((event) => event.kind === 'REPLACEMENT_TABLE_ROLLED')).toBe(false);
    const arrived = events(result).filter((event) => event.kind === 'REPLACEMENTS_ARRIVED' && event.playerId === ALLIED);
    expect(arrived).toHaveLength(REPLACEMENTS_PER_TURN.COMPACT.PAX + REPLACEMENTS_PER_TURN.COMPACT.EQ);
  });

  it('rejects a table that leaves a 2d6 total uncovered', () => {
    const state = buildGeneratedRuleState({}, {}, { replacements: true });
    const broken = { ...state, configuration: { ...state.configuration, replacementArrivals: { players: [{ playerId: ALLIED, rows: variableReplacementTable('COMPACT').slice(1) }] } } };
    expect(validateGameState(broken).map(({ code }) => code)).toContain('INVALID_REPLACEMENT_TABLE');
    expect(validateGameState(state).map(({ code }) => code)).not.toContain('INVALID_REPLACEMENT_TABLE');
  });
});

describe('Rebuild Table (13.5a, 13.5d)', () => {
  const state = buildGeneratedRuleState({}, {}, { replacements: true });
  const table = rebuildTableOf(state, ALLIED);
  const priceOf = (fragment: string) => rebuildPriceOf(state, piece(state, generatedPieceId(fragment)));

  it('lists every rebuildable ground unit of the side once, on the rows the generator prints', () => {
    const listed = table.flatMap(({ definitionIds }) => definitionIds.map(String));
    expect(new Set(listed).size).toBe(listed.length);
    expect(table.map(({ id }) => id)).toEqual(REBUILD_TABLE_ROWS.map(({ id }) => id).filter((rowId) => table.some((row) => row.id === rowId)));
    for (const definition of state.scenario.pieceCatalog.definitions) {
      if (String(definition.ownership.sideDefinitionId) !== 'side:allied' || definition.family !== 'GROUND' || !definition.counter) continue;
      const neverReturns = !definition.counter.rebuildable || definition.counter.kind === 'TRANSPORT';
      expect(listed.includes(String(definition.id)), definition.name).toBe(!neverReturns);
    }
  });

  it('prices HQs in Pax and Eq, armor and artillery in Eq, infantry in Pax, and small battalions two for one', () => {
    expect(priceOf('allied:independent-hq-1')).toMatchObject({ row: 'hq', pax: 1, eq: 1, pairs: false });
    expect(priceOf('allied:f1-combat-1')).toMatchObject({ row: 'armor-mech', pax: 0, eq: 1 });
    expect(priceOf('allied:independent-anti_tank-1')).toMatchObject({ row: 'armor-mech', pax: 0, eq: 1 });
    expect(priceOf('allied:independent-artillery-1')).toMatchObject({ row: 'artillery', pax: 0, eq: 1 });
    expect(priceOf('allied:f2-combat-1')).toMatchObject({ row: 'infantry', pax: 1, eq: 0 });
    expect(priceOf('allied:garrison:objective-1')).toMatchObject({ row: 'small-infantry', pax: 1, eq: 0, pairs: true });
    expect(priceOf('allied:independent-transport-1')).toBeNull();
  });

  it('charges one Repl for a pair of small units and one for a single one (13.5d)', () => {
    const small = { row: 'small', label: 'small', pax: 1, eq: 0, pairs: true };
    const infantry = { row: 'infantry', label: 'infantry', pax: 1, eq: 0, pairs: false };
    const hq = { row: 'hq', label: 'hq', pax: 1, eq: 1, pairs: false };
    expect(priceRebuild([{ price: small, steps: 1 }], 0)).toEqual({ PAX: 1, EQ: 0 });
    expect(priceRebuild([{ price: small, steps: 1 }, { price: small, steps: 1 }], 0)).toEqual({ PAX: 1, EQ: 0 });
    expect(priceRebuild([{ price: small, steps: 1 }, { price: small, steps: 1 }, { price: small, steps: 1 }], 0)).toEqual({ PAX: 2, EQ: 0 });
    expect(priceRebuild([{ price: infantry, steps: 3 }, { price: hq, steps: 1 }], 2)).toEqual({ PAX: 4, EQ: 3 });
  });

  it('rebuilds two dead garrisons for one Pax, and the default rebuild fills the pair', () => {
    const hq = generatedPieceId('allied:independent-hq-1');
    const garrison = generatedPieceId('allied:garrison:objective-1');
    let start = atStep(buildGeneratedRuleState({ [hq]: [hex(2), 'COMBAT', 'combat'], [generatedPieceId('axis:f1-combat-1')]: [hex(14), 'COMBAT', 'combat'] }, {}, { replacements: true }), 'REINFORCEMENT', 'NONE', ALLIED);
    const original = piece(start, garrison);
    const pax = (id: string): PieceState => ({ ...original, id: id as PieceId, definitionId: start.scenario.pieceCatalog.definitions.find((d) => String(d.id).endsWith(':allied:personnel'))!.id,
      location: { kind: 'ON_MAP', hexId: hex(3) }, currentFaceId: 'move' as never, remainingSteps: 1, mode: 'MOVE', statuses: [], resourceQuantity: 1, stackOrder: 5 });
    start = { ...start, pieceState: { ...start.pieceState, pieces: [...start.pieceState.pieces, { ...original, id: 'garrison:copy' as PieceId }, pax('repl:pax')] } };
    expect(rebuildCost(start, [{ pieceId: garrison, steps: 1, mode: 'COMBAT' }, { pieceId: 'garrison:copy' as PieceId, steps: 1, mode: 'COMBAT' }], 0)).toEqual({ PAX: 1, EQ: 0 });
    const option = unitRebuildOptions(start, ALLIED).find(({ hexId }) => hexId === hex(3))!;
    const chosen = defaultUnitRebuild(option).units.map(({ pieceId }) => pieceId);
    expect(chosen).toEqual(expect.arrayContaining([garrison, 'garrison:copy']));
    const after = ok(applyRuleAction(start, ALLIED, {
      kind: 'REBUILD_UNITS', hexId: hex(3), hqId: hq, truckPoints: 0,
      units: [{ pieceId: garrison, steps: 1, mode: 'COMBAT' }, { pieceId: 'garrison:copy' as PieceId, steps: 1, mode: 'COMBAT' }],
    }));
    expect(piece(after, garrison).location).toEqual({ kind: 'ON_MAP', hexId: hex(3) });
    expect(piece(after, 'garrison:copy').location).toEqual({ kind: 'ON_MAP', hexId: hex(3) });
    expect(piece(after, 'repl:pax').location.kind).toBe('ELIMINATED');
  });

  it('refuses an HQ rebuild without both its Pax and its Eq', () => {
    const request: NewGameRequest = { ...RULE_FIXTURE_NEW_GAME_REQUEST, oob: { scale: 'COMPACT', divisionsPerSide: 4, armoredDivisionsPerSide: 2 } };
    const dead = generatedPieceId('allied:independent-hq-2', request);
    let start = atStep(buildGeneratedRuleState({ [generatedPieceId('allied:independent-hq-1', request)]: [hex(2), 'COMBAT', 'combat'] }, {}, { replacements: true, request }), 'REINFORCEMENT', 'NONE', ALLIED);
    const paxDefinition = start.scenario.pieceCatalog.definitions.find((d) => String(d.id).endsWith(':allied:personnel'))!;
    start = { ...start, pieceState: { ...start.pieceState, pieces: [...start.pieceState.pieces, {
      id: 'repl:pax' as PieceId, definitionId: paxDefinition.id, ownerId: ALLIED, location: { kind: 'ON_MAP', hexId: hex(3) },
      currentFaceId: 'move' as never, remainingSteps: 1, mode: 'MOVE', statuses: [], resourceQuantity: 1, stackOrder: 5,
    }] } };
    const result = applyRuleAction(start, ALLIED, { kind: 'REBUILD_UNITS', hexId: hex(3), hqId: generatedPieceId('allied:independent-hq-1', request), truckPoints: 0, units: [{ pieceId: dead, steps: 1, mode: 'COMBAT' }] });
    expect(codes(result)).toContain('NOT_ENOUGH_EQUIPMENT');
  });

  it('keeps the generic per-counter costs in a game saved before the table existed', () => {
    const { rebuildTables: _dropped, ...configuration } = state.configuration;
    const legacy = { ...state, configuration };
    expect(rebuildPriceOf(legacy, piece(legacy, generatedPieceId('allied:independent-hq-1')))).toMatchObject({ pax: 1, eq: 0 });
    expect(rebuildPriceOf(legacy, piece(legacy, generatedPieceId('allied:garrison:objective-1')))).toMatchObject({ pax: 1, eq: 0, pairs: false });
  });

  it('survives a snapshot round trip', () => {
    const serialized = serializeGameState(state);
    const parsed = serialized.ok ? parseGameStateJson(serialized.value) : null;
    expect(parsed?.ok).toBe(true);
    if (parsed?.ok) expect(parsed.value.configuration.rebuildTables).toEqual(state.configuration.rebuildTables);
  });
});

describe('Unit Consolidation (13.9-1 to 3)', () => {
  const INFANTRY: NewGameRequest = { ...RULE_FIXTURE_NEW_GAME_REQUEST, oob: { scale: 'COMPACT', divisionsPerSide: 6, armoredDivisionsPerSide: 0 } };
  const ARMORED: NewGameRequest = { ...RULE_FIXTURE_NEW_GAME_REQUEST, oob: { scale: 'COMPACT', divisionsPerSide: 4, armoredDivisionsPerSide: 2 } };
  const consolidate = (state: GameState, consolidation: 'MERGE' | 'SWAP', pieceId: PieceId, withId: PieceId) =>
    applyRuleAction(state, ALLIED, { kind: 'CONSOLIDATE_UNITS', consolidation, pieceId, withId });

  const infantry = () => {
    const [a, b, c] = ['allied:f2-combat-1', 'allied:f3-combat-1', 'allied:f4-combat-1'].map((fragment) => generatedPieceId(fragment, INFANTRY));
    let state = atStep(buildGeneratedRuleState({ [a!]: [hex(4), 'MOVE', 'move'], [b!]: [hex(4), 'MOVE', 'move'], [c!]: [hex(6), 'MOVE', 'move'] }, {}, { request: INFANTRY }), 'REINFORCEMENT', 'NONE', ALLIED);
    state = withPiece(withPiece(state, a!, (entry) => ({ ...entry, remainingSteps: 2 })), b!, (entry) => ({ ...entry, remainingSteps: 1 }));
    return { state, a: a!, b: b!, c: c! };
  };

  it('treats two infantry divisions of different numbers as identical counters', () => {
    const { state, a, b } = infantry();
    expect(identicalCounters(state, piece(state, a), piece(state, b))).toBe(true);
  });

  it('combines two reduced identical divisions in one hex; the giver goes to the Dead Pile (13.9-1)', () => {
    const { state, a, b } = infantry();
    expect(consolidationOptions(state, ALLIED)).toEqual([expect.objectContaining({ consolidation: 'MERGE', steps: 1 })]);
    const result = consolidate(state, 'MERGE', a, b);
    const after = ok(result);
    expect(piece(after, a).remainingSteps).toBe(3);
    expect(piece(after, b).location.kind).toBe('ELIMINATED');
    expect(events(result)).toEqual([expect.objectContaining({ kind: 'UNITS_CONSOLIDATED', consolidation: 'MERGE', steps: 1 })]);
  });

  it('never grows a unit beyond full strength: excess steps are lost', () => {
    const { state: base, a, b } = infantry();
    const state = withPiece(withPiece(base, a, (entry) => ({ ...entry, remainingSteps: 3 })), b, (entry) => ({ ...entry, remainingSteps: 3 }));
    const after = ok(consolidate(state, 'MERGE', a, b));
    expect(piece(after, a).remainingSteps).toBe(4);
    expect(piece(after, b).location.kind).toBe('ELIMINATED');
  });

  it('refuses units in different hexes, DG units, units with Low internal stocks and the wrong phase', () => {
    const { state, a, b, c } = infantry();
    expect(codes(consolidate(state, 'MERGE', a, c))).toContain('CONSOLIDATION_NOT_STACKED');
    expect(codes(consolidate(withPiece(state, b, (entry) => ({ ...entry, mode: 'DG' })), 'MERGE', a, b))).toContain('CONSOLIDATION_BLOCKED');
    expect(codes(consolidate(withPiece(state, b, (entry) => withInternalStocks(entry, 'LOW')), 'MERGE', a, b))).toContain('CONSOLIDATION_BLOCKED');
    expect(codes(consolidate(atStep(state, 'MOVEMENT', 'MOVEMENT', ALLIED), 'MERGE', a, b))).toContain('INVALID_CONSOLIDATION_PHASE');
  });

  it('refuses units that are not identical on both sides', () => {
    const { state, a } = infantry();
    const airborne = generatedPieceId('allied:f1-combat-1', INFANTRY);
    const placed = withPiece(state, airborne, (entry) => ({ ...entry, location: { kind: 'ON_MAP', hexId: hex(4) }, remainingSteps: 1, mode: 'MOVE', currentFaceId: 'move' as never }));
    expect(codes(consolidate(placed, 'MERGE', a, airborne))).toContain('CONSOLIDATION_NOT_IDENTICAL');
  });

  it('exchanges a unit for an identical one of another division from the Dead Pile, keeping place, mode and steps (13.9-2)', () => {
    const brown = generatedPieceId('allied:f1-combat-1', ARMORED);
    const regiment = generatedPieceId('allied:f2-combat-1', ARMORED);
    const state = atStep(buildGeneratedRuleState({ [brown]: [hex(5), 'COMBAT', 'combat'] }, {}, { request: ARMORED }), 'REINFORCEMENT', 'NONE', ALLIED);
    expect(consolidationOptions(state, ALLIED)).toEqual(expect.arrayContaining([expect.objectContaining({ consolidation: 'SWAP' })]));
    const after = ok(consolidate(state, 'SWAP', brown, regiment));
    expect(piece(after, regiment)).toMatchObject({ location: { kind: 'ON_MAP', hexId: hex(5) }, mode: 'COMBAT', currentFaceId: 'combat', remainingSteps: piece(state, brown).remainingSteps });
    expect(piece(after, brown).location.kind).toBe('ELIMINATED');
  });

  it('lets an independent unit join a division, never the reverse (13.9-3)', () => {
    const independent = generatedPieceId('allied:independent-artillery-1');
    const divisional = generatedPieceId('allied:f1-artillery-1');
    const joining = atStep(buildGeneratedRuleState({ [independent]: [hex(5), 'COMBAT', 'combat'] }), 'REINFORCEMENT', 'NONE', ALLIED);
    const joined = ok(consolidate(joining, 'SWAP', independent, divisional));
    expect(piece(joined, divisional).location).toEqual({ kind: 'ON_MAP', hexId: hex(5) });
    const leaving = atStep(buildGeneratedRuleState({ [divisional]: [hex(5), 'COMBAT', 'combat'] }), 'REINFORCEMENT', 'NONE', ALLIED);
    expect(codes(consolidate(leaving, 'SWAP', divisional, independent))).toContain('CONSOLIDATION_TO_INDEPENDENT');
  });

  it('refuses an exchange within the same division', () => {
    const brown = generatedPieceId('allied:f1-combat-1', ARMORED);
    const chap = generatedPieceId('allied:f1-combat-2', ARMORED);
    const state = atStep(buildGeneratedRuleState({ [brown]: [hex(5), 'COMBAT', 'combat'] }, {}, { request: ARMORED }), 'REINFORCEMENT', 'NONE', ALLIED);
    expect(codes(consolidate(state, 'SWAP', brown, chap))).toContain('CONSOLIDATION_SAME_FORMATION');
  });

  it('is offered as a candidate action but never stops the Reinforcement Phase on its own', () => {
    const { state } = infantry();
    const candidates = ruleEngine.getActionCandidates(state, { actorId: ALLIED, kind: 'CONSOLIDATE_UNITS', pieceId: null, budget: 10 });
    expect(candidates.actions).toEqual([expect.objectContaining({ kind: 'CONSOLIDATE_UNITS', consolidation: 'MERGE' })]);
    expect(hasOptionalActions(state)).toBe(false);
  });
});
