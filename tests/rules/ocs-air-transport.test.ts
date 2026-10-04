import { describe, expect, it } from 'vitest';
import {
  ALLIED,
  AXIS,
  FULL_AIR_NEW_GAME_REQUEST,
  applyRuleAction,
  atStep,
  buildGeneratedRuleState,
  cargoCapacity,
  cargoLoss,
  cargoWeight,
  generatedPieceId,
  isActiveAircraft,
  lapseDropPlans,
  movementAllowanceTicks,
  ruleEngine,
  settleDecisions,
  transportCandidates,
  unitCargoCost,
  type AirCargoDeclaration,
  type AirRoute,
  type GameState,
  type HexId,
  type NewGameRequest,
  type PieceId,
  type PieceState,
  type TransitionResult,
} from '../../src/index.js';
import { withAircraftActive } from '../../src/rules/air/aircraft.js';

const REQUEST: NewGameRequest = { ...FULL_AIR_NEW_GAME_REQUEST, oob: { ...FULL_AIR_NEW_GAME_REQUEST.oob, scale: 'STANDARD' } };
const id = (fragment: string) => generatedPieceId(fragment, REQUEST);
const U = {
  base1: id('allied:air-base-1'), base2: id('allied:air-base-2'), dump: id('allied:independent-supply-1'),
  c47a: id('allied:air-transport-1'), glider: id('allied:air-transport-2'), c47b: id('allied:air-transport-3'),
  fighter: id('allied:air-fighter-1'), para: id('allied:independent-para-1'), hq: id('allied:independent-hq-1'),
  xTrk: id('axis:f1-combat-1'), xBase: id('axis:air-base-1'),
};
const hex = (column: number, row = 4): HexId => `${column - Math.floor(row / 2)},${row}` as HexId;
const BASE_A = hex(1);
const BASE_B = hex(1, 8);
const DROP_HEX = hex(6);

const ok = (result: TransitionResult): GameState => {
  expect(result.ok, result.ok ? '' : result.violations.map(({ code, message }) => `${code}: ${message}`).join('; ')).toBe(true);
  return result.state;
};
const codes = (result: TransitionResult): readonly string[] => result.ok ? [] : result.violations.map(({ code }) => code);
const piece = (state: GameState, pieceId: string) => state.pieceState.pieces.find((entry) => entry.id === pieceId)!;
const withPiece = (state: GameState, pieceId: PieceId, patch: (entry: PieceState) => PieceState): GameState => ({
  ...state, pieceState: { ...state.pieceState, pieces: state.pieceState.pieces.map((entry) => entry.id === pieceId ? patch(entry) : entry) },
});

const world = (extra: Record<string, readonly [string, 'COMBAT' | 'MOVE' | null, string?]> = {}) => withPiece(buildGeneratedRuleState({
  [U.base1]: [BASE_A, null], [U.base2]: [BASE_B, null], [U.c47a]: [BASE_A, null], [U.glider]: [BASE_A, null], [U.c47b]: [BASE_A, null],
  [U.fighter]: [BASE_A, null], [U.dump]: [BASE_A, null], [U.para]: [BASE_A, 'MOVE', 'move'], [U.hq]: [hex(2), 'COMBAT', 'combat'],
  [U.xTrk]: [hex(14), 'COMBAT', 'combat'],
  ...extra,
}, {}, { request: REQUEST }), U.dump, (entry) => ({ ...entry, resourceQuantity: 40 }));

const atMovement = (state: GameState) => atStep(state, 'MOVEMENT', 'MOVEMENT', ALLIED);
const mission = (state: GameState, mode: 'AIR_TRANSPORT' | 'AIR_DROP', aircraftIds: PieceId[], targetHexId: HexId, cargo: AirCargoDeclaration | null) =>
  applyRuleAction(state, ALLIED, { kind: 'DECLARE_AIR_MISSION', mission: mode, aircraftIds, targetHexId, target: null, cargo });
const cargoOf = (routes: Record<string, AirRoute>, over: Partial<AirCargoDeclaration> = {}): AirCargoDeclaration => ({
  baseHexId: BASE_A, unitIds: [], supply: [], routes: Object.entries(routes).map(([pieceId, route]) => ({ pieceId: pieceId as PieceId, route })), ...over,
});
const settle = (state: GameState) => settleDecisions(state, (decision) => decision.options[0]!.id).state;

describe('Air Transport (14.9)', () => {
  it('carries supply to another Air Base within the Transports combined capacity, then they return Inactive', () => {
    const start = atMovement(world());
    // Two C-47s carry 1T each: 2T of supply from the dump at the base goes to the other base.
    const cargo = cargoOf({ [U.c47a]: 'NORMAL', [U.c47b]: 'NORMAL' }, { supply: [{ sourcePieceId: U.dump, tokens: 2 }] });
    const flown = settle(ok(mission(start, 'AIR_TRANSPORT', [U.c47a, U.c47b], BASE_B, cargo)));
    expect(flown.activeTransaction).toBeNull();
    const delivered = flown.pieceState.pieces.find((entry) => entry.location.kind === 'ON_MAP' && entry.location.hexId === BASE_B && String(entry.id).startsWith('air-supply:'))!;
    expect(delivered.resourceQuantity).toBe(2);
    expect(piece(flown, U.dump).resourceQuantity).toBe(38);
    for (const plane of [U.c47a, U.c47b]) expect(isActiveAircraft(piece(flown, plane))).toBe(false);
    expect(flown.air.unloaded).toEqual([{ hexId: BASE_B, tokens: 2 }]);
    // The mission is the planes' mission this phase (14.2e).
    expect(codes(mission(flown, 'AIR_TRANSPORT', [U.c47a], BASE_B, cargoOf({ [U.c47a]: 'NORMAL' }, { supply: [{ sourcePieceId: U.dump, tokens: 1 }] })))).toContain('AIRCRAFT_ALREADY_FLEW');
  });

  it('refuses a load over the capacity, and lets flying at half range double the capacity (14.9e C)', () => {
    const start = atMovement(world());
    const heavy = cargoOf({ [U.c47a]: 'NORMAL' }, { supply: [{ sourcePieceId: U.dump, tokens: 2 }] });
    expect(codes(mission(start, 'AIR_TRANSPORT', [U.c47a], BASE_B, heavy))).toContain('CARGO_OVER_CAPACITY');
    const half = cargoOf({ [U.c47a]: 'HALF' }, { supply: [{ sourcePieceId: U.dump, tokens: 2 }] });
    expect(cargoCapacity(start, half, [U.c47a])).toBe(4);
    ok(mission(start, 'AIR_TRANSPORT', [U.c47a], BASE_B, half));
  });

  it('counts the plane styles: double range stays Inactive at the destination, out-of-range styles are refused', () => {
    const start = atMovement(world());
    const cargo = cargoOf({ [U.c47a]: 'DOUBLE' }, { supply: [{ sourcePieceId: U.dump, tokens: 1 }] });
    const flown = settle(ok(mission(start, 'AIR_TRANSPORT', [U.c47a], BASE_B, cargo)));
    expect(piece(flown, U.c47a).location).toEqual({ kind: 'ON_MAP', hexId: BASE_B });
    expect(isActiveAircraft(piece(flown, U.c47a))).toBe(false);
    // The Ju 52-style short range: a plane that cannot reach does not get the style.
    const short = withPiece(start, U.c47a, (entry) => ({ ...entry }));
    expect(codes(mission(short, 'AIR_TRANSPORT', [U.c47a], BASE_B, cargoOf({ [U.c47a]: 'HALF' }, { supply: [{ sourcePieceId: U.dump, tokens: 1 }] })))).not.toContain('ROUTE_OUT_OF_RANGE');
  });

  it('limits what a base unloads each Movement Segment unless the extra Transports stay Inactive there (14.9f)', () => {
    // Base 2 is Level 2 (4T per segment): three planes at half range carry up to 6T, of which more than 4T count.
    const start = atMovement(world());
    const six = { supply: [{ sourcePieceId: U.dump, tokens: 5 }] };
    const flying = [U.c47a, U.c47b, U.glider];
    const all = cargoOf({ [U.c47a]: 'HALF', [U.c47b]: 'HALF', [U.glider]: 'NORMAL' }, six);
    // Plain C-47s at half range carry 2T each (4T); the glider C-47 carries 2T: 6T capacity, 5T load, glider cargo is exempt.
    expect(cargoWeight(start, all)).toBe(10);
    ok(mission(start, 'AIR_TRANSPORT', flying, BASE_B, all));
    // Without a glider plane, 5T from two half-range planes is capacity 4T... so use three plain planes' worth through STAY styles.
    const noGlider = cargoOf({ [U.c47a]: 'HALF', [U.c47b]: 'HALF' }, { supply: [{ sourcePieceId: U.dump, tokens: 4 }] });
    ok(mission(start, 'AIR_TRANSPORT', [U.c47a, U.c47b], BASE_B, noGlider));
    const used = { ...start, air: { ...start.air, unloaded: [{ hexId: BASE_B, tokens: 3 }] } };
    expect(codes(mission(used, 'AIR_TRANSPORT', [U.c47a, U.c47b], BASE_B, noGlider))).toContain('UNLOAD_LIMIT');
    const staying = cargoOf({ [U.c47a]: 'HALF_STAY', [U.c47b]: 'HALF_STAY' }, { supply: [{ sourcePieceId: U.dump, tokens: 4 }] });
    ok(mission(used, 'AIR_TRANSPORT', [U.c47a, U.c47b], BASE_B, staying));
  });

  it('flies a Para battalion to another base (1T for a Leg unit, 14.9a/4.7b), halves its MA for the phase, and needs Move Mode', () => {
    const start = atMovement(world());
    const paraPiece = piece(start, U.para);
    expect(unitCargoCost(start, paraPiece)).toBe(2);
    const cargo = cargoOf({ [U.c47a]: 'NORMAL' }, { unitIds: [U.para] });
    const before = movementAllowanceTicks(start, U.para);
    const flown = settle(ok(mission(start, 'AIR_TRANSPORT', [U.c47a], BASE_B, cargo)));
    const landed = piece(flown, U.para);
    expect(landed.location).toEqual({ kind: 'ON_MAP', hexId: BASE_B });
    expect(before).toBe(20);
    expect(movementAllowanceTicks(flown, U.para)).toBe(before / 2);
    const combatMode = withPiece(start, U.para, (entry) => ({ ...entry, mode: 'COMBAT', currentFaceId: 'combat' as never }));
    expect(codes(mission(combatMode, 'AIR_TRANSPORT', [U.c47a], BASE_B, cargo))).toContain('CARGO_UNIT_NOT_LOADABLE');
    // A unit that has spent more than half its MA this phase cannot be loaded (14.9d).
    const tired = { ...start, usage: [{ ...ruleEngineUsage(start, U.para), movementSpentTicks: before / 2 + 1 }] };
    expect(codes(mission(tired, 'AIR_TRANSPORT', [U.c47a], BASE_B, cargo))).toContain('CARGO_UNIT_NOT_LOADABLE');
  });

  it('recalculates the capacity after Flak and destroys cargo above it, rounding in favor of survival (14.4g)', () => {
    const state = atMovement(world());
    const cargo = { ...cargoOf({ [U.c47a]: 'NORMAL', [U.c47b]: 'NORMAL' }, { supply: [{ sourcePieceId: U.dump, tokens: 2 }] }), drop: null };
    expect(cargoLoss(state, cargo, [U.c47a, U.c47b]).options).toEqual([]);
    // One plane reduced to 1/2T: the 2T load exceeds the 1 1/2T capacity by 1/2T, which survives.
    const reduced = withPiece(state, U.c47b, (entry) => ({ ...entry, remainingSteps: 1 }));
    expect(cargoLoss(reduced, cargo, [U.c47a, U.c47b]).options).toEqual([]);
    // One plane lost: capacity 1T against 2T: 1T must go.
    const lost = withPiece(state, U.c47b, (entry) => ({ ...entry, location: { kind: 'ELIMINATED' } }));
    const loss = cargoLoss(lost, cargo, [U.c47a]);
    expect(loss.excess).toBe(2);
    expect(loss.options.map(({ id: option }) => option)).toEqual([`supply:${U.dump}`]);
  });

  it('is offered as legal candidate actions', () => {
    const state = atMovement(world());
    const offered = transportCandidates(state, ALLIED, 'AIR_TRANSPORT', 10);
    expect(offered.length).toBeGreaterThan(0);
    const engineOffered = ruleEngine.getActionCandidates(state, { actorId: ALLIED, kind: 'DECLARE_AIR_MISSION', pieceId: U.c47a, budget: 200 });
    expect(engineOffered.actions.some((action) => action.kind === 'DECLARE_AIR_MISSION' && action.mission === 'AIR_TRANSPORT')).toBe(true);
    for (const action of engineOffered.actions) expect(ruleEngine.validateAction(state, action).allowed).toBe(true);
  });
});

const ruleEngineUsage = (state: GameState, pieceId: PieceId) => ({
  pieceId, movementSpentTicks: 0, moved: false, phaseStartHexId: BASE_A, attacked: false, barraged: false, reserveReleased: false,
  negationLocked: false, supplyPaid: false, fueled: false, fuelThrowHexId: null, recovered: false, breakoutAttempted: false, blown: false,
  unloadedTokens: 0, airCarried: false, ...(state.usage.find((entry) => entry.pieceId === pieceId) ?? {}),
});

describe('Drop Plans and Air Drop (14.10)', () => {
  const refit = (state: GameState) => atStep(state, 'AIRCRAFT_REFIT', 'NONE', ALLIED);
  const plan = (state: GameState, turn = 1, hexId: HexId = DROP_HEX, unitIds: PieceId[] = [U.para]) =>
    applyRuleAction(state, ALLIED, { kind: 'PLAN_AIR_DROP', unitIds, hexId, turn });

  it('plans a drop in the Aircraft Refit Phase: before the game begins or two turns ahead, one plan per unit', () => {
    const early = refit(world());
    const planned = ok(plan(early, 1));
    expect(planned.air.dropPlans).toHaveLength(1);
    expect(codes(plan(planned, 3))).toContain('UNIT_ALREADY_PLANNED');
    const later = { ...early, configuration: { ...early.configuration, turnLimit: 8 }, sequence: { ...early.sequence, gameTurn: 2 } };
    expect(codes(plan(later, 3))).toContain('DROP_PLAN_TOO_LATE');
    ok(plan(later, 4));
    expect(codes(plan(atMovement(world()), 1))).toContain('INVALID_DROP_PLAN_PHASE');
    expect(codes(plan(early, 1, DROP_HEX, [U.xTrk]))).toContain('DROP_UNIT_NOT_YOURS');
  });

  it('delays, partly cancels and cancels a plan (14.10c)', () => {
    const planned = ok(plan(refit(world()), 1));
    const delayed = ok(applyRuleAction(planned, ALLIED, { kind: 'UPDATE_AIR_DROP_PLAN', planId: planned.air.dropPlans[0]!.id, unitIds: [U.para], change: 'DELAY' }));
    expect(delayed.air.dropPlans.map(({ turn }) => turn)).toEqual([2]);
    const cancelled = ok(applyRuleAction(delayed, ALLIED, { kind: 'UPDATE_AIR_DROP_PLAN', planId: delayed.air.dropPlans[0]!.id, unitIds: [U.para], change: 'CANCEL' }));
    expect(cancelled.air.dropPlans).toEqual([]);
  });

  it('drops a planned Para unit by parachute: the Success Table decides, the plan is used up, and it needs no trace supply (12.6h)', () => {
    const planned = ok(plan(refit(world()), 1));
    const ready = atMovement(planned);
    const cargo = cargoOf({ [U.c47a]: 'NORMAL' }, { unitIds: [U.para] });
    // Without the plan or in the wrong hex the drop is refused.
    expect(codes(mission(atMovement(world()), 'AIR_DROP', [U.c47a], DROP_HEX, cargo))).toContain('NO_DROP_PLAN');
    expect(codes(mission(ready, 'AIR_DROP', [U.c47a], hex(7), cargo))).toContain('NO_DROP_PLAN');
    // The outcome depends on two dice; try several game seeds and check both results are consistent.
    const outcomes = new Set<string>();
    for (let seed = 0; seed < 40 && outcomes.size < 2; seed += 1) {
      const rolled = { ...ready, rng: { ...ready.rng, state: ready.rng.state + seed * 7919 } };
      const after = settle(ok(mission(rolled, 'AIR_DROP', [U.c47a], DROP_HEX, cargo)));
      const unit = piece(after, U.para);
      expect(after.air.dropPlans).toEqual([]);
      if (unit.location.kind === 'ON_MAP') {
        outcomes.add('landed');
        expect(unit.location.hexId).toBe(DROP_HEX);
        expect(after.air.droppedIds).toContain(U.para);
        expect(after.usage.find((entry) => entry.pieceId === U.para)?.moved).toBe(true);
      } else {
        outcomes.add('lost');
        expect(unit.location.kind).toBe('ELIMINATED');
        expect(after.air.droppedIds).not.toContain(U.para);
      }
    }
    expect(outcomes.size).toBeGreaterThan(0);
  });

  it('captures an enemy Air Base it lands on: Capture Table rolls are reported and the aircraft displace when the mission ends (9.14f)', () => {
    const xPlane = id('axis:air-transport-1');
    const xBase2 = id('axis:air-base-2');
    const planned = ok(plan(refit(world({ [U.xBase]: [DROP_HEX, null], [xPlane]: [DROP_HEX, null], [xBase2]: [hex(14, 6), null] })), 1));
    // Inactive, so no Air Combat over the base: the drop goes straight to the landing roll.
    const ready = atMovement(withPiece(planned, xPlane, (entry) => withAircraftActive(entry, false)));
    const cargo = cargoOf({ [U.c47a]: 'NORMAL' }, { unitIds: [U.para] });
    let checked = false;
    for (let seed = 0; seed < 40 && !checked; seed += 1) {
      const declared = mission({ ...ready, rng: { ...ready.rng, state: ready.rng.state + seed * 7919 } }, 'AIR_DROP', [U.c47a], DROP_HEX, cargo);
      let state = ok(declared);
      const label = (event: { readonly kind: string; readonly result?: string }) => event.kind === 'TRANSACTION_RESOLVED' ? `${event.kind}:${event.result}` : event.kind;
      const events: string[] = declared.ok ? declared.events.map(label) : [];
      for (let guard = 0; state.pendingDecision && guard < 20; guard += 1) {
        const result = applyRuleAction(state, state.pendingDecision.ownerId, { kind: 'RESPOND_DECISION', decisionId: state.pendingDecision.id, choiceId: state.pendingDecision.options[0]!.id });
        state = ok(result);
        if (result.ok) events.push(...result.events.map(label));
      }
      if (piece(state, U.para).location.kind !== 'ON_MAP') continue;
      checked = true;
      expect(piece(state, U.xBase).ownerId).toBe(ALLIED);
      expect(events).toContain('AIR_BASE_CAPTURED');
      expect(events.find((entry) => entry.startsWith('TRANSACTION_RESOLVED'))).toMatch(/Air Base Capture Table/);
      // The only other Axis base is in reach, so the survivor is moved there at once, Inactive, with no question asked.
      const plane = piece(state, xPlane);
      if (plane.location.kind === 'ON_MAP') {
        expect(plane.location.hexId).toBe(hex(14, 6));
        expect(isActiveAircraft(plane)).toBe(false);
      }
      expect(state.interrupts).toEqual([]);
    }
    expect(checked).toBe(true);
  });

  it('drops supply without a plan, by glider with a plus-one modifier for integral-glider Transports (14.10e, 14.10f)', () => {
    const state = atMovement(world());
    const supply = cargoOf({ [U.glider]: 'NORMAL' }, { supply: [{ sourcePieceId: U.dump, tokens: 2 }] });
    ok(mission(state, 'AIR_DROP', [U.glider], DROP_HEX, supply));
    expect(codes(mission(state, 'AIR_DROP', [U.glider, U.c47a], DROP_HEX, cargoOf({ [U.glider]: 'NORMAL', [U.c47a]: 'NORMAL' }, { supply: [{ sourcePieceId: U.dump, tokens: 2 }] })))).toContain('MIXED_DROP_CARRIERS');
    // A drop has no Air Base to end Inactive at, so only the normal and half styles exist.
    expect(codes(mission(state, 'AIR_DROP', [U.glider], DROP_HEX, cargoOf({ [U.glider]: 'DOUBLE' }, { supply: [{ sourcePieceId: U.dump, tokens: 1 }] })))).toContain('DROP_ROUTE_NOT_ALLOWED');
    // Combat units only drop in the Movement Phase; supply drops have no phase restriction.
    const reaction = atStep(state, 'REACTION', 'MOVEMENT', ALLIED, AXIS);
    ok(mission(reaction, 'AIR_DROP', [U.glider], DROP_HEX, supply));
  });

  it('lets only Para units land by parachute, while glider Transports can land any eligible unit', () => {
    // The battalion, with its Para symbol taken off, is an ordinary Leg unit.
    const definitions = world().scenario.pieceCatalog.definitions;
    const paraDefinition = piece(world(), U.para).definitionId;
    const ordinary = (state: GameState): GameState => ({
      ...state, scenario: { ...state.scenario, pieceCatalog: { ...state.scenario.pieceCatalog, definitions: definitions.map((definition) => definition.id === paraDefinition
        ? { ...definition, counter: { ...definition.counter!, symbol: 'INFANTRY' as const } } : definition) } },
    });
    const planned = ok(plan(refit(ordinary(world())), 1));
    const ready = atMovement(planned);
    const cargo = (planes: Record<string, AirRoute>) => cargoOf(planes, { unitIds: [U.para] });
    expect(codes(mission(ready, 'AIR_DROP', [U.c47a], DROP_HEX, cargo({ [U.c47a]: 'NORMAL' })))).toContain('NOT_A_PARA_UNIT');
    ok(mission(ready, 'AIR_DROP', [U.glider], DROP_HEX, cargo({ [U.glider]: 'NORMAL' })));
  });

  it('lets plans lapse when their turn has passed', () => {
    const planned = ok(plan(refit(world()), 1));
    const next = { ...planned, sequence: { ...planned.sequence, gameTurn: 2 } };
    expect(next.air.dropPlans).toHaveLength(1);
    expect(lapseDropPlans(next).air.dropPlans).toEqual([]);
    expect(lapseDropPlans(planned).air.dropPlans).toHaveLength(1);
  });
});
