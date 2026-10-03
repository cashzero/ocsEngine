import { describe, expect, it } from 'vitest';
import { parseDefinitionId } from '../../src/core/index.js';
import type { PieceDefinition } from '../../src/domain/piece/index.js';
import { ALLIED_AIRBORNE_GPID, AXIS_AIRBORNE_GPID, corpusCounter, corpusFaces } from '../../src/generation/oob/counter-corpus.js';
import { counterSvgBody, counterView } from '../../src/ui/counter.js';

const definitionOf = (gpid: number, nationality: 'US' | 'GERMAN'): PieceDefinition => {
  const id = parseDefinitionId(`test:airborne-${gpid}`);
  if (!id.ok) throw new Error('Valid test id.');
  return {
    id: id.value, name: 'Airborne division', family: 'GROUND',
    counter: corpusCounter(gpid, '82.Abn', '', nationality, null),
    faces: corpusFaces(gpid), capabilities: [],
  } as unknown as PieceDefinition;
};

const bodyOf = (definition: PieceDefinition): string => counterSvgBody(counterView(definition, {
  currentFaceId: definition.faces[0]!.id, remainingSteps: null, resourceQuantity: null, mode: null, statuses: [], redacted: false,
} as never));

/** The NATO (APP-6) airborne infantry symbol is the infantry cross plus an arc (a parachute canopy) on the frame's bottom edge. */
const INFANTRY_CROSS = 'M29 25L71 48M71 25L29 48';
const AIRBORNE_ARC = 'M30 49C36 25 64 25 70 49';

describe('airborne division counters print the NATO airborne symbol', () => {
  it.each([['US', ALLIED_AIRBORNE_GPID], ['German', AXIS_AIRBORNE_GPID]] as const)('%s airborne division: cross plus canopy arc', (_name, gpid) => {
    const body = bodyOf(definitionOf(gpid, gpid === ALLIED_AIRBORNE_GPID ? 'US' : 'GERMAN'));
    expect(body).toContain(INFANTRY_CROSS);
    expect(body).toContain(AIRBORNE_ARC);
  });

  it('leaves a plain infantry division without the arc', () => {
    const body = bodyOf(definitionOf(826, 'GERMAN'));
    expect(body).toContain(INFANTRY_CROSS);
    expect(body).not.toContain(AIRBORNE_ARC);
  });
});
