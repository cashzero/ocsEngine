// @vitest-environment happy-dom
import { render } from 'lit-html';
import { describe, expect, it } from 'vitest';
import { airSentences, emphasizeAir } from '../../src/ui/air-text.js';

const marked = (line: string): [string, string][] => {
  const host = document.createElement('div');
  render(emphasizeAir(line), host);
  return [...host.querySelectorAll('b')].map((node) => [node.className, node.textContent ?? '']);
};

describe('air combat text emphasis', () => {
  it('marks both aircraft, the modified roll and the cost of a combat round', () => {
    expect(marked('P-38 vs Fw-190a: 9 (roll 8), Fw-190a aborts and loses a step.')).toEqual([
      ['air-name', 'P-38'], ['air-name', 'Fw-190a'], ['air-num', '9'], ['air-num', '(roll 8)'], ['air-name', 'Fw-190a'], ['air-abort', 'aborts'], ['air-loss', 'loses a step'],
    ]);
    expect(marked('P-38 vs Bf.109: 7 (roll 5), both abort.').map(([kind]) => kind)).toContain('air-abort');
  });

  it('marks Flak, interception outcomes and losses', () => {
    expect(marked('Flak: 10 (roll 9 +1), no effect.')).toEqual([['air-term', 'Flak'], ['air-num', '10'], ['air-num', '(roll 9 +1)'], ['air-ok', 'no effect']]);
    expect(marked('Fw-190a wins the interception and stays Active.')).toEqual([['air-name', 'Fw-190a'], ['air-ok', 'wins the interception'], ['air-ok', 'stays Active']]);
    expect(marked('A-20 is destroyed by Flak.')).toEqual([['air-name', 'A-20'], ['air-loss', 'is destroyed'], ['air-term', 'Flak']]);
  });

  it('marks the aircraft and rating in decision prompts and option labels', () => {
    expect(marked('Abort P-38 (Air Combat 8, reduced)')).toEqual([['air-abort', 'Abort'], ['air-name', 'P-38'], ['air-num', '(Air Combat 8, reduced)']]);
    expect(marked('Air Combat round 2: Ju.88 (Air Combat (2)) attacks. Choose the aircraft that meets it.').map(([, word]) => word)).toContain('Ju.88');
  });

  it('marks the base an aircraft took off from in the return choice', () => {
    expect(marked('Original Air Base at 0412 (6 hexes)')).toEqual([['air-ok', 'Original Air Base']]);
    expect(marked('choose a friendly Air Base within 114 hexes of 0808. It took off from 0412.')).toEqual([['air-ok', 'It took off from 0412']]);
  });

  it('leaves unrelated text alone and splits a joined result into sentences', () => {
    expect(marked('Nothing to see here.')).toEqual([]);
    expect(airSentences('Fw-190a intercepts. Flak: 9 (roll 9), no effect. P-38 is reduced by Flak.')).toHaveLength(3);
  });
});
