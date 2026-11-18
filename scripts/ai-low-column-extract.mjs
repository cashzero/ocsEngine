import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { basename, dirname, join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

const [batch, exchangeFile, progressFile, out, replayEngine] = process.argv.slice(2);
assert(batch && exchangeFile && progressFile && out, 'usage: node scripts/ai-low-column-extract.mjs WESTERN_BATCH attack-exchange.json progress-all.json cases.json [FROZEN_V88_DIST]');
const read = path => readFileSync(path, 'utf8');
const json = path => JSON.parse(read(path));
const sha = content => createHash('sha256').update(content).digest('hex');
const exchange = json(exchangeFile);
const progress = json(progressFile).attacks;
const cohort = json(join(batch, 'summary.json')).records.filter(r => r.sides.axis.policy === 'heuristic');
assert.equal(cohort.length, 40);
assert.equal(new Set(cohort.map(r => r.seeds.map)).size, 40);
assert.equal(new Set(cohort.map(r => r.match)).size, 40);
const m = replayEngine ? await import(pathToFileURL(resolve(replayEngine, 'index.js')).href) : null;
const cases = [];
const owner = (state, hexId) => state.mapState.hexControl.find(h => h.hexId === hexId)?.controllerId;
const engineState = (snapshot) => {
  const decoded = m.parseGameStateJson(snapshot);
  assert(decoded.ok);
  return decoded.value;
};
for (const record of cohort) {
  const { match, summary } = record;
  assert.equal(summary.mapStyle, 'WESTERN_EUROPE');
  assert.equal(summary.engagement, 'AXIS_ATTACKS');
  assert(record.sides.allied.policy.endsWith('/frozen-v86/dist'));
  assert.equal(record.stopReason, 'FINISHED');
  assert.equal(record.rejected, 0);
  assert(record.replay.ok);
  const file = resolve(batch, `match-${match}.save.json`);
  const saveText = read(file), save = JSON.parse(saveText), digest = sha(saveText);
  assert.equal(save.finalStateHash, record.finalStateHash);
  const traceText = read(join(batch, `match-${match}.trace.jsonl`)), traceDigest = sha(traceText);
  const trace = traceText.trim().split('\n').map(line => JSON.parse(line));
  assert.equal(trace.length, save.acceptedActions.length);
  const initial = JSON.parse(save.initialSnapshot);
  const axis = initial.configuration.attackVictory.attackerId;
  assert.equal(axis, 'player:axis');
  const objectives = new Map(initial.configuration.objectives.map(o => [o.hexId, o.points]));
  const battles = exchange.filter(e => e.match === match);
  const objectivesAttacked = progress.filter(e => e.match === match);
  let battleCount = 0, objectiveCount = 0;
  let state = m ? engineState(save.initialSnapshot) : null;
  let active = null;
  for (const [at, action] of save.acceptedActions.entries()) {
    const row = trace[at];
    assert.equal(row.status, 'ACCEPTED');
    assert.equal(row.revision, at);
    assert.equal(row.policy, row.seatId === 'seat:axis' ? 'heuristic@88' : `heuristic@86+${record.sides.allied.policy.slice('heuristic@'.length)}`);
    assert.deepEqual(row.action, action);
    if (action.kind === 'DECLARE_COMBAT' && action.actorId === axis && action.combatKind === 'REGULAR') {
      const attack = battles[battleCount++];
      const [turn, , phase, segment] = row.stepKey.split(':');
      const hexId = action.targetHexId;
      assert.equal(attack.hexId, hexId);
      assert.equal(attack.turn, Number(turn));
      assert.equal(attack.style, summary.mapStyle);
      assert.equal(attack.attackers, action.attackerIds.length);
      assert.equal(attack.intent, row.intent);
      assert.equal(attack.objective, objectives.get(hexId) ?? 0);
      if (m) {
        assert.equal(active, null);
        assert.equal(state.sequence.gameTurn, Number(turn));
        assert.equal(state.sequence.phase, phase);
        assert.equal(state.sequence.segment, segment);
        const explained = m.ruleEngine.explain(state, action);
        assert(explained.allowed);
        assert.equal(m.forecastCombat(explained.facts).columnIndex, attack.column);
        assert.equal(owner(state, hexId) === axis, attack.heldBefore);
        active = { attack, ownLost: 0, enemyLost: 0 };
      }
      if (objectives.has(hexId)) {
        const other = objectivesAttacked[objectiveCount++];
        for (const k of ['match', 'hexId', 'turn', 'column', 'attackers', 'outcome', 'style']) assert.deepEqual(other[k], attack[k]);
        assert.equal(other.phase, phase);
        assert.equal(other.points, attack.objective);
        if (phase === 'COMBAT' && segment === 'COMBAT' && !attack.heldBefore && Number.isInteger(attack.column) && attack.column >= 0 && attack.column <= 3) {
          const terms = row.breakdown.filter(term => term.term === 'objective');
          assert.equal(terms.length, 1);
          assert(terms[0].value > 0);
          assert(Math.abs(row.score - row.breakdown.reduce((sum, item) => sum + item.value, 0)) < 1e-7);
          if (m) {
            const query = m.ruleEngine.getActionCandidates(state, { actorId: axis, kind: 'DECLARE_COMBAT', pieceId: null, budget: 200 });
            assert(query.actions.some(candidate => candidate.actionId === action.actionId));
          }
          cases.push({ match, at, save: file, mapSeed: record.seeds.map, hexId, turn: attack.turn, column: attack.column, outcome: attack.outcome,
            points: attack.objective, ownLost: attack.ownLost, enemyLost: attack.enemyLost, idleBeside: other.idleBeside,
            score: row.score, objectiveScore: terms[0].value, actionId: action.actionId, saveSha256: digest, traceSha256: traceDigest });
        }
      }
    }
    if (m) {
      const next = m.ruleEngine.applyAction(state, action);
      assert(next.ok, `${basename(file)} action ${at}`);
      if (active) {
        for (const event of next.events.filter(e => e.kind === 'STEP_LOST')) {
          const piece = state.pieceState.pieces.find(p => p.id === event.pieceId) ?? next.state.pieceState.pieces.find(p => p.id === event.pieceId);
          assert(piece);
          active[piece.ownerId === axis ? 'ownLost' : 'enemyLost']++;
        }
        if (!next.state.pendingDecision && !next.state.activeTransaction) {
          const { attack, ownLost, enemyLost } = active;
          const defended = next.state.pieceState.pieces.some(p => p.ownerId !== axis && p.location.kind === 'ON_MAP' && p.location.hexId === attack.hexId && m.isOnMapCombatUnit(next.state, p));
          assert.equal(attack.outcome, defended ? 'stayed' : owner(next.state, attack.hexId) === axis ? 'taken' : 'cleared');
          assert.equal(attack.ownLost, ownLost);
          assert.equal(attack.enemyLost, enemyLost);
          active = null;
        }
      }
      state = next.state;
    }
  }
  assert.equal(active, null);
  assert.equal(battleCount, battles.length);
  assert.equal(objectiveCount, objectivesAttacked.length);
  if (m) assert.equal((await m.hashGameState(state)).value, record.finalStateHash);
}
assert.equal(cases.length, 52);
assert.equal(new Set(cases.map(r => r.match)).size, 27);
assert.equal(new Set(cases.map(r => `${r.match}:${r.at}`)).size, cases.length);
assert.deepEqual(['stayed', 'taken', 'cleared'].map(x => cases.filter(r => r.outcome === x).length), [41, 7, 4]);
mkdirSync(dirname(resolve(out)), { recursive: true });
writeFileSync(out, JSON.stringify(cases, null, 2) + '\n');
console.log(JSON.stringify({ games: cohort.length, cases: cases.length, replayed: Boolean(m), manifestSha256: sha(read(out)) }));
