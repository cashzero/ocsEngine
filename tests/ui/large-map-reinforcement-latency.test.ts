import { describe, expect, it } from 'vitest';
import {
  DEFAULT_NEW_GAME_REQUEST,
  createGameplayEngine,
  createMemoryGameplayPorts,
  createNewGameOrchestrator,
  createUiController,
} from '../../src/index.js';
import { playUntil } from './play-turn.js';

const elapsed = async (operation: () => unknown): Promise<number> => {
  const started = performance.now();
  await operation();
  return performance.now() - started;
};

describe('Reinforcement Phase on the largest map', () => {
  // Ending Aircraft Refit on a 64×48 map once took about 15 s: every reinforcement-placement candidate
  // rescanned the whole map once per Hex to find its edge (O(Hexes²)). The budget is the 1,500 ms action budget.
  it('opens and refuses an early end of the phase within the action budget', async () => {
    const engine = createGameplayEngine(createMemoryGameplayPorts());
    const created = await createNewGameOrchestrator(engine).create({
      ...DEFAULT_NEW_GAME_REQUEST, map: { ...DEFAULT_NEW_GAME_REQUEST.map, width: 64, height: 48 },
    });
    expect(created.ok).toBe(true);
    if (!created.ok) return;
    const { session, scenario, bindings } = created.value;
    const controller = createUiController({
      engine, session, scenario,
      bindings: bindings.map((binding, index) => ({ ...binding, label: index === 0 ? 'Allied' : 'Axis' })),
    });
    expect(await elapsed(() => controller.start())).toBeLessThan(1_500);
    // Nothing arrives on Game Turn 1 (13.6): the first Reinforcement Phase with arrivals is on Game Turn 2.
    await playUntil(controller, 2, 'REINFORCEMENT');
    const snapshot = controller.getSnapshot();
    expect(snapshot.view.projection?.sequence.phase).toBe('REINFORCEMENT');
    expect(await elapsed(() => controller.endStep())).toBeLessThan(1_500);
    expect(controller.getSnapshot().notice).toMatch(/reinforcement must be placed/u);
    controller.dispose();
  }, 60_000);
});
