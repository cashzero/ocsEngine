#!/usr/bin/env node
// Where the attacker's main-effort units stop short of their objective though an attack position was open (S12 of
// docs/roadmap/19-ai-strategy-improvement-wbs.md). Replays saved ai-match attack games; no new game.
//
//   node scripts/ai-arrival-fork-census.mjs <attack match directory> [...] [--turn 3] [--policy heuristic]
//     [--engine artifacts/ai-promotion/frozen-v91-standard/dist] --out <file.json>
//
// For every game whose attacker played `--policy`, the save is replayed to the start of the attacker's ordinary Movement
// segment in Game Turn `--turn`, and that whole segment is played again by the attacker on the frozen build `--engine`
// (fresh step memory, the seats' recorded bot seeds), with the build's passive movement observation on. The theater
// plan's first main effort (the `MAIN EFFORT` line of the policy's debug output) is kept when the plan lists its group
// as arriving this step (`t1` on the `THEATER` line); its members are the units the policy gives an ASSAULT target on that
// objective. For each member's movement decision the census records the destination chosen (or staying), its distance
// to the objective, the policy's scores (after its trace correction), and every candidate destination beside the
// objective with what rules out each one:
// - `overstack`: the policy's overstack term (more than 10 RE would end there);
// - `supply`: the move is refused, or after it the mover has neither trace nor SP to eat, or another unit loses trace or
//   its ration (`supply.relocation*` facts: the check heuristic@91 applies to a group member leaving trace for its
//   attack position);
// - otherwise the candidate is open.
// A member triggers when it ends more than 1 hex from the objective and an open candidate exists; the alternative is the
// open candidate with the highest policy score (ties: the policy's order). A game's first trigger is its fork. A member
// whose candidate list hit its budget is `unknown`.
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { basename, dirname, join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

const args = process.argv.slice(2);
const option = (name, fallback = null) => (args.includes(name) ? args[args.indexOf(name) + 1] : fallback);
const valued = ['--turn', '--policy', '--engine', '--out'];
const dirs = args.filter((arg, index) => !arg.startsWith('--') && !valued.includes(args[index - 1]));
const turn = Number(option('--turn', '3'));
const policyName = option('--policy', 'heuristic');
const engineDir = resolve(option('--engine', 'artifacts/ai-promotion/frozen-v91-standard/dist'));
const out = option('--out');
if (!out || dirs.length === 0) throw new Error('see usage');
const m = await import(pathToFileURL(join(engineDir, 'index.js')).href);
const MOVE_BUDGET = 1500;

const sum = (terms) => terms.reduce((total, { value }) => total + value, 0);
const games = [];
for (const dir of dirs) {
  const summary = JSON.parse(readFileSync(join(dir, 'summary.json'), 'utf8'));
  for (const record of summary.records) {
    const savePath = join(dir, `match-${record.match}.save.json`);
    const save = JSON.parse(readFileSync(savePath, 'utf8'));
    let state = m.parseGameStateJson(save.initialSnapshot).value;
    const attackerId = state.configuration.attackVictory?.attackerId;
    if (!attackerId) continue;
    const side = (playerId) => (String(playerId).endsWith('axis') ? 'axis' : 'allied');
    if (record.sides[side(attackerId)].policy !== policyName) continue;
    const starts = (s) => s.sequence.gameTurn === turn && s.sequence.phase === 'MOVEMENT' && s.sequence.segment === 'MOVEMENT'
      && s.sequence.phasingPlayerId === attackerId && s.pendingDecision === null;
    let at = null;
    for (const [index, action] of save.acceptedActions.entries()) {
      if (starts(state)) { at = index; break; }
      state = m.ruleEngine.applyAction(state, action).state;
    }
    const game = { save: savePath, match: record.match, style: record.summary.mapStyle, at, effort: null, members: [], fork: null, note: null };
    games.push(game);
    if (at === null) { game.note = 'no such segment'; continue; }
    const facts = { scenario: state.scenario, turnLimit: state.configuration.turnLimit };
    const engine = m.createGameplayEngine(m.createMemoryGameplayPorts());
    const snapshot = m.serializeGameState(state).value;
    const hashed = (await m.hashGameState(state)).value;
    const acting = save.bindings.find(({ playerId }) => playerId === state.sequence.actingPlayerId);
    const session = await engine.loadSession(JSON.stringify({ ...save, initialSnapshot: snapshot, currentSnapshot: snapshot,
      initialStateHash: hashed, finalStateHash: hashed, acceptedActions: [], acceptedActionMetadata: [], checkpoints: [],
      lifecycle: 'ACTIVE', activeSeatId: acting.seatId }));
    const segmentKey = `${turn}:${state.sequence.playerTurnIndex}:MOVEMENT:MOVEMENT`;
    const attackerSeat = save.bindings.find(({ playerId }) => playerId === attackerId).seatId;
    const lines = [];
    const inner = m.createHeuristicPolicy(facts, { debug: (line) => lines.push(line) });
    const theater = new Map();
    let ordinal = 0;
    const seen = new Set();
    const wrapper = { id: inner.id, version: inner.version, decide(ctx) {
      const groups = [];
      const observation = { movement: (input) => {
        const group = { input, retained: new Map(), selected: undefined };
        groups.push(group);
        return { corrections() {}, correction(action, _explanation, _applied, retainedTerms) { group.retained.set(action, retainedTerms); },
          improving() {}, supply() {}, finish(selected) { group.selected = selected; } };
      } };
      lines.length = 0;
      const decision = inner.decide({ ...ctx, observation });
      if (ctx.memory.stepKey === segmentKey) {
        for (const line of lines) {
          const theaterAt = line.indexOf('THEATER ');
          if (theaterAt >= 0) for (const [, hexId, units, , groupTurn] of line.slice(theaterAt).matchAll(/(-?\d+,-?\d+):(\d+)u p([\d.]+) t(\d)/g)) theater.set(hexId, { units: Number(units), turn: Number(groupTurn) });
          const effort = / MAIN EFFORT (-?\d+,-?\d+) /.exec(line);
          if (effort && game.effort === null) game.effort = { hexId: effort[1], turn: theater.get(effort[1])?.turn ?? null, units: theater.get(effort[1])?.units ?? null };
        }
        const objective = game.effort?.hexId;
        for (const group of groups) {
          const { input } = group;
          if (group.selected === undefined || !objective || game.effort.turn !== 1 || seen.has(String(input.pieceId))) continue;
          if (input.assignedTarget?.purpose !== 'ASSAULT' || String(input.assignedTarget.hexId) !== objective) continue;
          seen.add(String(input.pieceId));
          const destination = (action) => String(action.path.at(-1));
          const score = (entry) => sum(group.retained.get(entry.action) ?? entry.terms);
          const chosen = group.selected ? destination(group.selected) : String(input.stay.origin);
          const chosenEntry = group.selected ? input.scored.find((entry) => entry.action === group.selected) : null;
          const listed = session.getActionCandidates(attackerSeat, { kind: 'MOVE_PIECE', pieceId: input.pieceId, budget: MOVE_BUDGET });
          const candidates = input.scored.map((entry, order) => ({ entry, order })).filter(({ entry }) => m.hexDistanceBetween(destination(entry.action), objective) === 1)
            .map(({ entry, order }) => {
              const { explanation } = ctx.actions.explain(entry.action);
              const fact = (key) => explanation.facts.find((item) => item.key === key)?.value;
              const supplyOk = explanation.allowed && fact('supply.relocationOtherTraceLost') === 0 && fact('supply.relocationFeedLost') === 0
                && (fact('supply.relocationMoverHasTrace') === true || Number(fact('supply.relocationMoverRation') ?? 0) > 0);
              const overstack = entry.terms.some(({ term }) => term === 'overstack');
              return { hexId: destination(entry.action), order, score: score(entry), excluded: overstack ? 'overstack' : supplyOk ? null : 'supply',
                trace: fact('supply.relocationMoverHasTrace') === true, ration: Number(fact('supply.relocationMoverRation') ?? 0),
                otherLost: fact('supply.relocationOtherTraceLost'), feedLost: fact('supply.relocationFeedLost'), action: entry.action };
            });
          const open = candidates.filter(({ excluded }) => excluded === null).sort((left, right) => right.score - left.score || left.order - right.order);
          const distance = m.hexDistanceBetween(chosen, objective);
          const member = {
            ordinal, revision: Number(ctx.view.stateRevision), pieceId: String(input.pieceId), role: input.role, origin: String(input.stay.origin),
            chosen, moved: group.selected !== null, distance, chosenScore: chosenEntry ? score(chosenEntry) : input.stay.score,
            chosenTerms: chosenEntry ? (group.retained.get(chosenEntry.action) ?? chosenEntry.terms) : input.stay.terms,
            adjacent: candidates.map(({ action, ...rest }) => rest),
            status: listed.truncated ? 'unknown' : distance <= 1 ? 'arrived' : open.length > 0 ? 'trigger' : 'none',
            alternative: open[0] ? { hexId: open[0].hexId, score: open[0].score, action: open[0].action } : null,
            selected: group.selected,
          };
          game.members.push(member);
          if (member.status === 'trigger' && game.fork === null) game.fork = { ordinal, revision: member.revision, pieceId: member.pieceId };
        }
        ordinal += 1;
      }
      return decision;
    } };
    const seats = save.bindings.map(({ seatId, playerId }) => ({ seatId, playerId, seed: record.seeds[side(playerId)],
      policy: playerId === attackerId ? wrapper : m.createHeuristicPolicy(facts) }));
    const runner = m.createBotSeatRunner({ session, seats, nonce: 'arrival' });
    for (let guard = 0; guard < 5000; guard += 1) {
      const step = await runner.step();
      if (step.kind !== 'ACTED') { game.note = `stopped: ${step.kind}`; break; }
      if (step.trace.stepKey !== segmentKey) break;
    }
    if (game.effort === null) game.note ??= 'no main effort';
    else if (game.effort.turn !== 1) game.note ??= `main effort arrives next step (t${game.effort.turn})`;
    console.error(`${record.match} ${game.effort ? `${game.effort.hexId} t${game.effort.turn}` : '-'} members ${game.members.length}`
      + ` ${game.members.map(({ status, distance }) => `${status}:${distance}`).join(' ')}${game.fork ? ' FORK' : ''}${game.note ? ` (${game.note})` : ''}`);
  }
}
mkdirSync(dirname(resolve(out)), { recursive: true });
writeFileSync(out, `${JSON.stringify(games, null, 1)}\n`);
const count = (test) => games.filter(test).length;
console.log(`${games.length} games; main effort arriving this step ${count((game) => game.effort?.turn === 1)}; forks ${count((game) => game.fork)};`
  + ` members ${games.reduce((total, game) => total + game.members.length, 0)}: `
  + ['arrived', 'trigger', 'none', 'unknown'].map((status) => `${status} ${games.reduce((total, game) => total + game.members.filter((member) => member.status === status).length, 0)}`).join(', '));
