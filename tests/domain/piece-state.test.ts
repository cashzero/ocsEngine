import { describe, expect, it } from 'vitest';
import {
  createEmptyPieceRuntimeState,
  createPieceStateIndex,
  formatHexId,
  hex,
  movementPoints,
  parseCapabilityId,
  parseDefinitionId,
  parseFaceId,
  parsePieceId,
  parsePiecePoolId,
  parsePlayerId,
  regimentalEquivalents,
  revision,
  schemaVersion,
  upsertPieceRelation,
  upsertPieceState,
  validatePieceRuntimeState,
  type CapabilityDeclaration,
  type DefinitionId,
  type FaceId,
  type PieceDefinition,
  type PieceDefinitionCatalog,
  type PieceId,
  type PieceLocation,
  type PieceRelation,
  type PieceRuntimeState,
  type PieceState,
  type Result,
} from '../../src/index.js';

const must = <T, E>(result: Result<T, E>): T => {
  if (!result.ok) throw new Error('Expected a successful test fixture result.');
  return result.value;
};

const definitionId = (value: string): DefinitionId => must(parseDefinitionId(value));
const pieceId = (value: string): PieceId => must(parsePieceId(value));
const ownerId = must(parsePlayerId('player:allied'));
const combatFaceId = must(parseFaceId('combat'));
const loadUnitId = definitionId('quantity:quarter-re-tick');

const transportCapacity = (value: number): CapabilityDeclaration => ({
  id: must(parseCapabilityId('TRANSPORT_CAPACITY')),
  parameters: [{
    key: 'capacity',
    kind: 'EXACT_QUANTITY',
    value,
    unitDefinitionId: loadUnitId,
  }],
});

const groundDefinition = (
  id: string,
  capabilities: readonly CapabilityDeclaration[] = [],
): PieceDefinition => ({
  id: definitionId(`piece-definition:${id}`),
  family: 'GROUND',
  counter: null,
  name: id,
  categoryDefinitionId: definitionId('category:ground'),
  ownership: {
    sideDefinitionId: definitionId('side:allied'),
    factionDefinitionId: definitionId('faction:allied'),
    nationalityDefinitionId: definitionId('nationality:us'),
    formationDefinitionId: null,
    groupDefinitionId: null,
  },
  faces: [{
    id: combatFaceId,
    name: 'Combat',
    mobilityClassDefinitionId: definitionId('mobility:truck'),
    steps: [{
      remainingSteps: 1,
      combatStrength: 2,
      actionRating: 3,
      movementPointTicks: must(movementPoints(6)),
      regimentalEquivalentTicks: must(regimentalEquivalents(1)),
      range: 1,
      ratings: [],
    }],
  }],
  capabilities,
  resource: null,
  facility: null,
  marker: null,
  deferredClassification: null,
  source: { records: [{
    field: 'name',
    rawValue: id,
    normalizedValue: id,
    source: { document: 'synthetic-piece-state', locator: id },
    confidence: 'VERIFIED',
    reviewStatus: 'REVIEWED',
  }] },
});

const resourceDefinition = (): PieceDefinition => ({
  ...groundDefinition('supply'),
  family: 'RESOURCE',
  faces: [],
  capabilities: [],
  resource: {
    resourceDefinitionId: definitionId('resource:supply'),
    unitDefinitionId: definitionId('quantity:supply-token'),
    printedQuantity: 4,
    capacity: 8,
  },
});

const catalog = (): PieceDefinitionCatalog => ({
  id: definitionId('catalog:synthetic-f6'),
  schemaVersion: must(schemaVersion(1)),
  definitions: [
    groundDefinition('carrier', [transportCapacity(8)]),
    groundDefinition('cargo'),
    resourceDefinition(),
  ],
  provenance: [{ document: 'synthetic-piece-state', locator: 'catalog' }],
});

const groundState = (
  id: string,
  definition: string,
  location: PieceLocation,
  stackOrder: number,
): PieceState => ({
  id: pieceId(id),
  definitionId: definitionId(`piece-definition:${definition}`),
  ownerId,
  location,
  currentFaceId: combatFaceId,
  remainingSteps: 1,
  mode: 'MOVE',
  statuses: [],
  stackOrder,
  resourceQuantity: null,
});

const cargoRelation = (
  cargoId: PieceId,
  containerId: PieceId,
  loadQuantity: number,
): PieceRelation => ({
  kind: 'CARGO',
  cargoId,
  containerId,
  loadQuantity,
  unitDefinitionId: loadUnitId,
});

const validRuntimeState = (): PieceRuntimeState => {
  const carrierId = pieceId('piece:carrier');
  const cargoId = pieceId('piece:cargo');
  const mapLocation: PieceLocation = { kind: 'ON_MAP', hexId: formatHexId(hex(0, 0)) };
  const carrier = {
    ...groundState('piece:carrier', 'carrier', mapLocation, 0),
    statuses: [
      { statusDefinitionId: definitionId('status:oos'), value: { kind: 'FLAG', value: false } },
      {
        statusDefinitionId: definitionId('status:internal-stock'),
        value: { kind: 'EXACT_QUANTITY', value: 2, unitDefinitionId: loadUnitId },
      },
    ],
  } satisfies PieceState;
  const cargo = groundState(
    'piece:cargo',
    'cargo',
    { kind: 'CONTAINER', containerId: carrierId },
    0,
  );
  const escort = groundState('piece:escort', 'cargo', mapLocation, 1);
  const supply: PieceState = {
    id: pieceId('piece:supply'),
    definitionId: definitionId('piece-definition:supply'),
    ownerId,
    location: { kind: 'POOL', poolId: must(parsePiecePoolId('pool:supply')) },
    currentFaceId: null,
    remainingSteps: null,
    mode: null,
    statuses: [],
    stackOrder: 0,
    resourceQuantity: 4,
  };
  return {
    schemaVersion: must(schemaVersion(1)),
    revision: must(revision(0)),
    pieces: [supply, cargo, escort, carrier],
    relations: [
      cargoRelation(cargoId, carrierId, 4),
      {
        kind: 'ATTACHMENT',
        childId: cargoId,
        parentId: carrierId,
      },
      {
        kind: 'GROUP_MEMBERSHIP',
        memberId: cargoId,
        groupDefinitionId: definitionId('group:combat-command-a'),
      },
      {
        kind: 'FORMATION_MEMBERSHIP',
        memberId: cargoId,
        formationDefinitionId: definitionId('formation:1-armored'),
      },
    ],
  };
};

describe('Piece runtime state', () => {
  it('validates face, step, owner, location, mode, status, and resource state', () => {
    expect(validatePieceRuntimeState(catalog(), validRuntimeState())).toEqual([]);
  });

  it('does not treat eliminated Pieces as occupants of one shared stack', () => {
    const state = validRuntimeState();
    const eliminated = ['piece:eliminated-one', 'piece:eliminated-two'].map((id) =>
      groundState(id, 'cargo', { kind: 'ELIMINATED' }, 0));
    expect(validatePieceRuntimeState(catalog(), {
      ...state,
      pieces: [...state.pieces, ...eliminated],
    })).toEqual([]);
  });

  it('keeps mode independent from printed face orientation', () => {
    const state = validRuntimeState();
    const pieces = state.pieces.map((piece) => piece.id === 'piece:carrier'
      ? { ...piece, mode: 'DG' as const }
      : piece);

    expect(validatePieceRuntimeState(catalog(), { ...state, pieces })).toEqual([]);
    expect(pieces.find(({ id }) => id === 'piece:carrier')?.currentFaceId).toBe('combat');
  });

  it('derives stack membership and order from the single location field', () => {
    const state = validRuntimeState();
    const index = createPieceStateIndex(state);
    const pieces = index.atLocation({ kind: 'ON_MAP', hexId: formatHexId(hex(0, 0)) });

    expect(pieces.map(({ id }) => id)).toEqual(['piece:carrier', 'piece:escort']);
    expect(index.get(pieceId('piece:cargo'))?.location.kind).toBe('CONTAINER');
    expect(state.pieces.map(({ id }) => id)).toEqual([
      'piece:supply', 'piece:cargo', 'piece:escort', 'piece:carrier',
    ]);
  });

  it('updates Pieces and relations immutably with deterministic revisions', () => {
    const initial = createEmptyPieceRuntimeState(must(revision(0)));
    const source = validRuntimeState();
    const carrier = source.pieces.find(({ id }) => id === 'piece:carrier')!;
    const withPiece = upsertPieceState(initial, carrier);
    const withRelation = upsertPieceRelation(withPiece, {
      kind: 'GROUP_MEMBERSHIP',
      memberId: carrier.id,
      groupDefinitionId: definitionId('group:a'),
    });
    const replaced = upsertPieceRelation(withRelation, {
      kind: 'GROUP_MEMBERSHIP',
      memberId: carrier.id,
      groupDefinitionId: definitionId('group:b'),
    });

    expect(initial).toEqual({ schemaVersion: 1, revision: 0, pieces: [], relations: [] });
    expect(withPiece.revision).toBe(1);
    expect(replaced.revision).toBe(3);
    expect(replaced.relations).toEqual([{
      kind: 'GROUP_MEMBERSHIP',
      memberId: carrier.id,
      groupDefinitionId: 'group:b',
    }]);
  });
});

describe('Piece relation structural validation', () => {
  it('detects container and hierarchy cycles', () => {
    const firstId = pieceId('piece:first');
    const secondId = pieceId('piece:second');
    const first = groundState(
      'piece:first',
      'carrier',
      { kind: 'CONTAINER', containerId: secondId },
      0,
    );
    const second = groundState(
      'piece:second',
      'carrier',
      { kind: 'CONTAINER', containerId: firstId },
      0,
    );
    const state: PieceRuntimeState = {
      schemaVersion: must(schemaVersion(1)),
      revision: must(revision(0)),
      pieces: [first, second],
      relations: [
        cargoRelation(firstId, secondId, 4),
        cargoRelation(secondId, firstId, 4),
        { kind: 'ATTACHMENT', childId: firstId, parentId: secondId },
        { kind: 'PARENT', childId: secondId, parentId: firstId },
      ],
    };
    const codes = validatePieceRuntimeState(catalog(), state).map(({ code }) => code);

    expect(codes).toContain('CONTAINER_RELATION_CYCLE');
    expect(codes).toContain('HIERARCHY_RELATION_CYCLE');
  });

  it('detects semantic duplicates, location mismatch, and capacity overflow', () => {
    const carrierId = pieceId('piece:carrier');
    const firstId = pieceId('piece:cargo-a');
    const secondId = pieceId('piece:cargo-b');
    const carrier = groundState(
      'piece:carrier',
      'carrier',
      { kind: 'ON_MAP', hexId: formatHexId(hex(0, 0)) },
      0,
    );
    const first = groundState(
      'piece:cargo-a',
      'cargo',
      { kind: 'CONTAINER', containerId: carrierId },
      0,
    );
    const second = groundState(
      'piece:cargo-b',
      'cargo',
      { kind: 'ON_MAP', hexId: formatHexId(hex(1, 0)) },
      1,
    );
    const duplicate = cargoRelation(firstId, carrierId, 5);
    const state: PieceRuntimeState = {
      schemaVersion: must(schemaVersion(1)),
      revision: must(revision(0)),
      pieces: [carrier, first, second],
      relations: [
        duplicate,
        duplicate,
        cargoRelation(secondId, carrierId, 5),
      ],
    };
    const codes = validatePieceRuntimeState(catalog(), state).map(({ code }) => code);

    expect(codes).toContain('DUPLICATE_PIECE_RELATION');
    expect(codes).toContain('CARGO_LOCATION_MISMATCH');
    expect(codes).toContain('CARGO_CAPACITY_EXCEEDED');
  });

  it('detects definition/face/mode/resource/status and stack structural errors', () => {
    const state = validRuntimeState();
    const carrier = state.pieces.find(({ id }) => id === 'piece:carrier')!;
    const supply = state.pieces.find(({ id }) => id === 'piece:supply')!;
    const invalidCarrier: PieceState = {
      ...carrier,
      currentFaceId: 'unknown-face' as FaceId,
      remainingSteps: 99,
      statuses: [
        { statusDefinitionId: definitionId('status:oos'), value: { kind: 'FLAG', value: true } },
        { statusDefinitionId: definitionId('status:oos'), value: { kind: 'FLAG', value: false } },
      ],
    };
    const invalidSupply: PieceState = {
      ...supply,
      mode: 'MOVE',
      resourceQuantity: 99,
      location: carrier.location,
      stackOrder: carrier.stackOrder,
    };
    const invalid: PieceRuntimeState = {
      ...state,
      pieces: state.pieces.map((piece) => piece.id === carrier.id
        ? invalidCarrier
        : piece.id === supply.id ? invalidSupply : piece),
    };
    const codes = validatePieceRuntimeState(catalog(), invalid).map(({ code }) => code);

    expect(codes).toContain('UNKNOWN_FACE_REFERENCE');
    expect(codes).toContain('DUPLICATE_PIECE_STATUS');
    expect(codes).toContain('MODE_STATE_FAMILY_MISMATCH');
    expect(codes).toContain('RESOURCE_STATE_EXCEEDS_CAPACITY');
    expect(codes).toContain('DUPLICATE_STACK_ORDER');
  });
});
