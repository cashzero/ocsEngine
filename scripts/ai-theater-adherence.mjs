#!/usr/bin/env node
// Does the attacker carry out its theater allocation (plan P11.8, docs/ai/theater-supply-plan.md)? Build first.
//
//   node scripts/ai-theater-adherence.mjs <match directory> --weights <theater-weights.json> --out <file.jsonl> [--shard i/n]
//   node scripts/ai-theater-adherence.mjs --summarize <file.jsonl> [...]
//
// Games are replayed on this build (a game whose replay does not reach its recorded final state hash is skipped). In each
// attacker player turn, at the attacker's first Movement segment decision, both the theater policy (heuristic with the
// --weights file) and the standard heuristic plan the step from that state, as the bot does at its first Movement
// decision: units whose target is ASSAULT or CAPTURE on an objective the attacker does not hold, grouped by objective
// (defended when an enemy combat unit is in it). Each plan is then checked against what the policy that actually moved
// did: at Combat segment entry, members alive and in place (beside a defended objective, in an empty one) and
// objectives held; over the player turn, regular attacks declared on the objective and objectives held at its end.
// The plan of the policy that did not move is a counterfactual: how often the other policy does it anyway.
import { appendFileSync, readFileSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { segmentEntry } from './ai-theater-supply.mjs';

const root = resolve(fileURLToPath(new URL('..', import.meta.url)));
const args = process.argv.slice(2);
const option = (name) => (args.includes(name) ? args[args.indexOf(name) + 1] : null);

const summarize = (files) => {
  const rows = files.flatMap((file) => readFileSync(file, 'utf8').trim().split('\n').map((line) => JSON.parse(line)));
  const mean = (values) => (values.length === 0 ? NaN : values.reduce((sum, value) => sum + value, 0) / values.length);
  const fmt = (value) => (Number.isNaN(value) ? '—' : value.toFixed(2));
  console.log(`${new Set(rows.map(({ match }) => match)).size} games, ${rows.length} attacker player turns`);
  console.log('| Mover | Game Turns | Plan | Turns | Groups / turn | Units / turn | Defended in place | Defended attacked | Empty held at Combat | Planned VP held at end |');
  console.log('|---|---|---|---:|---:|---:|---:|---:|---:|---:|');
  for (const mover of ['theater', 'standard']) {
    for (const [label, early] of [['1–3', true], ['4–8', false]]) {
      const turns = rows.filter((row) => row.mover === mover && (row.gameTurn <= 3) === early);
      for (const plan of ['theater', 'standard']) {
        const groups = turns.flatMap((row) => row.plans[plan]);
        const defended = groups.filter(({ defended: d }) => d);
        const empty = groups.filter(({ defended: d }) => !d);
        const planned = groups.reduce((sum, { points }) => sum + points, 0);
        const held = groups.filter(({ heldAtEnd }) => heldAtEnd).reduce((sum, { points }) => sum + points, 0);
        console.log(`| ${mover} | ${label} | ${plan}${plan === mover ? '' : ' (counterfactual)'} | ${turns.length} | ${fmt(groups.length / turns.length)} | ${fmt(mean(turns.map((row) => row.plans[plan].reduce((sum, { units }) => sum + units, 0))))}`
          + ` | ${fmt(mean(defended.map(({ units, inPlace }) => inPlace / units)))} | ${fmt(mean(defended.map(({ attacked }) => (attacked ? 1 : 0))))}`
          + ` | ${fmt(mean(empty.map(({ heldAtCombat }) => (heldAtCombat ? 1 : 0))))} | ${fmt(planned > 0 ? held / planned : NaN)} |`);
      }
    }
  }
  const overlap = rows.map((row) => {
    const hexes = (plan) => new Set(row.plans[plan].map(({ hexId }) => hexId));
    const theater = hexes('theater'); const standard = hexes('standard');
    const union = new Set([...theater, ...standard]);
    return union.size === 0 ? null : [...theater].filter((hexId) => standard.has(hexId)).length / union.size;
  }).filter((value) => value !== null);
  console.log(`Objective overlap of the two plans (shared / either), mean over turns with a plan: ${fmt(mean(overlap))} (${overlap.length} turns)`);
  const sameSizes = rows.filter((row) => JSON.stringify(row.plans.theater.map(({ hexId, units }) => `${hexId}:${units}`).sort())
    === JSON.stringify(row.plans.standard.map(({ hexId, units }) => `${hexId}:${units}`).sort())).length;
  console.log(`Turns whose two plans have the same objectives and group sizes: ${sameSizes} of ${rows.length}`);
  // Groups of the theater plan that come from the allocation (the rest are the usual efforts filling the slots), and how
  // the policy that moved did on those objectives and on the other objectives of its own plan.
  console.log('| Mover | Game Turns | Theater groups | From the allocation | Of which next step | Next step: held at end of next turn | Turns with one | Allocation: defended attacked | Allocation: defended held at end | Allocation: empty held at end | Other own groups: defended held at end |');
  console.log('|---|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|');
  for (const mover of ['theater', 'standard']) {
    for (const [label, early] of [['1–3', true], ['4–8', false]]) {
      const turns = rows.filter((row) => row.mover === mover && (row.gameTurn <= 3) === early);
      const groups = turns.flatMap((row) => row.plans.theater);
      const allocated = groups.filter(({ allocated: a }) => a);
      const other = turns.flatMap((row) => row.plans[mover].filter(({ hexId }) => !row.plans.theater.some((group) => group.hexId === hexId && group.allocated)));
      const share = (list, key) => `${fmt(mean(list.map((group) => (group[key] ? 1 : 0))))} (${list.length})`;
      // A next-step group is judged at the end of the attacker's next player turn.
      const nextHeld = turns.flatMap((row) => row.plans.theater.filter(({ allocatedTurn }) => allocatedTurn === 2).map(({ hexId }) => {
        const next = rows.find((other) => other.match === row.match && other.gameTurn === row.gameTurn + 1);
        return next ? (next.held.includes(hexId) ? 1 : 0) : null;
      }).filter((value) => value !== null));
      console.log(`| ${mover} | ${label} | ${groups.length} | ${allocated.length} | ${allocated.filter(({ allocatedTurn }) => allocatedTurn === 2).length} | ${fmt(mean(nextHeld))} (${nextHeld.length}) | ${turns.filter((row) => row.plans.theater.some(({ allocated: a }) => a)).length} of ${turns.length}`
        + ` | ${share(allocated.filter(({ defended }) => defended), 'attacked')} | ${share(allocated.filter(({ defended }) => defended), 'heldAtEnd')}`
        + ` | ${share(allocated.filter(({ defended }) => !defended), 'heldAtEnd')} | ${share(other.filter(({ defended }) => defended), 'heldAtEnd')} |`);
    }
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
const dirs = args.filter((arg, index) => !arg.startsWith('--') && !['--out', '--weights', '--shard'].includes(args[index - 1]));
const m = await import(pathToFileURL(join(root, 'dist', 'index.js')).href);
const weights = JSON.parse(readFileSync(resolve(weightsFile), 'utf8'));
const theaterWeights = m.heuristicWeights(weights.weights ?? weights);
writeFileSync(out, '');

const access = (state) => {
  const actorId = state.sequence.actingPlayerId;
  return {
    families: () => m.ruleEngine.getActionFamilies(state, actorId).filter((family) => family.enabled).map((family) => family.kind),
    movementRange: (pieceId) => m.ruleEngine.queryMovementRange(state, actorId, pieceId).value,
    candidates: (kind, pieceId = null, budget = 400) => m.ruleEngine.getActionCandidates(state, { actorId, kind, pieceId, budget }).actions,
    explain: (action) => ({ current: true, explanation: m.ruleEngine.explain(state, action) }),
    traceCoverage: (pieceId = null) => m.ruleEngine.queryTraceCoverage(state, actorId, pieceId).value,
    feedCoverage: (pieceId = null) => m.ruleEngine.queryFeedCoverage(state, actorId, pieceId).value,
    drawReach: (hexId) => new Set((m.ruleEngine.queryDrawReach(state, actorId, hexId).value ?? []).map(String)),
    attackStrength: (attackerIds, targetHexId) => m.ruleEngine.queryAttackStrength(state, actorId, attackerIds, targetHexId).value,
    projectedReach: (pieceId, fromHexId) => m.ruleEngine.queryProjectedReach(state, actorId, pieceId, fromHexId).value,
  };
};

const control = (state, hexId) => state.mapState.hexControl.find((entry) => String(entry.hexId) === hexId)?.controllerId ?? null;
const hexOf = (state, pieceId) => {
  const location = state.pieceState.pieces.find(({ id }) => id === pieceId)?.location;
  return location?.kind === 'ON_MAP' ? String(location.hexId) : null;
};

/** The objective groups a policy plans at its first Movement decision of the step, from that state. */
const plan = (facts, weightsOf, state, objectives) => {
  const lines = [];
  const policy = m.createHeuristicPolicy(facts, { weights: weightsOf, debug: (line) => lines.push(line) });
  const playerId = state.sequence.actingPlayerId;
  const context = {
    seatId: 'seat:adherence', playerId, memory: { stepKey: 'adherence', actions: 0, notes: new Map() }, rng: m.createBotRng(7, 'adherence', 0),
    view: { projection: m.ruleEngine.projectForViewer(state, playerId), pendingDecision: null }, actions: access(state),
  };
  policy.decide(context);
  const targets = context.memory.notes.get('heuristic')?.targets ?? new Map();
  const { enemy } = m.analyze(context.view.projection, playerId, facts);
  // The THEATER debug line lists the allocation's groups the policy kept (theaterAllocation on).
  const theaterLine = lines.find((line) => line.includes(' THEATER'));
  const allocated = new Map([...(theaterLine ?? '').matchAll(/ (\d+,\d+):\d+u p[\d.]+(?: t(\d))?/g)].map(([, hexId, turn]) => [hexId, Number(turn ?? 1)]));
  const groups = new Map();
  for (const [unitId, { hexId, purpose }] of targets) {
    const key = String(hexId);
    if (!['ASSAULT', 'CAPTURE'].includes(purpose) || !objectives.has(key) || control(state, key) === playerId) continue;
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(unitId);
  }
  return [...groups].map(([hexId, unitIds]) => ({ hexId, points: objectives.get(hexId), defended: enemy.get(hexId)?.hasCombatUnit ?? false, allocated: allocated.has(hexId), allocatedTurn: allocated.get(hexId) ?? null, unitIds }));
};

const entryCounts = { unavailable: 0, mismatched: 0 };
let games = 0; let turns = 0; const skipped = [];
for (const dir of dirs) {
  const records = JSON.parse(readFileSync(join(dir, 'summary.json'), 'utf8')).records.filter((_, index) => index % shards === shard);
  for (const record of records) {
    const file = join(dir, `match-${record.match}.save.json`);
    const save = JSON.parse(readFileSync(file, 'utf8'));
    let state = m.parseGameStateJson(save.initialSnapshot).value;
    const facts = { scenario: state.scenario, turnLimit: 8 };
    const attackerId = state.configuration.attackVictory?.attackerId;
    const side = String(attackerId).endsWith('axis') ? 'axis' : 'allied';
    const mover = record.sides[side].policy.startsWith('heuristic:') ? 'theater' : 'standard';
    const objectives = new Map(state.configuration.objectives.map(({ hexId, points }) => [String(hexId), points]));
    const keyOf = (sequence) => `${sequence.gameTurn}:${sequence.playerTurnIndex}`;
    const rows = [];
    let turn = null;
    const close = (end) => {
      for (const groups of Object.values(turn.plans)) for (const group of groups) group.heldAtEnd = control(end, group.hexId) === attackerId;
      for (const [planName, groups] of Object.entries(turn.plans)) {
        turn.plans[planName] = groups.map(({ unitIds, ...group }) => ({ ...group, units: unitIds.length, attacked: turn.attacked.has(group.hexId) }));
      }
      rows.push({ match: record.match, mover, gameTurn: turn.gameTurn, plans: turn.plans, combatEntryRebuilt: turn.combatEntryRebuilt, held: [...objectives.keys()].filter((hexId) => control(end, hexId) === attackerId) });
      turn = null;
    };
    for (const action of save.acceptedActions) {
      const { sequence } = state;
      if (turn && keyOf(sequence) !== turn.key) close(state);
      if (!turn && sequence.phasingPlayerId === attackerId && sequence.actingPlayerId === attackerId && !state.pendingDecision
        && sequence.phase === 'MOVEMENT' && sequence.segment === 'MOVEMENT' && !rows.some((row) => row.gameTurn === sequence.gameTurn)) {
        const before = m.serializeGameState(state).value;
        turn = {
          key: keyOf(sequence), gameTurn: sequence.gameTurn, attacked: new Set(), combatEntryRebuilt: null,
          plans: { theater: plan(facts, theaterWeights, state, objectives), standard: plan(facts, m.DEFAULT_HEURISTIC_WEIGHTS, state, objectives) },
        };
        if (m.serializeGameState(state).value !== before) throw new Error('planning changed the state');
      }
      if (turn && action.kind === 'DECLARE_COMBAT' && action.combatKind === 'REGULAR' && action.actorId === attackerId) turn.attacked.add(String(action.targetHexId));
      const next = m.ruleEngine.applyAction(state, action);
      if (turn && turn.combatEntryRebuilt === null) {
        const entry = segmentEntry(m, state, action, next, 'COMBAT', 'COMBAT', entryCounts);
        if (entry && keyOf(entry.sequence) === turn.key) {
          turn.combatEntryRebuilt = true;
          for (const groups of Object.values(turn.plans)) {
            for (const group of groups) {
              group.heldAtCombat = control(entry, group.hexId) === attackerId;
              group.inPlace = group.unitIds.filter((unitId) => {
                const hexId = hexOf(entry, unitId);
                if (!hexId) return false;
                return group.defended ? m.hexDistanceBetween(hexId, group.hexId) === 1 : hexId === group.hexId || group.heldAtCombat;
              }).length;
            }
          }
        }
      }
      state = next.state;
    }
    if (turn) close(state);
    if ((await m.hashGameState(state)).value !== record.finalStateHash) { skipped.push(file); continue; }
    // A turn whose Combat entry could not be rebuilt has no in-place or held-at-Combat facts.
    for (const row of rows) appendFileSync(out, `${JSON.stringify(row)}\n`);
    games += 1; turns += rows.length;
  }
}
console.log(`${games} games, ${turns} attacker player turns written to ${out}; skipped (replay hash differs): ${skipped.length}`);
console.log(`Combat entries not rebuilt: ${entryCounts.unavailable} unavailable, ${entryCounts.mismatched} mismatched`);
