#!/usr/bin/env node
// Attacks that clear an objective nobody then enters, and why (docs/ai/policy-errors.md E3). Replays saved ai-match
// attack games; build first.
//
//   node scripts/ai-advance-census.mjs <match directory> [...] [--policy <substring of the attacker's policy>] --out <file.json>
//
// An event is a regular attack of the attacker on an objective hex whose resolution (no transaction and no pending decision
// left) leaves the hex without an enemy combat unit and not controlled by the attacker. For each event: the objective's
// points; whether an advance after combat was offered and, per attacker that could advance, the rules' supply facts and
// whether it passes the advance responder's test (src/ai/decisions.ts, ADVANCE_HEX); the responses given; whether the
// attacker entered the hex later in the same player turn, who controls it when the attacker's next player turn begins
// (the end of the game if none follows) and at the end; where no advance was offered, why (every attacker eliminated, an
// attacker retreat, or no survivor able to move: combat.ts, the ADVANCE step). A game identical to an earlier one (same final state, as the
// seat-exchanged games of a self-play) is counted once. In a meeting engagement each side is counted for its own attacks
// (--policy keeps the sides whose policy contains it), and the rates are per side a game. Writes the events and a summary;
// prints the summary.
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const root = resolve(fileURLToPath(new URL('..', import.meta.url)));
const args = process.argv.slice(2);
const option = (name, fallback = null) => (args.includes(name) ? args[args.indexOf(name) + 1] : fallback);
const policyFilter = option('--policy');
const out = option('--out');
const flags = new Set(['--policy', '--out'].flatMap((name) => (args.includes(name) ? [args.indexOf(name), args.indexOf(name) + 1] : [])));
const dirs = args.filter((_, index) => !flags.has(index));
if (!out || dirs.length === 0) throw new Error('see usage');
const m = await import(pathToFileURL(join(root, 'dist', 'index.js')).href);

const seen = new Set();
const events = [];
let games = 0;
for (const dir of dirs) {
  for (const record of JSON.parse(readFileSync(join(dir, 'summary.json'), 'utf8')).records) {
    const savePath = join(dir, `match-${record.match}.save.json`);
    if (record.stopReason !== 'FINISHED' || !existsSync(savePath) || seen.has(record.finalStateHash)) continue;
    const save = JSON.parse(readFileSync(savePath, 'utf8'));
    const initial = m.parseGameStateJson(save.initialSnapshot).value;
    // The attacker of an attack engagement; in a meeting engagement each side, for its own attacks.
    const attackers = initial.configuration.attackVictory ? [initial.configuration.attackVictory.attackerId] : initial.scenario.players.map(({ id }) => id);
    let counted = false;
    for (const attackerId of attackers) {
    let state = initial;
    const attackerSide = String(attackerId).endsWith('axis') ? 'axis' : 'allied';
    if (policyFilter && !record.sides[attackerSide].policy.includes(policyFilter)) continue;
    counted = true;
    games += 1;
    const turnLimit = state.configuration.turnLimit;
    const objectives = new Map(state.configuration.objectives.map(({ hexId, points }) => [String(hexId), points]));
    const controller = (current, hexId) => current.mapState.hexControl.find((entry) => String(entry.hexId) === hexId)?.controllerId ?? null;
    const combatAt = (current, hexId, own) => current.pieceState.pieces.filter((piece) => (own ? piece.ownerId === attackerId : piece.ownerId !== attackerId)
      && piece.location.kind === 'ON_MAP' && String(piece.location.hexId) === hexId && m.isOnMapCombatUnit(current, piece));
    const gameEvents = [];
    let pending = null;
    let turnKey = null;
    for (const [revision, action] of save.acceptedActions.entries()) {
      const { gameTurn, playerTurnIndex, phasingPlayerId } = state.sequence;
      const key = `${gameTurn}:${playerTurnIndex}`;
      if (key !== turnKey) {
        turnKey = key;
        // The attacker's next player turn begins: settle who holds the hexes it cleared before.
        if (phasingPlayerId === attackerId) {
          for (const event of gameEvents) if (event.atNextTurn === undefined && event.turn !== key) event.atNextTurn = controller(state, event.hexId) === attackerId;
        }
      }
      if (action.kind === 'DECLARE_COMBAT' && action.actorId === attackerId && action.combatKind === 'REGULAR' && objectives.has(String(action.targetHexId))) {
        pending = { hexId: String(action.targetHexId), points: objectives.get(String(action.targetHexId)), turn: key, revision, offered: null, responses: [],
          attackerIds: action.attackerIds.map(String), attackerRetreated: false };
      }
      const decision = state.pendingDecision;
      if (pending && decision?.kind === 'ADVANCE_HEX' && decision.ownerId === attackerId) {
        if (pending.offered === null) {
          const candidates = m.ruleEngine.getActionCandidates(state, { actorId: attackerId, kind: 'RESPOND_DECISION', pieceId: null, budget: 400 }).actions;
          pending.offered = decision.options.filter(({ id }) => id.startsWith('advance:') && id !== 'advance:done' && id !== 'advance:all').map(({ id }) => {
            const pieceId = id.slice('advance:'.length);
            const piece = state.pieceState.pieces.find((entry) => String(entry.id) === pieceId);
            const hexId = piece?.location.kind === 'ON_MAP' ? String(piece.location.hexId) : null;
            const onlyGarrison = hexId !== null && objectives.has(hexId) && controller(state, hexId) === attackerId && combatAt(state, hexId, true).length <= 1;
            const candidate = candidates.find((entry) => entry.choiceId === id);
            const explanation = candidate ? m.ruleEngine.explain(state, candidate) : { allowed: false, facts: [] };
            const fact = (name) => explanation.facts.find((entry) => entry.key === `supply.${name}`)?.value;
            const facts = { allowed: explanation.allowed, funded: fact('advanceFunded'), feedLost: fact('advanceFeedLost'),
              traceLost: fact('advanceTraceLost'), moverHasTrace: fact('advanceMoverHasTrace'), onlyGarrison };
            const lastTurn = turnLimit - gameTurn <= 0;
            const failing = onlyGarrison ? 'only garrison' : !facts.allowed ? 'not allowed' : !(lastTurn || facts.funded === true) ? 'not funded'
              : facts.feedLost !== 0 ? 'feed lost' : !(facts.traceLost === 0 || (facts.moverHasTrace === false && facts.traceLost === 1)) ? 'trace lost' : null;
            return { pieceId, ...facts, supplied: failing === null, failing };
          });
        }
        if (action.kind === 'RESPOND_DECISION') pending.responses.push(action.choiceId);
      }
      state = m.ruleEngine.applyAction(state, action).state;
      if (pending && state.activeTransaction?.attackerRetreated === true) pending.attackerRetreated = true;
      if (pending && state.activeTransaction === null && state.pendingDecision === null) {
        if (combatAt(state, pending.hexId, false).length === 0 && controller(state, pending.hexId) !== attackerId) {
          const attackersLeft = pending.attackerIds.filter((id) => state.pieceState.pieces.some((piece) => String(piece.id) === id && piece.location.kind === 'ON_MAP')).length;
          gameEvents.push({ save: savePath, match: record.match, ...pending, offered: pending.offered ?? [], enteredLater: false, attackersLeft });
        }
        pending = null;
      }
      for (const event of gameEvents) if (event.turn === turnKey && controller(state, event.hexId) === attackerId) event.enteredLater = true;
    }
    for (const event of gameEvents) {
      event.atNextTurn ??= controller(state, event.hexId) === attackerId;
      event.atEnd = controller(state, event.hexId) === attackerId;
      const offered = event.offered.length > 0;
      event.class = !offered ? 'no advance offered' : event.offered.some(({ supplied }) => supplied) ? 'supplied advance not taken' : 'no supplied advance';
      event.recoverable = offered && event.class === 'no supplied advance' && !event.atNextTurn;
      // Why the rules offered no advance (combat.ts ADVANCE step): every attacker gone, an attacker retreat, or no survivor able to move.
      if (!offered) event.noOffer = event.attackersLeft === 0 ? 'attackers eliminated' : event.attackerRetreated ? 'attackers retreated' : 'no survivor able to move';
      events.push({ ...event, side: attackerSide, engagement: initial.configuration.attackVictory ? 'attack' : 'meeting' });
    }
    }
    if (counted) seen.add(record.finalStateHash);
  }
}

const perGame = (filter, value = () => 1) => events.filter(filter).reduce((total, event) => total + value(event), 0) / games;
const failingTests = {};
for (const event of events.filter(({ class: kind }) => kind === 'no supplied advance')) {
  // The tests in the responder's order; an event is blocked where the option that gets furthest fails (an event "not
  // funded" has no option that is funded and fails a later test).
  const order = ['only garrison', 'not allowed', 'not funded', 'feed lost', 'trace lost'];
  const reason = order[Math.max(...event.offered.map(({ failing }) => order.indexOf(failing)))];
  event.reason = reason;
  failingTests[reason] = (failingTests[reason] ?? 0) + 1;
}
const summary = {
  dirs, policy: policyFilter, games, events: events.length,
  perGame: {
    events: perGame(() => true),
    'event VP': perGame(() => true, ({ points }) => points),
    'no advance offered': perGame(({ class: kind }) => kind === 'no advance offered'),
    'no supplied advance': perGame(({ class: kind }) => kind === 'no supplied advance'),
    'supplied advance not taken': perGame(({ class: kind }) => kind === 'supplied advance not taken'),
    'entered later in the turn': perGame(({ enteredLater }) => enteredLater),
    'held at the next player turn': perGame(({ atNextTurn }) => atNextTurn),
    'held at the end': perGame(({ atEnd }) => atEnd),
    'recoverable VP (stop rule)': perGame(({ recoverable }) => recoverable, ({ points }) => points),
    'recoverable VP, not funded only': perGame(({ recoverable, reason }) => recoverable && reason === 'not funded', ({ points }) => points),
  },
  noSuppliedAdvanceBy: Object.fromEntries(Object.entries(failingTests).map(([reason, count]) => [reason, count / games])),
  noAdvanceOfferedBy: Object.fromEntries(['attackers eliminated', 'attackers retreated', 'no survivor able to move'].map((reason) => [reason, {
    events: perGame(({ noOffer }) => noOffer === reason), vp: perGame(({ noOffer }) => noOffer === reason, ({ points }) => points),
    'VP not held at the next player turn': perGame(({ noOffer, atNextTurn }) => noOffer === reason && !atNextTurn, ({ points }) => points) }])),
};
mkdirSync(dirname(resolve(out)), { recursive: true });
writeFileSync(out, JSON.stringify({ summary, events }, null, 1));
console.log(`${games} games, ${events.length} events`);
for (const [key, value] of Object.entries(summary.perGame)) console.log(`  ${key}: ${value.toFixed(2)} a game`);
for (const [key, value] of Object.entries(summary.noAdvanceOfferedBy)) console.log(`  no advance offered, ${key}: ${value.events.toFixed(2)} a game, ${value.vp.toFixed(2)} VP, ${value['VP not held at the next player turn'].toFixed(2)} VP not held at the next player turn`);
for (const [key, value] of Object.entries(summary.noSuppliedAdvanceBy)) console.log(`  no supplied advance, the furthest option fails at "${key}": ${value.toFixed(2)} a game`);
