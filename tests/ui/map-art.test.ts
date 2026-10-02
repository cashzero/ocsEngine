import { describe, expect, it } from 'vitest';
import { generateRandomMap } from '../../src/index.js';
import { buildGeneratedMapPreview } from '../../src/ui/map-generator-presenter.js';
import {
  coastlineHtml, hexGridHtml, mapArtDefsHtml, placeNameFor, regionEdgesHtml, riversHtml, roadsHtml, settlementArtHtml, terrainFillHtml,
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

  it('fills woods with a seamless stipple instead of scattered glyphs', () => {
    expect(mapArtDefsHtml()).toContain('<pattern id="terrain-woods"');
    const woods = preview.cells.find(({ terrain }) => terrain === 'WOODS');
    expect(woods).toBeDefined();
    expect(terrainGlyphsHtml(woods!, 50)).toBe('');
  });

  it('draws mountains and hills as shaded relief, not symbols', () => {
    const defs = mapArtDefsHtml();
    expect(defs).toMatch(/<pattern id="terrain-mountain"[^>]*>.*filter="url\(#terrain-mountain-relief\)"/u);
    expect(defs).toMatch(/<pattern id="terrain-rough"[^>]*>.*filter="url\(#terrain-rough-relief\)"/u);
    expect(defs).toContain('stitchTiles="stitch"');
    const relief = (['MOUNTAIN', 'ROUGH'] as const).map((terrain) => ({ ...preview.cells[0]!, terrain }));
    relief.forEach((cell) => expect(terrainGlyphsHtml(cell, 50)).toBe(''));
  });

  it('draws one curved road and one river per feature, keeping the class contract', () => {
    const roadCount = preview.edges.filter(({ kind }) => kind.endsWith('ROAD')).length;
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
