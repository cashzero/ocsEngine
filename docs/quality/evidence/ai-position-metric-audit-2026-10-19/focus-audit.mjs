import assert from 'node:assert/strict';
import { readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

const root = process.cwd();
const build = resolve(process.argv[2] ?? '/tmp/ocsEngine-latest-metrics-probe');
const { loadEngine } = await import(pathToFileURL(resolve(root, 'scripts/ai-position-metrics.mjs')));
const { m } = await loadEngine(build);
const report = JSON.parse(readFileSync('artifacts/ai-latest-metrics-study/validation.json', 'utf8'));
const rowsByFile = new Map();
const output = [];
for (const game of report.trajectories) {
  const alias = game.aliases[0];
  if (!rowsByFile.has(alias.file)) {
    rowsByFile.set(alias.file, readFileSync(alias.file, 'utf8').trim().split('\n').map(JSON.parse));
  }
  const rows = rowsByFile.get(alias.file).filter(row => row.match === alias.match);
  const byTurn = new Map(rows.slice(2, -1).map(row => [`${row.gameTurn}:${row.playerTurnIndex}`, row]));
  const save = JSON.parse(readFileSync(resolve(alias.source, `match-${alias.match}.save.json`), 'utf8'));
  let state = m.parseGameStateJson(save.initialSnapshot).value;
  let previous = null;
  for (const action of save.acceptedActions) {
    const key = `${state.sequence.gameTurn}:${state.sequence.playerTurnIndex}`;
    const row = byTurn.get(key);
    if (key !== previous && row) {
      const player = row.phasingPlayerId;
      const definitions = new Map(state.scenario.pieceCatalog.definitions.map(d => [d.id, d]));
      const combat = state.pieceState.pieces.filter(p => p.location.kind === 'ON_MAP' && m.isOnMapCombatUnit(state, p));
      const own = combat.filter(p => p.ownerId === player);
      const enemy = combat.filter(p => p.ownerId !== player);
      const control = new Map(state.mapState.hexControl.map(c => [String(c.hexId), c.controllerId]));
      const strength = p => {
        const d = definitions.get(p.definitionId);
        const face = d?.faces?.find(f => f.id === p.currentFaceId) ?? d?.faces?.[0];
        const step = face?.steps?.find(s => s.remainingSteps === p.remainingSteps) ?? face?.steps?.[0];
        return step?.combatStrength ?? (String(d?.categoryDefinitionId).endsWith(':hq') ? (p.currentFaceId === 'combat' ? 5 : 1) : 1);
      };
      let best = null;
      for (const objective of state.configuration.objectives.filter(o => control.get(String(o.hexId)) !== player)) {
        const near = p => m.hexDistanceBetween(p.location.hexId, objective.hexId) <= 2;
        const ownStrength = own.filter(p => near(p) && !String(definitions.get(p.definitionId)?.categoryDefinitionId).endsWith(':hq')
          && p.mode !== 'STRAT' && !p.statuses?.some(s => s.statusDefinitionId === 'status:out-of-supply')).reduce((n, p) => n + strength(p), 0);
        const enemyStrength = enemy.filter(near).reduce((n, p) => n + strength(p), 0);
        if (!best || ownStrength > best.ownStrength || (ownStrength === best.ownStrength && objective.points > best.points)) {
          best = { hexId: String(objective.hexId), points: objective.points, ownStrength, enemyStrength,
            enemyOnObjective: enemy.filter(p => String(p.location.hexId) === String(objective.hexId)).length,
            controller: control.get(String(objective.hexId)) ?? null };
        }
      }
      const ratio = best?.ownStrength > 0 ? Number((best.ownStrength / Math.max(1, best.enemyStrength)).toFixed(3)) : 0;
      assert.equal(ratio, row.metrics[player].localForceRatioAt2Hex);
      const other = Object.keys(row.metrics).find(p => p !== player);
      output.push({ game: game.id, mapSeed: game.mapSeed, gameTurn: row.gameTurn,
        playerTurnIndex: row.playerTurnIndex, phasingPlayerId: player, ratio, focalObjective: best,
        opponentObjectiveVpLost: row.turn[other].objectiveVpLost });
    }
    previous = key;
    const result = m.ruleEngine.applyAction(state, action);
    assert.equal(result.violations?.length ?? 0, 0);
    state = result.state;
  }
  assert.equal((await m.hashGameState(state)).value, save.finalStateHash);
}
const high = output.filter(row => row.ratio > 7);
const summary = { rows: output.length, highRatioRows: high.length,
  highRatioSeeds: new Set(high.map(row => row.mapSeed)).size,
  highRatioEmptyFocalObjective: high.filter(row => row.focalObjective.enemyOnObjective === 0).length,
  highRatioNoEnemyWithin2: high.filter(row => row.focalObjective.enemyStrength === 0).length,
  highRatioOpponentControlled: high.filter(row => row.focalObjective.controller !== null && row.focalObjective.controller !== row.phasingPlayerId).length,
  highRatioWithOpponentVpLoss: high.filter(row => row.opponentObjectiveVpLost > 0).length };
writeFileSync('artifacts/ai-latest-metrics-study/focus-audit.json', JSON.stringify({ summary, rows: output }, null, 2) + '\n');
console.log(JSON.stringify(summary));
