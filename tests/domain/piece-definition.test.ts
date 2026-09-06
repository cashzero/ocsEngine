import { describe, expect, it } from 'vitest';
import {
  createPieceDefinitionCatalogIndex,
  movementPoints,
  parseCapabilityId,
  parseDefinitionId,
  parseFaceId,
  regimentalEquivalents,
  schemaVersion,
  validatePieceDefinition,
  validatePieceDefinitionCatalog,
  type CapabilityDeclaration,
  type DefinitionId,
  type MovementPointTick,
  type PieceDefinition,
  type PieceDefinitionCatalog,
  type PieceFaceDefinition,
  type PieceFamily,
  type Result,
} from '../../src/index.js';

const must = <T, E>(result: Result<T, E>): T => {
  if (!result.ok) throw new Error('Expected a successful test fixture result.');
  return result.value;
};

const definitionId = (value: string): DefinitionId => must(parseDefinitionId(value));

const face = (id: string, stepCount = 1): PieceFaceDefinition => ({
  id: must(parseFaceId(id)),
  name: id === 'combat' ? 'Combat' : 'Move',
  mobilityClassDefinitionId: definitionId(id === 'combat' ? 'mobility:leg' : 'mobility:truck'),
  steps: Array.from({ length: stepCount }, (_, index) => {
    const remainingSteps = stepCount - index;
    return {
      remainingSteps,
      combatStrength: remainingSteps * 2,
      actionRating: 4,
      movementPointTicks: must(movementPoints(id === 'combat' ? 3 : 6)),
      regimentalEquivalentTicks: must(regimentalEquivalents(remainingSteps)),
      range: 1,
      ratings: [{
        ratingDefinitionId: definitionId('rating:barrage'),
        value: remainingSteps,
      }],
    };
  }),
});

const source = (id: string) => ({
  records: [{
    field: 'name',
    rawValue: `raw ${id}`,
    normalizedValue: id,
    source: { document: 'synthetic-piece-catalog', locator: id },
    confidence: 'VERIFIED' as const,
    reviewStatus: 'REVIEWED' as const,
  }],
});

const ownership = {
  sideDefinitionId: definitionId('side:allied'),
  factionDefinitionId: definitionId('faction:allied'),
  nationalityDefinitionId: definitionId('nationality:us'),
  formationDefinitionId: definitionId('formation:1-armored'),
  groupDefinitionId: definitionId('group:combat-command-a'),
};

const attackCapability: CapabilityDeclaration = {
  id: must(parseCapabilityId('ATTACK_CAPABLE')),
  parameters: [],
};

const transportCapability: CapabilityDeclaration = {
  id: must(parseCapabilityId('TRANSPORT_CAPACITY')),
  parameters: [{
    key: 'capacity',
    kind: 'EXACT_QUANTITY',
    value: 8,
    unitDefinitionId: definitionId('quantity:quarter-re-tick'),
  }],
};

const piece = (id: string, family: PieceFamily): PieceDefinition => ({
  counter: null,
  id: definitionId(`piece-definition:${id}`),
  family,
  name: id,
  categoryDefinitionId: definitionId(`category:${family.toLowerCase()}`),
  ownership,
  faces: ['GROUND', 'AIR', 'NAVAL'].includes(family) ? [face('combat')] : [],
  capabilities: family === 'GROUND' ? [attackCapability, transportCapability] : [],
  resource: family === 'RESOURCE'
    ? {
      resourceDefinitionId: definitionId('resource:supply'),
      unitDefinitionId: definitionId('quantity:supply-token'),
      printedQuantity: 4,
      capacity: 8,
    }
    : null,
  facility: family === 'FACILITY'
    ? { facilityTypeDefinitionId: definitionId('facility:airbase') }
    : null,
  marker: family === 'MARKER'
    ? { markerTypeDefinitionId: definitionId('marker:reserve') }
    : null,
  deferredClassification: family === 'DEFERRED' ? 'unknown-vassal-prototype' : null,
  source: source(id),
});

const groundPiece = (): PieceDefinition => ({
  ...piece('3-ad', 'GROUND'),
  faces: [face('combat', 3), face('move', 3)],
});

const catalog = (): PieceDefinitionCatalog => ({
  id: definitionId('catalog:synthetic-f5'),
  schemaVersion: must(schemaVersion(1)),
  definitions: [
    piece('unknown', 'DEFERRED'),
    piece('reserve-marker', 'MARKER'),
    piece('airbase', 'FACILITY'),
    piece('battleship', 'NAVAL'),
    piece('fighter', 'AIR'),
    piece('supply-dump', 'RESOURCE'),
    groundPiece(),
  ],
  provenance: [{ document: 'synthetic-piece-catalog', locator: 'catalog root' }],
});

describe('PieceDefinition catalog', () => {
  it('accepts every supported family in a versioned catalog', () => {
    const definitions = catalog();
    expect(validatePieceDefinitionCatalog(definitions)).toEqual([]);
    expect(definitions.definitions.map(({ family }) => family)).toEqual([
      'DEFERRED', 'MARKER', 'FACILITY', 'NAVAL', 'AIR', 'RESOURCE', 'GROUND',
    ]);
  });

  it('indexes definitions deterministically without mutating persistent order', () => {
    const definitions = catalog();
    const persistentOrder = definitions.definitions.map(({ id }) => id);
    const index = createPieceDefinitionCatalogIndex(definitions);

    expect(index.ordered().map(({ id }) => id)).toEqual([
      'piece-definition:3-ad',
      'piece-definition:airbase',
      'piece-definition:battleship',
      'piece-definition:fighter',
      'piece-definition:reserve-marker',
      'piece-definition:supply-dump',
      'piece-definition:unknown',
    ]);
    expect(index.byFamily('GROUND')).toHaveLength(1);
    expect(index.get(definitionId('piece-definition:3-ad'))?.name).toBe('3-ad');
    expect(definitions.definitions.map(({ id }) => id)).toEqual(persistentOrder);
  });

  it('models faces and arbitrary multi-step profiles without front/back assumptions', () => {
    const ground = groundPiece();
    expect(ground.faces).toHaveLength(2);
    expect(ground.faces.map(({ id }) => id)).toEqual(['combat', 'move']);
    expect(ground.faces[0]?.steps.map(({ remainingSteps }) => remainingSteps))
      .toEqual([3, 2, 1]);
    expect(ground.faces[0]?.steps.map(({ regimentalEquivalentTicks }) =>
      regimentalEquivalentTicks)).toEqual([12, 8, 4]);
  });

  it('keeps non-applicable ratings nullable instead of inventing zero values', () => {
    const air = piece('fighter-without-re', 'AIR');
    const withoutRe: PieceDefinition = {
      ...air,
      faces: air.faces.map((printedFace) => ({
        ...printedFace,
        steps: printedFace.steps.map((step) => ({
          ...step,
          regimentalEquivalentTicks: null,
        })),
      })),
    };

    expect(validatePieceDefinition(withoutRe)).toEqual([]);
    expect(withoutRe.faces[0]?.steps[0]?.regimentalEquivalentTicks).toBeNull();
  });

  it('keeps capabilities as typed data declarations', () => {
    const ground = groundPiece();
    expect(ground.capabilities).toEqual([attackCapability, transportCapability]);
    expect(JSON.parse(JSON.stringify(ground.capabilities))).toEqual([
      { id: 'ATTACK_CAPABLE', parameters: [] },
      {
        id: 'TRANSPORT_CAPACITY',
        parameters: [{
          key: 'capacity',
          kind: 'EXACT_QUANTITY',
          value: 8,
          unitDefinitionId: 'quantity:quarter-re-tick',
        }],
      },
    ]);
  });

  it('preserves field-level raw and normalized source evidence', () => {
    expect(groundPiece().source.records[0]).toEqual({
      field: 'name',
      rawValue: 'raw 3-ad',
      normalizedValue: '3-ad',
      source: { document: 'synthetic-piece-catalog', locator: '3-ad' },
      confidence: 'VERIFIED',
      reviewStatus: 'REVIEWED',
    });
  });
});

describe('PieceDefinition structural validation', () => {
  it('rejects family/profile mismatches and invalid resource capacity', () => {
    const resource = piece('bad-resource', 'RESOURCE');
    const mismatch: PieceDefinition = {
      ...resource,
      resource: null,
      facility: { facilityTypeDefinitionId: definitionId('facility:port') },
    };
    const overCapacity: PieceDefinition = {
      ...resource,
      resource: { ...resource.resource!, printedQuantity: 9, capacity: 8 },
    };

    expect(validatePieceDefinition(mismatch).map(({ code }) => code))
      .toEqual(['PIECE_FAMILY_PROFILE_MISMATCH', 'PIECE_FAMILY_PROFILE_MISMATCH']);
    expect(validatePieceDefinition(overCapacity).map(({ code }) => code))
      .toContain('RESOURCE_QUANTITY_EXCEEDS_CAPACITY');
  });

  it('rejects duplicate/non-contiguous steps and invalid normalized ratings', () => {
    const ground = groundPiece();
    const originalFace = ground.faces[0]!;
    const invalidFace: PieceFaceDefinition = {
      ...originalFace,
      steps: [
        { ...originalFace.steps[0]!, combatStrength: -1 },
        {
          ...originalFace.steps[2]!,
          movementPointTicks: -1 as MovementPointTick,
          ratings: [
            originalFace.steps[2]!.ratings[0]!,
            originalFace.steps[2]!.ratings[0]!,
          ],
        },
      ],
    };
    const invalid: PieceDefinition = { ...ground, faces: [invalidFace, invalidFace] };
    const codes = validatePieceDefinition(invalid).map(({ code }) => code);

    expect(codes).toContain('DUPLICATE_FACE_ID');
    expect(codes).toContain('NON_CONTIGUOUS_STEP_PROFILE');
    expect(codes).toContain('INVALID_PRINTED_RATING');
    expect(codes).toContain('DUPLICATE_PRINTED_RATING');
  });

  it('rejects duplicate capability parameters and invalid exact quantities', () => {
    const invalidCapability: CapabilityDeclaration = {
      id: must(parseCapabilityId('TRANSPORT_CAPACITY')),
      parameters: [
        {
          key: 'capacity',
          kind: 'EXACT_QUANTITY',
          value: -1,
          unitDefinitionId: definitionId('quantity:quarter-re-tick'),
        },
        { key: 'capacity', kind: 'INTEGER', value: 2 },
      ],
    };
    const invalid = { ...groundPiece(), capabilities: [invalidCapability] };
    const codes = validatePieceDefinition(invalid).map(({ code }) => code);

    expect(codes).toContain('DUPLICATE_CAPABILITY_PARAMETER');
    expect(codes).toContain('INVALID_CAPABILITY_PARAMETER');
  });

  it('rejects duplicate catalog IDs and missing source/provenance evidence', () => {
    const definitions = catalog();
    const unsourced = { ...groundPiece(), source: { records: [] } };
    const invalid: PieceDefinitionCatalog = {
      ...definitions,
      definitions: [unsourced, unsourced],
      provenance: [],
    };
    const codes = validatePieceDefinitionCatalog(invalid).map(({ code }) => code);

    expect(codes).toContain('DUPLICATE_PIECE_DEFINITION_ID');
    expect(codes.filter((code) => code === 'MISSING_PIECE_SOURCE')).toHaveLength(2);
    expect(codes).toContain('MISSING_CATALOG_PROVENANCE');
  });
});
