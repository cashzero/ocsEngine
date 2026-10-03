import { describe, expect, it } from 'vitest';
import {
  ALLIED,
  AXIS,
  applyRuleAction,
  atStep,
  autoStep,
  buildGeneratedRuleState,
  calculateCombatOdds,
  createRulesRng,
  declareTestCombat,
  generatedPieceId,
  inEnemyZoc,
  movementAllowanceTicks,
  queryMovementPath,
  queryReachableHexes,
  querySupply,
  ruleEngine,
  settleDecisions,
  type GameState,
  type HexId,
  type TransitionResult,
} from '../../src/index.js';
import { retreatPlans } from '../../src/rules/combat/combat.js';
import { adjacentHexIds } from '../../src/rules/pieces.js';

const U = {
  alTrk: generatedPieceId('allied:f1-combat-1'), alTrk2: generatedPieceId('allied:f1-combat-2'),
  alLeg: generatedPieceId('allied:f2-combat-1'), alLeg2: generatedPieceId('allied:f1-combat-2'),
  alArt: generatedPieceId('allied:f1-artillery-1'), alEng: generatedPieceId('allied:independent-engineer-1'),
  alHq: generatedPieceId('allied:f1-command'), alSup: generatedPieceId('allied:independent-supply-1'),
  axTrk: generatedPieceId('axis:f1-combat-1'), axTrk2: generatedPieceId('axis:f1-combat-2'),
  axTruck: generatedPieceId('axis:f2-combat-1'), axArt: generatedPieceId('axis:f1-artillery-1'),
};
const codes = (result: TransitionResult): readonly string[] => result.ok ? [] : result.violations.map(({ code }) => code);
const piece = (state: GameState, id: string) => state.pieceState.pieces.find((candidate) => candidate.id === id)!;
const path = (...hexes: string[]) => hexes as HexId[];

describe('OCS 4.3 zones of control (4.5)', () => {
  const enemy = { [U.axTrk]: ['8,5', 'COMBAT', 'combat'] } as const;
  const route = path('5,5', '6,5', '7,5', '7,6', '7,7');

  it('stops only Truck movement on entering an enemy ZOC (4.5a A, 6.3b)', () => {
    for (const [pieceId, passes] of [[U.alTrk, true], [U.alLeg, true], [U.alEng, false]] as const) {
      const state = atStep(buildGeneratedRuleState({ ...enemy, [pieceId]: ['5,5', 'MOVE', 'move'] }), 'MOVEMENT', 'MOVEMENT', ALLIED);
      expect(queryMovementPath(state, ALLIED, pieceId, route).allowed).toBe(passes);
    }
  });

  it('lets a friendly combat unit negate the ZOC and locks that unit in place (4.5b)', () => {
    const state = atStep(buildGeneratedRuleState({ ...enemy, [U.alEng]: ['5,5', 'MOVE', 'move'], [U.alLeg2]: ['7,5', 'COMBAT', 'combat'] }), 'MOVEMENT', 'MOVEMENT', ALLIED);
    const moved = applyRuleAction(state, ALLIED, { kind: 'MOVE_PIECE', pieceId: U.alEng, path: path('5,5', '6,5', '7,5', '7,4') });
    expect(moved.ok).toBe(true);
    const negator = applyRuleAction(moved.state, ALLIED, { kind: 'MOVE_PIECE', pieceId: U.alLeg2, path: path('7,5', '6,5') });
    expect(codes(negator)).toContain('NEGATING_UNIT_LOCKED');
  });

  it('forbids Strat units from entering an enemy ZOC (5.8a)', () => {
    const state = atStep(buildGeneratedRuleState({ ...enemy, [U.alTrk]: ['5,5', 'STRAT', 'move'] }), 'MOVEMENT', 'MOVEMENT', ALLIED);
    expect(queryMovementPath(state, ALLIED, U.alTrk, path('5,5', '6,5', '7,5')).reasons.map(({ code }) => code)).toContain('STRAT_ENTERING_ZOC');
  });
});

describe('OCS 4.3 phase eligibility and modes (5.0, 6.1g, 7.0, 11.0)', () => {
  it('lets only released Reserves act in Reaction, at half MA (7.0a, 5.7b)', () => {
    const plain = atStep(buildGeneratedRuleState({ [U.alTrk]: ['5,5', 'MOVE', 'move'], [U.axTrk]: ['12,5', 'COMBAT', 'combat'] }), 'REACTION', 'MOVEMENT', ALLIED, AXIS);
    expect(codes(applyRuleAction(plain, ALLIED, { kind: 'MOVE_PIECE', pieceId: U.alTrk, path: path('5,5', '6,5') }))).toContain('REACTION_REQUIRES_RELEASED_RESERVE');
    const reserve = atStep(buildGeneratedRuleState({ [U.alTrk]: ['5,5', 'RESERVE', 'move'], [U.axTrk]: ['12,5', 'COMBAT', 'combat'] }), 'REACTION', 'MOVEMENT', ALLIED, AXIS);
    const released = applyRuleAction(reserve, ALLIED, { kind: 'RELEASE_RESERVE', pieceId: U.alTrk });
    expect(piece(released.state, U.alTrk).mode).toBe('MOVE');
    expect(movementAllowanceTicks(released.state, U.alTrk)).toBe(28);
  });

  it('lets only Exploit and released units move in Exploitation (11.0a)', () => {
    const state = atStep(buildGeneratedRuleState({ [U.alTrk]: ['5,5', 'MOVE', 'move'] }), 'EXPLOITATION', 'MOVEMENT', ALLIED);
    expect(codes(applyRuleAction(state, ALLIED, { kind: 'MOVE_PIECE', pieceId: U.alTrk, path: path('5,5', '6,5') }))).toContain('EXPLOITATION_REQUIRES_EXPLOIT_OR_RESERVE');
  });

  it('changes mode only as a unit begins to move and finishes a unit when another moves (5.4, 6.1g)', () => {
    let state = atStep(buildGeneratedRuleState({ [U.alTrk]: ['5,5', 'MOVE', 'move'], [U.alTrk2]: ['5,7', 'MOVE', 'move'] }), 'MOVEMENT', 'MOVEMENT', ALLIED);
    state = applyRuleAction(state, ALLIED, { kind: 'MOVE_PIECE', pieceId: U.alTrk, path: path('5,5', '6,5') }).state;
    expect(codes(applyRuleAction(state, ALLIED, { kind: 'CHANGE_MODE', pieceId: U.alTrk, mode: 'COMBAT' }))).toContain('MODE_CHANGE_AFTER_MOVING');
    state = applyRuleAction(state, ALLIED, { kind: 'MOVE_PIECE', pieceId: U.alTrk2, path: path('5,7', '6,7') }).state;
    expect(codes(applyRuleAction(state, ALLIED, { kind: 'MOVE_PIECE', pieceId: U.alTrk, path: path('6,5', '7,5') }))).toContain('MOVEMENT_ALREADY_FINISHED');
  });

  it('lets the player finish the current mover without starting another unit (6.1g)', () => {
    let state = atStep(buildGeneratedRuleState({ [U.alTrk]: ['5,5', 'MOVE', 'move'], [U.alTrk2]: ['5,7', 'MOVE', 'move'], [U.axTrk]: ['12,5', 'COMBAT', 'combat'] }), 'MOVEMENT', 'MOVEMENT', ALLIED);
    const endFamily = (current: GameState) => ruleEngine.getActionFamilies(current, ALLIED).find(({ kind }) => kind === 'END_MOVE')?.enabled;
    expect(endFamily(state)).toBe(false);
    expect(ruleEngine.projectForViewer(state, ALLIED).currentMoverId).toBeNull();

    state = applyRuleAction(state, ALLIED, { kind: 'MOVE_PIECE', pieceId: U.alTrk, path: path('5,5', '6,5') }).state;
    expect(ruleEngine.projectForViewer(state, ALLIED).currentMoverId).toBe(U.alTrk);
    expect(ruleEngine.projectForViewer(state, AXIS).currentMoverId).toBeNull();
    expect(endFamily(state)).toBe(true);
    expect(codes(applyRuleAction(state, ALLIED, { kind: 'END_MOVE', pieceId: U.alTrk2 }))).toContain('NOT_CURRENT_MOVER');
    expect(codes(applyRuleAction(state, AXIS, { kind: 'END_MOVE', pieceId: U.alTrk }))).toContain('NOT_PIECE_OWNER');

    const ended = applyRuleAction(state, ALLIED, { kind: 'END_MOVE', pieceId: U.alTrk });
    expect(ended.ok).toBe(true);
    expect(ended.events.map(({ kind }) => kind)).toContain('MOVE_ENDED');
    expect(ended.state.currentMoverId).toBeNull();
    expect(ruleEngine.projectForViewer(ended.state, ALLIED).currentMoverId).toBeNull();
    expect(codes(applyRuleAction(ended.state, ALLIED, { kind: 'MOVE_PIECE', pieceId: U.alTrk, path: path('6,5', '7,5') }))).toContain('MOVEMENT_ALREADY_FINISHED');
    expect(codes(applyRuleAction(ended.state, ALLIED, { kind: 'END_MOVE', pieceId: U.alTrk }))).toContain('NOT_CURRENT_MOVER');
    // Other units still move normally afterwards.
    expect(applyRuleAction(ended.state, ALLIED, { kind: 'MOVE_PIECE', pieceId: U.alTrk2, path: path('5,7', '6,7') }).ok).toBe(true);
  });

  it('finishes a unit that only changed mode, so it cannot move later in the phase (5.4, 6.1g)', () => {
    let state = atStep(buildGeneratedRuleState({ [U.alTrk]: ['5,5', 'COMBAT', 'combat'], [U.axTrk]: ['12,5', 'COMBAT', 'combat'] }), 'MOVEMENT', 'MOVEMENT', ALLIED);
    state = applyRuleAction(state, ALLIED, { kind: 'CHANGE_MODE', pieceId: U.alTrk, mode: 'MOVE' }).state;
    expect(ruleEngine.projectForViewer(state, ALLIED).currentMoverId).toBe(U.alTrk);
    state = applyRuleAction(state, ALLIED, { kind: 'END_MOVE', pieceId: U.alTrk }).state;
    expect(codes(applyRuleAction(state, ALLIED, { kind: 'MOVE_PIECE', pieceId: U.alTrk, path: path('5,5', '6,5') }))).toContain('MOVEMENT_ALREADY_FINISHED');
  });

  it('orients Strat units to their Move side (5.8)', () => {
    const state = atStep(buildGeneratedRuleState({ [U.alTrk]: ['5,5', 'COMBAT', 'combat'] }), 'MOVEMENT', 'MOVEMENT', ALLIED);
    expect(piece(applyRuleAction(state, ALLIED, { kind: 'CHANGE_MODE', pieceId: U.alTrk, mode: 'STRAT' }).state, U.alTrk).currentFaceId).toBe('move');
  });

  it('removes the Reserve marker on release so the unit can overrun and attack (5.7b A)', () => {
    let state = atStep(buildGeneratedRuleState({ [U.alTrk]: ['5,5', 'RESERVE', 'combat'], [U.axTrk]: ['6,5', 'COMBAT', 'combat'], [U.alSup]: ['4,5', null] }), 'EXPLOITATION', 'MOVEMENT', ALLIED);
    state = applyRuleAction(state, ALLIED, { kind: 'RELEASE_RESERVE', pieceId: U.alTrk }).state;
    expect(piece(state, U.alTrk).mode).toBe('COMBAT');
    expect(declareTestCombat(state, ALLIED, 'OVERRUN', [U.alTrk], '6,5').ok).toBe(true);
    const combatSegment = { ...state, sequence: { ...state.sequence, segment: 'COMBAT' as const } };
    expect(declareTestCombat(combatSegment, ALLIED, 'REGULAR', [U.alTrk], '6,5').ok).toBe(true);
  });
});

describe('OCS 4.3 ground combat (9.0-9.13)', () => {
  const duel = { [U.alTrk]: ['5,5', 'COMBAT', 'combat'], [U.axTrk]: ['6,5', 'COMBAT', 'combat'], [U.alSup]: ['5,6', null] } as const;
  const odds = (state: GameState, supplied = true) => calculateCombatOdds(state, [U.alTrk], [U.axTrk], '6,5' as HexId, supplied ? [U.axTrk] : [], U.alTrk, U.axTrk);

  it('uses the defender terrain for line and strength (9.3, 9.4)', () => {
    const open = odds(buildGeneratedRuleState(duel));
    const woods = odds(buildGeneratedRuleState(duel, { '6,5': 'terrain:woods' }));
    const marsh = odds(buildGeneratedRuleState(duel, { '6,5': 'terrain:marsh' }));
    expect(open).toMatchObject({ line: 'OPEN', attackerStrength: 21 });
    expect(woods).toMatchObject({ line: 'CLOSE', attackerStrength: 14 });
    expect(marsh).toMatchObject({ line: 'VERY_CLOSE', attackerStrength: 7 });
  });

  it('applies mode and supply to defenders (5.7, 5.8, 9.5)', () => {
    const base = odds(buildGeneratedRuleState(duel)).defenderStrength;
    expect(odds(buildGeneratedRuleState({ ...duel, [U.axTrk]: ['6,5', 'STRAT', 'move'] })).defenderStrength).toBe(0);
    expect(odds(buildGeneratedRuleState({ ...duel, [U.axTrk]: ['6,5', 'RESERVE', 'combat'] })).defenderStrength).toBe(base / 2);
    expect(odds(buildGeneratedRuleState(duel), false).defenderStrength).toBe(base / 2);
  });

  it('requires every combat unit in the hex to defend and attackers to have combat supply (9.1d, 9.5A)', () => {
    const state = atStep(buildGeneratedRuleState({ ...duel, [U.axTrk2]: ['6,5', 'COMBAT', 'combat'] }), 'COMBAT', 'COMBAT', ALLIED);
    const partial = applyRuleAction(state, ALLIED, { kind: 'DECLARE_COMBAT', combatKind: 'REGULAR', attackerIds: [U.alTrk], defenderIds: [U.axTrk], targetHexId: '6,5' as HexId, leadAttackerId: U.alTrk });
    expect(codes(partial)).toContain('WHOLE_HEX_MUST_DEFEND');
    // 12.10: with no dump in reach the attacker falls back on internal stocks and is marked Low...
    const noDump = atStep(buildGeneratedRuleState({ [U.alTrk]: ['5,5', 'COMBAT', 'combat'], [U.axTrk]: ['6,5', 'COMBAT', 'combat'] }), 'COMBAT', 'COMBAT', ALLIED);
    const internal = declareTestCombat(noDump, ALLIED, 'REGULAR', [U.alTrk], '6,5');
    expect(internal.ok).toBe(true);
    const rolled = settleDecisions(internal.state).state;
    expect(piece(rolled, U.alTrk).statuses).toContainEqual({ statusDefinitionId: 'status:internal-stocks', value: { kind: 'TEXT', value: 'LOW' } });
    // ...but an Exhausted unit cannot attack without on-map SP (12.10c, 9.5A).
    const exhausted = { ...noDump, pieceState: { ...noDump.pieceState, pieces: noDump.pieceState.pieces.map((entry) => entry.id !== U.alTrk ? entry
      : { ...entry, statuses: [{ statusDefinitionId: 'status:internal-stocks' as never, value: { kind: 'TEXT' as const, value: 'EXHAUSTED' } }] }) } };
    expect(codes(declareTestCombat(exhausted, ALLIED, 'REGULAR', [U.alTrk], '6,5'))).toContain('ATTACKER_COMBAT_SUPPLY_UNAVAILABLE');
  });

  it('combines attackers from several hexes and attacks a hex only once per segment (9.1c)', () => {
    const state = atStep(buildGeneratedRuleState({ ...duel, [U.alTrk2]: ['5,6', 'COMBAT', 'combat'], [U.alLeg]: ['7,4', 'COMBAT', 'combat'] }), 'COMBAT', 'COMBAT', ALLIED);
    const combined = declareTestCombat(state, ALLIED, 'REGULAR', [U.alTrk, U.alTrk2], '6,5');
    expect(combined.ok).toBe(true);
    const after = settleDecisions(combined.state, (decision) => decision.options.find(({ id }) => /option:\d+:0|advance:none/.test(id))?.id ?? decision.options[0]!.id).state;
    expect(codes(declareTestCombat(after, ALLIED, 'REGULAR', [U.alLeg], '6,5'))).toContain('HEX_ALREADY_ATTACKED');
  });

  it('awards Exploitation mode on e# results for regular combat (9.13)', () => {
    let reached = false;
    for (let seed = 1; seed < 200 && !reached; seed += 1) {
      const state = atStep(buildGeneratedRuleState({ [U.alTrk]: ['5,5', 'COMBAT', 'combat'], [U.alTrk2]: ['5,5', 'COMBAT', 'combat'], [U.axTruck]: ['6,5', 'MOVE', 'move'], [U.alSup]: ['4,5', null] }), 'COMBAT', 'COMBAT', ALLIED);
      const declared = declareTestCombat({ ...state, rng: createRulesRng(seed) }, ALLIED, 'REGULAR', [U.alTrk, U.alTrk2], '6,5');
      const settled = settleDecisions(declared.state, (decision) => decision.options.find(({ id }) => /option:\d+:0/.test(id))?.id ?? decision.options[0]!.id).state;
      reached = settled.pieceState.pieces.some(({ mode }) => mode === 'EXPLOITATION');
    }
    expect(reached).toBe(true);
  });

  it('only disorganizes a one-hex retreat that enters an enemy ZOC (5.10a, 9.12)', () => {
    const state = atStep(buildGeneratedRuleState({ [U.alTrk]: ['5,5', 'COMBAT', 'combat'], [U.axTrk]: ['6,5', 'COMBAT', 'combat'], [U.alSup]: ['4,5', null] }), 'COMBAT', 'COMBAT', ALLIED);
    let checked = 0;
    for (let seed = 1; seed < 400 && checked < 3; seed += 1) {
      let declared = declareTestCombat({ ...state, rng: createRulesRng(seed) }, ALLIED, 'REGULAR', [U.alTrk], '6,5');
      const events = [...declared.events];
      // The defender's supply, lead unit and terrain are chosen before the dice are rolled.
      while (declared.state.pendingDecision && declared.state.activeTransaction?.result === null) {
        declared = autoStep(declared.state);
        events.push(...declared.events);
      }
      const result = declared.state.activeTransaction?.result ?? events.flatMap((event) => event.kind === 'TRANSACTION_RESOLVED' ? [event.result] : [])[0] ?? '';
      if (!/\/Do1$/u.test(result)) continue;
      const settled = settleDecisions(declared.state, (decision) => decision.ownerId === AXIS && decision.kind === 'OPTION_SPLIT'
        ? decision.options.find(({ id }) => id === 'option:0:1')?.id ?? decision.options[0]!.id
        : decision.kind === 'ADVANCE_HEX' ? 'advance:none' : decision.options[0]!.id).state;
      const defender = piece(settled, U.axTrk);
      if (defender.location.kind !== 'ON_MAP' || defender.location.hexId === '6,5') continue;
      expect(defender.mode === 'DG').toBe(inEnemyZoc(settled, AXIS, defender.location.hexId));
      checked += 1;
    }
    expect(checked).toBeGreaterThan(0);
  });

  it('keeps a retreat off hexes next to enemy combat units whenever another destination exists (9.12c)', () => {
    const defenderHex = '6,5' as HexId;
    const ring = adjacentHexIds(defenderHex);
    const nextToEnemy = (state: GameState, hexId: HexId) => adjacentHexIds(hexId)
      .some((hex) => state.pieceState.pieces.some((candidate) => candidate.ownerId === ALLIED && candidate.location.kind === 'ON_MAP' && candidate.location.hexId === hex));
    const plansFor = (state: GameState) => retreatPlans(state, [piece(state, U.axTrk)], 1, new Set());

    // One attacker beside the defender: every offered destination is clear of it.
    const duelState = atStep(buildGeneratedRuleState({ [U.alTrk]: ['5,5', 'COMBAT', 'combat'], [U.axTrk]: [defenderHex, 'COMBAT', 'combat'] }), 'COMBAT', 'COMBAT', ALLIED);
    const duelPlans = plansFor(duelState);
    expect(duelPlans.length).toBeGreaterThan(0);
    expect(duelPlans.every(({ destination }) => !nextToEnemy(duelState, destination))).toBe(true);
    // Without the rule the hexes beside the attacker were legal too: they are the ones removed.
    const beside = ring.filter((hex) => hex !== '5,5' && nextToEnemy(duelState, hex));
    expect(beside.length).toBeGreaterThan(0);
    expect(duelPlans.map(({ destination }) => destination)).not.toEqual(expect.arrayContaining(beside));

    // Enemies on four of the six neighbours leave only hexes beside an enemy: those stay legal.
    const [first, second, third, fourth, ...free] = ring;
    const surrounded = atStep(buildGeneratedRuleState({
      [U.alTrk]: [first!, 'COMBAT', 'combat'], [U.alTrk2]: [second!, 'COMBAT', 'combat'],
      [U.alLeg]: [third!, 'COMBAT', 'combat'], [U.alArt]: [fourth!, 'COMBAT', 'combat'],
      [U.axTrk]: [defenderHex, 'COMBAT', 'combat'],
    }), 'COMBAT', 'COMBAT', ALLIED);
    const fallback = plansFor(surrounded);
    expect(free.every((hex) => nextToEnemy(surrounded, hex))).toBe(true);
    expect(fallback.map(({ destination }) => destination).sort()).toEqual([...free].sort());
  });

  it('never leaves opposing combat units in one hex after an overrun (4.8c)', () => {
    for (let seed = 1; seed < 60; seed += 1) {
      const state = atStep(buildGeneratedRuleState({ [U.alTrk]: ['6,5', 'MOVE', 'move'], [U.axTruck]: ['7,5', 'MOVE', 'move'], [U.axArt]: ['7,5', 'MOVE', 'move'], [U.alSup]: ['5,5', null] }), 'MOVEMENT', 'MOVEMENT', ALLIED);
      const declared = declareTestCombat({ ...state, rng: createRulesRng(seed) }, ALLIED, 'OVERRUN', [U.alTrk], '7,5');
      expect(declared.ok).toBe(true);
      const settled = settleDecisions(declared.state).state;
      const owners = new Set(settled.pieceState.pieces
        .filter((candidate) => candidate.location.kind === 'ON_MAP' && candidate.location.hexId === '7,5' && candidate.remainingSteps !== null && candidate.mode !== null)
        .map(({ ownerId }) => ownerId));
      expect(owners.size).toBeLessThanOrEqual(1);
    }
  }, 30_000);
});

describe('OCS 4.3 overrun (8.0-8.1)', () => {
  it('charges 3 MP, needs 3 MP, and excludes DG units (8.1a, 5.10b)', () => {
    const base = { [U.alTrk]: ['6,5', 'MOVE', 'move'], [U.axTruck]: ['7,5', 'MOVE', 'move'], [U.alSup]: ['5,5', null] } as const;
    const state = atStep(buildGeneratedRuleState(base), 'MOVEMENT', 'MOVEMENT', ALLIED);
    const declared = declareTestCombat(state, ALLIED, 'OVERRUN', [U.alTrk], '7,5');
    const settled = settleDecisions(declared.state).state;
    expect(settled.usage.find(({ pieceId }) => pieceId === U.alTrk)?.movementSpentTicks).toBeGreaterThanOrEqual(12);
    const tired = { ...state, usage: [{ pieceId: U.alTrk, movementSpentTicks: movementAllowanceTicks(state, U.alTrk) - 8, moved: true, phaseStartHexId: '6,5' as HexId, attacked: false, barraged: false, reserveReleased: false, negationLocked: false, supplyPaid: false, fueled: true, fuelThrowHexId: null, recovered: false, breakoutAttempted: false, blown: false, unloadedTokens: 0 }], currentMoverId: U.alTrk };
    expect(codes(declareTestCombat(tired, ALLIED, 'OVERRUN', [U.alTrk], '7,5'))).toContain('OVERRUN_NEEDS_3_MP');
    const dg = atStep(buildGeneratedRuleState({ ...base, [U.alTrk]: ['6,5', 'DG', 'move'] }), 'MOVEMENT', 'MOVEMENT', ALLIED);
    expect(codes(declareTestCombat(dg, ALLIED, 'OVERRUN', [U.alTrk], '7,5'))).toContain('DG_CANNOT_OVERRUN');
  });
});

describe('OCS 4.3 artillery barrage (10.0-10.1, 13.4)', () => {
  const place = (mode: 'COMBAT' | 'RESERVE' | 'STRAT', face: string) => ({
    [U.alArt]: ['5,5', mode, face], [U.axTrk]: ['6,5', 'COMBAT', 'combat'], [U.alSup]: ['5,6', null], [U.alLeg]: ['7,5', 'COMBAT', 'combat'],
  } as const);
  const barrage = (state: GameState) => applyRuleAction(state, ALLIED, { kind: 'DECLARE_BARRAGE', firerIds: [U.alArt], targetPieceIds: [U.axTrk], targetHexId: '6,5' as HexId });

  it('fires in the Combat Phase and never from Reserve or Strat Mode or in the Movement Phase', () => {
    expect(barrage(atStep(buildGeneratedRuleState(place('COMBAT', 'combat')), 'COMBAT', 'BARRAGE', ALLIED)).ok).toBe(true);
    expect(codes(barrage(atStep(buildGeneratedRuleState(place('RESERVE', 'combat')), 'COMBAT', 'BARRAGE', ALLIED)))).toContain('ARTILLERY_MODE_CANNOT_BARRAGE');
    expect(codes(barrage(atStep(buildGeneratedRuleState(place('STRAT', 'move')), 'COMBAT', 'BARRAGE', ALLIED)))).toContain('ARTILLERY_MODE_CANNOT_BARRAGE');
    expect(codes(barrage(atStep(buildGeneratedRuleState(place('COMBAT', 'combat')), 'MOVEMENT', 'BARRAGE', ALLIED)))).toContain('INVALID_BARRAGE_PHASE');
  });

  it('pays the initial column cost and allows one barrage per hex per phase (10.0e, 10.1b)', () => {
    const state = atStep(buildGeneratedRuleState(place('COMBAT', 'combat')), 'COMBAT', 'BARRAGE', ALLIED);
    const fired = barrage(state);
    const explanation = ruleEngine.explain(state, { actionId: 'action:x' as never, actorId: ALLIED, expectedRevision: state.revision, kind: 'DECLARE_BARRAGE', firerIds: [U.alArt], targetPieceIds: [U.axTrk], targetHexId: '6,5' as HexId });
    const cost = explanation.facts.find(({ key }) => key === 'barrage.supplyTokens')?.value;
    expect(piece(state, U.alSup).resourceQuantity! - piece(fired.state, U.alSup).resourceQuantity!).toBe(cost);
    expect(codes(barrage(settleDecisions(fired.state).state))).toEqual(expect.arrayContaining(['ARTILLERY_ALREADY_BARRAGED', 'HEX_ALREADY_BARRAGED']));
  });
});

describe('OCS 4.3 sequence and supply (2.3, 12.3, 12.6)', () => {
  it('rolls for the first player from turn 2 and lets the winner choose', () => {
    let state = buildGeneratedRuleState({ [U.alTrk]: ['5,5', 'MOVE', 'move'], [U.axTrk]: ['12,5', 'MOVE', 'move'] });
    let rolls = 0;
    for (let guard = 0; state.sequence.phase !== 'COMPLETE' && guard < 200; guard += 1) {
      const result = autoStep(state, (decision) => decision.kind === 'FIRST_PLAYER' ? 'second' : decision.options[0]!.id);
      expect(result.ok).toBe(true);
      rolls += result.events.filter(({ kind }) => kind === 'FIRST_PLAYER_ROLLED').length;
      state = result.state;
    }
    expect(rolls).toBe(1);
  });

  it('marks units without trace supply Out of Supply when the Supply Phase ends (12.6d)', () => {
    const state = atStep(buildGeneratedRuleState({ [U.alTrk]: ['14,5', 'MOVE', 'move'] }), 'MOVEMENT', 'BARRAGE', ALLIED);
    const advanced = applyRuleAction(state, ALLIED, { kind: 'ADVANCE_SEQUENCE' });
    expect(piece(advanced.state, U.alTrk).statuses.map(({ statusDefinitionId }) => statusDefinitionId)).toContain('status:out-of-supply');
  });

  it('counts supply paths with MP and never across the sea (12.3d)', () => {
    const scenarioSources = buildGeneratedRuleState({}).scenario.sources;
    const water: Record<string, string> = {};
    for (const hex of buildGeneratedRuleState({}).scenario.mapDefinition.hexes) {
      const [q, r] = hex.id.split(',').map(Number) as [number, number];
      const column = q + Math.floor(r / 2);
      if (column >= 1 && column <= 4) water[hex.id] = 'terrain:water';
    }
    const state = buildGeneratedRuleState({ [U.alTrk]: ['4,6', 'MOVE', 'move'] }, water, { sources: [{ ...scenarioSources[0]!, hexId: '-3,6' as HexId }] });
    expect(querySupply(state, ALLIED, U.alTrk, 'TRACE').value?.method).toBe('NONE');
  });

  it('never enumerates a reachable hex that the path query would reject', () => {
    const state = atStep(buildGeneratedRuleState({ [U.alEng]: ['5,5', 'MOVE', 'move'], [U.axTrk]: ['8,5', 'COMBAT', 'combat'] }), 'MOVEMENT', 'MOVEMENT', ALLIED);
    for (const entry of queryReachableHexes(state, ALLIED, U.alEng).value ?? []) {
      expect(queryMovementPath(state, ALLIED, U.alEng, entry.path).allowed).toBe(true);
    }
  });
});
