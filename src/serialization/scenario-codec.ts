import {
  FOUNDATION_SCHEMA_VERSION,
  err,
  movementPointTicks,
  ok,
  parseDefinitionId,
  parseHexCoordinateId,
  parsePieceId,
  parsePlayerId,
  parseScenarioId,
  regimentalEquivalentTicks,
  revision,
  schemaVersion,
  type DefinitionId,
  type HexId,
  type PieceId,
  type PlayerId,
  type Result,
  type Revision,
  type ScenarioId,
  type SchemaVersion,
  type SourceReference,
  type TypedDataValue,
  type ValidationIssue,
} from '../core/index.js';
import {
  parseMapBoxId,
  parseMapFeatureStateId,
  parseMapTrackId,
  parsePiecePoolId,
  parseHexsideId,
  type AxialBounds,
  type HexControlState,
  type HexDefinition,
  type HexFeatureRef,
  type HexsideFeatureCollection,
  type HexsideId,
  type MapBoxId,
  type MapDefinition,
  type MapFeatureLocation,
  type MapFeatureState,
  type MapFeatureStateId,
  type MapState,
  type MapTrackId,
  type PieceLocation,
  type PiecePoolId,
} from '../domain/map/index.js';
import {
  OCS_MODES,
  PIECE_FAMILIES,
  parseCapabilityId,
  parseFaceId,
  type CapabilityDeclaration,
  type CounterDefinition,
  type CapabilityId,
  type CapabilityParameter,
  type FacilityDefinitionProfile,
  type FaceId,
  type MarkerDefinitionProfile,
  type NormalizationEvidence,
  type PieceDefinition,
  type PieceDefinitionCatalog,
  type PieceDefinitionSource,
  type PieceFaceDefinition,
  type PieceOwnershipDefinition,
  type PieceRelation,
  type PieceRuntimeState,
  type PieceState,
  type PieceStatusState,
  type PieceStepProfile,
  type PrintedRating,
  type ResourceDefinitionProfile,
} from '../domain/piece/index.js';
import {
  validateScenarioDefinition,
  type ScenarioBoxDefinition,
  type ScenarioConfiguration,
  type ScenarioDefinition,
  type ScenarioEntryDeclaration,
  type ScenarioExternalTableReference,
  type ScenarioGeneratorMetadata,
  type ScenarioGeneratorSeed,
  type ScenarioPlayer,
  type ScenarioPoolDefinition,
  type ScenarioSourceDeclaration,
  type ScenarioTrackDefinition,
  type ScenarioTurnStart,
} from '../domain/scenario/index.js';
import {
  arrayDecoder,
  booleanDecoder,
  decoder,
  literalDecoder,
  nullableDecoder,
  numberDecoder,
  objectDecoder,
  optionalDecoder,
  refinedDecoder,
  safeIntegerDecoder,
  stringDecoder,
  taggedUnionDecoder,
  type Decoder,
} from './decoder.js';

const brandedString = <T extends string>(
  validate: (value: string) => boolean,
  label: string,
): Decoder<T> => refinedDecoder(
  stringDecoder,
  (value) => validate(value) ? ok(value as T) : err(undefined),
  'INVALID_SCHEMA_ID',
  (value) => `Invalid ${label}: ${value}.`,
);

const fromParser = <T extends string, E>(
  parse: (value: string) => Result<T, E>,
  label: string,
): Decoder<T> => refinedDecoder(
  stringDecoder,
  parse,
  'INVALID_SCHEMA_ID',
  (value) => `Invalid ${label}: ${value}.`,
);

const definitionIdDecoder = fromParser(parseDefinitionId, 'Definition ID');
const pieceIdDecoder = fromParser(parsePieceId, 'Piece ID');
const playerIdDecoder = fromParser(parsePlayerId, 'Player ID');
const scenarioIdDecoder = fromParser(parseScenarioId, 'Scenario ID');
const faceIdDecoder = fromParser(parseFaceId, 'Face ID');
const capabilityIdDecoder = fromParser(parseCapabilityId, 'Capability ID');
const mapBoxIdDecoder = fromParser(parseMapBoxId, 'Map Box ID');
const mapTrackIdDecoder = fromParser(parseMapTrackId, 'Map Track ID');
const piecePoolIdDecoder = fromParser(parsePiecePoolId, 'Piece Pool ID');
const mapFeatureStateIdDecoder = fromParser(parseMapFeatureStateId, 'Map Feature State ID');
const hexIdDecoder = brandedString<HexId>((value) => parseHexCoordinateId(value).ok, 'Hex ID');
const hexsideIdDecoder = brandedString<HexsideId>((value) => parseHexsideId(value).ok, 'Hexside ID');
const schemaVersionDecoder = refinedDecoder(
  safeIntegerDecoder,
  schemaVersion,
  'INVALID_SCHEMA_VERSION',
  (value) => `Invalid schema version: ${value}.`,
);
const revisionDecoder = refinedDecoder(
  safeIntegerDecoder,
  revision,
  'INVALID_REVISION',
  (value) => `Invalid revision: ${value}.`,
);
const movementTickDecoder = refinedDecoder(
  safeIntegerDecoder,
  movementPointTicks,
  'INVALID_MOVEMENT_TICKS',
  (value) => `Invalid movement ticks: ${value}.`,
);
const reTickDecoder = refinedDecoder(
  safeIntegerDecoder,
  regimentalEquivalentTicks,
  'INVALID_RE_TICKS',
  (value) => `Invalid RE ticks: ${value}.`,
);

const sourceRecordDecoder = objectDecoder({
  document: stringDecoder,
  locator: stringDecoder,
  note: optionalDecoder(stringDecoder),
});

const sourceReferenceDecoder: Decoder<SourceReference> = decoder((input, path = []) => {
  const decoded = sourceRecordDecoder.decode(input, path);
  if (!decoded.ok) return decoded;
  return ok(decoded.value.note === undefined
    ? { document: decoded.value.document, locator: decoded.value.locator }
    : { document: decoded.value.document, locator: decoded.value.locator, note: decoded.value.note });
});

const typedDataValueDecoder: Decoder<TypedDataValue> = taggedUnionDecoder<TypedDataValue>('kind', {
  FLAG: objectDecoder({ kind: literalDecoder('FLAG'), value: booleanDecoder }),
  INTEGER: objectDecoder({ kind: literalDecoder('INTEGER'), value: safeIntegerDecoder }),
  TEXT: objectDecoder({ kind: literalDecoder('TEXT'), value: stringDecoder }),
  DEFINITION_ID: objectDecoder({ kind: literalDecoder('DEFINITION_ID'), value: definitionIdDecoder }),
  EXACT_QUANTITY: objectDecoder({
    kind: literalDecoder('EXACT_QUANTITY'),
    value: safeIntegerDecoder,
    unitDefinitionId: definitionIdDecoder,
  }),
});

const axialBoundsDecoder: Decoder<AxialBounds> = objectDecoder({
  minQ: safeIntegerDecoder,
  maxQ: safeIntegerDecoder,
  minR: safeIntegerDecoder,
  maxR: safeIntegerDecoder,
});

const hexFeatureRefDecoder: Decoder<HexFeatureRef> = objectDecoder({
  kind: literalDecoder('PRINTED_FEATURE', 'FACILITY', 'SOURCE', 'ENTRY'),
  definitionId: definitionIdDecoder,
});

const hexDefinitionDecoder: Decoder<HexDefinition> = objectDecoder({
  id: hexIdDecoder,
  terrainDefinitionIds: arrayDecoder(definitionIdDecoder),
  features: arrayDecoder(hexFeatureRefDecoder),
});

const hexsideFeatureCollectionDecoder: Decoder<HexsideFeatureCollection> = objectDecoder({
  hexsideId: hexsideIdDecoder,
  featureDefinitionIds: arrayDecoder(definitionIdDecoder),
});

const mapDefinitionDecoder: Decoder<MapDefinition> = objectDecoder({
  id: definitionIdDecoder,
  schemaVersion: schemaVersionDecoder,
  bounds: axialBoundsDecoder,
  hexes: arrayDecoder(hexDefinitionDecoder),
  hexsides: arrayDecoder(hexsideFeatureCollectionDecoder),
  provenance: arrayDecoder(sourceReferenceDecoder),
  overrideDefinitionIds: arrayDecoder(definitionIdDecoder),
});

const mapFeatureLocationDecoder: Decoder<MapFeatureLocation> = taggedUnionDecoder<MapFeatureLocation>('kind', {
  HEX: objectDecoder({ kind: literalDecoder('HEX'), hexId: hexIdDecoder }),
  HEXSIDE: objectDecoder({ kind: literalDecoder('HEXSIDE'), hexsideId: hexsideIdDecoder }),
});

const mapFeatureStateDecoder: Decoder<MapFeatureState> = objectDecoder({
  id: mapFeatureStateIdDecoder,
  kind: literalDecoder('PRINTED_FEATURE', 'FACILITY', 'SOURCE', 'ENTRY', 'HEXSIDE_FEATURE'),
  definitionId: definitionIdDecoder,
  location: mapFeatureLocationDecoder,
  statusDefinitionIds: arrayDecoder(definitionIdDecoder),
  controllerId: nullableDecoder(playerIdDecoder),
  level: safeIntegerDecoder,
  damage: safeIntegerDecoder,
});

const hexControlStateDecoder: Decoder<HexControlState> = objectDecoder({
  hexId: hexIdDecoder,
  controllerId: nullableDecoder(playerIdDecoder),
});

const mapStateDecoder: Decoder<MapState> = objectDecoder({
  schemaVersion: schemaVersionDecoder,
  revision: revisionDecoder,
  hexControl: arrayDecoder(hexControlStateDecoder),
  features: arrayDecoder(mapFeatureStateDecoder),
});

const ownershipDecoder: Decoder<PieceOwnershipDefinition> = objectDecoder({
  sideDefinitionId: nullableDecoder(definitionIdDecoder),
  factionDefinitionId: nullableDecoder(definitionIdDecoder),
  nationalityDefinitionId: nullableDecoder(definitionIdDecoder),
  formationDefinitionId: nullableDecoder(definitionIdDecoder),
  groupDefinitionId: nullableDecoder(definitionIdDecoder),
});

const finiteNumberOrStringDecoder: Decoder<number | string> = {
  decode: (input, path = []) => typeof input === 'string'
    ? ok(input)
    : numberDecoder.decode(input, path),
};

const actualPrintedRatingDecoder: Decoder<PrintedRating> = objectDecoder({
  ratingDefinitionId: definitionIdDecoder,
  value: finiteNumberOrStringDecoder,
});

const stepProfileDecoder: Decoder<PieceStepProfile> = objectDecoder({
  remainingSteps: safeIntegerDecoder,
  combatStrength: nullableDecoder(numberDecoder),
  actionRating: nullableDecoder(safeIntegerDecoder),
  movementPointTicks: nullableDecoder(movementTickDecoder),
  regimentalEquivalentTicks: nullableDecoder(reTickDecoder),
  range: nullableDecoder(safeIntegerDecoder),
  ratings: arrayDecoder(actualPrintedRatingDecoder),
});

const faceDecoder: Decoder<PieceFaceDefinition> = objectDecoder({
  id: faceIdDecoder,
  name: stringDecoder,
  mobilityClassDefinitionId: nullableDecoder(definitionIdDecoder),
  steps: arrayDecoder(stepProfileDecoder),
});

const capabilityParameterDecoder: Decoder<CapabilityParameter> = taggedUnionDecoder<CapabilityParameter>('kind', {
  FLAG: objectDecoder({ key: stringDecoder, kind: literalDecoder('FLAG'), value: booleanDecoder }),
  INTEGER: objectDecoder({ key: stringDecoder, kind: literalDecoder('INTEGER'), value: safeIntegerDecoder }),
  TEXT: objectDecoder({ key: stringDecoder, kind: literalDecoder('TEXT'), value: stringDecoder }),
  DEFINITION_ID: objectDecoder({ key: stringDecoder, kind: literalDecoder('DEFINITION_ID'), value: definitionIdDecoder }),
  EXACT_QUANTITY: objectDecoder({
    key: stringDecoder,
    kind: literalDecoder('EXACT_QUANTITY'),
    value: safeIntegerDecoder,
    unitDefinitionId: definitionIdDecoder,
  }),
});

const capabilityDecoder: Decoder<CapabilityDeclaration> = objectDecoder({
  id: capabilityIdDecoder,
  parameters: arrayDecoder(capabilityParameterDecoder),
});

const resourceProfileDecoder: Decoder<ResourceDefinitionProfile> = objectDecoder({
  resourceDefinitionId: definitionIdDecoder,
  unitDefinitionId: definitionIdDecoder,
  printedQuantity: safeIntegerDecoder,
  capacity: safeIntegerDecoder,
});

const facilityProfileDecoder: Decoder<FacilityDefinitionProfile> = objectDecoder({
  facilityTypeDefinitionId: definitionIdDecoder,
});

const markerProfileDecoder: Decoder<MarkerDefinitionProfile> = objectDecoder({
  markerTypeDefinitionId: definitionIdDecoder,
});

const evidenceDecoder: Decoder<NormalizationEvidence> = objectDecoder({
  field: stringDecoder,
  rawValue: stringDecoder,
  normalizedValue: stringDecoder,
  source: sourceReferenceDecoder,
  confidence: literalDecoder('UNVERIFIED', 'LOW', 'MEDIUM', 'HIGH', 'VERIFIED'),
  reviewStatus: literalDecoder('UNREVIEWED', 'NEEDS_REVIEW', 'REVIEWED', 'REJECTED'),
});

const pieceDefinitionSourceDecoder: Decoder<PieceDefinitionSource> = objectDecoder({
  records: arrayDecoder(evidenceDecoder),
});

const counterDecoder: Decoder<CounterDefinition> = objectDecoder({
  kind: literalDecoder('COMBAT', 'ARTILLERY', 'HQ', 'TRANSPORT', 'SUPPLY'),
  symbol: literalDecoder('INFANTRY', 'ARMOR', 'GLIDER', 'RECON', 'ARTILLERY', 'SP_ARTILLERY', 'ENGINEER', 'HQ', 'TRUCK', 'SUPPLY'),
  designation: stringDecoder,
  affiliation: stringDecoder,
  echelon: stringDecoder,
  nationality: literalDecoder('US', 'GERMAN'),
  combatCategory: literalDecoder('ARMOR', 'MECH', 'OTHER'),
  formationColor: nullableDecoder(stringDecoder),
  defensiveOnly: booleanDecoder,
  rebuildable: booleanDecoder,
  showRe: booleanDecoder,
  transportPoints: nullableDecoder(numberDecoder),
});

const pieceDefinitionDecoder: Decoder<PieceDefinition> = objectDecoder({
  counter: nullableDecoder(counterDecoder),
  id: definitionIdDecoder,
  family: literalDecoder(...PIECE_FAMILIES),
  name: stringDecoder,
  categoryDefinitionId: definitionIdDecoder,
  ownership: ownershipDecoder,
  faces: arrayDecoder(faceDecoder),
  capabilities: arrayDecoder(capabilityDecoder),
  resource: nullableDecoder(resourceProfileDecoder),
  facility: nullableDecoder(facilityProfileDecoder),
  marker: nullableDecoder(markerProfileDecoder),
  deferredClassification: nullableDecoder(stringDecoder),
  source: pieceDefinitionSourceDecoder,
});

const catalogDecoder: Decoder<PieceDefinitionCatalog> = objectDecoder({
  id: definitionIdDecoder,
  schemaVersion: schemaVersionDecoder,
  definitions: arrayDecoder(pieceDefinitionDecoder),
  provenance: arrayDecoder(sourceReferenceDecoder),
});

const pieceLocationDecoder: Decoder<PieceLocation> = taggedUnionDecoder<PieceLocation>('kind', {
  ON_MAP: objectDecoder({ kind: literalDecoder('ON_MAP'), hexId: hexIdDecoder }),
  OFF_MAP_BOX: objectDecoder({ kind: literalDecoder('OFF_MAP_BOX'), boxId: mapBoxIdDecoder }),
  HOLDING_AREA: objectDecoder({ kind: literalDecoder('HOLDING_AREA'), boxId: mapBoxIdDecoder }),
  TURN_TRACK: objectDecoder({ kind: literalDecoder('TURN_TRACK'), trackId: mapTrackIdDecoder, position: safeIntegerDecoder }),
  POOL: objectDecoder({ kind: literalDecoder('POOL'), poolId: piecePoolIdDecoder }),
  ELIMINATED: objectDecoder({ kind: literalDecoder('ELIMINATED') }),
  CONTAINER: objectDecoder({ kind: literalDecoder('CONTAINER'), containerId: pieceIdDecoder }),
});

const pieceStatusDecoder: Decoder<PieceStatusState> = objectDecoder({
  statusDefinitionId: definitionIdDecoder,
  value: typedDataValueDecoder,
});

const pieceStateDecoder: Decoder<PieceState> = objectDecoder({
  id: pieceIdDecoder,
  definitionId: definitionIdDecoder,
  ownerId: playerIdDecoder,
  location: pieceLocationDecoder,
  currentFaceId: nullableDecoder(faceIdDecoder),
  remainingSteps: nullableDecoder(safeIntegerDecoder),
  mode: nullableDecoder(literalDecoder(...OCS_MODES)),
  statuses: arrayDecoder(pieceStatusDecoder),
  stackOrder: safeIntegerDecoder,
  resourceQuantity: nullableDecoder(safeIntegerDecoder),
});

const pieceRelationDecoder: Decoder<PieceRelation> = taggedUnionDecoder<PieceRelation>('kind', {
  CARGO: objectDecoder({
    kind: literalDecoder('CARGO'),
    cargoId: pieceIdDecoder,
    containerId: pieceIdDecoder,
    loadQuantity: safeIntegerDecoder,
    unitDefinitionId: definitionIdDecoder,
  }),
  ATTACHMENT: objectDecoder({ kind: literalDecoder('ATTACHMENT'), childId: pieceIdDecoder, parentId: pieceIdDecoder }),
  PARENT: objectDecoder({ kind: literalDecoder('PARENT'), childId: pieceIdDecoder, parentId: pieceIdDecoder }),
  GROUP_MEMBERSHIP: objectDecoder({ kind: literalDecoder('GROUP_MEMBERSHIP'), memberId: pieceIdDecoder, groupDefinitionId: definitionIdDecoder }),
  FORMATION_MEMBERSHIP: objectDecoder({ kind: literalDecoder('FORMATION_MEMBERSHIP'), memberId: pieceIdDecoder, formationDefinitionId: definitionIdDecoder }),
});

const pieceRuntimeStateDecoder: Decoder<PieceRuntimeState> = objectDecoder({
  schemaVersion: schemaVersionDecoder,
  revision: revisionDecoder,
  pieces: arrayDecoder(pieceStateDecoder),
  relations: arrayDecoder(pieceRelationDecoder),
});

const playerDecoder: Decoder<ScenarioPlayer> = objectDecoder({
  id: playerIdDecoder,
  sideDefinitionId: definitionIdDecoder,
  name: stringDecoder,
});

const turnStartDecoder: Decoder<ScenarioTurnStart> = objectDecoder({
  turn: safeIntegerDecoder,
  firstPlayerId: playerIdDecoder,
});

const boxDecoder: Decoder<ScenarioBoxDefinition> = objectDecoder({
  id: mapBoxIdDecoder,
  kind: literalDecoder('OFF_MAP', 'HOLDING'),
  name: stringDecoder,
  linkedHexId: nullableDecoder(hexIdDecoder),
});

const trackDecoder: Decoder<ScenarioTrackDefinition> = objectDecoder({
  id: mapTrackIdDecoder,
  name: stringDecoder,
  minimumPosition: safeIntegerDecoder,
  maximumPosition: safeIntegerDecoder,
});

const poolDecoder: Decoder<ScenarioPoolDefinition> = objectDecoder({
  id: piecePoolIdDecoder,
  name: stringDecoder,
});

const entryDecoder: Decoder<ScenarioEntryDeclaration> = objectDecoder({
  id: definitionIdDecoder,
  hexId: hexIdDecoder,
  sideDefinitionId: nullableDecoder(definitionIdDecoder),
});

const sourceDecoder: Decoder<ScenarioSourceDeclaration> = objectDecoder({
  id: definitionIdDecoder,
  hexId: hexIdDecoder,
  sideDefinitionId: nullableDecoder(definitionIdDecoder),
});

const configurationDecoder: Decoder<ScenarioConfiguration> = objectDecoder({
  optionDefinitionIds: arrayDecoder(definitionIdDecoder),
  weatherDefinitionId: definitionIdDecoder,
  tableDefinitionIds: arrayDecoder(definitionIdDecoder),
});

const tableDecoder: Decoder<ScenarioExternalTableReference> = objectDecoder({
  definitionId: definitionIdDecoder,
  source: sourceReferenceDecoder,
});

const seedDecoder: Decoder<ScenarioGeneratorSeed> = objectDecoder({
  kind: stringDecoder,
  value: stringDecoder,
});

const generatorMetadataDecoder: Decoder<ScenarioGeneratorMetadata> = objectDecoder({
  generatorDefinitionId: definitionIdDecoder,
  version: stringDecoder,
  seeds: arrayDecoder(seedDecoder),
});

export const scenarioDefinitionDecoder: Decoder<ScenarioDefinition> = objectDecoder({
  id: scenarioIdDecoder,
  schemaVersion: schemaVersionDecoder,
  mapDefinition: mapDefinitionDecoder,
  initialMapState: mapStateDecoder,
  pieceCatalog: catalogDecoder,
  initialPieceState: pieceRuntimeStateDecoder,
  players: arrayDecoder(playerDecoder),
  turnStart: turnStartDecoder,
  boxes: arrayDecoder(boxDecoder),
  tracks: arrayDecoder(trackDecoder),
  pools: arrayDecoder(poolDecoder),
  entries: arrayDecoder(entryDecoder),
  sources: arrayDecoder(sourceDecoder),
  configuration: configurationDecoder,
  externalTables: arrayDecoder(tableDecoder),
  provenance: arrayDecoder(sourceReferenceDecoder),
  generatorMetadata: nullableDecoder(generatorMetadataDecoder),
});

const unsupportedVersionIssues = (scenario: ScenarioDefinition): readonly ValidationIssue[] => [
  ['schemaVersion', scenario.schemaVersion, 'ScenarioDefinition'],
  ['mapDefinition.schemaVersion', scenario.mapDefinition.schemaVersion, 'MapDefinition'],
  ['initialMapState.schemaVersion', scenario.initialMapState.schemaVersion, 'MapState'],
  ['pieceCatalog.schemaVersion', scenario.pieceCatalog.schemaVersion, 'PieceDefinitionCatalog'],
  ['initialPieceState.schemaVersion', scenario.initialPieceState.schemaVersion, 'PieceRuntimeState'],
].flatMap(([path, version, aggregate]) => version === FOUNDATION_SCHEMA_VERSION
  ? []
  : [{
    code: 'UNSUPPORTED_SCHEMA_VERSION',
    path: String(path).split('.'),
    severity: 'ERROR' as const,
    message: `${aggregate} schema ${version} is unsupported; expected ${FOUNDATION_SCHEMA_VERSION}.`,
  }]);

export const parseScenarioDefinition = (
  input: unknown,
): Result<ScenarioDefinition, readonly ValidationIssue[]> => {
  const decoded = scenarioDefinitionDecoder.decode(input);
  if (!decoded.ok) return decoded;
  const issues = [
    ...unsupportedVersionIssues(decoded.value),
    ...validateScenarioDefinition(decoded.value),
  ];
  return issues.length > 0 ? err(issues) : ok(decoded.value);
};

export const parseScenarioJson = (
  text: string,
): Result<ScenarioDefinition, readonly ValidationIssue[]> => {
  let input: unknown;
  try {
    input = JSON.parse(text) as unknown;
  } catch {
    return err([{
      code: 'INVALID_JSON',
      path: [],
      severity: 'ERROR',
      message: 'Input is not valid JSON.',
    }]);
  }
  return parseScenarioDefinition(input);
};
