import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { gunzipSync } from 'node:zlib';
import { describe, expect, it } from 'vitest';
import {
  DEFAULT_HEURISTIC_WEIGHTS, analyze, createBotRng, createHeuristicPolicy, parseGameStateJson, ruleEngine,
  type BotActionAccess, type BotDecisionContext, type GameState,
} from '../../src/index.js';
import { hexesBetween } from '../../src/ai/knowledge.js';
import { allocateTheater, captureProbability } from '../../src/ai/policies/theater.js';

const access = (state: GameState): BotActionAccess => {
  const actorId = state.sequence.actingPlayerId;
  return {
    families: () => ruleEngine.getActionFamilies(state, actorId).filter(f => f.enabled).map(f => f.kind),
    movementRange: pieceId => ruleEngine.queryMovementRange(state, actorId, pieceId).value!,
    candidates: (kind, pieceId = null, budget = 400) => ruleEngine.getActionCandidates(state, { actorId, kind, pieceId, budget }).actions,
    explain: action => ({ current: true, explanation: ruleEngine.explain(state, action) }),
    traceCoverage: (pieceId = null) => ruleEngine.queryTraceCoverage(state, actorId, pieceId).value!,
    feedCoverage: (pieceId = null) => ruleEngine.queryFeedCoverage(state, actorId, pieceId).value!,
    drawReach: hexId => new Set((ruleEngine.queryDrawReach(state, actorId, hexId).value ?? []).map(String)),
    attackStrength: (attackerIds, targetHexId) => ruleEngine.queryAttackStrength(state, actorId, attackerIds, targetHexId).value!,
  };
};

// Game Turn 1, the Axis Movement segment of a Western Europe Axis-attack game (P7 match 1500003).
const opening = (): GameState => {
  const stored = JSON.parse(gunzipSync(readFileSync(join(__dirname, 'fixtures', 'theater-allocation-1500003.state.json.gz'))).toString()) as { snapshot: string };
  const parsed = parseGameStateJson(stored.snapshot);
  if (!parsed.ok) throw new Error('Invalid fixture');
  return parsed.value;
};

describe('theater allocation (plan P11.8 candidate)', () => {
  it('matches the frozen capture model of plan P11.3', () => {
    // Reference values from scripts/ai-theater-capture-model.py predict() on the frozen model.
    expect(captureProbability({ column: 6, drm: 3, defenderCanPay: true, hedgehogLevel: 0, line: 'CLOSE' })).toBeCloseTo(0.3896033787972916, 12);
    expect(captureProbability({ column: 2, drm: 0, defenderCanPay: true, hedgehogLevel: 1, line: 'OPEN' })).toBeCloseTo(0.0027215327209392957, 12);
    expect(captureProbability({ column: 10, drm: 4, defenderCanPay: false, hedgehogLevel: 0, line: 'EXTREMELY_CLOSE' })).toBeCloseTo(0.9959509635964245, 12);
  });

  it('sends only units that can reach the objective or stop beside it, the same way each time', () => {
    const state = opening();
    const actorId = state.sequence.actingPlayerId;
    const facts = { scenario: state.scenario, turnLimit: 8 };
    const situation = analyze(ruleEngine.projectForViewer(state, actorId), actorId, facts);
    const groups = allocateTheater(situation, access(state), new Set(), () => 2);
    expect(groups.length).toBeGreaterThan(0);
    for (const group of groups) {
      expect(group.probability).toBeGreaterThan(0);
      expect(group.probability).toBeLessThanOrEqual(1);
      for (const unitId of group.unitIds) {
        const unit = situation.own.find(({ piece }) => piece.id === unitId)!;
        const reach = new Set([String(unit.hexId), ...ruleEngine.queryMovementRange(state, actorId, unitId).value!.map(({ hexId }) => String(hexId))]);
        if (group.defended) {
          expect([...reach].some((hexId) => hexesBetween(hexId, group.hexId) === 1)).toBe(true);
        } else {
          expect(reach.has(String(group.hexId))).toBe(true);
        }
      }
    }
    expect(allocateTheater(situation, access(state), new Set(), () => 2)).toEqual(groups);
  });

  it('steers the attacker only when the weight is on, with a legal first decision', () => {
    const state = opening();
    const facts = { scenario: state.scenario, turnLimit: 8 };
    const decide = (theaterAllocation: number) => {
      const lines: string[] = [];
      const policy = createHeuristicPolicy(facts, { weights: { ...DEFAULT_HEURISTIC_WEIGHTS, theaterAllocation }, debug: (line) => lines.push(line) });
      const context: BotDecisionContext = {
        seatId: 'seat:theater' as BotDecisionContext['seatId'], playerId: state.sequence.actingPlayerId,
        memory: { stepKey: 'theater', actions: 0, notes: new Map() }, rng: createBotRng(7, 'theater', 0),
        view: { projection: ruleEngine.projectForViewer(state, state.sequence.actingPlayerId), pendingDecision: null } as unknown as BotDecisionContext['view'],
        actions: access(state),
      };
      const chosen = policy.decide(context);
      return { chosen, lines };
    };
    const off = decide(0), on = decide(1);
    expect(off.lines.some((line) => line.includes('THEATER'))).toBe(false);
    expect(on.lines.some((line) => line.includes('THEATER'))).toBe(true);
    expect(on.chosen).not.toBeNull();
    expect(ruleEngine.validateAction(state, on.chosen!.action).allowed).toBe(true);
  });
});
