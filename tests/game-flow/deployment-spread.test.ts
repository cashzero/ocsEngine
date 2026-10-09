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
  const { scenario, generatedOob } = prepared.value;
  const definitions = new Map(scenario.pieceCatalog.definitions.map((definition) => [definition.id, definition]));
  // Division slots of the OOB: a single-unit division has no Formation ID but still deploys as its own group.
  const formations = new Map(generatedOob.sides.flatMap((side) => side.formations.flatMap((formation) =>
    formation.units.map((unit) => [unit.id, String(formation.id)] as const))));
  // Garrisons and their 2T stocks stand in the objectives and key points, not where the deployment puts the army.
  const garrisons = new Set(generatedOob.sides.map(({ garrisonDefinitionId }) => garrisonDefinitionId));
  return scenario.initialPieceState.pieces.flatMap((piece) => piece.location.kind === 'ON_MAP' && !garrisons.has(piece.definitionId) && !String(piece.id).includes('-stock-')
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
    // A dump is a marker in its hex, not a unit of the stack (it stands where the side's units hold the ground).
    for (const { hexId } of onMap.filter(({ family }) => family !== 'RESOURCE')) perHex.set(hexId, (perHex.get(hexId) ?? 0) + 1);
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

  it('keeps supply dumps off the entry edge and apart from each other', () => {
    const request: NewGameRequest = {
      ...DEFAULT_NEW_GAME_REQUEST,
      oob: { scale: 'LARGE', divisionsPerSide: 4, armoredDivisionsPerSide: 2 },
    };
    const onMap = deployed(request);
    for (const owner of new Set(onMap.map((entry) => entry.owner))) {
      const side = onMap.filter((entry) => entry.owner === owner);
      const dumps = side.filter(({ family }) => family === 'RESOURCE').map(({ hexId }) => hexId);
      expect(dumps.length, `${owner} dumps`).toBeGreaterThan(0);
      expect(new Set(dumps).size, `${owner} dump hexes`).toBe(dumps.length);
      for (const [index, dump] of dumps.entries()) {
        for (const other of dumps.slice(index + 1)) expect(hexDistance(dump, other), `${owner} dump spacing`).toBeGreaterThanOrEqual(2);
      }
    }
  });
  it('plans HQs, Air Bases and dumps together: HQs with the troops, Air Bases in the rear, none sharing a Hex', () => {
    for (const seed of [1, 2, 3, 4, 5, 6]) {
      const prepared = prepareNewGame({
        ...DEFAULT_NEW_GAME_REQUEST,
        seeds: { ...DEFAULT_NEW_GAME_REQUEST.seeds, map: seed, oob: seed, deployment: seed },
        oob: { ...DEFAULT_NEW_GAME_REQUEST.oob, air: 'STANDARD' },
      });
      expect(prepared.ok).toBe(true);
      if (!prepared.ok) return;
      const { scenario } = prepared.value;
      const definitions = new Map(scenario.pieceCatalog.definitions.map((definition) => [definition.id, definition]));
      const onMap = scenario.initialPieceState.pieces.flatMap((piece) => piece.location.kind === 'ON_MAP'
        ? [{ owner: piece.ownerId, hexId: piece.location.hexId as string, definition: definitions.get(piece.definitionId)! }] : []);
      for (const owner of new Set(onMap.map((entry) => entry.owner))) {
        const side = onMap.filter((entry) => entry.owner === owner);
        const hqs = side.filter(({ definition }) => String(definition.categoryDefinitionId).endsWith(':hq')).map(({ hexId }) => hexId);
        const bases = side.filter(({ definition }) => /Air Base \d/u.test(definition.name)).map(({ hexId }) => hexId);
        const dumps = side.filter(({ definition }) => definition.family === 'RESOURCE').map(({ hexId }) => hexId);
        expect(new Set(hqs).size, `seed ${seed} ${owner} HQs share a Hex`).toBe(hqs.length);
        // HQs follow the troops (13.1b): each stands among the combat units, and every combat unit has an HQ near it.
        const troops = side.filter(({ definition }) => definition.family === 'GROUND' && !/Garrison|Landesschützen/u.test(definition.name)
          && !String(definition.categoryDefinitionId).endsWith(':hq')).map(({ hexId }) => hexId);
        for (const hq of hqs) expect(Math.min(...troops.map((hexId) => hexDistance(hq, hexId))), `seed ${seed} ${owner} HQ ${hq} away from the troops`).toBeLessThanOrEqual(3);
        const nearestHq = troops.map((hexId) => Math.min(...hqs.map((hq) => hexDistance(hq, hexId))));
        expect(nearestHq.reduce((sum, value) => sum + value, 0) / nearestHq.length, `seed ${seed} ${owner} troops far from any HQ`).toBeLessThanOrEqual(6);
        expect(bases.length, `seed ${seed} ${owner} bases`).toBeGreaterThan(0);
        for (const base of bases) {
          for (const used of [...hqs, ...dumps]) expect(hexDistance(base, used), `seed ${seed} ${owner} base ${base} next to ${used}`).toBeGreaterThanOrEqual(2);
          // The armies start about ten Hexes apart; a base well behind its own line is far from the enemy's field units (garrisons hold the objectives forward).
          const enemy = onMap.filter((entry) => entry.owner !== owner && entry.definition.family === 'GROUND' && !/Garrison|Landesschützen/u.test(entry.definition.name));
          expect(Math.min(...enemy.map(({ hexId }) => hexDistance(base, hexId))), `seed ${seed} ${owner} base ${base} too far forward`).toBeGreaterThanOrEqual(12);
        }
      }
    }
  });
});
