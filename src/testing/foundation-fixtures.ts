import {
  formatHexId,
  hex,
  movementPoints,
  parseDefinitionId,
  parsePieceId,
  parsePlayerId,
  parseScenarioId,
  regimentalEquivalents,
  revision,
  schemaVersion,
  type DefinitionId,
  type HexId,
  type PieceId,
  type PlayerId,
  type Result,
} from '../core/index.js';
import {
  canonicalizeHexside,
  createAxialBounds,
  directedHexside,
  parseMapBoxId,
  parseMapTrackId,
  parsePiecePoolId,
  type HexDefinition,
  type MapDefinition,
  type PieceLocation,
} from '../domain/map/index.js';
import {
  parseCapabilityId,
  parseFaceId,
  type CapabilityDeclaration,
  type PieceDefinition,
  type PieceState,
} from '../domain/piece/index.js';
import type { ScenarioDefinition } from '../domain/scenario/index.js';

const must = <T, E>(result: Result<T, E>): T => {
  if (!result.ok) throw new Error('Foundation fixture contains an invalid literal.');
  return result.value;
};

const definitionId = (value: string): DefinitionId => must(parseDefinitionId(value));
const pieceId = (value: string): PieceId => must(parsePieceId(value));
const playerId = (value: string): PlayerId => must(parsePlayerId(value));
const hexId = (q: number, r: number): HexId => formatHexId(hex(q, r));

export interface FixtureIdFactory {
  readonly nextDefinitionId: (scope: string) => DefinitionId;
  readonly nextPieceId: (scope: string) => PieceId;
}

/** Deterministic, isolated counters; never reads time, entropy, or Math.random. */
export const createFixtureIdFactory = (namespace = 'fixture'): FixtureIdFactory => {
  let definitionSequence = 0;
  let pieceSequence = 0;
  return Object.freeze({
    nextDefinitionId: (scope: string) => definitionId(
      `${namespace}:definition:${scope}:${String(++definitionSequence).padStart(4, '0')}`,
    ),
    nextPieceId: (scope: string) => pieceId(
      `${namespace}:piece:${scope}:${String(++pieceSequence).padStart(4, '0')}`,
    ),
  });
};

export const buildHexDefinition = (
  q = 0,
  r = 0,
  overrides: Partial<HexDefinition> = {},
): HexDefinition => ({
  id: hexId(q, r),
  terrainDefinitionIds: [definitionId('terrain:plain')],
  features: [],
  ...overrides,
});

const defaultFaceId = must(parseFaceId('front'));

export const buildPieceDefinition = (
  overrides: Partial<PieceDefinition> = {},
): PieceDefinition => ({
  id: definitionId('piece-definition:fixture-ground'),
  family: 'GROUND',
  counter: null,
  name: 'Fixture ground unit',
  categoryDefinitionId: definitionId('category:ground'),
  ownership: {
    sideDefinitionId: definitionId('side:one'),
    factionDefinitionId: null,
    nationalityDefinitionId: null,
    formationDefinitionId: null,
    groupDefinitionId: null,
  },
  faces: [{
    id: defaultFaceId,
    name: 'Front',
    mobilityClassDefinitionId: definitionId('mobility:leg'),
    steps: [{
      remainingSteps: 1,
      combatStrength: 2,
      actionRating: 3,
      movementPointTicks: must(movementPoints(4)),
      regimentalEquivalentTicks: must(regimentalEquivalents(1)),
      range: 1,
      ratings: [],
    }],
  }],
  capabilities: [],
  resource: null,
  facility: null,
  marker: null,
  deferredClassification: null,
  source: { records: [{
    field: 'name',
    rawValue: 'Fixture ground unit',
    normalizedValue: 'Fixture ground unit',
    source: { document: 'synthetic-foundation-fixture', locator: 'piece-definition' },
    confidence: 'VERIFIED',
    reviewStatus: 'REVIEWED',
  }] },
  ...overrides,
});

const fixtureOwner = playerId('player:one');

export const buildPieceState = (
  overrides: Partial<PieceState> = {},
): PieceState => ({
  id: pieceId('piece:fixture-ground'),
  definitionId: definitionId('piece-definition:fixture-ground'),
  ownerId: fixtureOwner,
  location: { kind: 'ON_MAP', hexId: hexId(0, 0) },
  currentFaceId: defaultFaceId,
  remainingSteps: 1,
  mode: 'MOVE',
  statuses: [],
  stackOrder: 0,
  resourceQuantity: null,
  ...overrides,
});

const capability = (id: string): CapabilityDeclaration => ({
  id: must(parseCapabilityId(id)),
  parameters: [],
});

const groundDefinition = (
  id: string,
  name: string,
  overrides: Partial<PieceDefinition> = {},
): PieceDefinition => buildPieceDefinition({
  id: definitionId(`piece-definition:${id}`),
  name,
  source: { records: [{
    field: 'name', rawValue: name, normalizedValue: name,
    source: { document: 'synthetic-foundation-fixture', locator: id },
    confidence: 'VERIFIED', reviewStatus: 'REVIEWED',
  }] },
  ...overrides,
});

const createFixtureMap = (): MapDefinition => {
  const edge = (q: number, r: number) => must(canonicalizeHexside(directedHexside(hex(q, r), 'E'))).id;
  return {
    id: definitionId('map:foundation-5x5'),
    schemaVersion: must(schemaVersion(1)),
    bounds: must(createAxialBounds({ minQ: 0, maxQ: 4, minR: 0, maxR: 4 })),
    hexes: Array.from({ length: 25 }, (_, index) => {
      const q = index % 5;
      const r = Math.floor(index / 5);
      return buildHexDefinition(q, r, {
        features: q === 0 && r === 0
          ? [
            { kind: 'ENTRY', definitionId: definitionId('entry:west') },
            { kind: 'SOURCE', definitionId: definitionId('source:primary') },
          ]
          : [],
      });
    }),
    hexsides: [
      { hexsideId: edge(0, 0), featureDefinitionIds: [definitionId('edge:road')] },
      { hexsideId: edge(0, 1), featureDefinitionIds: [definitionId('edge:river')] },
      { hexsideId: edge(0, 2), featureDefinitionIds: [definitionId('edge:rail')] },
      {
        hexsideId: edge(0, 3),
        featureDefinitionIds: [definitionId('edge:river'), definitionId('edge:bridge')],
      },
    ],
    provenance: [{ document: 'synthetic-foundation-fixture', locator: '5x5-map' }],
    overrideDefinitionIds: [],
  };
};

const createFixtureDefinitions = (): readonly PieceDefinition[] => {
  const multiStep = groundDefinition('multi-step', 'Two-step infantry', {
    faces: [{
      id: defaultFaceId,
      name: 'Front',
      mobilityClassDefinitionId: definitionId('mobility:leg'),
      steps: [
        {
          remainingSteps: 2, combatStrength: 4, actionRating: 4,
          movementPointTicks: must(movementPoints(4)),
          regimentalEquivalentTicks: must(regimentalEquivalents(1)), range: 1, ratings: [],
        },
        {
          remainingSteps: 1, combatStrength: 2, actionRating: 4,
          movementPointTicks: must(movementPoints(4)),
          regimentalEquivalentTicks: must(regimentalEquivalents(0.5)), range: 1, ratings: [],
        },
      ],
    }],
  });
  const hq = groundDefinition('hq', 'Headquarters', { capabilities: [capability('HQ')] });
  const artillery = groundDefinition('artillery', 'Artillery', {
    capabilities: [capability('ARTILLERY')],
    faces: [{
      ...buildPieceDefinition().faces[0]!,
      steps: [{ ...buildPieceDefinition().faces[0]!.steps[0]!, range: 4 }],
    }],
  });
  const transport = groundDefinition('transport', 'Transport', {
    capabilities: [{
      id: must(parseCapabilityId('TRANSPORT_CAPACITY')),
      parameters: [{
        key: 'capacity', kind: 'EXACT_QUANTITY', value: 8,
        unitDefinitionId: definitionId('quantity:supply-token'),
      }],
    }],
  });
  const supply = groundDefinition('supply-dump', 'Supply dump', {
    family: 'RESOURCE',
    categoryDefinitionId: definitionId('category:resource'),
    faces: [],
    resource: {
      resourceDefinitionId: definitionId('resource:supply'),
      unitDefinitionId: definitionId('quantity:supply-token'),
      printedQuantity: 4,
      capacity: 8,
    },
  });
  return [
    groundDefinition('ground', 'Ground unit'),
    multiStep,
    hq,
    artillery,
    transport,
    supply,
  ];
};

const stateFor = (
  id: string,
  definition: string,
  location: PieceLocation,
  overrides: Partial<PieceState> = {},
): PieceState => buildPieceState({
  id: pieceId(`piece:${id}`),
  definitionId: definitionId(`piece-definition:${definition}`),
  location,
  ...overrides,
});

export interface FoundationFixtureIds {
  readonly transportPieceId: PieceId;
  readonly supplyPieceId: PieceId;
  readonly offMapBoxId: ReturnType<typeof parseMapBoxId> extends Result<infer T, unknown> ? T : never;
  readonly holdingBoxId: ReturnType<typeof parseMapBoxId> extends Result<infer T, unknown> ? T : never;
}

export const FOUNDATION_FIXTURE_IDS: FoundationFixtureIds = Object.freeze({
  transportPieceId: pieceId('piece:transport'),
  supplyPieceId: pieceId('piece:supply-dump'),
  offMapBoxId: must(parseMapBoxId('box:off-map')),
  holdingBoxId: must(parseMapBoxId('box:holding')),
});

export const createFoundationScenarioFixture = (
  overrides: Partial<ScenarioDefinition> = {},
): ScenarioDefinition => {
  const mapDefinition = createFixtureMap();
  const definitions = createFixtureDefinitions();
  const pieces: readonly PieceState[] = [
    stateFor('ground', 'ground', { kind: 'ON_MAP', hexId: hexId(1, 1) }),
    stateFor('multi-step', 'multi-step', { kind: 'ON_MAP', hexId: hexId(2, 1) }, { remainingSteps: 2 }),
    stateFor('hq', 'hq', { kind: 'OFF_MAP_BOX', boxId: FOUNDATION_FIXTURE_IDS.offMapBoxId }),
    stateFor('artillery', 'artillery', { kind: 'HOLDING_AREA', boxId: FOUNDATION_FIXTURE_IDS.holdingBoxId }),
    stateFor('transport', 'transport', { kind: 'ON_MAP', hexId: hexId(2, 2) }),
    stateFor('supply-dump', 'supply-dump', {
      kind: 'CONTAINER', containerId: FOUNDATION_FIXTURE_IDS.transportPieceId,
    }, {
      currentFaceId: null, remainingSteps: null, mode: null, resourceQuantity: 4,
    }),
  ];
  const firstPlayer = fixtureOwner;
  const secondPlayer = playerId('player:two');
  const scenario: ScenarioDefinition = {
    id: must(parseScenarioId('scenario:foundation-fixture')),
    schemaVersion: must(schemaVersion(1)),
    mapDefinition,
    initialMapState: {
      schemaVersion: must(schemaVersion(1)), revision: must(revision(0)),
      hexControl: [{ hexId: hexId(0, 0), controllerId: firstPlayer }], features: [],
    },
    pieceCatalog: {
      id: definitionId('catalog:foundation-fixture'), schemaVersion: must(schemaVersion(1)),
      definitions,
      provenance: [{ document: 'synthetic-foundation-fixture', locator: 'catalog' }],
    },
    initialPieceState: {
      schemaVersion: must(schemaVersion(1)), revision: must(revision(0)), pieces,
      relations: [{
        kind: 'CARGO', cargoId: FOUNDATION_FIXTURE_IDS.supplyPieceId,
        containerId: FOUNDATION_FIXTURE_IDS.transportPieceId, loadQuantity: 4,
        unitDefinitionId: definitionId('quantity:supply-token'),
      }],
    },
    players: [
      { id: firstPlayer, sideDefinitionId: definitionId('side:one'), name: 'One' },
      { id: secondPlayer, sideDefinitionId: definitionId('side:two'), name: 'Two' },
    ],
    turnStart: { turn: 1, firstPlayerId: firstPlayer },
    boxes: [
      { id: FOUNDATION_FIXTURE_IDS.offMapBoxId, kind: 'OFF_MAP', name: 'Off-map', linkedHexId: hexId(0, 0) },
      { id: FOUNDATION_FIXTURE_IDS.holdingBoxId, kind: 'HOLDING', name: 'Holding', linkedHexId: null },
    ],
    tracks: [{
      id: must(parseMapTrackId('track:turn')), name: 'Turn',
      minimumPosition: 0, maximumPosition: 20,
    }],
    pools: [{ id: must(parsePiecePoolId('pool:available')), name: 'Available' }],
    entries: [{ id: definitionId('entry:west'), hexId: hexId(0, 0), sideDefinitionId: definitionId('side:one') }],
    sources: [{ id: definitionId('source:primary'), hexId: hexId(0, 0), sideDefinitionId: null }],
    configuration: {
      optionDefinitionIds: [definitionId('option:standard')],
      weatherDefinitionId: definitionId('weather:clear'),
      tableDefinitionIds: [definitionId('table:terrain-effects')],
    },
    externalTables: [{
      definitionId: definitionId('table:terrain-effects'),
      source: { document: 'synthetic-foundation-fixture', locator: 'table' },
    }],
    provenance: [{ document: 'synthetic-foundation-fixture', locator: 'scenario' }],
    generatorMetadata: null,
  };
  return { ...scenario, ...overrides };
};

export interface MalformedFoundationFixture {
  readonly name: string;
  readonly scenario: ScenarioDefinition;
  readonly expectedCode: string;
}

export const createMalformedFoundationFixtures = (): readonly MalformedFoundationFixture[] => {
  const source = createFoundationScenarioFixture();
  const firstPiece = source.initialPieceState.pieces[0]!;
  return [
    {
      name: 'unknown on-map Hex',
      scenario: {
        ...source,
        initialPieceState: {
          ...source.initialPieceState,
          pieces: source.initialPieceState.pieces.map((piece) => piece.id === firstPiece.id
            ? { ...piece, location: { kind: 'ON_MAP', hexId: hexId(99, 99) } }
            : piece),
        },
      },
      expectedCode: 'UNKNOWN_SCENARIO_HEX',
    },
    {
      name: 'unknown Piece Definition',
      scenario: {
        ...source,
        initialPieceState: {
          ...source.initialPieceState,
          pieces: source.initialPieceState.pieces.map((piece) => piece.id === firstPiece.id
            ? { ...piece, definitionId: definitionId('piece-definition:missing') }
            : piece),
        },
      },
      expectedCode: 'UNKNOWN_PIECE_DEFINITION',
    },
    {
      name: 'duplicate Piece ID',
      scenario: {
        ...source,
        initialPieceState: {
          ...source.initialPieceState,
          pieces: [...source.initialPieceState.pieces, firstPiece],
        },
      },
      expectedCode: 'DUPLICATE_PIECE_ID',
    },
    {
      name: 'missing external Table source',
      scenario: { ...source, externalTables: [] },
      expectedCode: 'MISSING_EXTERNAL_TABLE_REFERENCE',
    },
  ];
};
