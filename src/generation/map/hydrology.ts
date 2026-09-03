import type { DefinitionId, HexId } from '../../core/index.js';
import type { HexsideId } from '../../domain/map/index.js';
import { createSeededRandom } from './rng.js';
import {
  addHexsideFeature,
  definitionId,
  neighborCells,
  type GeneratedCell,
} from './internal.js';
import type { NormalizedMapGenerationOptions } from './model.js';

const RIVER = definitionId('edge:river');
const MAJOR_RIVER = definitionId('edge:major-river');

const edgeDistance = (cell: GeneratedCell, width: number, height: number): number =>
  Math.min(cell.coordinate.q, width - 1 - cell.coordinate.q, cell.coordinate.r, height - 1 - cell.coordinate.r);

export const generateHydrology = (
  cells: ReadonlyMap<HexId, GeneratedCell>,
  hexsides: Map<HexsideId, Set<DefinitionId>>,
  options: NormalizedMapGenerationOptions,
): void => {
  const rng = createSeededRandom(options.seed ^ 0x6a09e667);
  const starts = [...cells.values()]
    .filter(({ terrain, coordinate }) => terrain !== 'WATER'
      && coordinate.q > 1 && coordinate.q < options.width - 2
      && coordinate.r > 1 && coordinate.r < options.height - 2)
    .sort((left, right) => right.elevation - left.elevation || String(left.id).localeCompare(String(right.id)));
  const riverCount = Math.max(1, Math.min(5, Math.floor(options.width * options.height / 120) + 1));
  const usedStarts: GeneratedCell[] = [];
  for (const candidate of starts) {
    if (usedStarts.length >= riverCount) break;
    if (usedStarts.some((other) => Math.abs(other.coordinate.q - candidate.coordinate.q)
      + Math.abs(other.coordinate.r - candidate.coordinate.r) < 5)) continue;
    usedStarts.push(candidate);
  }

  usedStarts.forEach((start, riverIndex) => {
    let current = start;
    const visited = new Set<string>([current.id]);
    const maximumSteps = options.width + options.height;
    for (let step = 0; step < maximumSteps; step += 1) {
      const candidates = neighborCells(current, cells)
        .filter((next) => !visited.has(next.id))
        .map((next) => ({
          next,
          score: next.terrain === 'WATER' ? -2
            : next.elevation * 0.55
              + edgeDistance(next, options.width, options.height) * 0.08
              + rng.next() * 0.08,
        }))
        .sort((left, right) => left.score - right.score || String(left.next.id).localeCompare(String(right.next.id)));
      const selected = candidates[0]?.next;
      if (!selected) break;
      addHexsideFeature(hexsides, current.id, selected.id, riverIndex === 0 && step > 1 ? MAJOR_RIVER : RIVER);
      visited.add(selected.id);
      current = selected;
      if (selected.terrain === 'WATER' || edgeDistance(selected, options.width, options.height) === 0) break;
    }
  });
};
