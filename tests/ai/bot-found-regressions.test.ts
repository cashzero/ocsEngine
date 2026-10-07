import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { gunzipSync } from 'node:zlib';
import { describe, expect, it } from 'vitest';
import { parseGameStateJson, ruleEngine, type GameState } from '../../src/index.js';

/**
 * The position where a bot match found a fault, stored as a canonical GameState snapshot (gzip JSON) so the test does
 * not depend on today's generators: the fixtures were played with OOB generator 0.3.0.
 */
const replayPosition = (fixture: string): GameState => {
  const stored = JSON.parse(gunzipSync(readFileSync(join(__dirname, 'fixtures', fixture))).toString('utf8')) as { snapshot: string };
  const parsed = parseGameStateJson(stored.snapshot);
  if (!parsed.ok) throw new Error(`fixture ${fixture} is not a valid GameState`);
  return parsed.value;
};

/** Answers every option of every decision reachable from `state` and returns the options that threw. */
const deadEnds = (state: GameState, depth = 0): string[] => {
  const decision = state.pendingDecision;
  if (decision === null || depth > 4) return [];
  return ruleEngine.getActionCandidates(state, { actorId: decision.ownerId, kind: 'RESPOND_DECISION', pieceId: null, budget: 99 }).actions
    .flatMap((action) => {
      const choice = action.kind === 'RESPOND_DECISION' ? action.choiceId : action.kind;
      try {
        const next = ruleEngine.applyAction(state, action);
        return next.ok ? deadEnds(next.state, depth + 1) : [`${choice}: rejected`];
      } catch (error) {
        return [`${choice}: ${error instanceof Error ? error.message : String(error)}`];
      }
    });
};

describe('positions found by bot matches', () => {
  it('offers no rebuild into a hex where enemy combat units stand on the Repls (13.5a)', () => {
    const state = replayPosition('rebuild-under-enemy.state.json.gz');
    const actorId = state.sequence.actingPlayerId;
    const offered = ruleEngine.getActionCandidates(state, { actorId, kind: 'REBUILD_UNITS', pieceId: null, budget: 99 }).actions;
    expect(offered.length).toBeGreaterThan(0);
    expect(offered.filter((action) => !ruleEngine.applyAction(state, action).ok).map((action) => action.kind === 'REBUILD_UNITS' ? action.hexId : '')).toEqual([]);
  });

  it('never offers a barrage part payment the remaining dumps cannot complete (10.1b)', () => {
    const state = replayPosition('barrage-part-payment.state.json.gz');
    expect(state.pendingDecision?.kind).toBe('SUPPLY_SOURCE');
    expect(deadEnds(state)).toEqual([]);
  });
});
