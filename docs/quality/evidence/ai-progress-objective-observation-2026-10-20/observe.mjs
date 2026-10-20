import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFileSync, writeFileSync, mkdirSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import * as m from '../../dist/index.js';

const sha = value => createHash('sha256').update(value).digest('hex');
const canonical = value => JSON.stringify(value, (_key, item) => item && typeof item === 'object' && !Array.isArray(item)
  ? Object.fromEntries(Object.keys(item).sort().map(key => [key, item[key]])) : item);
const root = 'artifacts/ai-progress-objective';
const artifactRoot = '.claude/worktrees/ai-truck-shuttle';
const panelPath = 'artifacts/ai-surrogate-transfer-study/run/panel.json';
const panelBytes = readFileSync(panelPath);
const panel = JSON.parse(panelBytes).filter(row => row.family === 'progressObjective' && row.climate === 'TEMPERATE_INLAND');
assert.equal(panel.length, 8);
const registration = JSON.parse(readFileSync('docs/quality/evidence/ai-position-surrogacy-2026-10-19/registration.json'));
const engineDigest = createHash('sha256');
for (const file of readdirSync('dist', { recursive: true }).filter(file => file.endsWith('.js')).sort()) {
  engineDigest.update(file).update('\0').update(sha(readFileSync(join('dist', file)))).update('\0');
}
const engineTreeSha256 = engineDigest.digest('hex');
assert.equal(engineTreeSha256, '4a87376b26c41f60086cb3060f606afcc1e9b99bb3ba00339c904837d200bb2a');
const weights = registration.variants.filter(variant => variant.weight === 'progressObjective');
for (const weight of weights) assert.equal(sha(readFileSync(join(artifactRoot, weight.file))), weight.sha256);
const gameInputs = panel.flatMap(pair => pair.games.map(game => ({ ...game, pair: pair.pair, direction: pair.direction })));
const byMatch = new Map();
for (const game of gameInputs) {
  const path = join(artifactRoot, game.source, `match-${game.match}.save.json`);
  const raw = readFileSync(path), save = JSON.parse(raw);
  assert.equal(sha(raw), game.saveSha256);
  assert.equal(sha(canonical(save.acceptedActions)), game.acceptedActionsSha256);
  if (!byMatch.has(game.match)) byMatch.set(game.match, {});
  byMatch.get(game.match)[game.direction] = { game, save, path };
}
assert.equal(byMatch.size, 8);
const games = [], divergences = [];
const started = performance.now();
mkdirSync(`${root}/branches`, { recursive: true });
for (const [match, inputs] of byMatch) {
  assert.equal(inputs.half.game.initialStateHash, inputs.double.game.initialStateHash);
  assert.equal(inputs.half.game.variantPlayer, inputs.double.game.variantPlayer);
  assert.deepEqual(inputs.half.game.seeds, inputs.double.game.seeds);
  const a = inputs.half.save.acceptedActions, b = inputs.double.save.acceptedActions;
  let prefix = 0;
  while (prefix < Math.min(a.length, b.length) && canonical(a[prefix]) === canonical(b[prefix])) prefix++;
  const divergence = { match, mapSeed: inputs.half.game.seeds.map, variantPlayer: inputs.half.game.variantPlayer,
    commonActions: prefix, identicalHistories: prefix === a.length && prefix === b.length,
    firstActions: { half: a[prefix] ?? null, double: b[prefix] ?? null } };
  for (const direction of ['half', 'double']) {
    const { game, save, path } = inputs[direction];
    const parsed = m.parseGameStateJson(save.initialSnapshot); assert.ok(parsed.ok);
    let state = parsed.value;
    const initialHash = await m.hashGameState(state); assert.ok(initialHash.ok);
    assert.equal(initialHash.value, game.initialStateHash);
    const summary = JSON.parse(readFileSync(join(artifactRoot, game.source, 'summary.json'))).records.find(row => row.match === match);
    assert.equal(summary.summary.mapStyle, 'TEMPERATE_INLAND');
    assert.equal(summary.summary.engagement, 'AXIS_ATTACKS');
    assert.equal(state.configuration.attackVictory.attackerId, 'player:axis');
    assert.equal(summary.stopReason, 'FINISHED'); assert.deepEqual(summary.errors, []);
    const changes = [], turnEnds = [];
    let early = null;
    for (const [index, action] of save.acceptedActions.entries()) {
      if (state.sequence.gameTurn >= 4 && !['WEATHER', 'FIRST_PLAYER'].includes(state.sequence.phase) && early === null) {
        early = { actionIndex: index, revision: state.revision, sequence: state.sequence,
          stateHash: (await m.hashGameState(state)).value, control: state.mapState.hexControl.filter(c => state.configuration.objectives.some(o => o.hexId === c.hexId)) };
      }
      if (index === prefix) {
        const hash = await m.hashGameState(state); assert.ok(hash.ok);
        if (direction === 'half') {
          divergence.sequence = state.sequence; divergence.revision = state.revision; divergence.stateHash = hash.value;
          divergence.objectives = state.configuration.objectives;
          divergence.control = state.mapState.hexControl.filter(c => state.configuration.objectives.some(o => o.hexId === c.hexId));
          divergence.units = state.pieceState.pieces.filter(p => [a[prefix]?.pieceId, b[prefix]?.pieceId].includes(p.id));
          divergence.legalAlternatives = Object.fromEntries(['half', 'double'].map(key => {
            const result = m.ruleEngine.applyAction(state, inputs[key].save.acceptedActions[prefix]);
            return [key, { ok: result.ok, errors: result.errors ?? [] }];
          }));
          const snapshot = m.serializeGameState(state); assert.ok(snapshot.ok);
          const branchPath = `${root}/branches/match-${match}.snapshot.json`;
          writeFileSync(branchPath, snapshot.value);
          divergence.snapshot = { path: branchPath, sha256: sha(readFileSync(branchPath)) };
        } else assert.equal(hash.value, divergence.stateHash);
      }
      const next = m.ruleEngine.applyAction(state, action);
      assert.ok(next.ok, `${direction} ${match} action ${index} rejected`);
      for (const objective of state.configuration.objectives) {
        const from = state.mapState.hexControl.find(c => c.hexId === objective.hexId)?.controllerId ?? null;
        const to = next.state.mapState.hexControl.find(c => c.hexId === objective.hexId)?.controllerId ?? null;
        if (from !== to) changes.push({ actionIndex: index, sequence: state.sequence, actor: action.actorId,
          actionKind: action.kind, pieceId: action.pieceId ?? null, path: action.path ?? null, ...objective, from, to });
      }
      for (const event of next.events) if (event.kind === 'SEQUENCE_ADVANCED' && event.from.phase === 'CLEAN_UP') {
        turnEnds.push({ actionIndex: index, gameTurn: event.from.gameTurn, owner: event.from.phasingPlayerId,
          control: next.state.mapState.hexControl.filter(c => state.configuration.objectives.some(o => o.hexId === c.hexId)) });
      }
      state = next.state;
    }
    const finalHash = await m.hashGameState(state); assert.ok(finalHash.ok);
    assert.equal(finalHash.value, game.finalStateHash);
    const current = m.parseGameStateJson(save.currentSnapshot); assert.ok(current.ok);
    assert.equal((await m.hashGameState(current.value)).value, game.finalStateHash);
    const subject = game.variantPlayer.split(':')[1], opponent = subject === 'allied' ? 'axis' : 'allied';
    const metrics = { vpMargin: summary.sides[subject].vp - summary.sides[opponent].vp,
      vp: summary.sides[subject].vp, opponentVp: summary.sides[opponent].vp,
      kill: summary.sides[subject].stepsKilled, loss: summary.sides[subject].stepsLost };
    const gameResult = { match, direction, mapSeed: game.seeds.map, variantPlayer: game.variantPlayer,
      source: path, sourceSha256: game.saveSha256, acceptedActionsSha256: game.acceptedActionsSha256,
      accepted: save.acceptedActions.length, initialStateHash: initialHash.value, finalStateHash: finalHash.value,
      metrics, early, changes, turnEnds };
    games.push(gameResult);
    console.log(JSON.stringify({ match, direction, accepted: gameResult.accepted, metrics, commonActions: prefix }));
  }
  divergences.push(divergence);
}
const pairs = [];
for (const mapSeed of [...new Set(games.map(game => game.mapSeed))].sort()) {
  const selected = games.filter(game => game.mapSeed === mapSeed);
  const variants = Object.fromEntries(['half', 'double'].map(direction => {
    const rows = selected.filter(game => game.direction === direction); assert.equal(rows.length, 2);
    return [direction, Object.fromEntries(['vpMargin', 'kill', 'loss'].map(key => [key, rows.reduce((n, row) => n + row.metrics[key], 0) / 2]))];
  }));
  pairs.push({ mapSeed, ...variants, doubleMinusHalf: Object.fromEntries(['vpMargin', 'kill', 'loss'].map(key => [key, variants.double[key] - variants.half[key]])) });
}
const result = { scope: { map: 'TEMPERATE_INLAND', engagement: 'AXIS_ATTACKS', weight: 'progressObjective',
  historicalGames: 16, seedPairs: 4, newGames: 0, weights: { half: 7.5, default: 15, double: 30 },
  defaultSelfplayPresent: false, qualification: 'RETROSPECTIVE_OBSERVATION_ONLY' },
  provenance: { sourceCommit: '12d7887', scriptSha256: sha(readFileSync(new URL(import.meta.url))),
    panelSha256: sha(panelBytes), engineTreeSha256, elapsedMs: performance.now() - started, weights },
  pairs, games, divergences };
writeFileSync(`${root}/results.json`, `${JSON.stringify(result, null, 2)}\n`);
console.log(JSON.stringify({ pairs, elapsedMs: result.provenance.elapsedMs }));
