import { describe, expect, it } from 'vitest';
import {
  FULL_AIR_NEW_GAME_REQUEST,
  createGameplayEngine,
  createMemoryGameplayPorts,
  createNewGameOrchestrator,
} from '../../src/index.js';
import { counterSvgBody, counterView, playerNation } from '../../src/ui/counter.js';

/** 9.14b-c: captured supply and trucks change hands, so the counter wears its new owner's colours. */
describe('Captured supply counters', () => {
  it('draw an Axis dump held by the Allied player in Allied colours, and leave combat units as printed', async () => {
    const engine = createGameplayEngine(createMemoryGameplayPorts());
    const created = await createNewGameOrchestrator(engine).create(FULL_AIR_NEW_GAME_REQUEST);
    if (!created.ok) throw new Error('The full air game must be created.');
    const { scenario } = created.value;
    const [allied, axis] = scenario.players;
    expect(playerNation(scenario.players, String(allied!.id))).toBe('US');
    expect(playerNation(scenario.players, String(axis!.id))).toBe('GERMAN');
    const sample = (kind: string) => {
      const definition = scenario.pieceCatalog.definitions.find((entry) => entry.counter?.kind === kind && entry.counter.nationality === 'GERMAN')!;
      const face = definition.faces[0];
      const steps = Math.max(0, ...(face?.steps.map(({ remainingSteps }) => remainingSteps) ?? []));
      return { definition, piece: { currentFaceId: face?.id ?? null, remainingSteps: steps || null, resourceQuantity: 4, mode: null, statuses: [], redacted: false } as const };
    };
    const dump = sample('SUPPLY');
    expect(counterSvgBody(counterView(dump.definition, dump.piece))).toContain('nation-GERMAN');
    expect(counterSvgBody(counterView(dump.definition, dump.piece, 'GERMAN'))).toContain('nation-GERMAN');
    const captured = counterSvgBody(counterView(dump.definition, dump.piece, 'US'));
    expect(captured).toContain('nation-US');
    expect(captured).not.toContain('nation-GERMAN');
    const combat = sample('COMBAT');
    expect(counterSvgBody(counterView(combat.definition, combat.piece, 'US'))).toContain('nation-GERMAN');
  });
});
