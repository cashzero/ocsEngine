import { describe, expect, it } from 'vitest';
import { parseDefinitionId } from '../../src/core/index.js';
import type { PieceDefinition } from '../../src/domain/piece/index.js';
import { corpusCounter, corpusFaces } from '../../src/generation/oob/counter-corpus.js';
import { counterSvgBody, counterView } from '../../src/ui/counter.js';

const hqBody = (gpid: number, nationality: 'US' | 'GERMAN', name: string, number: string): string => {
  const id = parseDefinitionId(`test:hq-${gpid}`);
  if (!id.ok) throw new Error('Valid test id.');
  const definition = {
    id: id.value, name, family: 'GROUND', counter: corpusCounter(gpid, number, '', nationality, null),
    faces: corpusFaces(gpid), capabilities: [],
  } as unknown as PieceDefinition;
  return counterSvgBody(counterView(definition, {
    currentFaceId: definition.faces[0]!.id, remainingSteps: null, resourceQuantity: null, mode: null, statuses: [], redacted: false,
  } as never));
};

/** The BTR HQ counters (S01 R10 C01 "3", S04 R12 C20 "39 Pz", ...) print a nation flag, the HQ's rotated number and a large "range-movement" rating. */
describe('HQ counters follow the BTR VASSAL art', () => {
  it('US HQ prints the stars and stripes, not a unit symbol or a text label in the symbol box', () => {
    const body = hqBody(319, 'US', 'US HQ 3rd Corps', '3');
    expect(body).toContain('class="counter-symbol hq-flag"');
    expect(body).toContain('#1c2a58');
    expect(body).not.toContain('symbol-box');
    expect(body).not.toContain('hq-formation');
  });

  it('German HQ prints the black cross on white with red corners', () => {
    const body = hqBody(1103, 'GERMAN', 'Ge HQ 39th Pz Corps', '39 Pz');
    expect(body).toContain('#c4161c');
    expect(body).not.toContain('#1c2a58');
  });

  it('prints XXX, its own number rotated beside the flag (never a division), and the large range-movement rating', () => {
    const body = hqBody(319, 'US', 'US HQ 18th Abn Corps', '18 Abn');
    expect(body).toMatch(/class="hq-echelon"[^>]*>XXX</);
    expect(body).toMatch(/class="hq-designation"[^>]*>18 Abn</);
    expect(body).toMatch(/class="hq-rating"[^>]*>\d+-\d+</);
  });
});
