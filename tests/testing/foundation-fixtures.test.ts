import { describe, expect, it } from 'vitest';
import {
  buildHexDefinition,
  buildPieceDefinition,
  buildPieceState,
  createFixtureIdFactory,
  createFoundationScenarioFixture,
  createMalformedFoundationFixtures,
  validateScenarioDefinition,
} from '../../src/index.js';

describe('Foundation fixture kit', () => {
  it('builds the deterministic, structurally valid 5x5 integration fixture', () => {
    const first = createFoundationScenarioFixture();
    const second = createFoundationScenarioFixture();

    expect(first).toEqual(second);
    expect(validateScenarioDefinition(first)).toEqual([]);
    expect(first.mapDefinition.hexes).toHaveLength(25);
    expect(first.mapDefinition.hexsides.map(({ featureDefinitionIds }) => featureDefinitionIds))
      .toEqual([
        ['edge:road'],
        ['edge:river'],
        ['edge:rail'],
        ['edge:river', 'edge:bridge'],
      ]);
  });

  it('covers required Piece families, steps, capabilities, and locations', () => {
    const scenario = createFoundationScenarioFixture();
    const definitions = scenario.pieceCatalog.definitions;
    const pieces = scenario.initialPieceState.pieces;

    expect(definitions.find(({ id }) => id === 'piece-definition:multi-step')
      ?.faces[0]?.steps.map(({ remainingSteps }) => remainingSteps)).toEqual([2, 1]);
    expect(definitions.find(({ id }) => id === 'piece-definition:hq')
      ?.capabilities[0]?.id).toBe('HQ');
    expect(definitions.find(({ id }) => id === 'piece-definition:artillery')
      ?.capabilities[0]?.id).toBe('ARTILLERY');
    expect(definitions.find(({ id }) => id === 'piece-definition:transport')
      ?.capabilities[0]?.id).toBe('TRANSPORT_CAPACITY');
    expect(definitions.find(({ id }) => id === 'piece-definition:supply-dump')?.family)
      .toBe('RESOURCE');
    expect(new Set(pieces.map(({ location }) => location.kind))).toEqual(new Set([
      'ON_MAP', 'OFF_MAP_BOX', 'HOLDING_AREA', 'CONTAINER',
    ]));
  });

  it('supports deterministic IDs and focused per-field overrides', () => {
    const first = createFixtureIdFactory('test');
    const second = createFixtureIdFactory('test');
    expect(first.nextDefinitionId('terrain')).toBe(second.nextDefinitionId('terrain'));
    expect(first.nextPieceId('unit')).toBe('test:piece:unit:0001');

    expect(buildHexDefinition(1, 2, { terrainDefinitionIds: [] }).terrainDefinitionIds).toEqual([]);
    expect(buildPieceDefinition({ name: 'Override' }).name).toBe('Override');
    expect(buildPieceState({ stackOrder: 7 }).stackOrder).toBe(7);
    expect(createFoundationScenarioFixture({ generatorMetadata: {
      generatorDefinitionId: first.nextDefinitionId('generator'),
      version: 'test',
      seeds: [],
    } }).generatorMetadata?.version).toBe('test');
    expect(createFixtureIdFactory.toString()).not.toContain('Math.random');
  });

  it('provides named malformed fixtures with stable expected issue codes', () => {
    for (const fixture of createMalformedFoundationFixtures()) {
      const codes = validateScenarioDefinition(fixture.scenario).map(({ code }) => code);
      expect(codes, fixture.name).toContain(fixture.expectedCode);
    }
  });
});
