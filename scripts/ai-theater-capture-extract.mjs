#!/usr/bin/env node
// Plan P11.3 data: one row per objective attacked in a player turn, with the strongest declared regular attack on it
// (highest column, then highest DRM) described by the rules' own combat facts, and whether the attacker holds the
// objective when that player turn ends. Objectives the attacker gained in a turn without a declared regular attack on
// them (entered empty, overrun) get rows of kind GAINED_WITHOUT_ATTACK, labelled the same way.
//
//   node scripts/ai-theater-capture-extract.mjs <dist> <out.jsonl> <dir-with-saves-and-summary.json>...
//
// Games are identified by initial hash, final hash and accepted actions; a trajectory seen before is skipped. Every
// recorded action is replayed through the rule engine; each game must reach its saved final state hash.
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

const [dist, out, ...dirs] = process.argv.slice(2);
if (!dist || !out || dirs.length === 0) {
  console.error('usage: node scripts/ai-theater-capture-extract.mjs <dist> <out.jsonl> <dir-with-saves-and-summary.json>...');
  process.exit(2);
}
const m = await import(pathToFileURL(resolve(dist, 'index.js')).href);
const sha = (text) => createHash('sha256').update(text).digest('hex');

const rows = [];
const seen = new Set();
let skipped = 0;
for (const dir of dirs) {
  const records = JSON.parse(readFileSync(join(dir, 'summary.json'), 'utf8')).records;
  for (const record of records) {
    const save = JSON.parse(readFileSync(join(dir, `match-${record.match}.save.json`), 'utf8'));
    const trajectory = sha(JSON.stringify([save.initialStateHash, save.finalStateHash, sha(JSON.stringify(save.acceptedActions))]));
    if (seen.has(trajectory)) { skipped += 1; continue; }
    seen.add(trajectory);
    let state = m.parseGameStateJson(save.initialSnapshot).value;
    const objectives = new Map(state.configuration.objectives.map(({ hexId, points }) => [String(hexId), points]));
    const holder = (current, hexId) => current.mapState.hexControl.find((entry) => String(entry.hexId) === hexId)?.controllerId ?? null;
    const keyOf = (sequence) => `${sequence.gameTurn}:${sequence.playerTurnIndex}`;
    let turn = null;
    const open = () => ({ key: keyOf(state.sequence), gameTurn: state.sequence.gameTurn, playerTurnIndex: state.sequence.playerTurnIndex, actorId: state.sequence.phasingPlayerId, startHolders: new Map([...objectives.keys()].map((hexId) => [hexId, holder(state, hexId)])), attacks: new Map(), gained: new Set() });
    const close = (end) => {
      for (const [hexId, attack] of turn.attacks) {
        rows.push({ kind: 'ATTACK', trajectory, game: `${dir}/match-${record.match}`, mapSeed: record.seeds.map, gameTurn: turn.gameTurn, playerTurnIndex: turn.playerTurnIndex, actorId: turn.actorId, hexId, points: objectives.get(hexId), ...attack, captured: holder(end, hexId) === turn.actorId });
      }
      for (const hexId of turn.gained) {
        if (turn.attacks.has(hexId)) continue;
        rows.push({ kind: 'GAINED_WITHOUT_ATTACK', trajectory, game: `${dir}/match-${record.match}`, mapSeed: record.seeds.map, gameTurn: turn.gameTurn, playerTurnIndex: turn.playerTurnIndex, actorId: turn.actorId, hexId, points: objectives.get(hexId), captured: holder(end, hexId) === turn.actorId });
      }
    };
    for (const [index, action] of save.acceptedActions.entries()) {
      if (turn === null && !['WEATHER', 'FIRST_PLAYER'].includes(state.sequence.phase)) turn = open();
      if (turn && action.kind === 'DECLARE_COMBAT' && action.combatKind === 'REGULAR' && action.actorId === turn.actorId
        && objectives.has(String(action.targetHexId)) && holder(state, String(action.targetHexId)) !== turn.actorId) {
        const facts = Object.fromEntries(m.ruleEngine.explain(state, action).facts.map(({ key, value }) => [key, value]));
        const attack = {
          column: m.calculateCombatOdds(state, action.attackerIds, action.defenderIds, action.targetHexId, action.defenderIds, null, null).columnIndex,
          drm: facts['combat.drm'], defenderCanPay: facts['combat.defenderCanPay'], hedgehogLevel: facts['combat.hedgehogLevel'],
          line: facts['combat.line'], attackers: action.attackerIds.length,
        };
        const previous = turn.attacks.get(String(action.targetHexId));
        if (!previous || attack.column > previous.column || (attack.column === previous.column && attack.drm > previous.drm)) {
          turn.attacks.set(String(action.targetHexId), { ...attack, attacksThisTurn: (previous?.attacksThisTurn ?? 0) + 1 });
        } else previous.attacksThisTurn += 1;
      }
      const applied = m.ruleEngine.applyAction(state, action);
      assert.ok(applied.ok, `${dir}/${record.match}: recorded action ${index} rejected`);
      if (turn) for (const hexId of objectives.keys()) if (holder(state, hexId) !== turn.actorId && holder(applied.state, hexId) === turn.actorId) turn.gained.add(hexId);
      state = applied.state;
      if (turn && keyOf(state.sequence) !== turn.key) { close(state); turn = null; }
    }
    if (turn) close(state);
    assert.equal((await m.hashGameState(state)).value, save.finalStateHash, `${dir}/${record.match}: final state hash differs`);
  }
}
mkdirSync(dirname(out), { recursive: true });
writeFileSync(out, rows.map((row) => JSON.stringify(row)).join('\n') + '\n');
console.log(JSON.stringify({ trajectories: seen.size, skippedDuplicates: skipped, rows: rows.length, attacks: rows.filter(({ kind }) => kind === 'ATTACK').length }));
