import { describe, expect, it } from 'vitest';
import { FORMATION_NAME_PROFILES } from '../../src/generation/oob/name-catalog.js';
import { ALLIED_AIRBORNE_DIVISION_GPIDS, corpusCounter, corpusFaces } from '../../src/generation/oob/counter-corpus.js';
import { formationNameCapacity, hqName, shortFormationName } from '../../src/generation/oob/names.js';
import {
  BTR_BUILD_FILE_SHA256,
  generateRandomOob,
  isSingleUnitDivision,
  OOB_DIVISION_LIMITS,
  REVIEWED_OOB_ARCHETYPES,
  serializeGeneratedOob,
  validateGeneratedOob,
  validatePieceDefinitionCatalog,
} from '../../src/index.js';
import type { DefinitionId } from '../../src/core/index.js';

const options = { seed: 1944, scale: 'STANDARD' as const, divisionsPerSide: 3, armoredDivisionsPerSide: 1 };

describe('M7 deterministic random OOB pipeline', () => {
  it.each(['COMPACT', 'STANDARD', 'LARGE'] as const)('gives %s packages distinct WWII identities', (scale) => {
    for (const seed of [0, 7, 1944, 0xffffffff]) {
      const result = generateRandomOob({ seed, scale, divisionsPerSide: 6, armoredDivisionsPerSide: 3 });
      expect(result.ok).toBe(true);
      if (!result.ok) return;
      for (const side of result.value.sides) {
        expect(new Set(side.formations.map((formation) => formation.name)).size).toBe(6);
        expect(side.formations.every((formation) => FORMATION_NAME_PROFILES.some((profile) =>
          shortFormationName(profile.name) === formation.name && profile.side === side.side && profile.archetype === formation.archetype))).toBe(true);
      }
      const definitions = result.value.pieceDefinitionCatalog.definitions;
      // A supply dump is a generic counter with no name (user decision 2026-10-02); every other counter keeps a distinct one.
      const supply = definitions.filter((definition) => definition.family === 'RESOURCE');
      expect(supply.length).toBeGreaterThan(0);
      expect(supply.every((definition) => definition.name === 'Supply Dump')).toBe(true);
      // A truck is a generic counter as well (user decision 2026-10-03: the original has no truck names, and no printed number).
      const trucks = definitions.filter((definition) => definition.counter?.kind === 'TRANSPORT');
      expect(trucks.length).toBeGreaterThan(0);
      expect(trucks.every((definition) => definition.name === 'Truck' && definition.counter?.designation === '')).toBe(true);
      // Counters print the unit's own number and division, never the generator's ids (user report 2026-10-04: a supply
      // dump printed "4", a regiment "3" and "F1").
      expect(supply.every((definition) => definition.counter?.designation === '' && definition.counter?.affiliation === '')).toBe(true);
      for (const definition of definitions) {
        const counter = definition.counter;
        if (!counter) continue;
        expect(counter.affiliation).not.toMatch(/^F\d+$/u);
        if (counter.designation !== '' && counter.designation !== 'Brkdwn') expect(definition.name).toContain(counter.designation);
        if (counter.affiliation !== '') expect(definition.name.endsWith(` / ${counter.affiliation}`)).toBe(true);
      }
      const names = definitions.filter((definition) => definition.family !== 'RESOURCE' && definition.counter?.kind !== 'TRANSPORT').map((definition) => definition.name);
      expect(new Set(names).size).toBe(names.length);
      expect(names.every((name) => !/Independent|combat \d|undefined/.test(name))).toBe(true);
      // Engineer counters print a brigade (X) echelon, so their names follow it.
      expect(names.some((name) => name.includes('Pi Bde'))).toBe(true);
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
        expect(side.formations).toHaveLength(options.divisionsPerSide);
        expect(side.independentUnits.map(({ role }) => role)).toEqual(expect.arrayContaining([
          'HQ', 'ARTILLERY', 'ENGINEER', 'TRANSPORT', 'SUPPLY',
        ]));
        for (const formation of side.formations) {
          const roles = formation.units.map(({ role }) => role);
          if (isSingleUnitDivision(side.side, formation.archetype)) {
            expect(roles).toEqual(['COMBAT']);
            continue;
          }
          // HQs are independent of every formation (3.2f).
          expect(roles).not.toContain('HQ');
          expect(roles.filter((role) => role === 'COMBAT').length).toBeGreaterThanOrEqual(2);
          expect(roles.includes('ARTILLERY')).toBe(formation.archetype !== 'AIRBORNE');
        }
      }
    },
  );

  // BTR VASSAL 1.27.0: the 343 PieceSlots carrying the Formation mark are all divisional units; none of the HQ
  // PieceSlots carries it. The Formation marker only records Formation Method fuel (12.5c A).
  it('generates HQs as independent units, never as members of a formation', () => {
    for (const [divisionsPerSide, armoredDivisionsPerSide] of [[1, 0], [3, 1], [4, 2], [7, 3]] as const) {
      const generated = generateRandomOob({ ...options, seed: 31 + divisionsPerSide, divisionsPerSide, armoredDivisionsPerSide });
      expect(generated.ok).toBe(true);
      if (!generated.ok) return;
      const definitions = new Map(generated.value.pieceDefinitionCatalog.definitions.map((definition) => [definition.id, definition]));
      for (const side of generated.value.sides) {
        expect(side.formations.flatMap(({ units }) => units).some(({ role }) => role === 'HQ')).toBe(false);
        const hqs = side.independentUnits.filter(({ role }) => role === 'HQ');
        // One HQ for every three divisions, and at least one even when every division is a single foot counter.
        expect(hqs).toHaveLength(Math.max(1, Math.ceil(divisionsPerSide / 3)));
        const names = hqs.map(({ definitionId }) => definitions.get(definitionId)!.name);
        expect(new Set(names).size).toBe(hqs.length);
        for (const hq of hqs) {
          const definition = definitions.get(hq.definitionId)!;
          expect(hq.formationId).toBeNull();
          expect(definition.ownership.formationDefinitionId).toBeNull();
          expect(definition.name).toMatch(side.side === 'ALLIED' ? /^US HQ /u : /^Ge HQ /u);
          // No formation affiliation or colour band; the counter prints the HQ's own number ("3", "18 Abn", "39 Pz").
          expect(definition.counter).toMatchObject({ kind: 'HQ', affiliation: '', formationColor: null });
          const printed = definition.counter!.designation;
          expect(printed).not.toBe('');
          expect(definition.name).toContain(printed.split(' ')[0]!);
          expect(side.formations.map(({ name }) => name)).not.toContain(printed);
        }
      }
    }
  });

  // Transcribed from each HQ PieceSlot's front ("range-0", Combat Mode) and back ("range-MA", Move Mode) images.
  it('builds each HQ from its own BTR counter, with that counter\'s printed range-MA faces and echelon', () => {
    const faces = (gpid: number) => Object.fromEntries(corpusFaces(gpid).map(({ id, steps }) =>
      [String(id), `${steps[0]!.range}-${steps[0]!.movementPointTicks! / 4}`]));
    const expected: Record<number, readonly [string, string, string]> = {
      319: ['14-0', '9-16', 'XXX'], 1724: ['14-0', '9-16', 'XXX'], 338: ['14-0', '9-16', 'XXX'], 328: ['8-0', '6-16', 'XXX'],
      1103: ['10-0', '7-14', 'XXX'], 1105: ['10-0', '7-14', 'XXX'], 1106: ['8-0', '5-10', 'XXX'], 1123: ['8-0', '5-10', 'XXX'],
      1124: ['8-0', '5-10', 'Grp'],
    };
    for (const [gpid, [combat, move, echelon]] of Object.entries(expected)) {
      expect(faces(Number(gpid)), `GPID ${gpid}`).toEqual({ combat, move });
      expect(corpusCounter(Number(gpid), '', '', 'US', null).echelon, `GPID ${gpid}`).toBe(echelon);
    }
    // Every HQ either side can draw has its own transcribed counter, and every generated HQ is built from it.
    const pool = (side: 'ALLIED' | 'AXIS') => new Map(Array.from({ length: 22 }, (_, index) => hqName(1944, side, index + 1)).map((hq) => [hq.gpid, hq]));
    expect(pool('ALLIED').size).toBe(14);
    expect(pool('AXIS').size).toBe(22);
    for (const hq of [...pool('ALLIED').values(), ...pool('AXIS').values()]) expect(faces(hq.gpid).combat).toMatch(/^\d+-0$/u);
    for (const seed of [3, 1944, 77_001]) {
      const generated = generateRandomOob({ ...options, seed, divisionsPerSide: 12, armoredDivisionsPerSide: 4 });
      expect(generated.ok).toBe(true);
      if (!generated.ok) return;
      const definitions = new Map(generated.value.pieceDefinitionCatalog.definitions.map((definition) => [definition.id, definition]));
      for (const side of generated.value.sides) {
        for (const unit of side.independentUnits.filter(({ role }) => role === 'HQ')) {
          const definition = definitions.get(unit.definitionId)!;
          const hq = [...pool(side.side).values()].find(({ name }) => definition.name.endsWith(name))!;
          expect(definition.faces).toEqual(corpusFaces(hq.gpid));
          expect(definition.counter!.echelon).toBe(corpusCounter(hq.gpid, '', '', 'US', null).echelon);
          expect(definition.source.records[0]!.source.locator).toBe(`VASSAL.build.widget.PieceSlot[gpid=${hq.gpid}]`);
          expect(definition.source.records[0]!.rawValue).toBe(definition.name);
        }
      }
    }
  });

  it('builds infantry and airborne divisions as single XX units, with airborne leg-mobile and never filed as mobile infantry', () => {
    const seen = new Set<string>();
    for (let seed = 1; seed <= 40; seed += 1) {
      const generated = generateRandomOob({ ...options, seed, divisionsPerSide: 4, armoredDivisionsPerSide: 2 });
      expect(generated.ok).toBe(true);
      if (!generated.ok) return;
      const definitions = new Map(generated.value.pieceDefinitionCatalog.definitions.map((definition) => [definition.id, definition]));
      const mobility = (unitDefinitionId: DefinitionId, faceName: string) => String(definitions.get(unitDefinitionId)!.faces
        .find(({ id }) => String(id) === faceName)!.mobilityClassDefinitionId);
      for (const side of generated.value.sides) {
        for (const formation of side.formations) {
          seen.add(`${side.side}/${formation.archetype}`);
          if (!isSingleUnitDivision(side.side, formation.archetype)) continue;
          expect(formation.units).toHaveLength(1);
          const unit = formation.units[0]!;
          const definition = definitions.get(unit.definitionId)!;
          expect(definition.counter?.echelon).toBe('XX');
          expect(definition.faces[0]!.steps.length).toBeGreaterThanOrEqual(3);
          // One counter is not a multi-unit formation (3.1c): no Formation ID, colour band or affiliation.
          expect(unit.formationId).toBeNull();
          expect(definition.ownership.formationDefinitionId).toBeNull();
          expect(definition.counter?.formationColor).toBeNull();
          expect(definition.counter?.affiliation).toBe('');
          // Airborne divisions print the NATO airborne symbol; every other single-counter division is plain infantry.
          expect(definition.counter?.symbol).toBe(formation.archetype === 'AIRBORNE' ? 'AIRBORNE' : 'INFANTRY');
          if (formation.archetype === 'AIRBORNE') {
            expect([mobility(unit.definitionId, 'combat'), mobility(unit.definitionId, 'move')]).toEqual(['mobility:leg', 'mobility:leg']);
          } else {
            // US infantry divisions are motorized (truck move face); German ones march on foot.
            expect(mobility(unit.definitionId, 'move')).toBe(side.side === 'ALLIED' ? 'mobility:truck' : 'mobility:leg');
          }
        }
      }
    }
    expect([...seen].sort()).toEqual(expect.arrayContaining([
      'ALLIED/AIRBORNE', 'ALLIED/INFANTRY', 'AXIS/AIRBORNE', 'AXIS/INFANTRY', 'AXIS/MOBILE_INFANTRY']));
    // The Allies have no mobile-infantry package, and airborne is never filed under it.
    expect([...seen]).not.toContain('ALLIED/MOBILE_INFANTRY');
  });

  it('sums the printed regiments for each US airborne division (sheets 2F/2B), one step per regiment', () => {
    const expected: Record<string, { combat: number; move: number; steps: number }> = {
      '82.Abn': { combat: 14, move: 8, steps: 3 }, '101.Abn': { combat: 18, move: 10, steps: 4 },
      '17.Abn': { combat: 13, move: 7, steps: 3 }, '13.Abn': { combat: 13, move: 7, steps: 3 },
    };
    for (const [name, { combat, move, steps }] of Object.entries(expected)) {
      const faces = corpusFaces(ALLIED_AIRBORNE_DIVISION_GPIDS[name]!);
      const face = (id: string) => faces.find((candidate) => String(candidate.id) === id)!;
      expect(face('move').steps).toHaveLength(steps);
      expect(face('combat').steps[0]!.combatStrength).toBe(combat);
      expect(face('move').steps[0]!.combatStrength).toBe(move);
      expect(face('combat').steps[0]!.actionRating).toBe(4);
    }
  });

  it('uses reviewed BTR locators while keeping ratings explicitly synthetic', () => {
    expect(BTR_BUILD_FILE_SHA256).toMatch(/^[A-F0-9]{64}$/u);
    // 19 of M7, plus OOB 0.4.0's independent armor and anti-tank (heavy German balancing variants) and both garrisons.
    expect(REVIEWED_OOB_ARCHETYPES).toHaveLength(27);
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
      ['HQ', 'HQ'],
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
    const generated = generateRandomOob({ seed: -1, scale: 'STANDARD', divisionsPerSide: 0, armoredDivisionsPerSide: 1 });
    expect(generated.ok).toBe(false);
    if (!generated.ok) expect(generated.error.map(({ path }) => path[0])).toEqual(['seed', 'divisionsPerSide', 'armoredDivisionsPerSide']);
    const tooManyArmored = generateRandomOob({ seed: 1, scale: 'COMPACT', divisionsPerSide: 2, armoredDivisionsPerSide: 3 });
    expect(tooManyArmored.ok).toBe(false);
    if (!tooManyArmored.ok) expect(tooManyArmored.error.map(({ path }) => path[0])).toEqual(['armoredDivisionsPerSide']);
  });

  it('fields exactly the requested armored divisions first, then foot divisions that are mostly infantry', () => {
    let foot = 0;
    let infantry = 0;
    for (let seed = 1; seed <= 60; seed += 1) {
      const generated = generateRandomOob({ seed, scale: 'COMPACT', divisionsPerSide: 6, armoredDivisionsPerSide: 2 });
      expect(generated.ok).toBe(true);
      if (!generated.ok) return;
      for (const side of generated.value.sides) {
        const archetypes = side.formations.map(({ archetype }) => archetype);
        // Allied armored slots are armored divisions; the Axis alternate Panzer and Panzergrenadier.
        expect(archetypes.slice(0, 2)).toEqual(side.side === 'ALLIED' ? ['ARMORED', 'ARMORED'] : ['ARMORED', 'MOBILE_INFANTRY']);
        expect(archetypes.slice(2).every((archetype) => archetype === 'INFANTRY' || archetype === 'AIRBORNE')).toBe(true);
        foot += archetypes.length - 2;
        infantry += archetypes.filter((archetype) => archetype === 'INFANTRY').length;
      }
    }
    // Foot slots cycle three infantry to one airborne.
    expect(infantry / foot).toBeGreaterThanOrEqual(0.7);
    const allFoot = generateRandomOob({ seed: 9, scale: 'COMPACT', divisionsPerSide: 4, armoredDivisionsPerSide: 0 });
    expect(allFoot.ok && allFoot.value.sides.every(({ formations }) => formations.every(({ archetype }) => archetype !== 'ARMORED'
      && archetype !== 'MOBILE_INFANTRY'))).toBe(true);
  });

  it('fields up to 20 distinctly named divisions a side, keeping airborne within its name pool', () => {
    const { maxDivisions } = OOB_DIVISION_LIMITS;
    expect(maxDivisions).toBe(20);
    for (let seed = 1; seed <= 40; seed += 1) {
      for (const armored of [0, 6]) {
        const generated = generateRandomOob({ seed, scale: 'COMPACT', divisionsPerSide: maxDivisions, armoredDivisionsPerSide: armored });
        expect(generated.ok, `seed ${seed}, ${armored} armored`).toBe(true);
        if (!generated.ok) return;
        for (const side of generated.value.sides) {
          expect(side.formations).toHaveLength(maxDivisions);
          expect(new Set(side.formations.map(({ name }) => name)).size).toBe(maxDivisions);
          expect(side.formations.filter(({ archetype }) => archetype === 'AIRBORNE').length).toBeLessThanOrEqual(formationNameCapacity('AIRBORNE'));
        }
      }
    }
    const tooMany = generateRandomOob({ seed: 1, scale: 'COMPACT', divisionsPerSide: maxDivisions + 1, armoredDivisionsPerSide: 2 });
    expect(tooMany.ok).toBe(false);
    if (!tooMany.ok) expect(tooMany.error.map(({ path }) => path[0])).toEqual(['divisionsPerSide']);
  });
});
