import { movementPoints, regimentalEquivalents, parseDefinitionId, type DefinitionId } from '../../core/index.js';
import { parseCapabilityId, parseFaceId, type PieceDefinition } from '../../domain/piece/index.js';
import type { NormalizedRandomOobOptions, OobScale, OobSide } from './model.js';

/**
 * Replacement counters (13.5). Every generated game gives each side Personnel (Pax) and Equipment (Eq) replacements
 * each Reinforcement Phase; they rebuild ground units (13.5a-e) and, Eq only, aircraft (13.5f). The per-turn
 * allotment is this generator's own table, standing in for a game's Variable Replacement Table.
 */

export type ReplacementKind = 'PAX' | 'EQ';

/** Repls a side receives each Reinforcement Phase, by scale. */
export const REPLACEMENTS_PER_TURN: Readonly<Record<OobScale, Readonly<Record<ReplacementKind, number>>>> = {
  COMPACT: { PAX: 1, EQ: 1 },
  STANDARD: { PAX: 2, EQ: 1 },
  LARGE: { PAX: 3, EQ: 2 },
};

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
