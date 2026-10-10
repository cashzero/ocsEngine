import { hexDistance, type HexId } from '../../core/index.js';
import { definitionId, neighborCells, type GeneratedCell } from './internal.js';
import type { NormalizedMapGenerationOptions } from './model.js';
import type { GeneratedSettlement } from './settlements.js';

/** A port printed on the map (19.0): a fixed map feature of the Hex, not a piece. */
export const PORT = definitionId('facility:port');

/**
 * Printed port capacity (19.0a) in Tokens, the most SP it loads and unloads in a phase: a Major City's harbour 4 SP,
 * a town's 2 SP, a village's 1 SP.
 */
export const PORT_CAPACITY_TOKENS: Readonly<Record<GeneratedSettlement['rank'], number>> = { CITY: 16, TOWN: 8, VILLAGE: 4 };

/** Coastal land Hexes per port. */
const COAST_HEXES_PER_PORT = 10;
const MAXIMUM_PORTS = 4;
/** Fewest Hexes between two ports while candidates allow it. */
const PORT_SPACING = 6;
const RANK_ORDER: Readonly<Record<GeneratedSettlement['rank'], number>> = { CITY: 0, TOWN: 1, VILLAGE: 2 };

const coastal = (cell: GeneratedCell, cells: ReadonlyMap<HexId, GeneratedCell>): boolean =>
  cell.terrain !== 'WATER' && neighborCells(cell, cells).some(({ terrain }) => terrain === 'WATER');

/**
 * Ports in coastal places (19.0): towns and Major Cities on the shore first, villages after them, spread along the
 * coast by farthest-point sampling. A flank sea gets at least two so the coast on both sides of the front has one;
 * any other sea at least one. When the coast has too few places, a coastal open Hex becomes a town with the port,
 * and the town is returned so roads and railways reach it like any other.
 */
export const selectPorts = (
  cells: ReadonlyMap<HexId, GeneratedCell>,
  settlements: readonly GeneratedSettlement[],
  options: NormalizedMapGenerationOptions,
): { readonly ports: readonly { readonly cell: GeneratedCell; readonly capacityTokens: number }[]; readonly addedTowns: readonly GeneratedSettlement[] } => {
  if (options.sea === 'NONE') return { ports: [], addedTowns: [] };
  const coast = [...cells.values()].filter((cell) => coastal(cell, cells));
  const count = Math.max(options.sea === 'NORTH' ? 2 : 1, Math.min(MAXIMUM_PORTS, Math.round(coast.length / COAST_HEXES_PER_PORT)));
  const byId = (left: GeneratedCell, right: GeneratedCell): number => String(left.id).localeCompare(String(right.id));
  // A Major City counts once, at whichever of its Hexes touches the sea.
  const places = settlements.filter(({ cell }) => coastal(cell, cells))
    .sort((left, right) => RANK_ORDER[left.rank] - RANK_ORDER[right.rank] || byId(left.cell, right.cell))
    .filter((place, index, sorted) => sorted.findIndex(({ coreId }) => coreId === place.coreId) === index);
  const chosen: GeneratedCell[] = [];
  // The first port goes nearest the middle of the map, each later one farthest from those already chosen.
  const centre = { column: (options.width - 1) / 2, r: (options.height - 1) / 2 };
  const spread = (cell: GeneratedCell): number => (chosen.length > 0 ? minimumDistance(chosen, cell)
    : -Math.hypot(cell.coordinate.q + Math.floor(cell.coordinate.r / 2) - centre.column, cell.coordinate.r - centre.r));
  const far = (cell: GeneratedCell, spacing: number): boolean =>
    chosen.every((other) => hexDistance(other.coordinate, cell.coordinate) >= spacing);
  for (const spacing of [PORT_SPACING, 3]) {
    for (const rank of ['CITY', 'TOWN', 'VILLAGE'] as const) {
      const pool = places.filter((place) => place.rank === rank).map(({ cell }) => cell);
      while (chosen.length < count) {
        const best = pool.filter((cell) => !chosen.includes(cell) && far(cell, spacing))
          .sort((left, right) => spread(right) - spread(left) || byId(left, right))[0];
        if (!best) break;
        chosen.push(best);
      }
    }
  }
  const addedTowns: GeneratedSettlement[] = [];
  const settled = new Set(settlements.map(({ cell }) => cell.id));
  while (chosen.length < count) {
    const site = coast.filter((cell) => (cell.terrain === 'CLEAR' || cell.terrain === 'WOODS') && !settled.has(cell.id)
      && cell.coordinate.r > 0 && cell.coordinate.r < options.height - 1 && far(cell, 3)
      && settlements.every(({ cell: other }) => hexDistance(other.coordinate, cell.coordinate) >= 2))
      .sort((left, right) => spread(right) - spread(left) || byId(left, right))[0];
    if (!site) break;
    chosen.push(site);
    settled.add(site.id);
    addedTowns.push({ cell: site, rank: 'TOWN', coreId: site.id });
  }
  const rankOf = new Map([...settlements, ...addedTowns].map(({ cell, rank }) => [cell.id, rank] as const));
  return { ports: chosen.map((cell) => ({ cell, capacityTokens: PORT_CAPACITY_TOKENS[rankOf.get(cell.id) ?? 'TOWN'] })), addedTowns };
};

const minimumDistance = (chosen: readonly GeneratedCell[], cell: GeneratedCell): number =>
  chosen.length === 0 ? 0 : Math.min(...chosen.map((other) => hexDistance(other.coordinate, cell.coordinate)));
