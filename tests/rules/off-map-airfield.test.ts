import { describe, expect, it } from 'vitest';
import {
  AIR_NEW_GAME_REQUEST,
  AXIS,
  KEEP_LOCATION,
  OFF_MAP_AIRFIELD_DISTANCE,
  activeAircraftLimit,
  airDistance,
  airEntryHexes,
  airLaunchHex,
  applyRuleAction,
  arrivingReinforcements,
  atOffMapAirfield,
  atStep,
  buildGeneratedRuleState,
  generatedPieceId,
  hexDistanceBetween,
  isActiveAircraft,
  isOffMapAirfield,
  onGameTurn,
  parseGameStateJson,
  ruleEngine,
  refitCapacity,
  refitCandidates,
  serializeGameState,
  settleDecisions,
  withAircraftActive,
  type GameState,
  type HexId,
  type NewGameRequest,
  type PieceId,
  type TransitionResult,
} from '../../src/index.js';

/**
 * The attacker's off-map airfield (docs/quality/evidence/engagements-plan-2026-10-07/README.md §6, AIR-OM2 and AIR-OM3): Axis attacks
 * with an airfield and aircraft in an off-map box; Allied defends with its on-map Air Force.
 */
const REQUEST: NewGameRequest = { ...AIR_NEW_GAME_REQUEST, engagement: 'AXIS_ATTACKS' };
const id = (fragment: string) => generatedPieceId(fragment, REQUEST);
const U = {
  field: id('axis:off-map-airfield'), xF1: id('axis:off-map-fighter-1'), xF2: id('axis:off-map-fighter-2'),
  xB1: id('axis:off-map-bomber-1'), xB2: id('axis:off-map-bomber-2'),
  aBase: id('allied:air-base-1'), aF1: id('allied:air-fighter-1'), aB1: id('allied:air-bomber-1'), aLeg: id('allied:f2-combat-1'),
  aSup: id('allied:independent-supply-1'),
};
const OFF_MAP = [U.field, U.xF1, U.xF2, U.xB1, U.xB2];

/** Hex in the map's fourth row at printed column `column` (0-based). */
const hex = (column: number, row = 4): HexId => `${column - Math.floor(row / 2)},${row}` as HexId;
const ALLIED_BASE = hex(1);
const TARGET = hex(8);

const codes = (result: TransitionResult): readonly string[] => result.ok ? [] : result.violations.map(({ code }) => code);
const ok = (result: TransitionResult): GameState => {
  expect(result.ok, result.ok ? '' : result.violations.map(({ code, message }) => `${code}: ${message}`).join('; ')).toBe(true);
  return result.state;
};
const piece = (state: GameState, pieceId: string) => state.pieceState.pieces.find((candidate) => candidate.id === pieceId)!;
const inactive = (state: GameState, ...pieceIds: PieceId[]): GameState => ({
  ...state,
  pieceState: { ...state.pieceState, pieces: state.pieceState.pieces.map((entry) => pieceIds.includes(entry.id) ? withAircraftActive(entry, false) : entry) },
});

const fieldState = (extra: Record<string, readonly [string, null | 'COMBAT' | 'MOVE', string?]> = {}): GameState => buildGeneratedRuleState({
  ...Object.fromEntries(OFF_MAP.map((pieceId) => [pieceId, [KEEP_LOCATION, null] as const])),
  [U.aBase]: [ALLIED_BASE, null], [U.aF1]: [ALLIED_BASE, null], [U.aB1]: [ALLIED_BASE, null], [U.aSup]: [ALLIED_BASE, null],
  [U.aLeg]: [TARGET, 'COMBAT', 'combat'],
  ...extra,
}, {}, { request: REQUEST });

describe('off-map airfield (AIR-OM2)', () => {
  it('is off the map: the airfield and its aircraft stand in an off-map box, not on any hex', () => {
    const state = fieldState();
    for (const pieceId of OFF_MAP) expect(piece(state, pieceId).location.kind).toBe('OFF_MAP_BOX');
    expect(isOffMapAirfield(state, piece(state, U.field))).toBe(true);
    expect([U.xF1, U.xF2, U.xB1, U.xB2].every((pieceId) => atOffMapAirfield(state, piece(state, pieceId)))).toBe(true);
  });

  it('holds and refits any number of aircraft', () => {
    const state = fieldState();
    expect(activeAircraftLimit(state, piece(state, U.field))).toBeGreaterThanOrEqual(99);
    expect(refitCapacity(state, piece(state, U.field))).toBeGreaterThanOrEqual(99);
  });

  it('keeps its aircraft based there: they are never offered as arriving reinforcements', () => {
    const state = onGameTurn(atStep(fieldState(), 'REINFORCEMENT', 'NONE', AXIS), 3);
    expect(arrivingReinforcements(state, AXIS).filter(({ id: pieceId }) => OFF_MAP.includes(pieceId))).toEqual([]);
  });

  it('refits every Inactive aircraft from its own stocks, spending no SP', () => {
    const state = atStep(inactive(fieldState(), U.xF1, U.xF2, U.xB1, U.xB2), 'AIRCRAFT_REFIT', 'NONE', AXIS);
    const candidate = refitCandidates(state, AXIS).find(({ base }) => base.id === U.field);
    expect(candidate?.aircraftIds).toHaveLength(4);
    expect(candidate?.sourceIds).toEqual([U.field]);
    const result = applyRuleAction(state, AXIS, { kind: 'REFIT_AIRCRAFT', baseId: U.field, aircraftIds: [U.xF1, U.xF2, U.xB1, U.xB2], sourcePieceId: U.field });
    const after = ok(result);
    expect([U.xF1, U.xF2, U.xB1, U.xB2].every((pieceId) => isActiveAircraft(piece(after, pieceId)))).toBe(true);
    expect(result.ok && result.events.some(({ kind }) => kind === 'SUPPLY_SPENT')).toBe(false);
    expect(piece(after, U.xF1).location).toEqual(piece(state, U.xF1).location);
  });
});

describe('flying from the off-map airfield (AIR-OM3)', () => {
  it('counts range from the friendly AEP, one hex further', () => {
    const state = fieldState();
    const entries = airEntryHexes(state, AXIS);
    expect(entries).toHaveLength(1);
    const nearest = Math.min(...entries.map((hexId) => hexDistanceBetween(hexId, TARGET)));
    expect(airDistance(state, piece(state, U.xB1), TARGET)).toBe(nearest + OFF_MAP_AIRFIELD_DISTANCE);
  });

  it('does not use ordinary ground entries or enemy AEPs when a friendly AEP is absent', () => {
    const original = atStep(fieldState(), 'MOVEMENT', 'BARRAGE', AXIS);
    const state: GameState = { ...original, scenario: { ...original.scenario, mapDefinition: {
      ...original.scenario.mapDefinition, hexes: original.scenario.mapDefinition.hexes.map((hex) => ({
        ...hex, features: hex.features.filter(({ definitionId }) => definitionId !== 'air-entry:second'),
      })),
    } } };
    expect(state.scenario.entries.length).toBeGreaterThan(0);
    expect(state.scenario.mapDefinition.hexes.some(({ features }) => features.some(({ definitionId }) => definitionId === 'air-entry:first'))).toBe(true);
    expect(airLaunchHex(state, piece(state, U.xB1), TARGET)).toBeNull();
    expect(airDistance(state, piece(state, U.xB1), TARGET)).toBe(Infinity);
    expect(codes(applyRuleAction(state, AXIS, { kind: 'DECLARE_AIR_MISSION', mission: 'BARRAGE', aircraftIds: [U.xB1], targetHexId: TARGET, target: 'COMBAT_UNITS' })))
      .toContain('NO_AIR_ENTRY_POINT');
    expect(ruleEngine.getActionCandidates(state, { actorId: AXIS, kind: 'DECLARE_AIR_MISSION', pieceId: null, budget: 200 }).actions).toEqual([]);
  });

  it('ignores a nearer ground entry and launches exclusively from the AEP', () => {
    const state = fieldState();
    const aep = airEntryHexes(state, AXIS)[0]!;
    const other = state.scenario.entries.find(({ sideDefinitionId, hexId }) => String(sideDefinitionId) === 'side:axis' && hexId !== aep)!;
    expect(other).toBeDefined();
    expect(airLaunchHex(state, piece(state, U.xB1), other.hexId)).toBe(aep);
    expect(airDistance(state, piece(state, U.xB1), other.hexId)).toBe(hexDistanceBetween(aep, other.hexId) + 1);
  });

  it('rejects an otherwise reachable ground-entry target when it exceeds range from the AEP', () => {
    const original = fieldState();
    const aep = airEntryHexes(original, AXIS)[0]!;
    const target = original.scenario.entries.find(({ sideDefinitionId, hexId }) => String(sideDefinitionId) === 'side:axis' && hexId !== aep)!.hexId;
    const base = atStep(fieldState({ [U.aLeg]: [target, 'COMBAT', 'combat'] }), 'MOVEMENT', 'BARRAGE', AXIS);
    const state: GameState = { ...base, scenario: { ...base.scenario, pieceCatalog: {
      ...base.scenario.pieceCatalog, definitions: base.scenario.pieceCatalog.definitions.map((definition) => definition.family !== 'AIR' ? definition : {
        ...definition, faces: definition.faces.map((face) => ({ ...face, steps: face.steps.map((step) => ({ ...step, range: 1 })) })),
      }),
    } } };
    expect(airDistance(state, piece(state, U.xB1), target)).toBeGreaterThan(1);
    expect(codes(applyRuleAction(state, AXIS, { kind: 'DECLARE_AIR_MISSION', mission: 'BARRAGE', aircraftIds: [U.xB1], targetHexId: target, target: 'COMBAT_UNITS' })))
      .toContain('MISSION_OUT_OF_RANGE');
    expect(ruleEngine.getActionCandidates(state, { actorId: AXIS, kind: 'DECLARE_AIR_MISSION', pieceId: U.xB1, budget: 200 }).actions
      .some((action) => action.kind === 'DECLARE_AIR_MISSION' && action.targetHexId === target)).toBe(false);
  });

  it('flies a barrage at an enemy unit and comes back to the off-map box Inactive', () => {
    const state = atStep(fieldState(), 'MOVEMENT', 'BARRAGE', AXIS);
    const offered = ruleEngine.getActionCandidates(state, { actorId: AXIS, kind: 'DECLARE_AIR_MISSION', pieceId: null, budget: 200 }).actions;
    expect(offered.some((action) => action.kind === 'DECLARE_AIR_MISSION' && action.targetHexId === TARGET && action.aircraftIds.includes(U.xB1))).toBe(true);
    const declared = ok(applyRuleAction(state, AXIS, { kind: 'DECLARE_AIR_MISSION', mission: 'BARRAGE', aircraftIds: [U.xB1, U.xB2], targetHexId: TARGET, target: 'COMBAT_UNITS' }));
    expect(declared.activeTransaction?.air?.aircraft.every(({ baseHexId }) => airEntryHexes(state, AXIS).includes(baseHexId))).toBe(true);
    const settled = settleDecisions(declared, (decision) => decision.kind === 'INTERCEPTION' ? 'decline' : decision.options[0]!.id).state;
    expect(settled.activeTransaction).toBeNull();
    for (const pieceId of [U.xB1, U.xB2]) {
      const plane = piece(settled, pieceId);
      if (plane.location.kind === 'ELIMINATED') continue;
      expect(plane.location).toEqual(piece(state, pieceId).location);
      expect(isActiveAircraft(plane)).toBe(false);
    }
  });

  it('cannot base-transfer away from the off-map airfield', () => {
    const state = atStep(fieldState(), 'MOVEMENT', 'MOVEMENT', AXIS);
    expect(codes(applyRuleAction(state, AXIS, { kind: 'DECLARE_AIR_MISSION', mission: 'BASE_TRANSFER', aircraftIds: [U.xF1], targetHexId: ALLIED_BASE, target: null })))
      .toContain('OFF_MAP_AIRFIELD_TRANSFER');
  });

  it('keeps the airfield and its aircraft off the map through a save', () => {
    const state = fieldState();
    const serialized = serializeGameState(state);
    if (!serialized.ok) throw new Error('state did not serialize');
    const parsed = parseGameStateJson(serialized.value);
    if (!parsed.ok) throw new Error('state did not parse');
    expect(isOffMapAirfield(parsed.value, piece(parsed.value, U.field))).toBe(true);
    expect(atOffMapAirfield(parsed.value, piece(parsed.value, U.xF1))).toBe(true);
  });
});
