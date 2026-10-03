import {
  FOUNDATION_SCHEMA_VERSION,
  err,
  ok,
  parseDefinitionId,
  type DefinitionId,
  type Result,
} from '../../core/index.js';
import type { HexsideId, MapDefinition } from '../../domain/map/index.js';
import { canonicalJson } from '../../serialization/index.js';
import { generateHydrology } from './hydrology.js';
import { definitionId, rectangularAxialBounds, toHexsideCollections } from './internal.js';
import type {
  GeneratedMap,
  MapGenerationError,
  MapGenerationOptions,
  NormalizedMapGenerationOptions,
} from './model.js';
import { MAP_GENERATOR_VERSION } from './model.js';
import { generateStrategicNetwork } from './network.js';
import { generateTerrainCells } from './terrain.js';
import { validateGeneratedMap } from './validation.js';

const TERRAIN_IDS: Readonly<Record<string, DefinitionId>> = {
  CLEAR: definitionId('terrain:clear'), WOODS: definitionId('terrain:woods'),
  ROUGH: definitionId('terrain:rough'), MOUNTAIN: definitionId('terrain:mountain'),
  MARSH: definitionId('terrain:marsh'), WATER: definitionId('terrain:water'),
};

export const normalizeMapGenerationOptions = (
  options: MapGenerationOptions,
): Result<NormalizedMapGenerationOptions, readonly MapGenerationError[]> => {
  const errors: MapGenerationError[] = [];
  if (!Number.isSafeInteger(options.width) || options.width < 8 || options.width > 64) {
    errors.push({ code: 'INVALID_OPTIONS', message: 'Width must be an integer from 8 to 64.', path: ['width'] });
  }
  if (!Number.isSafeInteger(options.height) || options.height < 8 || options.height > 48) {
    errors.push({ code: 'INVALID_OPTIONS', message: 'Height must be an integer from 8 to 48.', path: ['height'] });
  }
  if (!Number.isSafeInteger(options.seed) || options.seed < 0 || options.seed > 0xffff_ffff) {
    errors.push({ code: 'INVALID_OPTIONS', message: 'Seed must be a uint32.', path: ['seed'] });
  }
  if (options.style !== 'TEMPERATE_INLAND' && options.style !== 'MEDITERRANEAN_COAST') {
    errors.push({ code: 'INVALID_OPTIONS', message: 'Unknown map style.', path: ['style'] });
  }
  const settlementDensity = options.settlementDensity ?? 0.1;
  if (!Number.isFinite(settlementDensity) || settlementDensity < 0.02 || settlementDensity > 0.16) {
    errors.push({ code: 'INVALID_OPTIONS', message: 'Settlement density must be 0.02 to 0.16.', path: ['settlementDensity'] });
  }
  return errors.length > 0 ? err(errors) : ok({ ...options, settlementDensity });
};

export const generateRandomMap = (
  requested: MapGenerationOptions,
): Result<GeneratedMap, readonly MapGenerationError[]> => {
  const normalized = normalizeMapGenerationOptions(requested);
  if (!normalized.ok) return normalized;
  const options = normalized.value;
  const cells = generateTerrainCells(options);
  const hexsideFeatures = new Map<HexsideId, Set<DefinitionId>>();
  generateHydrology(cells, hexsideFeatures, options);
  const strategicRegions = generateStrategicNetwork(cells, hexsideFeatures, options);
  const mapId = parseDefinitionId(`generated-map:${options.style.toLowerCase()}:${options.width}x${options.height}:${options.seed}`);
  if (!mapId.ok) throw new Error('Generated Map ID is invalid.');
  const mapDefinition: MapDefinition = {
    id: mapId.value,
    schemaVersion: FOUNDATION_SCHEMA_VERSION,
    bounds: rectangularAxialBounds(options.width, options.height),
    hexes: [...cells.values()].map((cell) => ({
      id: cell.id,
      terrainDefinitionIds: [TERRAIN_IDS[cell.terrain]!],
      features: cell.features.map((feature) => ({ ...feature })),
    })),
    hexsides: toHexsideCollections(hexsideFeatures),
    provenance: [{
      document: 'ocsEngine random map generator',
      locator: `M6/${MAP_GENERATOR_VERSION}/${options.style}/${options.seed}`,
      note: 'Algorithm adapted from reviewed bcsEngine generation stages; OCS data semantics are independent.',
    }],
    overrideDefinitionIds: [],
  };
  const validation = validateGeneratedMap(mapDefinition, strategicRegions, options.style);
  if (!validation.valid) return err([{
    code: 'GENERATION_INVALID', message: 'Generated map failed topology or quality validation.', path: [], issues: validation.issues,
  }]);
  const warnings = [
    validation.metrics.terrainCounts.MOUNTAIN / validation.metrics.landHexes > 0.25
      ? 'Mountain density is high; operational mobility may be constrained.' : null,
    validation.metrics.roadEdges / validation.metrics.landHexes < 0.35
      ? 'Road density is low; expect slower operational movement.' : null,
  ].filter((warning): warning is string => warning !== null);
  return ok({
    schemaVersion: 1,
    generatorVersion: MAP_GENERATOR_VERSION,
    options,
    mapDefinition,
    strategicRegions,
    metrics: validation.metrics,
    warnings,
  });
};

export const serializeGeneratedMap = (
  generated: GeneratedMap,
): Result<string, readonly MapGenerationError[]> => {
  const serialized = canonicalJson(generated);
  return serialized.ok ? serialized : err(serialized.error.map((issue) => ({
    code: 'GENERATION_INVALID', message: issue.message, path: issue.path, issues: [issue],
  })));
};
