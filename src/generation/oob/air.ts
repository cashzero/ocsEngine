import { parseDefinitionId, type DefinitionId } from '../../core/index.js';
import { parseCapabilityId, parseFaceId, type PieceDefinition } from '../../domain/piece/index.js';
import { createSeededRandom, mixUint32 } from '../map/rng.js';
import { AIR_BASE_COUNTER, AIR_COUNTER_CORPUS, type AirCounterSource } from './air-corpus.js';
import { BTR_BUILD_FILE_SHA256 } from './catalog.js';
import type { GeneratedOobUnit, NormalizedRandomOobOptions, OobScale, OobSide } from './model.js';

const must = <T>(result: { ok: true; value: T } | { ok: false; error: unknown }): T => {
  if (!result.ok) throw new Error('Generated air Definition scalar is invalid.');
  return result.value;
};
const definitionId = (value: string): DefinitionId => must(parseDefinitionId(value));

/** Aircraft per side by scale: Fighters and Tactical Bombers. */
const AIR_MIX: Readonly<Record<OobScale, { readonly fighters: number; readonly bombers: number; readonly bases: readonly number[] }>> = {
  // Each Air Base holds 4 + Level Active aircraft (14.2a); every generated aircraft starts Active (IV-E).
  COMPACT: { fighters: 2, bombers: 1, bases: [2] },
  STANDARD: { fighters: 3, bombers: 2, bases: [2, 2] },
  LARGE: { fighters: 4, bombers: 2, bases: [3, 3] },
};

export const AIRCRAFT_POINT_COST = 6;
export const AIR_BASE_POINT_COST = 3;

/** Historical group names used as generated designations (flavour only). */
const GROUP_NAMES: Readonly<Record<OobSide, Readonly<Record<'F' | 'T' | 'TPT', readonly string[]>>>> = {
  ALLIED: {
    TPT: ['61st TCG', '313th TCG', '314th TCG', '315th TCG', '316th TCG', '317th TCG'],
    F: ['36th FG', '48th FG', '50th FG', '354th FG', '358th FG', '362nd FG', '365th FG', '366th FG', '367th FG', '368th FG', '370th FG', '371st FG'],
    T: ['322nd BG', '323rd BG', '344th BG', '386th BG', '387th BG', '391st BG', '394th BG', '397th BG', '409th BG', '410th BG', '416th BG'],
  },
  AXIS: {
    TPT: ['TG 1', 'TG 2', 'TG 3', 'TG 4', 'TG 30', 'KGzbV 1'],
    F: ['JG 1', 'JG 2', 'JG 3', 'JG 4', 'JG 11', 'JG 26', 'JG 27', 'JG 53', 'JG 300', 'JG 301'],
    T: ['KG 6', 'KG 51', 'KG 66', 'KG 76'],
  },
};

const aircraftDefinition = (id: DefinitionId, name: string, side: OobSide, source: AirCounterSource): PieceDefinition => {
  const step = (remainingSteps: number, [rating, barrage]: readonly [number, number]) => ({
    remainingSteps, combatStrength: null, actionRating: null, movementPointTicks: null, regimentalEquivalentTicks: null,
    range: source.range,
    ratings: [
      { ratingDefinitionId: definitionId('rating:air-combat'), value: rating },
      { ratingDefinitionId: definitionId('rating:barrage-strength'), value: barrage },
      // 14.9a: a Transport's capacity on this side, in half-Tokens.
      ...(source.capacity ? [{ ratingDefinitionId: definitionId('rating:transport-capacity'), value: source.capacity[remainingSteps === 2 ? 0 : 1] }] : []),
    ],
  });
  return {
    counter: null,
    id,
    family: 'AIR',
    name,
    categoryDefinitionId: definitionId('category:oob:aircraft'),
    ownership: {
      sideDefinitionId: definitionId(`side:${side.toLowerCase()}`),
      factionDefinitionId: null,
      nationalityDefinitionId: definitionId(`nationality:${side.toLowerCase()}`),
      formationDefinitionId: null,
      groupDefinitionId: null,
    },
    // 14.1b: two steps; the back of the counter is the reduced side.
    faces: [{ id: must(parseFaceId('air')), name: 'Aircraft', mobilityClassDefinitionId: null, steps: [step(1, source.reduced), step(2, source.full)] }],
    capabilities: [{
      id: must(parseCapabilityId('AIRCRAFT')),
      parameters: [
        { key: 'type', kind: 'TEXT', value: source.type },
        { key: 'parenthesized', kind: 'FLAG', value: source.parenthesized },
        { key: 'designation', kind: 'TEXT', value: source.designation },
        ...(source.integralGlider ? [{ key: 'integralGlider', kind: 'FLAG' as const, value: true }] : []),
      ],
    }],
    resource: null, facility: null, marker: null, deferredClassification: null,
    source: { records: [{
      field: 'aircraft-faces',
      rawValue: `${source.entryName} (gpid ${source.gpid}); ${source.front} / ${source.back}`,
      normalizedValue: `${source.type} ${source.parenthesized ? `(${source.full[0]})` : source.full[0]}-${source.full[1]}, reduced ${source.parenthesized ? `(${source.reduced[0]})` : source.reduced[0]}-${source.reduced[1]}, range ${source.range}`,
      source: { document: 'Beyond the Rhine VASSAL buildFile.xml v1.27.0', locator: `VASSAL.build.widget.PieceSlot[gpid=${source.gpid}]`, note: `SHA-256 ${BTR_BUILD_FILE_SHA256}; images ${source.frontSha256} / ${source.backSha256}` },
      confidence: 'HIGH', reviewStatus: 'REVIEWED',
    }] },
  };
};

const airBaseDefinition = (id: DefinitionId, name: string, side: OobSide, level: number, template: 'air-base' | 'air-strip' | null = null): PieceDefinition => ({
  counter: null,
  id,
  family: 'FACILITY',
  name,
  categoryDefinitionId: definitionId('category:oob:air-base'),
  ownership: {
    sideDefinitionId: definitionId(`side:${side.toLowerCase()}`),
    factionDefinitionId: null,
    nationalityDefinitionId: definitionId(`nationality:${side.toLowerCase()}`),
    formationDefinitionId: null,
    groupDefinitionId: null,
  },
  faces: [],
  capabilities: [
    { id: must(parseCapabilityId('AIR_BASE')), parameters: [{ key: 'initialLevel', kind: 'INTEGER', value: level }] },
    // Not a counter on the map: the Definition engineers make new Air Bases and Air Strips from (15.2, 15.3).
    ...(template ? [{ id: must(parseCapabilityId('AIR_FACILITY_TEMPLATE')), parameters: [] }] : []),
  ],
  resource: null,
  facility: { facilityTypeDefinitionId: definitionId(template === 'air-strip' ? 'facility:air-strip' : 'facility:air-base') },
  marker: null,
  deferredClassification: null,
  source: { records: [{
    field: 'air-base', rawValue: `${AIR_BASE_COUNTER.entryName} (gpid ${AIR_BASE_COUNTER.gpid})`, normalizedValue: template === 'air-strip' ? 'Air Strip' : `Air Base Level ${level}`,
    source: { document: 'Beyond the Rhine VASSAL buildFile.xml v1.27.0', locator: `VASSAL.build.widget.PieceSlot[gpid=${AIR_BASE_COUNTER.gpid}]` },
    confidence: 'HIGH', reviewStatus: 'REVIEWED',
  }] },
});

/** Initial Level of a generated Air Base Definition (15.0). */
export const initialAirBaseLevel = (definition: PieceDefinition): number | null => {
  const parameter = definition.capabilities.find(({ id }) => id === 'AIR_BASE')?.parameters.find(({ key }) => key === 'initialLevel');
  return parameter?.kind === 'INTEGER' ? parameter.value : null;
};

/**
 * Aircraft and Air Bases for one side. Uses its own random stream so enabling air never changes the
 * ground forces generated from the same OOB seed.
 */
/** Transport aircraft per side by scale (14.9); a side's own mix is drawn from its counters. */
const TRANSPORTS: Readonly<Record<OobScale, number>> = { COMPACT: 2, STANDARD: 3, LARGE: 4 };
/** Eq a side receives each Reinforcement Phase (13.5f). This generator's table stands in for a game's Variable Replacement Table. */
export const EQUIPMENT_PER_TURN: Readonly<Record<OobScale, number>> = { COMPACT: 1, STANDARD: 1, LARGE: 2 };
/** Reinforcing aircraft by scale (13.6): type and the Game Turn they arrive Active at a friendly Air Base. */
const AIR_REINFORCEMENTS: Readonly<Record<OobScale, readonly { readonly type: 'F' | 'T'; readonly turn: number }[]>> = {
  COMPACT: [{ type: 'F', turn: 3 }],
  STANDARD: [{ type: 'F', turn: 3 }, { type: 'T', turn: 5 }],
  LARGE: [{ type: 'F', turn: 3 }, { type: 'T', turn: 4 }, { type: 'F', turn: 5 }],
};

const replacementDefinition = (id: DefinitionId, name: string, side: OobSide, perTurn: number): PieceDefinition => ({
  counter: null,
  id,
  family: 'REPLACEMENT',
  name,
  categoryDefinitionId: definitionId('category:oob:replacement'),
  ownership: {
    sideDefinitionId: definitionId(`side:${side.toLowerCase()}`),
    factionDefinitionId: null,
    nationalityDefinitionId: definitionId(`nationality:${side.toLowerCase()}`),
    formationDefinitionId: null,
    groupDefinitionId: null,
  },
  faces: [],
  capabilities: [{ id: must(parseCapabilityId('REPLACEMENT')), parameters: [{ key: 'kind', kind: 'TEXT', value: 'EQ' }, { key: 'perTurn', kind: 'INTEGER', value: perTurn }] }],
  resource: null, facility: null, marker: null, deferredClassification: null,
  source: { records: [{
    field: 'replacement-allotment', rawValue: 'generator-defined', normalizedValue: `${perTurn} Eq each Reinforcement Phase`,
    source: { document: 'docs/reports/M11-air-power.md', locator: 'Replacement allotment' },
    confidence: 'MEDIUM', reviewStatus: 'REVIEWED',
  }] },
});

export const buildAirForces = (
  side: OobSide,
  options: NormalizedRandomOobOptions,
  definitions: PieceDefinition[],
): readonly GeneratedOobUnit[] => {
  const rng = createSeededRandom(mixUint32(options.seed ^ (side === 'ALLIED' ? 0x41a1_2001 : 0x41a1_2002)));
  const mix = AIR_MIX[options.scale];
  const pool = AIR_COUNTER_CORPUS.filter((source) => source.side === side);
  const units: GeneratedOobUnit[] = [];
  const pick = (type: 'F' | 'T', count: number) => {
    const candidates = pool.filter((source) => source.type === type);
    const names = rng.shuffle(GROUP_NAMES[side][type]);
    for (let index = 0; index < count; index += 1) {
      const source = candidates[Math.floor(rng.next() * candidates.length)]!;
      const localId = `air-${type === 'F' ? 'fighter' : 'bomber'}-${index + 1}`;
      const idBase = `generated-oob:${options.seed}:${side.toLowerCase()}:${localId}`;
      const id = definitionId(idBase);
      definitions.push(aircraftDefinition(id, `${names[index % names.length]} ${source.designation}`, side, source));
      units.push({ id: `${idBase}:unit`, definitionId: id, side, formationId: null, role: 'AIRCRAFT', sourceArchetypeId: `air:${source.gpid}`, pointCost: AIRCRAFT_POINT_COST });
    }
  };
  pick('F', mix.fighters);
  pick('T', mix.bombers);
  // 14.9: transport aircraft for Air Transport and Air Drop; the Allied side alternates plain C-47s and the integral-glider C-47.
  if (options.airTransport === 'STANDARD') {
    const candidates = pool.filter((source) => source.type === 'TPT');
    const names = rng.shuffle(GROUP_NAMES[side].TPT);
    for (let index = 0; index < TRANSPORTS[options.scale]; index += 1) {
      const source = candidates[index % candidates.length]!;
      const idBase = `generated-oob:${options.seed}:${side.toLowerCase()}:air-transport-${index + 1}`;
      const id = definitionId(idBase);
      definitions.push(aircraftDefinition(id, `${names[index % names.length]} ${source.designation}`, side, source));
      units.push({ id: `${idBase}:unit`, definitionId: id, side, formationId: null, role: 'AIRCRAFT', sourceArchetypeId: `air:${source.gpid}`, pointCost: AIRCRAFT_POINT_COST });
    }
  }
  // 13.6: reinforcing aircraft wait off the map and arrive Active at a friendly Air Base on their Game Turn.
  if (options.airSupport === 'STANDARD') {
    AIR_REINFORCEMENTS[options.scale].forEach(({ type, turn }, index) => {
      const candidates = pool.filter((source) => source.type === type);
      const source = candidates[Math.floor(rng.next() * candidates.length)]!;
      const idBase = `generated-oob:${options.seed}:${side.toLowerCase()}:air-reinforcement-${index + 1}`;
      const id = definitionId(idBase);
      definitions.push(aircraftDefinition(id, `${GROUP_NAMES[side][type][(index + 5) % GROUP_NAMES[side][type].length]} ${source.designation}`, side, source));
      units.push({ id: `${idBase}:unit`, definitionId: id, side, formationId: null, role: 'AIRCRAFT', sourceArchetypeId: `air:${source.gpid}`, pointCost: AIRCRAFT_POINT_COST, arrivalTurn: turn });
    });
    // 13.5: the Eq counter this side receives each turn is a Definition only; its counters are created in play.
    definitions.push(replacementDefinition(definitionId(`generated-oob:${options.seed}:${side.toLowerCase()}:equipment`), `${side === 'ALLIED' ? 'Allied' : 'Axis'} Equipment replacements`, side, EQUIPMENT_PER_TURN[options.scale]));
  }
  mix.bases.forEach((level, index) => {
    const idBase = `generated-oob:${options.seed}:${side.toLowerCase()}:air-base-${index + 1}`;
    const id = definitionId(idBase);
    definitions.push(airBaseDefinition(id, `${side === 'ALLIED' ? 'Allied' : 'Axis'} Air Base ${index + 1}`, side, level));
    units.push({ id: `${idBase}:unit`, definitionId: id, side, formationId: null, role: 'AIR_BASE', sourceArchetypeId: `air-base:${AIR_BASE_COUNTER.gpid}`, pointCost: AIR_BASE_POINT_COST });
  });
  // 15.2, 15.3: the games this generator makes allow Air Strips; engineers build from these Definitions (they are never placed).
  const sideName = side === 'ALLIED' ? 'Allied' : 'Axis';
  const templateBase = `generated-oob:${options.seed}:${side.toLowerCase()}`;
  definitions.push(airBaseDefinition(definitionId(`${templateBase}:air-base-template`), `${sideName} Air Base (built)`, side, 1, 'air-base'));
  definitions.push(airBaseDefinition(definitionId(`${templateBase}:air-strip-template`), `${sideName} Air Strip`, side, 0, 'air-strip'));
  return units;
};
