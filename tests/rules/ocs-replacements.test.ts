import { describe, expect, it } from 'vitest';
import {
  ALLIED,
  AXIS,
  REPLACEMENTS_PER_TURN,
  RULE_FIXTURE_NEW_GAME_REQUEST,
  applyDisplacement,
  captureAt,
  createRulesRng,
  applyRuleAction,
  arrivingReinforcements,
  atStep,
  onGameTurn,
  buildGeneratedRuleState,
  generateRandomOob,
  generatedPieceId,
  hasOptionalActions,
  lostTruckPoints,
  parseGameStateJson,
  reinforcementHexes,
  ruleEngine,
  queryMovementPath,
  derivePieceReTicks,
  queryStacking,
  movementAllowanceTicks,
  arriveReplacements,
  mergeReplacementsAt,
  determineSupply,
  settleInterrupts,
  declareTestCombat,
  settleDecisions,
  exertsZoc,
  serializeGameState,
  upgradeLegacyGameStateInput,
  type GameState,
  type HexId,
  type OcsMode,
  type PieceId,
  type PieceState,
  type RuleEvent,
  type TransitionResult,
  type UnitRebuild,
} from '../../src/index.js';

import { isCombatUnit, isAttackCapable, needsFuel } from '../../src/rules/pieces.js';

const id = (fragment: string) => generatedPieceId(fragment);
const U = {
  hq: id('allied:independent-hq-1'),
  armor: id('allied:f1-combat-1'),
  division: id('allied:f2-combat-1'),
  truck: id('allied:independent-transport-1'),
  enemy: id('axis:f1-combat-1'),
};
const hex = (column: number, row = 4): HexId => `${column - Math.floor(row / 2)},${row}` as HexId;
const REPLS = hex(3);

const ok = (result: TransitionResult): GameState => {
  expect(result.ok, result.ok ? '' : result.violations.map(({ code, message }) => `${code}: ${message}`).join('; ')).toBe(true);
  return result.state;
};
const codes = (result: TransitionResult): readonly string[] => result.ok ? [] : result.violations.map(({ code }) => code);
const piece = (state: GameState, pieceId: string) => state.pieceState.pieces.find((entry) => entry.id === pieceId)!;
const withPiece = (state: GameState, pieceId: PieceId, patch: (entry: PieceState) => PieceState): GameState => ({
  ...state, pieceState: { ...state.pieceState, pieces: state.pieceState.pieces.map((entry) => entry.id === pieceId ? patch(entry) : entry) },
});
const replacementDefinition = (state: GameState, kind: 'personnel' | 'equipment') =>
  state.scenario.pieceCatalog.definitions.find((candidate) => candidate.family === 'REPLACEMENT' && String(candidate.id).endsWith(`:allied:${kind}`))!;

/** Allied HQ in Combat Mode at hex 2; the three-step division, reduced to one step, stacked with Pax and Eq at hex 3. Unplaced units are in the Dead Pile. */
const setup = (pax = 2, eq = 1, over: { hqMode?: OcsMode; replsAt?: HexId } = {}): GameState => {
  const built = buildGeneratedRuleState({
    [U.hq]: [hex(2), over.hqMode ?? 'COMBAT', over.hqMode === 'MOVE' ? 'move' : 'combat'],
    [U.division]: [REPLS, 'MOVE', 'move'],
    [U.enemy]: [hex(14), 'COMBAT', 'combat'],
  }, {}, { replacements: true });
  let state = atStep(built, 'REINFORCEMENT', 'NONE', ALLIED);
  state = withPiece(state, U.division, (entry) => ({ ...entry, remainingSteps: 1 }));
  const at = over.replsAt ?? REPLS;
  const counters: PieceState[] = (['pax', 'eq'] as const).flatMap((kind, k) =>
    Array.from({ length: kind === 'pax' ? pax : eq }, (_, index): PieceState => ({
      id: `repl:${kind}${index ? `:${index + 1}` : ''}` as PieceId,
      definitionId: replacementDefinition(state, kind === 'pax' ? 'personnel' : 'equipment').id,
      ownerId: ALLIED, location: { kind: 'ON_MAP', hexId: at },
      currentFaceId: 'move' as never, remainingSteps: 1, mode: 'MOVE', statuses: [], resourceQuantity: 1, stackOrder: 8 + k * 20 + index,
    })));

  return { ...state, pieceState: { ...state.pieceState, pieces: [...state.pieceState.pieces, ...counters] } };
};
const rebuild = (state: GameState, units: readonly UnitRebuild[], truckPoints = 0, over: Partial<{ hexId: HexId; hqId: PieceId }> = {}) =>
  applyRuleAction(state, ALLIED, { kind: 'REBUILD_UNITS', hexId: REPLS, hqId: U.hq, units, truckPoints, ...over });

describe('Pax and Eq are built into every generated game (13.5)', () => {
  it('gives both sides Pax and Eq Definitions at every scale, with or without air forces', () => {
    for (const scale of ['COMPACT', 'STANDARD', 'LARGE'] as const) {
      for (const air of [undefined, 'STANDARD'] as const) {
        const generated = generateRandomOob({ seed: 11, scale, divisionsPerSide: 2, armoredDivisionsPerSide: 1, ...(air ? { air } : {}) });
        expect(generated.ok).toBe(true);
        if (!generated.ok) continue;
        const replacements = generated.value.pieceDefinitionCatalog.definitions.filter(({ family }) => family === 'REPLACEMENT');
        for (const side of ['allied', 'axis']) {
          const perTurn = (kind: string) => replacements.find(({ id: defId }) => String(defId).endsWith(`:${side}:${kind}`))
            ?.capabilities[0]?.parameters.find(({ key }) => key === 'perTurn');
          expect(perTurn('personnel')).toMatchObject({ kind: 'INTEGER', value: REPLACEMENTS_PER_TURN[scale].PAX });
          expect(perTurn('equipment')).toMatchObject({ kind: 'INTEGER', value: REPLACEMENTS_PER_TURN[scale].EQ });
        }
      }
    }
  });

  it('includes aircraft reinforcements with air forces, without a separate option', () => {
    const generated = generateRandomOob({ seed: 11, scale: 'STANDARD', divisionsPerSide: 2, armoredDivisionsPerSide: 1, air: 'STANDARD' });
    expect(generated.ok && generated.value.sides.every(({ independentUnits }) => independentUnits.some(({ arrivalTurn }) => arrivalTurn !== undefined))).toBe(true);
  });

  it('accepts an older request that still carries the retired airSupport option', () => {
    const legacy = { seed: 11, scale: 'STANDARD', divisionsPerSide: 2, armoredDivisionsPerSide: 1, air: 'STANDARD', airSupport: 'NONE' } as never;
    const generated = generateRandomOob(legacy);
    expect(generated.ok).toBe(true);
    expect(generated.ok && 'airSupport' in generated.value.options).toBe(false);
  });
});

describe('Repls arrive and are placed (13.5)', () => {
  it('creates a Pax and an Eq counter in the reinforcement Box each Reinforcement Phase', () => {
    let state = atStep(onGameTurn(buildGeneratedRuleState({ [U.hq]: [hex(2), 'COMBAT', 'combat'] }, {}, { replacements: true }), 2), 'AIRCRAFT_REFIT', 'NONE', ALLIED);
    state = ok(applyRuleAction(state, ALLIED, { kind: 'ADVANCE_SEQUENCE' }));
    expect(state.sequence.phase).toBe('REINFORCEMENT');
    const turn = state.sequence.gameTurn;
    const pax = piece(state, `repl-arrival:${ALLIED}:${turn}:pax`);
    const eq = piece(state, `repl-arrival:${ALLIED}:${turn}`);
    expect(pax.resourceQuantity).toBe(REPLACEMENTS_PER_TURN.COMPACT.PAX);
    expect(eq.resourceQuantity).toBe(REPLACEMENTS_PER_TURN.COMPACT.EQ);
    expect(arrivingReinforcements(state, ALLIED).map(({ id: arrived }) => arrived)).toEqual(expect.arrayContaining([pax.id, eq.id]));
    // Beside the HQ (13.5a) is a legal place for them.
    expect(reinforcementHexes(state, ALLIED, pax.id)).toContain(hex(3));
  });

  it('keeps Repls placed in one hex independent for movement, supply and losses', () => {
    let state = setup(1, 1);
    const box = state.configuration.reinforcementBoxes.find(({ playerId }) => playerId === ALLIED)!.boxId;
    const extra: PieceState = { ...piece(state, 'repl:pax'), id: 'repl:pax2' as PieceId, location: { kind: 'OFF_MAP_BOX', boxId: box }, resourceQuantity: 1, stackOrder: 0 };
    state = { ...state, pieceState: { ...state.pieceState, pieces: [...state.pieceState.pieces, extra] } };
    state = ok(applyRuleAction(state, ALLIED, { kind: 'PLACE_REINFORCEMENT', pieceId: extra.id, hexId: REPLS }));
    const here = state.pieceState.pieces.filter((entry) => entry.location.kind === 'ON_MAP' && entry.location.hexId === REPLS && String(entry.id).startsWith('repl:'));
    expect(here.map(({ id: hereId, resourceQuantity }) => [hereId, resourceQuantity])).toEqual(expect.arrayContaining([['repl:pax2', 1], ['repl:pax', 1], ['repl:eq', 1]]));
    expect(here).toHaveLength(3);
  });
});

describe('Ground rebuilds (13.5a-d)', () => {
  it('restores steps to a reduced unit stacked with the Repls, one Pax a step; it keeps its mode', () => {
    const state = ok(rebuild(setup(2, 0), [{ pieceId: U.division, steps: 2, mode: null }]));
    expect(piece(state, U.division).remainingSteps).toBe(3);
    expect(piece(state, U.division).mode).toBe('MOVE');
    expect(piece(state, 'repl:pax').location.kind).toBe('ELIMINATED');
  });

  it('lets any number of steps be rebuilt (13.5b) and keeps the Pax left over', () => {
    const state = ok(rebuild(setup(2, 0), [{ pieceId: U.division, steps: 1, mode: null }]));
    expect(piece(state, U.division).remainingSteps).toBe(2);
    expect(piece(state, 'repl:pax:2').resourceQuantity).toBe(1);
    expect(codes(rebuild(setup(5, 0), [{ pieceId: U.division, steps: 3, mode: null }]))).toContain('INVALID_REBUILD_STEPS');
  });

  it('returns a Dead Pile Armor unit in the Repls hex for Eq, in the voluntary mode chosen, without its old markers', () => {
    let state = setup(0, 1);
    state = withPiece(state, U.armor, (entry) => ({ ...entry, statuses: [{ statusDefinitionId: 'status:out-of-supply' as never, value: { kind: 'FLAG', value: true } }] }));
    expect(piece(state, U.armor).location.kind).toBe('ELIMINATED');
    state = ok(rebuild(state, [{ pieceId: U.armor, steps: 1, mode: 'COMBAT' }]));
    const armor = piece(state, U.armor);
    expect(armor.location).toEqual({ kind: 'ON_MAP', hexId: REPLS });
    expect(armor.mode).toBe('COMBAT');
    expect(armor.currentFaceId).toBe('combat');
    expect(armor.remainingSteps).toBe(1);
    expect(armor.statuses).toEqual([]);
    expect(piece(state, 'repl:eq').location.kind).toBe('ELIMINATED');
  });

  it('charges by the Rebuild Table: Armor, Mech and artillery steps take Eq, all other steps Pax', () => {
    expect(codes(rebuild(setup(3, 0), [{ pieceId: U.armor, steps: 1, mode: 'MOVE' }]))).toContain('NOT_ENOUGH_EQUIPMENT');
    expect(codes(rebuild(setup(0, 3), [{ pieceId: U.division, steps: 1, mode: null }]))).toContain('NOT_ENOUGH_PAX');
    ok(rebuild(setup(1, 1), [{ pieceId: U.armor, steps: 1, mode: 'MOVE' }, { pieceId: U.division, steps: 1, mode: null }]));
  });

  it('needs an HQ in Combat Mode within 2 hexes, Repls out of enemy ZOCs, and the reduced unit stacked with them (13.5a)', () => {
    expect(codes(rebuild(setup(2, 0, { hqMode: 'MOVE' }), [{ pieceId: U.division, steps: 1, mode: null }]))).toContain('NO_REBUILD_HQ');
    const far = setup(2, 1, { replsAt: hex(5) });
    expect(codes(rebuild(far, [{ pieceId: U.armor, steps: 1, mode: 'MOVE' }], 0, { hexId: hex(5) }))).toContain('REPLACEMENTS_FAR_FROM_HQ');
    const apart = setup(2, 0, { replsAt: hex(4) });
    expect(codes(rebuild(apart, [{ pieceId: U.division, steps: 1, mode: null }], 0, { hexId: hex(4) }))).toContain('REDUCED_UNIT_NOT_WITH_REPLACEMENTS');
    const zoc = withPiece(setup(2, 0), U.enemy, (entry) => ({ ...entry, location: { kind: 'ON_MAP', hexId: hex(4) } }));
    const alone = withPiece(zoc, U.division, (entry) => ({ ...entry, location: { kind: 'ELIMINATED' } }));
    expect(codes(rebuild(alone, [{ pieceId: U.division, steps: 1, mode: 'MOVE' }]))).toContain('REPLACEMENTS_IN_ENEMY_ZOC');
    expect(codes(rebuild({ ...setup(2, 0), sequence: { ...setup(2, 0).sequence, phase: 'MOVEMENT', segment: 'MOVEMENT' } }, [{ pieceId: U.division, steps: 1, mode: null }]))).toContain('INVALID_REBUILD_PHASE');
  });

  it('places a Dead Pile unit only in a voluntary mode its counter can show (13.5b)', () => {
    expect(codes(rebuild(setup(0, 1), [{ pieceId: U.armor, steps: 1, mode: null }]))).toContain('INVALID_REBUILD_MODE');
    expect(codes(rebuild(setup(0, 1), [{ pieceId: U.armor, steps: 1, mode: 'DG' }]))).toContain('INVALID_REBUILD_MODE');
  });

  it('never rebuilds a unit with the no-rebuild dot (13.5c)', () => {
    const state = setup(0, 1);
    const armorDefinition = piece(state, U.armor).definitionId;
    const dotted: GameState = {
      ...state,
      scenario: { ...state.scenario, pieceCatalog: { ...state.scenario.pieceCatalog, definitions: state.scenario.pieceCatalog.definitions
        .map((definition) => definition.id === armorDefinition ? { ...definition, counter: { ...definition.counter!, rebuildable: false } } : definition) } },
    };
    expect(codes(rebuild(dotted, [{ pieceId: U.armor, steps: 1, mode: 'MOVE' }]))).toContain('NO_REBUILD_UNIT');
    expect(ruleEngine.projectForViewer(dotted, ALLIED).replacements.rebuilds.flatMap(({ units }) => units.map(({ id: unitId }) => unitId))).not.toContain(U.armor);
  });
});

describe('Truck rebuilds (13.5e)', () => {
  const withTruckLost = (): GameState => {
    let state = setup(0, 3);
    state = withPiece(state, U.truck, (entry) => ({ ...entry, location: { kind: 'ON_MAP', hexId: hex(6) }, mode: 'MOVE', stackOrder: 0 }));
    return applyDisplacement(state, U.truck, null);
  };

  it('records trucks destroyed by enemy action, and only those can be rebuilt', () => {
    expect(codes(rebuild(setup(0, 3), [], 1))).toContain('NO_TRUCKS_TO_REBUILD');
    const state = withTruckLost();
    expect(lostTruckPoints(state, ALLIED)).toBe(5);
    expect(lostTruckPoints(state, AXIS)).toBe(0);
  });

  it('records trucks the enemy captures (9.14c) and reports the roll to both players', () => {
    const base = withPiece(setup(0, 1), U.truck, (entry) => ({ ...entry, location: { kind: 'ON_MAP', hexId: hex(6) }, mode: 'MOVE', stackOrder: 0 }));
    // The capture die decides how much is taken (1-2 take nothing): find a seed where some points change hands.
    for (let seed = 1; seed <= 30; seed += 1) {
      const events: RuleEvent[] = [];
      const captured = captureAt({ ...base, rng: createRulesRng(seed) }, AXIS, hex(6), events);
      const event = events.find((entry): entry is Extract<RuleEvent, { kind: 'TRANSPORT_CAPTURED' }> => entry.kind === 'TRANSPORT_CAPTURED');
      expect(event).toMatchObject({ ownerId: ALLIED, capturerId: AXIS, points: 5 });
      if (event!.captured === 0) { expect(lostTruckPoints(captured, ALLIED)).toBe(0); continue; }
      expect(lostTruckPoints(captured, ALLIED)).toBe(event!.captured);
      return;
    }
    throw new Error('No seed captured a truck point.');
  });

  it('rebuilds lost truck points for 1 Eq each as a new truck counter in the Eq hex', () => {
    const state = ok(rebuild(withTruckLost(), [], 2));
    const rebuilt = state.pieceState.pieces.find((entry) => String(entry.id).startsWith('rebuilt-truck:'))!;
    expect(rebuilt.location).toEqual({ kind: 'ON_MAP', hexId: REPLS });
    expect(rebuilt.mode).toBe('MOVE');
    expect(rebuilt.statuses).toEqual([{ statusDefinitionId: 'status:transport-points', value: { kind: 'INTEGER', value: 2 } }]);
    expect(lostTruckPoints(state, ALLIED)).toBe(3);
    expect(piece(state, 'repl:eq:3').resourceQuantity).toBe(1);
    expect(codes(rebuild(state, [], 2))).toContain('NOT_ENOUGH_EQUIPMENT');
  });
});

describe('Rebuilds in the engine and the projection', () => {
  it('offers a legal default rebuild and keeps the Reinforcement Phase open for it', () => {
    const state = setup(2, 1);
    const offered = ruleEngine.getActionCandidates(state, { actorId: ALLIED, kind: 'REBUILD_UNITS', pieceId: null, budget: 10 });
    expect(offered.actions).toHaveLength(1);
    const action = offered.actions[0]!;
    expect(ruleEngine.validateAction(state, action).allowed).toBe(true);
    expect(action.kind === 'REBUILD_UNITS' && action.units.some(({ pieceId }) => pieceId === U.division)).toBe(true);
    expect(hasOptionalActions(state)).toBe(true);
  });

  it('shows the viewer only their own rebuilds (4.9a)', () => {
    const state = setup(2, 1);
    const own = ruleEngine.projectForViewer(state, ALLIED).replacements;
    expect(own.rebuilds).toHaveLength(1);
    expect(own.rebuilds[0]!.units.find(({ id: unitId }) => unitId === U.division)).toMatchObject({ cost: 'PAX', missing: 2, deadPile: false });
    expect(ruleEngine.projectForViewer(state, AXIS).replacements.rebuilds).toEqual([]);
  });

  it('saves the lost-truck ledger, and upgrades an older snapshot with an empty one', () => {
    const lost = applyDisplacement(withPiece(setup(0, 1), U.truck, (entry) => ({ ...entry, location: { kind: 'ON_MAP', hexId: hex(6) }, mode: 'MOVE' })), U.truck, null);
    const serialized = serializeGameState(lost);
    expect(serialized.ok).toBe(true);
    if (!serialized.ok) return;
    const parsed = parseGameStateJson(serialized.value);
    expect(parsed.ok && lostTruckPoints(parsed.value, ALLIED)).toBe(5);
    const { replacements: _dropped, ...older } = JSON.parse(serialized.value) as Record<string, unknown>;
    expect((upgradeLegacyGameStateInput(older) as { replacements: unknown }).replacements).toEqual({ lostTrucks: [] });
  });

  it('uses the fixture request the other rule tests use', () => {
    expect(RULE_FIXTURE_NEW_GAME_REQUEST.oob.scale).toBe('COMPACT');
  });
});


describe('Historical replacement saves retain their recorded rules', () => {
  it('replays arrival and merging of face-less counters without silently changing their quantities or modes', () => {
    const base = setup(0, 0);
    let state: GameState = { ...base, scenario: { ...base.scenario, pieceCatalog: { ...base.scenario.pieceCatalog,
      definitions: base.scenario.pieceCatalog.definitions.map(def => def.family === 'REPLACEMENT' ? { ...def, faces: [] } : def) } } };
    const events: RuleEvent[] = [];
    state = arriveReplacements(state, ALLIED, events);
    const arrived = state.pieceState.pieces.find(p => String(p.id).endsWith(':pax'))!;
    expect(arrived.mode).toBe(null);
    state = { ...state, pieceState: { ...state.pieceState, pieces: [...state.pieceState.pieces.map(p => p.id === arrived.id ? { ...p, stackOrder: 87, location: { kind: 'ON_MAP' as const, hexId: REPLS } } : p),
      { ...arrived, id: 'repl:legacy-spare' as PieceId, location: { kind: 'ON_MAP', hexId: REPLS }, stackOrder: 88 }] } };
    const merged = mergeReplacementsAt(state, REPLS, ALLIED);
    const surviving = merged.pieceState.pieces.filter(p => String(p.id).includes('repl') && p.location.kind === 'ON_MAP');
    expect(surviving).toHaveLength(1);
    expect(surviving[0]!.resourceQuantity).toBe(2 * arrived.resourceQuantity!);
    expect(serializeGameState(merged).ok).toBe(true);
  });
});

describe('Replacement units move, fight and consume supply (13.5)', () => {
  const pax = 'repl:pax' as PieceId;
  const eq = 'repl:eq' as PieceId;
  const supplyId = id('allied:independent-supply-1');
  const movement = () => atStep(setup(), 'MOVEMENT', 'MOVEMENT', ALLIED);

  it('moves Pax to the reduced unit, then spends it to refill steps in the next Reinforcement Phase', () => {
    let state = withPiece(movement(), pax, (entry) => ({ ...entry, location: { kind: 'ON_MAP', hexId: hex(4) } }));
    expect(movementAllowanceTicks(state, pax)).toBe(20);
    expect(derivePieceReTicks(state, piece(state, pax))).toBe(1);
    expect(isCombatUnit(state, piece(state, pax))).toBe(true);
    const only = { ...state, configuration: { ...state.configuration, stackingLimitReTicks: 1 }, pieceState: { ...state.pieceState, pieces: state.pieceState.pieces.filter(p => p.id === pax || p.id === eq) } };
    expect(queryStacking(only, REPLS).allowed).toBe(true);
    expect(queryStacking(only, REPLS, pax).allowed).toBe(false);
    expect(isAttackCapable(state, piece(state, pax))).toBe(true);
    expect(exertsZoc(state, piece(state, pax))).toBe(false);
    state = ok(applyRuleAction(state, ALLIED, { kind: 'MOVE_PIECE', pieceId: pax, path: [hex(4), REPLS] }));
    expect(piece(state, pax).location).toEqual({ kind: 'ON_MAP', hexId: REPLS });
    expect(state.usage.find(({ pieceId }) => pieceId === pax)?.movementSpentTicks).toBe(4);
    state = atStep(onGameTurn(state, 2), 'REINFORCEMENT', 'NONE', ALLIED);
    state = ok(rebuild(state, [{ pieceId: U.division, steps: 1, mode: null }]));
    expect(piece(state, U.division).remainingSteps).toBe(2);
    expect(piece(state, pax).location.kind).toBe('ELIMINATED');
    expect(piece(state, 'repl:pax:2').location.kind).toBe('ON_MAP');
  });

  it('requires one Token of fuel for an Eq before moving and never for Pax', () => {
    let state = withPiece(movement(), supplyId, (entry) => ({ ...entry, location: { kind: 'ON_MAP', hexId: REPLS }, stackOrder: 70 }));
    expect(needsFuel(state, piece(state, eq))).toBe(true);
    expect(needsFuel(state, piece(state, pax))).toBe(false);
    expect(movementAllowanceTicks(state, eq)).toBe(40);
    expect(codes(applyRuleAction(state, ALLIED, { kind: 'MOVE_PIECE', pieceId: eq, path: [REPLS, hex(4)] }))).toContain('FUEL_REQUIRED');
    const before = piece(state, supplyId).resourceQuantity!;
    state = ok(applyRuleAction(state, ALLIED, { kind: 'PAY_FUEL', method: 'SINGLE_UNIT', pieceId: eq, sourcePieceId: supplyId }));
    expect(piece(state, supplyId).resourceQuantity).toBe(before - 1);
    state = ok(applyRuleAction(state, ALLIED, { kind: 'MOVE_PIECE', pieceId: eq, path: [REPLS, hex(4)] }));
    expect(piece(state, eq).location).toEqual({ kind: 'ON_MAP', hexId: hex(4) });
    expect(piece(state, 'repl:pax:2').location).toEqual({ kind: 'ON_MAP', hexId: REPLS });
  });

  it('supports Reserve and Strat, halves DG movement, and rejects Combat Mode and non-Move rebuilding', () => {
    const state = movement();
    expect(codes(applyRuleAction(state, ALLIED, { kind: 'CHANGE_MODE', pieceId: pax, mode: 'COMBAT' }))).toContain('REPLACEMENT_COMBAT_MODE');
    const strat = ok(applyRuleAction(state, ALLIED, { kind: 'CHANGE_MODE', pieceId: pax, mode: 'STRAT' }));
    expect(movementAllowanceTicks(strat, pax)).toBe(40);
    const reserve = ok(applyRuleAction(state, ALLIED, { kind: 'CHANGE_MODE', pieceId: pax, mode: 'RESERVE' }));
    expect(movementAllowanceTicks(reserve, pax)).toBe(5);
    const reaction = atStep(reserve, 'REACTION', 'MOVEMENT', ALLIED, AXIS);
    expect(queryMovementPath(reaction, ALLIED, pax, [REPLS, hex(4)]).allowed).toBe(false);
    const released = ok(applyRuleAction(reaction, ALLIED, { kind: 'RELEASE_RESERVE', pieceId: pax }));
    expect(movementAllowanceTicks(released, pax)).toBe(10);
    expect(queryMovementPath(released, ALLIED, pax, [REPLS, hex(4)]).allowed).toBe(true);
    const dg = withPiece(state, pax, (entry) => ({ ...entry, mode: 'DG' }));
    expect(movementAllowanceTicks(dg, pax)).toBe(10);
    const noMove = atStep(withPiece(setup(1, 0), pax, (entry) => ({ ...entry, mode: 'RESERVE' })), 'REINFORCEMENT', 'NONE', ALLIED);
    expect(codes(rebuild(noMove, [{ pieceId: U.division, steps: 1, mode: null }]))).toContain('NO_REPLACEMENTS_IN_HEX');
  });

  it('does not negate enemy ZOC for rebuilding, even with a friendly combat unit present (4.5a K)', () => {
    const state = withPiece(setup(), U.enemy, (entry) => ({ ...entry, location: { kind: 'ON_MAP', hexId: hex(4) } }));
    expect(codes(rebuild(state, [{ pieceId: U.division, steps: 1, mode: null }]))).toContain('REPLACEMENTS_IN_ENEMY_ZOC');
  });

  it('blocks enemy entry into a replacement hex and treats replacements as combat defenders', () => {
    const state = atStep(withPiece(setup(1, 0), U.enemy, (entry) => ({ ...entry, location: { kind: 'ON_MAP', hexId: hex(4) } })), 'MOVEMENT', 'MOVEMENT', AXIS);
    expect(queryMovementPath(state, AXIS, U.enemy, [hex(4), REPLS]).reasons.map(({ code }) => code)).toContain('ENEMY_OCCUPIED_HEX');
    // An attack overwhelms the zero-strength replacement, resolving normal combat losses rather than capture.
    for (let seed = 1; seed <= 20; seed += 1) {
      const combat = atStep({ ...state, rng: createRulesRng(seed) }, 'COMBAT', 'COMBAT', AXIS);
      const started = declareTestCombat(combat, AXIS, 'REGULAR', [U.enemy], REPLS, U.enemy);
      if (!started.ok) continue;
      const finished = settleDecisions(started.state).state;
      if (piece(finished, pax).location.kind === 'ELIMINATED') { expect(isCombatUnit(finished, piece(finished, pax))).toBe(true); return; }
    }
    throw new Error('No normal combat loss eliminated a replacement in the deterministic seeds.');
  });

  it('includes replacements among barrage targets and permits their loss', () => {
    const artilleryId = id('axis:f1-artillery-1');
    const dumpId = id('axis:independent-supply-1');
    let state = withPiece(setup(1, 0), U.division, p => ({ ...p, location: { kind: 'ELIMINATED' } }));
    state = withPiece(state, artilleryId, p => ({ ...p, location: { kind: 'ON_MAP', hexId: hex(4) }, mode: 'COMBAT', currentFaceId: 'combat' as never, stackOrder: 60 }));
    state = withPiece(state, dumpId, p => ({ ...p, location: { kind: 'ON_MAP', hexId: hex(4) }, stackOrder: 61 }));
    state = atStep(state, 'COMBAT', 'BARRAGE', AXIS);
    // Strat targets incur the normal +3 column shift. This remains a legal replacement mode.
    state = withPiece(state, pax, p => ({ ...p, mode: 'STRAT' }));
    for (let seed = 1; seed <= 100; seed++) {
      const fired = applyRuleAction({ ...state, rng: createRulesRng(seed) }, AXIS, { kind: 'DECLARE_BARRAGE', firerIds: [artilleryId], targetPieceIds: [pax], targetHexId: REPLS });
      expect(fired.ok).toBe(true);
      const finished = settleDecisions(fired.state).state;
      if (piece(finished, pax).location.kind === 'ELIMINATED') return;
    }
    throw new Error('No deterministic barrage seed caused a replacement loss.');
  });

  it('marks replacements out of supply and lets attrition eliminate them', () => {
    const initial = setup(1, 0);
    const state = { ...initial, scenario: { ...initial.scenario, sources: [] } };
    const events: RuleEvent[] = [];
    const checked = determineSupply(state, ALLIED, events);
    expect(piece(checked, pax).statuses).toEqual(expect.arrayContaining([{ statusDefinitionId: 'status:out-of-supply', value: { kind: 'FLAG', value: true } }]));
    const losing = { ...checked, interrupts: [{ kind: 'ATTRITION' as const, ownerId: ALLIED, hexId: REPLS, steps: 1, pieceIds: [pax] }] };
    const lost = settleInterrupts(losing, null);
    expect(piece(lost.state, pax).location.kind).toBe('ELIMINATED');
    expect(lost.events).toEqual(expect.arrayContaining([expect.objectContaining({ kind: 'STEP_LOST', pieceId: pax })]));
  });
});
