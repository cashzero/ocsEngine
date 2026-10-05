import { describe, expect, it } from 'vitest';
import { parseHexCoordinateId } from '../../src/core/index.js';
import { DEFAULT_NEW_GAME_REQUEST, prepareNewGame, type NewGameRequest } from '../../src/index.js';
import {
  GENERATED_MAJOR_CITY_OBJECTIVE_POINTS,
  GENERATED_TOWN_OBJECTIVE_POINTS,
} from '../../src/game-flow/deployment.js';

const hexDistance = (first: string, second: string): number => {
  const a = parseHexCoordinateId(first as never);
  const b = parseHexCoordinateId(second as never);
  if (!a.ok || !b.ok) throw new Error('Invalid Hex ID.');
  const dq = a.value.q - b.value.q;
  const dr = a.value.r - b.value.r;
  return (Math.abs(dq) + Math.abs(dr) + Math.abs(dq + dr)) / 2;
};

const objectivesOf =(request: NewGameRequest) => {
  const prepared = prepareNewGame(request);
  if (!prepared.ok) throw new Error('Game must prepare.');
  const { scenario, configuration, warnings } = prepared.value;
  const hexes = new Map(scenario.mapDefinition.hexes.map((hex) => [hex.id, hex]));
  const control = new Map(scenario.initialMapState.hexControl.map(({ hexId, controllerId }) => [hexId, controllerId]));
  const objectives = configuration.objectives.map(({ hexId, points }) => ({
    hexId,
    points,
    settlement: hexes.get(hexId)!.features.map(({ definitionId }) => String(definitionId))
      .find((id) => id.startsWith('settlement:')) ?? null,
    controller: control.get(hexId) ?? null,
  }));
  const held = (playerId: string): number => objectives
    .reduce((total, { controller, points }) => total + (controller === playerId ? points : 0), 0);
  return { objectives, held, players: scenario.players.map(({ id }) => String(id)), warnings };
};

describe('generated objectives', () => {
  it('places several objectives, only in Major Cities and towns, worth more in a Major City', () => {
    const { objectives } = objectivesOf(DEFAULT_NEW_GAME_REQUEST);
    expect(objectives.length).toBeGreaterThanOrEqual(6);
    for (const { settlement, points } of objectives) {
      expect(['settlement:city', 'settlement:town']).toContain(settlement);
      expect(points).toBe(settlement === 'settlement:city' ? GENERATED_MAJOR_CITY_OBJECTIVE_POINTS : GENERATED_TOWN_OBJECTIVE_POINTS);
    }
    expect(objectives.some(({ settlement }) => settlement === 'settlement:city')).toBe(true);
  });

  it('starts each objective held only when it lies behind a side front, the rest neutral (13.3h)', () => {
    for (const style of ['TEMPERATE_INLAND', 'EASTERN_EUROPE'] as const) {
      const { objectives, players, warnings } = objectivesOf({ ...DEFAULT_NEW_GAME_REQUEST, map: { ...DEFAULT_NEW_GAME_REQUEST.map, style } });
      // Objectives stand in the towns nearest the front, so most lie in the neutral ground between the armies.
      expect(objectives.some(({ controller }) => controller === null)).toBe(true);
      expect(objectives.every(({ controller }) => controller === null || players.includes(String(controller)))).toBe(true);
      // The VP allotted to each side's zone is still equal.
      expect(warnings.some((warning) => warning.startsWith('Objectives are unbalanced'))).toBe(false);
    }
  });

  it('leaves the ground between the two deployed armies neutral, railroads included (13.3h)', () => {
    const prepared = prepareNewGame(DEFAULT_NEW_GAME_REQUEST);
    if (!prepared.ok) throw new Error('Game must prepare.');
    const { scenario } = prepared.value;
    const control = new Map(scenario.initialMapState.hexControl.map(({ hexId, controllerId }) => [String(hexId), controllerId]));
    const land = scenario.mapDefinition.hexes.filter((hex) => !hex.terrainDefinitionIds.includes('terrain:water' as never));
    const neutral = land.filter(({ id }) => (control.get(String(id)) ?? null) === null).map(({ id }) => String(id));
    expect(neutral.length).toBeGreaterThan(land.length / 4);
    const railHexes = new Set(scenario.mapDefinition.hexsides
      .filter(({ featureDefinitionIds }) => featureDefinitionIds.some((id) => String(id).startsWith('edge:rail')))
      .flatMap(({ hexsideId }) => String(hexsideId).split('|')));
    expect(neutral.some((id) => railHexes.has(id))).toBe(true);
    // Every deployed piece stands on ground its own side controls.
    for (const piece of scenario.initialPieceState.pieces) {
      if (piece.location.kind === 'ON_MAP') expect(control.get(String(piece.location.hexId))).toBe(piece.ownerId);
    }
  });

  it('chooses the towns nearest the front, where the armies meet', () => {
    const prepared = prepareNewGame(DEFAULT_NEW_GAME_REQUEST);
    if (!prepared.ok) throw new Error('Game must prepare.');
    const { strategicRegions, mapDefinition } = prepared.value.generatedMap;
    const [first, second] = [strategicRegions.firstEntryHexIds[0]!, strategicRegions.secondEntryHexIds[0]!];
    const front = (hexId: string): number => Math.abs(hexDistance(hexId, first) - hexDistance(hexId, second));
    const towns = mapDefinition.hexes.filter(({ features }) => features.some(({ definitionId }) => String(definitionId) === 'settlement:town'))
      .map(({ id }) => String(id));
    const chosen = new Set(prepared.value.deployment.objectiveHexIds.map(String));
    const mean = (values: readonly number[]): number => values.reduce((total, value) => total + value, 0) / values.length;
    expect(mean(towns.filter((id) => chosen.has(id)).map(front))).toBeLessThan(mean(towns.filter((id) => !chosen.has(id)).map(front)) / 2);
  });

  it('scales the objective count with the map', () => {
    const small = objectivesOf({ ...DEFAULT_NEW_GAME_REQUEST, map: { ...DEFAULT_NEW_GAME_REQUEST.map, width: 16, height: 12 } });
    const large = objectivesOf({ ...DEFAULT_NEW_GAME_REQUEST, map: { ...DEFAULT_NEW_GAME_REQUEST.map, width: 64, height: 48 } });
    expect(small.objectives.length).toBeGreaterThanOrEqual(2);
    expect(large.objectives.length).toBeGreaterThan(3 * small.objectives.length);
  });
});
