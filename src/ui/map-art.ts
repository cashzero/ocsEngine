import type { GeneratedMapPreviewCell, GeneratedMapPreviewEdge } from './map-generator-presenter.js';

/**
 * Printed-map artwork shared by the theater map and the New Game preview.
 * Every decoration is derived deterministically from Hex IDs, so the same
 * generated package always draws the same map.
 */

/** Glyphs are authored for a 50-unit hex and scaled to the layout's hex size. */
const GLYPH_HEX_SIZE = 50;

const hash = (value: string): number => {
  let state = 2166136261;
  for (let index = 0; index < value.length; index += 1) {
    state ^= value.charCodeAt(index);
    state = Math.imul(state, 16777619);
  }
  return state >>> 0;
};

/** Mulberry32 seeded by a string; cosmetic only, never used by rules. */
const seeded = (seed: string): (() => number) => {
  let state = hash(seed);
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let value = state;
    value = Math.imul(value ^ (value >>> 15), value | 1);
    value ^= value + Math.imul(value ^ (value >>> 7), value | 61);
    return ((value ^ (value >>> 14)) >>> 0) / 4294967296;
  };
};

const fixed = (value: number): string => value.toFixed(1);

/** Crown layout for one canopy tile; crowns that cross the tile edge are repeated so the fill is seamless. */
const CANOPY_TILE = { width: 42, height: 36 } as const;
const CANOPY_CROWNS: readonly (readonly [number, number, number])[] = [
  [8, 8, 9.5], [27, 5, 10], [40, 13, 9], [17, 20, 11], [33, 25, 9.5], [5, 29, 9.5], [24, 35, 9],
];

const woodsCanopyPattern = (): string => {
  const { width, height } = CANOPY_TILE;
  const crowns = CANOPY_CROWNS.flatMap(([x, y, r]) => [-1, 0, 1].flatMap((dx) => [-1, 0, 1].map((dy) => [x + dx * width, y + dy * height, r] as const)))
    .filter(([x, y, r]) => x + r + 2 > 0 && x - r - 2 < width && y + r + 3 > 0 && y - r - 2 < height)
    .sort((first, second) => first[1] - second[1]);
  const shapes = crowns.map(([x, y, r]) =>
    `<circle cx="${fixed(x + 1.5)}" cy="${fixed(y + 2.5)}" r="${fixed(r)}" fill="#1f3019" opacity=".5"/>`
    + `<circle cx="${fixed(x)}" cy="${fixed(y)}" r="${fixed(r)}" fill="#567a42" stroke="#30492a" stroke-width=".9"/>`
    + `<circle cx="${fixed(x - r * 0.3)}" cy="${fixed(y - r * 0.32)}" r="${fixed(r * 0.48)}" fill="#6e9353"/>`
    + `<circle cx="${fixed(x - r * 0.42)}" cy="${fixed(y - r * 0.45)}" r="${fixed(r * 0.18)}" fill="#93b276"/>`).join('');
  return `<pattern id="terrain-woods" width="${width}" height="${height}" patternUnits="userSpaceOnUse"><rect width="${width}" height="${height}" fill="#2f4529"/>${shapes}</pattern>`;
};

/**
 * Mountains and hills are shaded relief, not symbols: a stitched (seamlessly
 * tiling) fractal height field lit from the north-west and tinted with the
 * ground colour. Mountains are rugged with snow on the highest ground; hills roll.
 */
const reliefPattern = (id: string, options: {
  readonly size: number; readonly frequency: number; readonly octaves: number; readonly seed: number;
  readonly relief: number; readonly elevation: number; readonly light: string; readonly tint: string; readonly ridged?: boolean;
}): string => {
  const { size } = options;
  // Lighting reads height from alpha. Inverted turbulence turns its creases into sharp ridgelines.
  const height = options.ridged
    ? `<feTurbulence type="turbulence" baseFrequency="${options.frequency}" numOctaves="${options.octaves}" seed="${options.seed}" stitchTiles="stitch" result="noise"/>`
      + `<feComponentTransfer in="noise" result="height"><feFuncA type="table" tableValues="1 .55 0"/></feComponentTransfer>`
    : `<feTurbulence type="fractalNoise" baseFrequency="${options.frequency}" numOctaves="${options.octaves}" seed="${options.seed}" stitchTiles="stitch" result="height"/>`;
  // Snow lies only on the highest ridges of ridged relief.
  const snow = options.ridged
    ? `<feColorMatrix in="height" type="matrix" values="0 0 0 0 1  0 0 0 0 1  0 0 0 0 1  0 0 0 6 -5.2" result="peaks"/>`
      + `<feComposite in="peaks" in2="light" operator="arithmetic" k1=".55" k2=".35" result="snowcap"/>`
      + `<feMerge><feMergeNode in="shaded"/><feMergeNode in="snowcap"/></feMerge>` : '';
  return `<filter id="${id}-relief" x="0" y="0" width="1" height="1" color-interpolation-filters="sRGB">${height}`
    + `<feDiffuseLighting in="height" surfaceScale="${options.relief}" diffuseConstant="${fixed(1 / Math.sin(options.elevation * Math.PI / 180))}" lighting-color="${options.light}" result="light">`
    + `<feDistantLight azimuth="225" elevation="${options.elevation}"/></feDiffuseLighting>`
    + `<feFlood flood-color="${options.tint}" result="tint"/>`
    + `<feBlend in="light" in2="tint" mode="multiply" result="shaded"/>${snow}</filter>`
    + `<pattern id="${id}" width="${size}" height="${size}" patternUnits="userSpaceOnUse">`
    + `<rect width="${size}" height="${size}" filter="url(#${id}-relief)"/></pattern>`;
};

export const mapArtDefsHtml = (): string => `<defs>
  <pattern id="terrain-clear" width="28" height="24" patternUnits="userSpaceOnUse"><rect width="28" height="24" fill="#b7b083"/><path d="M4 7h1M17 4h1M11 16h1M23 19h1" stroke="#9c9467" stroke-width="1.4" stroke-linecap="round"/></pattern>
  ${woodsCanopyPattern()}
  ${reliefPattern('terrain-rough', { size: 200, frequency: 0.035, octaves: 2, seed: 5, relief: 3, elevation: 58, light: '#fff6e2', tint: '#d2b886' })}
  ${reliefPattern('terrain-mountain', { size: 240, frequency: 0.0125, octaves: 4, seed: 11, relief: 9, elevation: 40, light: '#fbf4e6', tint: '#b6a78e', ridged: true })}
  <pattern id="terrain-marsh" width="24" height="16" patternUnits="userSpaceOnUse"><rect width="24" height="16" fill="#98aa8c"/><path d="M2 5h6M14 12h7" stroke="#7aa3b4" stroke-width="1.3" stroke-linecap="round"/></pattern>
  <pattern id="terrain-water" width="30" height="20" patternUnits="userSpaceOnUse"><rect width="30" height="20" fill="#6d9fbf"/><path d="M2 6q3-2.5 6 0t6 0M16 15q3-2.5 6 0t6 0" fill="none" stroke="#9cc6de" stroke-width="1.1" stroke-linecap="round"/></pattern>
  <g id="glyph-reed" fill="none" stroke-linecap="round"><path d="M-9 6h7M3 6h7" stroke="#4f86a3" stroke-width="1.4"/><path d="M-3 4v-8M0 4v-11M3 4v-7M-6 4l-2-5M6 4l2-5" stroke="#3b5a35" stroke-width="1.3"/></g>
  <g id="glyph-wave"><path d="M-10 0q2.5-3.5 5 0t5 0 5 0 5 0" fill="none" stroke="#d5ecf7" stroke-width="1.5" stroke-linecap="round"/></g>
  <g id="glyph-grass"><path d="M-3 2l-1-4M0 2v-5M3 2l1-4" fill="none" stroke="#857d52" stroke-width="1.1" stroke-linecap="round"/></g>
</defs>`;

type Placement = { readonly x: number; readonly y: number; readonly scale: number };

/** Scatter glyph positions inside a disc of the hex, drawn back to front. */
const scatter = (random: () => number, count: number, radius: number, scale: () => number): Placement[] =>
  Array.from({ length: count }, (_, index) => {
    const angle = (index / count + random() * 0.6) * Math.PI * 2;
    const distance = radius * Math.sqrt(0.15 + random() * 0.85);
    return { x: Math.cos(angle) * distance, y: Math.sin(angle) * distance * 0.85, scale: scale() };
  }).sort((first, second) => first.y - second.y);

const glyphPlan = (cell: GeneratedMapPreviewCell, random: () => number): { glyph: string; placements: Placement[] } | null => {
  switch (cell.terrain) {
    // Woods are drawn by the seamless canopy fill so adjacent woods hexes merge into one forest.
    case 'WOODS': return null;
    // Mountains are drawn by the seamless range fill so adjacent mountain hexes merge into one massif.
    case 'MOUNTAIN': return null;
    // Rough ground is drawn by its relief fill.
    case 'ROUGH': return null;
    case 'MARSH': return { glyph: 'glyph-reed', placements: scatter(random, 3, 18, () => 0.9 + random() * 0.2) };
    case 'WATER': return { glyph: 'glyph-wave', placements: scatter(random, 3, 20, () => 0.9 + random() * 0.3) };
    default: return random() < 0.55 ? { glyph: 'glyph-grass', placements: scatter(random, 1 + Math.floor(random() * 2), 24, () => 1) } : null;
  }
};

/** Terrain symbols for one hex; the hex polygon itself supplies the ground colour. */
export const terrainGlyphsHtml = (cell: GeneratedMapPreviewCell, hexSize: number): string => {
  const random = seeded(`terrain:${cell.id}`);
  const plan = glyphPlan(cell, random);
  if (!plan) return '';
  const unit = hexSize / GLYPH_HEX_SIZE;
  const uses = plan.placements.map(({ x, y, scale }) =>
    `<use href="#${plan.glyph}" transform="translate(${fixed(cell.x + x * unit)} ${fixed(cell.y + y * unit)}) scale(${(scale * unit).toFixed(3)})"></use>`).join('');
  return `<g class="terrain-art" aria-hidden="true">${uses}</g>`;
};

const edgeClass = (kind: GeneratedMapPreviewEdge['kind']): string => kind.toLowerCase().replace('_', '-');

/**
 * Rivers follow the hexside between two hex centres, bowed slightly so a chain
 * of hexsides reads as a meandering watercourse instead of a ruled line.
 */
export const riverPathData = (edge: GeneratedMapPreviewEdge, hexSize: number): string => {
  const dx = edge.x2 - edge.x1;
  const dy = edge.y2 - edge.y1;
  const length = Math.hypot(dx, dy) || 1;
  const half = hexSize / 2;
  const middleX = (edge.x1 + edge.x2) / 2;
  const middleY = (edge.y1 + edge.y2) / 2;
  const alongX = -dy / length;
  const alongY = dx / length;
  const bow = (seeded(`river:${edge.id}`)() - 0.5) * hexSize * 0.32;
  return `M${fixed(middleX - alongX * half)} ${fixed(middleY - alongY * half)}`
    + `Q${fixed(middleX + dx / length * bow)} ${fixed(middleY + dy / length * bow)} ${fixed(middleX + alongX * half)} ${fixed(middleY + alongY * half)}`;
};

/** River banks first, then water, so joined hexsides form one continuous channel. */
export const riversHtml = (edges: readonly GeneratedMapPreviewEdge[], hexSize: number, className: string): string => {
  const rivers = edges.filter(({ kind }) => kind === 'RIVER' || kind === 'MAJOR_RIVER');
  const data = rivers.map((edge) => ({ edge, d: riverPathData(edge, hexSize) }));
  const banks = data.map(({ edge, d }) => `<path class="river-bank ${edgeClass(edge.kind)}" d="${d}"></path>`).join('');
  const water = data.map(({ edge, d }) => `<path class="${className} ${edgeClass(edge.kind)}" d="${d}"></path>`).join('');
  return `<g class="river-banks" aria-hidden="true">${banks}</g>${water}`;
};

type Point = { readonly x: number; readonly y: number };

const pointKey = (x: number, y: number): string => `${fixed(x)},${fixed(y)}`;

/**
 * Roads run between hex centres as smooth curves. Each waypoint is nudged a
 * little off-centre (never in a settlement, where roads must meet), and the
 * tangent at a waypoint follows the straightest continuation so a road flows
 * through junctions instead of kinking at every hex. A dark casing keeps it
 * legible over every terrain.
 */
export const roadsHtml = (
  edges: readonly GeneratedMapPreviewEdge[], cells: readonly GeneratedMapPreviewCell[], hexSize: number, className: string,
): string => {
  const settled = new Set(cells.filter(({ settlement }) => settlement).map(({ x, y }) => pointKey(x, y)));
  const waypoints = new Map<string, Point>();
  const waypoint = (x: number, y: number): Point => {
    const key = pointKey(x, y);
    let point = waypoints.get(key);
    if (!point) {
      const random = seeded(`road:${key}`);
      const angle = random() * Math.PI * 2;
      const distance = settled.has(key) ? 0 : hexSize * (0.06 + random() * 0.1);
      point = { x: x + Math.cos(angle) * distance, y: y + Math.sin(angle) * distance };
      waypoints.set(key, point);
    }
    return point;
  };
  const roads = edges.filter(({ kind }) => kind === 'ROAD' || kind === 'PRIMARY_ROAD')
    // Minor roads first so primary roads paint over junctions.
    .sort((first, second) => Number(first.kind === 'PRIMARY_ROAD') - Number(second.kind === 'PRIMARY_ROAD'));
  // One road network across both classes, so a minor road merges into a primary one.
  type Link = { readonly point: Point; readonly primary: boolean };
  const links = new Map<string, Link[]>();
  roads.forEach(({ kind, x1, y1, x2, y2 }) => {
    const first = waypoint(x1, y1);
    const second = waypoint(x2, y2);
    const primary = kind === 'PRIMARY_ROAD';
    const add = (from: Point, to: Point): void => {
      const key = pointKey(from.x, from.y);
      const existing = links.get(key) ?? [];
      if (!existing.some(({ point }) => point === to)) links.set(key, [...existing, { point: to, primary }]);
    };
    add(first, second);
    add(second, first);
  });
  const unit = (x: number, y: number): Point => { const length = Math.hypot(x, y) || 1; return { x: x / length, y: y / length }; };
  const dot = (first: Point, second: Point): number => first.x * second.x + first.y * second.y;
  const heading = (from: Point, to: Point): Point => unit(to.x - from.x, to.y - from.y);
  /**
   * Direction a road leaves `from` toward `to`. A bend is always smoothed; at a
   * junction the straightest pair (primary roads first) runs through, and every
   * other branch peels off that through road like a Y instead of meeting it as a T.
   */
  const tangent = (from: Point, to: Point): Point => {
    const direct = heading(from, to);
    const neighbours = links.get(pointKey(from.x, from.y)) ?? [];
    if (neighbours.length < 2) return direct;
    if (neighbours.length === 2) {
      const other = neighbours.find(({ point }) => point !== to)!.point;
      return heading(other, to);
    }
    let through: [Link, Link] | null = null;
    let best = Infinity;
    neighbours.forEach((first, index) => neighbours.slice(index + 1).forEach((second) => {
      const score = dot(heading(from, first.point), heading(from, second.point)) - (first.primary && second.primary ? 0.6 : 0);
      if (score < best) { best = score; through = [first, second]; }
    }));
    const [first, second] = through!;
    if (first.point === to || second.point === to) return heading((first.point === to ? second : first).point, to);
    const axis = heading(second.point, first.point);
    const along = dot(axis, direct) >= 0 ? axis : { x: -axis.x, y: -axis.y };
    return unit(direct.x * 0.45 + along.x * 0.55, direct.y * 0.45 + along.y * 0.55);
  };
  const curve = (edge: GeneratedMapPreviewEdge): string => {
    const start = waypoint(edge.x1, edge.y1);
    const end = waypoint(edge.x2, edge.y2);
    const direct = heading(start, end);
    const out = tangent(start, end);
    const back = tangent(end, start);
    // Pull control points in on tight bends so a hairpin stays a curve rather than a loop.
    const length = Math.hypot(end.x - start.x, end.y - start.y);
    const reach = (alignment: number): number => length * (0.18 + 0.16 * Math.max(0, alignment));
    const outReach = reach(dot(out, direct));
    const backReach = reach(-dot(back, direct));
    return `M${fixed(start.x)} ${fixed(start.y)}C${fixed(start.x + out.x * outReach)} ${fixed(start.y + out.y * outReach)} `
      + `${fixed(end.x + back.x * backReach)} ${fixed(end.y + back.y * backReach)} ${fixed(end.x)} ${fixed(end.y)}`;
  };
  const data = roads.map((edge) => ({ edge, d: curve(edge) }));
  const casings = data.map(({ edge, d }) => `<path class="road-casing ${edgeClass(edge.kind)}" d="${d}"></path>`).join('');
  const surfaces = data.map(({ edge, d }) => `<path class="${className} ${edgeClass(edge.kind)}" d="${d}"></path>`).join('');
  return `<g class="road-casings" aria-hidden="true">${casings}</g>${surfaces}`;
};

/** A built-up area: a pale footprint with a cluster of building blocks sized by settlement class. */
export const settlementArtHtml = (cell: GeneratedMapPreviewCell, hexSize: number): string => {
  if (!cell.settlement) return '';
  const unit = hexSize / GLYPH_HEX_SIZE;
  const random = seeded(`settlement:${cell.id}`);
  const plan = { CITY: { radius: 17, blocks: 9, spread: 11 }, TOWN: { radius: 11, blocks: 5, spread: 7 }, VILLAGE: { radius: 7, blocks: 3, spread: 3.5 } }[cell.settlement];
  const footprint = plan.radius > 0
    ? `<circle class="settlement-footprint" cx="${fixed(cell.x)}" cy="${fixed(cell.y)}" r="${fixed(plan.radius * unit)}"></circle>` : '';
  const blocks = Array.from({ length: plan.blocks }, (_, index) => {
    const angle = index * 2.4 + random();
    const distance = index === 0 ? 0 : plan.spread * Math.sqrt(index / plan.blocks) * unit;
    const width = (3.6 + random() * 2.6) * unit;
    const height = (3.2 + random() * 2.4) * unit;
    const x = cell.x + Math.cos(angle) * distance;
    const y = cell.y + Math.sin(angle) * distance;
    return `<rect class="settlement-block" x="${fixed(x - width / 2)}" y="${fixed(y - height / 2)}" width="${fixed(width)}" height="${fixed(height)}" transform="rotate(${Math.round(random() * 40 - 20)} ${fixed(x)} ${fixed(y)})"></rect>`;
  }).join('');
  return `${footprint}${blocks}`;
};

/** Victory objective: a gold star medallion in the hex's bottom point, the strip a stacked counter leaves uncovered. */
export const objectiveArtHtml = (cell: GeneratedMapPreviewCell, hexSize: number): string => {
  const unit = hexSize / GLYPH_HEX_SIZE;
  const cx = cell.x;
  const cy = cell.y + 39 * unit;
  const star = Array.from({ length: 10 }, (_, index) => {
    const radius = (index % 2 === 0 ? 6 : 2.5) * unit;
    const angle = Math.PI / 5 * index - Math.PI / 2;
    return `${fixed(cx + Math.cos(angle) * radius)},${fixed(cy + Math.sin(angle) * radius)}`;
  }).join(' ');
  return `<circle cx="${fixed(cx)}" cy="${fixed(cy)}" r="${fixed(8.5 * unit)}"></circle><polygon points="${star}"></polygon>`;
};

/** Entry / supply zone: a band in the owning side's colour along the hex's inner rim. */
export const strategicBandPoints = (cell: GeneratedMapPreviewCell, hexSize: number): string =>
  Array.from({ length: 6 }, (_, index) => {
    const radians = Math.PI / 180 * (60 * index - 30);
    return `${fixed(cell.x + hexSize * 0.86 * Math.cos(radians))},${fixed(cell.y + hexSize * 0.86 * Math.sin(radians))}`;
  }).join(' ');

/** Axial neighbour across each pointy-top hexside; side i joins vertex i and i + 1 (vertex 0 at -30°). */
const SIDE_NEIGHBOURS: readonly (readonly [number, number])[] = [[1, 0], [0, 1], [-1, 1], [-1, 0], [0, -1], [1, -1]];

/** Shoreline along every hexside where water meets land; the map edge is left open. */
export const coastlineHtml = (cells: readonly GeneratedMapPreviewCell[], hexSize: number): string => {
  const water = new Map(cells.map((cell) => [cell.id, cell.terrain === 'WATER']));
  const vertex = (cell: GeneratedMapPreviewCell, index: number): string => {
    const radians = Math.PI / 180 * (60 * index - 30);
    return `${fixed(cell.x + hexSize * Math.cos(radians))} ${fixed(cell.y + hexSize * Math.sin(radians))}`;
  };
  const segments = cells.filter(({ terrain }) => terrain === 'WATER').flatMap((cell) => {
    const [q, r] = cell.id.split(',').map(Number);
    return SIDE_NEIGHBOURS.flatMap(([dq, dr], side) =>
      water.get(`${q! + dq},${r! + dr}`) === false ? [`M${vertex(cell, side)}L${vertex(cell, (side + 1) % 6)}`] : []);
  });
  return segments.length > 0 ? `<path class="coastline" d="${segments.join('')}" aria-hidden="true"></path>` : '';
};
