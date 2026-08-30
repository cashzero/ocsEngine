import { describe, expect, it } from 'vitest';
import {
  canonicalizeScenarioDefinition,
  createFoundationScenarioFixture,
  hashScenarioDefinition,
  migratePersistentAggregate,
  parseScenarioDefinition,
  parseScenarioJson,
  serializeScenarioDefinition,
} from '../../src/index.js';

describe('strict Scenario persistence', () => {
  it('canonicalizes, serializes, reloads, and validates without direct casts', () => {
    const source = createFoundationScenarioFixture();
    const serialized = serializeScenarioDefinition(source);
    expect(serialized.ok).toBe(true);
    if (!serialized.ok) return;

    const reloaded = parseScenarioJson(serialized.value);
    expect(reloaded).toEqual({ ok: true, value: canonicalizeScenarioDefinition(source) });
  });

  it('rejects unknown nested fields and reports their complete paths', () => {
    const raw = JSON.parse(JSON.stringify(createFoundationScenarioFixture())) as {
      mapDefinition: { hexes: Array<Record<string, unknown>> };
    };
    raw.mapDefinition.hexes[0]!.futureTerrainMode = 'surprise';
    const parsed = parseScenarioDefinition(raw);

    expect(parsed.ok).toBe(false);
    if (parsed.ok) return;
    expect(parsed.error).toContainEqual(expect.objectContaining({
      code: 'UNKNOWN_SCHEMA_FIELD',
      path: ['mapDefinition', 'hexes', 0, 'futureTerrainMode'],
    }));
  });

  it('rejects unsupported versions for every persistent aggregate', () => {
    const raw = JSON.parse(JSON.stringify(createFoundationScenarioFixture())) as {
      mapDefinition: { schemaVersion: number };
      initialPieceState: { schemaVersion: number };
    };
    raw.mapDefinition.schemaVersion = 2;
    raw.initialPieceState.schemaVersion = 2;
    const parsed = parseScenarioDefinition(raw);

    expect(parsed.ok).toBe(false);
    if (parsed.ok) return;
    const versionPaths = parsed.error
      .filter(({ code }) => code === 'UNSUPPORTED_SCHEMA_VERSION')
      .map(({ path }) => path);
    expect(versionPaths).toEqual([
      ['mapDefinition', 'schemaVersion'],
      ['initialPieceState', 'schemaVersion'],
    ]);
  });

  it('produces identical canonical text and SHA-256 for reordered set collections', async () => {
    const first = createFoundationScenarioFixture();
    const second = { ...first, boxes: [...first.boxes].reverse() };
    const firstText = serializeScenarioDefinition(first);
    const secondText = serializeScenarioDefinition(second);
    const firstHash = await hashScenarioDefinition(first);
    const secondHash = await hashScenarioDefinition(second);

    expect(firstText).toEqual(secondText);
    expect(firstHash).toEqual(secondHash);
    expect(firstHash.ok && firstHash.value).toMatch(/^sha256:[a-f0-9]{64}$/);
  });

  it('exposes a migration seam but invents no migrations', () => {
    const result = migratePersistentAggregate(
      'SCENARIO_DEFINITION',
      { schemaVersion: 1 },
      1,
      2,
    );
    expect(result).toMatchObject({
      ok: false,
      error: [{ code: 'MISSING_SCHEMA_MIGRATION', path: ['schemaVersion'] }],
    });
  });
});
