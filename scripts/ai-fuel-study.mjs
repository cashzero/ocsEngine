#!/usr/bin/env node
// Does the attacker's SP reach the front? Replays saved ai-match attack games (docs/ai/evaluation.md, 攻方送補 gate). Build first.
//
//   node scripts/ai-fuel-study.mjs <attack match directory> [...] [--out <dir>] [--gate <policy> --baseline <dir> [--baseline <dir> ...]]
//
// Each attacker Movement Segment from Game Turn 3:
// - At its end: SP in the attacker's dumps (not garrison stocks) that can reach a front unit, a combat unit other than an HQ
//   within FRONT_HEXES of an enemy combat unit, by draw or through an HQ throw (12.3a-b), and SP that can reach none.
// - When its first combat unit (not an HQ) acts, after the HQs, rail and sea have moved (or at its end if none acts): units
//   that must move to fight (no enemy combat unit adjacent), need fuel (12.5a), are not fueled and have no legal fuel payment;
//   and the attacker's HQs that no dump reaches ("dry" HQs, which throw no fuel), as a share of its HQs.
// Each is split by policy when the two sides played different policies (summary.json). Writes fuel.json.
//
//   --gate <policy>     checks the gate registered in docs/ai/evaluation.md for <policy> and exits 1 when it fails. Its baseline is
//   --baseline <dir>    the standard policy's self-play on the same seeds (same match indexes, --swap): only the games whose
//                       match index the candidate attacked count, reported as "baseline attacker". A batch's own other-policy
//                       attacker plays against the candidate's defender, so it does not measure the standard's logistics.
import { existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const root = resolve(fileURLToPath(new URL('..', import.meta.url)));
const argv = process.argv.slice(2);
const outIndex = argv.indexOf('--out');
const gateIndex = argv.indexOf('--gate');
const out = outIndex >= 0 ? argv[outIndex + 1] : join('tmp', 'fuel');
const gatePolicy = gateIndex >= 0 ? argv[gateIndex + 1] : null;
const baselineIndexes = argv.flatMap((arg, index) => (arg === '--baseline' ? [index] : []));
const baselineDirs = baselineIndexes.map((index) => argv[index + 1]);
const flagged = new Set([outIndex, gateIndex, ...baselineIndexes].filter((index) => index >= 0).flatMap((index) => [index, index + 1]));
const dirs = argv.filter((_, index) => !flagged.has(index));
const m = await import(pathToFileURL(join(root, 'dist', 'index.js')).href);
const FROM_TURN = 3;
const FRONT_HEXES = 4;

const sides = {};
const bump = (role, key, value) => { sides[role] ??= {}; sides[role][key] = (sides[role][key] ?? 0) + value; };

const candidateMatches = new Set();
for (const [dir, isBaseline] of [...dirs.map((dir) => [dir, false]), ...baselineDirs.map((dir) => [dir, true])]) {
  const records = existsSync(join(dir, 'summary.json')) ? JSON.parse(readFileSync(join(dir, 'summary.json'), 'utf8')).records : [];
  for (const file of readdirSync(dir).filter((name) => name.endsWith('.save.json'))) {
    const save = JSON.parse(readFileSync(join(dir, file), 'utf8'));
    let state = m.parseGameStateJson(save.initialSnapshot).value;
    const attackerId = state.configuration.attackVictory?.attackerId ?? null;
    if (attackerId === null) continue;
    const record = records.find(({ match }) => file === `match-${match}.save.json`);
    const sideOf = (playerId) => (String(playerId).endsWith('axis') ? 'axis' : 'allied');
    if (isBaseline && !candidateMatches.has(record?.match)) continue;
    const role = isBaseline ? 'baseline attacker' : record && record.sides.allied.policy !== record.sides.axis.policy
      ? `attacker ${record.sides[sideOf(attackerId)].policy}` : 'attacker';
    if (record && role === `attacker ${gatePolicy}`) candidateMatches.add(record.match);
    const definitions = new Map(state.scenario.pieceCatalog.definitions.map((definition) => [definition.id, definition]));
    const isHq = (piece) => String(definitions.get(piece.definitionId)?.categoryDefinitionId).endsWith(':hq');
    const isFieldUnit = (current, piece) => piece !== undefined && m.isOnMapCombatUnit(current, piece) && !isHq(piece);
    const enemyOf = (current) => current.pieceState.pieces.filter((piece) => piece.ownerId !== attackerId && piece.location.kind === 'ON_MAP' && m.isOnMapCombatUnit(current, piece));
    const ownOf = (current) => current.pieceState.pieces.filter((piece) => piece.ownerId === attackerId && piece.location.kind === 'ON_MAP');
    bump(role, 'games', 1);
    let measured = null;
    for (const action of save.acceptedActions) {
      const { gameTurn, playerTurnIndex, phase, segment, phasingPlayerId } = state.sequence;
      const key = `${gameTurn}:${playerTurnIndex}`;
      const inSegment = phase === 'MOVEMENT' && segment === 'MOVEMENT' && phasingPlayerId === attackerId && gameTurn >= FROM_TURN;
      const next = m.ruleEngine.applyAction(state, action).state;
      const leaving = !(next.sequence.phase === 'MOVEMENT' && next.sequence.segment === 'MOVEMENT');
      const unitActs = ['MOVE_PIECE', 'PAY_FUEL', 'CHANGE_MODE'].includes(action.kind)
        && isFieldUnit(state, state.pieceState.pieces.find(({ id }) => id === action.pieceId));
      if (inSegment && key !== measured && (unitActs || leaving)) {
        measured = key;
        const own = ownOf(state);
        const enemy = enemyOf(state);
        for (const hq of own.filter(isHq)) {
          bump(role, 'hqs', 1);
          if (m.dumpsReaching(state, attackerId, hq.location.hexId, hq).length === 0) bump(role, 'dryHqs', 1);
        }
        for (const unit of own.filter((piece) => isFieldUnit(state, piece))) {
          if (enemy.some((other) => m.hexDistanceBetween(other.location.hexId, unit.location.hexId) <= 1)) continue;
          const coverage = m.ruleEngine.queryFuelCoverage(state, attackerId, unit.id).value;
          // null: needs fuel and has none; anything else is fueled (SINGLE_UNIT, FORMATION, HQ) or walks (NOT_NEEDED).
          if (coverage !== null) continue;
          bump(role, 'needFuel', 1);
          if ((m.ruleEngine.queryFuelPreview(state, attackerId, unit.id).value ?? []).length === 0) bump(role, 'cannotFuel', 1);
        }
      }
      if (inSegment && leaving) {
        bump(role, 'segments', 1);
        const enemy = enemyOf(next);
        const front = new Set(ownOf(next).filter((piece) => isFieldUnit(next, piece)
          && enemy.some((other) => m.hexDistanceBetween(other.location.hexId, piece.location.hexId) <= FRONT_HEXES)).map((piece) => String(piece.location.hexId)));
        for (const feed of m.ruleEngine.queryFeedCoverage(next, attackerId, null).value ?? []) {
          if (String(feed.dumpId).includes('-stock-')) continue;
          bump(role, feed.hexIds.some((hexId) => front.has(String(hexId))) ? 'frontSpTokens' : 'strandedSpTokens', feed.tokens);
        }
      }
      state = next;
    }
  }
}

const summary = Object.fromEntries(Object.entries(sides).map(([role, s]) => [role, {
  games: s.games,
  strandedSpPerSegment: (s.strandedSpTokens ?? 0) / 4 / Math.max(1, s.segments ?? 0),
  frontSpPerSegment: (s.frontSpTokens ?? 0) / 4 / Math.max(1, s.segments ?? 0),
  cannotFuelPerGame: (s.cannotFuel ?? 0) / s.games,
  cannotFuelShare: s.needFuel ? (s.cannotFuel ?? 0) / s.needFuel : null,
  dryHqShare: s.hqs ? (s.dryHqs ?? 0) / s.hqs : null,
}]));
mkdirSync(out, { recursive: true });
writeFileSync(join(out, 'fuel.json'), JSON.stringify({ dirs, sides: summary }, null, 2));
const pct = (value) => `${Math.round((value ?? 0) * 100)}%`;
for (const [role, s] of Object.entries(summary)) {
  console.log(`${role.padEnd(10)} ${s.games} games · SP no front unit can draw ${s.strandedSpPerSegment.toFixed(1)} a segment (front units can draw ${s.frontSpPerSegment.toFixed(1)})`
    + ` · units unable to fuel ${s.cannotFuelPerGame.toFixed(1)} a game (${pct(s.cannotFuelShare)} of those needing fuel) · dry HQs ${pct(s.dryHqShare)}`);
}

if (gatePolicy !== null) {
  const candidate = summary[`attacker ${gatePolicy}`];
  const baseline = summary['baseline attacker'];
  if (!candidate || !baseline || baseline.games !== candidate.games) { console.log(`GATE ERROR: need attacker games of ${gatePolicy} and the standard's self-play on the same match indexes (--baseline)`); process.exit(1); }
  const checks = [
    ['SP no front unit can draw <= the standard on the same seeds', candidate.strandedSpPerSegment <= baseline.strandedSpPerSegment,
      `${candidate.strandedSpPerSegment.toFixed(1)} vs ${baseline.strandedSpPerSegment.toFixed(1)}`],
  ];
  for (const [name, pass, value] of checks) console.log(`GATE ${pass ? 'PASS' : 'FAIL'} ${name}: ${value}`);
  writeFileSync(join(out, 'fuel-gate.json'), JSON.stringify({ policy: gatePolicy, checks: checks.map(([name, pass, value]) => ({ name, pass, value })) }, null, 2));
  if (checks.some(([, pass]) => !pass)) process.exit(1);
}
