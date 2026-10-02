import { describe, expect, it } from 'vitest';
import { parseHexCoordinateId } from '../../src/core/index.js';
import { DEFAULT_NEW_GAME_REQUEST, prepareNewGame, type NewGameRequest } from '../../src/index.js';

const hexDistance = (first: string, second: string): number => {
  const a = parseHexCoordinateId(first as never);
  const b = parseHexCoordinateId(second as never);
  if (!a.ok || !b.ok) throw new Error('Invalid Hex ID.');
  const dq = a.value.q - b.value.q;
  const dr = a.value.r - b.value.r;
  return (Math.abs(dq) + Math.abs(dr) + Math.abs(dq + dr)) / 2;
};

const deployed = (request: NewGameRequest) => {
  const prepared = prepareNewGame(request);
  expect(prepared.ok).toBe(true);
  if (!prepared.ok) throw new Error('Default game must prepare.');
  const { scenario } = prepared.value;
  const definitions = new Map(scenario.pieceCatalog.definitions.map((definition) => [definition.id, definition]));
  const formations = new Map(scenario.initialPieceState.relations.flatMap((relation) =>
    relation.kind === 'FORMATION_MEMBERSHIP' ? [[relation.memberId as string, relation.formationDefinitionId as string]] : []));
  return scenario.initialPieceState.pieces.flatMap((piece) => piece.location.kind === 'ON_MAP'
    ? [{
      owner: piece.ownerId,
      hexId: piece.location.hexId as string,
      family: definitions.get(piece.definitionId)!.family,
      formation: formations.get(piece.id as string) ?? null,
    }]
    : []);
};

describe('default deployment spacing', () => {
  it('deploys each side as separate formation groups instead of one blob', () => {
    const onMap = deployed(DEFAULT_NEW_GAME_REQUEST);

    const perHex = new Map<string, number>();
    for (const { hexId } of onMap) perHex.set(hexId, (perHex.get(hexId) ?? 0) + 1);
    // Stacking is fine, but small: the old layout piled four units on one Hex.
    expect(Math.max(...perHex.values())).toBeLessThanOrEqual(2);

    for (const owner of new Set(onMap.map((entry) => entry.owner))) {
      const side = onMap.filter((entry) => entry.owner === owner);
      const hexes = [...new Set(side.map((entry) => entry.hexId))];
      // The old layout used 5 Hexes for 13 units; the same units now cover clearly more ground.
      expect(hexes.length, `${owner} occupied hexes`).toBeGreaterThanOrEqual(Math.ceil(side.length / 2));
      const farthestPair = Math.max(...hexes.flatMap((a) => hexes.map((b) => hexDistance(a, b))));
      expect(farthestPair, `${owner} footprint`).toBeGreaterThanOrEqual(6);

      // Formations are separate groups: none shares a Hex with another, and their centres are apart.
      const groups = new Map<string, string[]>();
      for (const { formation, hexId } of side) if (formation !== null) groups.set(formation, [...(groups.get(formation) ?? []), hexId]);
      expect(groups.size, `${owner} formations`).toBeGreaterThan(1);
      const entries = [...groups.entries()];
      for (const [index, [, first]] of entries.entries()) {
        for (const [, second] of entries.slice(index + 1)) {
          expect(first.some((hexId) => second.includes(hexId)), `${owner} formations share a Hex`).toBe(false);
          const centre = (group: string[]) => group[0]!;
          expect(hexDistance(centre(first), centre(second)), `${owner} formation separation`).toBeGreaterThanOrEqual(3);
        }
      }
    }
  });

  it('keeps supply dumps off the entry edge, apart from each other and from the troops', () => {
    const request: NewGameRequest = {
      ...DEFAULT_NEW_GAME_REQUEST,
      oob: { scale: 'LARGE', formationsPerSide: 4 },
    };
    const onMap = deployed(request);
    for (const owner of new Set(onMap.map((entry) => entry.owner))) {
      const side = onMap.filter((entry) => entry.owner === owner);
      const dumps = side.filter(({ family }) => family === 'RESOURCE').map(({ hexId }) => hexId);
      const others = new Set(side.filter(({ family }) => family !== 'RESOURCE').map(({ hexId }) => hexId));
      expect(dumps.length, `${owner} dumps`).toBeGreaterThan(0);
      expect(new Set(dumps).size, `${owner} dump hexes`).toBe(dumps.length);
      for (const dump of dumps) expect(others.has(dump), `${owner} dump ${dump} shares a Hex`).toBe(false);
      for (const [index, dump] of dumps.entries()) {
        for (const other of dumps.slice(index + 1)) expect(hexDistance(dump, other), `${owner} dump spacing`).toBeGreaterThanOrEqual(2);
      }
    }
  });
});
