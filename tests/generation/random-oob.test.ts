import { describe, expect, it } from 'vitest';
import { FORMATION_NAME_PROFILES } from '../../src/generation/oob/name-catalog.js';
import {
  BTR_BUILD_FILE_SHA256,
  generateRandomOob,
  REVIEWED_OOB_ARCHETYPES,
  serializeGeneratedOob,
  validateGeneratedOob,
  validatePieceDefinitionCatalog,
} from '../../src/index.js';

const options = { seed: 1944, scale: 'STANDARD' as const, formationsPerSide: 3 };

describe('M7 deterministic random OOB pipeline', () => {
  it.each(['COMPACT', 'STANDARD', 'LARGE'] as const)('gives %s packages distinct WWII identities', (scale) => {
    for (const seed of [0, 7, 1944, 0xffffffff]) {
      const result = generateRandomOob({ seed, scale, formationsPerSide: 6 });
      expect(result.ok).toBe(true);
      if (!result.ok) return;
      for (const side of result.value.sides) {
        expect(new Set(side.formations.map((formation) => formation.name)).size).toBe(6);
        expect(side.formations.every((formation) => FORMATION_NAME_PROFILES.some((profile) =>
          profile.name === formation.name && profile.side === side.side && profile.archetype === formation.archetype))).toBe(true);
      }
      const names = result.value.pieceDefinitionCatalog.definitions.map((definition) => definition.name);
      expect(new Set(names).size).toBe(names.length);
      expect(names.every((name) => !/Independent|combat \d|undefined/.test(name))).toBe(true);
      expect(names.some((name) => name.includes('QM Truck Co'))).toBe(true);
      expect(names.some((name) => name.includes('Pionier-Btl.'))).toBe(true);
    }
  });

  it('returns byte-identical Foundation Piece Definitions for the same seed', () => {
    const first = generateRandomOob(options);
    const second = generateRandomOob(options);
    expect(first).toEqual(second);
    expect(first.ok).toBe(true);
    if (!first.ok || !second.ok) return;
    expect(serializeGeneratedOob(first.value)).toEqual(serializeGeneratedOob(second.value));
    expect(validatePieceDefinitionCatalog(first.value.pieceDefinitionCatalog)).toEqual([]);
  });

  it.each(['COMPACT', 'STANDARD', 'LARGE'] as const)(
    'builds complete, balanced %s formation/support/logistics packages',
    (scale) => {
      const generated = generateRandomOob({ ...options, scale, seed: scale.length * 101 });
      expect(generated.ok).toBe(true);
      if (!generated.ok) return;
      expect(validateGeneratedOob(generated.value)).toMatchObject({ valid: true, issues: [] });
      expect(generated.value.metrics.balanceRatio).toBe(1);
      expect(generated.value.sides).toHaveLength(2);
      for (const side of generated.value.sides) {
        expect(side.formations).toHaveLength(options.formationsPerSide);
        expect(side.independentUnits.map(({ role }) => role)).toEqual(expect.arrayContaining([
          'ARTILLERY', 'ENGINEER', 'TRANSPORT', 'SUPPLY',
        ]));
        for (const formation of side.formations) {
          expect(formation.units.filter(({ role }) => role === 'FORMATION_COMMAND')).toHaveLength(1);
          expect(formation.units.filter(({ role }) => role === 'COMBAT').length).toBeGreaterThanOrEqual(2);
          expect(formation.units.some(({ role }) => role === 'ARTILLERY')).toBe(true);
        }
      }
    },
  );

  it('uses reviewed BTR locators while keeping ratings explicitly synthetic', () => {
    expect(BTR_BUILD_FILE_SHA256).toMatch(/^[A-F0-9]{64}$/u);
    expect(REVIEWED_OOB_ARCHETYPES).toHaveLength(18);
    expect(REVIEWED_OOB_ARCHETYPES.every(({ rawName, gpid }) => rawName.length > 0 && gpid >= 0)).toBe(true);
    expect(REVIEWED_OOB_ARCHETYPES.some(({ rawName }) => /combat train/iu.test(rawName))).toBe(false);
    const generated = generateRandomOob(options);
    expect(generated.ok).toBe(true);
    if (!generated.ok) return;
    expect(generated.value.pieceDefinitionCatalog.definitions.every(({ source }) =>
      source.records.every(({ reviewStatus }) => reviewStatus === 'REVIEWED'))).toBe(true);
  });

  it('emits the canonical capability IDs consumed by the Rule Engine', () => {
    const generated = generateRandomOob(options);
    expect(generated.ok).toBe(true);
    if (!generated.ok) return;
    const definitionsById = new Map(generated.value.pieceDefinitionCatalog.definitions
      .map((definition) => [definition.id, definition]));
    const expectedCapabilities = new Map([
      ['FORMATION_COMMAND', 'HQ'],
      ['ARTILLERY', 'ARTILLERY'],
      ['RECONNAISSANCE', 'RECONNAISSANCE'],
      ['ENGINEER', 'ENGINEER_CAPABLE'],
      ['TRANSPORT', 'TRANSPORT_CAPACITY'],
    ]);
    const generatedUnits = generated.value.sides.flatMap((side) => [
      ...side.independentUnits,
      ...side.formations.flatMap((formation) => formation.units),
    ]);
    for (const [role, capabilityId] of expectedCapabilities) {
      const matchingUnits = generatedUnits.filter((unit) => unit.role === role);
      expect(matchingUnits.length, `${role} units must be present`).toBeGreaterThan(0);
      expect(matchingUnits.every((unit) => definitionsById.get(unit.definitionId)
        ?.capabilities.some(({ id }) => id === capabilityId)),
      `${role} must declare ${capabilityId}`).toBe(true);
    }
  });

  it('changes the generated identity/formation plan when the seed changes', () => {
    const first = generateRandomOob({ ...options, seed: 7 });
    const second = generateRandomOob({ ...options, seed: 8 });
    expect(first.ok && second.ok).toBe(true);
    if (!first.ok || !second.ok) return;
    expect(serializeGeneratedOob(first.value)).not.toEqual(serializeGeneratedOob(second.value));
  });

  it('rejects invalid options without partial output', () => {
    const generated = generateRandomOob({ seed: -1, scale: 'STANDARD', formationsPerSide: 0 });
    expect(generated.ok).toBe(false);
    if (!generated.ok) expect(generated.error.map(({ path }) => path[0])).toEqual(['seed', 'formationsPerSide']);
  });
});
