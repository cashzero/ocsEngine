import { describe, expect, it } from 'vitest';
import {
  ALLIED,
  AXIS,
  applyRuleAction,
  atStep,
  buildGeneratedRuleState,
  friendlySupplySources,
  generatedPieceId,
  onGameTurn,
  parseGameStateJson,
  portAt,
  portCapacityTokens,
  portFeatureState,
  querySeaMoveOptions,
  reinforcementHexes,
  seaCapRemainingQuarters,
  serializeGameState,
  upsertMapFeatureState,
  type GameActionBody,
  type GameState,
  type HexId,
  type Placement,
  type PlayerId,
} from '../../src/index.js';

/**
 * Ports and shipping (19.0): capacity (19.0a), damage (19.0b), voluntary reduction (19.0c), repair (19.0d), ports as Supply
 * Sources (19.0e), Sea Cap (19.0f) and capture (9.14h). Ports are map feature states added to the rule fixture's map.
 */
const U = {
  alLeg: generatedPieceId('allied:f2-combat-1'), alTrk: generatedPieceId('allied:f1-combat-1'), alTrk2: generatedPieceId('allied:f1-combat-2'),
  alHq: generatedPieceId('allied:independent-hq-1'), alTruck: generatedPieceId('allied:independent-transport-1'),
  alDump: generatedPieceId('allied:independent-supply-1'),
  axTrk: generatedPieceId('axis:f1-combat-1'), axTruck: generatedPieceId('axis:independent-transport-1'),
};
const WEST = '1,6' as HexId;
const EAST = '10,6' as HexId;

interface PortSpec { readonly hexId: HexId; readonly tokens: number; readonly holder: PlayerId; readonly hits?: number }

/** Movement Phase of Allied with ports, Sea Cap and (optionally) Allied arriving only by sea. */
const seaState = (placement: Placement, ports: readonly PortSpec[], options: { readonly seaCap?: number; readonly bySea?: boolean; readonly declared?: boolean } = {}): GameState => {
  const base = buildGeneratedRuleState(placement);
  let mapState = base.mapState;
  for (const { hexId, tokens, holder, hits } of ports) mapState = upsertMapFeatureState(mapState, { ...portFeatureState(hexId, tokens, holder), damage: hits ?? 0 });
  const configuration = {
    ...base.configuration,
    seaCapacity: [{ playerId: ALLIED, points: options.seaCap ?? 3 }, { playerId: AXIS, points: options.seaCap ?? 3 }],
    ...(options.bySea ? { seaArrivals: [ALLIED] } : {}),
  };
  const scenario = options.declared
    ? { ...base.scenario, sources: [...base.scenario.sources, ...ports.map(({ hexId }, index) => ({ id: `source:test-port:${index}` as never, hexId, sideDefinitionId: null }))] }
    : base.scenario;
  return atStep({ ...base, mapState, configuration, scenario, pendingDecision: null }, 'MOVEMENT', 'MOVEMENT', ALLIED);
};

const ship = (state: GameState, body: Partial<Extract<GameActionBody, { kind: 'SEA_MOVE' }>>, actor: PlayerId = ALLIED) => applyRuleAction(state, actor, {
  kind: 'SEA_MOVE', fromHexId: WEST, toHexId: EAST, unitIds: [], supply: [], ...body,
} as GameActionBody);
const codes = (result: ReturnType<typeof ship>): readonly string[] => result.ok ? [] : result.violations.map(({ code }) => code);
const piece = (state: GameState, id: string) => state.pieceState.pieces.find((candidate) => candidate.id === id)!;
const SUPPLY = [{ sourcePieceId: U.alDump, tokens: 4 }];
const TWO_PORTS: readonly PortSpec[] = [{ hexId: WEST, tokens: 8, holder: ALLIED }, { hexId: EAST, tokens: 8, holder: ALLIED }];

describe('OCS 19.0f Sea Cap and 19.0a port capacity', () => {
  it('ships 1 SP from port to port for 1 Sea Cap point, counting it against both ports', () => {
    const start = seaState({ [U.alDump]: [WEST, null] }, TWO_PORTS);
    expect(seaCapRemainingQuarters(start, ALLIED)).toBe(12);
    const shipped = ship(start, { supply: SUPPLY });
    expect(shipped.ok).toBe(true);
    if (!shipped.ok) return;
    expect(seaCapRemainingQuarters(shipped.state, ALLIED)).toBe(8);
    expect(shipped.events.find(({ kind }) => kind === 'SEA_MOVED')).toMatchObject({ tokens: 4, quarters: 4, fromHexId: WEST, toHexId: EAST });
    expect(shipped.state.pieceState.pieces.some((candidate) => candidate.ownerId === ALLIED && candidate.location.kind === 'ON_MAP'
      && candidate.location.hexId === EAST && candidate.resourceQuantity === 4)).toBe(true);
    expect(shipped.state.sea?.portUse.map(({ hexId, tokens }) => [hexId, tokens]).sort()).toEqual([[EAST, 4], [WEST, 4]].sort());
    // The SP may not be shipped again this phase (12.2a), and survives a save.
    const saved = serializeGameState(shipped.state);
    expect(saved.ok).toBe(true);
    if (!saved.ok) return;
    const reloaded = parseGameStateJson(saved.value);
    expect(reloaded.ok ? reloaded.value.sea : reloaded.error).toEqual(shipped.state.sea);
  });

  it('refuses a shipment over the port capacity left, but lets one large combat unit use a whole unused port', () => {
    const narrow: readonly PortSpec[] = [{ hexId: WEST, tokens: 2, holder: ALLIED }, { hexId: EAST, tokens: 8, holder: ALLIED }];
    const start = seaState({ [U.alDump]: [WEST, null], [U.alTrk]: [WEST, 'MOVE'] }, narrow);
    expect(codes(ship(start, { supply: SUPPLY }))).toContain('PORT_CAPACITY_EXCEEDED');
    // 19.0a: a port with capacity above zero may use all of it for a single combat unit larger than that capacity.
    const big = ship(start, { unitIds: [U.alTrk] });
    expect(big.ok).toBe(true);
    if (!big.ok) return;
    expect(big.state.sea?.portUse.find(({ hexId }) => hexId === WEST)?.oversized).toBe(true);
    expect(codes(ship(big.state, { supply: [{ sourcePieceId: U.alDump, tokens: 1 }] }))).toContain('PORT_UNAVAILABLE');
  });

  it('ships only Move Mode units that have not moved, which then cannot move (19.0f A, C)', () => {
    const start = seaState({ [U.alLeg]: [WEST, 'COMBAT'], [U.alTrk]: [WEST, 'MOVE'] }, TWO_PORTS);
    expect(codes(ship(start, { unitIds: [U.alLeg] }))).toContain('UNIT_CANNOT_SHIP');
    const shipped = ship(start, { unitIds: [U.alTrk] });
    expect(shipped.ok).toBe(true);
    if (!shipped.ok) return;
    expect(piece(shipped.state, U.alTrk).location).toEqual({ kind: 'ON_MAP', hexId: EAST });
    expect(applyRuleAction(shipped.state, ALLIED, { kind: 'MOVE_PIECE', pieceId: U.alTrk, path: [EAST, '11,6' as HexId] }).ok).toBe(false);
  });

  it('cannot use a port in an enemy ZOC (19.0f F) or one the enemy holds, and Sea Cap is spent only in the Movement Phase', () => {
    const start = seaState({ [U.alDump]: [WEST, null], [U.axTrk]: ['11,6', 'COMBAT'] }, TWO_PORTS);
    expect(codes(ship(start, { supply: SUPPLY }))).toContain('PORT_UNAVAILABLE');
    const enemyPort = seaState({ [U.alDump]: [WEST, null] }, [{ hexId: WEST, tokens: 8, holder: ALLIED }, { hexId: EAST, tokens: 8, holder: AXIS }]);
    expect(codes(ship(enemyPort, { supply: SUPPLY }))).toContain('PORT_UNAVAILABLE');
    const combat = atStep(seaState({ [U.alDump]: [WEST, null] }, TWO_PORTS), 'COMBAT', 'COMBAT', ALLIED);
    expect(codes(ship(combat, { supply: SUPPLY }))).toContain('INVALID_SEA_PHASE');
  });

  it('refuses a shipment the Sea Cap left cannot pay', () => {
    const poor = seaState({ [U.alDump]: [WEST, null] }, TWO_PORTS, { seaCap: 0 });
    expect(codes(ship(poor, { supply: SUPPLY }))).toContain('SEA_CAP_EXCEEDED');
  });
});

describe('A side the sea lies behind lands everything by ship', () => {
  const inBox = (state: GameState, id: string): GameState => {
    const boxId = state.configuration.reinforcementBoxes.find(({ playerId }) => playerId === ALLIED)!.boxId;
    return { ...state, pieceState: { ...state.pieceState, pieces: state.pieceState.pieces.map((candidate) => candidate.id === id
      ? { ...candidate, location: { kind: 'OFF_MAP_BOX' as const, boxId }, resourceQuantity: candidate.resourceQuantity === null ? null : 8 } : candidate) } };
  };

  it('places nothing in the Reinforcement Phase and ships SP and units from the Box to a port in the Movement Phase', () => {
    const base = onGameTurn(inBox(inBox(seaState({}, TWO_PORTS, { bySea: true }), U.alDump), U.alTrk), 2);
    expect(reinforcementHexes(atStep(base, 'REINFORCEMENT', 'NONE', ALLIED), ALLIED, U.alTrk)).toEqual([]);
    const options = querySeaMoveOptions(base, ALLIED, null).value!;
    expect(options.problem).toBeNull();
    expect(options.units.map(({ pieceId }) => pieceId)).toContain(U.alTrk);
    expect(options.dumps.map(({ pieceId }) => pieceId)).toContain(U.alDump);
    const landed = ship(base, { fromHexId: null, toHexId: EAST, supply: [{ sourcePieceId: U.alDump, tokens: 8 }] });
    expect(landed.ok).toBe(true);
    if (!landed.ok) return;
    // The Box needs no loading port: only the unloading port's capacity counts.
    expect(landed.state.sea?.portUse.map(({ hexId }) => hexId)).toEqual([EAST]);
    const full = ship(landed.state, { fromHexId: null, toHexId: EAST, unitIds: [U.alTrk] });
    expect(codes(full)).toContain('PORT_UNAVAILABLE');
    const other = ship(landed.state, { fromHexId: null, toHexId: WEST, unitIds: [U.alTrk] });
    expect(other.ok).toBe(true);
    if (other.ok) expect(piece(other.state, U.alTrk).location).toEqual({ kind: 'ON_MAP', hexId: WEST });
  });

  it('a side that arrives over land cannot ship from the Box', () => {
    const base = onGameTurn(inBox(seaState({}, TWO_PORTS), U.alDump), 2);
    expect(codes(ship(base, { fromHexId: null, supply: [{ sourcePieceId: U.alDump, tokens: 4 }] }))).toContain('NO_SEA_ARRIVALS');
  });
});

describe('9.14h capture and 19.0e ports as Supply Sources', () => {
  it('an Attack-Capable unit entering an enemy port captures it; a truck may not enter (4.4c)', () => {
    const start = atStep(seaState({ [U.axTrk]: ['11,6', 'MOVE'], [U.axTruck]: ['11,6', null] }, TWO_PORTS), 'MOVEMENT', 'MOVEMENT', AXIS);
    const truck = applyRuleAction(start, AXIS, { kind: 'MOVE_PIECE', pieceId: U.axTruck, path: ['11,6' as HexId, EAST] });
    expect(truck.ok).toBe(false);
    if (!truck.ok) expect(truck.violations.map(({ code }) => code)).toContain('NON_COMBAT_ENEMY_REQUIRES_ATTACK_CAPABLE');
    const moved = applyRuleAction(start, AXIS, { kind: 'MOVE_PIECE', pieceId: U.axTrk, path: ['11,6' as HexId, EAST] });
    expect(moved.ok).toBe(true);
    if (!moved.ok) return;
    expect(moved.events.some(({ kind }) => kind === 'PORT_CAPTURED')).toBe(true);
    expect(portAt(moved.state, EAST)?.controllerId).toBe(AXIS);
  });

  it('a declared port is a Supply Source only for the side holding it, and only with 1 SP of capacity left', () => {
    const start = seaState({}, [{ hexId: WEST, tokens: 8, holder: ALLIED }, { hexId: EAST, tokens: 8, holder: AXIS }], { declared: true });
    const ports = (state: GameState, playerId: PlayerId) => friendlySupplySources(state, playerId).filter(({ kind }) => kind === 'PORT').map(({ hexId }) => hexId);
    expect(ports(start, ALLIED)).toEqual([WEST]);
    expect(ports(start, AXIS)).toEqual([EAST]);
    // Three hits leave a 2 SP port 40%, 3T: below 1 SP it is no longer a source (19.0e).
    const damaged = seaState({}, [{ hexId: WEST, tokens: 8, holder: ALLIED, hits: 3 }], { declared: true });
    expect(portCapacityTokens(portAt(damaged, WEST)!)).toBe(3);
    expect(ports(damaged, ALLIED)).toEqual([]);
  });
});

describe('19.0b-d port damage, voluntary reduction and repair', () => {
  it('hits leave 80%, 60%, 40% and 20% of the printed capacity, rounded to the nearest Token (Port Damage table)', () => {
    const port = portFeatureState(WEST, 8, ALLIED);
    expect([0, 1, 2, 3, 4].map((damage) => portCapacityTokens({ ...port, damage }))).toEqual([8, 6, 5, 3, 2]);
    // The chart's own example: 80% of 1 SP is 3T.
    expect(portCapacityTokens({ ...portFeatureState(WEST, 4, ALLIED), damage: 1 })).toBe(3);
    expect([0, 1, 2, 3, 4].map((damage) => portCapacityTokens({ ...portFeatureState(WEST, 16, ALLIED), damage }))).toEqual([16, 13, 10, 6, 3]);
  });

  it('one RE of Combat Mode units in the port inflicts one hit a turn on it', () => {
    const start = seaState({ [U.alTrk]: [WEST, 'COMBAT'], [U.alTrk2]: [WEST, 'COMBAT'] }, TWO_PORTS);
    const reduce = (state: GameState) => applyRuleAction(state, ALLIED, { kind: 'REDUCE_PORT', hexId: WEST, pieceIds: [U.alTrk, U.alTrk2], engineerId: null });
    const once = reduce(start);
    expect(once.ok).toBe(true);
    if (!once.ok) return;
    expect(portAt(once.state, WEST)?.damage).toBe(1);
    const twice = reduce(once.state);
    expect(twice.ok).toBe(false);
  });

  it('an Engineer-Capable HQ repairs one hit a turn for 1 SP', () => {
    const start = seaState({ [U.alHq]: [WEST, 'COMBAT'], [U.alDump]: [WEST, null] }, [{ hexId: WEST, tokens: 8, holder: ALLIED, hits: 2 }, { hexId: EAST, tokens: 8, holder: ALLIED }]);
    const repair = (state: GameState) => applyRuleAction(state, ALLIED, { kind: 'REPAIR_PORT', hexId: WEST, engineerId: U.alHq, payments: [{ sourcePieceId: U.alDump, tokens: 4 }] });
    const repaired = repair(start);
    expect(repaired.ok).toBe(true);
    if (!repaired.ok) return;
    expect(portAt(repaired.state, WEST)?.damage).toBe(1);
    expect(piece(repaired.state, U.alDump).location.kind).toBe('ELIMINATED');
    expect(repair(repaired.state).ok).toBe(false);
  });
});
