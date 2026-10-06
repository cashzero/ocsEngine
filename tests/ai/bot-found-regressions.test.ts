import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  DEFAULT_NEW_GAME_REQUEST,
  createInitialGameState,
  prepareNewGame,
  ruleEngine,
  type GameAction,
  type GameState,
} from '../../src/index.js';

/** A generated game replayed to the position where a bot match found a fault. */
interface BotFoundPosition {
  readonly note: string;
  readonly seeds: { readonly map: number; readonly oob: number; readonly deployment: number; readonly rules: number };
  readonly turnLimit: number;
  readonly actions: readonly GameAction[];
}

const replayPosition = (fixture: string): GameState => {
  const position = JSON.parse(readFileSync(join(__dirname, 'fixtures', fixture), 'utf8')) as BotFoundPosition;
  const prepared = prepareNewGame({ ...DEFAULT_NEW_GAME_REQUEST, seeds: position.seeds, turnLimit: position.turnLimit });
  if (!prepared.ok) throw new Error('fixture game did not generate');
  const created = createInitialGameState(prepared.value.scenario, prepared.value.configuration, position.seeds.rules);
  if (!created.ok) throw new Error('fixture game did not start');
  return position.actions.reduce((state, action) => {
    const next = ruleEngine.applyAction(state, action);
    if (!next.ok) throw new Error(`fixture action ${action.kind} was rejected`);
    return next.state;
  }, created.value);
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
    const state = replayPosition('rebuild-under-enemy.json');
    const actorId = state.sequence.actingPlayerId;
    const offered = ruleEngine.getActionCandidates(state, { actorId, kind: 'REBUILD_UNITS', pieceId: null, budget: 99 }).actions;
    expect(offered.length).toBeGreaterThan(0);
    expect(offered.filter((action) => !ruleEngine.applyAction(state, action).ok).map((action) => action.kind === 'REBUILD_UNITS' ? action.hexId : '')).toEqual([]);
  });

  it('never offers a barrage part payment the remaining dumps cannot complete (10.1b)', () => {
    const state = replayPosition('barrage-part-payment.json');
    expect(state.pendingDecision?.kind).toBe('SUPPLY_SOURCE');
    expect(deadEnds(state)).toEqual([]);
  });
});
