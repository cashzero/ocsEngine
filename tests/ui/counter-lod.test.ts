import { describe, expect, it } from 'vitest';
import { counterLod } from '../../src/ui/counter.js';

describe('counter screen-space LOD', () => {
  it.each([ [0, 'symbol'], [24, 'symbol'], [37.99, 'symbol'], [38, 'ratings'], [57.99, 'ratings'], [58, 'full'], [112, 'full'] ] as const)(
    'uses %s screen pixels for %s detail', (pixels, detail) => {
      expect(counterLod(pixels)).toBe(detail);
    },
  );
});
