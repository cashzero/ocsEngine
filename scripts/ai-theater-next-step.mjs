#!/usr/bin/env node
// What happens to the theater allocation's next-step groups (docs/ai/theater-supply-plan.md)? Build first.
//
//   node scripts/ai-theater-next-step.mjs <ai-match dir> --weights <theater-weights.json> --out <file.jsonl> [--shard i/n]
//   node scripts/ai-theater-next-step.mjs --summarize <file.jsonl> [...]
//
// Replays the games where the theater policy (heuristic with --weights) attacks. At the attacker's first Movement
// decision of each player turn it plans the step as the bot does and takes the defended groups the allocation puts on
// the next step (THEATER t2). For each member it records:
// - at planning: whether a free hex beside the objective is in its reach from where it stands (fueled, unmoved, in its
//   current mode, Move or Combat mode: trace ignored) and whether one such hex is inside its trace coverage now;
// - when it begins to move that step (after any HQ moved before it): the move candidates ending beside the objective,
//   whether one is inside its trace coverage now and whether the friendly-supply gate lets one through, and where it
//   stopped.
// For each group, at the next attacker player turn's first Movement decision: whether the allocation still has the
// objective and on which step, members alive and with a traced hex beside it in reach, the nearest attacker HQ's
// distance to the objective then and a turn before; over that next player turn: attacked and held at its end.
import { appendFileSync, readFileSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const root = resolve(fileURLToPath(new URL('..', import.meta.url)));
const args = process.argv.slice(2);
const option = (name) => (args.includes(name) ? args[args.indexOf(name) + 1] : null);

const summarize = (files) => {
  const groups = files.flatMap((file) => readFileSync(file, 'utf8').trim().split('\n').filter(Boolean).map((line) => JSON.parse(line)));
  const share = (list, test) => (list.length === 0 ? '—' : `${(list.filter(test).length / list.length).toFixed(2)} (${list.filter(test).length}/${list.length})`);
  const mean = (values) => (values.length === 0 ? '—' : (values.reduce((sum, value) => sum + value, 0) / values.length).toFixed(2));
  for (const [label, early] of [['Game Turns 1–3', true], ['Game Turns 4–8', false]]) {
    const list = groups.filter(({ gameTurn }) => (gameTurn <= 3) === early);
    const members = list.flatMap(({ members: m }) => m);
    const moved = members.filter(({ move }) => move);
    const offered = moved.filter(({ move }) => move.besideCandidates > 0);
    const next = list.filter(({ next: n }) => n);
    console.log(`\n${label}: ${list.length} next-step defended groups, ${members.length} members`);
    console.log(`- Planning: beside reachable ignoring trace ${share(members, ({ plan }) => plan.reachBeside)}; beside traced in reach ${share(members, ({ plan }) => plan.tracedBeside)}`);
    console.log(`- Groups whose every member had beside in reach (deferred only by trace) ${share(list, ({ members: m }) => m.every(({ plan }) => plan.reachBeside))}`);
    console.log(`- Members that moved this step ${share(members, ({ move }) => move)}; offered a beside move ${share(moved, ({ move }) => move.besideCandidates > 0)}`);
    console.log(`  of those offered: beside traced at move time ${share(offered, ({ move }) => move.tracedBeside)}; gate lets one through ${share(offered, ({ move }) => move.gatePass)}; stopped beside ${share(offered, ({ move }) => move.endDistance === 1)}`);
    console.log(`  of those the plan saw untraced but reachable: gate passes at move time ${share(offered.filter(({ plan }) => plan.reachBeside && !plan.tracedBeside), ({ move }) => move.gatePass)}`);
    console.log(`- Next attacker turn exists ${next.length}; objective still not held at its start ${share(next, ({ next: n }) => !n.heldAtStart)}`);
    const open = next.filter(({ next: n }) => !n.heldAtStart);
    console.log(`  of open ones: still allocated ${share(open, ({ next: n }) => n.allocatedTurn !== null)}, as this step ${share(open, ({ next: n }) => n.allocatedTurn === 1)}, as next step again ${share(open, ({ next: n }) => n.allocatedTurn === 2)}`);
    console.log(`  still defended ${share(open, ({ next: n }) => n.defended)}; members alive (mean share) ${mean(open.map(({ next: n, members: m }) => n.alive / m.length))}; members with traced beside in reach (mean share) ${mean(open.map(({ next: n, members: m }) => n.tracedBeside / m.length))}`);
    console.log(`  nearest HQ distance: at planning ${mean(open.map(({ hqDistance }) => hqDistance))}, next turn ${mean(open.map(({ next: n }) => n.hqDistance))}; closer ${share(open, ({ hqDistance, next: n }) => n.hqDistance < hqDistance)}, same ${share(open, ({ hqDistance, next: n }) => n.hqDistance === hqDistance)}, farther ${share(open, ({ hqDistance, next: n }) => n.hqDistance > hqDistance)}`);
    console.log(`  attacked next turn ${share(open, ({ next: n }) => n.attacked)}; held at end of next turn ${share(next, ({ next: n }) => n.heldAtEnd)}`);
    console.log(`  held at end of next turn, by next-turn allocation: this step ${share(open.filter(({ next: n }) => n.allocatedTurn === 1), ({ next: n }) => n.heldAtEnd)}, next step ${share(open.filter(({ next: n }) => n.allocatedTurn === 2), ({ next: n }) => n.heldAtEnd)}, dropped ${share(open.filter(({ next: n }) => n.allocatedTurn === null), ({ next: n }) => n.heldAtEnd)}`);
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
// Mirrors keepsFriendlySupply in src/ai/policies/heuristic.ts.
const keepsFriendlySupply = (explanation) => {
  const fact = (key) => explanation.facts.find((entry) => entry.key === key)?.value;
  return explanation.allowed && fact('supply.relocationOtherTraceLost') === 0 && fact('supply.relocationFeedLost') === 0 && fact('supply.relocationTraceLost') === 0;
};
const control = (state, hexId) => state.mapState.hexControl.find((entry) => String(entry.hexId) === hexId)?.controllerId ?? null;
const pieceOf = (state, pieceId) => state.pieceState.pieces.find(({ id }) => id === pieceId);
const hexOf = (state, pieceId) => {
  const location = pieceOf(state, pieceId)?.location;
  return location?.kind === 'ON_MAP' ? String(location.hexId) : null;
};
const enemyHexes = (state, attackerId) => new Set(m.ruleEngine.projectForViewer(state, attackerId).stacks
  .filter(({ location, pieces }) => location.kind === 'ON_MAP' && pieces.some((piece) => piece.ownerId !== attackerId && ['COMBAT', 'ARTILLERY', 'HQ'].includes(piece.role)))
  .map(({ location }) => String(location.hexId)));
const hqDistance = (state, attackerId, objective) => Math.min(Infinity, ...m.ruleEngine.projectForViewer(state, attackerId).stacks
  .filter(({ location, pieces }) => location.kind === 'ON_MAP' && pieces.some((piece) => piece.ownerId === attackerId && piece.role === 'HQ'))
  .map(({ location }) => m.hexDistanceBetween(location.hexId, objective)));

/** Free hexes beside the objective in the unit's reach from where it stands, trace ignored, and those traced now. */
const besideNow = (state, attackerId, unitId, objective) => {
  const hexId = hexOf(state, unitId);
  if (!hexId) return null;
  const enemy = enemyHexes(state, attackerId);
  const reach = new Set([hexId]);
  for (const mode of [undefined, 'MOVE', 'COMBAT']) {
    for (const entry of m.ruleEngine.queryProjectedReach(state, attackerId, unitId, hexId, mode).value ?? []) reach.add(String(entry.hexId));
  }
  const beside = [...reach].filter((hex) => m.hexDistanceBetween(hex, objective) === 1 && !enemy.has(hex));
  const traced = new Set((m.ruleEngine.queryTraceCoverage(state, attackerId, unitId).value?.hexIds ?? []).map(String));
  return { reachBeside: beside.length > 0, tracedBeside: beside.some((hex) => traced.has(hex)) };
};

/** The allocation's groups at the policy's first Movement decision from this state. */
const plan = (facts, state, attackerId) => {
  const lines = [];
  const policy = m.createHeuristicPolicy(facts, { weights: theaterWeights, debug: (line) => lines.push(line) });
  const context = {
    seatId: 'seat:next-step', playerId: attackerId, memory: { stepKey: 'next-step', actions: 0, notes: new Map() }, rng: m.createBotRng(7, 'next-step', 0),
    view: { playerId: attackerId, projection: m.ruleEngine.projectForViewer(state, attackerId), pendingDecision: null }, actions: access(state, attackerId),
  };
  policy.decide(context);
  const notes = context.memory.notes.get('heuristic');
  const theaterLine = lines.find((line) => line.includes(' THEATER')) ?? '';
  const turns = new Map([...theaterLine.matchAll(/ (-?\d+,-?\d+):\d+u p[\d.]+ t(\d)/g)].map(([, hexId, turn]) => [hexId, Number(turn)]));
  const efforts = [notes?.effort, ...(notes?.secondary ?? [])].filter(Boolean);
  return { turns, efforts: new Map(efforts.filter(({ hexId }) => turns.has(String(hexId))).map(({ hexId, unitIds }) => [String(hexId), [...unitIds]])) };
};

const counts = { games: 0, groups: 0, skipped: 0 };
const records = JSON.parse(readFileSync(join(dir, 'summary.json'), 'utf8')).records.filter((_, index) => index % shards === shard);
for (const record of records) {
  const save = JSON.parse(readFileSync(join(dir, `match-${record.match}.save.json`), 'utf8'));
  let state = m.parseGameStateJson(save.initialSnapshot).value;
  const attackerId = state.configuration.attackVictory?.attackerId;
  const side = String(attackerId).endsWith('axis') ? 'axis' : 'allied';
  if (record.sides[side].policy !== policyId) continue;
  const facts = { scenario: state.scenario, turnLimit: 8 };
  const keyOf = (sequence) => `${sequence.gameTurn}:${sequence.playerTurnIndex}`;
  const done = [];
  const plannedTurns = new Set();
  let turn = null; let pending = [];
  const close = (end) => {
    for (const group of turn.groups) group.heldAtEnd = control(end, group.objective) === attackerId;
    for (const group of pending) {
      // Groups from the turn before, judged over this one.
      group.next.attacked = turn.attacked.has(group.objective);
      group.next.heldAtEnd = control(end, group.objective) === attackerId;
    }
    done.push(...pending);
    pending = turn.groups;
    turn = null;
  };
  for (const action of save.acceptedActions) {
    const { sequence } = state;
    if (turn && keyOf(sequence) !== turn.key) close(state);
    if (!turn && sequence.phasingPlayerId === attackerId && sequence.actingPlayerId === attackerId && !state.pendingDecision
      && sequence.phase === 'MOVEMENT' && sequence.segment === 'MOVEMENT' && !plannedTurns.has(sequence.gameTurn)) {
      plannedTurns.add(sequence.gameTurn);
      const planned = plan(facts, state, attackerId);
      for (const group of pending) {
        group.next = {
          heldAtStart: control(state, group.objective) === attackerId, allocatedTurn: planned.turns.get(group.objective) ?? null,
          defended: enemyHexes(state, attackerId).has(group.objective), hqDistance: hqDistance(state, attackerId, group.objective),
          alive: group.members.filter(({ unitId }) => hexOf(state, unitId)).length,
          tracedBeside: group.members.filter(({ unitId }) => besideNow(state, attackerId, unitId, group.objective)?.tracedBeside).length,
        };
      }
      const enemy = enemyHexes(state, attackerId);
      const groups = [...planned.efforts].filter(([hexId]) => planned.turns.get(hexId) === 2 && enemy.has(hexId)).map(([objective, unitIds]) => ({
        match: record.match, gameTurn: sequence.gameTurn, objective, hqDistance: hqDistance(state, attackerId, objective), next: null,
        members: unitIds.map((unitId) => ({ unitId, plan: besideNow(state, attackerId, unitId, objective), move: null })),
      }));
      turn = { key: keyOf(sequence), gameTurn: sequence.gameTurn, attacked: new Set(), groups };
      counts.groups += groups.length;
    }
    if (turn && action.kind === 'DECLARE_COMBAT' && action.combatKind === 'REGULAR' && action.actorId === attackerId) turn.attacked.add(String(action.targetHexId));
    if (turn && action.kind === 'MOVE_PIECE' && sequence.phase === 'MOVEMENT' && sequence.segment === 'MOVEMENT' && keyOf(sequence) === turn.key) {
      for (const group of turn.groups) {
        for (const member of group.members.filter(({ unitId, move }) => !move && [action.pieceId, ...(action.companionIds ?? [])].includes(unitId))) {
          const moves = m.ruleEngine.getActionCandidates(state, { actorId: attackerId, kind: 'MOVE_PIECE', pieceId: member.unitId, budget: 1500 }).actions;
          const enemy = enemyHexes(state, attackerId);
          const beside = moves.filter((move) => m.hexDistanceBetween(move.path.at(-1), group.objective) === 1 && !enemy.has(String(move.path.at(-1))));
          const traced = new Set((m.ruleEngine.queryTraceCoverage(state, attackerId, member.unitId).value?.hexIds ?? []).map(String));
          member.move = {
            besideCandidates: beside.length, tracedBeside: beside.some((move) => traced.has(String(move.path.at(-1)))),
            gatePass: beside.slice(0, 40).some((move) => keepsFriendlySupply(m.ruleEngine.explain(state, move))),
            startDistance: m.hexDistanceBetween(action.path[0], group.objective), endDistance: m.hexDistanceBetween(action.path.at(-1), group.objective),
          };
        }
      }
    }
    state = m.ruleEngine.applyAction(state, action).state;
  }
  if (turn) close(state);
  done.push(...pending);
  if ((await m.hashGameState(state)).value !== record.finalStateHash) { counts.skipped += 1; continue; }
  counts.games += 1;
  for (const group of done) appendFileSync(out, `${JSON.stringify(group)}\n`);
}
console.log(JSON.stringify(counts));
