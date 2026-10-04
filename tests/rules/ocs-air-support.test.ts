import { describe, expect, it } from 'vitest';
import {
  ALLIED,
  AXIS,
  FULL_AIR_NEW_GAME_REQUEST,
  applyRuleAction,
  arrivingReinforcements,
  atStep,
  onGameTurn,
  buildGeneratedRuleState,
  generatedPieceId,
  isActiveAircraft,
  reinforcementHexes,
  ruleEngine,
  withAircraftActive,
  type GameState,
  type HexId,
  type PieceId,
  type PieceState,
  type TransitionResult,
} from '../../src/index.js';

const REQUEST = FULL_AIR_NEW_GAME_REQUEST;
const id = (fragment: string) => generatedPieceId(fragment, REQUEST);
const U = {
  aF1: id('allied:air-fighter-1'), aB1: id('allied:air-bomber-1'), aBase: id('allied:air-base-1'), aSup: id('allied:independent-supply-1'),
  aHq: id('allied:independent-hq-1'), aLeg: id('allied:f2-combat-1'), aReinforce: id('allied:air-reinforcement-1'),
  xHq: id('axis:independent-hq-1'), xTrk: id('axis:f1-combat-1'),
};
const hex = (column: number, row = 4): HexId => `${column - Math.floor(row / 2)},${row}` as HexId;
const BASE = hex(1);

const ok = (result: TransitionResult): GameState => {
  expect(result.ok, result.ok ? '' : result.violations.map(({ code, message }) => `${code}: ${message}`).join('; ')).toBe(true);
  return result.state;
};
const codes = (result: TransitionResult): readonly string[] => result.ok ? [] : result.violations.map(({ code }) => code);
const piece = (state: GameState, pieceId: string) => state.pieceState.pieces.find((entry) => entry.id === pieceId)!;
const withPiece = (state: GameState, pieceId: PieceId, patch: (entry: PieceState) => PieceState): GameState => ({
  ...state, pieceState: { ...state.pieceState, pieces: state.pieceState.pieces.map((entry) => entry.id === pieceId ? patch(entry) : entry) },
});

const base = () => buildGeneratedRuleState({
  [U.aBase]: [BASE, null], [U.aF1]: [BASE, null], [U.aB1]: [BASE, null], [U.aSup]: [BASE, null],
  [U.aHq]: [hex(2), 'COMBAT', 'combat'], [U.aLeg]: [hex(3), 'COMBAT', 'combat'],
  [U.xTrk]: [hex(14), 'COMBAT', 'combat'],
}, {}, { request: REQUEST, replacements: true });

/** The fixture eliminates pieces it is not told to place; this puts the reinforcing fighter back in its Box, due on Game Turn 3. */
const waiting = (state: GameState): GameState => withPiece(state, U.aReinforce, (entry) => ({
  ...entry, location: { kind: 'OFF_MAP_BOX', boxId: state.configuration.reinforcementBoxes.find(({ playerId }) => playerId === ALLIED)!.boxId },
  statuses: [{ statusDefinitionId: 'status:return-turn' as never, value: { kind: 'INTEGER', value: 3 } }], stackOrder: 1,
}));

describe('Eq replacements arrive each Reinforcement Phase (13.5)', () => {
  it('creates an Eq counter in the reinforcement Box that must be placed at an entry hex', () => {
    let state = atStep(onGameTurn(base(), 2), 'AIRCRAFT_REFIT', 'NONE', ALLIED);
    state = ok(applyRuleAction(state, ALLIED, { kind: 'ADVANCE_SEQUENCE' }));
    expect(state.sequence.phase).toBe('REINFORCEMENT');
    const eq = state.pieceState.pieces.find((entry) => String(entry.id).startsWith('repl-arrival:') && !String(entry.id).endsWith(':pax'))!;
    expect(eq.location.kind).toBe('OFF_MAP_BOX');
    expect(eq.resourceQuantity).toBe(1);
    expect(arrivingReinforcements(state, ALLIED).map(({ id: arrived }) => arrived)).toContain(eq.id);
    expect(codes(applyRuleAction(state, ALLIED, { kind: 'ADVANCE_SEQUENCE' }))).toContain('REINFORCEMENTS_CANNOT_BE_DELAYED');
    const entry = reinforcementHexes(state, ALLIED, eq.id)[0]!;
    state = ok(applyRuleAction(state, ALLIED, { kind: 'PLACE_REINFORCEMENT', pieceId: eq.id, hexId: entry }));
    expect(piece(state, eq.id).location).toEqual({ kind: 'ON_MAP', hexId: entry });
  });

  it('is built in: a game without air forces still receives Eq (and Pax) every turn', () => {
    const request = { ...REQUEST, oob: { ...REQUEST.oob, air: 'NONE' as const, airTransport: 'NONE' as const } };
    const plain = buildGeneratedRuleState({ [generatedPieceId('allied:independent-hq-1', request)]: [hex(2), 'COMBAT', 'combat'] }, {}, { request, replacements: true });
    const started = ok(applyRuleAction(atStep(onGameTurn(plain, 2), 'AIRCRAFT_REFIT', 'NONE', ALLIED), ALLIED, { kind: 'ADVANCE_SEQUENCE' }));
    const arrived = started.pieceState.pieces.filter((entry) => String(entry.id).startsWith('repl-arrival:')).map(({ id: arrivedId }) => String(arrivedId));
    expect(arrived.some((arrivedId) => arrivedId.endsWith(':pax'))).toBe(true);
    expect(arrived.some((arrivedId) => !arrivedId.endsWith(':pax'))).toBe(true);
  });
});

describe('Aircraft reinforcements (13.6)', () => {
  it('wait off the map until their Game Turn, then arrive Active at a friendly Air Base only', () => {
    const state = waiting(base());
    expect(piece(state, U.aReinforce).location.kind).toBe('OFF_MAP_BOX');
    const early = atStep(state, 'REINFORCEMENT', 'NONE', ALLIED);
    expect(arrivingReinforcements(early, ALLIED).map(({ id: arrived }) => arrived)).not.toContain(U.aReinforce);
    const due = { ...early, sequence: { ...early.sequence, gameTurn: 3 } };
    expect(arrivingReinforcements(due, ALLIED).map(({ id: arrived }) => arrived)).toContain(U.aReinforce);
    expect(reinforcementHexes(due, ALLIED, U.aReinforce)).toEqual([BASE]);
    const placed = ok(applyRuleAction(due, ALLIED, { kind: 'PLACE_REINFORCEMENT', pieceId: U.aReinforce, hexId: BASE }));
    expect(piece(placed, U.aReinforce).location).toEqual({ kind: 'ON_MAP', hexId: BASE });
    expect(isActiveAircraft(piece(placed, U.aReinforce))).toBe(true);
    expect(codes(applyRuleAction(due, ALLIED, { kind: 'PLACE_REINFORCEMENT', pieceId: U.aReinforce, hexId: hex(5) }))).toContain('INVALID_REINFORCEMENT_ENTRY');
  });

  it('does not block the phase when every Air Base is full (they arrive the next turn instead)', () => {
    const due = { ...atStep(waiting(base()), 'REINFORCEMENT', 'NONE', ALLIED) };
    const full = { ...due, sequence: { ...due.sequence, gameTurn: 3 } };
    // Fill the base's Active limit (4 + Level) with copies of the fighter.
    const filled = Array.from({ length: 12 }).reduce<GameState>((state, _, index) => ({
      ...state,
      pieceState: { ...state.pieceState, pieces: [...state.pieceState.pieces, { ...piece(state, U.aF1), id: `filler:${index}` as PieceId, stackOrder: 100 + index }] },
    }), full);
    expect(reinforcementHexes(filled, ALLIED, U.aReinforce)).toEqual([]);
    const placeEverything = arrivingReinforcements(filled, ALLIED).filter(({ id: arrived }) => arrived !== U.aReinforce);
    expect(placeEverything.every((entry) => entry.id !== U.aReinforce)).toBe(true);
  });
});

describe('Aircraft rebuilt with Eq (13.5f)', () => {
  const eqState = (eq = 1) => {
    const state = atStep(base(), 'REINFORCEMENT', 'NONE', ALLIED);
    const definition = state.scenario.pieceCatalog.definitions.find((candidate) => candidate.family === 'REPLACEMENT' && String(candidate.id).includes(':allied:equipment'))!;
    const counter: PieceState = {
      id: 'repl:test' as PieceId, definitionId: definition.id, ownerId: ALLIED, location: { kind: 'ON_MAP', hexId: BASE },
      currentFaceId: null, remainingSteps: null, mode: null, statuses: [], resourceQuantity: eq, stackOrder: 9,
    };
    // The Allied fighter is in the Dead Pile; the reinforcement stays off the map.
    const dead = withPiece({ ...state, pieceState: { ...state.pieceState, pieces: [...state.pieceState.pieces, counter] } }, U.aF1, (entry) => ({ ...entry, location: { kind: 'ELIMINATED' } }));
    return dead;
  };
  const rebuild = (state: GameState, over: Partial<{ aircraftIds: PieceId[]; baseId: PieceId | null; hqId: PieceId; eqPieceId: PieceId }> = {}) =>
    applyRuleAction(state, ALLIED, { kind: 'REBUILD_AIRCRAFT', eqPieceId: 'repl:test' as PieceId, hqId: U.aHq, aircraftIds: [U.aF1], baseId: U.aBase, ...over });

  it('returns a Dead Pile aircraft Active at a friendly Air Base for one Eq, using it up', () => {
    const state = ok(rebuild(eqState()));
    const plane = piece(state, U.aF1);
    expect(plane.location).toEqual({ kind: 'ON_MAP', hexId: BASE });
    expect(plane.remainingSteps).toBe(2);
    expect(isActiveAircraft(plane)).toBe(true);
    expect(piece(state, 'repl:test').location.kind).toBe('ELIMINATED');
  });

  it('spends whole Eq only: one Eq rebuilds two steps, two reduced aircraft share it (13.5d)', () => {
    let state = eqState(1);
    state = withPiece(withPiece(state, U.aB1, (entry) => ({ ...entry, remainingSteps: 1, location: { kind: 'ON_MAP', hexId: BASE } })), U.aF1, (entry) => ({ ...entry, remainingSteps: 1, location: { kind: 'ON_MAP', hexId: BASE } }));
    const rebuilt = ok(rebuild(state, { aircraftIds: [U.aF1, U.aB1], baseId: null }));
    expect(piece(rebuilt, U.aF1).remainingSteps).toBe(2);
    expect(piece(rebuilt, U.aB1).remainingSteps).toBe(2);
    expect(piece(rebuilt, 'repl:test').location.kind).toBe('ELIMINATED');
    // A Dead Pile aircraft (two steps) plus a reduced one (one step) needs two Eq.
    const mixed = withPiece(eqState(1), U.aB1, (entry) => ({ ...entry, remainingSteps: 1 }));
    expect(codes(rebuild(mixed, { aircraftIds: [U.aF1, U.aB1] }))).toContain('NOT_ENOUGH_EQUIPMENT');
    expect(piece(ok(rebuild(eqState(2), { aircraftIds: [U.aF1] })), 'repl:test').resourceQuantity).toBe(1);
  });

  it('needs an HQ in Combat Mode within 2 hexes, no enemy ZOC, the Reinforcement Phase, and a base with room', () => {
    expect(codes(rebuild(withPiece(eqState(), U.aHq, (entry) => ({ ...entry, mode: 'MOVE', currentFaceId: 'move' as never }))))).toContain('NO_REBUILD_HQ');
    expect(codes(rebuild(withPiece(eqState(), 'repl:test' as PieceId, (entry) => ({ ...entry, location: { kind: 'ON_MAP', hexId: hex(8) } }))))).toContain('EQUIPMENT_FAR_FROM_HQ');
    expect(codes(rebuild(atStep(eqState(), 'MOVEMENT', 'MOVEMENT', ALLIED)))).toContain('INVALID_REBUILD_PHASE');
    expect(codes(rebuild(eqState(), { baseId: null }))).toContain('REBUILD_NEEDS_AIR_BASE');
    expect(codes(rebuild(eqState(), { aircraftIds: [U.aB1] }))).toContain('AIRCRAFT_NOT_REBUILDABLE');
    // A reduced aircraft on the map must be stacked with the Eq that rebuild it: this Eq stands one hex from the base.
    const apart = withPiece(withPiece(eqState(), U.aB1, (entry) => ({ ...entry, remainingSteps: 1 })), 'repl:test' as PieceId, (entry) => ({ ...entry, location: { kind: 'ON_MAP', hexId: hex(2) } }));
    expect(codes(rebuild(apart, { aircraftIds: [U.aB1], baseId: null }))).toContain('REDUCED_AIRCRAFT_NOT_WITH_EQUIPMENT');
  });

  it('is offered as a legal candidate action', () => {
    const state = eqState();
    const offered = ruleEngine.getActionCandidates(state, { actorId: ALLIED, kind: 'REBUILD_AIRCRAFT', pieceId: null, budget: 20 });
    expect(offered.actions.length).toBeGreaterThan(0);
    for (const action of offered.actions) expect(ruleEngine.validateAction(state, action).allowed).toBe(true);
    expect(withAircraftActive(piece(state, U.aB1), true)).toBeDefined();
    expect(AXIS).toBeDefined();
  });
});
