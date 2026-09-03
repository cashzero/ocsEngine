import { describe, expect, it } from 'vitest';
import {
  DEFAULT_NEW_GAME_REQUEST,
  createGameplayEngine,
  createMemoryGameplayPorts,
  createNewGameOrchestrator,
  parseDispatchRequestId,
  prepareNewGame,
  sweepGameFlowSeedOrthogonality,
  validateGeneratedScenarioPackage,
} from '../../src/index.js';

describe('generated New Game flow', () => {
  it('composes Map, OOB and deployment into one valid Scenario package', () => {
    const prepared = prepareNewGame(DEFAULT_NEW_GAME_REQUEST);
    expect(prepared.ok).toBe(true);
    if (!prepared.ok) return;
    expect(validateGeneratedScenarioPackage(prepared.value)).toEqual([]);
    expect(prepared.value.scenario.mapDefinition).toEqual(prepared.value.generatedMap.mapDefinition);
    expect(prepared.value.scenario.pieceCatalog).toEqual(prepared.value.generatedOob.pieceDefinitionCatalog);
    expect(prepared.value.scenario.initialPieceState.pieces).toHaveLength(prepared.value.generatedOob.metrics.unitCount);
    expect(prepared.value.deployment.metrics.maximumStackReTicks).toBeLessThanOrEqual(40);
    expect(prepared.value.bindings).toHaveLength(2);
  });

  it('owns map, OOB and deployment random streams independently', () => {
    const report = sweepGameFlowSeedOrthogonality(DEFAULT_NEW_GAME_REQUEST);
    expect(report.passed).toBe(true);
    expect(report.cases).toHaveLength(3);
  });

  it('boots Gameplay, reaches FINISHED, and round-trips the final save', async () => {
    const engine = createGameplayEngine(createMemoryGameplayPorts());
    const created = await createNewGameOrchestrator(engine).create({
      ...DEFAULT_NEW_GAME_REQUEST,
      turnLimit: 1,
    });
    expect(created.ok).toBe(true);
    if (!created.ok) return;
    const { session, bindings } = created.value;
    expect(session.getMetadata().lifecycle).toBe('ACTIVE');

    for (let index = 0; index < 80 && session.getMetadata().lifecycle !== 'FINISHED'; index += 1) {
      const actingPlayerId = session.getView(bindings[0]!.seatId).projection!.sequence.actingPlayerId;
      const binding = bindings.find(({ playerId }) => playerId === actingPlayerId)!;
      const action = session.getActionCandidates(binding.seatId, {
        kind: 'ADVANCE_SEQUENCE', pieceId: null, budget: 1,
      }).actions[0];
      expect(action).toBeDefined();
      if (!action) break;
      const requestId = parseDispatchRequestId(`game-flow:test:${index}`);
      expect(requestId.ok).toBe(true);
      if (!requestId.ok) break;
      const result = await session.dispatch({ requestId: requestId.value, seatId: binding.seatId, action });
      expect(result.status).toBe('ACCEPTED');
    }

    expect(session.getMetadata().lifecycle).toBe('FINISHED');
    const finalView = session.getView(bindings[0]!.seatId);
    expect(finalView.projection?.victory.reason).toBe('TURN_LIMIT');
    const saved = session.serializeSave();
    const loaded = await engine.loadSession(saved);
    expect(loaded.getMetadata().lifecycle).toBe('FINISHED');
    expect(loaded.getView(bindings[0]!.seatId).projection?.victory).toEqual(finalView.projection?.victory);
    expect(session.exportReplay().actions.length).toBeGreaterThan(0);
  });
});
