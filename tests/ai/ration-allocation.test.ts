import { describe, expect, it } from 'vitest';
import type { PieceId } from '../../src/core/index.js';
import { assignRations, type RationDemand, type RationSource } from '../../src/rules/supply/ration-budget.js';

const id = (s: string) => s as PieceId;
const demand = (name: string, ticks: number, sources: string[]): RationDemand => ({ id: id(name), ticks, sources: sources.map(id) });
const stock = (name: string, tokens: number): RationSource => ({ id: id(name), tokens });

describe('shared ration allocation under actual grouped rounding', () => {
  it('feeds two 1 RE units with one token from a common source', () => {
    const result = assignRations([demand('a', 4, ['s']), demand('b', 4, ['s'])], [stock('s', 1)]);
    expect(result.groups).toEqual([{ sourcePieceId: 's', pieceIds: ['a', 'b'], tokens: 1 }]);
  });

  it('reserves the only accessible source for a constrained consumer', () => {
    const result = assignRations([demand('a', 8, ['s', 't']), demand('b', 8, ['s'])], [stock('s', 1), stock('t', 1)]);
    expect(result.groups).toEqual([{ sourcePieceId: 's', pieceIds: ['b'], tokens: 1 }, { sourcePieceId: 't', pieceIds: ['a'], tokens: 1 }]);
  });

  it('cannot split one consumer across two sources or round across different sources', () => {
    expect(assignRations([demand('a', 12, ['s', 't'])], [stock('s', 1), stock('t', 1)]).groups).toBeNull();
    expect(assignRations([demand('a', 4, ['s']), demand('b', 4, ['t'])], [stock('s', 1), stock('t', 0)]).groups).toBeNull();
  });

  it('labels a search cutoff unknown without inventing a feasible allocation', () => {
    expect(assignRations([demand('a', 4, ['s'])], [stock('s', 1)], 0)).toEqual({ groups: null, exhausted: true });
  });

  it('agrees with exhaustive source assignments for 500 deterministic small networks', () => {
    let seed = 13;
    const random = (max: number) => { seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0; return (seed >>> 16) % max; };
    for (let sample = 0; sample < 500; sample++) {
      const sources = Array.from({ length: 3 }, (_, i) => stock(`s${i}`, random(3)));
      const units = Array.from({ length: 5 }, (_, i) => demand(`u${i}`, random(13), sources.filter(() => random(2)).map(s => s.id)));
      const brute = (index: number, groups: RationDemand[][]): boolean => {
        if (index === units.length) return groups.every((group, i) => !group.length
          || Math.max(1, Math.ceil(group.reduce((sum, unit) => sum + unit.ticks, 0) / 8)) <= sources[i]!.tokens);
        return sources.some((source, i) => units[index]!.sources.includes(source.id)
          && brute(index + 1, groups.map((g, j) => i === j ? [...g, units[index]!] : g)));
      };
      const result = assignRations(units, sources);
      expect(result.exhausted).toBe(false);
      expect(result.groups !== null).toBe(brute(0, sources.map(() => [])));
      if (result.groups) {
        expect(result.groups.flatMap(g => g.pieceIds).sort()).toEqual(units.map(d => d.id).sort());
        for (const group of result.groups) {
          expect(group.tokens).toBeLessThanOrEqual(sources.find(s => s.id === group.sourcePieceId)!.tokens);
          expect(group.pieceIds.every(member => units.find(d => d.id === member)!.sources.includes(group.sourcePieceId))).toBe(true);
        }
      }
    }
  });
});
