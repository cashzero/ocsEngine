import { describe, expect, it } from 'vitest';
import {
  DEFAULT_NEW_GAME_REQUEST,
  createAutoplaySource,
  createGameplayEngine,
  createMemoryGameplayPorts,
  createNewGameOrchestrator,
  parseDispatchRequestId,
  prepareNewGame,
  runHeadlessSession,
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
    // Every OOB unit plus one objective garrison (OOB 0.4.0) and its 2T stock per objective.
    const objectives = prepared.value.deployment.objectives;
    expect(prepared.value.scenario.initialPieceState.pieces).toHaveLength(prepared.value.generatedOob.metrics.unitCount + 2 * objectives.length);
    const garrisonIds = new Set(prepared.value.generatedOob.sides.map(({ garrisonDefinitionId }) => garrisonDefinitionId));
    const controller = (hexId: string) => prepared.value.scenario.initialMapState.hexControl.find((entry) => entry.hexId === hexId)?.controllerId;
    for (const { hexId } of objectives) {
      const garrisons = prepared.value.scenario.initialPieceState.pieces.filter((piece) => garrisonIds.has(piece.definitionId)
        && piece.location.kind === 'ON_MAP' && piece.location.hexId === hexId);
      expect(garrisons).toHaveLength(1);
      expect(garrisons[0]!.ownerId).toBe(controller(hexId));
      expect(garrisons[0]!.mode).toBe('COMBAT');
    }
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

    const run = await runHeadlessSession(session, createAutoplaySource(bindings), 800);
    expect(run.rejected).toBe(0);
    expect(session.getMetadata().lifecycle).toBe('FINISHED');
    const finalView = session.getView(bindings[0]!.seatId);
    expect(finalView.projection?.victory.reason).toBe('TURN_LIMIT');
    const saved = session.serializeSave();
    const loaded = await engine.loadSession(saved);
    expect(loaded.getMetadata().lifecycle).toBe('FINISHED');
    expect(loaded.getView(bindings[0]!.seatId).projection?.victory).toEqual(finalView.projection?.victory);
    expect(session.exportReplay().actions.length).toBeGreaterThan(0);
  }, 60_000);
});
