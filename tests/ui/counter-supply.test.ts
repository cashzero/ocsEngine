import { describe, expect, it } from 'vitest';
import {
  DEFAULT_NEW_GAME_REQUEST,
  createGameplayEngine,
  createMemoryGameplayPorts,
  createNewGameOrchestrator,
} from '../../src/index.js';
import { counterSvgBody, counterView } from '../../src/ui/counter.js';

const printedSize = (svg: string): string | undefined => /y="84" text-anchor="middle">([^<]*)</u.exec(svg)?.[1];

describe('Supply dump counters', () => {
  it('print the SP they hold, and "? SP" when an enemy dump hides its size', async () => {
    const engine = createGameplayEngine(createMemoryGameplayPorts());
    const created = await createNewGameOrchestrator(engine).create(DEFAULT_NEW_GAME_REQUEST);
    if (!created.ok) throw new Error('Default game must be created.');
    const definition = created.value.scenario.pieceCatalog.definitions.find(({ counter }) => counter?.kind === 'SUPPLY')!;
    const body = (resourceQuantity: number | null) => counterSvgBody(counterView(definition, {
      currentFaceId: null, remainingSteps: null, resourceQuantity, mode: null, statuses: [], redacted: resourceQuantity === null,
    }));

    expect(printedSize(body(8))).toBe('2 SP');
    // 4.9a: an enemy dump's quantity is hidden. A dump is removed the moment it is empty, so "0 SP" could only be a lie.
    expect(printedSize(body(null))).toBe('? SP');
  });
});
