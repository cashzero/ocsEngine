import { describe, expect, it } from 'vitest';
import {
  DEFAULT_NEW_GAME_REQUEST,
  createInitialGameState,
  formatHexId,
  friendlySupplySources,
  landingPortDepth,
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
    'in an %s whose attacker has no inland entry and whose defender has no Sea Cap, the attacker lands by sea and only it uses ports',
    (engagement, attacker, defender) => {
      const attackerKey = attacker === ALLIED ? 'allied' : 'axis';
      const { prepared, state } = started('FLANK', engagement, {
        inlandEntry: { allied: attackerKey !== 'allied', axis: attackerKey !== 'axis' },
        seaCap: { allied: attackerKey === 'allied' ? 5 : 0, axis: attackerKey === 'axis' ? 5 : 0 },
      });
      const side = (playerId: PlayerId) => prepared.scenario.players.find(({ id }) => id === playerId)!.sideDefinitionId;
      expect(prepared.generatedMap.options.sea).toBe('NORTH');
      expect(prepared.scenario.entries.some(({ sideDefinitionId }) => sideDefinitionId === side(attacker))).toBe(false);
      expect(prepared.scenario.entries.some(({ sideDefinitionId }) => sideDefinitionId === side(defender))).toBe(true);
      expect(prepared.configuration.seaArrivals).toEqual([attacker]);
      expect(prepared.configuration.seaCapacity).toEqual([{ playerId: attacker, points: 5 }]);
      expect(sourceKinds(state, attacker).has('MAP_EDGE')).toBe(false);
      expect(sourceKinds(state, attacker).has('PORT')).toBe(true);
      expect(sourceKinds(state, defender).has('PORT')).toBe(false);
      expect(portHolders(state).some(({ controllerId }) => controllerId === attacker)).toBe(true);
    },
  );

  it('gives a side without inland entry a port near its own edge, even in a meeting engagement', () => {
    for (const [key, edge] of [['allied', 'WEST'], ['axis', 'EAST']] as const) {
      const { prepared, state } = started('FLANK', 'MEETING', { inlandEntry: { allied: key !== 'allied', axis: key !== 'axis' } });
      const width = prepared.request.map.width;
      const near = prepared.generatedMap.strategicRegions.portHexIds.filter((hexId) => {
        const parsed = parseHexCoordinateId(hexId);
        const column = parsed.ok ? parsed.value.q + Math.floor(parsed.value.r / 2) : Number.NaN;
        return (edge === 'WEST' ? column : width - 1 - column) <= landingPortDepth(width);
      });
      expect(near.length).toBeGreaterThan(0);
      expect(prepared.generatedMap.options.landingEdges).toEqual([edge]);
      expect(String(prepared.scenario.id).endsWith(`:by-sea-${key}`)).toBe(true);
      const player = key === 'allied' ? ALLIED : AXIS;
      expect(prepared.configuration.seaArrivals).toEqual([player]);
      expect(portHolders(state).some(({ controllerId }) => controllerId === player)).toBe(true);
    }
  });

  it('both sides may land by sea', () => {
    const { prepared, state } = started('FLANK', 'MEETING', { inlandEntry: { allied: false, axis: false } });
    expect(prepared.scenario.entries).toEqual([]);
    expect(prepared.configuration.seaArrivals).toEqual([ALLIED, AXIS]);
    for (const playerId of [ALLIED, AXIS]) expect(sourceKinds(state, playerId).has('PORT')).toBe(true);
  });

  it('with inland entry on both sides and Sea Cap for both, each keeps its land entries and ships between the ports it holds', () => {
    const { prepared, state } = started('FLANK', 'AXIS_ATTACKS');
    expect(prepared.configuration.seaArrivals).toBeUndefined();
    expect(prepared.configuration.seaCapacity?.map(({ playerId }) => playerId).sort()).toEqual([ALLIED, AXIS].sort());
    for (const playerId of [ALLIED, AXIS]) {
      const held = portHolders(state).filter(({ controllerId }) => controllerId === playerId).length;
      expect(sourceKinds(state, playerId).has('MAP_EDGE')).toBe(true);
      expect(sourceKinds(state, playerId).has('PORT')).toBe(held > 0);
    }
  });

  it('a side with Sea Cap 0 cannot use ports, and with none at all no port is a source', () => {
    const one = started('FLANK', 'ALLIED_ATTACKS', { seaCap: { allied: 3, axis: 0 } });
    expect(one.prepared.configuration.seaCapacity).toEqual([{ playerId: ALLIED, points: 3 }]);
    expect(sourceKinds(one.state, AXIS).has('PORT')).toBe(false);
    const none = started('FLANK', 'MEETING', { seaCap: { allied: 0, axis: 0 } });
    expect(none.prepared.configuration.seaCapacity).toBeUndefined();
    expect(none.prepared.scenario.sources.some(({ id }) => String(id).includes(':port:'))).toBe(false);
  });

  it('takes the player\'s Sea Cap, and refuses one out of range, 0 for a side without inland entry, or no inland entry without a sea', () => {
    const { prepared } = started('FLANK', 'ALLIED_ATTACKS', { seaCap: { allied: 7, axis: 2 } });
    expect(prepared.configuration.seaCapacity).toEqual([{ playerId: ALLIED, points: 7 }, { playerId: AXIS, points: 2 }]);
    const codes = (extra: Partial<NewGameRequest>, sea: NewGameSea = 'FLANK') => {
      const refused = prepareNewGame({ ...DEFAULT_NEW_GAME_REQUEST, map: { ...DEFAULT_NEW_GAME_REQUEST.map, sea }, ...extra });
      return refused.ok ? [] : refused.error.map(({ code }) => code);
    };
    expect(codes({ seaCap: { allied: 99, axis: 1 } })).toContain('INVALID_SEA_CAP');
    expect(codes({ seaCap: { allied: 0, axis: 1 }, inlandEntry: { allied: false, axis: true } })).toEqual(['SEA_CAP_REQUIRED']);
    expect(codes({ inlandEntry: { allied: true, axis: false } }, 'NONE')).toEqual(['INLAND_ENTRY_REQUIRED']);
  });

  it('a hex beside the port is land, so the shipping panel and the bot can reach every port', () => {
    const { state } = started('FLANK', 'AXIS_ATTACKS', { inlandEntry: { allied: true, axis: false } });
    const land = new Set(state.scenario.mapDefinition.hexes.filter(({ terrainDefinitionIds }) => String(terrainDefinitionIds[0]) !== 'terrain:water').map(({ id }) => String(id)));
    for (const port of state.mapState.features) {
      const hexId = (port.location as { hexId: HexId }).hexId;
      expect(land.has(String(hexId))).toBe(true);
    }
  });
});
