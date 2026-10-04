import {
  FOUNDATION_SCHEMA_VERSION,
  err,
  movementPoints,
  ok,
  parseDefinitionId,
  regimentalEquivalents,
  type DefinitionId,
  type Result,
} from '../../core/index.js';
import {
  parseCapabilityId,
  parseFaceId,
  type CapabilityDeclaration,
  type PieceDefinition,
  type PieceDefinitionCatalog,
  type PieceStepProfile,
} from '../../domain/piece/index.js';
import { canonicalJson } from '../../serialization/index.js';
import { ALLIED_AIRBORNE_DIVISION_GPIDS, ALLIED_PARA_GPID, AXIS_PARA_GPID, COUNTER_CORPUS, TRUCK_COUNTER_POINTS, corpusCounter, corpusFaces } from './counter-corpus.js';
import { createSeededRandom, mixUint32 } from '../map/rng.js';
import {
  BTR_BUILD_FILE_SHA256,
  findReviewedOobArchetype,
  type ReviewedOobArchetype,
} from './catalog.js';
import {
  OOB_GENERATOR_VERSION,
  OOB_SCALES,
  AIR_FORCE_LEVELS,
  OOB_DIVISION_LIMITS,
  type GeneratedOob,
  type GeneratedOobFormation,
  type GeneratedOobSide,
  type GeneratedOobUnit,
  type NormalizedRandomOobOptions,
  isSingleUnitDivision,
  type OobFormationArchetype,
  type OobGenerationError,
  type OobScale,
  type OobSide,
  type OobUnitRole,
  type RandomOobOptions,
} from './model.js';
import { validateGeneratedOob } from './validation.js';
import { counterIdentification, formationNameCapacity, hqName, formationNames, unitName } from './names.js';
import { buildAirForces } from './air.js';
import { withBreakdowns } from './breakdowns.js';

const SIDES: readonly OobSide[] = ['ALLIED', 'AXIS'];
// Plan slots shared by both sides. Armored slots alternate Panzer and Panzergrenadier/Führer packages, which only
// the Axis have; the Allied mobile slot is filled with an armored division, the Allies' mobile force. Foot slots
// are drawn from this seeded cycle, so about one foot division in four is airborne (a single XX on both sides).
const ARMORED_ARCHETYPES: readonly OobFormationArchetype[] = ['ARMORED', 'MOBILE_INFANTRY'];
const FOOT_ARCHETYPES: readonly OobFormationArchetype[] = ['INFANTRY', 'INFANTRY', 'INFANTRY', 'AIRBORNE'];
const sideArchetype = (side: OobSide, planned: OobFormationArchetype): OobFormationArchetype =>
  side === 'ALLIED' && planned === 'MOBILE_INFANTRY' ? 'ARMORED' : planned;

const must = <T, E>(result: Result<T, E>): T => {
  if (!result.ok) throw new Error('Random OOB generator produced an invalid Foundation scalar.');
  return result.value;
};

const definitionId = (value: string): DefinitionId => must(parseDefinitionId(value));
const faceId = must(parseFaceId('front'));
const capabilityId = (value: string) => must(parseCapabilityId(value));

const SCALE_COMBAT_UNITS: Readonly<Record<OobScale, number>> = {
  COMPACT: 2, STANDARD: 3, LARGE: 4,
};

const capabilitiesFor = (role: OobUnitRole): readonly CapabilityDeclaration[] => {
  switch (role) {
    case 'HQ': return [{ id: capabilityId('HQ'), parameters: [] }];
    case 'ARTILLERY': return [{ id: capabilityId('ARTILLERY'), parameters: [] }];
    case 'RECONNAISSANCE': return [{ id: capabilityId('RECONNAISSANCE'), parameters: [] }];
    case 'ENGINEER': return [{ id: capabilityId('ENGINEER_CAPABLE'), parameters: [] }];
    case 'TRANSPORT': return [{
      id: capabilityId('TRANSPORT_CAPACITY'),
      parameters: [{
        // 13.2c: a Transport Point carries its size in SP (four Tokens each).
        key: 'capacity', kind: 'EXACT_QUANTITY', value: TRUCK_COUNTER_POINTS * 4,
        unitDefinitionId: definitionId('quantity:supply-token'),
      }],
    }];
    case 'COMBAT':
    case 'SUPPLY':
    case 'AIRCRAFT':
    case 'AIR_BASE': return [];
  }
};

const stepsFor = (archetype: ReviewedOobArchetype): readonly PieceStepProfile[] => {
  if (archetype.family === 'RESOURCE') return [];
  const profile = (remainingSteps: number, strength: number): PieceStepProfile => ({
    remainingSteps,
    combatStrength: strength,
    actionRating: archetype.actionRating,
    movementPointTicks: archetype.movementPoints === null ? null : must(movementPoints(archetype.movementPoints)),
    regimentalEquivalentTicks: archetype.regimentalEquivalents === null
      ? null : must(regimentalEquivalents(remainingSteps === archetype.steps
        ? archetype.regimentalEquivalents
        : Math.max(0.25, archetype.regimentalEquivalents / 2))),
    range: archetype.range,
    ratings: [],
  });
  return Array.from({ length: archetype.steps }, (_, index) => {
    const remainingSteps = index + 1;
    const strength = archetype.combatStrength === null ? 0
      : remainingSteps === archetype.steps ? archetype.combatStrength : Math.ceil(archetype.combatStrength / 2);
    return profile(remainingSteps, strength);
  });
};

/** Echelon printed on the archetype's BTR counter; it picks the size word in unit names. */
const echelonFor = (side: OobSide, role: OobUnitRole, archetype: OobFormationArchetype | undefined): string =>
  COUNTER_CORPUS[findReviewedOobArchetype(side, role, archetype).gpid]?.echelon ?? '';

/** HQs per side: one for every three divisions it fields, at least one so the side can throw supply (13.1b). */
const hqCount = (divisionsPerSide: number): number => Math.max(1, Math.ceil(divisionsPerSide / 3));

interface UnitBuildContext {
  readonly options: NormalizedRandomOobOptions;
  readonly side: OobSide;
  readonly role: OobUnitRole;
  readonly formationArchetype?: OobFormationArchetype;
  readonly formationId: DefinitionId | null;
  readonly name: string;
  readonly localId: string;
  /** Overrides the archetype's counter: divisions whose printed regiments differ (US airborne), each HQ's own counter. */
  readonly counterGpid?: number;
  /** The VASSAL entryName of `counterGpid`, when it is not the archetype's. */
  readonly rawName?: string;
  /** Overrides the echelon printed on the counter (a paratroop battalion is not a division). */
  readonly echelon?: string;
  /** Overrides the designation printed on the counter (an HQ prints its number, "3" or "39 Pz"). */
  readonly designation?: string;
  readonly pointCost?: number;
}

const buildUnit = (context: UnitBuildContext): {
  readonly unit: GeneratedOobUnit;
  readonly definition: PieceDefinition;
} => {
  const archetypeSource = findReviewedOobArchetype(context.side, context.role, context.formationArchetype);
  const source = context.counterGpid === undefined ? archetypeSource
    : { ...archetypeSource, gpid: context.counterGpid, rawName: context.rawName ?? archetypeSource.rawName };
  const idBase = `generated-oob:${context.options.seed}:${context.side.toLowerCase()}:${context.localId}`;
  const id = definitionId(idBase);
  const sourceReference = {
    document: 'Beyond the Rhine VASSAL buildFile.xml v1.27.0',
    locator: `VASSAL.build.widget.PieceSlot[gpid=${source.gpid}]`,
    note: `SHA-256 ${BTR_BUILD_FILE_SHA256}; reviewed raw entryName: ${source.rawName}`,
  } as const;
  // The counter prints the unit's own number and division, read from its name; internal ids are never printed.
  const printed = counterIdentification(context.name, context.formationId !== null);
  const definition: PieceDefinition = {
    counter: corpusCounter(source.gpid,
      context.designation ?? printed.designation,
      printed.affiliation,
      context.side === 'ALLIED' ? 'US' : 'GERMAN',
      context.formationId ? ['#75c3af', '#e2638b', '#6c9cd2', '#e4c063', '#ae87c7', '#c59064'][Number(context.formationId.split(':').at(-1)) - 1]! : null,
      // The counter's own echelon (Gruppe Hohne's HQ prints "Grp", not XXX).
      context.echelon ?? COUNTER_CORPUS[source.gpid]?.echelon ?? ''),
    id,
    family: source.family,
    name: context.name,
    categoryDefinitionId: definitionId(`category:oob:${context.role.toLowerCase()}`),
    ownership: {
      sideDefinitionId: definitionId(`side:${context.side.toLowerCase()}`),
      factionDefinitionId: null,
      nationalityDefinitionId: definitionId(`nationality:${context.side.toLowerCase()}`),
      formationDefinitionId: context.formationId,
      groupDefinitionId: null,
    },
    faces: corpusFaces(source.gpid),
    capabilities: capabilitiesFor(context.role),
    resource: source.family === 'RESOURCE' ? {
      resourceDefinitionId: definitionId('resource:supply'),
      unitDefinitionId: definitionId('quantity:supply-token'),
      printedQuantity: 4,
      // 12.1c: generic dumps hold any number of SP.
      capacity: 400,
    } : null,
    facility: null,
    marker: null,
    deferredClassification: null,
    source: { records: [
      {
        field: 'name-and-role', rawValue: source.rawName,
        normalizedValue: `${context.name} / ${context.role}`,
        source: sourceReference, confidence: 'HIGH', reviewStatus: 'REVIEWED',
      },
      {
        field: 'counter-faces',
        rawValue: `BTR gpid=${source.gpid}; image transcription`,
        normalizedValue: 'Printed faces from counter-corpus; generated designation and affiliation',
        source: { document: 'docs/oob/counter-corpus.md', locator: String(source.gpid) },
        confidence: 'MEDIUM', reviewStatus: 'REVIEWED',
      },
    ] },
  };
  return {
    unit: {
      id: `${idBase}:unit`, definitionId: id, side: context.side,
      formationId: context.formationId, role: context.role,
      sourceArchetypeId: source.id, pointCost: context.pointCost ?? source.pointCost,
    },
    definition,
  };
};

export const normalizeRandomOobOptions = (
  options: RandomOobOptions,
): Result<NormalizedRandomOobOptions, readonly OobGenerationError[]> => {
  const errors: OobGenerationError[] = [];
  if (!Number.isSafeInteger(options.seed) || options.seed < 0 || options.seed > 0xffff_ffff) {
    errors.push({ code: 'INVALID_OPTIONS', message: 'Seed must be a uint32.', path: ['seed'] });
  }
  if (!(OOB_SCALES as readonly string[]).includes(options.scale)) {
    errors.push({ code: 'INVALID_OPTIONS', message: 'Scale must be COMPACT, STANDARD, or LARGE.', path: ['scale'] });
  }
  const { minDivisions, maxDivisions, maxArmored } = OOB_DIVISION_LIMITS;
  if (!Number.isSafeInteger(options.divisionsPerSide)
    || options.divisionsPerSide < minDivisions || options.divisionsPerSide > maxDivisions) {
    errors.push({
      code: 'INVALID_OPTIONS', path: ['divisionsPerSide'],
      message: `Divisions per side must be an integer from ${minDivisions} to ${maxDivisions}.`,
    });
  }
  if (!Number.isSafeInteger(options.armoredDivisionsPerSide) || options.armoredDivisionsPerSide < 0
    || options.armoredDivisionsPerSide > maxArmored || options.armoredDivisionsPerSide > options.divisionsPerSide) {
    errors.push({
      code: 'INVALID_OPTIONS', path: ['armoredDivisionsPerSide'],
      message: `Armored divisions per side must be an integer from 0 to ${maxArmored}, and no more than the divisions per side.`,
    });
  }
  if (options.air !== undefined && !(AIR_FORCE_LEVELS as readonly string[]).includes(options.air)) {
    errors.push({ code: 'INVALID_OPTIONS', message: 'Air forces must be NONE or STANDARD.', path: ['air'] });
  }
  for (const key of ['airTransport', 'airSupport'] as const) {
    const level = options[key];
    if (level !== undefined && !(AIR_FORCE_LEVELS as readonly string[]).includes(level)) {
      errors.push({ code: 'INVALID_OPTIONS', message: `${key} must be NONE or STANDARD.`, path: [key] });
    } else if (level === 'STANDARD' && options.air !== 'STANDARD') {
      errors.push({ code: 'INVALID_OPTIONS', message: `${key} needs the air forces option.`, path: [key] });
    }
  }
  const { air, airTransport, airSupport, ...ground } = options;
  return errors.length > 0 ? err(errors) : ok({
    ...ground,
    ...(air === 'STANDARD' ? { air } : {}),
    ...(air === 'STANDARD' && airTransport === 'STANDARD' ? { airTransport } : {}),
    ...(air === 'STANDARD' && airSupport === 'STANDARD' ? { airSupport } : {}),
  });
};

const formationPlan = (
  options: NormalizedRandomOobOptions,
): readonly OobFormationArchetype[] => {
  const rng = createSeededRandom(mixUint32(options.seed ^ 0x4f4f_4237));
  const footCount = options.divisionsPerSide - options.armoredDivisionsPerSide;
  const foot: OobFormationArchetype[] = [];
  while (foot.length < footCount) {
    foot.push(...rng.shuffle(FOOT_ARCHETYPES));
  }
  // Every division carries a distinct historical name, so airborne slots beyond the airborne name pool
  // become infantry (at the 20-division limit: 4 airborne and 16 infantry, both pools in full).
  const airborneNames = formationNameCapacity('AIRBORNE');
  let airborne = 0;
  const named = foot.slice(0, footCount).map((archetype) => {
    if (archetype !== 'AIRBORNE') return archetype;
    airborne += 1;
    return airborne <= airborneNames ? archetype : 'INFANTRY';
  });
  // Armored divisions first, then foot divisions, so formation IDs and the roster read in that order.
  return [
    ...Array.from({ length: options.armoredDivisionsPerSide }, (_, index) => ARMORED_ARCHETYPES[index % ARMORED_ARCHETYPES.length]!),
    ...named,
  ];
};

const buildSide = (
  side: OobSide,
  plan: readonly OobFormationArchetype[],
  options: NormalizedRandomOobOptions,
  definitions: PieceDefinition[],
): GeneratedOobSide => {
  const archetypes = plan.map((planned) => sideArchetype(side, planned));
  const formations: GeneratedOobFormation[] = archetypes.map((archetype, formationIndex) => {
    const sequence = formationIndex + 1;
    const formationId = definitionId(`formation:generated:${options.seed}:${side.toLowerCase()}:${sequence}`);
    const occurrence = archetypes.slice(0, formationIndex).filter((value) => value === archetype).length;
    const namingProfile = formationNames(options.seed, side, archetype)[occurrence]!;
    const formationName = namingProfile.name;
    // Infantry and airborne divisions are a single XX counter; armored and mobile-infantry divisions are regiment-sized
    // units. Neither contains an HQ: HQs are generated below as independent units.
    const combatRequests = Array.from({ length: SCALE_COMBAT_UNITS[options.scale] }, (_, index) => ({
      role: 'COMBAT' as const, suffix: `combat-${index + 1}`,
    }));
    const requests: Array<{ role: OobUnitRole; suffix: string }> = isSingleUnitDivision(side, archetype)
      ? [{ role: 'COMBAT', suffix: 'combat-1' }]
      : [
        ...combatRequests,
        { role: 'ARTILLERY' as const, suffix: 'artillery-1' },
        ...(options.scale === 'LARGE' ? [{ role: 'ARTILLERY' as const, suffix: 'artillery-2' }] : []),
        { role: 'RECONNAISSANCE' as const, suffix: 'recon' },
      ];
    // A single-unit division is one counter, not a multi-unit formation (3.1c): no Formation ID, colour band or affiliation.
    const memberOf = isSingleUnitDivision(side, archetype) ? null : formationId;
    const units = requests.map(({ role, suffix }) => {
      const built = buildUnit({
        options, side, role, formationArchetype: archetype, formationId: memberOf,
        name: unitName(side, role, Number(suffix.split('-').at(-1)) || 1, options.seed, namingProfile,
          echelonFor(side, role, archetype)),
        localId: `f${sequence}-${suffix}`,
        ...(side === 'ALLIED' && archetype === 'AIRBORNE' && ALLIED_AIRBORNE_DIVISION_GPIDS[formationName] !== undefined
          ? { counterGpid: ALLIED_AIRBORNE_DIVISION_GPIDS[formationName] } : {}),
      });
      // 20.0: a single-counter division can detach Breakdowns.
      definitions.push(isSingleUnitDivision(side, archetype) && role === 'COMBAT'
        ? withBreakdowns(built.definition, side, archetype, options.seed, definitions) : built.definition);
      return built.unit;
    });
    return { id: formationId, side, name: formationName, archetype, units };
  });

  const supportCount = options.scale === 'LARGE'
    ? options.divisionsPerSide : Math.max(1, Math.ceil(options.divisionsPerSide / 2));
  const independentRequests: OobUnitRole[] = [
    ...Array.from({ length: supportCount }, () => 'ARTILLERY' as const),
    ...Array.from({ length: options.scale === 'LARGE' ? Math.ceil(options.divisionsPerSide / 2) : 1 }, () => 'ENGINEER' as const),
    ...Array.from({ length: supportCount }, () => 'TRANSPORT' as const),
    ...Array.from({ length: supportCount }, () => 'SUPPLY' as const),
    // 3.2f: HQs are independent units, never part of a formation. They come last so the first
    // independent field unit (held back as the side's reinforcement) is not an HQ.
    ...Array.from({ length: hqCount(options.divisionsPerSide) }, () => 'HQ' as const),
  ];
  const roleCounts = new Map<OobUnitRole, number>();
  const independentUnits = independentRequests.map((role) => {
    const ordinal = (roleCounts.get(role) ?? 0) + 1;
    roleCounts.set(role, ordinal);
    const name = unitName(side, role, ordinal, options.seed, undefined, echelonFor(side, role, undefined));
    // An HQ is built from its own counter, so it prints its own number, echelon and range-MA faces.
    const hq = role === 'HQ' ? hqName(options.seed, side, ordinal) : null;
    const built = buildUnit({
      options, side, role, formationId: null, name,
      localId: `independent-${role.toLowerCase()}-${ordinal}`,
      ...(hq ? { designation: hq.designation, counterGpid: hq.gpid, rawName: name } : {}),
    });
    definitions.push(built.definition);
    return built.unit;
  });
  const air = options.air === 'STANDARD' ? buildAirForces(side, options, definitions) : [];
  // 14.10: one paratroop battalion (a Para symbol unit, 14.10a) per side for Air Drops; air transports carry them.
  const paratroops = options.air === 'STANDARD' && options.airTransport === 'STANDARD' ? (() => {
    const built = buildUnit({
      options, side, role: 'COMBAT', formationArchetype: 'AIRBORNE', formationId: null,
      name: side === 'ALLIED' ? 'US Parachute Infantry Battalion' : 'Ge Fallschirmjäger Battalion',
      localId: 'independent-para-1', counterGpid: side === 'ALLIED' ? ALLIED_PARA_GPID : AXIS_PARA_GPID, echelon: 'II', pointCost: 6,
    });
    definitions.push(built.definition);
    return [{ ...built.unit, staging: 'AIR_BASE' as const }];
  })() : [];
  // 14.9c: 1 SP waits at the first Air Base too, so the first Air Transport has supply to carry (supply must stand in the base hex).
  const staged = options.air === 'STANDARD' && options.airTransport === 'STANDARD' ? (() => {
    const built = buildUnit({
      options, side, role: 'SUPPLY', formationId: null, name: unitName(side, 'SUPPLY', 90, options.seed, undefined, ''), localId: 'independent-supply-staged',
    });
    definitions.push(built.definition);
    return [{ ...built.unit, staging: 'AIR_BASE' as const }];
  })() : [];
  return { side, formations, independentUnits: [...independentUnits, ...paratroops, ...staged, ...air] };
};

export const generateRandomOob = (
  requested: RandomOobOptions,
): Result<GeneratedOob, readonly OobGenerationError[]> => {
  const normalized = normalizeRandomOobOptions(requested);
  if (!normalized.ok) return normalized;
  const options = normalized.value;
  const plan = formationPlan(options);
  const definitions: PieceDefinition[] = [];
  const sides = SIDES.map((side) => buildSide(side, plan, options, definitions));
  const pieceDefinitionCatalog: PieceDefinitionCatalog = {
    id: definitionId(`catalog:generated-oob:${options.seed}`),
    schemaVersion: FOUNDATION_SCHEMA_VERSION,
    definitions,
    provenance: [
      {
        document: 'Beyond the Rhine VASSAL buildFile.xml v1.27.0',
        locator: `sha256:${BTR_BUILD_FILE_SHA256.toLowerCase()}`,
        note: 'Names/roles/GPIDs reviewed as reference evidence; this output is synthetic and does not reproduce the historical OOB.',
      },
      { document: 'ocsEngine random OOB generator', locator: `M7/${OOB_GENERATOR_VERSION}/${options.scale}/${options.seed}` },
    ],
  };
  const draft = {
    schemaVersion: 1 as const, generatorVersion: OOB_GENERATOR_VERSION,
    options, sides, pieceDefinitionCatalog, warnings: [] as readonly string[],
  };
  const validation = validateGeneratedOob(draft);
  if (!validation.valid) return err([{
    code: 'GENERATION_INVALID', message: 'Generated OOB failed composition or Foundation validation.',
    path: [], issues: validation.issues,
  }]);
  const warnings = options.armoredDivisionsPerSide === options.divisionsPerSide && options.divisionsPerSide > 1
    ? ['All divisions are armored; transport and fuel pressure will be unusually high.'] : [];
  return ok({ ...draft, metrics: validation.metrics, warnings });
};

export const serializeGeneratedOob = (
  generated: GeneratedOob,
): Result<string, readonly OobGenerationError[]> => {
  const serialized = canonicalJson(generated);
  return serialized.ok ? serialized : err(serialized.error.map((issue) => ({
    code: 'GENERATION_INVALID' as const, message: issue.message, path: issue.path, issues: [issue],
  })));
};
