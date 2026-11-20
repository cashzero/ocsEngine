import { readFileSync } from 'node:fs';
import { gunzipSync } from 'node:zlib';
import { describe, expect, it } from 'vitest';
import {
  analyze, createBotActionAccess, createBotRng, createGameplayFixture, createHeuristicPolicy, forecastBarrage, forecastCombat,
  hashGameState, heuristicWeights, parseGameStateJson, respondToDecision, ruleEngine, serializeGameState,
  type BotDecisionContext, type GameAction, type GameState, type HexId, type RuleFact,
} from '../../src/index.js';
import { hexOf, isArtillery, isCombatUnit, isHq, isTransportPoint, usageOf, withStatus, withUsage, TRANSPORT_POINTS_STATUS } from '../../src/rules/pieces.js';
import { availableTokens, unitsNeedingSupply } from '../../src/rules/supply/supply.js';

const factList = (entries: Record<string, string | number>): RuleFact[] =>
  Object.entries(entries).map(([key, value]) => ({ key, value, visibility: 'PUBLIC', ownerId: null }));

const loadBarrageFixture = (): GameState => {
  const { snapshot } = JSON.parse(gunzipSync(readFileSync(new URL('./fixtures/barrage-cost-1300205.state.json.gz', import.meta.url))).toString());
  const parsed = parseGameStateJson(snapshot);
  if (!parsed.ok) throw new Error('Cannot load barrage fixture');
  return parsed.value;
};

describe('OCS 9.8 Surprise in forecastCombat', () => {
  it('models Regular (10+/5-) and Overrun (9+/6-) Surprise shifts and Hedgehog -1 Surprise DRM', () => {
    const base = factList({ 'combat.line': 'OPEN', 'combat.column': '1:1', 'combat.odds': '1:1', 'combat.drm': 2 });
    const regular = forecastCombat(base, 'REGULAR')!;
    const overrun = forecastCombat(base, 'OVERRUN')!;
    // With DRM +2, Overrun gets Attacker Surprise on 7+ (vs 8+ Regular), shifting odds right more often.
    expect(overrun.defenderLosses + overrun.defenderOptions).toBeGreaterThan(regular.defenderLosses + regular.defenderOptions);

    // At 1:1 with DRM 0, adding a Level 1 hedgehog applies both -1 combat DRM and -1 Surprise DRM.
    const openEven = forecastCombat(factList({ 'combat.line': 'OPEN', 'combat.column': '1:1', 'combat.odds': '1:1', 'combat.drm': 0 }))!;
    const vsHedgehog = forecastCombat(factList({ 'combat.line': 'OPEN', 'combat.column': '1:1', 'combat.odds': '1:1', 'combat.drm': 0, 'combat.hedgehogLevel': 1 }))!;
    expect(vsHedgehog.defenderHit).toBeLessThan(openEven.defenderHit);
    expect(vsHedgehog.attackerLosses).toBeGreaterThan(openEven.attackerLosses);
  });
});

describe('combatSubsets in DECLARE_COMBAT candidates', () => {
  it('offers trimmed subsets when combatSubsets is enabled while keeping default all-in behavior when off', () => {
    const base = loadBarrageFixture();
    const combatState: GameState = { ...base, sequence: { ...base.sequence, segment: 'COMBAT' } };
    const actorId = combatState.sequence.actingPlayerId;
    const defaultActions = ruleEngine.getActionCandidates(combatState, {
      actorId, kind: 'DECLARE_COMBAT', pieceId: null, budget: 200,
    }).actions;
    const subsetActions = ruleEngine.getActionCandidates(combatState, {
      actorId, kind: 'DECLARE_COMBAT', pieceId: null, budget: 200, combatSubsets: true,
    }).actions;
    const defaultOn1212 = defaultActions.filter((a) => a.kind === 'DECLARE_COMBAT' && a.targetHexId === '12,12');
    const subsetsOn1212 = subsetActions.filter((a) => a.kind === 'DECLARE_COMBAT' && a.targetHexId === '12,12');
    expect(defaultOn1212).toHaveLength(1);
    expect(subsetsOn1212.length).toBeGreaterThan(defaultOn1212.length);
    // First candidate on the target remains the full adjacent group for backward compatibility.
    expect(subsetsOn1212[0]!.kind === 'DECLARE_COMBAT' && defaultOn1212[0]!.kind === 'DECLARE_COMBAT'
      && subsetsOn1212[0]!.attackerIds.length === defaultOn1212[0]!.attackerIds.length).toBe(true);
    // At least one smaller subset is also offered.
    expect(subsetsOn1212.some((a) => a.kind === 'DECLARE_COMBAT' && defaultOn1212[0]!.kind === 'DECLARE_COMBAT'
      && a.attackerIds.length < defaultOn1212[0]!.attackerIds.length)).toBe(true);
  });
});

describe('barrageEnablesAttack with secondary targets present', () => {
  it('still selects the enabling barrage on 12,12 even when another enemy hex has a higher-scoring combat', async () => {
    const original = loadBarrageFixture();
    const target = '12,12' as HexId;
    const actor = original.sequence.actingPlayerId;
    const defenders = new Set(original.pieceState.pieces.filter((piece) =>
      piece.ownerId !== actor && hexOf(piece) === target && isCombatUnit(original, piece)).map(({ definitionId }) => definitionId));
    // Keep ALL other enemy units on the map (including 11,15 which scores higher than 12,12!), only strengthen 12,12 defenders.
    const state: GameState = {
      ...original,
      scenario: {
        ...original.scenario,
        pieceCatalog: {
          ...original.scenario.pieceCatalog,
          definitions: original.scenario.pieceCatalog.definitions.map((definition) => !defenders.has(definition.id) ? definition : {
            ...definition,
            faces: definition.faces.map((face) => ({
              ...face,
              steps: face.steps.map((step) => ({
                ...step,
                combatStrength: step.combatStrength === null ? null : step.combatStrength * 6,
              })),
            })),
          }),
        },
      },
    };
    const fixture = await createGameplayFixture({ scenario: state.scenario, configuration: state.configuration });
    const snapshot = serializeGameState(state);
    const hash = await hashGameState(state);
    if (!snapshot.ok || !hash.ok) throw new Error('Failed to prepare barrage test session');
    const initial = {
      ...fixture.session.save(),
      initialSnapshot: snapshot.value,
      currentSnapshot: snapshot.value,
      initialStateHash: hash.value,
      finalStateHash: hash.value,
    };
    const session = await fixture.engine.loadSession(JSON.stringify(initial));
    session.start();
    const seat = initial.bindings.find(({ playerId }) => playerId === actor)!;
    const decision = createHeuristicPolicy(
      { scenario: state.scenario, turnLimit: state.configuration.turnLimit },
      { weights: heuristicWeights({ barrageGroupsByCost: 1 }) },
    ).decide({
      seatId: seat.seatId,
      playerId: seat.playerId,
      view: session.getView(seat.seatId),
      actions: createBotActionAccess(session, seat.seatId),
      memory: { stepKey: 'barrage', actions: 0, notes: new Map() },
      rng: createBotRng(7, hash.value, 0),
    })!;
    expect(decision.action).toMatchObject({ kind: 'DECLARE_BARRAGE', targetHexId: target });
    if (decision.action.kind === 'DECLARE_BARRAGE') {
      expect(decision.action.firerIds).toHaveLength(2);
    }
  }, 60_000);
});

describe('artillery Combat/Move mode control', () => {
  it('switches escorted in-range artillery to COMBAT mode, and far-rear COMBAT artillery back to MOVE mode', async () => {
    const base = loadBarrageFixture();
    const actor = base.sequence.actingPlayerId;
    const gun = base.pieceState.pieces.find((p) => p.ownerId === actor && isArtillery(base, p) && hexOf(p) === '11,11')!;
    expect(gun).toBeDefined();
    expect(gun.mode).toBe('MOVE');

    const moveState: GameState = {
      ...base,
      sequence: { ...base.sequence, phase: 'MOVEMENT', segment: 'MOVEMENT' },
      usage: [],
    };
    const decideForGun = async (state: GameState) => {
      const fixture = await createGameplayFixture({ scenario: state.scenario, configuration: state.configuration });
      const snapshot = serializeGameState(state);
      const hash = await hashGameState(state);
      if (!snapshot.ok || !hash.ok) throw new Error('Failed to prepare artillery mode test session');
      const initial = {
        ...fixture.session.save(),
        initialSnapshot: snapshot.value,
        currentSnapshot: snapshot.value,
        initialStateHash: hash.value,
        finalStateHash: hash.value,
      };
      const session = await fixture.engine.loadSession(JSON.stringify(initial));
      session.start();
      const seat = initial.bindings.find(({ playerId }) => playerId === actor)!;
      const done = new Set(state.pieceState.pieces.filter((p) => p.ownerId === actor && p.id !== gun.id).map((p) => p.id));
      const notes = new Map<string, unknown>([['heuristic', {
        done, modeSet: new Set(done), fueled: new Set(done), trucks: new Map(),
        claims: { tokens: new Map(), unloaded: new Set() }, feedBudget: null, targets: null,
        stranded: new Map(), hqCovered: new Set(), railDone: true, seaDone: true,
      }]]);
      return createHeuristicPolicy(
        { scenario: state.scenario, turnLimit: state.configuration.turnLimit },
        { weights: heuristicWeights({ barrageGroupsByCost: 1 }) },
      ).decide({
        seatId: seat.seatId,
        playerId: seat.playerId,
        view: session.getView(seat.seatId),
        actions: createBotActionAccess(session, seat.seatId),
        memory: { stepKey: 'move', actions: 0, notes },
        rng: createBotRng(7, hash.value, 0),
      })!;
    };

    // Escorted at 12,10 (2 hexes from engaged enemy at 12,12): flips MOVE -> COMBAT for 2x barrage strength.
    const deployDecision = await decideForGun(moveState);
    expect(deployDecision.action).toMatchObject({ kind: 'CHANGE_MODE', pieceId: gun.id, mode: 'COMBAT' });

    // Placed far behind the front in COMBAT mode: flips COMBAT -> MOVE to keep full 14 MP.
    const rearHex = moveState.scenario.mapDefinition.hexes.find((h) => h.id === '24,10')?.id ?? '20,10' as HexId;
    const rearState: GameState = {
      ...moveState,
      pieceState: {
        ...moveState.pieceState,
        pieces: moveState.pieceState.pieces.map((p) => p.id === gun.id
          ? { ...p, mode: 'COMBAT', currentFaceId: 'combat' as typeof p.currentFaceId, location: { kind: 'ON_MAP', hexId: rearHex } }
          : p),
      },
    };
    const redeployDecision = await decideForGun(rearState);
    expect(redeployDecision.action).toMatchObject({ kind: 'CHANGE_MODE', pieceId: gun.id, mode: 'MOVE' });
  }, 60_000);
});

describe('Tier 1 bugfix regressions', () => {
  it('DEFENDER_TERRAIN ranks by Combat Table column index rather than raw odds ratio', () => {
    const state = loadBarrageFixture();
    const actor = state.sequence.actingPlayerId;
    const projection = ruleEngine.projectForViewer(state, actor);
    const facts = { scenario: state.scenario, turnLimit: state.configuration.turnLimit };
    const situation = analyze(projection, actor, facts);
    const makeCtx = (options: { id: string; label: string; hexId: null }[]): BotDecisionContext => ({
      seatId: 'seat:test' as BotDecisionContext['seatId'],
      playerId: actor,
      rng: createBotRng(7, 'terrain', 0),
      memory: { stepKey: 'combat', actions: 0, notes: new Map() },
      view: {
        projection,
        pendingDecision: { id: 'dec:terrain', kind: 'DEFENDER_TERRAIN', ownerId: actor, prompt: 'Terrain', options },
      } as unknown as BotDecisionContext['view'],
      actions: {
        families: () => ['RESPOND_DECISION'],
        candidates: () => options.map((o) => ({
          actionId: `cand:${o.id}`, actorId: actor, expectedRevision: state.revision,
          kind: 'RESPOND_DECISION', decisionId: 'dec:terrain', choiceId: o.id,
        })) as unknown as readonly GameAction[],
        explain: () => ({ current: true, explanation: { actionKind: 'RESPOND_DECISION', allowed: true, reasons: [], facts: [] } }),
      } as unknown as BotDecisionContext['actions'],
    });
    // Armor in City (EXTREMELY_CLOSE 6:1 = col 4) beats Clear (OPEN 2:1 = col 5) despite higher raw ratio.
    const armorPick = respondToDecision(makeCtx([
      { id: 'terrain:terrain:clear', label: 'clear: open line, 20 vs 10, 2:1', hexId: null },
      { id: 'terrain:settlement:city', label: 'city: extremely close line, 20 vs 3.3, 6:1', hexId: null },
    ]), situation)!;
    expect(armorPick.action).toMatchObject({ choiceId: 'terrain:settlement:city' });

    // Infantry in Woods (CLOSE 2:1 = col 4) beats Clear (OPEN 2:1 = col 5) despite clear sorting alphabetically first.
    const woodsPick = respondToDecision(makeCtx([
      { id: 'terrain:terrain:clear', label: 'clear: open line, 10 vs 5, 2:1', hexId: null },
      { id: 'terrain:terrain:woods', label: 'woods: close line, 10 vs 5, 2:1', hexId: null },
    ]), situation)!;
    expect(woodsPick.action).toMatchObject({ choiceId: 'terrain:terrain:woods' });
  });

  it('OPTION_SPLIT retreats instead of suiciding the last step on a held objective', () => {
    const state = loadBarrageFixture();
    const actor = state.sequence.actingPlayerId;
    const objHex = state.configuration.objectives[0]!.hexId;
    const baseProjection = ruleEngine.projectForViewer(state, actor);
    const projection = {
      ...baseProjection,
      combat: {
        transactionId: 'tx:opt', kind: 'REGULAR' as const, step: 'RESOLVING' as const,
        attackerOwnerId: state.scenario.players.find((p) => p.id !== actor)!.id,
        defenderOwnerId: actor, targetHexId: objHex, defenderCount: 1, result: 'Ao1/Do1',
      },
    } as unknown as typeof baseProjection;
    const facts = { scenario: state.scenario, turnLimit: state.configuration.turnLimit };
    const situation = analyze(projection, actor, facts);
    const options = [
      { id: 'option:1:0', label: 'Lose 1 step', hexId: null },
      { id: 'option:0:1', label: 'Retreat 1 hex', hexId: null },
    ];
    const makeCtx = (stepsLeftOnLoss: number): BotDecisionContext => ({
      seatId: 'seat:test' as BotDecisionContext['seatId'],
      playerId: actor,
      rng: createBotRng(7, 'opt', 0),
      memory: { stepKey: 'combat', actions: 0, notes: new Map() },
      view: {
        projection,
        pendingDecision: { id: 'dec:opt', kind: 'OPTION_SPLIT', ownerId: actor, prompt: 'Option', options },
      } as unknown as BotDecisionContext['view'],
      actions: {
        families: () => ['RESPOND_DECISION'],
        candidates: () => options.map((o) => ({
          actionId: `cand:${o.id}`, actorId: actor, expectedRevision: state.revision,
          kind: 'RESPOND_DECISION', decisionId: 'dec:opt', choiceId: o.id,
        })) as unknown as readonly GameAction[],
        explain: (action: GameAction) => ({
          current: true,
          explanation: {
            actionKind: 'RESPOND_DECISION', allowed: true, reasons: [],
            facts: [{
              key: 'combat.optionStepsLeft',
              value: action.kind === 'RESPOND_DECISION' && action.choiceId === 'option:1:0' ? stepsLeftOnLoss : stepsLeftOnLoss + 1,
              visibility: 'OWNER_ONLY', ownerId: actor,
            }],
          },
        }),
      } as unknown as BotDecisionContext['actions'],
    });
    // 1-step defender (0 steps left on loss) retreats to survive instead of dying on the objective.
    expect(respondToDecision(makeCtx(0), situation)!.action).toMatchObject({ choiceId: 'option:0:1' });
    // 2-step defender (1 step left on loss) takes the step loss to hold the objective.
    expect(respondToDecision(makeCtx(1), situation)!.action).toMatchObject({ choiceId: 'option:1:0' });
  });

  it('availableTokens does not double-subtract combat payments once activeTransaction enters RESOLVING', () => {
    const state = loadBarrageFixture();
    const dump = state.pieceState.pieces.find((p) => (p.resourceQuantity ?? 0) >= 4)!;
    const paid = { ...dump, resourceQuantity: 2 };
    const txBase = {
      id: 'tx:test' as never,
      kind: 'REGULAR' as const,
      ownerId: state.sequence.actingPlayerId,
      defenderOwnerId: state.scenario.players.find((p) => p.id !== state.sequence.actingPlayerId)!.id,
      targetHexId: '12,12' as HexId,
      attackerIds: [],
      defenderIds: [],
      leadAttackerId: null,
      leadDefenderId: null,
      defenderTerrainId: null,
      attackerSupplied: true,
      defenderSupplied: true,
      attackerPayments: [{ resourcePieceId: dump.id, quantity: 2, sourceHexId: hexOf(dump)! }],
      defenderPayments: [],
      attackerInternalIds: [],
      defenderInternalIds: [],
      payment: null,
      surpriseRoll: null,
      shiftDie: null,
      roll: null,
      result: null,
      queue: [],
      advancedIds: [],
      retreatedIds: [],
      exploitingIds: [],
    };
    const duringSetup: GameState = { ...state, activeTransaction: { ...txBase, step: 'DEFENDER_SUPPLY' } as unknown as GameState['activeTransaction'] };
    const duringResolving: GameState = { ...state, activeTransaction: { ...txBase, step: 'RESOLVING' } as unknown as GameState['activeTransaction'] };
    expect(availableTokens(duringSetup, paid)).toBe(0);
    expect(availableTokens(duringResolving, paid)).toBe(2);
  });

  it('Combat-Mode HQ (MA 0) does not pay fuel when staying in Combat Mode', async () => {
    const base = loadBarrageFixture();
    const actor = base.sequence.actingPlayerId;
    const hq = base.pieceState.pieces.find((p) => p.ownerId === actor && isHq(base, p) && hexOf(p) !== null)!;
    const dump = base.pieceState.pieces.find((p) => p.ownerId === actor && p.location.kind === 'ON_MAP' && (p.resourceQuantity ?? 0) >= 4)!;
    const hqHex = hexOf(hq)!;
    const state: GameState = {
      ...base,
      sequence: { ...base.sequence, phase: 'MOVEMENT', segment: 'MOVEMENT' },
      usage: [],
      fuel: { formations: [], hqIds: [] },
      pieceState: {
        ...base.pieceState,
        pieces: base.pieceState.pieces.map((p) =>
          p.id === hq.id ? { ...p, mode: 'COMBAT', currentFaceId: 'combat' as typeof p.currentFaceId }
            : p.id === dump.id ? { ...p, location: { kind: 'ON_MAP', hexId: hqHex }, stackOrder: 99, resourceQuantity: 8 }
              : p),
      },
    };
    const fixture = await createGameplayFixture({ scenario: state.scenario, configuration: state.configuration });
    const snapshot = serializeGameState(state);
    const hash = await hashGameState(state);
    if (!snapshot.ok) throw new Error(`Failed to serialize HQ fuel fixture: ${JSON.stringify(snapshot.error.slice(0, 3))}`);
    if (!hash.ok) throw new Error(`Failed to hash HQ fuel fixture: ${JSON.stringify(hash.error.slice(0, 3))}`);
    const initial = {
      ...fixture.session.save(),
      initialSnapshot: snapshot.value,
      currentSnapshot: snapshot.value,
      initialStateHash: hash.value,
      finalStateHash: hash.value,
    };
    const session = await fixture.engine.loadSession(JSON.stringify(initial));
    session.start();
    const seat = initial.bindings.find(({ playerId }) => playerId === actor)!;
    const done = new Set(state.pieceState.pieces.filter((p) => p.ownerId === actor && p.id !== hq.id).map((p) => p.id));
    const notes = new Map<string, unknown>([['heuristic', {
      done, modeSet: new Set([hq.id, ...done]), fueled: new Set(done), trucks: new Map(),
      claims: { tokens: new Map(), unloaded: new Set() }, feedBudget: null, targets: null,
      stranded: new Map(), hqCovered: new Set(), railDone: true, seaDone: true,
    }]]);
    const decision = createHeuristicPolicy({ scenario: state.scenario, turnLimit: state.configuration.turnLimit }).decide({
      seatId: seat.seatId,
      playerId: seat.playerId,
      view: session.getView(seat.seatId),
      actions: createBotActionAccess(session, seat.seatId),
      memory: { stepKey: 'move', actions: 0, notes },
      rng: createBotRng(7, hash.value, 0),
    })!;
    expect(decision.action.kind).not.toBe('PAY_FUEL');
  }, 60_000);

  it('forecastBarrage models [1/2] per OCS 10.0c (spotted vs unspotted / Level 3+ hedgehog)', () => {
    const col = 8; // 41-68 column has [1/2] results
    const spotted = forecastBarrage([
      ...factList({ 'barrage.finalColumn': col, 'barrage.supplyTokens': 6, 'barrage.shifts': 'Hedgehog L2' }),
      { key: 'barrage.spotter', value: true, visibility: 'PUBLIC', ownerId: null },
    ])!;
    const unspotted = forecastBarrage([
      ...factList({ 'barrage.finalColumn': col, 'barrage.supplyTokens': 6, 'barrage.shifts': 'No spotter' }),
      { key: 'barrage.spotter', value: false, visibility: 'PUBLIC', ownerId: null },
    ])!;
    const dugL3 = forecastBarrage([
      ...factList({ 'barrage.finalColumn': col, 'barrage.supplyTokens': 6, 'barrage.shifts': 'Hedgehog L3' }),
      { key: 'barrage.spotter', value: true, visibility: 'PUBLIC', ownerId: null },
    ])!;
    expect(spotted.expectedSteps).toBeGreaterThan(unspotted.expectedSteps);
    expect(dugL3.expectedSteps).toBeCloseTo(unspotted.expectedSteps, 6);
  });

  it('combatCandidatesFor excludes already-attacked units so legal combined attacks remain available', () => {
    const base = loadBarrageFixture();
    const combatState: GameState = { ...base, sequence: { ...base.sequence, segment: 'COMBAT' } };
    const actor = combatState.sequence.actingPlayerId;
    const before = ruleEngine.getActionCandidates(combatState, {
      actorId: actor, kind: 'DECLARE_COMBAT', pieceId: null, budget: 200, combatSubsets: true,
    }).actions.filter((a) => a.kind === 'DECLARE_COMBAT' && a.targetHexId === '12,12');
    const full = before[0]!;
    expect(full.kind).toBe('DECLARE_COMBAT');
    if (full.kind !== 'DECLARE_COMBAT' || full.attackerIds.length < 3) return;
    const spentPiece = combatState.pieceState.pieces.find((p) => p.id === full.attackerIds[0])!;
    const withSpent: GameState = {
      ...combatState,
      usage: withUsage(combatState, { ...usageOf(combatState, spentPiece), attacked: true }),
    };
    const after = ruleEngine.getActionCandidates(withSpent, {
      actorId: actor, kind: 'DECLARE_COMBAT', pieceId: null, budget: 200, combatSubsets: true,
    }).actions.filter((a) => a.kind === 'DECLARE_COMBAT' && a.targetHexId === '12,12');
    // The remaining eligible attackers must still form a combined multi-unit attack (not collapse to singletons).
    expect(after.some((a) => a.kind === 'DECLARE_COMBAT' && a.attackerIds.length === full.attackerIds.length - 1
      && !a.attackerIds.includes(spentPiece.id))).toBe(true);
  });
});

describe('Tier 2 + Tier 3 forensic audit bugfixes', () => {
  it('OVERSTACK_ELIMINATION values whole units (eliminates 1-step battalion before 4-step division)', () => {
    const state = loadBarrageFixture();
    const actor = state.sequence.actingPlayerId;
    const projection = ruleEngine.projectForViewer(state, actor);
    const facts = { scenario: state.scenario, turnLimit: state.configuration.turnLimit };
    const situation = analyze(projection, actor, facts);
    const ownCombat = situation.own.filter((u) => situation.isCombatUnit(u));
    const small = { ...ownCombat[0]!, piece: { ...ownCombat[0]!.piece, id: 'unit:small' as never }, profile: { ...ownCombat[0]!.profile!, strength: 3, steps: 1 } };
    const big = { ...ownCombat[0]!, piece: { ...ownCombat[0]!.piece, id: 'unit:big' as never }, profile: { ...ownCombat[0]!.profile!, strength: 10, steps: 4 } };
    // Per-step value: big = 10/4 = 2.5 < small = 3/1 = 3. Whole-unit value: small = 3 < big = 40.
    const synthSituation = { ...situation, own: [big, small] };
    const options = [
      { id: 'elim:unit:big', label: 'Big 4-step division', hexId: null },
      { id: 'elim:unit:small', label: 'Small 1-step battalion', hexId: null },
    ];
    const ctx: BotDecisionContext = {
      seatId: 'seat:test' as BotDecisionContext['seatId'],
      playerId: actor,
      rng: createBotRng(7, 'overstack', 0),
      memory: { stepKey: 'overstack', actions: 0, notes: new Map() },
      view: { projection, pendingDecision: { id: 'dec:overstack', kind: 'OVERSTACK_ELIMINATION', ownerId: actor, prompt: 'Eliminate', options } } as unknown as BotDecisionContext['view'],
      actions: {
        families: () => ['RESPOND_DECISION'],
        candidates: () => options.map((o) => ({
          actionId: `cand:${o.id}`, actorId: actor, expectedRevision: state.revision,
          kind: 'RESPOND_DECISION', decisionId: 'dec:overstack', choiceId: o.id,
        })) as unknown as readonly GameAction[],
      } as unknown as BotDecisionContext['actions'],
    };
    expect(respondToDecision(ctx, synthSituation)!.action).toMatchObject({ choiceId: 'elim:unit:small' });
  });

  it('ADVANCE_HEX enforces 10-RE stacking limit and stops advancing into already-held objective', () => {
    const state = loadBarrageFixture();
    const actor = state.sequence.actingPlayerId;
    const objHex = state.configuration.objectives[0]!.hexId;
    const baseProj = ruleEngine.projectForViewer(state, actor);
    const projection = {
      ...baseProj,
      combat: {
        transactionId: 'tx:adv', kind: 'REGULAR' as const, step: 'RESOLVING' as const,
        attackerOwnerId: actor, defenderOwnerId: state.scenario.players.find((p) => p.id !== actor)!.id,
        targetHexId: objHex, defenderCount: 0, result: 'De',
      },
    } as unknown as typeof baseProj;
    const facts = { scenario: state.scenario, turnLimit: state.configuration.turnLimit };
    const baseSit = analyze(projection, actor, facts);
    const sample = baseSit.own.find((u) => baseSit.isCombatUnit(u))!;
    const heavyPresent = { ...sample, hexId: objHex, piece: { ...sample.piece, id: 'unit:present' as never }, profile: { ...sample.profile!, re: 8, strength: 20 } };
    const heavyAdvancer = { ...sample, hexId: '0,0' as HexId, piece: { ...sample.piece, id: 'unit:adv' as never }, profile: { ...sample.profile!, re: 3, strength: 10 } };
    const synthSit = {
      ...baseSit,
      own: [heavyPresent, heavyAdvancer],
      objectives: [{ hexId: objHex, points: 4, controllerId: null }],
      friendlyAt: (h: HexId) => (h === objHex ? [heavyPresent] : h === '0,0' ? [heavyAdvancer] : []),
      threatAt: () => 0,
    };
    const options = [
      { id: 'advance:unit:adv', label: 'Advance heavy unit (8+3=11 RE)', hexId: objHex },
      { id: 'advance:done', label: 'Done', hexId: null },
    ];
    const ctx: BotDecisionContext = {
      seatId: 'seat:test' as BotDecisionContext['seatId'],
      playerId: actor,
      rng: createBotRng(7, 'adv', 0),
      memory: { stepKey: 'adv', actions: 0, notes: new Map() },
      view: { projection, pendingDecision: { id: 'dec:adv', kind: 'ADVANCE_HEX', ownerId: actor, prompt: 'Advance', options } } as unknown as BotDecisionContext['view'],
      actions: {
        families: () => ['RESPOND_DECISION'],
        candidates: () => options.map((o) => ({
          actionId: `cand:${o.id}`, actorId: actor, expectedRevision: state.revision,
          kind: 'RESPOND_DECISION', decisionId: 'dec:adv', choiceId: o.id,
        })) as unknown as readonly GameAction[],
        explain: () => ({
          current: true,
          explanation: {
            actionKind: 'RESPOND_DECISION', allowed: true, reasons: [],
            facts: [
              { key: 'supply.advanceFunded', value: true, visibility: 'OWNER_ONLY', ownerId: actor },
              { key: 'supply.advanceFeedLost', value: 0, visibility: 'OWNER_ONLY', ownerId: actor },
              { key: 'supply.advanceTraceLost', value: 0, visibility: 'OWNER_ONLY', ownerId: actor },
              { key: 'supply.advanceMoverHasTrace', value: true, visibility: 'OWNER_ONLY', ownerId: actor },
            ],
          },
        }),
      } as unknown as BotDecisionContext['actions'],
    };
    // 8 + 3 = 11 RE > 10 RE stacking limit: must choose advance:done instead of triggering OVERSTACK_ELIMINATION.
    expect(respondToDecision(ctx, synthSit)!.action).toMatchObject({ choiceId: 'advance:done' });
  });

  it('analyze keeps non-zero strategic threat for enemy STRAT divisions while HQs project zero offensive threatAt', () => {
    const base = loadBarrageFixture();
    const actor = base.sequence.actingPlayerId;
    const enemyId = base.scenario.players.find((p) => p.id !== actor)!.id;
    const enemyCombat = base.pieceState.pieces.find((p) => p.ownerId === enemyId && isCombatUnit(base, p) && !isHq(base, p) && !isArtillery(base, p) && hexOf(p) !== null)!;
    const enemyHq = base.pieceState.pieces.find((p) => p.ownerId === enemyId && isHq(base, p) && hexOf(p) !== null)!;
    const stratHex = '2,2' as HexId;
    const hqHex = '2,10' as HexId;
    const modified: GameState = {
      ...base,
      pieceState: {
        ...base.pieceState,
        pieces: base.pieceState.pieces
          .filter((p) => hexOf(p) !== stratHex && hexOf(p) !== hqHex)
          .map((p) => p.id === enemyCombat.id ? { ...p, mode: 'STRAT', currentFaceId: 'move' as typeof p.currentFaceId, location: { kind: 'ON_MAP' as const, hexId: stratHex } }
            : p.id === enemyHq.id ? { ...p, mode: 'COMBAT', currentFaceId: 'combat' as typeof p.currentFaceId, location: { kind: 'ON_MAP' as const, hexId: hqHex } }
              : p),
      },
    };
    const sit = analyze(ruleEngine.projectForViewer(modified, actor), actor, { scenario: modified.scenario, turnLimit: 8 });
    expect(sit.enemy.get(stratHex)?.strength ?? 0).toBeGreaterThan(0);
    // HQs never initiate offensive ground assaults, so they add 0 to threatAt.
    expect(sit.threatAt(hqHex)).toBe(0);
  });

  it('plannedAttack halves DG and OOS attackers while preserving STRAT planned Combat-Mode strength', () => {
    const base = loadBarrageFixture();
    const actor = base.sequence.actingPlayerId;
    const attacker = base.pieceState.pieces.find((p) => p.ownerId === actor && isCombatUnit(base, p) && !isHq(base, p) && !isArtillery(base, p) && hexOf(p) !== null)!;
    const targetHex = '12,12' as HexId;
    const normalState: GameState = {
      ...base,
      pieceState: { ...base.pieceState, pieces: base.pieceState.pieces.map((p) => p.id === attacker.id ? { ...p, mode: 'COMBAT', statuses: [] } : p) },
    };
    const stratState: GameState = {
      ...base,
      pieceState: { ...base.pieceState, pieces: base.pieceState.pieces.map((p) => p.id === attacker.id ? { ...p, mode: 'STRAT', statuses: [] } : p) },
    };
    const dgState: GameState = {
      ...base,
      pieceState: { ...base.pieceState, pieces: base.pieceState.pieces.map((p) => p.id === attacker.id ? { ...p, mode: 'DG', statuses: [] } : p) },
    };
    const oosState: GameState = {
      ...base,
      pieceState: { ...base.pieceState, pieces: base.pieceState.pieces.map((p) => p.id === attacker.id ? { ...p, mode: 'COMBAT', statuses: [{ statusDefinitionId: 'status:out-of-supply' as never, value: { kind: 'FLAG', value: true } }] } : p) },
    };
    const strengthOf = (s: GameState) => ruleEngine.queryAttackStrength(s, actor, [attacker.id], targetHex).value!.options[0]!.strengths[0]!.strength;
    const baseStr = strengthOf(normalState);
    expect(baseStr).toBeGreaterThan(0);
    expect(strengthOf(stratState)).toBeCloseTo(baseStr, 6);
    expect(strengthOf(dgState)).toBeCloseTo(baseStr * 0.5, 6);
    expect(strengthOf(oosState)).toBeCloseTo(baseStr * 0.5, 6);
  });

  it('queryHqThrow returns empty throw for STRAT-mode HQ at its own hex and unitsNeedingSupply excludes air-dropped units', () => {
    const base = loadBarrageFixture();
    const actor = base.sequence.actingPlayerId;
    const hq = base.pieceState.pieces.find((p) => p.ownerId === actor && isHq(base, p) && hexOf(p) !== null)!;
    const stratHqState: GameState = {
      ...base,
      pieceState: { ...base.pieceState, pieces: base.pieceState.pieces.map((p) => p.id === hq.id ? { ...p, mode: 'STRAT' } : p) },
    };
    const thrown = ruleEngine.queryHqThrow(stratHqState, actor, hq.id, hexOf(hq)!).value!;
    expect(thrown.fed).toBe(false);
    expect(thrown.hexIds).toEqual([]);

    const unit = base.pieceState.pieces.find((p) => p.ownerId === actor && isCombatUnit(base, p) && hexOf(p) !== null)!;
    const droppedState: GameState = { ...base, air: { ...base.air, droppedIds: [unit.id] } };
    expect(unitsNeedingSupply(droppedState, actor).some((p) => p.id === unit.id)).toBe(false);
  });

  it('COMBINE_TRANSPORT generates valid <= 5-point subsets when stacked trucks exceed 5 total points', () => {
    const base = loadBarrageFixture();
    const actor = base.sequence.actingPlayerId;
    const truck = base.pieceState.pieces.find((p) => p.ownerId === actor && isTransportPoint(base, p) && hexOf(p) !== null)!;
    const stackHex = hexOf(truck)!;
    const t1 = withStatus({ ...truck, id: 'test:truck-1' as never, location: { kind: 'ON_MAP', hexId: stackHex } }, TRANSPORT_POINTS_STATUS, { kind: 'INTEGER', value: 2 });
    const t2 = withStatus({ ...truck, id: 'test:truck-2' as never, location: { kind: 'ON_MAP', hexId: stackHex } }, TRANSPORT_POINTS_STATUS, { kind: 'INTEGER', value: 2 });
    const t3 = withStatus({ ...truck, id: 'test:truck-3' as never, location: { kind: 'ON_MAP', hexId: stackHex } }, TRANSPORT_POINTS_STATUS, { kind: 'INTEGER', value: 2 });
    const state: GameState = {
      ...base,
      sequence: { ...base.sequence, phase: 'MOVEMENT', segment: 'MOVEMENT' },
      usage: [],
      pieceState: {
        ...base.pieceState,
        pieces: [...base.pieceState.pieces.filter((p) => !(p.ownerId === actor && isTransportPoint(base, p) && hexOf(p) === stackHex)), t1, t2, t3],
      },
    };
    const actions = ruleEngine.getActionCandidates(state, { actorId: actor, kind: 'COMBINE_TRANSPORT', pieceId: t1.id, budget: 20 }).actions;
    expect(actions.length).toBeGreaterThan(0);
    for (const action of actions) {
      expect(action.kind).toBe('COMBINE_TRANSPORT');
      if (action.kind === 'COMBINE_TRANSPORT') {
        expect(action.truckIds).toContain(t1.id);
        expect(action.truckIds.length).toBe(2);
      }
    }
  });
});
