import { readFileSync } from 'node:fs';
import { gunzipSync } from 'node:zlib';
import { describe, expect, it } from 'vitest';
import {
  createBotActionAccess, createBotRng, createGameplayFixture, createHeuristicPolicy, forecastCombat,
  hashGameState, heuristicWeights, parseGameStateJson, ruleEngine, serializeGameState,
  type GameState, type HexId, type RuleFact,
} from '../../src/index.js';
import { hexOf, isArtillery, isCombatUnit } from '../../src/rules/pieces.js';

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
