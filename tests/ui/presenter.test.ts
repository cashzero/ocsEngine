import { describe, expect, it } from 'vitest';
import {
  actionKindLabel,
  actionSummary,
  printedHexLabel,
  buildGeneratedMapPreview,
  buildGeneratedOobPreview,
  createRuleGameStateFixture,
  generateRandomMap,
  generateRandomOob,
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
    expect(actionKindLabel(action.kind)).toBe('End step');
    expect(actionSummary(action)).toBe('End the current step');
    expect(printedHexLabel('3,4')).toBe('0605');
  });

  it('projects generated terrain and infrastructure into an SVG-ready model', () => {
    const generated = generateRandomMap({ width: 18, height: 12, seed: 1943, style: 'WESTERN_EUROPE', sea: 'WEST' });
    expect(generated.ok).toBe(true);
    if (!generated.ok) return;
    const preview = buildGeneratedMapPreview(generated.value);
    expect(preview.cells).toHaveLength(216);
    expect(preview.cells.some(({ terrain }) => terrain === 'WATER')).toBe(true);
    expect(preview.edges.some(({ kind }) => kind === 'PRIMARY_ROAD')).toBe(true);
    expect(preview.edges.some(({ kind }) => kind === 'RIVER' || kind === 'MAJOR_RIVER')).toBe(true);
  });

  it('projects generated OOB definitions into readable counter summaries', () => {
    const generated = generateRandomOob({ seed: 1944, scale: 'STANDARD', divisionsPerSide: 3, armoredDivisionsPerSide: 1 });
    expect(generated.ok).toBe(true);
    if (!generated.ok) return;
    const preview = buildGeneratedOobPreview(generated.value);
    expect(preview.sides).toHaveLength(2);
    expect(preview.sides.every(({ formations }) => formations.length === 3)).toBe(true);
    expect(preview.sides.flatMap(({ formations }) => formations)
      .every(({ units }) => units.length === 1 // infantry and German airborne divisions are a single XX unit
        || (units.some(({ role }) => role === 'COMBAT') && !units.some(({ role }) => role === 'HQ')))).toBe(true);
    expect(preview.sides.flatMap(({ formations }) => formations)
      .flatMap(({ units }) => units).some(({ combatStrength }) => combatStrength !== null)).toBe(true);
  });
});
