import { parseDefinitionId, type DefinitionId, type Result } from '../../core/index.js';
import { parseCapabilityId, type PieceDefinition } from '../../domain/piece/index.js';
import { BTR_BUILD_FILE_SHA256 } from './catalog.js';
import { corpusCounter, corpusFaces } from './counter-corpus.js';
import type { FormationNameProfile } from './name-catalog.js';
import { sizedCombatName } from './names.js';
import type { OobFormationArchetype, OobSide } from './model.js';

/** A BTR Breakdown counter (20.0) and the printed Action Rating that decides which divisions may create it (20.0b). */
interface BreakdownCounter {
  readonly gpid: number;
  readonly entryName: string;
  readonly actionRating: number;
}

/**
 * Breakdown pools (20.0g), highest Action Rating first. Fallschirmjäger divisions are Luftwaffe and use the LW Breakdowns;
 * other German divisions use the army ones.
 */
const POOLS = {
  US: [{ gpid: 88, entryName: 'US 5-4-3 Breakdown', actionRating: 4 }, { gpid: 80, entryName: 'US 5-3-3 Breakdown', actionRating: 3 }],
  GERMAN: [{ gpid: 709, entryName: 'Ge 3-4-2 Breakdown', actionRating: 4 }, { gpid: 710, entryName: 'Ge 3-3-2 Breakdown', actionRating: 3 }],
  LUFTWAFFE: [{ gpid: 1207, entryName: 'Ge LW 4-3-2 Breakdown', actionRating: 3 }],
} as const satisfies Readonly<Record<string, readonly BreakdownCounter[]>>;

/** Capability names and separator read by the Rule Engine (rules/breakdown); generation does not import the rules. */
const BREAKDOWN_CAPABILITY = 'BREAKDOWN';
const BREAKDOWN_UNIT_CAPABILITY = 'BREAKDOWN_UNIT';
const BREAKDOWN_REGIMENT_SEPARATOR = '|';

const must = <T, E>(result: Result<T, E>): T => {
  if (!result.ok) throw new Error('Breakdown generator produced an invalid Foundation scalar.');
  return result.value;
};

const poolFor = (side: OobSide, archetype: OobFormationArchetype): readonly BreakdownCounter[] =>
  side === 'ALLIED' ? POOLS.US : archetype === 'AIRBORNE' ? POOLS.LUFTWAFFE : POOLS.GERMAN;

/** 20.0b: the strongest Breakdown of the pool whose Action Rating does not exceed the division's. */
const counterFor = (pool: readonly BreakdownCounter[], actionRating: number): BreakdownCounter | null =>
  pool.find((counter) => counter.actionRating <= actionRating) ?? null;

/**
 * The regiments a division can detach, from its naming profile's battalions ("1/16 Inf Bn", "2/16 Inf Bn" give
 * "16 Inf Regt"); separate battalions such as a tank battalion are not regiments of the division.
 */
export const divisionRegiments = (profile: FormationNameProfile, side: OobSide): readonly string[] =>
  [...new Set(profile.combat.filter((entry) => entry.includes('/'))
    .map((entry) => sizedCombatName(entry, 'III', side === 'ALLIED', '', 1)))];

const breakdownDefinition = (seed: number, side: OobSide, counter: BreakdownCounter): PieceDefinition => {
  const nationality = side === 'ALLIED' ? 'US' : 'GERMAN';
  const values = counter.entryName.match(/\d-\d-\d/u)?.[0] ?? '';
  return {
    counter: { ...corpusCounter(counter.gpid, 'Brkdwn', '', nationality, null, 'III'), rebuildable: false, showRe: false },
    id: must(parseDefinitionId(`generated-oob:${seed}:${side.toLowerCase()}:breakdown-${counter.gpid}`)),
    family: 'GROUND',
    name: `${side === 'ALLIED' ? 'US' : counter.entryName.includes(' LW ') ? 'Ge LW' : 'Ge'} Brkdwn ${values}`,
    categoryDefinitionId: must(parseDefinitionId('category:oob:breakdown')),
    ownership: {
      sideDefinitionId: must(parseDefinitionId(`side:${side.toLowerCase()}`)),
      factionDefinitionId: null,
      nationalityDefinitionId: must(parseDefinitionId(`nationality:${side.toLowerCase()}`)),
      formationDefinitionId: null,
      groupDefinitionId: null,
    },
    faces: corpusFaces(counter.gpid),
    capabilities: [{ id: must(parseCapabilityId(BREAKDOWN_UNIT_CAPABILITY)), parameters: [] }],
    resource: null,
    facility: null,
    marker: null,
    deferredClassification: null,
    source: { records: [{
      field: 'counter-faces', rawValue: `${counter.entryName}; BTR gpid=${counter.gpid}`,
      normalizedValue: 'Printed Breakdown faces (20.0f: 1 RE, one step) from the counter art',
      source: {
        document: 'Beyond the Rhine VASSAL buildFile.xml v1.27.0',
        locator: `VASSAL.build.widget.PieceSlot[gpid=${counter.gpid}]`,
        note: `SHA-256 ${BTR_BUILD_FILE_SHA256}`,
      },
      confidence: 'MEDIUM', reviewStatus: 'REVIEWED',
    }] },
  };
};

/**
 * Give a single-counter division its Breakdown pool (20.0): the division Definition gains the `BREAKDOWN` capability
 * naming the Breakdown Definition and its regiments, and that Definition is added to `definitions` once per side and pool.
 * Armor/Mech and one-step units get none.
 */
export const withBreakdowns = (
  division: PieceDefinition,
  side: OobSide,
  archetype: OobFormationArchetype,
  profile: FormationNameProfile,
  seed: number,
  definitions: PieceDefinition[],
): PieceDefinition => {
  const face = division.faces[0];
  const steps = face?.steps.length ?? 0;
  const actionRating = face?.steps.at(-1)?.actionRating ?? null;
  if (division.counter?.combatCategory !== 'OTHER' || steps < 2 || actionRating === null) return division;
  const counter = counterFor(poolFor(side, archetype), actionRating);
  if (!counter) return division;
  const breakdown = breakdownDefinition(seed, side, counter);
  if (!definitions.some(({ id }) => id === breakdown.id)) definitions.push(breakdown);
  const breakdownId: DefinitionId = breakdown.id;
  return {
    ...division,
    capabilities: [...division.capabilities, {
      id: must(parseCapabilityId(BREAKDOWN_CAPABILITY)),
      parameters: [
        { key: 'definitionId', kind: 'TEXT', value: breakdownId },
        { key: 'regiments', kind: 'TEXT', value: divisionRegiments(profile, side).join(BREAKDOWN_REGIMENT_SEPARATOR) },
      ],
    }],
  };
};
