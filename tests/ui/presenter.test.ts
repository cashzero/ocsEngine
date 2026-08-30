import { describe, expect, it } from 'vitest';
import {
  actionKindLabel,
  actionSummary,
  createRuleGameStateFixture,
  layoutHexMap,
} from '../../src/index.js';

describe('U3-U4 UI map and action presenters', () => {
  it('lays out every scenario hex deterministically with unique centers', () => {
    const scenario = createRuleGameStateFixture().scenario;
    const first = layoutHexMap(scenario);
    const second = layoutHexMap(scenario);
    expect(first).toEqual(second);
    expect(first.cells).toHaveLength(scenario.mapDefinition.hexes.length);
    expect(new Set(first.cells.map(({ x, y }) => `${x},${y}`)).size).toBe(first.cells.length);
    expect(first.cells.every(({ points }) => points.split(' ').length === 6)).toBe(true);
  });

  it('presents concise labels for rule-generated actions', () => {
    const state = createRuleGameStateFixture();
    const action = {
      actionId: 'action:ui:test' as never,
      actorId: state.sequence.actingPlayerId,
      expectedRevision: state.revision,
      kind: 'ADVANCE_SEQUENCE' as const,
    };
    expect(actionKindLabel(action.kind)).toBe('Advance sequence');
    expect(actionSummary(action)).toBe('Continue to the next segment');
  });
});
