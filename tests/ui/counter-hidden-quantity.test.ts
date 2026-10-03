import { describe, expect, it } from 'vitest';
import {
  FULL_AIR_NEW_GAME_REQUEST,
  createGameplayEngine,
  createMemoryGameplayPorts,
  createNewGameOrchestrator,
} from '../../src/index.js';
import { counterSvgBody, counterView } from '../../src/ui/counter.js';

/** 4.9a: a quantity the viewer may not see is null in the projection; the counter must not print it as 0. */
describe('Counters with a hidden quantity', () => {
  it('print "?" for an enemy supply dump and an enemy Eq counter, and the number when it is known', async () => {
    const engine = createGameplayEngine(createMemoryGameplayPorts());
    const created = await createNewGameOrchestrator(engine).create(FULL_AIR_NEW_GAME_REQUEST);
    if (!created.ok) throw new Error('The full air game must be created.');
    const { definitions } = created.value.scenario.pieceCatalog;
    // Only what the counter reads; the quantity is set per case below.
    const sample = (family: string) => {
      const definition = definitions.find((entry) => entry.family === family)!;
      return { definition, piece: { currentFaceId: definition.faces[0]?.id ?? null, remainingSteps: null, resourceQuantity: null, mode: null, statuses: [], redacted: false } as const };
    };
    const printed = (svg: string) => [...svg.matchAll(/<text[^>]*>([^<]*)<\/text>/gu)].map(([, text]) => text);

    const dump = sample('RESOURCE');
    expect(printed(counterSvgBody(counterView(dump.definition, { ...dump.piece, resourceQuantity: null })))).toContain('? SP');
    expect(printed(counterSvgBody(counterView(dump.definition, { ...dump.piece, resourceQuantity: 6 })))).toContain('1.5 SP');

    const eq = sample('REPLACEMENT');
    expect(printed(counterSvgBody(counterView(eq.definition, { ...eq.piece, resourceQuantity: null })))).toContain('?');
    expect(printed(counterSvgBody(counterView(eq.definition, { ...eq.piece, resourceQuantity: 2 })))).toContain('2');
  });
});
