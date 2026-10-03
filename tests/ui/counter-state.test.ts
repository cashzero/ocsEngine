import { describe, expect, it } from 'vitest';
import { parseDefinitionId } from '../../src/core/index.js';
import type { PieceDefinition } from '../../src/domain/piece/index.js';
import { corpusCounter, corpusFaces } from '../../src/generation/oob/counter-corpus.js';
import { counterSvgBody, counterView } from '../../src/ui/counter.js';

const id = parseDefinitionId('test:state-flags');
if (!id.ok) throw new Error('Valid test id.');
const definition = { id: id.value, name: 'Division', family: 'GROUND', counter: corpusCounter(826, '82.Abn', '', 'GERMAN', null), faces: corpusFaces(826), capabilities: [] } as unknown as PieceDefinition;
const bodyOf = (mode: string | null, statuses: string[]): string => counterSvgBody(counterView(definition, {
  currentFaceId: definition.faces[0]!.id, remainingSteps: null, resourceQuantity: null, mode, statuses, redacted: false,
} as never));

describe('counter state flags', () => {
  it('prints nothing for a unit in Move or Combat mode with no status', () => {
    for (const mode of [null, 'MOVE', 'COMBAT']) {
      const body = bodyOf(mode, []);
      expect(body).not.toContain('counter-state');
      expect(body).not.toContain('counter-frame');
    }
  });

  it('gives a Disorganized unit a red segment, a frame and a hatch on the body', () => {
    const body = bodyOf('DG', []);
    expect(body).toContain('counter-flag-dg');
    expect(body).toContain('counter-frame-dg');
    expect(body).toContain('counter-dg-hatch');
    expect(body).toContain('>DG<');
  });

  it('gives an out-of-supply unit its own segment and a dashed frame', () => {
    const body = bodyOf(null, ['status:out-of-supply']);
    expect(body).toContain('counter-flag-oos');
    expect(body).toContain('counter-frame-oos');
    expect(body).not.toContain('counter-frame-dg');
  });

  it('splits the strip into one segment per flag instead of joining their text', () => {
    const body = bodyOf('DG', ['status:out-of-supply']);
    expect(body).toContain('counter-flag-dg');
    expect(body).toContain('counter-flag-oos');
    expect(body).not.toContain('DG · OOS');
  });

  it.each([['RESERVE', 'res', 'RES'], ['STRAT', 'strat', 'STRAT'], ['EXPLOITATION', 'exp', 'EXP']] as const)('flags %s mode without marking the body', (mode, key, label) => {
    const body = bodyOf(mode, []);
    expect(body).toContain(`counter-flag-${key}`);
    expect(body).toContain(`>${label}<`);
    expect(body).not.toContain('counter-frame');
  });
});
