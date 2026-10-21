import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { gunzipSync } from 'node:zlib';
import { describe, expect, it } from 'vitest';
import {
  createBotRng, createHeuristicPolicy, parseGameStateJson, ruleEngine,
  type BotDecisionContext, type BotPhaseMemory, type GameState, type HexId,
} from '../../src/index.js';
import { hexesBetween } from '../../src/ai/knowledge.js';
import { isCombatUnit } from '../../src/rules/pieces.js';

const context = (state: GameState, memory: BotPhaseMemory): BotDecisionContext => {
  const actorId = state.pendingDecision?.ownerId ?? state.sequence.actingPlayerId;
  return {
    seatId: 'seat:regression' as BotDecisionContext['seatId'], playerId: actorId, memory,
    rng: createBotRng(7, 'truck-shuttle', 0),
    view: { projection: ruleEngine.projectForViewer(state, actorId), pendingDecision: state.pendingDecision } as unknown as BotDecisionContext['view'],
    actions: {
      families: () => ruleEngine.getActionFamilies(state, actorId).filter(f => f.enabled).map(f => f.kind),
      movementRange: id => ruleEngine.queryMovementRange(state, actorId, id).value!,
      candidates: (kind, pieceId = null, budget = 400) => ruleEngine.getActionCandidates(state, { actorId, kind, pieceId, budget }).actions,
      explain: action => ({ current: true, explanation: ruleEngine.explain(state, action) }),
      traceCoverage: (id = null) => ruleEngine.queryTraceCoverage(state, actorId, id).value!,
      feedCoverage: (id = null) => ruleEngine.queryFeedCoverage(state, actorId, id).value!,
      drawReach: hexId => new Set((ruleEngine.queryDrawReach(state, actorId, hexId).value ?? []).map(String)),
      attackStrength: (attackerIds, targetHexId) => ruleEngine.queryAttackStrength(state, actorId, attackerIds, targetHexId).value!,
    },
  };
};

const REAR_DUMP = '28,6' as HexId;

describe('AI trucks shuttle SP from the rear to the front', () => {
  it('fetches from the rear dump, delivers forward and heads back for more instead of parking at the front', () => {
    // Recorded attack game (seed 1300202, Axis attacks, turn 4): three loaded trucks stand 5 hexes from the enemy
    // and the rear dump at 28,6 holds 36T. heuristic@75 unloaded all three where they stood and left the dump alone.
    const fixture = JSON.parse(gunzipSync(readFileSync(join(__dirname, 'fixtures', 'truck-shuttle-1300202.state.json.gz'))).toString()) as { snapshot: string };
    const parsed = parseGameStateJson(fixture.snapshot);
    if (!parsed.ok) throw new Error('Invalid recorded game');
    let state = parsed.value;
    const playerId = state.sequence.actingPlayerId;
    const hexOf = (current: GameState, id: string) => {
      const location = current.pieceState.pieces.find(p => p.id === id)?.location;
      return location?.kind === 'ON_MAP' ? location.hexId : null;
    };
    const enemyDistance = (current: GameState, hexId: HexId) => Math.min(...current.pieceState.pieces
      .filter(p => p.ownerId !== playerId && p.location.kind === 'ON_MAP' && isCombatUnit(current, p))
      .map(p => hexesBetween(hexOf(current, p.id)!, hexId)));
    const rearStock = (current: GameState) => current.pieceState.pieces
      .filter(p => p.ownerId === playerId && p.location.kind === 'ON_MAP' && p.location.hexId === REAR_DUMP)
      .reduce((total, p) => total + (p.resourceQuantity ?? 0), 0);
    expect(state.sequence).toMatchObject({ phase: 'MOVEMENT', segment: 'MOVEMENT' });
    const stockBefore = rearStock(state);
    expect(stockBefore).toBeGreaterThanOrEqual(20);

    const policy = createHeuristicPolicy({ scenario: state.scenario, turnLimit: state.configuration.turnLimit });
    const memory: BotPhaseMemory = { stepKey: 'truck-shuttle', actions: 0, notes: new Map() };
    const unloads: { truckId: string; hexId: HexId; tokens: number; enemy: number }[] = [];
    const loadedAtRear: string[] = [];
    for (let guard = 0; guard < 300 && state.sequence.segment === 'MOVEMENT' && state.pendingDecision === null; guard++) {
      const choice = policy.decide(context(state, memory));
      expect(choice).not.toBeNull();
      if (!choice) break;
      const before = state;
      const next = ruleEngine.applyAction(state, choice.action);
      expect(next.ok, JSON.stringify(choice.action)).toBe(true);
      if (!next.ok) break;
      state = next.state;
      const action = choice.action;
      if (action.kind === 'UNLOAD_SUPPLY') {
        const hexId = hexOf(before, action.truckId)!;
        unloads.push({ truckId: action.truckId, hexId, tokens: action.tokens, enemy: enemyDistance(before, hexId) });
      }
      if (action.kind === 'LOAD_SUPPLY' && hexOf(before, action.dumpId) === REAR_DUMP) loadedAtRear.push(action.truckId);
    }

    // Fetched from the rear: the 28,6 dump fills trucks more than once in the segment.
    expect(loadedAtRear.length).toBeGreaterThanOrEqual(2);
    expect(stockBefore - rearStock(state)).toBeGreaterThanOrEqual(20);
    // Delivered forward: every unload lies nearer the enemy than the rear dump, out of reach of an overrun (3+ hexes).
    expect(unloads.reduce((total, { tokens }) => total + tokens, 0)).toBeGreaterThanOrEqual(40);
    for (const unload of unloads) {
      expect(unload.enemy).toBeGreaterThanOrEqual(3);
      expect(unload.enemy).toBeLessThan(enemyDistance(parsed.value, REAR_DUMP));
    }
    // Shuttled: a truck that delivered went back, reloaded and delivered again in the same segment.
    const trucks = [...new Set([...unloads.map(({ truckId }) => truckId), ...loadedAtRear])];
    expect(trucks.some(id => unloads.filter(({ truckId }) => truckId === id).length >= 2)).toBe(true);
    // A truck that ends the segment loaded away from the rear dump has carried its SP forward, nearer the enemy than the
    // dump but no closer than a drop may be (3 hexes), toward a drop it could not reach this segment; one with MP left
    // after its last drop heads back.
    const carrying = (id: string) => state.pieceState.pieces.some(p => p.location.kind === 'CONTAINER' && p.location.containerId === id);
    for (const id of trucks.filter(truckId => carrying(truckId) && hexOf(state, truckId) !== REAR_DUMP)) {
      const end = hexOf(state, id)!;
      expect(enemyDistance(state, end)).toBeLessThan(enemyDistance(state, REAR_DUMP));
      expect(enemyDistance(state, end)).toBeGreaterThanOrEqual(3);
    }
    const returned = trucks.map(id => ({ end: hexOf(state, id)!, drop: unloads.filter(({ truckId }) => truckId === id).at(-1)?.hexId }))
      .filter(({ end, drop }) => drop !== undefined && end !== drop);
    expect(returned.length).toBeGreaterThan(0);
    for (const { end, drop } of returned) expect(hexesBetween(end, REAR_DUMP)).toBeLessThan(hexesBetween(drop!, REAR_DUMP));
  }, 120_000);
});
