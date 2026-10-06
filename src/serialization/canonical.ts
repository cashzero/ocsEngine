import {
  err,
  ok,
  parseContentHash,
  stableKey,
  stableSort,
  type ContentHash,
  type Result,
  type SourceReference,
  type ValidationIssue,
} from '../core/index.js';
import { pieceRelationKey } from '../domain/piece/index.js';
import type { ScenarioDefinition } from '../domain/scenario/index.js';
import { parseScenarioDefinition } from './scenario-codec.js';

const compareKey = <T>(key: (value: T) => string) => (left: T, right: T): number => {
  const leftKey = key(left);
  const rightKey = key(right);
  return leftKey < rightKey ? -1 : leftKey > rightKey ? 1 : 0;
};

const sortText = <T extends string>(values: readonly T[]): readonly T[] =>
  stableSort(values, compareKey(String));

const sourceKey = (source: SourceReference): string =>
  stableKey([source.document, source.locator, source.note ?? '']);

const sortSources = (sources: readonly SourceReference[]): readonly SourceReference[] =>
  stableSort(sources, compareKey(sourceKey));

/** A deeply detached Map State with its unordered collections sorted. */
export const canonicalizeMapState = (
  mapState: ScenarioDefinition['initialMapState'],
): ScenarioDefinition['initialMapState'] => ({
  ...mapState,
  hexControl: stableSort(
    mapState.hexControl,
    compareKey(({ hexId }) => hexId),
  ).map((control) => ({ ...control })),
  features: stableSort(
    mapState.features,
    compareKey(({ id }) => id),
  ).map((feature) => ({
    ...feature,
    location: { ...feature.location },
    statusDefinitionIds: sortText(feature.statusDefinitionIds),
  })),
});

/** A deeply detached Piece runtime state with its unordered collections sorted. */
export const canonicalizePieceState = (
  pieceState: ScenarioDefinition['initialPieceState'],
): ScenarioDefinition['initialPieceState'] => ({
  ...pieceState,
  pieces: stableSort(
    pieceState.pieces,
    compareKey(({ id }) => id),
  ).map((piece) => ({
    ...piece,
    location: { ...piece.location },
    statuses: stableSort(
      piece.statuses,
      compareKey(({ statusDefinitionId }) => statusDefinitionId),
    ).map((status) => ({ ...status, value: { ...status.value } })),
  })),
  relations: stableSort(
    pieceState.relations,
    compareKey(pieceRelationKey),
  ).map((relation) => ({ ...relation })),
});

/** Returns a deeply detached Scenario with all semantically unordered collections sorted. */
export const canonicalizeScenarioDefinition = (
  scenario: ScenarioDefinition,
): ScenarioDefinition => ({
  ...scenario,
  mapDefinition: {
    ...scenario.mapDefinition,
    bounds: { ...scenario.mapDefinition.bounds },
    hexes: stableSort(scenario.mapDefinition.hexes, compareKey(({ id }) => id)).map((hex) => ({
      ...hex,
      terrainDefinitionIds: sortText(hex.terrainDefinitionIds),
      features: stableSort(
        hex.features,
        compareKey(({ kind, definitionId }) => stableKey([kind, definitionId])),
      ).map((feature) => ({ ...feature })),
    })),
    hexsides: stableSort(
      scenario.mapDefinition.hexsides,
      compareKey(({ hexsideId }) => hexsideId),
    ).map((hexside) => ({
      ...hexside,
      featureDefinitionIds: sortText(hexside.featureDefinitionIds),
    })),
    provenance: sortSources(scenario.mapDefinition.provenance),
    overrideDefinitionIds: sortText(scenario.mapDefinition.overrideDefinitionIds),
  },
  initialMapState: canonicalizeMapState(scenario.initialMapState),
  pieceCatalog: {
    ...scenario.pieceCatalog,
    definitions: stableSort(
      scenario.pieceCatalog.definitions,
      compareKey(({ id }) => id),
    ).map((definition) => ({
      ...definition,
      ownership: { ...definition.ownership },
      faces: stableSort(definition.faces, compareKey(({ id }) => id)).map((face) => ({
        ...face,
        steps: stableSort(
          face.steps,
          (left, right) => left.remainingSteps - right.remainingSteps,
        ).map((step) => ({
          ...step,
          ratings: stableSort(
            step.ratings,
            compareKey(({ ratingDefinitionId }) => ratingDefinitionId),
          ).map((rating) => ({ ...rating })),
        })),
      })),
      capabilities: stableSort(
        definition.capabilities,
        compareKey(({ id }) => id),
      ).map((capability) => ({
        ...capability,
        parameters: stableSort(
          capability.parameters,
          compareKey(({ key }) => key),
        ).map((parameter) => ({ ...parameter })),
      })),
      resource: definition.resource === null ? null : { ...definition.resource },
      facility: definition.facility === null ? null : { ...definition.facility },
      marker: definition.marker === null ? null : { ...definition.marker },
      source: {
        records: stableSort(
          definition.source.records,
          compareKey((record) => stableKey([
            record.field,
            record.source.document,
            record.source.locator,
            record.rawValue,
          ])),
        ).map((record) => ({ ...record, source: { ...record.source } })),
      },
    })),
    provenance: sortSources(scenario.pieceCatalog.provenance),
  },
  initialPieceState: canonicalizePieceState(scenario.initialPieceState),
  players: stableSort(scenario.players, compareKey(({ id }) => id)).map((player) => ({ ...player })),
  turnStart: { ...scenario.turnStart },
  boxes: stableSort(scenario.boxes, compareKey(({ id }) => id)).map((box) => ({ ...box })),
  tracks: stableSort(scenario.tracks, compareKey(({ id }) => id)).map((track) => ({ ...track })),
  pools: stableSort(scenario.pools, compareKey(({ id }) => id)).map((pool) => ({ ...pool })),
  entries: stableSort(scenario.entries, compareKey(({ id }) => id)).map((entry) => ({ ...entry })),
  sources: stableSort(scenario.sources, compareKey(({ id }) => id)).map((source) => ({ ...source })),
  configuration: {
    ...scenario.configuration,
    optionDefinitionIds: sortText(scenario.configuration.optionDefinitionIds),
    tableDefinitionIds: sortText(scenario.configuration.tableDefinitionIds),
  },
  externalTables: stableSort(
    scenario.externalTables,
    compareKey(({ definitionId }) => definitionId),
  ).map((table) => ({ ...table, source: { ...table.source } })),
  provenance: sortSources(scenario.provenance),
  generatorMetadata: scenario.generatorMetadata === null
    ? null
    : {
      ...scenario.generatorMetadata,
      seeds: stableSort(
        scenario.generatorMetadata.seeds,
        compareKey(({ kind, value }) => stableKey([kind, value])),
      ).map((seed) => ({ ...seed })),
    },
});

interface CanonicalJsonContext {
  readonly ancestors: WeakSet<object>;
}

/** Canonical JSON text of objects that never change (a Scenario shared by every GameState of a game). */
const staticCanonicalJson = new WeakMap<object, string>();

/** Canonical JSON: object keys sorted, -0 written as 0; static objects reuse their remembered text. */
const writeCanonicalJson = (value: unknown, context: CanonicalJsonContext): string => {
  if (value === null) return 'null';
  if (typeof value === 'string') return JSON.stringify(value);
  if (typeof value === 'boolean') return value ? 'true' : 'false';
  if (typeof value === 'number') {
    if (!Number.isFinite(value)) throw new TypeError('Canonical JSON rejects non-finite numbers.');
    return JSON.stringify(Object.is(value, -0) ? 0 : value);
  }
  if (typeof value !== 'object') throw new TypeError(`Canonical JSON rejects ${typeof value}.`);
  const cached = staticCanonicalJson.get(value);
  if (cached !== undefined) return cached;
  if (context.ancestors.has(value)) throw new TypeError('Canonical JSON rejects cyclic values.');
  context.ancestors.add(value);
  try {
    if (Array.isArray(value)) {
      return `[${value.map((entry) => {
        if (entry === undefined) throw new TypeError('Canonical JSON rejects undefined array entries.');
        return writeCanonicalJson(entry, context);
      }).join(',')}]`;
    }
    const record = value as Readonly<Record<string, unknown>>;
    const members: string[] = [];
    for (const key of Object.keys(record).sort()) {
      if (record[key] !== undefined) members.push(`${JSON.stringify(key)}:${writeCanonicalJson(record[key], context)}`);
    }
    return `{${members.join(',')}}`;
  } finally {
    context.ancestors.delete(value);
  }
};

/**
 * Remembers the canonical JSON text of an object the caller guarantees is never mutated, so every later
 * serialization that contains it reuses the text. Returns the object for chaining.
 */
export const internCanonicalJson = <T extends object>(value: T): T => {
  if (!staticCanonicalJson.has(value)) staticCanonicalJson.set(value, writeCanonicalJson(value, { ancestors: new WeakSet() }));
  return value;
};

export const canonicalJson = (value: unknown): Result<string, readonly ValidationIssue[]> => {
  try {
    return ok(writeCanonicalJson(value, { ancestors: new WeakSet() }));
  } catch (cause) {
    return err([{
      code: 'NON_CANONICAL_JSON_VALUE',
      path: [],
      severity: 'ERROR',
      message: cause instanceof Error ? cause.message : 'Value cannot be represented as canonical JSON.',
    }]);
  }
};

export const serializeScenarioDefinition = (
  scenario: ScenarioDefinition,
): Result<string, readonly ValidationIssue[]> => {
  const parsed = parseScenarioDefinition(scenario);
  if (!parsed.ok) return parsed;
  return canonicalJson(canonicalizeScenarioDefinition(parsed.value));
};

export const hashScenarioDefinition = async (
  scenario: ScenarioDefinition,
): Promise<Result<ContentHash, readonly ValidationIssue[]>> => {
  const serialized = serializeScenarioDefinition(scenario);
  if (!serialized.ok) return serialized;
  const digest = await globalThis.crypto.subtle.digest(
    'SHA-256',
    new TextEncoder().encode(serialized.value),
  );
  const hex = [...new Uint8Array(digest)]
    .map((byte) => byte.toString(16).padStart(2, '0'))
    .join('');
  const parsed = parseContentHash(`sha256:${hex}`);
  return parsed.ok
    ? ok(parsed.value)
    : err([{
      code: 'CONTENT_HASH_FAILURE',
      path: [],
      severity: 'ERROR',
      message: 'SHA-256 output did not match the ContentHash contract.',
    }]);
};
