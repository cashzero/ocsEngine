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
      const definitions = result.value.pieceDefinitionCatalog.definitions;
      // A supply dump is a generic counter with no name (user decision 2026-10-02); every other counter keeps a distinct one.
      const supply = definitions.filter((definition) => definition.family === 'RESOURCE');
      expect(supply.length).toBeGreaterThan(0);
      expect(supply.every((definition) => definition.name === 'Supply Dump')).toBe(true);
      const names = definitions.filter((definition) => definition.family !== 'RESOURCE').map((definition) => definition.name);
      expect(new Set(names).size).toBe(names.length);
      expect(names.every((name) => !/Independent|combat \d|undefined/.test(name))).toBe(true);
      expect(names.some((name) => name.includes('QM Truck Co'))).toBe(true);
      // Engineer counters print a brigade (X) echelon, so their names follow it.
      expect(names.some((name) => name.includes('Pionier-Brigade'))).toBe(true);
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
      expect(generated.value.metrics.balanceRatio).toBeGreaterThanOrEqual(0.9);
      expect(generated.value.sides).toHaveLength(2);
      for (const side of generated.value.sides) {
        expect(side.formations).toHaveLength(options.formationsPerSide);
        expect(side.independentUnits.map(({ role }) => role)).toEqual(expect.arrayContaining([
          'ARTILLERY', 'ENGINEER', 'TRANSPORT', 'SUPPLY',
        ]));
        for (const formation of side.formations) {
          const roles = formation.units.map(({ role }) => role);
          if (formation.archetype === 'INFANTRY') {
            expect(roles).toEqual(['COMBAT']);
            continue;
          }
          expect(roles.filter((role) => role === 'FORMATION_COMMAND')).toHaveLength(1);
          expect(roles.filter((role) => role === 'COMBAT').length).toBeGreaterThanOrEqual(2);
          expect(roles.includes('ARTILLERY')).toBe(formation.archetype !== 'AIRBORNE');
        }
      }
    },
  );

  it('keeps airborne divisions free of armored recon and tracked artillery, and infantry divisions single-unit', () => {
    const airborneSides = new Set<string>();
    let airborne = 0;
    let infantry = 0;
    for (let seed = 1; seed <= 40; seed += 1) {
      const generated = generateRandomOob({ ...options, seed, formationsPerSide: 3 });
      expect(generated.ok).toBe(true);
      if (!generated.ok) return;
      const definitions = new Map(generated.value.pieceDefinitionCatalog.definitions.map((definition) => [definition.id, definition]));
      for (const side of generated.value.sides) {
        for (const formation of side.formations) {
          if (formation.archetype === 'AIRBORNE') {
            airborne += 1;
            airborneSides.add(side.side);
            for (const unit of formation.units) {
              expect(['FORMATION_COMMAND', 'COMBAT']).toContain(unit.role);
              const faces = definitions.get(unit.definitionId)!.faces;
              // Allied airborne units move on foot on both faces. TODO(axis-airborne-counter): the Axis
              // regiment still borrows a truck-mobile counter until the German sheet is transcribed.
              expect(side.side === 'AXIS' || faces.every(({ mobilityClassDefinitionId }) => String(mobilityClassDefinitionId) === 'mobility:leg'
                || unit.role === 'FORMATION_COMMAND'))).toBe(true);
            }
          }
          if (formation.archetype === 'INFANTRY') {
            infantry += 1;
            expect(formation.units).toHaveLength(1);
            expect(definitions.get(formation.units[0]!.definitionId)!.counter?.echelon).toBe('XX');
            // US infantry divisions are motorized (truck Movement Allowance); German ones march on foot.
            const moveFace = definitions.get(formation.units[0]!.definitionId)!.faces.find(({ id }) => String(id) === 'move')!;
            expect(String(moveFace.mobilityClassDefinitionId)).toBe(side.side === 'ALLIED' ? 'mobility:truck' : 'mobility:leg');
          }
        }
      }
    }
    expect([...airborneSides].sort()).toEqual(['ALLIED', 'AXIS']);
    expect(airborne).toBeGreaterThan(0);
    expect(infantry).toBeGreaterThan(0);
  });

  it('uses reviewed BTR locators while keeping ratings explicitly synthetic', () => {
    expect(BTR_BUILD_FILE_SHA256).toMatch(/^[A-F0-9]{64}$/u);
    expect(REVIEWED_OOB_ARCHETYPES).toHaveLength(19);
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
