import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  FOUNDATION_FIXTURE_IDS,
  canonicalizeHexside,
  canonicalizeScenarioDefinition,
  createFoundationScenarioFixture,
  createMapDefinitionIndex,
  createPieceDefinitionCatalogIndex,
  createPieceStateIndex,
  directedHexside,
  findNeighborDirection,
  hashScenarioDefinition,
  parseHexCoordinateId,
  parseHexsideId,
  parseScenarioJson,
  reciprocalHexside,
  serializeScenarioDefinition,
  upsertPieceState,
  validateScenarioDefinition,
} from '../../src/index.js';

const sourceFiles = (directory: string): readonly string[] => readdirSync(
  directory,
  { withFileTypes: true },
).flatMap((entry) => {
  const path = join(directory, entry.name);
  return entry.isDirectory() ? sourceFiles(path) : entry.name.endsWith('.ts') ? [path] : [];
});

describe('F10 Foundation integration gate', () => {
  it('loads, validates, canonicalizes, hashes, and reloads the full fixture', async () => {
    const scenario = createFoundationScenarioFixture();
    expect(validateScenarioDefinition(scenario)).toEqual([]);

    const serialized = serializeScenarioDefinition(scenario);
    const hash = await hashScenarioDefinition(scenario);
    expect(serialized.ok).toBe(true);
    expect(hash.ok && hash.value).toMatch(/^sha256:[a-f0-9]{64}$/);
    if (!serialized.ok) return;

    const reloaded = parseScenarioJson(serialized.value);
    expect(reloaded).toEqual({ ok: true, value: canonicalizeScenarioDefinition(scenario) });
    if (!reloaded.ok) return;
    expect(serializeScenarioDefinition(reloaded.value)).toEqual(serialized);
    expect(await hashScenarioDefinition(reloaded.value)).toEqual(hash);
  });

  it('enumerates all content and resolves every internal aggregate reference', () => {
    const scenario = createFoundationScenarioFixture();
    const map = createMapDefinitionIndex(scenario.mapDefinition);
    const catalog = createPieceDefinitionCatalogIndex(scenario.pieceCatalog);
    const pieces = createPieceStateIndex(scenario.initialPieceState);
    const playerIds = new Set(scenario.players.map(({ id }) => id));

    expect(map.orderedHexes()).toHaveLength(25);
    expect(map.orderedHexsides()).toHaveLength(4);
    expect(catalog.ordered()).toHaveLength(6);
    expect(pieces.ordered()).toHaveLength(6);
    expect(new Set(pieces.ordered().map(({ location }) => location.kind))).toEqual(new Set([
      'ON_MAP', 'OFF_MAP_BOX', 'HOLDING_AREA', 'CONTAINER',
    ]));

    for (const control of scenario.initialMapState.hexControl) {
      expect(map.getHex(control.hexId)).toBeDefined();
      if (control.controllerId !== null) expect(playerIds.has(control.controllerId)).toBe(true);
    }
    for (const piece of pieces.ordered()) {
      const definition = catalog.get(piece.definitionId);
      const location = piece.location;
      expect(definition, piece.id).toBeDefined();
      expect(playerIds.has(piece.ownerId), piece.id).toBe(true);
      if (piece.currentFaceId !== null) {
        expect(definition?.faces.some(({ id }) => id === piece.currentFaceId), piece.id).toBe(true);
      }
      switch (location.kind) {
        case 'ON_MAP': expect(map.getHex(location.hexId), piece.id).toBeDefined(); break;
        case 'OFF_MAP_BOX':
        case 'HOLDING_AREA':
          expect(scenario.boxes.some(({ id }) => id === location.boxId), piece.id).toBe(true);
          break;
        case 'TURN_TRACK':
          expect(scenario.tracks.some(({ id }) => id === location.trackId), piece.id).toBe(true);
          break;
        case 'POOL':
          expect(scenario.pools.some(({ id }) => id === location.poolId), piece.id).toBe(true);
          break;
        case 'CONTAINER': expect(pieces.get(location.containerId), piece.id).toBeDefined(); break;
        case 'ELIMINATED': break;
      }
    }
    for (const declaration of [...scenario.entries, ...scenario.sources]) {
      expect(map.getHex(declaration.hexId), declaration.id).toBeDefined();
    }
    for (const tableId of scenario.configuration.tableDefinitionIds) {
      expect(scenario.externalTables.some(({ definitionId }) => definitionId === tableId)).toBe(true);
    }
  });

  it('proves reciprocal Hexsides and Piece relation integrity', () => {
    const scenario = createFoundationScenarioFixture();
    const pieceIds = new Set(scenario.initialPieceState.pieces.map(({ id }) => id));
    for (const edge of scenario.mapDefinition.hexsides) {
      const parsed = parseHexsideId(edge.hexsideId);
      expect(parsed.ok, edge.hexsideId).toBe(true);
      if (!parsed.ok) continue;
      const first = parseHexCoordinateId(parsed.value.firstHexId);
      const second = parseHexCoordinateId(parsed.value.secondHexId);
      expect(first.ok && second.ok).toBe(true);
      if (!first.ok || !second.ok) continue;
      const direction = findNeighborDirection(first.value, second.value);
      expect(direction).toBeDefined();
      if (direction === undefined) continue;
      const forward = directedHexside(first.value, direction);
      const reverse = reciprocalHexside(forward);
      expect(reverse.ok).toBe(true);
      if (!reverse.ok) continue;
      expect(reverse.value.hexId).toBe(parsed.value.secondHexId);
      expect(canonicalizeHexside(reverse.value)).toEqual({ ok: true, value: parsed.value });
    }
    for (const relation of scenario.initialPieceState.relations) {
      if (relation.kind === 'CARGO') {
        expect(pieceIds.has(relation.cargoId)).toBe(true);
        expect(pieceIds.has(relation.containerId)).toBe(true);
      }
    }
  });

  it('clones and updates one Piece without leaking mutation into prior state', () => {
    const scenario = createFoundationScenarioFixture();
    const original = scenario.initialPieceState;
    const transport = original.pieces.find(({ id }) => id === FOUNDATION_FIXTURE_IDS.transportPieceId)!;
    const updated = upsertPieceState(original, { ...transport, mode: 'DG' });

    expect(updated).not.toBe(original);
    expect(updated.pieces).not.toBe(original.pieces);
    expect(createPieceStateIndex(updated).get(transport.id)?.mode).toBe('DG');
    expect(createPieceStateIndex(original).get(transport.id)?.mode).toBe('MOVE');
    expect(updated.revision).toBe(original.revision + 1);
  });

  it('contains no BCS-specific domain vocabulary in production source', () => {
    const prohibited = /\bBCS\b|combat train|SNAFU|stopping engagement|engagement zone|screen zone/giu;
    const matches = sourceFiles(join(process.cwd(), 'src')).flatMap((path) => {
      const content = readFileSync(path, 'utf8');
      return [...content.matchAll(prohibited)].map((match) => ({ path, term: match[0] }));
    });
    expect(matches).toEqual([]);
  });

  it('keeps package dependencies one-way and records every F0-F10 study output', () => {
    const sourceRoot = join(process.cwd(), 'src');
    const boundaryLeaks = sourceFiles(sourceRoot).flatMap((path) => {
      const content = readFileSync(path, 'utf8');
      const relative = path.slice(sourceRoot.length).replaceAll('\\', '/');
      // Only the package root may re-export the bot; no engine layer may depend on it.
      const prohibitedImports = relative === '/index.ts'
        ? /from\s+['"][^'"]*react/giu
        : /from\s+['"][^'"]*(?:react|\/ai(?:\/|['"]))/giu;
      const layerPattern = relative.startsWith('/core/')
        ? /from\s+['"][^'"]*(?:domain|serialization|testing|rules|gameplay|ui|generation)/gu
        : relative.startsWith('/domain/')
          ? /from\s+['"][^'"]*(?:serialization|testing|rules|gameplay|ui|generation)/gu
          : relative.startsWith('/serialization/')
            ? /from\s+['"][^'"]*(?:testing|rules|gameplay|ui|generation)/gu
            : relative.startsWith('/rules/')
              ? /from\s+['"][^'"]*(?:gameplay|ui|generation)/gu
              : relative.startsWith('/gameplay/')
                ? /from\s+['"][^'"]*(?:ui|generation)/gu
                : relative.startsWith('/generation/')
                  ? /from\s+['"][^'"]*(?:rules|gameplay|ui|\/ai(?:\/|['"]))/gu
                  : relative.startsWith('/ai/')
                    // The bot sees what a player sees: the Gameplay session, Rule Engine types and the printed charts, never rule functions.
                    ? /from\s+['"][^'"]*(?:serialization|testing|ui|generation|game-flow)|^import\s+(?!type\b)[^;]*from\s+['"][^'"]*rules\/(?!tables\/)/gmu
                    : /$a/gu;
      return [...content.matchAll(prohibitedImports), ...content.matchAll(layerPattern)]
        .map((match) => ({ path, importText: match[0] }));
    });
    expect(boundaryLeaks).toEqual([]);

    const outputs = [
      'docs/foundation/00-vocabulary-and-adrs.md',
      ...Array.from({ length: 9 }, (_, index) =>
        `docs/foundation/${String(index + 1).padStart(2, '0')}-${[
          'core-primitives-and-identity',
          'hex-geometry-contract',
          'hexside-and-location-model',
          'map-definition-and-state',
          'piece-definition-catalog',
          'piece-state-and-relations',
          'scenario-envelope',
          'schema-and-serialization',
          'fixture-test-kit',
        ][index]}.md`),
      'docs/foundation/F10-foundation-integration.md',
    ];
    expect(outputs.filter((path) => !existsSync(join(process.cwd(), path)))).toEqual([]);
  });
});
