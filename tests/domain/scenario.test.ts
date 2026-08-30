import { describe, expect, it } from 'vitest';
import {
  createFoundationScenarioFixture, formatHexId, hex, parseDefinitionId, parsePlayerId,
  validateScenarioDefinition,
  type DefinitionId, type Result, type ScenarioDefinition,
} from '../../src/index.js';

const must = <T, E>(result: Result<T, E>): T => {
  if (!result.ok) throw new Error('Expected a successful test fixture result.');
  return result.value;
};
const definitionId = (value: string): DefinitionId => must(parseDefinitionId(value));

describe('Scenario envelope', () => {
  it('validates one complete fixed scenario envelope', () => {
    expect(validateScenarioDefinition(createFoundationScenarioFixture())).toEqual([]);
  });

  it('uses the same envelope for generated input without a generator dependency', () => {
    const generated: ScenarioDefinition = {
      ...createFoundationScenarioFixture(),
      generatorMetadata: {
        generatorDefinitionId: definitionId('generator:synthetic'), version: '1',
        seeds: [{ kind: 'map', value: '1001' }, { kind: 'oob', value: '2002' }],
      },
    };
    expect(validateScenarioDefinition(generated)).toEqual([]);
  });

  it('reports cross-aggregate player, place, table, and Hex references with paths', () => {
    const source = createFoundationScenarioFixture();
    const malformed: ScenarioDefinition = {
      ...source,
      turnStart: { ...source.turnStart, firstPlayerId: must(parsePlayerId('player:missing')) },
      initialPieceState: {
        ...source.initialPieceState,
        pieces: source.initialPieceState.pieces.map((piece) => ({
          ...piece,
          location: { kind: 'HOLDING_AREA' as const, boxId: source.boxes[0]!.id },
        })),
      },
      entries: [{ ...source.entries[0]!, hexId: formatHexId(hex(9, 9)) }],
      externalTables: [],
    };
    const issues = validateScenarioDefinition(malformed);
    const codes = issues.map(({ code }) => code);

    expect(codes).toContain('UNKNOWN_FIRST_PLAYER');
    expect(codes).toContain('SCENARIO_BOX_KIND_MISMATCH');
    expect(codes).toContain('UNKNOWN_SCENARIO_HEX');
    expect(codes).toContain('MISSING_EXTERNAL_TABLE_REFERENCE');
    expect(issues.every(({ path }) => path.length > 0)).toBe(true);
  });
});
