import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { gunzipSync } from 'node:zlib';
import { describe, expect, it } from 'vitest';
import { parseGameStateJson, pieceHasTrace, ruleEngine, type GameAction, type GameState } from '../../src/index.js';
import { requiredRecoveryOutcome } from '../../src/rules/supply/ration-budget.js';
import { internalStocksOf } from '../../src/rules/pieces.js';

const fact = (state: GameState, action: GameAction, key: string) =>
  ruleEngine.explain(state, action).facts.find((entry) => entry.key === key)?.value;

describe('fuel payments keep the SP a cut-off unit needs to recover its internal stocks (12.10e)', () => {
  // Recorded meeting game (seed 1300000, Allied Movement Segment of turn 3): an Axis move cut the Allied anti-tank unit at 20,3
  // off its trace; its required recovery in the coming Supply Phase draws the last Token it can reach. heuristic@79 paid
  // another unit's fuel from that Token, and the anti-tank unit then neither recovered nor ate and lost a step to attrition.
  const fixture = JSON.parse(gunzipSync(readFileSync(join(__dirname, 'fixtures', 'ration-recovery-1300000.state.json.gz'))).toString()) as { snapshot: string; action: GameAction };
  const parsed = parseGameStateJson(fixture.snapshot);
  if (!parsed.ok) throw new Error('Invalid recorded state');
  const state = parsed.value;
  const victim = state.pieceState.pieces.find((piece) => String(piece.id).endsWith('allied:independent-anti_tank-2:unit'))!;

  it('reports the payment that takes that SP as breaking the commitments', () => {
    expect(pieceHasTrace(state, victim)).toBe(false);
    const recovered = requiredRecoveryOutcome(state, victim.ownerId).levels.get(victim.id);
    expect(recovered).toBeDefined();
    expect(recovered).not.toBe(internalStocksOf(victim));
    expect(fixture.action.kind).toBe('PAY_FUEL');
    expect(ruleEngine.explain(state, fixture.action).allowed).toBe(true);
    expect(fact(state, fixture.action, 'supply.recoveryLoweredUnits')).toBe(1);
    expect(fact(state, fixture.action, 'supply.rationCommitmentsPreserved')).toBe(false);
  });

  it('still preserves the commitments for a payment from SP no cut-off unit needs', () => {
    const others = ruleEngine.getActionCandidates(state, { actorId: fixture.action.actorId, kind: 'PAY_FUEL', pieceId: null, budget: 200 }).actions
      .filter((action) => action.kind === 'PAY_FUEL' && action.sourcePieceId !== (fixture.action.kind === 'PAY_FUEL' ? fixture.action.sourcePieceId : null));
    expect(others.length).toBeGreaterThan(0);
    expect(others.some((action) => fact(state, action, 'supply.rationCommitmentsPreserved') === true)).toBe(true);
  });
});
