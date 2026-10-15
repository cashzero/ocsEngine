// @vitest-environment happy-dom
import { describe, expect, it } from 'vitest';
import {
  DEFAULT_NEW_GAME_REQUEST,
  createGameplayEngine,
  createMemoryGameplayPorts,
  createNewGameOrchestrator,
  createUiController,
} from '../../src/index.js';

/** The attacker's off-map airfield in the UI (docs/quality/evidence/engagements-plan-2026-10-07/README.md §6, AIR-OM5). */
describe('off-map air in the UI', () => {
  it('offers an Air Barrage from the off-map airfield in the attacker\'s Barrage Segment', async () => {
    const engine = createGameplayEngine(createMemoryGameplayPorts());
    const created = await createNewGameOrchestrator(engine).create({ ...DEFAULT_NEW_GAME_REQUEST, engagement: 'AXIS_ATTACKS' });
    if (!created.ok) throw new Error('Axis attack must be created.');
    const { session, scenario, bindings } = created.value;
    const controller = createUiController({ engine, session, scenario, bindings });
    // Axis moves first; end its Movement Segment to reach the Barrage Segment.
    await controller.endStep();
    const snapshot = controller.getSnapshot();
    expect(snapshot.view.projection?.sequence.segment).toBe('BARRAGE');
    expect(snapshot.air.missions.find(({ mission }) => mission === 'BARRAGE')?.available).toBe(true);
    controller.planAirMission('BARRAGE');
    const target = controller.getSnapshot().air.targetHexes[0];
    expect(target).toBeDefined();
    await controller.clickHex(target!);
    const draft = controller.getSnapshot().air.draft;
    // Every eligible aircraft is at the off-map airfield: nothing of it stands on the map.
    const located = draft!.eligibleIds.map((id) => controller.getSnapshot().view.projection!.stacks.find(({ pieces }) => pieces.some((piece) => piece.id === id))?.location.kind);
    expect(located.length).toBeGreaterThan(0);
    expect(located.every((kind) => kind === 'OFF_MAP_BOX')).toBe(true);
    controller.dispose();
  }, 60_000);
});
