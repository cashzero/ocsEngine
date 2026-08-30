import {
  duplicateKeys,
  parseDefinitionId,
  parsePlayerId,
  parseScenarioId,
  schemaVersion,
  stableKey,
  type DefinitionId,
  type ValidationIssue,
} from '../../core/index.js';
import {
  createMapDefinitionIndex,
  parseMapBoxId,
  parseMapTrackId,
  parsePiecePoolId,
  validateMapDefinition,
  validateMapState,
} from '../map/index.js';
import {
  validatePieceDefinitionCatalog,
  validatePieceRuntimeState,
} from '../piece/index.js';
import type { PieceLocation } from '../map/index.js';
import type { ScenarioDefinition } from './model.js';

const error = (
  code: string,
  path: readonly (string | number)[],
  message: string,
): ValidationIssue => ({ code, path, severity: 'ERROR', message });

const prefixed = (
  prefix: string,
  issues: readonly ValidationIssue[],
): readonly ValidationIssue[] => issues.map((issue) => ({
  ...issue,
  path: [prefix, ...issue.path],
}));

const validDefinition = (
  value: DefinitionId,
  path: readonly (string | number)[],
): readonly ValidationIssue[] => parseDefinitionId(value).ok
  ? []
  : [error('INVALID_DEFINITION_REFERENCE', path, `Invalid Definition ID: ${value}.`)];

const validText = (
  value: string,
  path: readonly (string | number)[],
  label: string,
): readonly ValidationIssue[] => value.trim().length > 0
  ? []
  : [error('EMPTY_SCENARIO_FIELD', path, `${label} must not be empty.`)];

const validateLocationReference = (
  location: PieceLocation,
  pieceIndex: number,
  scenario: ScenarioDefinition,
): readonly ValidationIssue[] => {
  const path = ['initialPieceState', 'pieces', pieceIndex, 'location'] as const;
  const mapIndex = createMapDefinitionIndex(scenario.mapDefinition);
  switch (location.kind) {
    case 'ON_MAP':
      return mapIndex.getHex(location.hexId)
        ? []
        : [error('UNKNOWN_SCENARIO_HEX', [...path, 'hexId'], `Unknown Hex ${location.hexId}.`)];
    case 'OFF_MAP_BOX':
    case 'HOLDING_AREA': {
      const expectedKind = location.kind === 'OFF_MAP_BOX' ? 'OFF_MAP' : 'HOLDING';
      const box = scenario.boxes.find(({ id }) => id === location.boxId);
      if (!box) {
        return [error('UNKNOWN_SCENARIO_BOX', [...path, 'boxId'], `Unknown Box ${location.boxId}.`)];
      }
      return box.kind === expectedKind
        ? []
        : [error(
          'SCENARIO_BOX_KIND_MISMATCH',
          [...path, 'boxId'],
          `Location ${location.kind} cannot reference ${box.kind} Box ${box.id}.`,
        )];
    }
    case 'TURN_TRACK': {
      const track = scenario.tracks.find(({ id }) => id === location.trackId);
      if (!track) {
        return [error(
          'UNKNOWN_SCENARIO_TRACK',
          [...path, 'trackId'],
          `Unknown Track ${location.trackId}.`,
        )];
      }
      return location.position >= track.minimumPosition && location.position <= track.maximumPosition
        ? []
        : [error(
          'SCENARIO_TRACK_POSITION_OUT_OF_RANGE',
          [...path, 'position'],
          `Position ${location.position} is outside ${track.minimumPosition}..${track.maximumPosition}.`,
        )];
    }
    case 'POOL':
      return scenario.pools.some(({ id }) => id === location.poolId)
        ? []
        : [error('UNKNOWN_SCENARIO_POOL', [...path, 'poolId'], `Unknown Pool ${location.poolId}.`)];
    case 'CONTAINER':
    case 'ELIMINATED':
      return [];
  }
};

const validateSource = (
  source: { readonly document: string; readonly locator: string },
  path: readonly (string | number)[],
): readonly ValidationIssue[] => source.document.trim().length > 0 && source.locator.trim().length > 0
  ? []
  : [error('INVALID_SCENARIO_PROVENANCE', path, 'Source document and locator must not be empty.')];

export const validateScenarioDefinition = (
  scenario: ScenarioDefinition,
): readonly ValidationIssue[] => {
  const issues: ValidationIssue[] = [];
  if (!parseScenarioId(scenario.id).ok) {
    issues.push(error('INVALID_SCENARIO_ID', ['id'], `Invalid Scenario ID: ${scenario.id}.`));
  }
  if (!schemaVersion(scenario.schemaVersion).ok) {
    issues.push(error('INVALID_SCENARIO_SCHEMA_VERSION', ['schemaVersion'], 'Schema version must be a positive safe integer.'));
  }
  issues.push(...prefixed('mapDefinition', validateMapDefinition(scenario.mapDefinition)));
  issues.push(...prefixed('initialMapState', validateMapState(
    scenario.mapDefinition,
    scenario.initialMapState,
  )));
  issues.push(...prefixed('pieceCatalog', validatePieceDefinitionCatalog(scenario.pieceCatalog)));
  issues.push(...prefixed('initialPieceState', validatePieceRuntimeState(
    scenario.pieceCatalog,
    scenario.initialPieceState,
  )));

  for (const duplicate of duplicateKeys(scenario.players, ({ id }) => id)) {
    issues.push(error('DUPLICATE_SCENARIO_PLAYER', ['players'], `Duplicate Player ${duplicate}.`));
  }
  for (const duplicate of duplicateKeys(scenario.players, ({ sideDefinitionId }) => sideDefinitionId)) {
    issues.push(error('DUPLICATE_SCENARIO_SIDE', ['players'], `Duplicate Side ${duplicate}.`));
  }
  scenario.players.forEach((player, index) => {
    if (!parsePlayerId(player.id).ok) {
      issues.push(error('INVALID_PLAYER_REFERENCE', ['players', index, 'id'], `Invalid Player ${player.id}.`));
    }
    issues.push(...validDefinition(player.sideDefinitionId, ['players', index, 'sideDefinitionId']));
    issues.push(...validText(player.name, ['players', index, 'name'], 'Player name'));
  });
  const playerIds = new Set(scenario.players.map(({ id }) => id));
  if (!Number.isSafeInteger(scenario.turnStart.turn) || scenario.turnStart.turn < 1) {
    issues.push(error('INVALID_SCENARIO_TURN', ['turnStart', 'turn'], 'Starting turn must be a positive safe integer.'));
  }
  if (!playerIds.has(scenario.turnStart.firstPlayerId)) {
    issues.push(error(
      'UNKNOWN_FIRST_PLAYER',
      ['turnStart', 'firstPlayerId'],
      `First Player ${scenario.turnStart.firstPlayerId} is not declared.`,
    ));
  }

  for (const [collectionName, collection] of [
    ['boxes', scenario.boxes as readonly { readonly id: string }[]],
    ['tracks', scenario.tracks as readonly { readonly id: string }[]],
    ['pools', scenario.pools as readonly { readonly id: string }[]],
  ] as const) {
    for (const duplicate of duplicateKeys(collection, ({ id }) => id)) {
      issues.push(error('DUPLICATE_SCENARIO_PLACE', [collectionName], `Duplicate place ${duplicate}.`));
    }
  }
  const mapIndex = createMapDefinitionIndex(scenario.mapDefinition);
  scenario.boxes.forEach((box, index) => {
    if (!parseMapBoxId(box.id).ok) issues.push(error('INVALID_SCENARIO_BOX', ['boxes', index, 'id'], `Invalid Box ${box.id}.`));
    issues.push(...validText(box.name, ['boxes', index, 'name'], 'Box name'));
    if (box.linkedHexId !== null && !mapIndex.getHex(box.linkedHexId)) {
      issues.push(error('UNKNOWN_SCENARIO_HEX', ['boxes', index, 'linkedHexId'], `Unknown Hex ${box.linkedHexId}.`));
    }
  });
  scenario.tracks.forEach((track, index) => {
    if (!parseMapTrackId(track.id).ok) issues.push(error('INVALID_SCENARIO_TRACK', ['tracks', index, 'id'], `Invalid Track ${track.id}.`));
    issues.push(...validText(track.name, ['tracks', index, 'name'], 'Track name'));
    if (!Number.isSafeInteger(track.minimumPosition)
      || !Number.isSafeInteger(track.maximumPosition)
      || track.minimumPosition < 0
      || track.maximumPosition < track.minimumPosition) {
      issues.push(error('INVALID_SCENARIO_TRACK_RANGE', ['tracks', index], `Invalid range for Track ${track.id}.`));
    }
  });
  scenario.pools.forEach((pool, index) => {
    if (!parsePiecePoolId(pool.id).ok) issues.push(error('INVALID_SCENARIO_POOL', ['pools', index, 'id'], `Invalid Pool ${pool.id}.`));
    issues.push(...validText(pool.name, ['pools', index, 'name'], 'Pool name'));
  });

  const declarationSets = [
    ['entries', scenario.entries],
    ['sources', scenario.sources],
  ] as const;
  for (const [name, declarations] of declarationSets) {
    for (const duplicate of duplicateKeys(declarations, ({ id }) => id)) {
      issues.push(error('DUPLICATE_SCENARIO_DECLARATION', [name], `Duplicate declaration ${duplicate}.`));
    }
    declarations.forEach((declaration, index) => {
      issues.push(...validDefinition(declaration.id, [name, index, 'id']));
      if (!mapIndex.getHex(declaration.hexId)) {
        issues.push(error('UNKNOWN_SCENARIO_HEX', [name, index, 'hexId'], `Unknown Hex ${declaration.hexId}.`));
      }
      if (declaration.sideDefinitionId !== null) {
        issues.push(...validDefinition(declaration.sideDefinitionId, [name, index, 'sideDefinitionId']));
      }
    });
  }

  for (const duplicate of duplicateKeys(scenario.configuration.optionDefinitionIds, String)) {
    issues.push(error('DUPLICATE_SCENARIO_OPTION', ['configuration', 'optionDefinitionIds'], `Duplicate Option ${duplicate}.`));
  }
  scenario.configuration.optionDefinitionIds.forEach((id, index) => {
    issues.push(...validDefinition(id, ['configuration', 'optionDefinitionIds', index]));
  });
  issues.push(...validDefinition(scenario.configuration.weatherDefinitionId, ['configuration', 'weatherDefinitionId']));
  for (const duplicate of duplicateKeys(scenario.configuration.tableDefinitionIds, String)) {
    issues.push(error('DUPLICATE_SCENARIO_TABLE', ['configuration', 'tableDefinitionIds'], `Duplicate Table ${duplicate}.`));
  }
  scenario.configuration.tableDefinitionIds.forEach((id, index) => {
    issues.push(...validDefinition(id, ['configuration', 'tableDefinitionIds', index]));
    if (!scenario.externalTables.some(({ definitionId }) => definitionId === id)) {
      issues.push(error('MISSING_EXTERNAL_TABLE_REFERENCE', ['configuration', 'tableDefinitionIds', index], `Table ${id} has no external source reference.`));
    }
  });
  for (const duplicate of duplicateKeys(scenario.externalTables, ({ definitionId }) => definitionId)) {
    issues.push(error('DUPLICATE_EXTERNAL_TABLE_REFERENCE', ['externalTables'], `Duplicate Table source ${duplicate}.`));
  }
  scenario.externalTables.forEach((table, index) => {
    issues.push(...validDefinition(table.definitionId, ['externalTables', index, 'definitionId']));
    issues.push(...validateSource(table.source, ['externalTables', index, 'source']));
    if (!scenario.configuration.tableDefinitionIds.includes(table.definitionId)) {
      issues.push(error('UNDECLARED_EXTERNAL_TABLE_REFERENCE', ['externalTables', index, 'definitionId'], `External Table ${table.definitionId} is not configured.`));
    }
  });

  scenario.initialMapState.hexControl.forEach((control, index) => {
    if (control.controllerId !== null && !playerIds.has(control.controllerId)) {
      issues.push(error('UNKNOWN_SCENARIO_PLAYER', ['initialMapState', 'hexControl', index, 'controllerId'], `Unknown Player ${control.controllerId}.`));
    }
  });
  scenario.initialMapState.features.forEach((feature, index) => {
    if (feature.controllerId !== null && !playerIds.has(feature.controllerId)) {
      issues.push(error('UNKNOWN_SCENARIO_PLAYER', ['initialMapState', 'features', index, 'controllerId'], `Unknown Player ${feature.controllerId}.`));
    }
  });
  scenario.initialPieceState.pieces.forEach((piece, index) => {
    if (!playerIds.has(piece.ownerId)) {
      issues.push(error('UNKNOWN_SCENARIO_PLAYER', ['initialPieceState', 'pieces', index, 'ownerId'], `Unknown Player ${piece.ownerId}.`));
    }
    issues.push(...validateLocationReference(piece.location, index, scenario));
  });

  scenario.provenance.forEach((source, index) => {
    issues.push(...validateSource(source, ['provenance', index]));
  });
  if (scenario.generatorMetadata !== null) {
    issues.push(...validDefinition(scenario.generatorMetadata.generatorDefinitionId, ['generatorMetadata', 'generatorDefinitionId']));
    issues.push(...validText(scenario.generatorMetadata.version, ['generatorMetadata', 'version'], 'Generator version'));
    for (const duplicate of duplicateKeys(
      scenario.generatorMetadata.seeds,
      ({ kind, value }) => stableKey([kind, value]),
    )) {
      issues.push(error('DUPLICATE_GENERATOR_SEED', ['generatorMetadata', 'seeds'], `Duplicate generator seed ${duplicate}.`));
    }
    scenario.generatorMetadata.seeds.forEach((seed, index) => {
      issues.push(...validText(seed.kind, ['generatorMetadata', 'seeds', index, 'kind'], 'Seed kind'));
      issues.push(...validText(seed.value, ['generatorMetadata', 'seeds', index, 'value'], 'Seed value'));
    });
  }
  return issues;
};
