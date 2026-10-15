import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { gunzipSync } from 'node:zlib';
import { describe, expect, it } from 'vitest';
import { analyze } from '../../src/ai/analysis.js';
import { knowledgeOf } from '../../src/ai/knowledge.js';
import { parseGameStateJson, ruleEngine, type GameState, type PlayerId } from '../../src/index.js';

const GROUND = ['COMBAT', 'ARTILLERY', 'HQ'];
const load = (name: string): GameState => {
  const stored = JSON.parse(gunzipSync(readFileSync(join(__dirname, 'fixtures', `${name}.state.json.gz`))).toString()) as { snapshot: string };
  const parsed = parseGameStateJson(stored.snapshot);
  if (!parsed.ok) throw new Error('Invalid fixture');
  return parsed.value;
};

// heuristic@75: counters hidden under a stack's top are valued from the opponent's order of battle, and add nothing when the
// stack shows no combat unit (the projection always shows one on top when the stack holds one).
describe('hidden enemy strength in recorded positions', () => {
  it.each(['vp-capture-1210002', 'vp-threat-1281104', 'vp-trace-gain-1221000'])('%s: rear stacks add nothing and the estimate beats the old one', (name) => {
    const state = load(name);
    const facts = { scenario: state.scenario, turnLimit: 8 };
    const knowledge = knowledgeOf(facts);
    let newError = 0, oldError = 0, rearStacks = 0;
    for (const viewer of ['player:allied', 'player:axis'] as PlayerId[]) {
      const enemyId = (viewer === 'player:allied' ? 'player:axis' : 'player:allied') as PlayerId;
      const projection = ruleEngine.projectForViewer(state, viewer);
      const truth = ruleEngine.projectForViewer(state, enemyId);
      const situation = analyze(projection, viewer, facts);
      const visibleCombat = projection.stacks.flatMap(s => s.pieces).filter(p => p.ownerId !== viewer && p.role === 'COMBAT')
        .map(p => knowledge.profile(p)?.strength ?? 0).filter(v => v > 0);
      const oldHidden = visibleCombat.reduce((a, b) => a + b, 0) / Math.max(1, visibleCombat.length);
      for (const stack of projection.stacks) {
        if (stack.location.kind !== 'ON_MAP' || stack.hiddenCount === 0) continue;
        const hexId = stack.location.hexId;
        const shown = stack.pieces.filter(p => p.ownerId !== viewer);
        const visible = shown.filter(p => GROUND.includes(p.role)).reduce((a, p) => a + (knowledge.profile(p)?.strength ?? 0), 0);
        const estimate = situation.enemy.get(hexId)?.strength ?? 0;
        if (!shown.some(p => p.role === 'COMBAT')) {
          rearStacks += 1;
          expect(estimate).toBe(visible);
        }
        const actual = truth.stacks.find(s => s.location.kind === 'ON_MAP' && s.location.hexId === hexId)!.pieces
          .filter(p => p.ownerId === enemyId && GROUND.includes(p.role)).reduce((a, p) => a + (knowledge.profile(p)?.strength ?? 0), 0);
        newError += Math.abs(estimate - actual);
        oldError += Math.abs(visible + stack.hiddenCount * oldHidden - actual);
      }
    }
    expect(rearStacks).toBeGreaterThan(0);
    expect(newError).toBeLessThan(oldError);
  });
});
