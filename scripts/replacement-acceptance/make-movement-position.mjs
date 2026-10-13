// Test position for scripts/replacement-acceptance/run-positions.mjs (run after `npm run build`), in the manner of
// scripts/breakdown-make-saves.mjs: the New Game the UI makes (default settings, Air forces None, the seeds below) with a
// few units placed for Turn 1, Allied Movement Phase. Only the opening state is changed; the save goes through the same
// hash and replay checks as any other, and every later step of the run is a click in the UI.
//
// Placed (d = the direction from the Axis HQ toward the Allied HQ):
// - the Axis HQ in Combat Mode with a reduced multi-step Axis division in its hex (13.5a-2: Repls placed there rebuild it);
// - a one-step Axis Armor/Mech unit two hexes out along d, with three strong Allied units and an Allied dump beyond it;
// - a lone Axis truck four hexes to one side of the HQ, beside an Allied Leg unit that can move in and capture it (9.14).
// The rules seed is searched so the capture takes at least one truck point (13.5e) and the attack eliminates the Axis unit.
import { mkdir, writeFile } from 'node:fs/promises';
import {
  DEFAULT_NEW_GAME_REQUEST, applyGameAction, createGameplayEngine, createMemoryGameplayPorts, createNewGameOrchestrator, createRulesRng,
  hashGameState, hashScenarioDefinition, lostTruckPoints, parseGameStateJson, ruleEngine, serializeGameState,
} from '../../dist/index.js';

const out = process.argv[2] ?? 'tmp/replacement-movement-position';
await mkdir(out, { recursive: true });
export const SEEDS = { map: 6101, oob: 6102, deployment: 6103, rules: 6104 };
const request = { ...DEFAULT_NEW_GAME_REQUEST, seeds: SEEDS };
const created = await createNewGameOrchestrator(createGameplayEngine(createMemoryGameplayPorts())).create(request);
if (!created.ok) throw new Error(`New Game failed: ${JSON.stringify(created.error).slice(0, 300)}`);
const base = JSON.parse(created.value.session.serializeSave());
const start = parseGameStateJson(base.currentSnapshot);
if (!start.ok) throw new Error('snapshot');
const s0 = start.value;
const ALLIED = 'player:allied';
const AXIS = 'player:axis';
const defs = new Map(s0.scenario.pieceCatalog.definitions.map((d) => [d.id, d]));
const def = (p) => defs.get(p.definitionId);
const fullSteps = (p) => Math.max(0, ...(def(p).faces[0]?.steps.map((step) => step.remainingSteps) ?? [0]));
const strength = (p) => Math.max(0, ...(def(p).faces.find(({ id }) => id === 'combat')?.steps.map((step) => step.combatStrength ?? 0) ?? [0]));
const onMap = s0.pieceState.pieces.filter((p) => p.location.kind === 'ON_MAP');
const own = (owner) => onMap.filter((p) => p.ownerId === owner);
const hexOf = (p) => p.location.hexId;

// Axial "q,r" hexes.
const parse = (id) => id.split(',').map(Number);
const key = (q, r) => `${q},${r}`;
const DIRS = [[1, 0], [1, -1], [0, -1], [-1, 0], [-1, 1], [0, 1]];
const distance = (a, b) => { const [aq, ar] = parse(a); const [bq, br] = parse(b); return (Math.abs(aq - bq) + Math.abs(aq + ar - bq - br) + Math.abs(ar - br)) / 2; };
const step = (id, dir, n = 1) => { const [q, r] = parse(id); return key(q + DIRS[dir][0] * n, r + DIRS[dir][1] * n); };
const exists = new Set(s0.scenario.mapDefinition.hexes.map(({ id }) => id));

const axisHq = own(AXIS).find((p) => def(p).counter?.kind === 'HQ');
const alliedHq = own(ALLIED).find((p) => def(p).counter?.kind === 'HQ');
const victim = own(AXIS).find((p) => def(p).counter?.kind === 'COMBAT' && fullSteps(p) === 1 && ['ARMOR', 'MECH'].includes(def(p).counter.combatCategory));
const division = own(AXIS).find((p) => def(p).counter?.kind === 'COMBAT' && def(p).counter.rebuildable && fullSteps(p) >= 2);
const truck = own(AXIS).find((p) => def(p).counter?.symbol === 'TRUCK');
const attackers = own(ALLIED).filter((p) => def(p).counter?.kind === 'COMBAT').sort((a, b) => strength(b) - strength(a)).slice(0, 3);
const legs = own(ALLIED).filter((p) => def(p).counter?.kind === 'COMBAT' && def(p).faces.some((f) => f.mobilityClassDefinitionId === 'mobility:leg') && !attackers.includes(p));
const capturer = legs[0];
const dump = own(ALLIED).find((p) => def(p).family === 'RESOURCE');
for (const [name, piece] of Object.entries({ axisHq, alliedHq, victim, division, truck, capturer, dump })) if (!piece) throw new Error(`No ${name}`);
if (attackers.length < 3) throw new Error('Too few attackers');

// A central position on the current 32 x 24 default map; the old fixture followed an HQ now deployed at the edge.
const hq = '21,11';
const d = DIRS.map((_, index) => index).sort((a, b) => distance(step(hq, a), hexOf(alliedHq)) - distance(step(hq, b), hexOf(alliedHq)))[0];
const target = step(hq, d, 2);
const attackHexes = DIRS.map((_, index) => step(target, index)).filter((id) => distance(id, hq) === 3);
const side = (d + 2) % 6;
const truckHex = step(hq, side, 4);
const capturerHex = step(truckHex, d);
const used = [hq, target, ...attackHexes, truckHex, capturerHex];
for (const id of used) if (!exists.has(id)) throw new Error(`Hex ${id} is off the map`);
const placedIds = new Set([axisHq, victim, division, truck, capturer, dump, ...attackers].map(({ id }) => id));
// Keep the placed hexes clear of everything else, and nothing else within 2 of the HQ, the target or the truck.
const crowded = (id) => used.some((hexId) => distance(hexId, id) <= 2);
const elsewhere = [...exists].filter((id) => !used.some((hexId) => distance(hexId, id) <= 3)).sort();

const place = (state, rngSeed) => {
  const at = {
    [axisHq.id]: hq, [division.id]: hq, [victim.id]: target, [truck.id]: truckHex, [capturer.id]: capturerHex,
    [attackers[0].id]: attackHexes[0], [attackers[1].id]: attackHexes[1], [attackers[2].id]: attackHexes[2 % attackHexes.length], [dump.id]: attackHexes[0],
  };
  const order = new Map();
  let spare = 0;
  return {
    ...state,
    rng: createRulesRng(rngSeed),
    // This loaded training position needs stable trace supply while waiting for the next rebuilding phase.
    scenario: { ...state.scenario, sources: [
      ...state.scenario.sources,
      { id: 'source:test:axis-training', sideDefinitionId: 'side:axis', hexId: hq },
      { id: 'source:test:allied-training', sideDefinitionId: 'side:allied', hexId: attackHexes[0] },
    ] },
    sequence: { ...state.sequence, gameTurn: 1, playerTurnIndex: 0, phasingPlayerId: ALLIED, actingPlayerId: ALLIED, firstPlayerId: ALLIED, phase: 'MOVEMENT', segment: 'MOVEMENT' },
    pieceState: { ...state.pieceState, pieces: state.pieceState.pieces.map((p) => {
      let hexId = at[p.id];
      if (!hexId && p.location.kind === 'ON_MAP' && !placedIds.has(p.id) && crowded(p.location.hexId)) hexId = elsewhere[(spare += 7) % elsewhere.length];
      if (!hexId) return p;
      const n = (order.get(hexId) ?? 200) + 1; order.set(hexId, n);
      const combat = attackers.includes(p) || p.id === axisHq.id || p.id === victim.id || p.id === division.id;
      return {
        ...p, location: { kind: 'ON_MAP', hexId }, stackOrder: n,
        ...(def(p).family === 'GROUND' && def(p).counter?.kind !== 'TRANSPORT' ? combat ? { mode: 'COMBAT', currentFaceId: 'combat' } : { mode: 'MOVE', currentFaceId: 'move' } : {}),
        ...(p.id === division.id ? { remainingSteps: 1 } : {}),
        ...(p.id === dump.id ? { resourceQuantity: 40 } : {}),
      };
    }) },
  };
};

let actionNo = 0;
const act = (state, actorId, body) => applyGameAction(state, { actionId: `action:position:${actionNo += 1}`, actorId, expectedRevision: state.revision, ...body });

/** Headless rehearsal of the UI run: the capture move, then the attack with the three units, decisions on their first option. */
const rehearse = (state) => {
  const moved = act(state, ALLIED, { kind: 'MOVE_PIECE', pieceId: capturer.id, path: [capturerHex, truckHex] });
  if (!moved.ok) return { ok: false, why: `move: ${moved.violations.map(({ code }) => code).join(',')}` };
  let next = moved.state;
  const truckPoints = lostTruckPoints(next, AXIS);
  for (let guard = 0; guard < 40 && !(next.sequence.segment === 'COMBAT' && next.sequence.phasingPlayerId === ALLIED); guard += 1) {
    const actor = next.pendingDecision?.ownerId ?? next.sequence.actingPlayerId;
    const result = next.pendingDecision
      ? act(next, actor, { kind: 'RESPOND_DECISION', decisionId: next.pendingDecision.id, choiceId: next.pendingDecision.options[0].id })
      : act(next, actor, { kind: 'ADVANCE_SEQUENCE' });
    if (!result.ok) return { ok: false, why: `advance: ${result.violations.map(({ code }) => code).join(',')}` };
    next = result.state;
  }
  const candidates = ruleEngine.getActionCandidates(next, { actorId: ALLIED, kind: 'DECLARE_COMBAT', pieceId: null, budget: 50 }).actions
    .filter((action) => action.targetHexId === target && action.combatKind === 'REGULAR');
  const attack = candidates.sort((a, b) => b.attackerIds.length - a.attackerIds.length)[0];
  if (!attack) return { ok: false, why: 'no attack', truckPoints };
  let result = applyGameAction(next, { ...attack, expectedRevision: next.revision });
  if (!result.ok) return { ok: false, why: `attack: ${result.violations.map(({ code }) => code).join(',')}`, truckPoints };
  next = result.state;
  for (let guard = 0; guard < 40 && (next.pendingDecision || next.activeTransaction); guard += 1) {
    if (next.pendingDecision) result = act(next, next.pendingDecision.ownerId, { kind: 'RESPOND_DECISION', decisionId: next.pendingDecision.id, choiceId: next.pendingDecision.options[0].id });
    else result = act(next, next.activeTransaction.ownerId, { kind: 'COMMIT_TRANSACTION', transactionId: next.activeTransaction.id });
    if (!result.ok) return { ok: false, why: `resolve: ${result.violations.map(({ code }) => code).join(',')}`, truckPoints };
    next = result.state;
  }
  const dead = next.pieceState.pieces.find((p) => p.id === victim.id)?.location.kind === 'ELIMINATED';
  return { ok: truckPoints > 0 && dead, truckPoints, dead };
};

let chosen = null;
for (let rngSeed = 1; rngSeed <= 400 && !chosen; rngSeed += 1) {
  const outcome = rehearse(place(s0, rngSeed));
  if (rngSeed <= 3 || outcome.ok) console.log('seed', rngSeed, JSON.stringify(outcome));
  if (outcome.ok) chosen = rngSeed;
}
if (!chosen) throw new Error('No rules seed gives both the capture and the elimination.');

const state = place(s0, chosen);
const text = serializeGameState(state);
if (!text.ok) throw new Error(`invalid: ${JSON.stringify(text.error).slice(0, 400)}`);
const reparsed = parseGameStateJson(text.value);
if (!reparsed.ok) throw new Error(`invalid: ${JSON.stringify(reparsed.error).slice(0, 600)}`);
const hash = await hashGameState(reparsed.value);
const scenarioHash = await hashScenarioDefinition(reparsed.value.scenario);
const save = { ...base, label: 'Replacement test position', initialSnapshot: text.value, currentSnapshot: text.value,
  initialStateHash: hash.value, finalStateHash: hash.value, scenarioHash: scenarioHash.value, acceptedActions: [], acceptedActionMetadata: [], checkpoints: [] };
await writeFile(`${out}/position.json`, JSON.stringify(save));
const label = (id) => { const [q, r] = parse(id); const column = q + Math.floor(r / 2) + 1; return `${String(column).padStart(2, '0')}${String(r + 1).padStart(2, '0')}`; };
const facts = {
  rulesSeed: chosen, axisHq: { name: def(axisHq).name, hex: label(hq) }, division: { name: def(division).name, hex: label(hq) },
  victim: { name: def(victim).name, hex: label(target) }, attackers: attackers.map((p, index) => ({ name: def(p).name, hex: label(attackHexes[index % attackHexes.length]) })),
  truck: { name: def(truck).name, hex: label(truckHex) }, capturer: { name: def(capturer).name, hex: label(capturerHex) },
};
await writeFile(`${out}/position-facts.json`, JSON.stringify(facts, null, 2));
console.log(JSON.stringify(facts, null, 2));
