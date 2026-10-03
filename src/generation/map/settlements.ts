import { hexDistance, type DefinitionId, type HexId } from '../../core/index.js';
import type { HexsideId } from '../../domain/map/index.js';
import { fractalNoise2d } from './noise.js';
import {
  columnOf,
  definitionId,
  hexsideBetween,
  neighborCells,
  type GeneratedCell,
} from './internal.js';
import { mixUint32 } from './rng.js';
import type { NormalizedMapGenerationOptions } from './model.js';

export const CITY = definitionId('settlement:city');
export const TOWN = definitionId('settlement:town');
export const VILLAGE = definitionId('settlement:village');
const RIVER = 'edge:river';
const MAJOR_RIVER = 'edge:major-river';

/**
 * Settlement hierarchy at Beyond the Rhine scale (3.5-mile Hexes). Measured on the BtR map
 * (docs/generator/10-btr-scale-density.md): populated lowland carries a named place in roughly one
 * land Hex in nine, about half Minor Cities and half villages; forest and hills carry far fewer.
 * Major Cities are clusters of two or three Hexes and stand roughly a dozen Hexes apart.
 */
export const LAND_HEXES_PER_MAJOR_CITY = 450;
const MAJOR_CITY_SPACING = 9;
const TOWN_SHARE = 0.42;
const TOWN_SPACING = 3;
const VILLAGE_SPACING = 2;

/** Relative likelihood of a settlement by Hex terrain; densely farmed open ground is settled most. */
const TERRAIN_HABITABILITY: Readonly<Record<GeneratedCell['terrain'], number>> = {
  CLEAR: 1, WOODS: 0.4, ROUGH: 0.5, MARSH: 0.12, MOUNTAIN: 0, WATER: 0,
};

export interface GeneratedSettlement {
  readonly cell: GeneratedCell;
  readonly rank: 'CITY' | 'TOWN' | 'VILLAGE';
  /** Core Hex of the place; a Major City's extra Hexes point to the core. */
  readonly coreId: HexId;
}

const riverSides = (
  cell: GeneratedCell,
  cells: ReadonlyMap<HexId, GeneratedCell>,
  hexsides: ReadonlyMap<HexsideId, ReadonlySet<DefinitionId>>,
): { minor: number; major: number } => {
  let minor = 0;
  let major = 0;
  for (const other of neighborCells(cell, cells)) {
    const features = hexsides.get(hexsideBetween(cell.id, other.id));
    if (!features) continue;
    for (const feature of features) {
      if (String(feature) === MAJOR_RIVER) major += 1;
      else if (String(feature) === RIVER) minor += 1;
    }
  }
  return { minor, major };
};

export const selectSettlements = (
  cells: ReadonlyMap<HexId, GeneratedCell>,
  hexsides: ReadonlyMap<HexsideId, ReadonlySet<DefinitionId>>,
  options: NormalizedMapGenerationOptions,
): readonly GeneratedSettlement[] => {
  const land = [...cells.values()].filter(({ terrain }) => terrain !== 'WATER');
  const interior = (cell: GeneratedCell): boolean => columnOf(cell.coordinate) > 0 && columnOf(cell.coordinate) < options.width - 1
    && cell.coordinate.r > 0 && cell.coordinate.r < options.height - 1;
  const jitter = (cell: GeneratedCell, salt: number): number =>
    mixUint32(options.seed ^ salt ^ Math.imul(cell.coordinate.q + 1, 4099) ^ Math.imul(cell.coordinate.r + 1, 131)) / 0xffff_ffff;
  // A low-frequency "population" field gives settled lowlands and emptier districts, as on a real map.
  const population = (cell: GeneratedCell): number => fractalNoise2d(
    columnOf(cell.coordinate) / Math.max(1, options.width - 1) * 2.6 + 41,
    cell.coordinate.r / Math.max(1, options.height - 1) * 2.6 - 17,
    options.seed ^ 0x3c6ef372,
  );
  const scored = land
    .filter((cell) => TERRAIN_HABITABILITY[cell.terrain] > 0)
    .map((cell) => {
      const rivers = riverSides(cell, cells, hexsides);
      const habitability = TERRAIN_HABITABILITY[cell.terrain];
      return {
        cell,
        // Large places grow at river crossings and on open lowland.
        urban: habitability * 0.45 + population(cell) * 0.3 + Math.min(1, rivers.major) * 0.25
          + Math.min(1, rivers.minor) * 0.12 + (1 - cell.elevation) * 0.1 + jitter(cell, 0x1b873593) * 0.12,
        rural: habitability * 0.55 + population(cell) * 0.25 + Math.min(1, rivers.minor + rivers.major) * 0.06
          + jitter(cell, 0xcc9e2d51) * 0.35,
      };
    });
  const byId = (left: GeneratedCell, right: GeneratedCell): number => String(left.id).localeCompare(String(right.id));
  const taken: GeneratedSettlement[] = [];
  const farFrom = (cell: GeneratedCell, spacing: number, rank?: GeneratedSettlement['rank'][]): boolean =>
    taken.every((other) => (rank && !rank.includes(other.rank)) || hexDistance(other.cell.coordinate, cell.coordinate) >= spacing);

  const total = Math.max(4, Math.round(land.length * options.settlementDensity));
  const cityCount = Math.max(1, Math.round(land.length / LAND_HEXES_PER_MAJOR_CITY));
  const urban = [...scored].sort((left, right) => right.urban - left.urban || byId(left.cell, right.cell));
  const urbanScore = new Map(scored.map(({ cell, urban: score }) => [cell.id, score]));
  let cities = 0;
  for (const { cell } of urban) {
    if (cities >= cityCount) break;
    if (!interior(cell) || cell.terrain !== 'CLEAR' || !farFrom(cell, MAJOR_CITY_SPACING)) continue;
    taken.push({ cell, rank: 'CITY', coreId: cell.id });
    cities += 1;
    // Grow the built-up area onto one or two adjacent open Hexes, best-suited first.
    const extra = 1 + (jitter(cell, 0x85ebca6b) > 0.5 ? 1 : 0);
    neighborCells(cell, cells)
      .filter((next) => next.terrain === 'CLEAR' || next.terrain === 'WOODS')
      .sort((left, right) => (urbanScore.get(right.id) ?? 0) - (urbanScore.get(left.id) ?? 0) || byId(left, right))
      .slice(0, extra)
      .forEach((suburb) => taken.push({ cell: suburb, rank: 'CITY', coreId: cell.id }));
  }

  const townCount = Math.max(2, Math.round(total * TOWN_SHARE));
  let towns = 0;
  for (const { cell } of urban) {
    if (towns >= townCount) break;
    if (!interior(cell) || !farFrom(cell, TOWN_SPACING)) continue;
    taken.push({ cell, rank: 'TOWN', coreId: cell.id });
    towns += 1;
  }

  const rural = [...scored].sort((left, right) => right.rural - left.rural || byId(left.cell, right.cell));
  for (const { cell } of rural) {
    if (taken.length >= total) break;
    if (!farFrom(cell, VILLAGE_SPACING)) continue;
    taken.push({ cell, rank: 'VILLAGE', coreId: cell.id });
  }
  return taken;
};
