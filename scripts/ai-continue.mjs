#!/usr/bin/env node
// Branch a saved ai-match game and play it on with different policies on common dice (docs/ai/evaluation.md). Build first.
//
//   node scripts/ai-continue.mjs --save <match-N.save.json> --at <action index> --subject allied|axis \
//     --variant <name>=<policy> [--variant …] --opponent <policy> [--dice 4] [--horizons 1,3] [--engine dist] --out <file.jsonl>
//
// The game is replayed to the action index (choose the first action of a segment, so the bots start it with fresh step
// memory as they did in the game). For each dice seed the Rules RNG is reseeded there, and every variant plays the
// subject's seat from that same state against the same opponent policy, with the seats' bot seeds of the original match
// (summary.json next to the save). Every variant therefore meets the same dice stream until their play diverges.
// Policies are named as in ai-match.mjs: heuristic, heuristic@<dist dir>, heuristic:<weights.json>.
//
// One JSON line per variant × dice seed × horizon: position metrics for both players (ai-position-metrics.mjs) and the
// events since the branch, when game turn T0 + h begins (T0 is the branch turn) and at the end of the game ("end").
import { appendFileSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { basename, dirname, join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { eventTotals, positionMetrics } from './ai-position-metrics.mjs';

const root = resolve(fileURLToPath(new URL('..', import.meta.url)));
const args = process.argv.slice(2);
const option = (name, fallback = null) => (args.includes(name) ? args[args.indexOf(name) + 1] : fallback);
const savePath = resolve(option('--save'));
const at = Number(option('--at'));
const subject = option('--subject');
const variants = args.flatMap((arg, index) => (arg === '--variant' ? [args[index + 1].split('=')] : []));
const opponent = option('--opponent');
const diceCount = Number(option('--dice', '4'));
const horizons = option('--horizons', '1,3').split(',').map(Number);
const out = resolve(option('--out'));
const m = await import(pathToFileURL(join(resolve(root, option('--engine', 'dist')), 'index.js')).href);
if (!['allied', 'axis'].includes(subject) || variants.length === 0 || !opponent || !Number.isInteger(at)) throw new Error('see usage');

const save = JSON.parse(readFileSync(savePath, 'utf8'));
const match = Number(/match-(\d+)\.save\.json$/u.exec(basename(savePath))[1]);
const record = JSON.parse(readFileSync(join(dirname(savePath), 'summary.json'), 'utf8')).records.find((entry) => entry.match === match);
let state = m.parseGameStateJson(save.initialSnapshot).value;
for (const action of save.acceptedActions.slice(0, at)) state = m.ruleEngine.applyAction(state, action).state;
const branchTurn = state.sequence.gameTurn;
const facts = { scenario: state.scenario, turnLimit: state.configuration.turnLimit };
const builds = new Map();
const policyFor = async (id) => {
  if (id.startsWith('heuristic@')) {
    const dir = resolve(root, id.slice('heuristic@'.length));
    if (!builds.has(dir)) builds.set(dir, await import(pathToFileURL(join(dir, 'index.js')).href));
    return builds.get(dir).createHeuristicPolicy(facts, { label: id.slice('heuristic@'.length) });
  }
  if (id === 'heuristic') return m.createHeuristicPolicy(facts);
  if (id.startsWith('heuristic:')) {
    const file = JSON.parse(readFileSync(resolve(root, id.slice('heuristic:'.length)), 'utf8'));
    return m.createHeuristicPolicy(facts, { weights: m.heuristicWeights(file.weights ?? file), label: file.label ?? id });
  }
  throw new Error(`Unknown policy ${id}`);
};
const sideOf = (playerId) => (String(playerId).endsWith('axis') ? 'axis' : 'allied');
const players = state.scenario.players.map(({ id }) => id);
const engine = m.createGameplayEngine(m.createMemoryGameplayPorts());
mkdirSync(dirname(out), { recursive: true });
writeFileSync(out, '');

for (let dice = 1; dice <= diceCount; dice += 1) {
  // A fixed function of the branch and the dice index, so a rerun reproduces it.
  const branched = { ...state, rng: { state: (Math.imul(match ^ (at << 8), 2654435761) + dice * 40503) >>> 0, draws: 0 } };
  const snapshot = m.serializeGameState(branched).value;
  const hashed = (await m.hashGameState(branched)).value;
  const acting = save.bindings.find(({ playerId }) => playerId === (branched.pendingDecision?.ownerId ?? branched.sequence.actingPlayerId));
  const branchSave = JSON.stringify({
    ...save, initialSnapshot: snapshot, currentSnapshot: snapshot, initialStateHash: hashed, finalStateHash: hashed,
    acceptedActions: [], acceptedActionMetadata: [], checkpoints: [], lifecycle: 'ACTIVE', activeSeatId: acting.seatId,
  });
  for (const [name, policyId] of variants) {
    const session = await engine.loadSession(branchSave);
    const seats = await Promise.all(save.bindings.map(async ({ seatId, playerId }) => ({
      seatId, playerId, seed: record.seeds[sideOf(playerId)], policy: await policyFor(sideOf(playerId) === subject ? policyId : opponent),
    })));
    const runner = m.createBotSeatRunner({ session, seats, nonce: `${name}:${dice}` });
    const pending = [...horizons].sort((left, right) => left - right);
    const emit = (horizon, reason) => {
      const current = m.parseGameStateJson(session.save().currentSnapshot).value;
      const owners = new Map(current.pieceState.pieces.map((piece) => [piece.id, piece.ownerId]));
      appendFileSync(out, `${JSON.stringify({
        save: savePath, match, at, branchTurn, subject, variant: name, policy: policyId, dice, horizon, reason,
        turn: current.sequence.gameTurn, metrics: positionMetrics(m, current),
        events: eventTotals(session.getHistory({ actionKind: null, offset: 0, limit: 1e9 }).records, (pieceId) => owners.get(pieceId), players),
      })}\n`);
    };
    for (let guard = 0; guard < 20000; guard += 1) {
      const step = await runner.step();
      if (step.kind !== 'ACTED') { emit('end', step.kind === 'FINISHED' ? 'FINISHED' : step.kind === 'STUCK' ? step.error.code : step.reason); break; }
      const turn = Number(String(step.trace.stepKey).split(':')[0]);
      while (pending.length > 0 && turn >= branchTurn + pending[0]) emit(pending.shift(), 'HORIZON');
    }
  }
}
