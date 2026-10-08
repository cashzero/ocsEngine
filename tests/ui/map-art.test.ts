import { describe, expect, it } from 'vitest';
import { generateRandomMap } from '../../src/index.js';
import { buildGeneratedMapPreview } from '../../src/ui/map-generator-presenter.js';
import {
  coastlineHtml, hexGridHtml, mapArtDefsHtml, placeNameFor, railStrokes, regionEdgesHtml, riversHtml, roadStrokes, roadsHtml, settlementArtHtml, terrainFillHtml,
  terrainGlyphsHtml,
} from '../../src/ui/map-art.js';

const preview = (() => {
  const generated = generateRandomMap({ width: 18, height: 12, seed: 1943, style: 'MEDITERRANEAN_COAST' });
  if (!generated.ok) throw new Error('map generation failed');
  return buildGeneratedMapPreview(generated.value, 50);
})();

describe('printed-map artwork', () => {
  it('draws the same art for the same generated map', () => {
    const draw = (): string => preview.cells.map((cell) => terrainGlyphsHtml(cell, 50) + settlementArtHtml(cell, 50)).join('')
      + riversHtml(preview.edges, 50, 'map-edge') + roadsHtml(preview.edges, preview.cells, 50, 'map-edge');
    expect(draw()).toBe(draw());
  });

  it('draws one curved road and one river per feature, keeping the class contract', () => {
    const exits = roadStrokes(preview.edges, preview.cells, 50).filter(({ exit }) => exit).length;
    const roadCount = preview.edges.filter(({ kind }) => kind.endsWith('ROAD')).length + exits;
    const riverCount = preview.edges.filter(({ kind }) => kind.endsWith('RIVER')).length;
    const roads = roadsHtml(preview.edges, preview.cells, 50, 'map-edge');
    const rivers = riversHtml(preview.edges, 50, 'map-edge');
    expect(roads.match(/class="map-edge (road|primary-road)"/gu)).toHaveLength(roadCount);
    expect(roads).toMatch(/d="M[\d.]+ [\d.]+C/u);
    expect(rivers.match(/class="map-edge (river|major-river)"/gu)).toHaveLength(riverCount);
  });

  it('runs roads exactly through settlement centres', () => {
    const roads = roadsHtml(preview.edges, preview.cells, 50, 'map-edge');
    const settled = preview.cells.filter(({ settlement, x, y }) => settlement
      && preview.edges.some((edge) => edge.kind.endsWith('ROAD') && edge.x1 === x && edge.y1 === y));
    expect(settled.length).toBeGreaterThan(0);
    settled.forEach(({ x, y }) => expect(roads).toContain(`M${x.toFixed(1)} ${y.toFixed(1)}C`));
  });

  it('rounds railway bends and never lays the track along a road that shares its hexside', () => {
    const cubic = (d: string): number[] => d.match(/-?[\d.]+/gu)!.map(Number);
    const sample = (d: string): { x: number; y: number }[] => {
      const [x0, y0, x1, y1, x2, y2, x3, y3] = cubic(d) as [number, number, number, number, number, number, number, number];
      return Array.from({ length: 21 }, (_, index) => {
        const t = index / 20;
        const s = 1 - t;
        return {
          x: s * s * s * x0 + 3 * s * s * t * x1 + 3 * s * t * t * x2 + t * t * t * x3,
          y: s * s * s * y0 + 3 * s * s * t * y1 + 3 * s * t * t * y2 + t * t * t * y3,
        };
      });
    };
    const pair = ({ x1, y1, x2, y2 }: { x1: number; y1: number; x2: number; y2: number }): string =>
      [`${x1},${y1}`, `${x2},${y2}`].sort().join('|');
    const railEdges = preview.edges.filter(({ kind }) => kind.endsWith('RAIL'))
      .sort((first, second) => Number(first.kind === 'MULTI_RAIL') - Number(second.kind === 'MULTI_RAIL'));
    const roadEdges = preview.edges.filter(({ kind }) => kind.endsWith('ROAD'))
      .sort((first, second) => Number(first.kind === 'PRIMARY_ROAD') - Number(second.kind === 'PRIMARY_ROAD'));
    const rails = railStrokes(preview.edges, preview.cells, 50).filter(({ exit }) => !exit);
    const roads = new Map(roadStrokes(preview.edges, preview.cells, 50).filter(({ exit }) => !exit).map(({ d }, index) => [pair(roadEdges[index]!), d]));
    expect(rails).toHaveLength(railEdges.length);
    rails.forEach(({ line }) => expect(line).toMatch(/^M[\d.]+ [\d.]+C/u));
    // The track never passes through a hex centre: it keeps to one side.
    railEdges.forEach(({ x1, y1 }, index) => {
      const [x, y] = cubic(rails[index]!.line);
      expect(Math.hypot(x! - x1, y! - y1)).toBeGreaterThan(50 * 0.3);
    });
    const shared = railEdges.map((edge, index) => ({ rail: rails[index]!.line, road: roads.get(pair(edge)) }))
      .filter((entry): entry is { rail: string; road: string } => entry.road !== undefined);
    expect(shared.length).toBeGreaterThan(0);
    // The track may cross a road, but never lies on it: at most part of a hexside runs inside the road's drawn
    // casing (a primary road's half-width, 5.2 at hex size 36).
    const casing = 5.2 * 50 / 36;
    shared.forEach(({ rail, road }) => {
      const roadPoints = sample(road);
      const onRoad = sample(rail).filter(({ x, y }) => roadPoints.some((point) => Math.hypot(point.x - x, point.y - y) < casing));
      expect(onRoad.length / 21).toBeLessThan(0.5);
    });
  });

  it('runs roads and railways that leave the map on to the map edge', () => {
    const size = 50;
    const near = (x: number, y: number, within: number): boolean => preview.cells.some((cell) => Math.hypot(cell.x - x, cell.y - y) < within);
    const onBorder = (cell: { x: number; y: number }): boolean => Array.from({ length: 6 }, (_, index) => index * Math.PI / 3)
      .some((angle) => !near(cell.x + Math.cos(angle) * size * Math.sqrt(3), cell.y + Math.sin(angle) * size * Math.sqrt(3), size * 0.5));
    const end = (d: string): { x: number; y: number } => { const values = d.match(/-?[\d.]+/gu)!.map(Number); return { x: values.at(-2)!, y: values.at(-1)! }; };
    const lines = [
      { edges: preview.edges.filter(({ kind }) => kind.endsWith('ROAD')), exits: roadStrokes(preview.edges, preview.cells, size).filter(({ exit }) => exit).map(({ d }) => d) },
      { edges: preview.edges.filter(({ kind }) => kind.endsWith('RAIL')), exits: railStrokes(preview.edges, preview.cells, size).filter(({ exit }) => exit).map(({ line }) => line) },
    ];
    lines.forEach(({ edges, exits }) => {
      // Every line ending in a border hex, and every entry hex it reaches, leaves the map.
      const leaving = preview.cells.filter((cell) => {
        const degree = edges.filter(({ x1, y1, x2, y2 }) => (x1 === cell.x && y1 === cell.y) || (x2 === cell.x && y2 === cell.y)).length;
        return onBorder(cell) && (degree === 1 || (degree > 1 && cell.strategic !== null));
      });
      expect(leaving.length).toBeGreaterThan(0);
      expect(exits).toHaveLength(leaving.length);
      // Each is drawn to the outer hexside of a border hex: half a hex row beyond it lies no hex.
      exits.forEach((d) => {
        const { x, y } = end(d);
        const cell = preview.cells.reduce((best, other) => (Math.hypot(other.x - x, other.y - y) < Math.hypot(best.x - x, best.y - y) ? other : best));
        expect(Math.hypot(cell.x - x, cell.y - y)).toBeGreaterThan(size * 0.7);
        // Within the hexside, whose corners are nudged up to 0.11 hex (JITTER).
        expect(Math.hypot(cell.x - x, cell.y - y)).toBeLessThan(size * 1.12);
        expect(near(2 * x - cell.x, 2 * y - cell.y, size * 0.5)).toBe(false);
      });
    });
  });

  it('nudges fill corners identically for neighbouring hexes so the ground tiles without gaps', () => {
    const corners = (html: string): string[] => html.match(/points="([^"]+)"/u)![1]!.split(' ');
    const first = preview.cells[0]!;
    const neighbour = preview.cells.find((cell) => cell !== first && Math.hypot(cell.x - first.x, cell.y - first.y) < 50 * 1.8)!;
    const shared = corners(terrainFillHtml(first, 50)).filter((corner) => corners(terrainFillHtml(neighbour, 50)).includes(corner));
    expect(shared).toHaveLength(2);
    // Corners move, but only a little: the polygon stays recognisably a hex.
    const [x, y] = corners(terrainFillHtml(first, 50))[0]!.split(',').map(Number);
    expect(Math.hypot(x! - first.x - 50 * Math.cos(-Math.PI / 6), y! - first.y - 50 * Math.sin(-Math.PI / 6))).toBeLessThan(50 * 0.2);
  });

  it('draws the hex grid as one path with every hexside once', () => {
    const grid = hexGridHtml(preview.cells, 50);
    expect(grid.match(/class="hex-grid"/gu)).toHaveLength(1);
    const sides = grid.match(/M/gu)!.length;
    expect(sides).toBeLessThan(preview.cells.length * 6);
    expect(sides).toBeGreaterThan(preview.cells.length * 3);
  });

  it('fringes forests and rough ground where they meet other ground', () => {
    const edges = regionEdgesHtml(preview.cells, 50);
    expect(edges).toContain('class="region-edge woods"');
    expect(regionEdgesHtml(preview.cells.map((cell) => ({ ...cell, terrain: 'CLEAR' as const })), 50)).toBe('');
  });

  it('names cities and towns but leaves villages unlabelled', () => {
    const settle = (settlement: 'CITY' | 'TOWN' | 'VILLAGE'): string => settlementArtHtml({ ...preview.cells[0]!, settlement }, 50);
    expect(settle('CITY')).toContain('class="place-name city"');
    expect(settle('TOWN')).toContain('class="place-name town"');
    expect(settle('VILLAGE')).not.toContain('place-name');
    expect(placeNameFor('3,4')).toBe(placeNameFor('3,4'));
  });

  it('outlines the coast where water meets land', () => {
    expect(coastlineHtml(preview.cells, 50)).toContain('class="coastline"');
    expect(coastlineHtml(preview.cells.filter(({ terrain }) => terrain !== 'WATER'), 50)).toBe('');
  });
});
