import assert from 'node:assert/strict';
import { readFileSync, writeFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import * as m from '../../dist/index.js';

const root = 'artifacts/ai-progress-objective';
const observations = JSON.parse(readFileSync(`${root}/results.json`));
const divergence = observations.divergences.find(row => row.match === 1600001);
const original = observations.games.find(row => row.match === 1600001 && row.direction === 'half');
const save = JSON.parse(readFileSync(original.source));
const state = m.parseGameStateJson(save.initialSnapshot); assert.ok(state.ok);
const summary = JSON.parse(readFileSync(original.source.replace(/match-\d+\.save\.json$/, 'summary.json'))).records.find(row => row.match === 1600001);
const fixture = await m.createGameplayFixture({ scenario: state.value.scenario, configuration: state.value.configuration });
const session = await fixture.engine.loadSession(JSON.stringify({ ...fixture.session.save(), bindings: save.bindings,
  activeSeatId: save.bindings[0].seatId, initialSnapshot: save.initialSnapshot, currentSnapshot: save.initialSnapshot,
  initialStateHash: save.initialStateHash, finalStateHash: save.initialStateHash }));
session.start();
let report = null;
const runner = m.createBotSeatRunner({ session, seats: session.getBindings().map(binding => ({ ...binding,
  policy: m.createHeuristicPolicy({ scenario: state.value.scenario, turnLimit: state.value.configuration.turnLimit }),
  seed: summary.seeds[binding.playerId.split(':')[1]] })),
  observation: { runId: 'progressObjective:default-first-divergence', onDecision: value => { if (value.revision === divergence.revision) report = value; } } });
for (let index = 0; index <= divergence.commonActions; index++) {
  if (index === divergence.commonActions) assert.equal(session.getMetadata().stateHash, divergence.stateHash);
  const result = await runner.step(); assert.equal(result.kind, 'ACTED');
  if (index < divergence.commonActions) assert.deepEqual(session.save().acceptedActions[index], save.acceptedActions[index]);
}
assert.ok(report); assert.equal(report.stateHash, divergence.stateHash);
const group = report.movementGroups.find(row => row.pieceId === divergence.firstActions.half.pieceId);
const actions = new Map(report.candidates.map(row => [row.id, row.action]));
const selectedAction = actions.get(group.selectedCandidateId);
assert.deepEqual(selectedAction, session.save().acceptedActions[divergence.commonActions]);
assert.ok(report.attempts.some(row => row.candidateId === group.selectedCandidateId && row.status === 'ACCEPTED'));
const candidates = group.candidates.filter(row => ['16,11', '17,11', '17,12'].includes(actions.get(row.candidateId).path.at(-1)))
  .map(row => ({ action: actions.get(row.candidateId), ...row }));
writeFileSync(`${root}/default-report.json`, `${JSON.stringify(report)}\n`);
const result = { scope: 'eight-decision prefix only, no default terminal outcome', progressObjective: 15,
  sourceSaveSha256: original.sourceSha256, preStateHash: report.stateHash, revision: report.revision,
  commonPrefixActionsMatched: divergence.commonActions, selectedAction,
  assignedTarget: group.assignedTarget, stay: group.stay, choice: report.choice, attempts: report.attempts,
  candidates, scriptSha256: createHash('sha256').update(readFileSync(new URL(import.meta.url))).digest('hex'),
  reportSha256: createHash('sha256').update(readFileSync(`${root}/default-report.json`)).digest('hex') };
writeFileSync(`${root}/default-decision.json`, `${JSON.stringify(result, null, 2)}\n`);
console.log(JSON.stringify({ progressObjective: 15, selectedAction, candidates: candidates.map(row => ({ destination: row.action.path.at(-1), score: row.retainedScore })) }));
