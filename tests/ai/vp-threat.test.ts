import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { gunzipSync } from 'node:zlib';
import { describe, expect, it } from 'vitest';
import { parseGameStateJson, ruleEngine, type PlayerId, type HexId, type GameAction } from '../../src/index.js';
import { analyze } from '../../src/ai/analysis.js';
import { hexesBetween } from '../../src/ai/knowledge.js';

describe('VP threat from road advances in recorded games', () => {
  it('does not invent a distant road raid when the public TEC consumes the whole move per hex', () => {
    const stored = JSON.parse(gunzipSync(readFileSync(join(__dirname, 'fixtures', 'vp-threat-1281104.state.json.gz'))).toString()) as {
      snapshot: string; actor: PlayerId; point: { hexId: HexId }; lossAction: { choiceId: string };
    };
    const parsed = parseGameStateJson(stored.snapshot);
    if (!parsed.ok) throw new Error('Invalid recorded threat position');
    const state = parsed.value, attackerId = stored.lossAction.choiceId.slice('advance:'.length);
    const original = ruleEngine.projectForViewer(state, stored.actor);
    const projection = { ...original, stacks: original.stacks.filter(s => s.pieces.some(p => p.ownerId === stored.actor || p.id === attackerId))
      .map(s => ({ ...s, hiddenCount: 0, pieces: s.pieces.filter(p => p.ownerId === stored.actor || p.id === attackerId) })) };
    const facts = { scenario: state.scenario, turnLimit: 8 };
    expect(analyze(projection, stored.actor, facts).threatAt(stored.point.hexId)).toBeGreaterThan(0);
    const blockedState = { ...state, configuration: { ...state.configuration, roadMovementCosts: [], hexsideMovementCosts: [],
      terrainMovementCosts: state.configuration.terrainMovementCosts.map(c => ({ ...c,
        costs: { leg: { kind: 'ALL' as const }, truck: { kind: 'ALL' as const }, tracked: { kind: 'ALL' as const } } })) } };
    const blocked = { ...projection, objectiveRaidThreats: ruleEngine.projectForViewer(blockedState, stored.actor).objectiveRaidThreats ?? [] };

    expect(analyze(blocked, stored.actor, { ...facts }).threatAt(stored.point.hexId)).toBe(0);
  });
  it('recognizes the visible five-hex attacker that subsequently took a four-VP point', () => {
    const stored = JSON.parse(gunzipSync(readFileSync(join(__dirname, 'fixtures', 'vp-threat-1281104.state.json.gz'))).toString()) as {
      snapshot: string; actor: PlayerId; point: { hexId: HexId; points: number }; lossAction: { choiceId: string }; recordedActions: readonly GameAction[];
    };
    const parsed = parseGameStateJson(stored.snapshot);
    if (!parsed.ok) throw new Error('Invalid recorded threat position');
    const state = parsed.value, snapshot = JSON.stringify(state);
    const situation = analyze(ruleEngine.projectForViewer(state, stored.actor), stored.actor, { scenario: state.scenario, turnLimit: 8 });
    const attackerId = stored.lossAction.choiceId.slice('advance:'.length);
    const attacker = [...situation.enemy.values()].find(stack => stack.pieces.some(p => p.id === attackerId))!;
    expect(stored.point.points).toBe(4);
    expect(hexesBetween(attacker.hexId, stored.point.hexId)).toBe(5);
    expect(situation.threatAt(stored.point.hexId)).toBeGreaterThan(0);
    expect(JSON.stringify(state)).toBe(snapshot);
    let replay = state;
    for (const action of stored.recordedActions) {
      const next = ruleEngine.applyAction(replay, action);
      if (!next.ok) throw new Error('Recorded enemy capture rejected');
      replay = next.state;
    }
    expect(ruleEngine.projectForViewer(replay, stored.actor).objectives.find(p => p.hexId === stored.point.hexId)?.controllerId)
      .toBe('player:axis');
  });
});
