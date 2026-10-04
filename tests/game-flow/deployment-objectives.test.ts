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

  it('starts both sides holding the same VP, every objective held by the side whose zone it is in', () => {
    for (const style of ['TEMPERATE_INLAND', 'EASTERN_EUROPE'] as const) {
      const { objectives, held, players, warnings } = objectivesOf({ ...DEFAULT_NEW_GAME_REQUEST, map: { ...DEFAULT_NEW_GAME_REQUEST.map, style } });
      expect(objectives.every(({ controller }) => controller !== null)).toBe(true);
      expect(held(players[0]!)).toBeGreaterThan(0);
      expect(held(players[0]!)).toBe(held(players[1]!));
      expect(warnings.some((warning) => warning.startsWith('Objectives are unbalanced'))).toBe(false);
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
    expect(large.held(large.players[0]!)).toBe(large.held(large.players[1]!));
  });
});
