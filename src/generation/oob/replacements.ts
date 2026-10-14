import { movementPoints, regimentalEquivalents, parseDefinitionId, type DefinitionId } from '../../core/index.js';
import { parseCapabilityId, parseFaceId, type PieceDefinition } from '../../domain/piece/index.js';
import type { NormalizedRandomOobOptions, OobScale, OobSide } from './model.js';

/**
 * Replacement counters (13.5). Every generated game gives each side Personnel (Pax) and Equipment (Eq) replacements,
 * rolled on the side's Variable Replacement Table each Reinforcement Phase; they rebuild ground units by the side's
 * Rebuild Table (13.5a-e) and, Eq only, aircraft (13.5f). Both tables are this generator's own: generated games have no
 * printed ones (docs/reports/replacement-tables-2026-10-14.md).
 */

export type ReplacementKind = 'PAX' | 'EQ';

/**
 * Average Repls a side receives each Reinforcement Phase, by scale. The Variable Replacement Tables below are built around
 * these; a game saved before the tables existed receives exactly these each turn.
 */
export const REPLACEMENTS_PER_TURN: Readonly<Record<OobScale, Readonly<Record<ReplacementKind, number>>>> = {
  COMPACT: { PAX: 1, EQ: 1 },
  STANDARD: { PAX: 2, EQ: 1 },
  LARGE: { PAX: 3, EQ: 2 },
};

/** Pax and Eq for each 2d6 total from 2 to 12. */
type TableColumn = readonly (readonly [pax: number, eq: number])[];

/**
 * 13.5: Variable Replacement Tables of generated games, one 2d6 row per total. The expected Pax and Eq of each table are
 * within 0.1 of REPLACEMENTS_PER_TURN for its scale, so a game receives what the fixed allotment gave on average.
 */
const VARIABLE_REPLACEMENT_TABLES: Readonly<Record<OobScale, TableColumn>> = {
  //          2       3       4       5       6       7       8       9       10      11      12
  COMPACT: [[0, 0], [1, 0], [1, 0], [0, 1], [1, 1], [1, 1], [1, 1], [1, 1], [1, 2], [2, 1], [2, 2]],
  STANDARD: [[1, 0], [1, 0], [1, 0], [1, 1], [2, 1], [2, 1], [2, 1], [3, 1], [2, 2], [3, 2], [4, 2]],
  LARGE: [[1, 0], [1, 1], [2, 2], [3, 1], [3, 2], [3, 2], [3, 2], [3, 3], [4, 2], [4, 3], [5, 3]],
};

export interface VariableReplacementRow {
  readonly minimum: number;
  readonly maximum: number;
  readonly pax: number;
  readonly eq: number;
}

export const variableReplacementTable = (scale: OobScale): readonly VariableReplacementRow[] =>
  VARIABLE_REPLACEMENT_TABLES[scale].map(([pax, eq], index) => ({ minimum: index + 2, maximum: index + 2, pax, eq }));

const must = <T>(result: { ok: true; value: T } | { ok: false; error: unknown }): T => {
  if (!result.ok) throw new Error('Generated replacement Definition scalar is invalid.');
  return result.value;
};
const definitionId = (value: string): DefinitionId => must(parseDefinitionId(value));

const KIND_NAMES: Readonly<Record<ReplacementKind, { readonly id: string; readonly name: string }>> = {
  PAX: { id: 'personnel', name: 'Personnel replacements' },
  EQ: { id: 'equipment', name: 'Equipment replacements' },
};

const replacementDefinition = (seed: number, side: OobSide, kind: ReplacementKind, perTurn: number): PieceDefinition => ({
  counter: null,
  id: definitionId(`generated-oob:${seed}:${side.toLowerCase()}:${KIND_NAMES[kind].id}`),
  family: 'REPLACEMENT',
  name: `${side === 'ALLIED' ? 'Allied' : 'Axis'} ${KIND_NAMES[kind].name}`,
  categoryDefinitionId: definitionId('category:oob:replacement'),
  ownership: {
    sideDefinitionId: definitionId(`side:${side.toLowerCase()}`),
    factionDefinitionId: null,
    nationalityDefinitionId: definitionId(`nationality:${side.toLowerCase()}`),
    formationDefinitionId: null,
    groupDefinitionId: null,
  },
  faces: [{
    id: must(parseFaceId('move')), name: 'Move',
    mobilityClassDefinitionId: definitionId(kind === 'PAX' ? 'mobility:leg' : 'mobility:truck'),
    steps: [{ remainingSteps: 1, combatStrength: 0, actionRating: 0,
      movementPointTicks: must(movementPoints(kind === 'PAX' ? 5 : 10)),
      regimentalEquivalentTicks: must(regimentalEquivalents(0.25)), range: null, ratings: [] }],
  }],
  capabilities: [{ id: must(parseCapabilityId('REPLACEMENT')), parameters: [{ key: 'kind', kind: 'TEXT', value: kind }, { key: 'perTurn', kind: 'INTEGER', value: perTurn }] }],
  resource: null, facility: null, marker: null, deferredClassification: null,
  source: { records: [{
    field: 'replacement-unit-ratings', rawValue: kind === 'PAX' ? '0-0-5 Leg' : '0-0-10 Truck',
    normalizedValue: 'One replacement per counter; 1/4 RE; Move orientation only',
    source: { document: 'Beyond the Rhine 1.27.0', locator: kind === 'PAX' ? 'images/US-Repl-Pax.png; German Pax Replacement.png; OCS 13.5' : 'images/US-Repl-EQ.png; German EQ Replacement.png; OCS 13.5' },
    confidence: 'HIGH', reviewStatus: 'REVIEWED',
  }, {
    field: 'replacement-allotment', rawValue: 'generator-defined', normalizedValue: `${perTurn} ${kind === 'PAX' ? 'Pax' : 'Eq'} each Reinforcement Phase`,
    source: { document: 'docs/reports/replacements-2026-10-04.md', locator: 'Replacement allotment' },
    confidence: 'MEDIUM', reviewStatus: 'REVIEWED',
  }] },
});

/** The Pax and Eq Definitions of one side; their counters are created in play as they arrive. */
export const buildReplacementDefinitions = (side: OobSide, options: NormalizedRandomOobOptions): readonly PieceDefinition[] =>
  (['PAX', 'EQ'] as const).map((kind) => replacementDefinition(options.seed, side, kind, REPLACEMENTS_PER_TURN[options.scale][kind]));

// ─── 13.5a, 13.5d Rebuild Table ─────────────────────────────────────────────────────────────────

export interface RebuildTableRow {
  readonly id: string;
  readonly label: string;
  readonly pax: number;
  readonly eq: number;
  readonly pairs: boolean;
  readonly definitionIds: readonly DefinitionId[];
}

type RowSpec = Omit<RebuildTableRow, 'definitionIds'>;

/** Rows of a generated Rebuild Table, in the order they are printed. Costs are per step, or per pair of units on a `pairs` row. */
export const REBUILD_TABLE_ROWS: readonly RowSpec[] = [
  { id: 'hq', label: 'HQ', pax: 1, eq: 1, pairs: false },
  { id: 'armor-mech', label: 'Armor and Mech units (3.2a), anti-tank and assault guns', pax: 0, eq: 1, pairs: false },
  { id: 'artillery', label: 'Artillery', pax: 0, eq: 1, pairs: false },
  { id: 'infantry', label: 'Infantry and other units', pax: 1, eq: 0, pairs: false },
  { id: 'small-infantry', label: 'Infantry battalions of 1/2 RE or less (13.5d: two for one Pax)', pax: 1, eq: 0, pairs: true },
];

const HEAVY_SYMBOLS = new Set(['ANTI_TANK', 'ASSAULT_GUN', 'TIGER']);
const SMALL_SYMBOLS = new Set(['INFANTRY', 'AIRBORNE', 'ENGINEER']);

/** The Rebuild Table row of a ground Definition, or null when it can never be rebuilt (13.5b-c, 13.5e). */
export const rebuildRowOf = (definition: PieceDefinition): string | null => {
  const counter = definition.counter;
  if (definition.family !== 'GROUND' || !counter || !counter.rebuildable) return null;
  if (counter.kind === 'TRANSPORT' || counter.kind === 'SUPPLY') return null;
  if (counter.kind === 'HQ') return 'hq';
  if (counter.kind === 'ARTILLERY') return 'artillery';
  if (counter.combatCategory !== 'OTHER' || HEAVY_SYMBOLS.has(counter.symbol)) return 'armor-mech';
  const steps = Math.max(0, ...definition.faces.flatMap(({ steps: profiles }) => profiles.map(({ remainingSteps }) => remainingSteps)));
  const reTicks = Math.max(0, ...definition.faces.flatMap(({ steps: profiles }) => profiles.map(({ regimentalEquivalentTicks }) => Number(regimentalEquivalentTicks ?? 0))));
  return steps === 1 && reTicks <= 2 && SMALL_SYMBOLS.has(counter.symbol) ? 'small-infantry' : 'infantry';
};

/** One side's Rebuild Table: every rebuildable ground Definition of the side, on its row. Rows that list nothing are left out. */
export const buildRebuildTable = (definitions: readonly PieceDefinition[], side: OobSide): readonly RebuildTableRow[] => {
  const sideId = `side:${side.toLowerCase()}`;
  const byRow = new Map<string, DefinitionId[]>();
  for (const definition of definitions) {
    if (String(definition.ownership.sideDefinitionId) !== sideId) continue;
    const row = rebuildRowOf(definition);
    if (row) byRow.set(row, [...(byRow.get(row) ?? []), definition.id]);
  }
  return REBUILD_TABLE_ROWS.flatMap((row) => byRow.has(row.id) ? [{ ...row, definitionIds: byRow.get(row.id)! }] : []);
};
