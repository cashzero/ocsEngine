#!/usr/bin/env node
// Why units of a theater group do not stop beside their objective (plan P11.8, docs/ai/theater-supply-plan.md). Build first.
//
//   node scripts/ai-theater-move-terms.mjs <ai-match dir> --weights <theater-weights.json> --out <file.jsonl> [--shard i/n] [--turns 3]
//
// Replays the games where the theater policy (heuristic with --weights) attacks. In each of its Movement segments of
// Game Turns 1..--turns it lets that policy decide every attacker decision on the recorded state, keeping the policy's
// step memory as the seat runner does, and then applies the recorded action; a decision that differs from the
// recorded action is counted, and the rest of that segment is not used. When the policy moves a unit of one of its
// groups for a defended objective that the allocation expects there this step (THEATER t1), one row gives the stay
// score, the chosen destination's score terms and the best-scored destination beside the objective with its terms.
import { appendFileSync, readFileSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const root = resolve(fileURLToPath(new URL('..', import.meta.url)));
const args = process.argv.slice(2);
const option = (name) => (args.includes(name) ? args[args.indexOf(name) + 1] : null);
const out = option('--out');
const weightsFile = option('--weights');
if (!out || !weightsFile) throw new Error('--weights <theater-weights.json> --out <file.jsonl>');
const [shard, shards] = (option('--shard') ?? '0/1').split('/').map(Number);
const lastTurn = Number(option('--turns') ?? 3);
const dir = args.find((arg, index) => !arg.startsWith('--') && !['--out', '--weights', '--shard', '--turns'].includes(args[index - 1]));
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
  projectedReach: (pieceId, fromHexId) => m.ruleEngine.queryProjectedReach(state, actorId, pieceId, fromHexId).value ?? [],
});
const sameAction = (left, right) => left?.kind === right.kind && left.pieceId === right.pieceId
  && JSON.stringify(left.path ?? null) === JSON.stringify(right.path ?? null)
  && JSON.stringify(left.companionIds ?? []) === JSON.stringify(right.companionIds ?? []) && left.mode === right.mode;
const total = (terms) => terms.reduce((sum, { value }) => sum + value, 0);

const counts = { games: 0, decisions: 0, matched: 0, diverged: 0, rows: 0 };
const records = JSON.parse(readFileSync(join(dir, 'summary.json'), 'utf8')).records.filter((_, index) => index % shards === shard);
for (const record of records) {
  const save = JSON.parse(readFileSync(join(dir, `match-${record.match}.save.json`), 'utf8'));
  let state = m.parseGameStateJson(save.initialSnapshot).value;
  const attackerId = state.configuration.attackVictory?.attackerId;
  const side = String(attackerId).endsWith('axis') ? 'axis' : 'allied';
  if (record.sides[side].policy !== policyId) continue;
  counts.games += 1;
  const facts = { scenario: state.scenario, turnLimit: 8 };
  const policy = m.createHeuristicPolicy(facts, { weights: theaterWeights, debug: (line) => lines.push(line) });
  let lines = [];
  let memory = null; let diverged = null; let lastRevision = null; let atRevision = 0;
  for (const action of save.acceptedActions) {
    const { sequence } = state;
    const stepKey = `${sequence.gameTurn}:${sequence.playerTurnIndex}:${sequence.phase}:${sequence.segment}`;
    if (sequence.gameTurn <= lastTurn && sequence.phase === 'MOVEMENT' && sequence.segment === 'MOVEMENT' && sequence.phasingPlayerId === attackerId
      && sequence.actingPlayerId === attackerId && !state.pendingDecision && diverged !== stepKey) {
      if (memory?.stepKey !== stepKey) { memory = { stepKey, actions: 0, notes: new Map() }; lines = []; }
      const stateHash = String((await m.hashGameState(state)).value);
      atRevision = lastRevision === state.revision ? atRevision + 1 : 0;
      lastRevision = state.revision;
      const groups = [];
      const observation = {
        movement: ({ pieceId, stay, scored }) => {
          const group = { pieceId, stay, scored, improving: [], supply: [] };
          groups.push(group);
          return {
            corrections: () => {}, correction: () => {},
            improving: (actions) => { group.improving = actions; },
            supply: (move, explanation, preserved) => { group.supply.push({ move, preserved, facts: Object.fromEntries(explanation.facts.filter(({ key }) => /^supply\.relocation/.test(key)).map(({ key, value }) => [key, value])) }); },
            finish: (selected) => { group.selected = selected; },
          };
        },
      };
      const decision = policy.decide({
        seatId: `seat:${side}`, playerId: attackerId, memory, actions: access(state, attackerId), observation,
        view: { playerId: attackerId, projection: m.ruleEngine.projectForViewer(state, attackerId), pendingDecision: null },
        rng: m.createBotRng(record.seeds[side], stateHash, atRevision),
      });
      counts.decisions += 1;
      if (!sameAction(decision?.action, action)) { counts.diverged += 1; diverged = stepKey; }
      else {
        counts.matched += 1;
        memory.actions += 1;
        const notes = memory.notes.get('heuristic');
        const theaterLine = lines.find((line) => line.includes(' THEATER')) ?? '';
        const thisStep = new Set([...theaterLine.matchAll(/ (-?\d+,-?\d+):\d+u p[\d.]+ t1/g)].map(([, hexId]) => hexId));
        const efforts = [notes?.effort, ...(notes?.secondary ?? [])].filter((effort) => effort && thisStep.has(String(effort.hexId)));
        for (const group of groups.filter(({ selected }) => selected && sameAction(selected, action))) {
          const effort = efforts.find(({ unitIds }) => unitIds.has(group.pieceId));
          if (!effort) continue;
          const objective = String(effort.hexId);
          const beside = group.scored.filter(({ action: move }) => m.hexDistanceBetween(move.path.at(-1), objective) === 1)
            .sort((left, right) => total(right.terms) - total(left.terms))[0] ?? null;
          const chosen = group.scored.find(({ action: move }) => sameAction(move, action));
          appendFileSync(out, `${JSON.stringify({
            match: record.match, gameTurn: sequence.gameTurn, pieceId: group.pieceId, objective,
            mode: state.pieceState.pieces.find(({ id }) => id === group.pieceId)?.mode ?? null,
            startDistance: m.hexDistanceBetween(action.path[0], objective), endDistance: m.hexDistanceBetween(action.path.at(-1), objective),
            rangeBeside: (m.ruleEngine.queryMovementRange(state, attackerId, group.pieceId).value ?? []).some(({ hexId }) => m.hexDistanceBetween(hexId, objective) === 1),
            moves: group.scored.length,
            stay: group.stay.score, chosen: chosen ? { score: total(chosen.terms), terms: chosen.terms } : null,
            beside: beside ? {
              hexId: beside.action.path.at(-1), score: total(beside.terms), terms: beside.terms,
              improving: group.improving.some((move) => sameAction(move, beside.action)),
              supply: group.supply.find(({ move }) => sameAction(move, beside.action)) ?? null,
              // Any beside destination the supply gate let through.
              anyPassed: group.supply.some(({ move, preserved }) => preserved && m.hexDistanceBetween(move.path.at(-1), objective) === 1),
              anyRejected: group.supply.filter(({ move, preserved }) => !preserved && m.hexDistanceBetween(move.path.at(-1), objective) === 1).length,
            } : null,
          })}\n`);
          counts.rows += 1;
        }
      }
    }
    state = m.ruleEngine.applyAction(state, action).state;
  }
}
console.log(JSON.stringify(counts));
