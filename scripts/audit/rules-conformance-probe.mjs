// OCS 4.3 conformance probe (audit 2026-09-30). Run after `npm run build`:
//   node scripts/audit/rules-conformance-probe.mjs
// Each row builds a minimal state on the generated default scenario (terrain flattened to Clear
// unless stated) and compares engine behaviour with the cited rule. FAIL means the engine
// contradicts the rule. Exit code is non-zero when any row fails.
import * as E from '../../dist/index.js';

const P = E.prepareNewGame(E.DEFAULT_NEW_GAME_REQUEST).value;
const AL = 'player:allied', AX = 'player:axis';
const find = (s) => P.scenario.initialPieceState.pieces.find((p) => p.id.includes(s))?.id;
const U = {
  alTrk: find('allied:f1-combat-1'), alTrk2: find('allied:f1-combat-2'), alLeg: find('allied:f2-combat-1'), alLeg2: find('allied:f2-combat-2'),
  alArt: find('allied:f1-artillery-1'), alEng: find('allied:independent-engineer-1'), alHq: find('allied:f1-command'),
  alSup: find('allied:independent-supply-1'),
  axTrk: find('axis:f1-combat-1'), axTrk2: find('axis:f1-combat-2'), axTruck: find('axis:f2-combat-1'), axTruck2: find('axis:f2-combat-2'),
  axSup: find('axis:independent-supply-1'),
};
const flatMap = (terrainAt = {}) => ({
  ...P.scenario.mapDefinition,
  hexes: P.scenario.mapDefinition.hexes.map((h) => ({ ...h, terrainDefinitionIds: [terrainAt[h.id] ?? 'terrain:clear'], features: h.features.filter((f) => f.kind !== 'PRINTED_FEATURE') })),
  hexsides: [],
});
/** place: { pieceId: [hex, mode, face?] }; unlisted Pieces are removed. */
const build = (place, terrainAt = {}, sources = null) => {
  const pieces = P.scenario.initialPieceState.pieces.map((p) => {
    const spec = place[p.id];
    if (!spec) return { ...p, location: { kind: 'ELIMINATED' }, stackOrder: 0 };
    const [hexId, mode, face] = spec;
    return { ...p, location: { kind: 'ON_MAP', hexId }, mode: mode === undefined ? p.mode : mode, currentFaceId: face ?? p.currentFaceId };
  });
  const scenario = {
    ...P.scenario, mapDefinition: flatMap(terrainAt),
    initialPieceState: { ...P.scenario.initialPieceState, pieces },
    sources: sources ?? P.scenario.sources,
  };
  const r = E.createInitialGameState(scenario, P.configuration, 7);
  if (!r.ok) throw new Error(JSON.stringify(r.error.slice(0, 3)));
  // Fuel (12.5) is pre-paid so each row isolates its own rule; fuel has its own rows.
  return { ...r.value, fuel: { hqIds: [], formations: r.value.scenario.players.map(({ id }) => ({
    playerId: id, formationId: 'formation:probe-fuel', coveredPieceIds: r.value.pieceState.pieces.filter((p) => p.ownerId === id).map((p) => p.id),
  })) } };
};
const unfueled = (s) => ({ ...s, fuel: { hqIds: [], formations: [] } });
const seq = (s, phase, segment, actor, phasing = actor) => ({ ...s, sequence: { ...s.sequence, phase, segment, actingPlayerId: actor, phasingPlayerId: phasing } });
let n = 0;
const act = (s, actor, body) => E.ruleEngine.applyAction(s, { actionId: `action:probe:${n++}`, actorId: actor, expectedRevision: s.revision, ...body });
const codes = (r) => r.ok ? 'ACCEPTED' : r.violations.map((v) => v.code).join(',');
const out = [];
const report = (id, rule, expected, observed, fail) => out.push({ id, rule, expected, observed, verdict: fail ? 'FAIL' : 'ok' });
const combat = (s, actor, kind, attackers, hex, lead = attackers[0]) => act(s, actor, {
  kind: 'DECLARE_COMBAT', combatKind: kind, attackerIds: attackers,
  defenderIds: s.pieceState.pieces.filter((p) => p.ownerId !== actor && p.location.kind === 'ON_MAP' && p.location.hexId === hex && p.mode !== null && p.remainingSteps !== null).map((p) => p.id),
  targetHexId: hex, leadAttackerId: lead,
});
/** Answer every pending decision with `pick(decision)` (default: first option). */
const settle = (s, pick = (d) => d.options[0].id) => {
  const log = [];
  for (let guard = 0; s.pendingDecision && guard < 30; guard += 1) {
    const d = s.pendingDecision;
    const choice = pick(d);
    log.push(`${d.kind}:${choice}`);
    const r = act(s, d.ownerId, { kind: 'RESPOND_DECISION', decisionId: d.id, choiceId: choice });
    if (!r.ok) { log.push(codes(r)); break; }
    s = r.state;
  }
  return { s, log };
};

// ZOC by mobility (4.5a A) and negation (4.5b)
{
  const enemy = { [U.axTrk]: ['8,5', 'COMBAT', 'combat'] };
  const path = ['5,5', '6,5', '7,5', '7,6', '7,7'];
  for (const [label, pid] of [['tracked', U.alTrk], ['leg', U.alLeg], ['truck', U.alEng]]) {
    const s = seq(build({ ...enemy, [pid]: ['5,5', 'MOVE', 'move'] }), 'MOVEMENT', 'MOVEMENT', AL);
    const q = E.queryMovementPath(s, AL, pid, path);
    const exp = label === 'truck' ? 'stop' : 'pass';
    report(`ZOC-${label}`, '4.5a(A)/6.3b', `${label} MP ${exp} in EZOC`, q.allowed ? 'pass' : q.reasons.map((r) => r.code).join(','), (exp === 'pass') !== q.allowed);
  }
  const s = seq(build({ ...enemy, [U.alEng]: ['5,5', 'MOVE', 'move'], [U.alLeg2]: ['7,5', 'COMBAT', 'combat'] }), 'MOVEMENT', 'MOVEMENT', AL);
  const q = E.queryMovementPath(s, AL, U.alEng, ['5,5', '6,5', '7,5', '7,4']);
  report('ZOC-negation', '4.5b', 'truck passes EZOC negated by friendly combat unit', q.allowed ? 'pass' : q.reasons.map((r) => r.code).join(','), !q.allowed);
  if (q.allowed) {
    const moved = act(s, AL, { kind: 'MOVE_PIECE', pieceId: U.alEng, path: ['5,5', '6,5', '7,5', '7,4'] });
    const negatorMove = act(moved.state, AL, { kind: 'MOVE_PIECE', pieceId: U.alLeg2, path: ['7,5', '6,5'] });
    report('ZOC-negator-locked', '4.5b', 'negating unit cannot spend MP later in the phase', codes(negatorMove), negatorMove.ok);
  }
}
// Reaction / Exploitation eligibility (7.0a, 11.0a)
{
  const s = seq(build({ [U.alTrk]: ['5,5', 'MOVE', 'move'], [U.axTrk]: ['12,5', 'COMBAT', 'combat'] }), 'REACTION', 'MOVEMENT', AL, AX);
  const r = act(s, AL, { kind: 'MOVE_PIECE', pieceId: U.alTrk, path: ['5,5', '6,5'] });
  report('REACTION-eligibility', '7.0a', 'Move-mode unit cannot move in Reaction', codes(r), r.ok);
  const s2 = seq(build({ [U.alTrk]: ['5,5', 'MOVE', 'move'] }), 'EXPLOITATION', 'MOVEMENT', AL);
  const r2 = act(s2, AL, { kind: 'MOVE_PIECE', pieceId: U.alTrk, path: ['5,5', '6,5'] });
  report('EXPLOIT-eligibility', '11.0a', 'Move-mode unit cannot move in Exploitation', codes(r2), r2.ok);
  const s3 = seq(build({ [U.alTrk]: ['5,5', 'RESERVE', 'move'], [U.axTrk]: ['12,5', 'COMBAT', 'combat'] }), 'REACTION', 'MOVEMENT', AL, AX);
  const released = act(s3, AL, { kind: 'RELEASE_RESERVE', pieceId: U.alTrk });
  const allowance = E.movementAllowanceTicks(released.state, U.alTrk);
  report('REACTION-half-MA', '5.7b(B)', 'released Reserve moves half MA in Reaction', `mode=${released.state.pieceState.pieces.find((p) => p.id === U.alTrk).mode}, MA ticks=${allowance} (printed 56)`, allowance !== 28);
}
// Mode change timing (5.4) and one mover at a time (6.1g)
{
  let s = seq(build({ [U.alTrk]: ['5,5', 'MOVE', 'move'], [U.alTrk2]: ['5,7', 'MOVE', 'move'] }), 'MOVEMENT', 'MOVEMENT', AL);
  s = act(s, AL, { kind: 'MOVE_PIECE', pieceId: U.alTrk, path: ['5,5', '6,5'] }).state;
  const m = act(s, AL, { kind: 'CHANGE_MODE', pieceId: U.alTrk, mode: 'COMBAT' });
  report('MODE-after-move', '5.4', 'mode change only as unit begins to move', codes(m), m.ok);
  s = act(s, AL, { kind: 'MOVE_PIECE', pieceId: U.alTrk2, path: ['5,7', '6,7'] }).state;
  const back = act(s, AL, { kind: 'MOVE_PIECE', pieceId: U.alTrk, path: ['6,5', '7,5'] });
  report('MOVE-resume', '6.1g', 'cannot return to an earlier unit after moving another', codes(back), back.ok);
}
{
  const s = seq(build({ [U.alTrk]: ['5,5', 'COMBAT', 'combat'] }), 'MOVEMENT', 'MOVEMENT', AL);
  const r = act(s, AL, { kind: 'CHANGE_MODE', pieceId: U.alTrk, mode: 'STRAT' });
  const p = r.state.pieceState.pieces.find((x) => x.id === U.alTrk);
  report('STRAT-orientation', '5.8', 'Strat unit oriented to Move side', `face=${p.currentFaceId}`, p.currentFaceId !== 'move');
}
// Released reserves (5.7b) and Exploitation combat (11.0)
{
  let s = seq(build({ [U.alTrk]: ['5,5', 'RESERVE', 'combat'], [U.axTrk]: ['6,5', 'COMBAT', 'combat'], [U.alSup]: ['4,5'] }), 'EXPLOITATION', 'MOVEMENT', AL);
  const r = act(s, AL, { kind: 'RELEASE_RESERVE', pieceId: U.alTrk });
  const p = r.state.pieceState.pieces.find((x) => x.id === U.alTrk);
  report('RESERVE-release-mode', '5.7b', 'released unit returns to Combat/Move mode', `mode=${p.mode}`, p.mode === 'RESERVE');
  s = r.state;
  const o = combat(s, AL, 'OVERRUN', [U.alTrk], '6,5');
  report('RESERVE-release-overrun', '5.7b(A)', 'released reserve can overrun in Exploitation', codes(o), !o.ok);
  const s3 = { ...s, sequence: { ...s.sequence, segment: 'COMBAT' } };
  const c = combat(s3, AL, 'REGULAR', [U.alTrk], '6,5');
  report('EXPLOIT-combat-segment', '2.2/11.0', 'regular combat possible in Exploitation Combat Segment', codes(c), !c.ok);
}
// Exploit results (9.13) reachable
{
  let got = false;
  for (let seed = 1; seed < 400 && !got; seed += 1) {
    let s = seq(build({ [U.alTrk]: ['5,5', 'COMBAT', 'combat'], [U.alTrk2]: ['5,5', 'COMBAT', 'combat'], [U.axTruck]: ['6,5', 'MOVE', 'move'], [U.alSup]: ['4,5'] }), 'COMBAT', 'COMBAT', AL);
    s = { ...s, rng: E.createRulesRng(seed) };
    const r = combat(s, AL, 'REGULAR', [U.alTrk, U.alTrk2], '6,5');
    if (!r.ok) continue;
    const { s: after } = settle(r.state, (d) => d.kind === 'OPTION_SPLIT' ? d.options.find((o) => o.id.endsWith(':0')).id : d.options[0].id);
    got = after.pieceState.pieces.some((x) => x.mode === 'EXPLOITATION');
  }
  report('EXPLOIT-mode-reachable', '9.13', 'combat can award Exploitation mode', got ? 'EXPLOITATION mode reached' : 'never reached in 400 seeds', !got);
}
// Barrage restrictions (13.4a, 10.0e)
{
  const place = (mode, face) => ({ [U.alArt]: ['5,5', mode, face], [U.axTrk]: ['6,5', 'COMBAT', 'combat'], [U.alSup]: ['5,6'], [U.alLeg]: ['7,5', 'COMBAT', 'combat'] });
  const barrage = (s) => act(s, AL, { kind: 'DECLARE_BARRAGE', firerIds: [U.alArt], targetPieceIds: [U.axTrk], targetHexId: '6,5' });
  report('BARRAGE-reserve', '13.4a', 'Reserve artillery cannot barrage', codes(barrage(seq(build(place('RESERVE', 'combat')), 'COMBAT', 'BARRAGE', AL))), barrage(seq(build(place('RESERVE', 'combat')), 'COMBAT', 'BARRAGE', AL)).ok);
  const strat = barrage(seq(build(place('STRAT', 'move')), 'COMBAT', 'BARRAGE', AL));
  report('BARRAGE-strat', '13.4a', 'Strat artillery cannot barrage', codes(strat), strat.ok);
  const movement = barrage(seq(build(place('COMBAT', 'combat')), 'MOVEMENT', 'BARRAGE', AL));
  report('BARRAGE-movement-phase', '10.0e(C)', 'no artillery barrage in Movement Phase', codes(movement), movement.ok);
  const legal = barrage(seq(build(place('COMBAT', 'combat')), 'COMBAT', 'BARRAGE', AL));
  report('BARRAGE-legal', '10.1', 'artillery barrage in Combat Phase resolves', codes(legal), !legal.ok);
}
// Terrain (9.3/9.4), modes (5.7/5.8), whole-hex defence (9.1d), combat supply (9.5A)
{
  const place = { [U.alTrk]: ['5,5', 'COMBAT', 'combat'], [U.axTrk]: ['6,5', 'COMBAT', 'combat'], [U.alSup]: ['5,6'] };
  const odds = (s, supplied = true) => E.calculateCombatOdds(s, [U.alTrk], [U.axTrk], '6,5', supplied ? [U.axTrk] : [], U.alTrk, U.axTrk);
  const results = {};
  for (const t of ['terrain:clear', 'terrain:woods', 'terrain:marsh']) {
    const o = odds(build(place, { '6,5': t }));
    results[t.slice(8)] = `${o.attackerStrength}:${o.defenderStrength} ${o.line} col ${o.oddsText}`;
  }
  report('COMBAT-terrain', '9.3/9.4', 'defender terrain changes strength/row', JSON.stringify(results), new Set(Object.values(results)).size === 1);
  const baseDef = odds(build(place)).defenderStrength;
  for (const [mode, face, expected] of [['STRAT', 'move', 0], ['RESERVE', 'combat', baseDef / 2]]) {
    const o = odds(build({ ...place, [U.axTrk]: ['6,5', mode, face] }));
    report(`DEFEND-${mode}`, mode === 'STRAT' ? '5.8' : '5.7', `defender strength ${expected}`, `${o.defenderStrength}`, o.defenderStrength !== expected);
  }
  const unsupplied = odds(build(place), false).defenderStrength;
  report('DEFEND-unsupplied', '9.5B', `withheld supply halves defense (${baseDef / 2})`, `${unsupplied}`, unsupplied !== baseDef / 2);
  const s = seq(build({ ...place, [U.axTrk2]: ['6,5', 'COMBAT', 'combat'] }), 'COMBAT', 'COMBAT', AL);
  const partial = act(s, AL, { kind: 'DECLARE_COMBAT', combatKind: 'REGULAR', attackerIds: [U.alTrk], defenderIds: [U.axTrk], targetHexId: '6,5', leadAttackerId: U.alTrk });
  report('COMBAT-partial-defender', '9.1d', 'all combat units in hex must defend', codes(partial), partial.ok);
  // 12.10: without on-map SP an attacker uses internal stocks; once Exhausted it cannot attack (12.10c).
  const dry = seq(build({ [U.alTrk]: ['5,5', 'COMBAT', 'combat'], [U.axTrk]: ['6,5', 'COMBAT', 'combat'] }), 'COMBAT', 'COMBAT', AL);
  const exhausted = { ...dry, pieceState: { ...dry.pieceState, pieces: dry.pieceState.pieces.map((p) => p.id === U.alTrk ? E.withInternalStocks(p, 'EXHAUSTED') : p) } };
  const noDump = combat(exhausted, AL, 'REGULAR', [U.alTrk], '6,5');
  report('COMBAT-attacker-unsupplied', '9.5A/12.10c', 'Exhausted attacker without on-map SP cannot attack', codes(noDump), noDump.ok);
  const internal = combat(dry, AL, 'REGULAR', [U.alTrk], '6,5');
  report('COMBAT-internal-stocks', '12.10a/b', 'attacker without on-map SP attacks on internal stocks', codes(internal), !internal.ok);
  const multi = combat(seq(build({ ...place, [U.alTrk2]: ['5,6', 'COMBAT', 'combat'] }), 'COMBAT', 'COMBAT', AL), AL, 'REGULAR', [U.alTrk, U.alTrk2], '6,5');
  report('COMBAT-multi-attacker', '9.1c', 'several units and hexes can attack one hex', codes(multi), !multi.ok);
}
// Hex attacked once (9.1c), retreat DG (5.10a), no enemy co-location (4.8c)
{
  const s0 = seq(build({ [U.alTrk]: ['5,5', 'COMBAT', 'combat'], [U.alTrk2]: ['5,6', 'COMBAT', 'combat'], [U.alLeg]: ['7,4', 'COMBAT', 'combat'], [U.axTrk]: ['6,5', 'COMBAT', 'combat'], [U.alSup]: ['4,5'] }), 'COMBAT', 'COMBAT', AL);
  const first = combat(s0, AL, 'REGULAR', [U.alTrk], '6,5');
  const { s } = settle(first.state, (d) => d.options.find((o) => /option:\d+:0|advance:none/.test(o.id))?.id ?? d.options[0].id);
  const again = combat(s, AL, 'REGULAR', [U.alTrk2], '6,5');
  report('COMBAT-hex-once', '9.1c', 'hex attacked only once per Combat Segment', codes(again), again.ok && s.pieceState.pieces.some((p) => p.id === U.axTrk && p.location.hexId === '6,5'));
  let checked = false;
  for (let seed = 1; seed < 300 && !checked; seed += 1) {
    let r = combat({ ...s0, rng: E.createRulesRng(seed) }, AL, 'REGULAR', [U.alLeg], '6,5');
    const events = [...r.events];
    // 9.2: the defender pays or withholds supply and names his lead unit before the dice are rolled.
    while (r.ok && r.state.pendingDecision && r.state.activeTransaction?.result === null) {
      const d = r.state.pendingDecision;
      r = act(r.state, d.ownerId, { kind: 'RESPOND_DECISION', decisionId: d.id, choiceId: d.options[0].id });
      events.push(...r.events);
    }
    const cell = r.state.activeTransaction?.result ?? events.find((e) => e.kind === 'TRANSACTION_RESOLVED')?.result ?? '';
    if (!/\/Do1$/.test(cell)) continue;
    const pick = (d) => d.kind === 'OPTION_SPLIT'
      ? (d.ownerId === AX ? d.options.find((o) => o.id === 'option:0:1')?.id : d.options.find((o) => /option:\d+:0/.test(o.id))?.id) ?? d.options[0].id
      : d.kind === 'ADVANCE_HEX' ? 'advance:none' : d.options[0].id;
    const { s: after } = settle(r.state, pick);
    const p = after.pieceState.pieces.find((x) => x.id === U.axTrk);
    if (p.location.kind !== 'ON_MAP' || p.location.hexId === '6,5') continue;
    const zoc = E.inEnemyZoc(after, AX, p.location.hexId);
    report('RETREAT-1hex-DG', '5.10a/9.12a', '1-hex retreat, not into EZOC: no DG', `result ${cell}; retreated to ${p.location.hexId} (EZOC=${zoc}), mode=${p.mode}`, !zoc && p.mode === 'DG');
    checked = true;
  }
  if (!checked) report('RETREAT-1hex-DG', '5.10a/9.12a', '1-hex retreat, not into EZOC: no DG', 'no Do1 result found in 300 seeds', true);
  let colocated = false;
  for (let seed = 1; seed < 150; seed += 1) {
    let st = seq(build({ [U.alTrk]: ['6,5', 'MOVE', 'move'], [U.axTruck]: ['7,5', 'MOVE', 'move'], [U.axArt]: ['7,5', 'MOVE', 'move'], [U.alSup]: ['5,5'] }), 'MOVEMENT', 'MOVEMENT', AL);
    st = { ...st, rng: E.createRulesRng(seed) };
    const r = combat(st, AL, 'OVERRUN', [U.alTrk], '7,5');
    if (!r.ok) break;
    const { s: after } = settle(r.state);
    const owners = new Set(after.pieceState.pieces.filter((p) => p.location.kind === 'ON_MAP' && p.location.hexId === '7,5' && p.mode !== null).map((p) => p.ownerId));
    if (owners.size > 1) colocated = true;
  }
  report('NO-COLOCATION', '4.8c/9.1d', 'overrun never leaves enemy combat units sharing a hex', colocated ? 'co-location observed' : 'none in 150 seeds', colocated);
}
// Overrun costs (8.1a) and DG (5.10b)
{
  let s = seq(build({ [U.alTrk]: ['5,5', 'MOVE', 'move'], [U.axTruck]: ['7,5', 'MOVE', 'move'], [U.alSup]: ['4,5'] }), 'MOVEMENT', 'MOVEMENT', AL);
  const allowance = E.movementAllowanceTicks(s, U.alTrk);
  s = { ...s, usage: [{ pieceId: U.alTrk, movementSpentTicks: allowance - 12, moved: true, phaseStartHexId: '5,5', attacked: false, barraged: false, reserveReleased: false, negationLocked: false, supplyPaid: false, fueled: true, fuelThrowHexId: null, recovered: false, breakoutAttempted: false, blown: false, unloadedTokens: 0 }], currentMoverId: U.alTrk };
  s = act(s, AL, { kind: 'MOVE_PIECE', pieceId: U.alTrk, path: ['5,5', '6,5'] }).state;
  const o = combat(s, AL, 'OVERRUN', [U.alTrk], '7,5');
  report('OVERRUN-no-MP', '8.1a', 'unit with <3 MP left cannot overrun', codes(o), o.ok);
  const s2 = seq(build({ [U.alTrk]: ['6,5', 'MOVE', 'move'], [U.axTruck]: ['7,5', 'MOVE', 'move'], [U.alSup]: ['5,5'] }), 'MOVEMENT', 'MOVEMENT', AL);
  const r = combat(s2, AL, 'OVERRUN', [U.alTrk], '7,5');
  const { s: after } = settle(r.state);
  const spent = after.usage.find((u) => u.pieceId === U.alTrk)?.movementSpentTicks ?? 0;
  report('OVERRUN-3MP-cost', '8.1a', 'overrun charges 3 MP (12 ticks)', `movementSpentTicks=${spent}`, spent < 12);
  const dg = combat(seq(build({ [U.alTrk]: ['6,5', 'DG', 'move'], [U.axTruck]: ['7,5', 'MOVE', 'move'], [U.alSup]: ['5,5'] }), 'MOVEMENT', 'MOVEMENT', AL), AL, 'OVERRUN', [U.alTrk], '7,5');
  report('OVERRUN-DG', '5.10b(C)', 'DG unit cannot overrun', codes(dg), dg.ok);
  const noFuel = combat(unfueled(s2), AL, 'OVERRUN', [U.alTrk], '7,5');
  report('OVERRUN-fuel', '12.5b', 'overrun requires fuel', codes(noFuel), !codes(noFuel).includes('FUEL_REQUIRED'));
}
// Fuel (12.5)
{
  const s = seq(unfueled(build({ [U.alTrk]: ['1,5', 'COMBAT', 'combat'], [U.alLeg]: ['1,7', 'COMBAT', 'combat'], [U.alSup]: ['1,6'] })), 'MOVEMENT', 'MOVEMENT', AL);
  const tracked = act(s, AL, { kind: 'MOVE_PIECE', pieceId: U.alTrk, path: ['1,5', '2,5'] });
  report('FUEL-required', '12.5a', 'Track unit spends no MP unfueled', codes(tracked), !codes(tracked).includes('FUEL_REQUIRED'));
  const leg = act(s, AL, { kind: 'MOVE_PIECE', pieceId: U.alLeg, path: ['1,7', '2,7'] });
  report('FUEL-leg', '12.5a', 'Leg unit needs no fuel', codes(leg), !leg.ok);
  const paid = act(s, AL, { kind: 'PAY_FUEL', method: 'SINGLE_UNIT', pieceId: U.alTrk, sourcePieceId: U.alSup });
  const moved = paid.ok ? act(paid.state, AL, { kind: 'MOVE_PIECE', pieceId: U.alTrk, path: ['1,5', '2,5'] }) : paid;
  report('FUEL-single-unit', '12.5c(C)', 'after 1T the unit moves', codes(moved), !moved.ok);
}
// Sequence: first player (2.3); supply determination (12.6)
{
  let s = build({ [U.alTrk]: ['5,5', 'MOVE', 'move'], [U.axTrk]: ['12,5', 'MOVE', 'move'] });
  let rolls = 0;
  for (let guard = 0; s.sequence.phase !== 'COMPLETE' && guard < 200; guard += 1) {
    // Arriving SP and units must be placed first (13.6); internal stocks recover first (12.10e).
    const [mandatory] = s.pendingDecision ? [] : ['PLACE_REINFORCEMENT', 'RECOVER_INTERNALS']
      .flatMap((kind) => E.ruleEngine.getActionCandidates(s, { actorId: s.sequence.actingPlayerId, kind, pieceId: null, budget: 1 }).actions);
    const r = s.pendingDecision
      ? act(s, s.pendingDecision.ownerId, { kind: 'RESPOND_DECISION', decisionId: s.pendingDecision.id, choiceId: s.pendingDecision.options[0].id })
      : mandatory ? E.ruleEngine.applyAction(s, mandatory) : act(s, s.sequence.actingPlayerId, { kind: 'ADVANCE_SEQUENCE' });
    if (!r.ok) break;
    rolls += r.events.filter((e) => e.kind === 'FIRST_PLAYER_ROLLED').length;
    s = r.state;
  }
  report('SEQ-first-player', '2.3', 'dice decide first player from turn 2', `first-player rolls over ${E.DEFAULT_NEW_GAME_REQUEST.turnLimit} turns: ${rolls}`, rolls !== E.DEFAULT_NEW_GAME_REQUEST.turnLimit - 1);
  const far = { [U.alTrk]: ['14,5', 'MOVE', 'move'] };
  let t = seq(build(far), 'MOVEMENT', 'BARRAGE', AL);
  t = act(t, AL, { kind: 'ADVANCE_SEQUENCE' }).state;
  const oos = t.pieceState.pieces.find((p) => p.id === U.alTrk).statuses.some((x) => x.statusDefinitionId === 'status:out-of-supply');
  report('SUPPLY-determined', '12.6d', 'unit without trace is marked Out of Supply when the phase ends', `phase=${t.sequence.phase}, OOS=${oos}`, !oos);
}
{
  const water = {};
  for (const h of P.scenario.mapDefinition.hexes) { const [q, r] = h.id.split(',').map(Number); const col = q + Math.floor(r / 2); if (col >= 1 && col <= 4) water[h.id] = 'terrain:water'; }
  const s = seq(build({ [U.alTrk]: ['4,6', 'MOVE', 'move'] }, water, [{ ...P.scenario.sources[0], hexId: '-3,6' }]), 'SUPPLY', 'NONE', AL);
  const q = E.querySupply(s, AL, U.alTrk, 'TRACE');
  report('SUPPLY-trace-terrain', '12.3d', 'trace path cannot cross all-sea hexes', `allowed=${q.allowed} method=${q.value.method}`, q.value.method !== 'NONE');
}
for (const row of out) console.log(`${row.verdict.padEnd(4)} ${row.id.padEnd(26)} [${row.rule}] expect: ${row.expected} | got: ${row.observed}`);
const failures = out.filter((r) => r.verdict === 'FAIL').length;
console.log(`FAIL ${failures}/${out.length}`);
process.exitCode = failures > 0 ? 1 : 0;
