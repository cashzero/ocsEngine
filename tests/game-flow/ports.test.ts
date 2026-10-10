import { describe, expect, it } from 'vitest';
import {
  DEFAULT_NEW_GAME_REQUEST,
  createInitialGameState,
  formatHexId,
  friendlySupplySources,
  neighbors,
  parseHexCoordinateId,
  prepareNewGame,
  type Engagement,
  type GameState,
  type HexId,
  type NewGameRequest,
  type NewGameSea,
  type PlayerId,
} from '../../src/index.js';

const ALLIED = 'player:allied' as PlayerId;
const AXIS = 'player:axis' as PlayerId;

const started = (sea: NewGameSea, engagement: Engagement, extra: Partial<NewGameRequest> = {}) => {
  const request: NewGameRequest = { ...DEFAULT_NEW_GAME_REQUEST, engagement, map: { ...DEFAULT_NEW_GAME_REQUEST.map, sea }, ...extra };
  const prepared = prepareNewGame(request);
  if (!prepared.ok) throw new Error(JSON.stringify(prepared.error));
  const created = createInitialGameState(prepared.value.scenario, prepared.value.configuration, 1);
  if (!created.ok) throw new Error('generated game did not start');
  return { prepared: prepared.value, state: created.value };
};

const sourceKinds = (state: GameState, playerId: PlayerId): ReadonlySet<string> => new Set(friendlySupplySources(state, playerId).map(({ kind }) => kind));
const portHolders = (state: GameState) => state.mapState.features.filter(({ definitionId }) => String(definitionId) === 'facility:port')
  .map(({ controllerId, level }) => ({ controllerId, level }));

describe('New Game ports (19.0)', () => {
  it('prints ports with a capacity only on a map with a sea, each in a coastal place', () => {
    expect(started('NONE', 'MEETING').prepared.generatedMap.strategicRegions.ports).toEqual([]);
    const { prepared, state } = started('FLANK', 'MEETING');
    const { ports, settlementHexIds } = prepared.generatedMap.strategicRegions;
    expect(ports.length).toBeGreaterThanOrEqual(2);
    expect(ports.every(({ capacityTokens }) => [4, 8, 16].includes(capacityTokens))).toBe(true);
    const water = new Set(prepared.generatedMap.mapDefinition.hexes
      .filter(({ terrainDefinitionIds }) => String(terrainDefinitionIds[0]) === 'terrain:water').map(({ id }) => String(id)));
    for (const { hexId } of ports) {
      expect(settlementHexIds).toContain(hexId);
      const parsed = parseHexCoordinateId(hexId);
      expect(parsed.ok && neighbors(parsed.value).some((next) => water.has(formatHexId(next)))).toBe(true);
    }
    // Each starts held by the side whose zone it is in, with its printed capacity and no hits.
    expect(portHolders(state).map(({ level }) => level)).toEqual([...ports].sort((left, right) => String(left.hexId).localeCompare(String(right.hexId))).map(({ capacityTokens }) => capacityTokens));
    expect(portHolders(state).every(({ controllerId }) => controllerId === ALLIED || controllerId === AXIS)).toBe(true);
  });

  it.each([['ALLIED_ATTACKS', ALLIED, AXIS], ['AXIS_ATTACKS', AXIS, ALLIED]] as const)(
    'in an %s with the sea behind the attacker, the attacker has no land entry: its sources are its ports and it ships everything in',
    (engagement, attacker, defender) => {
      const { prepared, state } = started('ATTACKER', engagement);
      const side = (playerId: PlayerId) => prepared.scenario.players.find(({ id }) => id === playerId)!.sideDefinitionId;
      expect(prepared.scenario.entries.some(({ sideDefinitionId }) => sideDefinitionId === side(attacker))).toBe(false);
      expect(prepared.scenario.entries.some(({ sideDefinitionId }) => sideDefinitionId === side(defender))).toBe(true);
      expect(prepared.configuration.seaArrivals).toEqual([attacker]);
      expect(prepared.configuration.seaCapacity?.map(({ playerId }) => playerId)).toEqual([attacker]);
      expect(sourceKinds(state, attacker).has('MAP_EDGE')).toBe(false);
      expect(sourceKinds(state, attacker).has('PORT')).toBe(true);
      expect(sourceKinds(state, defender).has('PORT')).toBe(false);
      expect(portHolders(state).some(({ controllerId }) => controllerId === attacker)).toBe(true);
    },
  );

  it('along a flank both sides keep their land entries and ship between the ports they hold', () => {
    const { prepared, state } = started('FLANK', 'AXIS_ATTACKS');
    expect(prepared.configuration.seaArrivals).toBeUndefined();
    expect(prepared.configuration.seaCapacity?.map(({ playerId }) => playerId).sort()).toEqual([ALLIED, AXIS].sort());
    for (const playerId of [ALLIED, AXIS]) {
      const held = portHolders(state).filter(({ controllerId }) => controllerId === playerId).length;
      expect(sourceKinds(state, playerId).has('MAP_EDGE')).toBe(true);
      expect(sourceKinds(state, playerId).has('PORT')).toBe(held > 0);
    }
  });

  it('takes the player\'s Sea Cap, and refuses one out of range', () => {
    const { prepared } = started('ATTACKER', 'ALLIED_ATTACKS', { seaCap: { allied: 7, axis: 0 } });
    expect(prepared.configuration.seaCapacity).toEqual([{ playerId: ALLIED, points: 7 }]);
    const refused = prepareNewGame({ ...DEFAULT_NEW_GAME_REQUEST, map: { ...DEFAULT_NEW_GAME_REQUEST.map, sea: 'FLANK' }, seaCap: { allied: 99, axis: 1 } });
    expect(refused.ok ? [] : refused.error.map(({ code }) => code)).toContain('INVALID_SEA_CAP');
  });

  it('a hex beside the port is land, so the shipping panel and the bot can reach every port', () => {
    const { state } = started('ATTACKER', 'AXIS_ATTACKS');
    const land = new Set(state.scenario.mapDefinition.hexes.filter(({ terrainDefinitionIds }) => String(terrainDefinitionIds[0]) !== 'terrain:water').map(({ id }) => String(id)));
    for (const port of state.mapState.features) {
      const hexId = (port.location as { hexId: HexId }).hexId;
      expect(land.has(String(hexId))).toBe(true);
    }
  });
});
