import { describe, expect, it } from 'vitest';
import { parseHexCoordinateId } from '../../src/core/index.js';
import { DEFAULT_NEW_GAME_REQUEST, prepareNewGame, type NewGameRequest } from '../../src/index.js';
import { GENERATED_ATTACK_SPLIT_SHIFT, GENERATED_LAND_HEXES_PER_OBJECTIVE_POINT, objectivePoints } from '../../src/game-flow/deployment.js';

const hexDistance = (first: string, second: string): number => {
  const a = parseHexCoordinateId(first as never);
  const b = parseHexCoordinateId(second as never);
  if (!a.ok || !b.ok) throw new Error('Invalid Hex ID.');
  const dq = a.value.q - b.value.q;
  const dr = a.value.r - b.value.r;
  return (Math.abs(dq) + Math.abs(dr) + Math.abs(dq + dr)) / 2;
};

const RAIL_EDGES = new Set(['edge:rail', 'edge:multi-track-rail']);

/** Railroad hexsides per Hex, and the port Hexes, of a generated map. */
const transportOf = (prepared: { readonly scenario: { readonly mapDefinition: { readonly hexsides: readonly { readonly hexsideId: unknown; readonly featureDefinitionIds: readonly unknown[] }[] } };
  readonly generatedMap: { readonly strategicRegions: { readonly ports: readonly { readonly hexId: unknown; readonly capacityTokens: number }[] } } }) => {
  const railDegree = new Map<string, number>();
  const multiTrack = new Set<string>();
  for (const { hexsideId, featureDefinitionIds } of prepared.scenario.mapDefinition.hexsides) {
    if (!featureDefinitionIds.some((id) => RAIL_EDGES.has(String(id)))) continue;
    const multi = featureDefinitionIds.some((id) => String(id) === 'edge:multi-track-rail');
    for (const hexId of String(hexsideId).split('|')) {
      railDegree.set(hexId, (railDegree.get(hexId) ?? 0) + 1);
      if (multi) multiTrack.add(hexId);
    }
  }
  const ports = new Map(prepared.generatedMap.strategicRegions.ports.map(({ hexId, capacityTokens }) => [String(hexId), capacityTokens] as const));
  return (hexId: string) => ({ portCapacityTokens: ports.get(hexId) ?? 0, railDegree: railDegree.get(hexId) ?? 0, multiTrack: multiTrack.has(hexId) });
};

const objectivesOf =(request: NewGameRequest, prepared = prepareNewGame(request)) => {
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
  it('places several objectives in settlements, worth more the larger the settlement and the more important the transport node', () => {
    const prepared = prepareNewGame(DEFAULT_NEW_GAME_REQUEST);
    if (!prepared.ok) throw new Error('Game must prepare.');
    const transport = transportOf(prepared.value);
    const { objectives } = objectivesOf(DEFAULT_NEW_GAME_REQUEST);
    expect(objectives.length).toBeGreaterThanOrEqual(4);
    const kind = { 'settlement:city': 'CITY', 'settlement:town': 'TOWN', 'settlement:village': 'VILLAGE' } as const;
    for (const { hexId, settlement, points } of objectives) {
      expect(Object.keys(kind)).toContain(settlement);
      expect(points).toBeGreaterThanOrEqual(objectivePoints(kind[settlement as keyof typeof kind], transport(String(hexId))));
      expect(points).toBeGreaterThan(0);
    }
    expect(objectives.some(({ settlement }) => settlement === 'settlement:city')).toBe(true);
    expect(new Set(objectives.map(({ points }) => points)).size).toBeGreaterThan(1);
    // A larger settlement and a more important transport node are each worth more.
    expect(objectivePoints('CITY', { portCapacityTokens: 0, railDegree: 0 })).toBeGreaterThan(objectivePoints('TOWN', { portCapacityTokens: 0, railDegree: 0 }));
    expect(objectivePoints('TOWN', { portCapacityTokens: 0, railDegree: 2 })).toBeGreaterThan(objectivePoints('TOWN', { portCapacityTokens: 0, railDegree: 0 }));
    expect(objectivePoints('TOWN', { portCapacityTokens: 0, railDegree: 3 })).toBeGreaterThan(objectivePoints('TOWN', { portCapacityTokens: 0, railDegree: 2 }));
    expect(objectivePoints('TOWN', { portCapacityTokens: 8, railDegree: 2 })).toBeGreaterThan(objectivePoints('TOWN', { portCapacityTokens: 0, railDegree: 2 }));
    expect(objectivePoints('VILLAGE', { portCapacityTokens: 0, railDegree: 0 })).toBe(0);
    // A larger port and a rail junction are worth more.
    expect(objectivePoints('TOWN', { portCapacityTokens: 16, railDegree: 0 })).toBeGreaterThan(objectivePoints('TOWN', { portCapacityTokens: 8, railDegree: 0 }));
    expect(objectivePoints('TOWN', { portCapacityTokens: 0, railDegree: 3 }) - objectivePoints('TOWN', { portCapacityTokens: 0, railDegree: 2 })).toBe(1);
    expect(objectivePoints('VILLAGE', { portCapacityTokens: 0, railDegree: 4 }) - objectivePoints('VILLAGE', { portCapacityTokens: 0, railDegree: 2 })).toBe(2);
    expect(objectivePoints('VILLAGE', { portCapacityTokens: 0, railDegree: 5 }) - objectivePoints('VILLAGE', { portCapacityTokens: 0, railDegree: 2 })).toBe(3);
    // A rail junction with a double-track railroad through it is worth one more; a non-junction is not.
    expect(objectivePoints('TOWN', { portCapacityTokens: 0, railDegree: 3, multiTrack: true }) - objectivePoints('TOWN', { portCapacityTokens: 0, railDegree: 3 })).toBe(1);
    for (const degree of [3, 4, 5, 6]) {
      const plain = objectivePoints('VILLAGE', { portCapacityTokens: 0, railDegree: degree }) - objectivePoints('VILLAGE', { portCapacityTokens: 0, railDegree: 0 });
      expect(plain).toBe(degree - 2 + 1);
    }
    expect(objectivePoints('TOWN', { portCapacityTokens: 0, railDegree: 2, multiTrack: true })).toBe(objectivePoints('TOWN', { portCapacityTokens: 0, railDegree: 2 }));
  });

  it('starts each objective held by the side whose garrison stands on it (13.3h, OOB 0.4.0)', () => {
    for (const style of ['TEMPERATE_INLAND', 'EASTERN_EUROPE'] as const) {
      const { objectives, players, warnings } = objectivesOf({ ...DEFAULT_NEW_GAME_REQUEST, map: { ...DEFAULT_NEW_GAME_REQUEST.map, style } });
      // Every objective has a garrison (user decision 2026-10-07: no objective is taken by simply walking in), and a
      // combat unit in a hex controls it, so none starts neutral even where it lies in the ground between the armies.
      expect(objectives.every(({ controller }) => controller !== null && players.includes(String(controller)))).toBe(true);
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
    // The armies start about ten hexes apart (user request 2026-10-07), so the neutral strip is narrower than it was.
    expect(neutral.length).toBeGreaterThan(land.length / 8);
    const railHexes = new Set(scenario.mapDefinition.hexsides
      .filter(({ featureDefinitionIds }) => featureDefinitionIds.some((id) => String(id).startsWith('edge:rail')))
      .flatMap(({ hexsideId }) => String(hexsideId).split('|')));
    expect(neutral.some((id) => railHexes.has(id))).toBe(true);
    // Every deployed piece stands on ground its own side controls.
    for (const piece of scenario.initialPieceState.pieces) {
      if (piece.location.kind === 'ON_MAP') expect(control.get(String(piece.location.hexId))).toBe(piece.ownerId);
    }
  });

  it('chooses railroad and port towns first (user, 2026-10-10), then those nearest the front', () => {
    const request = { ...DEFAULT_NEW_GAME_REQUEST, map: { ...DEFAULT_NEW_GAME_REQUEST.map, width: 64, height: 48 } };
    const prepared = prepareNewGame(request);
    if (!prepared.ok) throw new Error('Game must prepare.');
    const transport = transportOf(prepared.value);
    const { strategicRegions, mapDefinition } = prepared.value.generatedMap;
    const [first, second] = [strategicRegions.firstEntryHexIds[0]!, strategicRegions.secondEntryHexIds[0]!];
    const front = (hexId: string): number => Math.abs(hexDistance(hexId, first) - hexDistance(hexId, second));
    const towns = mapDefinition.hexes.filter(({ features }) => features.some(({ definitionId }) => String(definitionId) === 'settlement:town'))
      .map(({ id }) => String(id));
    const node = (hexId: string): boolean => transport(hexId).portCapacityTokens > 0 || transport(hexId).railDegree > 0;
    const chosen = new Set(prepared.value.deployment.objectiveHexIds.map(String));
    const share = (ids: readonly string[]): number => ids.filter(node).length / ids.length;
    // Most objective towns are transport nodes, a larger share than among the towns left out.
    expect(share(towns.filter((id) => chosen.has(id)))).toBeGreaterThanOrEqual(0.5);
    expect(share(towns.filter((id) => chosen.has(id)))).toBeGreaterThan(share(towns.filter((id) => !chosen.has(id))));
    // Among the railroad towns, the chosen ones lie nearer the front.
    const mean = (values: readonly number[]): number => values.reduce((total, value) => total + value, 0) / values.length;
    const railTowns = towns.filter((id) => transport(id).railDegree > 0);
    expect(mean(railTowns.filter((id) => chosen.has(id)).map(front))).toBeLessThan(mean(railTowns.filter((id) => !chosen.has(id)).map(front)));
  });

  it.each(['MEETING', 'ALLIED_ATTACKS', 'AXIS_ATTACKS'] as const)('%s retains ports and high-value defender nodes; only meeting engagements balance VP', (engagement) => {
    for (const inlandEntry of [{ allied: false, axis: true }, { allied: true, axis: false }, { allied: false, axis: false }, { allied: true, axis: true }]) {
      const request: NewGameRequest = { ...DEFAULT_NEW_GAME_REQUEST, engagement, map: { ...DEFAULT_NEW_GAME_REQUEST.map, sea: 'FLANK' }, inlandEntry, seaCap: { allied: 5, axis: 5 } };
      const prepared = prepareNewGame(request);
      if (!prepared.ok) throw new Error(JSON.stringify(prepared.error));
      const { objectives, held, players } = objectivesOf(request, prepared);
      const transport = transportOf(prepared.value);
      const regions = prepared.value.generatedMap.strategicRegions;
      const first = String(regions.firstEntryHexIds[0]!);
      const second = String(regions.secondEntryHexIds[0]!);
      const shift = Math.round(GENERATED_ATTACK_SPLIT_SHIFT * hexDistance(first, second));
      const split = engagement === 'ALLIED_ATTACKS' ? shift : engagement === 'AXIS_ATTACKS' ? -shift : 0;
      const inDefenderZone = (hexId: string) => engagement === 'MEETING'
        || (engagement === 'ALLIED_ATTACKS' ? hexDistance(hexId, second) - hexDistance(hexId, first) < split
          : hexDistance(hexId, second) - hexDistance(hexId, first) >= split);
      for (const hex of prepared.value.generatedMap.mapDefinition.hexes) {
        const settlement = hex.features.some(({ definitionId }) => ['settlement:town', 'settlement:village'].includes(String(definitionId)));
        if (settlement && transport(hex.id).railDegree >= 3 && inDefenderZone(hex.id)) {
          expect(objectives.find(({ hexId }) => hexId === hex.id)?.points).toBeGreaterThan(0);
        }
      }
      const legacyQuota = 2 * Math.max(2, Math.round(prepared.value.generatedMap.mapDefinition.hexes.filter((hex) => !hex.terrainDefinitionIds.includes('terrain:water' as never)).length / 2 / GENERATED_LAND_HEXES_PER_OBJECTIVE_POINT));
      expect(objectives.reduce((sum, { points }) => sum + points, 0)).toBeGreaterThan(legacyQuota);
      for (const port of prepared.value.generatedMap.strategicRegions.ports) {
        expect(objectives.find(({ hexId }) => hexId === port.hexId)?.points).toBeGreaterThan(0);
      }
      if (engagement === 'MEETING') expect(held(players[0]!)).toBe(held(players[1]!));
      if (engagement === 'MEETING') expect(held(players[0]!)).toBeGreaterThan(0);
      if (engagement !== 'MEETING') {
        const attacker = engagement === 'ALLIED_ATTACKS' ? players[0]! : players[1]!;
        const ports = new Set(prepared.value.generatedMap.strategicRegions.portHexIds);
        const own = objectives.filter(({ controller }) => controller === attacker);
        expect(own.every(({ hexId }) => ports.has(hexId))).toBe(true);
        const base = own.reduce((sum, { hexId, settlement }) => sum + objectivePoints(settlement === 'settlement:city' ? 'CITY' : settlement === 'settlement:town' ? 'TOWN' : 'VILLAGE', transport(hexId)), 0);
        expect(held(attacker)).toBe(base);
        expect(prepared.value.configuration.attackVictory!.attackerPoints).toBeGreaterThan(held(attacker));
      }
    }
  });

  it.each([1, 0x0c500001, 777])('balances small Eastern Europe maps even when candidates run out (seed %s)', (seed) => {
    const request: NewGameRequest = { ...DEFAULT_NEW_GAME_REQUEST,
      map: { ...DEFAULT_NEW_GAME_REQUEST.map, width: 16, height: 12, style: 'EASTERN_EUROPE' },
      seeds: { ...DEFAULT_NEW_GAME_REQUEST.seeds, map: seed } };
    const { held, players, warnings } = objectivesOf(request);
    expect(held(players[0]!)).toBe(held(players[1]!));
    expect(warnings.some((warning) => warning.startsWith('Objectives are unbalanced'))).toBe(false);
  });

  it('scales the objective count with the map', () => {
    const small = objectivesOf({ ...DEFAULT_NEW_GAME_REQUEST, map: { ...DEFAULT_NEW_GAME_REQUEST.map, width: 16, height: 12 } });
    const large = objectivesOf({ ...DEFAULT_NEW_GAME_REQUEST, map: { ...DEFAULT_NEW_GAME_REQUEST.map, width: 64, height: 48 } });
    expect(small.objectives.length).toBeGreaterThanOrEqual(2);
    // Big junctions and ports soak up VP first, so the count grows more slowly than the map; the VP total still scales.
    expect(large.objectives.length).toBeGreaterThan(2 * small.objectives.length);
    const vp = (entries: readonly { points: number }[]): number => entries.reduce((total, { points }) => total + points, 0);
    expect(vp(large.objectives)).toBeGreaterThan(3 * vp(small.objectives));
  });
});
