import { readFileSync } from 'node:fs';
import { gunzipSync } from 'node:zlib';
import { describe, expect, it } from 'vitest';
import {
  createBotSeatRunner, createGameplayFixture, createHeuristicPolicy, hashGameState, parseGameStateJson,
  serializeGameState, type BotDecisionObservation,
} from '../../src/index.js';

const recordedGame = async () => {
  const fixture: unknown = JSON.parse(gunzipSync(readFileSync(new URL('./fixtures/vp-trace-gain-1221000.state.json.gz', import.meta.url))).toString());
  if (typeof fixture !== 'object' || fixture === null || !('snapshot' in fixture) || typeof fixture.snapshot !== 'string') {
    throw new Error('Recorded fixture has no snapshot');
  }
  const parsed = parseGameStateJson(fixture.snapshot);
  if (!parsed.ok) throw new Error('Recorded movement state does not parse');
  const state = parsed.value;
  const game = await createGameplayFixture({ scenario: state.scenario, configuration: state.configuration });
  const snapshot = serializeGameState(state), hashed = await hashGameState(state);
  if (!snapshot.ok || !hashed.ok) throw new Error('Recorded movement state cannot bind to a session');
  const session = await game.engine.loadSession(JSON.stringify({ ...game.session.save(), initialSnapshot: snapshot.value,
    currentSnapshot: snapshot.value, initialStateHash: hashed.value, finalStateHash: hashed.value }));
  session.start();
  return { ...game, session, state };
};

describe('passive movement destination observations', () => {
  it('joins actual query, choice and dispatch identities through a recorded movement prefix', async () => {
    const { session, state, engine } = await recordedGame();
    const reports: BotDecisionObservation[] = [];
    const policy = createHeuristicPolicy({ scenario: state.scenario, turnLimit: state.configuration.turnLimit });
    const runner = createBotSeatRunner({ session,
      seats: session.getBindings().map((binding, index) => ({ ...binding, policy, seed: 7 + index })),
      observation: { runId: 'movement-prefix', onDecision: report => reports.push(report) } });
    for (let index = 0; index < 30; index++) expect((await runner.step()).kind).toBe('ACTED');
    expect(reports).toHaveLength(30);
    const groups = reports.flatMap(report => report.coverage === 'QUERY_AND_MOVEMENT' ? report.movementGroups : []);
    expect(groups.length).toBeGreaterThan(0);
    const corrections = groups.flatMap(group => group.candidates.filter(candidate => candidate.correction.status === 'EVALUATED'
      && candidate.correction.applied));
    expect(corrections.length).toBeGreaterThan(0);
    for (const candidate of corrections) {
      expect(candidate.baseTerms.some(term => term.term === 'out-of-supply')).toBe(true);
      expect(candidate.retainedTerms.some(term => term.term === 'out-of-supply')).toBe(false);
      expect(candidate.baseTerms).not.toBe(candidate.retainedTerms);
    }
    expect(groups.some(group => group.correctionEligibleOrder.length > 12)).toBe(true);
    expect(groups.some(group => group.candidates.some(candidate => candidate.finalSupply.status === 'NOT_EVALUATED'
      && candidate.finalSupply.reason === 'EARLIER_CANDIDATE_SELECTED'))).toBe(true);
    expect(groups.some(group => group.candidates.some(candidate => candidate.finalSupply.status === 'NOT_EVALUATED'
      && candidate.finalSupply.reason === 'NOT_IMPROVING'))).toBe(true);
    for (const report of reports) {
      if (report.coverage === 'QUERY_ONLY') {
        expect(report.schemaVersion).toBe(1);
        expect(report).not.toHaveProperty('movementGroups');
        continue;
      }
      expect(report.schemaVersion).toBe(2);
      for (const group of report.movementGroups) {
        expect(group.conditionCoverage).toBe('COMPOSITE_ONLY');
        expect(['COMBAT', 'HQ', 'ARTILLERY']).toContain(group.role);
        expect(group.correctionCheckedOrder).toEqual(group.correctionEligibleOrder.slice(0, 12));
        expect(group.supplyCheckedOrder).toEqual(group.improvingOrder.slice(0, group.supplyCheckedOrder.length));
        if (group.selectedCandidateId !== null) {
          expect(group.supplyCheckedOrder.at(-1)).toBe(group.selectedCandidateId);
          expect(report.choice?.candidateId).toBe(group.selectedCandidateId);
          expect(report.attempts[0]?.candidateId).toBe(group.selectedCandidateId);
        }
        for (const candidate of group.candidates) {
          const identity = report.candidates.find(identity => identity.id === candidate.candidateId);
          expect(identity?.policyEvaluation).toBe('MOVEMENT_DESTINATION');
          expect(identity?.action).toMatchObject({ kind: 'MOVE_PIECE', pieceId: group.pieceId });
          expect(report.queries.some(query => query.candidates.includes(candidate.candidateId))).toBe(true);
          const improving = candidate.retainedScore > group.stay.score;
          expect(group.improvingOrder.includes(candidate.candidateId)).toBe(improving);
          if (candidate.finalSupply.status === 'NOT_EVALUATED') {
            expect(candidate.finalSupply.reason).toBe(improving ? 'EARLIER_CANDIDATE_SELECTED' : 'NOT_IMPROVING');
          }
        }
      }
    }
    const restored = await engine.loadSession(session.serializeSave());
    expect(restored.getMetadata().stateHash).toBe(session.getMetadata().stateHash);
  }, 120_000);

  it('keeps v1 query-only coverage when a policy never invokes the movement writer', async () => {
    const { session } = await recordedGame();
    const reports: BotDecisionObservation[] = [];
    const runner = createBotSeatRunner({ session, seats: session.getBindings().map(binding => ({ ...binding, seed: 7,
      policy: { id: 'query-only-control', version: '1', decide: context => {
        context.actions.candidates('MOVE_PIECE');
        return null;
      } } })), observation: { runId: 'writer-control', onDecision: report => reports.push(report) } });
    expect((await runner.step()).kind).toBe('STUCK');
    expect(reports[0]).toMatchObject({ schemaVersion: 1, coverage: 'QUERY_ONLY' });
    expect(reports[0]).not.toHaveProperty('movementGroups');
    expect(reports[0]?.candidates.every(candidate => candidate.policyEvaluation === 'NOT_INSTRUMENTED')).toBe(true);
  });
});
