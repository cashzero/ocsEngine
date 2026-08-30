import type { GameAction, GameState, RuleEvent, RuleViolation } from './model.js';
import { applyGameAction } from './reducer.js';

export type RuleReplayResult =
  | { readonly ok: true; readonly state: GameState; readonly events: readonly RuleEvent[] }
  | { readonly ok: false; readonly state: GameState; readonly events: readonly RuleEvent[]; readonly failedActionIndex: number; readonly violations: readonly RuleViolation[] };

export const replayRuleActions = (
  initialState: GameState,
  actions: readonly GameAction[],
): RuleReplayResult => {
  let state = initialState;
  const events: RuleEvent[] = [];
  for (let index = 0; index < actions.length; index += 1) {
    const result = applyGameAction(state, actions[index]!);
    if (!result.ok) {
      return { ok: false, state, events, failedActionIndex: index, violations: result.violations };
    }
    state = result.state;
    events.push(...result.events);
  }
  return { ok: true, state, events };
};
