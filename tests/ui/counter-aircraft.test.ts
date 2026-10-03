import { describe, expect, it } from 'vitest';
import { AIR_COUNTER_CORPUS } from '../../src/generation/oob/air-corpus.js';
import { counterSvgBody } from '../../src/ui/counter.js';

const bodyOf = (designation: string): string => {
  const source = AIR_COUNTER_CORPUS.find((entry) => entry.designation === designation)!;
  return counterSvgBody({
    redacted: false, kind: 'aircraft', label: designation, nation: source.side === 'AXIS' ? 'GERMAN' : 'US', type: source.type,
    designation, airCombat: source.full[0], parenthesized: source.parenthesized, barrage: source.full[1], range: source.range,
    reduced: false, inactive: false,
  } as never);
};
const artOf = (body: string): string => body.match(/<g class="counter-symbol air-silhouette[^"]*">([\s\S]*?)<\/g>\s*<g class="counter-values">/)![1]!;

describe('air counters print the BTR aircraft art', () => {
  const designations = [...new Set(AIR_COUNTER_CORPUS.map(({ designation }) => designation))];

  it('draws each printed airframe with its own art (Fw-190a and Fw-190f share one airframe)', () => {
    const arts = new Map(designations.map((designation) => [designation, artOf(bodyOf(designation))]));
    expect(arts.get('Fw-190a')).toBe(arts.get('Fw-190f'));
    expect(new Set(arts.values()).size).toBe(designations.length - 1);
  });

  it('prints the finish of the counter: natural metal P-47/P-51, olive drab US bombers, Luftwaffe green', () => {
    expect(bodyOf('P-51')).toContain('air-silhouette paint-metal');
    expect(bodyOf('B-26')).toContain('air-silhouette paint-od');
    expect(bodyOf('Ju.88')).toContain('air-silhouette paint-luft');
  });

  it('marks Fighters with the triangle and tactical bombers with the oval badge', () => {
    expect(bodyOf('P-38')).toContain('air-badge fighter');
    expect(bodyOf('A-20')).toMatch(/<ellipse class="air-badge"/);
    expect(bodyOf('A-20')).toContain('>(2)<');
  });
});
