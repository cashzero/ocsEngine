#!/usr/bin/env node
// What happens to a unit after a move of its own takes it out of trace (docs/ai/evaluation.md, the ordinary supply audit).
// Replays ai-match batches that scripts/ai-supply-study.mjs has audited; build first.
//
//   node scripts/ai-untraced-move-study.mjs <match directory> [...] --out <file.json>
//
// The events are the audit's moverTraceLosses (supply-attribution.json): a combat unit that had trace before its own move
// and none after, with whether it had trace or SP to eat when that Movement Segment ended. Each is followed to the end of
// its owner's next player turn (the end of the game if none follows):
// - at the owner's next Supply Phase: on the map, in trace, SP within reach;
// - steps lost, to attrition and otherwise; internal stocks at the move and at the end;
// - regular attacks it took part in, in the same player turn and in the next;
// - the target named by the move's intent ("assault", "capture" or "hunt" and a hex): held by the owner at the move, at
//   the end of the next player turn and at the end of the game, and its objective points.
// Groups: the phase of the move × supplied at the end of the segment. Writes the events and a summary; prints the summary.
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const root = resolve(fileURLToPath(new URL('..', import.meta.url)));
const args = process.argv.slice(2);
const out = args.includes('--out') ? args[args.indexOf('--out') + 1] : null;
const dirs = args.filter((arg, index) => arg !== '--out' && args[index - 1] !== '--out');
if (!out || dirs.length === 0) throw new Error('see usage');
const m = await import(pathToFileURL(join(root, 'dist', 'index.js')).href);
const { internalStocksOf } = await import(pathToFileURL(join(root, 'dist', 'rules', 'pieces.js')).href);

const events = [];
let games = 0;
for (const dir of dirs) {
  const audit = new Map(JSON.parse(readFileSync(join(dir, 'supply-attribution.json'), 'utf8')).map((row) => [row.match, row]));
  for (const record of JSON.parse(readFileSync(join(dir, 'summary.json'), 'utf8')).records) {
    const moves = audit.get(record.match)?.moverTraceLosses ?? [];
    games += 1;
    if (moves.length === 0) continue;
    const save = JSON.parse(readFileSync(join(dir, `match-${record.match}.save.json`), 'utf8'));
    let state = m.parseGameStateJson(save.initialSnapshot).value;
    const objectives = new Map(state.configuration.objectives.map(({ hexId, points }) => [String(hexId), points]));
    const pieceOf = (current, id) => current.pieceState.pieces.find((piece) => String(piece.id) === id);
    const controller = (current, hexId) => current.mapState.hexControl.find((entry) => String(entry.hexId) === hexId)?.controllerId ?? null;
    const turnOf = (current) => `${current.sequence.gameTurn}:${current.sequence.playerTurnIndex}`;
    const byRevision = new Map(moves.map((move) => [move.revision, move]));
    const open = [];
    const close = (event, current) => {
      const piece = pieceOf(current, event.pieceId);
      event.aliveAtEnd = piece?.location.kind === 'ON_MAP';
      event.stocksAtEnd = event.aliveAtEnd ? internalStocksOf(piece) : null;
      event.targetHeldAtEnd = event.target ? controller(current, event.target) === event.ownerId : null;
      event.closed = true;
    };
    for (const [revision, action] of save.acceptedActions.entries()) {
      const before = state;
      const key = turnOf(before);
      for (const event of open) {
        if (event.closed) continue;
        // The owner's next player turn begins, then ends.
        if (event.stage === 'same' && key !== event.turnKey && before.sequence.phasingPlayerId === event.ownerId) { event.stage = 'next'; event.nextKey = key; }
        else if (event.stage === 'next' && key !== event.nextKey) close(event, before);
        if (!event.closed && event.stage === 'next' && event.atSupply === undefined && before.sequence.phase === 'SUPPLY') {
          const piece = pieceOf(before, event.pieceId);
          const onMap = piece?.location.kind === 'ON_MAP';
          event.atSupply = { onMap, trace: onMap ? m.pieceHasTrace(before, piece) : false,
            spInReach: onMap ? (m.ruleEngine.queryFeedCoverage(before, event.ownerId, event.pieceId).value ?? [])
              .some((feed) => feed.tokens > 0 && feed.hexIds.map(String).includes(String(piece.location.hexId))) : false };
        }
      }
      const move = byRevision.get(revision);
      if (move) {
        const piece = pieceOf(before, String(move.pieceId));
        const match = /\((assault|capture|hunt) ([^)]+)\)/u.exec(move.intent ?? '');
        const ownerId = action.actorId;
        const event = { save: join(dir, `match-${record.match}.save.json`), match: record.match, revision, turn: move.turn, phase: move.phase,
          supplied: move.suppliedAtSegmentEnd, pieceId: String(move.pieceId), ownerId, policy: record.sides[String(ownerId).endsWith('axis') ? 'axis' : 'allied'].policy,
          attacker: before.configuration.attackVictory?.attackerId === ownerId, purpose: match?.[1] ?? null, target: match?.[2] ?? null,
          targetPoints: match ? objectives.get(match[2]) ?? 0 : 0, targetHeldAtMove: match ? controller(before, match[2]) === ownerId : null,
          stocksAtMove: internalStocksOf(piece), stepsAtMove: piece.remainingSteps ?? 0, attritionLoss: 0, otherLoss: 0,
          attacksSameTurn: 0, attacksNextTurn: 0, turnKey: key, stage: 'same', closed: false };
        open.push(event);
        events.push(event);
      }
      const next = m.ruleEngine.applyAction(before, action);
      for (const event of open) {
        if (event.closed) continue;
        if (action.kind === 'DECLARE_COMBAT' && action.combatKind === 'REGULAR' && action.attackerIds.map(String).includes(event.pieceId)) {
          event[event.stage === 'same' ? 'attacksSameTurn' : 'attacksNextTurn'] += 1;
        }
        for (const lost of next.events) {
          if (lost.kind !== 'STEP_LOST' || String(lost.pieceId) !== event.pieceId) continue;
          const attrition = before.pendingDecision?.kind === 'ATTRITION_LOSS' || next.events.some(({ kind }) => kind === 'ATTRITION_ROLLED');
          event[attrition ? 'attritionLoss' : 'otherLoss'] += 1;
        }
      }
      state = next.state;
    }
    for (const event of open) {
      if (!event.closed) close(event, state);
      event.targetHeldAtGameEnd = event.target ? controller(state, event.target) === event.ownerId : null;
    }
  }
}

const groups = {};
for (const event of events) {
  if (!event.attacker) continue;
  (groups[`${event.phase}, ${event.supplied ? 'supplied' : 'unsupplied'} at the end of the segment`] ??= []).push(event);
}
const share = (list, test) => list.filter(test).length / Math.max(1, list.length);
const mean = (list, value) => list.reduce((total, event) => total + value(event), 0) / Math.max(1, list.length);
const summary = { dirs, games, groups: Object.fromEntries(Object.entries(groups).map(([name, list]) => {
  const supply = list.filter(({ atSupply }) => atSupply !== undefined);
  const targeted = list.filter(({ target }) => target !== null);
  return [name, {
    moves: list.length, perGame: list.length / games,
    'at the next Supply Phase: in trace': share(supply, ({ atSupply }) => atSupply.trace),
    'at the next Supply Phase: no trace, SP in reach': share(supply, ({ atSupply }) => !atSupply.trace && atSupply.spInReach),
    'at the next Supply Phase: no trace, no SP': share(supply, ({ atSupply }) => atSupply.onMap && !atSupply.trace && !atSupply.spInReach),
    'at the next Supply Phase: off the map': share(supply, ({ atSupply }) => !atSupply.onMap),
    'steps lost to attrition a move': mean(list, ({ attritionLoss }) => attritionLoss),
    'steps lost otherwise a move': mean(list, ({ otherLoss }) => otherLoss),
    'internal stocks lower at the end': share(list, ({ stocksAtMove, stocksAtEnd }) => stocksAtEnd !== null && stocksAtEnd !== stocksAtMove),
    'alive at the end of the next player turn': share(list, ({ aliveAtEnd }) => aliveAtEnd),
    'attacked in the same player turn': share(list, ({ attacksSameTurn }) => attacksSameTurn > 0),
    'attacked in the next player turn': share(list, ({ attacksNextTurn }) => attacksNextTurn > 0),
    'named target not held at the move': targeted.filter(({ targetHeldAtMove }) => !targetHeldAtMove).length,
    'of those, held at the end of the next player turn': share(targeted.filter(({ targetHeldAtMove }) => !targetHeldAtMove), ({ targetHeldAtEnd }) => targetHeldAtEnd),
    'of those, held at the end of the game': share(targeted.filter(({ targetHeldAtMove }) => !targetHeldAtMove), ({ targetHeldAtGameEnd }) => targetHeldAtGameEnd),
    'mean points of the named target': mean(targeted, ({ targetPoints }) => targetPoints),
  }];
})) };
mkdirSync(dirname(resolve(out)), { recursive: true });
writeFileSync(out, JSON.stringify({ summary, events }, null, 1));
console.log(`${games} games, ${events.length} moves out of trace (${events.filter(({ attacker }) => attacker).length} by the attacker)`);
for (const [name, group] of Object.entries(summary.groups)) {
  console.log(`== ${name}`);
  for (const [key, value] of Object.entries(group)) console.log(`  ${key}: ${Number.isInteger(value) ? value : value.toFixed(2)}`);
}
