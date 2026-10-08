import { parseDefinitionId, type DefinitionId } from '../../core/index.js';
import { parseCapabilityId, type PieceDefinition } from '../../domain/piece/index.js';
import type { NormalizedRandomOobOptions, OobSide } from './model.js';

const must = <T>(result: { ok: true; value: T } | { ok: false; error: unknown }): T => {
  if (!result.ok) throw new Error('Generated hedgehog Definition scalar is invalid.');
  return result.value;
};
const definitionId = (value: string): DefinitionId => must(parseDefinitionId(value));

/** Hedgehog counter (`Hedgehog` PieceSlot, Level 1-4 faces misc_hog-1..4.png). */
export const HEDGEHOG_COUNTER = { entryName: 'Hedgehog', gpid: 12 } as const;

/**
 * The side's hedgehog Definition (16.0). Not an OOB unit: units build hedgehogs from it in play, and attack scenarios
 * place the defender's opening field works with it. The Level (1-4) is a status of each counter.
 */
export const buildHedgehogDefinition = (side: OobSide, options: NormalizedRandomOobOptions): PieceDefinition => ({
  counter: null,
  id: definitionId(`generated-oob:${options.seed}:${side.toLowerCase()}:hedgehog`),
  family: 'FACILITY',
  name: `${side === 'ALLIED' ? 'Allied' : 'Axis'} Hedgehog`,
  categoryDefinitionId: definitionId('category:oob:hedgehog'),
  ownership: {
    sideDefinitionId: definitionId(`side:${side.toLowerCase()}`),
    factionDefinitionId: null,
    nationalityDefinitionId: definitionId(`nationality:${side.toLowerCase()}`),
    formationDefinitionId: null,
    groupDefinitionId: null,
  },
  faces: [],
  capabilities: [{ id: must(parseCapabilityId('HEDGEHOG_TEMPLATE')), parameters: [] }],
  resource: null,
  facility: { facilityTypeDefinitionId: definitionId('facility:hedgehog') },
  marker: null,
  deferredClassification: null,
  source: { records: [{
    field: 'hedgehog', rawValue: `${HEDGEHOG_COUNTER.entryName} (gpid ${HEDGEHOG_COUNTER.gpid})`, normalizedValue: 'Hedgehog Level 1-4',
    source: { document: 'Beyond the Rhine VASSAL buildFile.xml v1.27.0', locator: `VASSAL.build.widget.PieceSlot[gpid=${HEDGEHOG_COUNTER.gpid}]` },
    confidence: 'HIGH', reviewStatus: 'REVIEWED',
  }] },
});
