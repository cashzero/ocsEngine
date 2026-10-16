#!/usr/bin/env node
// Can the attacker's units fuel? Replays saved ai-match attack games (docs/ai/evaluation.md, 攻方加油 gate). Build first.
//
//   node scripts/ai-fuel-study.mjs <attack match directory> [...] [--out <dir>] [--gate <policy>]
//
// At the start of each attacker Movement Segment from Game Turn 3: combat units that need fuel (12.5a) and have no legal fuel
// payment (no dump in draw range, no HQ throw backed by a dump, 12.3a-b, 12.5c), counted per game; and the attacker's HQs that
// no dump reaches ("dry" HQs, which can throw neither trace nor fuel), as a share of its HQs. Each is split by policy when the
// two sides played different policies (summary.json). Writes fuel.json.
//
//   --gate <policy>  checks the gate registered in docs/ai/evaluation.md for <policy> against the other policy of the same batch,
//                    and exits 1 when it fails.
import { existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const root = resolve(fileURLToPath(new URL('..', import.meta.url)));
const argv = process.argv.slice(2);
const outIndex = argv.indexOf('--out');
const gateIndex = argv.indexOf('--gate');
const out = outIndex >= 0 ? argv[outIndex + 1] : join('tmp', 'fuel');
const gatePolicy = gateIndex >= 0 ? argv[gateIndex + 1] : null;
const flagged = new Set([outIndex, gateIndex].filter((index) => index >= 0).flatMap((index) => [index, index + 1]));
const dirs = argv.filter((_, index) => !flagged.has(index));
const m = await import(pathToFileURL(join(root, 'dist', 'index.js')).href);
const FROM_TURN = 3;

const sides = {};
const bump = (role, key, value) => { sides[role] ??= {}; sides[role][key] = (sides[role][key] ?? 0) + value; };

for (const dir of dirs) {
  const records = existsSync(join(dir, 'summary.json')) ? JSON.parse(readFileSync(join(dir, 'summary.json'), 'utf8')).records : [];
  for (const file of readdirSync(dir).filter((name) => name.endsWith('.save.json'))) {
    const save = JSON.parse(readFileSync(join(dir, file), 'utf8'));
    let state = m.parseGameStateJson(save.initialSnapshot).value;
    const attackerId = state.configuration.attackVictory?.attackerId ?? null;
    if (attackerId === null) continue;
    const record = records.find(({ match }) => file === `match-${match}.save.json`);
    const sideOf = (playerId) => (String(playerId).endsWith('axis') ? 'axis' : 'allied');
    const role = record && record.sides.allied.policy !== record.sides.axis.policy
      ? `attacker ${record.sides[sideOf(attackerId)].policy}` : 'attacker';
    const definitions = new Map(state.scenario.pieceCatalog.definitions.map((definition) => [definition.id, definition]));
    const isHq = (piece) => String(definitions.get(piece.definitionId)?.categoryDefinitionId).endsWith(':hq');
    bump(role, 'games', 1);
    let measured = null;
    for (const action of save.acceptedActions) {
      const { gameTurn, playerTurnIndex, phase, segment, phasingPlayerId } = state.sequence;
      const key = `${gameTurn}:${playerTurnIndex}`;
      if (phase === 'MOVEMENT' && segment === 'MOVEMENT' && phasingPlayerId === attackerId && gameTurn >= FROM_TURN && key !== measured) {
        measured = key;
        const own = state.pieceState.pieces.filter((piece) => piece.ownerId === attackerId && piece.location.kind === 'ON_MAP');
        for (const hq of own.filter(isHq)) {
          bump(role, 'hqs', 1);
          if (m.dumpsReaching(state, attackerId, hq.location.hexId, hq).length === 0) bump(role, 'dryHqs', 1);
        }
        for (const unit of own.filter((piece) => m.isOnMapCombatUnit(state, piece))) {
          const coverage = m.ruleEngine.queryFuelCoverage(state, attackerId, unit.id).value;
          if (coverage === 'NOT_NEEDED' || coverage === 'FUELED') continue;
          bump(role, 'needFuel', 1);
          if ((m.ruleEngine.queryFuelPreview(state, attackerId, unit.id).value ?? []).length === 0) bump(role, 'cannotFuel', 1);
        }
      }
      state = m.ruleEngine.applyAction(state, action).state;
    }
  }
}

const summary = Object.fromEntries(Object.entries(sides).map(([role, s]) => [role, {
  games: s.games,
  cannotFuelPerGame: (s.cannotFuel ?? 0) / s.games,
  cannotFuelShare: s.needFuel ? (s.cannotFuel ?? 0) / s.needFuel : null,
  dryHqShare: s.hqs ? (s.dryHqs ?? 0) / s.hqs : null,
}]));
mkdirSync(out, { recursive: true });
writeFileSync(join(out, 'fuel.json'), JSON.stringify({ dirs, sides: summary }, null, 2));
for (const [role, s] of Object.entries(summary)) {
  console.log(`${role.padEnd(10)} ${s.games} games · units unable to fuel ${s.cannotFuelPerGame.toFixed(1)} a game (${Math.round((s.cannotFuelShare ?? 0) * 100)}% of those needing fuel) · dry HQs ${Math.round((s.dryHqShare ?? 0) * 100)}%`);
}

if (gatePolicy !== null) {
  const candidate = summary[`attacker ${gatePolicy}`];
  const baseline = Object.entries(summary).find(([role]) => role.startsWith('attacker ') && role !== `attacker ${gatePolicy}`)?.[1];
  if (!candidate || !baseline) { console.log(`GATE ERROR: need attacker games of ${gatePolicy} and of another policy`); process.exit(1); }
  const checks = [
    ['units unable to fuel per game <= half the baseline', candidate.cannotFuelPerGame <= baseline.cannotFuelPerGame / 2, `${candidate.cannotFuelPerGame.toFixed(1)} vs ${baseline.cannotFuelPerGame.toFixed(1)}`],
    ['dry HQ share <= half the baseline', (candidate.dryHqShare ?? 0) <= (baseline.dryHqShare ?? 0) / 2, `${Math.round((candidate.dryHqShare ?? 0) * 100)}% vs ${Math.round((baseline.dryHqShare ?? 0) * 100)}%`],
  ];
  for (const [name, pass, value] of checks) console.log(`GATE ${pass ? 'PASS' : 'FAIL'} ${name}: ${value}`);
  writeFileSync(join(out, 'fuel-gate.json'), JSON.stringify({ policy: gatePolicy, checks: checks.map(([name, pass, value]) => ({ name, pass, value })) }, null, 2));
  if (checks.some(([, pass]) => !pass)) process.exit(1);
}
