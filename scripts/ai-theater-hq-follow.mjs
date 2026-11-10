#!/usr/bin/env node
// Does the theater allocation's plan, HQ placements included, happen (docs/ai/theater-supply-plan.md)? Build first.
//
//   node scripts/ai-theater-hq-follow.mjs <ai-match dir> --weights <theater-weights.json> --out <file.jsonl> [--shard i/n]
//   node scripts/ai-theater-hq-follow.mjs --summarize <file.jsonl> [...]
//
// Replays the games where the theater policy (heuristic with --weights) attacks. At the attacker's first Movement
// decision of each player turn it plans the step as the bot does and reads the allocation's defended groups (with
// their step) and HQ placements from the THEATER debug line. When the attacker's Movement segment ends it records
// where each placed HQ stands and, for this-step groups, which members stand beside the objective and inside their
// trace coverage; over the player turn, regular attacks declared and the objectives held at its end. A next-step group
// is followed into the attacker's next player turn: the allocation's step for it then, attacks and holding.
import { appendFileSync, readFileSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const root = resolve(fileURLToPath(new URL('..', import.meta.url)));
const args = process.argv.slice(2);
const option = (name) => (args.includes(name) ? args[args.indexOf(name) + 1] : null);

const summarize = (files) => {
  const turns = files.flatMap((file) => readFileSync(file, 'utf8').trim().split('\n').filter(Boolean).map((line) => JSON.parse(line)));
  const share = (list, test) => (list.length === 0 ? '—' : `${(list.filter(test).length / list.length).toFixed(2)} (${list.filter(test).length}/${list.length})`);
  const mean = (values) => (values.length === 0 ? '—' : (values.reduce((sum, value) => sum + value, 0) / values.length).toFixed(2));
  console.log(`${new Set(turns.map(({ match }) => match)).size} games, ${turns.length} attacker player turns`);
  for (const [label, early] of [['Game Turns 1–3', true], ['Game Turns 4–8', false]]) {
    const list = turns.filter(({ gameTurn }) => (gameTurn <= 3) === early);
    const groups = list.flatMap(({ groups: g }) => g);
    const first = groups.filter(({ turn }) => turn === 1);
    const second = groups.filter(({ turn }) => turn === 2);
    const hqs = list.flatMap(({ hqs: h }) => h);
    const trucks = list.flatMap(({ trucks: t }) => t ?? []);
    console.log(`\n${label}: ${list.length} turns, regular attacks per turn ${mean(list.map(({ attacks }) => attacks))}, defended allocation groups per turn ${mean(list.map(({ groups: g }) => g.length))}`);
    console.log(`- HQ placements ${hqs.length} (this step ${hqs.filter(({ turn }) => turn === 1).length}): at their hex when Movement ends ${share(hqs, ({ endDistance }) => endDistance === 0)}, mean hexes short ${mean(hqs.map(({ endDistance }) => endDistance ?? 0))}`);
    console.log(`- Truck placements ${trucks.length}: stager at the drop when Movement ends ${share(trucks, ({ stagerAtDrop }) => stagerAtDrop)}; unloaded this step ${share(trucks, ({ unloadDistance }) => unloadDistance !== null)}, at the drop ${share(trucks, ({ unloadDistance }) => unloadDistance === 0)}; Tokens planned ${mean(trucks.map(({ tokens }) => tokens ?? 0))}, unloaded ${mean(trucks.map(({ unloaded }) => unloaded ?? 0))}`);
    console.log(`- This-step groups ${first.length}: members beside (mean share) ${mean(first.map(({ members, beside }) => beside / members))}, beside and traced ${mean(first.map(({ members, besideTraced }) => besideTraced / members))}; all beside ${share(first, ({ members, beside }) => beside === members)}; attacked ${share(first, ({ attacked }) => attacked)}; held at end ${share(first, ({ heldAtEnd }) => heldAtEnd)}`);
    const followed = second.filter(({ next }) => next);
    console.log(`- Next-step groups ${second.length}: next turn this step ${share(followed, ({ next }) => next.turn === 1)}, next step again ${share(followed, ({ next }) => next.turn === 2)}, dropped ${share(followed, ({ next }) => next.turn === null)}; attacked next turn ${share(followed, ({ next }) => next.attacked)}; held at end of next turn ${share(followed, ({ next }) => next.heldAtEnd)}`);
  }
};

if (args.includes('--summarize')) {
  summarize(args.filter((arg) => arg !== '--summarize'));
  process.exit(0);
}

const out = option('--out');
const weightsFile = option('--weights');
if (!out || !weightsFile) throw new Error('--weights <theater-weights.json> --out <file.jsonl>');
const [shard, shards] = (option('--shard') ?? '0/1').split('/').map(Number);
const dir = args.find((arg, index) => !arg.startsWith('--') && !['--out', '--weights', '--shard'].includes(args[index - 1]));
const m = await import(pathToFileURL(join(root, 'dist', 'index.js')).href);
const weights = JSON.parse(readFileSync(resolve(weightsFile), 'utf8'));
const theaterWeights = m.heuristicWeights(weights.weights ?? weights);
const policyId = `heuristic:${weightsFile}`;
writeFileSync(out, '');

const access = (state, actorId) => ({
  families: () => m.ruleEngine.getActionFamilies(state, actorId).filter((family) => family.enabled).map((family) => family.kind),
  movementRange: (pieceId) => m.ruleEngine.queryMovementRange(state, actorId, pieceId).value ?? [],
  candidates: (kind, pieceId = null, budget = 400) => m.ruleEngine.getActionCandidates(state, { actorId, kind, pieceId, budget }).actions,
  explain: (action) => ({ current: true, explanation: m.ruleEngine.explain(state, action) }),
  traceCoverage: (pieceId = null) => m.ruleEngine.queryTraceCoverage(state, actorId, pieceId).value ?? { hexIds: [], directHexIds: [] },
  feedCoverage: (pieceId = null) => m.ruleEngine.queryFeedCoverage(state, actorId, pieceId).value ?? [],
  drawReach: (hexId) => new Set((m.ruleEngine.queryDrawReach(state, actorId, hexId).value ?? []).map(String)),
  attackStrength: (attackerIds, targetHexId) => m.ruleEngine.queryAttackStrength(state, actorId, attackerIds, targetHexId).value,
  projectedReach: (pieceId, fromHexId, mode) => m.ruleEngine.queryProjectedReach(state, actorId, pieceId, fromHexId, mode).value ?? [],
  hqThrow: (hqId, fromHexId) => m.ruleEngine.queryHqThrow(state, actorId, hqId, fromHexId).value,
});
const control = (state, hexId) => state.mapState.hexControl.find((entry) => String(entry.hexId) === hexId)?.controllerId ?? null;
const hexOf = (state, pieceId) => {
  const location = state.pieceState.pieces.find(({ id }) => id === pieceId)?.location;
  return location?.kind === 'ON_MAP' ? String(location.hexId) : null;
};

/** The allocation's defended groups and HQ placements at the policy's first Movement decision from this state. */
const plan = (facts, state, attackerId) => {
  const lines = [];
  const policy = m.createHeuristicPolicy(facts, { weights: theaterWeights, debug: (line) => lines.push(line) });
  const context = {
    seatId: 'seat:hq-follow', playerId: attackerId, memory: { stepKey: 'hq-follow', actions: 0, notes: new Map() }, rng: m.createBotRng(7, 'hq-follow', 0),
    view: { playerId: attackerId, projection: m.ruleEngine.projectForViewer(state, attackerId), pendingDecision: null }, actions: access(state, attackerId),
  };
  policy.decide(context);
  const notes = context.memory.notes.get('heuristic');
  const theaterLine = lines.find((line) => line.includes(' THEATER')) ?? '';
  const turns = new Map([...theaterLine.matchAll(/ (-?\d+,-?\d+):\d+u p[\d.]+ t(\d)/g)].map(([, hexId, turn]) => [hexId, Number(turn)]));
  const hqs = [...theaterLine.matchAll(/ HQ (\S+)>(-?\d+,-?\d+)>(-?\d+,-?\d+)@(-?\d+,-?\d+)\/t(\d)/g)]
    .map(([, hqId, moveTo, hexId, objective, turn]) => ({ hqId, moveTo, hexId, objective, turn: Number(turn) }));
  const trucks = [...theaterLine.matchAll(/ TRUCK (\S+)>(-?\d+,-?\d+)@(-?\d+,-?\d+)(?:#(\d+)T\/(\S+))?/g)]
    .map(([, truckId, drop, objective, tokens, stagerId]) => ({ truckId, drop, objective, tokens: tokens === undefined ? null : Number(tokens), stagerId: stagerId ?? null }));
  const efforts = [notes?.effort, ...(notes?.secondary ?? [])].filter((effort) => effort && turns.has(String(effort.hexId)));
  return { turns, hqs, trucks, groups: efforts.map(({ hexId, unitIds }) => ({ objective: String(hexId), turn: turns.get(String(hexId)), unitIds: [...unitIds] })) };
};

const counts = { games: 0, turns: 0, skipped: 0 };
const records = JSON.parse(readFileSync(join(dir, 'summary.json'), 'utf8')).records.filter((_, index) => index % shards === shard);
for (const record of records) {
  const save = JSON.parse(readFileSync(join(dir, `match-${record.match}.save.json`), 'utf8'));
  let state = m.parseGameStateJson(save.initialSnapshot).value;
  const attackerId = state.configuration.attackVictory?.attackerId;
  const side = String(attackerId).endsWith('axis') ? 'axis' : 'allied';
  if (record.sides[side].policy !== policyId) continue;
  const facts = { scenario: state.scenario, turnLimit: 8 };
  const keyOf = (sequence) => `${sequence.gameTurn}:${sequence.playerTurnIndex}`;
  const rows = [];
  const planned = new Set();
  let turn = null;
  const close = (end) => {
    for (const group of turn.groups) {
      group.heldAtEnd = control(end, group.objective) === attackerId;
      group.attacked = turn.attacked.has(group.objective);
    }
    const previous = rows.at(-1);
    for (const group of previous?.groups.filter(({ turn: step }) => step === 2) ?? []) {
      if (previous.gameTurn !== turn.gameTurn - 1) continue;
      group.next = { turn: turn.plan.turns.get(group.objective) ?? null, attacked: turn.attacked.has(group.objective), heldAtEnd: control(end, group.objective) === attackerId };
    }
    rows.push({
      match: record.match, gameTurn: turn.gameTurn, attacks: turn.attacked.size,
      hqs: turn.hqs, trucks: turn.trucks, groups: turn.groups.map(({ unitIds, ...group }) => ({ ...group, members: unitIds.length })),
    });
    turn = null;
  };
  const inMovement = (current) => current.sequence.phase === 'MOVEMENT' && current.sequence.segment === 'MOVEMENT' && keyOf(current.sequence) === turn?.key;
  for (const action of save.acceptedActions) {
    const { sequence } = state;
    if (turn && keyOf(sequence) !== turn.key) close(state);
    if (!turn && sequence.phasingPlayerId === attackerId && sequence.actingPlayerId === attackerId && !state.pendingDecision
      && sequence.phase === 'MOVEMENT' && sequence.segment === 'MOVEMENT' && !planned.has(sequence.gameTurn)) {
      planned.add(sequence.gameTurn);
      const result = plan(facts, state, attackerId);
      const defended = (hexId) => m.ruleEngine.projectForViewer(state, attackerId).stacks
        .some(({ location, pieces }) => location.kind === 'ON_MAP' && String(location.hexId) === hexId && pieces.some((piece) => piece.ownerId !== attackerId && piece.role === 'COMBAT'));
      turn = {
        key: keyOf(sequence), gameTurn: sequence.gameTurn, plan: result, attacked: new Set(),
        hqs: result.hqs.map((placement) => ({ ...placement, endDistance: null })),
        trucks: result.trucks.map((placement) => ({ ...placement, unloadDistance: null, unloaded: 0, stagerAtDrop: null })),
        groups: result.groups.filter(({ objective }) => defended(objective)).map((group) => ({ ...group, beside: null, besideTraced: null })),
      };
    }
    if (turn && action.kind === 'UNLOAD_SUPPLY' && inMovement(state)) {
      for (const placement of turn.trucks.filter(({ truckId }) => truckId === String(action.pieceId ?? action.truckId))) {
        placement.unloadDistance ??= m.hexDistanceBetween(hexOf(state, placement.truckId), placement.drop);
        placement.unloaded += action.tokens;
      }
    }
    if (turn && action.kind === 'DECLARE_COMBAT' && action.combatKind === 'REGULAR' && action.actorId === attackerId) turn.attacked.add(String(action.targetHexId));
    const next = m.ruleEngine.applyAction(state, action).state;
    if (turn && inMovement(state) && !inMovement(next)) {
      for (const placement of turn.trucks.filter(({ stagerId }) => stagerId)) placement.stagerAtDrop = hexOf(next, placement.stagerId) === placement.drop;
      for (const placement of turn.hqs) {
        const hexId = hexOf(next, placement.hqId);
        placement.endDistance = hexId === null ? null : m.hexDistanceBetween(hexId, placement.moveTo);
      }
      for (const group of turn.groups.filter(({ turn: step }) => step === 1)) {
        const beside = group.unitIds.filter((unitId) => { const hexId = hexOf(next, unitId); return hexId !== null && m.hexDistanceBetween(hexId, group.objective) === 1; });
        group.beside = beside.length;
        group.besideTraced = beside.filter((unitId) => (m.ruleEngine.queryTraceCoverage(next, attackerId, unitId).value?.hexIds ?? []).map(String).includes(hexOf(next, unitId))).length;
      }
    }
    state = next;
  }
  if (turn) close(state);
  if ((await m.hashGameState(state)).value !== record.finalStateHash) { counts.skipped += 1; continue; }
  counts.games += 1; counts.turns += rows.length;
  for (const row of rows) appendFileSync(out, `${JSON.stringify(row)}\n`);
}
console.log(JSON.stringify(counts));
