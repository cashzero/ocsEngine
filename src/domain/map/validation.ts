import {
  duplicateKeys,
  parseDefinitionId,
  parseHexCoordinateId,
  parsePlayerId,
  revision,
  schemaVersion,
  stableKey,
  type DefinitionId,
  type ValidationIssue,
} from '../../core/index.js';
import { axialBoundsContain, createAxialBounds } from './bounds.js';
import { createMapDefinitionIndex, type MapDefinitionIndex } from './map-index.js';
import {
  parseHexsideId,
  type HexsideFeatureCollection,
} from './location/index.js';
import {
  parseMapFeatureStateId,
  type HexDefinition,
  type MapDefinition,
  type MapFeatureLocation,
  type MapFeatureState,
  type MapState,
} from './model.js';

const error = (
  code: string,
  path: readonly (string | number)[],
  message: string,
): ValidationIssue => ({ code, path, severity: 'ERROR', message });

const validateDefinitionReference = (
  value: DefinitionId,
  path: readonly (string | number)[],
): readonly ValidationIssue[] => parseDefinitionId(value).ok
  ? []
  : [error('INVALID_DEFINITION_REFERENCE', path, `Invalid Definition ID: ${value}.`)];

const validateHexDefinition = (
  definition: HexDefinition,
  index: number,
  map: MapDefinition,
): readonly ValidationIssue[] => {
  const path = ['hexes', index] as const;
  const issues: ValidationIssue[] = [];
  const coordinate = parseHexCoordinateId(definition.id);
  if (!coordinate.ok) {
    issues.push(error('INVALID_HEX_REFERENCE', [...path, 'id'], `Invalid Hex ID: ${definition.id}.`));
  } else if (!axialBoundsContain(map.bounds, coordinate.value)) {
    issues.push(error(
      'HEX_OUTSIDE_BOUNDS',
      [...path, 'id'],
      `Hex ${definition.id} lies outside the declared axial bounds.`,
    ));
  }

  if (definition.terrainDefinitionIds.length === 0) {
    issues.push(error(
      'MISSING_BASE_TERRAIN',
      [...path, 'terrainDefinitionIds'],
      `Hex ${definition.id} must declare at least one terrain layer.`,
    ));
  }
  for (const duplicate of duplicateKeys(definition.terrainDefinitionIds, String)) {
    issues.push(error(
      'DUPLICATE_HEX_FEATURE',
      [...path, 'terrainDefinitionIds'],
      `Hex ${definition.id} repeats terrain Definition ${duplicate}.`,
    ));
  }
  definition.terrainDefinitionIds.forEach((definitionId, featureIndex) => {
    issues.push(...validateDefinitionReference(
      definitionId,
      [...path, 'terrainDefinitionIds', featureIndex],
    ));
  });

  for (const duplicate of duplicateKeys(
    definition.features,
    ({ kind, definitionId }) => stableKey([kind, definitionId]),
  )) {
    issues.push(error(
      'DUPLICATE_HEX_FEATURE',
      [...path, 'features'],
      `Hex ${definition.id} repeats feature key ${duplicate}.`,
    ));
  }
  definition.features.forEach((feature, featureIndex) => {
    issues.push(...validateDefinitionReference(
      feature.definitionId,
      [...path, 'features', featureIndex, 'definitionId'],
    ));
  });
  return issues;
};

const validateHexsideDefinition = (
  definition: HexsideFeatureCollection,
  index: number,
  hexIds: ReadonlySet<string>,
): readonly ValidationIssue[] => {
  const path = ['hexsides', index] as const;
  const issues: ValidationIssue[] = [];
  const parsed = parseHexsideId(definition.hexsideId);
  if (!parsed.ok) {
    issues.push(error(
      'INVALID_HEXSIDE_REFERENCE',
      [...path, 'hexsideId'],
      `Invalid canonical Hexside ID: ${definition.hexsideId}.`,
    ));
  } else {
    const missing = [parsed.value.firstHexId, parsed.value.secondHexId]
      .filter((hexId) => !hexIds.has(hexId));
    if (missing.length === 2) {
      issues.push(error(
        'ORPHAN_HEXSIDE',
        [...path, 'hexsideId'],
        `Hexside ${definition.hexsideId} has no endpoint in the map.`,
      ));
    } else if (missing.length === 1) {
      issues.push(error(
        'MISSING_HEXSIDE_ENDPOINT',
        [...path, 'hexsideId'],
        `Hexside ${definition.hexsideId} references missing Hex ${missing[0]}.`,
      ));
    }
  }

  for (const duplicate of duplicateKeys(definition.featureDefinitionIds, String)) {
    issues.push(error(
      'DUPLICATE_HEXSIDE_FEATURE',
      [...path, 'featureDefinitionIds'],
      `Hexside ${definition.hexsideId} repeats feature Definition ${duplicate}.`,
    ));
  }
  definition.featureDefinitionIds.forEach((definitionId, featureIndex) => {
    issues.push(...validateDefinitionReference(
      definitionId,
      [...path, 'featureDefinitionIds', featureIndex],
    ));
  });
  return issues;
};

export const validateMapDefinition = (
  definition: MapDefinition,
): readonly ValidationIssue[] => {
  const issues: ValidationIssue[] = [];
  issues.push(...validateDefinitionReference(definition.id, ['id']));
  if (!schemaVersion(definition.schemaVersion).ok) {
    issues.push(error('INVALID_MAP_SCHEMA_VERSION', ['schemaVersion'], 'MapDefinition schema version is invalid.'));
  }
  if (!createAxialBounds(definition.bounds).ok) {
    issues.push(error('INVALID_MAP_BOUNDS', ['bounds'], 'Map axial bounds are invalid.'));
  }

  for (const duplicate of duplicateKeys(definition.hexes, ({ id }) => id)) {
    issues.push(error('DUPLICATE_HEX_ID', ['hexes'], `Duplicate Hex ID: ${duplicate}.`));
  }
  definition.hexes.forEach((hexDefinition, index) => {
    issues.push(...validateHexDefinition(hexDefinition, index, definition));
  });

  const hexIds = new Set(definition.hexes.map(({ id }) => id));
  for (const duplicate of duplicateKeys(definition.hexsides, ({ hexsideId }) => hexsideId)) {
    issues.push(error(
      'DUPLICATE_HEXSIDE_ID',
      ['hexsides'],
      `Duplicate Hexside ID: ${duplicate}.`,
    ));
  }
  definition.hexsides.forEach((hexside, index) => {
    issues.push(...validateHexsideDefinition(hexside, index, hexIds));
  });

  for (const duplicate of duplicateKeys(definition.overrideDefinitionIds, String)) {
    issues.push(error(
      'DUPLICATE_MAP_OVERRIDE',
      ['overrideDefinitionIds'],
      `Duplicate map override Definition ${duplicate}.`,
    ));
  }
  definition.overrideDefinitionIds.forEach((definitionId, index) => {
    issues.push(...validateDefinitionReference(definitionId, ['overrideDefinitionIds', index]));
  });
  definition.provenance.forEach((source, index) => {
    if (source.document.trim().length === 0 || source.locator.trim().length === 0) {
      issues.push(error(
        'INVALID_MAP_PROVENANCE',
        ['provenance', index],
        'Map provenance requires non-empty document and locator values.',
      ));
    }
  });
  return issues;
};

const validateFeatureLocation = (
  location: MapFeatureLocation,
  featureIndex: number,
  mapIndex: MapDefinitionIndex,
): readonly ValidationIssue[] => {
  if (location.kind === 'HEX') {
    return parseHexCoordinateId(location.hexId).ok && mapIndex.getHex(location.hexId)
      ? []
      : [error(
        'ORPHAN_MAP_STATE_REFERENCE',
        ['features', featureIndex, 'location', 'hexId'],
        `Map feature references absent Hex ${location.hexId}.`,
      )];
  }
  return parseHexsideId(location.hexsideId).ok && mapIndex.getHexside(location.hexsideId)
    ? []
    : [error(
      'ORPHAN_MAP_STATE_REFERENCE',
      ['features', featureIndex, 'location', 'hexsideId'],
      `Map feature references absent Hexside ${location.hexsideId}.`,
    )];
};

const validateMapFeatureState = (
  feature: MapFeatureState,
  index: number,
  mapIndex: MapDefinitionIndex,
): readonly ValidationIssue[] => {
  const path = ['features', index] as const;
  const issues: ValidationIssue[] = [];
  if (!parseMapFeatureStateId(feature.id).ok) {
    issues.push(error('INVALID_MAP_FEATURE_STATE_ID', [...path, 'id'], `Invalid feature ID: ${feature.id}.`));
  }
  issues.push(...validateDefinitionReference(feature.definitionId, [...path, 'definitionId']));
  issues.push(...validateFeatureLocation(feature.location, index, mapIndex));
  if ((feature.kind === 'HEXSIDE_FEATURE') !== (feature.location.kind === 'HEXSIDE')) {
    issues.push(error(
      'MAP_FEATURE_LOCATION_KIND_MISMATCH',
      [...path, 'location'],
      `Feature kind ${feature.kind} cannot use location kind ${feature.location.kind}.`,
    ));
  }
  if (feature.controllerId !== null && !parsePlayerId(feature.controllerId).ok) {
    issues.push(error(
      'INVALID_PLAYER_REFERENCE',
      [...path, 'controllerId'],
      `Invalid Player ID: ${feature.controllerId}.`,
    ));
  }
  for (const duplicate of duplicateKeys(feature.statusDefinitionIds, String)) {
    issues.push(error(
      'DUPLICATE_FEATURE_STATUS',
      [...path, 'statusDefinitionIds'],
      `Feature ${feature.id} repeats status Definition ${duplicate}.`,
    ));
  }
  feature.statusDefinitionIds.forEach((definitionId, statusIndex) => {
    issues.push(...validateDefinitionReference(
      definitionId,
      [...path, 'statusDefinitionIds', statusIndex],
    ));
  });
  for (const [field, value] of [['level', feature.level], ['damage', feature.damage]] as const) {
    if (!Number.isSafeInteger(value) || value < 0) {
      issues.push(error(
        'INVALID_MAP_FEATURE_QUANTITY',
        [...path, field],
        `${field} must be a non-negative safe integer: ${value}.`,
      ));
    }
  }
  return issues;
};

export const validateMapState = (
  definition: MapDefinition,
  state: MapState,
): readonly ValidationIssue[] => {
  const issues: ValidationIssue[] = [];
  const index = createMapDefinitionIndex(definition);
  if (!schemaVersion(state.schemaVersion).ok) {
    issues.push(error('INVALID_MAP_STATE_SCHEMA_VERSION', ['schemaVersion'], 'MapState schema version is invalid.'));
  }
  if (!revision(state.revision).ok) {
    issues.push(error('INVALID_MAP_STATE_REVISION', ['revision'], 'MapState revision is invalid.'));
  }

  for (const duplicate of duplicateKeys(state.hexControl, ({ hexId }) => hexId)) {
    issues.push(error('DUPLICATE_HEX_CONTROL', ['hexControl'], `Duplicate control for Hex ${duplicate}.`));
  }
  state.hexControl.forEach((control, controlIndex) => {
    if (!parseHexCoordinateId(control.hexId).ok || !index.getHex(control.hexId)) {
      issues.push(error(
        'ORPHAN_MAP_STATE_REFERENCE',
        ['hexControl', controlIndex, 'hexId'],
        `Control references absent Hex ${control.hexId}.`,
      ));
    }
    if (control.controllerId !== null && !parsePlayerId(control.controllerId).ok) {
      issues.push(error(
        'INVALID_PLAYER_REFERENCE',
        ['hexControl', controlIndex, 'controllerId'],
        `Invalid Player ID: ${control.controllerId}.`,
      ));
    }
  });

  for (const duplicate of duplicateKeys(state.features, ({ id }) => id)) {
    issues.push(error(
      'DUPLICATE_MAP_FEATURE_STATE_ID',
      ['features'],
      `Duplicate mutable map feature ID: ${duplicate}.`,
    ));
  }
  state.features.forEach((feature, featureIndex) => {
    issues.push(...validateMapFeatureState(feature, featureIndex, index));
  });
  return issues;
};
