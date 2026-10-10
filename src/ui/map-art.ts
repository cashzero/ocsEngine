import type { HexsideId } from '../domain/map/index.js';
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

/**
 * Palette read from the printed Beyond the Rhine map in the VASSAL module: a flat khaki ground, pale
 * sea, stippled green woods, tan rough ground and a hairline white hex grid. Only the look is
 * borrowed; no raster from the module is used.
 */
const GROUND = '#d3d4ab';

/** Scatter `count` dots over a square tile, repeating any dot that crosses an edge so the tile repeats seamlessly. */
const tileDots = (seed: string, size: number, count: number, radius: readonly [number, number], fill: string): string => {
  const random = seeded(seed);
  return Array.from({ length: count }, () => ({ x: random() * size, y: random() * size, r: radius[0] + random() * (radius[1] - radius[0]) }))
    .flatMap(({ x, y, r }) => [-1, 0, 1].flatMap((dx) => [-1, 0, 1].map((dy) => ({ x: x + dx * size, y: y + dy * size, r }))))
    .filter(({ x, y, r }) => x + r > 0 && x - r < size && y + r > 0 && y - r < size)
    .map(({ x, y, r }) => `<circle cx="${fixed(x)}" cy="${fixed(y)}" r="${fixed(r)}" fill="${fill}"/>`).join('');
};

/** Stippled woods: a mid-green ground peppered with dark and pale dots, as the printed map shows its forests. */
const woodsStipplePattern = (): string => {
  const size = 72;
  return `<pattern id="terrain-woods" width="${size}" height="${size}" patternUnits="userSpaceOnUse"><rect width="${size}" height="${size}" fill="#93ac71"/>`
    + tileDots('woods:mid', size, 70, [1.2, 2.6], '#7a9a58')
    + tileDots('woods:dark', size, 85, [0.9, 2], '#587c41')
    + tileDots('woods:pale', size, 55, [0.7, 1.5], '#cadcae') + '</pattern>';
};

/** Marsh is drawn as the printed map draws polders: a network of thin blue ditches over pale wet ground. */
const marshDitchPattern = (): string => {
  const size = 84;
  const random = seeded('marsh:ditch');
  const ditches = Array.from({ length: 11 }, () => {
    let x = random() * size;
    let y = random() * size;
    let horizontal = random() < 0.5;
    return `M${fixed(x)} ${fixed(y)}` + Array.from({ length: 2 + Math.floor(random() * 3) }, () => {
      const run = (8 + random() * 22) * (random() < 0.5 ? -1 : 1);
      if (horizontal) x += run; else y += run;
      horizontal = !horizontal;
      return `${horizontal ? 'V' : 'H'}${fixed(horizontal ? y : x)}`;
    }).join('');
  });
  const paths = [-1, 0, 1].flatMap((dx) => [-1, 0, 1].map((dy) =>
    `<g transform="translate(${dx * size} ${dy * size})">${ditches.map((d) => `<path d="${d}"/>`).join('')}</g>`)).join('');
  return `<pattern id="terrain-marsh" width="${size}" height="${size}" patternUnits="userSpaceOnUse"><rect width="${size}" height="${size}" fill="#c4d3b0"/>`
    + `<g fill="none" stroke="#3d9ac0" stroke-width="1.3" stroke-linejoin="round" stroke-linecap="round" opacity=".9">${paths}</g></pattern>`;
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
  <pattern id="terrain-clear" width="48" height="48" patternUnits="userSpaceOnUse"><rect width="48" height="48" fill="${GROUND}"/>${tileDots('clear:grain', 48, 14, [0.5, 1], '#c7c89d')}${tileDots('clear:light', 48, 10, [0.5, 0.9], '#dfe0bb')}</pattern>
  ${woodsStipplePattern()}
  ${reliefPattern('terrain-rough', { size: 200, frequency: 0.035, octaves: 2, seed: 5, relief: 3, elevation: 58, light: '#fff8ea', tint: '#d3b17c' })}
  ${reliefPattern('terrain-mountain', { size: 240, frequency: 0.0125, octaves: 4, seed: 11, relief: 9, elevation: 40, light: '#fbf4e6', tint: '#b09c7c', ridged: true })}
  ${marshDitchPattern()}
  <pattern id="terrain-water" width="30" height="20" patternUnits="userSpaceOnUse"><rect width="30" height="20" fill="#a4d3ea"/></pattern>
  <g id="glyph-wave"><path d="${WAVE_GLYPH_PATH}" fill="none" stroke="#d3ebf7" stroke-width="1.3" stroke-linecap="round"/></g>
</defs>`;

export type Placement = { readonly x: number; readonly y: number; readonly scale: number };

/** Scatter glyph positions inside a disc of the hex, drawn back to front. */
const scatter = (random: () => number, count: number, radius: number, scale: () => number): Placement[] =>
  Array.from({ length: count }, (_, index) => {
    const angle = (index / count + random() * 0.6) * Math.PI * 2;
    const distance = radius * Math.sqrt(0.15 + random() * 0.85);
    return { x: Math.cos(angle) * distance, y: Math.sin(angle) * distance * 0.85, scale: scale() };
  }).sort((first, second) => first.y - second.y);

const glyphPlan = (cell: GeneratedMapPreviewCell, random: () => number): { glyph: string; placements: Placement[] } | null => {
  // Every land terrain is drawn by its seamless fill (adjacent hexes merge into one forest, range or polder);
  // only open water keeps a few sparse wave marks, since the printed sea is otherwise blank.
  if (cell.terrain !== 'WATER') return null;
  return random() < 0.4 ? { glyph: 'glyph-wave', placements: scatter(random, 1, 18, () => 0.9 + random() * 0.3) } : null;
};

/**
 * The printed map's terrain is not cut to the hex grid, so each fill polygon has its corners nudged by a
 * deterministic amount keyed on the corner's position. Neighbouring hexes share corners, so the fills still
 * tile without gaps while woods, rough ground and coasts get irregular, hand-drawn boundaries.
 */
const JITTER = 0.11;

const jitterPoint = (x: number, y: number, hexSize: number): Point => {
  const random = seeded(`corner:${Math.round(x * 2)},${Math.round(y * 2)}`);
  return { x: x + (random() - 0.5) * 2 * JITTER * hexSize, y: y + (random() - 0.5) * 2 * JITTER * hexSize };
};

const cornerOf = (cell: GeneratedMapPreviewCell, index: number, hexSize: number): Point => {
  const radians = Math.PI / 180 * (60 * index - 30);
  return jitterPoint(cell.x + hexSize * Math.cos(radians), cell.y + hexSize * Math.sin(radians), hexSize);
};

/** The six nudged corners of a hex's ground fill, rounded as drawn. */
export const terrainFillCorners = (cell: GeneratedMapPreviewCell, hexSize: number): Point[] =>
  Array.from({ length: 6 }, (_, index) => { const { x, y } = cornerOf(cell, index, hexSize); return { x: Number(fixed(x)), y: Number(fixed(y)) }; });

/** One ground-coloured polygon per hex, with no outline of its own; the grid is a separate layer. */
export const terrainFillHtml = (cell: GeneratedMapPreviewCell, hexSize: number, extraClass = ''): string => {
  const points = terrainFillCorners(cell, hexSize).map(({ x, y }) => `${fixed(x)},${fixed(y)}`).join(' ');
  return `<polygon class="terrain-fill terrain-${cell.terrain.toLowerCase()}${extraClass ? ` ${extraClass}` : ''}" points="${points}"></polygon>`;
};

/** Wave mark used on open water, authored around (0, 0) for a 50-unit hex. */
export const WAVE_GLYPH_PATH = 'M-10 0q2.5-3.5 5 0t5 0 5 0 5 0';

/** Where a hex's terrain symbols sit: map position and scale of each glyph. */
export const terrainGlyphPlacements = (cell: GeneratedMapPreviewCell, hexSize: number): { glyph: string; placements: Placement[] } | null => {
  const random = seeded(`terrain:${cell.id}`);
  const plan = glyphPlan(cell, random);
  if (!plan) return null;
  const unit = hexSize / GLYPH_HEX_SIZE;
  return {
    glyph: plan.glyph,
    placements: plan.placements.map(({ x, y, scale }) => ({ x: Number(fixed(cell.x + x * unit)), y: Number(fixed(cell.y + y * unit)), scale: Number((scale * unit).toFixed(3)) })),
  };
};

/** Terrain symbols for one hex; the hex polygon itself supplies the ground colour. */
export const terrainGlyphsHtml = (cell: GeneratedMapPreviewCell, hexSize: number): string => {
  const plan = terrainGlyphPlacements(cell, hexSize);
  if (!plan) return '';
  const uses = plan.placements.map(({ x, y, scale }) =>
    `<use href="#${plan.glyph}" transform="translate(${fixed(x)} ${fixed(y)}) scale(${scale.toFixed(3)})"></use>`).join('');
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
  // The hexside ends on the same nudged corners the terrain fills use, so a river hugs the coast and forest edges.
  const start = jitterPoint(middleX - alongX * half, middleY - alongY * half, hexSize);
  const end = jitterPoint(middleX + alongX * half, middleY + alongY * half, hexSize);
  return `M${fixed(start.x)} ${fixed(start.y)}`
    + `Q${fixed(middleX + dx / length * bow)} ${fixed(middleY + dy / length * bow)} ${fixed(end.x)} ${fixed(end.y)}`;
};

export interface EdgeStroke {
  readonly kind: GeneratedMapPreviewEdge['kind'];
  readonly d: string;
  /** A road's last stretch, from its border hex out to the map edge (see withMapExits). */
  readonly exit?: true;
}

/** One path per watercourse hexside. */
export const riverStrokes = (edges: readonly GeneratedMapPreviewEdge[], hexSize: number): EdgeStroke[] =>
  edges.filter(({ kind }) => kind === 'RIVER' || kind === 'MAJOR_RIVER').map((edge) => ({ kind: edge.kind, d: riverPathData(edge, hexSize) }));

/** River banks first, then water, so joined hexsides form one continuous channel. */
export const riversHtml = (edges: readonly GeneratedMapPreviewEdge[], hexSize: number, className: string): string => {
  const data = riverStrokes(edges, hexSize);
  const banks = data.map(({ kind, d }) => `<path class="river-bank ${edgeClass(kind)}" d="${d}"></path>`).join('');
  const water = data.map(({ kind, d }) => `<path class="${className} ${edgeClass(kind)}" d="${d}"></path>`).join('');
  return `<g class="river-banks" aria-hidden="true">${banks}</g>${water}`;
};

export type Point = { readonly x: number; readonly y: number };

const pointKey = (x: number, y: number): string => `${fixed(x)},${fixed(y)}`;

const unit = (x: number, y: number): Point => { const length = Math.hypot(x, y) || 1; return { x: x / length, y: y / length }; };
const dot = (first: Point, second: Point): number => first.x * second.x + first.y * second.y;
const heading = (from: Point, to: Point): Point => unit(to.x - from.x, to.y - from.y);

/** A drawn line network (roads or railways): each waypoint's neighbours, `major` for the heavier class. */
type Link = { readonly point: Point; readonly major: boolean };

const networkLinks = (segments: readonly { readonly from: Point; readonly to: Point; readonly major: boolean }[]): Map<string, Link[]> => {
  const links = new Map<string, Link[]>();
  const add = (from: Point, to: Point, major: boolean): void => {
    const key = pointKey(from.x, from.y);
    const existing = links.get(key) ?? [];
    if (!existing.some(({ point }) => point === to)) links.set(key, [...existing, { point: to, major }]);
  };
  segments.forEach(({ from, to, major }) => { add(from, to, major); add(to, from, major); });
  return links;
};

/** The two links at a junction that run straightest through it, major lines first. */
const throughPair = (from: Point, neighbours: readonly Link[]): readonly [Link, Link] => {
  let through: readonly [Link, Link] = [neighbours[0]!, neighbours[1]!];
  let best = Infinity;
  neighbours.forEach((first, index) => neighbours.slice(index + 1).forEach((second) => {
    const score = dot(heading(from, first.point), heading(from, second.point)) - (first.major && second.major ? 0.6 : 0);
    if (score < best) { best = score; through = [first, second]; }
  }));
  return through;
};

/**
 * Direction a line leaves `from` toward `to`. A bend is always smoothed; at a
 * junction the straightest pair (major lines first) runs through, and every
 * other branch peels off that through line like a Y instead of meeting it as a T.
 */
const networkTangent = (links: ReadonlyMap<string, readonly Link[]>, from: Point, to: Point): Point => {
  const direct = heading(from, to);
  const neighbours = links.get(pointKey(from.x, from.y)) ?? [];
  if (neighbours.length < 2) return direct;
  if (neighbours.length === 2) {
    const other = neighbours.find(({ point }) => point !== to)!.point;
    return heading(other, to);
  }
  const [first, second] = throughPair(from, neighbours);
  if (first.point === to || second.point === to) return heading((first.point === to ? second : first).point, to);
  const axis = heading(second.point, first.point);
  const along = dot(axis, direct) >= 0 ? axis : { x: -axis.x, y: -axis.y };
  return unit(direct.x * 0.45 + along.x * 0.55, direct.y * 0.45 + along.y * 0.55);
};

type Cubic = readonly [Point, Point, Point, Point];

/**
 * A cubic from `start` to `end` leaving and arriving along the network's tangents. `reach` sets the
 * control arms as a share of the segment length from how well the tangent lines up with it, so tight
 * bends are pulled in and stay a curve rather than a loop.
 */
const networkCubic = (
  links: ReadonlyMap<string, readonly Link[]>, start: Point, end: Point, reach: (alignment: number) => number,
): Cubic => {
  const direct = heading(start, end);
  const out = networkTangent(links, start, end);
  const back = networkTangent(links, end, start);
  const length = Math.hypot(end.x - start.x, end.y - start.y);
  const outReach = length * reach(dot(out, direct));
  const backReach = length * reach(-dot(back, direct));
  return [start, { x: start.x + out.x * outReach, y: start.y + out.y * outReach }, { x: end.x + back.x * backReach, y: end.y + back.y * backReach }, end];
};

const cubicPath = ([start, first, second, end]: Cubic): string =>
  `M${fixed(start.x)} ${fixed(start.y)}C${fixed(first.x)} ${fixed(first.y)} ${fixed(second.x)} ${fixed(second.y)} ${fixed(end.x)} ${fixed(end.y)}`;

/** Point and unit direction on a cubic at parameter `t`. */
const cubicAt = ([p0, p1, p2, p3]: Cubic, t: number): { readonly point: Point; readonly direction: Point } => {
  const s = 1 - t;
  const point = {
    x: s * s * s * p0.x + 3 * s * s * t * p1.x + 3 * s * t * t * p2.x + t * t * t * p3.x,
    y: s * s * s * p0.y + 3 * s * s * t * p1.y + 3 * s * t * t * p2.y + t * t * t * p3.y,
  };
  const direction = unit(
    3 * s * s * (p1.x - p0.x) + 6 * s * t * (p2.x - p1.x) + 3 * t * t * (p3.x - p2.x),
    3 * s * s * (p1.y - p0.y) + 6 * s * t * (p2.y - p1.y) + 3 * t * t * (p3.y - p2.y),
  );
  return { point, direction };
};

/** The part of `cubic` before it crosses the line through `first` and `second`, and the parameter where it crosses. */
const cutCubic = (cubic: Cubic, [first, second]: readonly [Point, Point]): { readonly cubic: Cubic; readonly t: number } => {
  const side = (t: number): boolean => {
    const { point } = cubicAt(cubic, t);
    return (second.x - first.x) * (point.y - first.y) - (second.y - first.y) * (point.x - first.x) >= 0;
  };
  let low = 0;
  let high = 1;
  if (side(low) === side(high)) return { cubic, t: 1 };
  for (let round = 0; round < 24; round += 1) {
    const middle = (low + high) / 2;
    if (side(middle) === side(0)) low = middle; else high = middle;
  }
  const t = (low + high) / 2;
  const lerp = (from: Point, to: Point): Point => ({ x: from.x + (to.x - from.x) * t, y: from.y + (to.y - from.y) * t });
  const [p0, p1, p2, p3] = cubic;
  const p01 = lerp(p0, p1);
  const p12 = lerp(p1, p2);
  const p012 = lerp(p01, p12);
  const end = lerp(p012, lerp(p12, lerp(p2, p3)));
  return { cubic: [p0, p01, p012, end], t };
};

const SQRT3 = Math.sqrt(3);
/** Headings from a hex centre to its six neighbours; the hexside toward neighbour `i` runs from corner `i` to corner `i + 1`. */
const NEIGHBOUR_HEADINGS: readonly Point[] = Array.from({ length: 6 }, (_, index) => ({ x: Math.cos(index * Math.PI / 3), y: Math.sin(index * Math.PI / 3) }));

/**
 * A generated map is a window on a wider landscape: main roads leave across every land border and every entry
 * hex is a map-edge railroad (generation/map/roads.ts, rails.ts). So a line that ends in a border hex, or
 * reaches an entry hex, runs on off the map instead of stopping at the hex centre. Each such hex gains a
 * hexside to the off-map neighbour facing most squarely away from its links there, so the line carries on the
 * way it was going; `borders` holds the map-edge hexside (its corners as the terrain fill draws them) where
 * that hexside's drawing is cut off.
 */
const withMapExits = <Edge extends GeneratedMapPreviewEdge>(
  lines: readonly Edge[], cells: readonly GeneratedMapPreviewCell[], hexSize: number,
): { readonly lines: Edge[]; readonly borders: ReadonlyMap<Edge, readonly [Point, Point]> } => {
  const byCentre = new Map(cells.map((cell) => [pointKey(cell.x, cell.y), cell]));
  const origin = cells[0] ?? { x: 0, y: 0 };
  // Hex centres on an integer grid of half-columns and rows, so a neighbour's position is looked up exactly.
  const gridKey = (x: number, y: number): string =>
    `${Math.round((x - origin.x) / (hexSize * SQRT3 / 2))},${Math.round((y - origin.y) / (hexSize * 1.5))}`;
  const onMap = new Set(cells.map(({ x, y }) => gridKey(x, y)));
  const links = new Map<string, { edge: Edge; toward: Point }[]>();
  lines.forEach((edge) => {
    const add = (from: Point, to: Point): void => {
      const key = pointKey(from.x, from.y);
      links.set(key, [...(links.get(key) ?? []), { edge, toward: heading(from, to) }]);
    };
    add({ x: edge.x1, y: edge.y1 }, { x: edge.x2, y: edge.y2 });
    add({ x: edge.x2, y: edge.y2 }, { x: edge.x1, y: edge.y1 });
  });
  const exits: Edge[] = [];
  const borders = new Map<Edge, readonly [Point, Point]>();
  links.forEach((here, key) => {
    const cell = byCentre.get(key);
    if (!cell || (here.length > 1 && !cell.strategic)) return;
    const outward = NEIGHBOUR_HEADINGS
      .map((direction, index) => ({ direction, index, facing: Math.max(...here.map(({ toward }) => dot(direction, toward))) }))
      .filter(({ direction }) => !onMap.has(gridKey(cell.x + direction.x * SQRT3 * hexSize, cell.y + direction.y * SQRT3 * hexSize)))
      .sort((first, second) => first.facing - second.facing || first.index - second.index)[0];
    if (!outward) return;
    const { direction, index } = outward;
    // The exit continues the link running most directly into it, in that link's class.
    const { edge: from } = here.reduce((best, link) => (dot(direction, link.toward) < dot(direction, best.toward) ? link : best));
    const exit: Edge = {
      ...from, id: `${cell.id}:map-edge` as HexsideId,
      x1: cell.x, y1: cell.y, x2: cell.x + direction.x * SQRT3 * hexSize, y2: cell.y + direction.y * SQRT3 * hexSize,
    };
    exits.push(exit);
    borders.set(exit, [cornerOf(cell, index, hexSize), cornerOf(cell, (index + 1) % 6, hexSize)]);
  });
  return { lines: [...lines, ...exits], borders };
};

/**
 * Where a road crosses each hex: nudged a little off-centre by an amount keyed on the hex position,
 * except in a settlement, where roads must meet at the centre.
 */
const roadWaypoints = (cells: readonly GeneratedMapPreviewCell[], hexSize: number): ((x: number, y: number) => Point) => {
  const settled = new Set(cells.filter(({ settlement }) => settlement).map(({ x, y }) => pointKey(x, y)));
  const waypoints = new Map<string, Point>();
  return (x, y) => {
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
};

const isRoad = ({ kind }: GeneratedMapPreviewEdge): boolean => kind === 'ROAD' || kind === 'PRIMARY_ROAD';

/** `cubic` runs waypoint to waypoint; `drawn` is the part on the map, cut at the map edge for a road leaving it. */
type RoadCubic = { readonly edge: GeneratedMapPreviewEdge; readonly cubic: Cubic; readonly drawn: Cubic; readonly exit: boolean };

/**
 * Roads run between hex centres as smooth curves. Each waypoint is nudged a
 * little off-centre (never in a settlement, where roads must meet), and the
 * tangent at a waypoint follows the straightest continuation so a road flows
 * through junctions instead of kinking at every hex. A road leaving the map
 * runs on to the map edge.
 */
const roadCubics = (
  edges: readonly GeneratedMapPreviewEdge[], cells: readonly GeneratedMapPreviewCell[], hexSize: number,
): RoadCubic[] => {
  const waypoint = roadWaypoints(cells, hexSize);
  const { lines, borders } = withMapExits(edges.filter(isRoad), cells, hexSize);
  const roads = lines
    // Minor roads first so primary roads paint over junctions.
    .sort((first, second) => Number(first.kind === 'PRIMARY_ROAD') - Number(second.kind === 'PRIMARY_ROAD'));
  // One road network across both classes, so a minor road merges into a primary one.
  const links = networkLinks(roads.map(({ kind, x1, y1, x2, y2 }) => ({ from: waypoint(x1, y1), to: waypoint(x2, y2), major: kind === 'PRIMARY_ROAD' })));
  return roads.map((edge) => {
    const cubic = networkCubic(links, waypoint(edge.x1, edge.y1), waypoint(edge.x2, edge.y2), (alignment) => 0.18 + 0.16 * Math.max(0, alignment));
    const border = borders.get(edge);
    return { edge, cubic, drawn: border ? cutCubic(cubic, border).cubic : cubic, exit: border !== undefined };
  });
};

/** One curved path per road hexside; a dark casing (see roadsHtml) keeps it legible over every terrain. */
export const roadStrokes = (
  edges: readonly GeneratedMapPreviewEdge[], cells: readonly GeneratedMapPreviewCell[], hexSize: number,
): EdgeStroke[] => roadCubics(edges, cells, hexSize).map(({ edge, drawn, exit }) => ({ kind: edge.kind, d: cubicPath(drawn), ...(exit ? { exit } : {}) }));

/** Casings first, then surfaces, minor roads under primary ones. */
export const roadsHtml = (
  edges: readonly GeneratedMapPreviewEdge[], cells: readonly GeneratedMapPreviewCell[], hexSize: number, className: string,
): string => {
  const data = roadStrokes(edges, cells, hexSize);
  const casings = data.map(({ kind, d }) => `<path class="road-casing ${edgeClass(kind)}" d="${d}"></path>`).join('');
  const surfaces = data.map(({ kind, d }) => `<path class="${className} ${edgeClass(kind)}" d="${d}"></path>`).join('');
  return `<g class="road-casings" aria-hidden="true">${casings}</g>${surfaces}`;
};

export interface RailStroke {
  readonly kind: 'RAIL' | 'MULTI_RAIL';
  /** The track, waypoint to waypoint. */
  readonly line: string;
  /** Cross-ties across the track: one per tie on single track, paired on multi-track. */
  readonly ties: string;
  /** A railway's last stretch, from its border hex out to the map edge (see withMapExits). */
  readonly exit?: true;
}

/**
 * How far, in hex sizes, a railway waypoint sits to one side of its hex centre, and the least gap it keeps
 * from a road that shares one of its hexsides: about a primary road's casing plus a multi-track tie's
 * half-length.
 */
const RAIL_OFFSET = 0.32;
/** The furthest a railway waypoint steps from its hex centre to clear a road, keeping well inside the hex. */
const RAIL_OFFSET_LIMIT = 0.6;

/**
 * Where a railway crosses each hex. The track keeps to one side of the hex centre, perpendicular to the
 * line's run through the hex, so it runs beside a road instead of on top of it. Each hex takes the side
 * that clears the roads sharing its hexsides with the least step out, while the line changes side rarely,
 * and only between hexes where no road runs alongside; where a road bows toward the track it steps
 * further out.
 */
const railWaypoints = (
  rails: readonly GeneratedMapPreviewEdge[], roads: readonly RoadCubic[], hexSize: number,
): ((x: number, y: number) => Point) => {
  const centres = new Map<string, Point>();
  const centre = (x: number, y: number): Point => {
    const key = pointKey(x, y);
    let point = centres.get(key);
    if (!point) { point = { x, y }; centres.set(key, point); }
    return point;
  };
  const links = networkLinks(rails.map(({ kind, x1, y1, x2, y2 }) => ({ from: centre(x1, y1), to: centre(x2, y2), major: kind === 'MULTI_RAIL' })));
  const pair = (first: string, second: string): string => (first < second ? `${first}|${second}` : `${second}|${first}`);
  // Each road hexside sampled along its drawn curve, so the track clears the road's bows as well as its ends.
  const roadCurves = new Map(roads.map(({ edge: { x1, y1, x2, y2 }, cubic }) =>
    [pair(pointKey(x1, y1), pointKey(x2, y2)), Array.from({ length: 9 }, (_, index) => cubicAt(cubic, index / 8).point)]));
  // The line's run through each hex: along its only link, between its two, or along the through pair of a junction.
  const normals = new Map<string, Point>();
  centres.forEach((point, key) => {
    const neighbours = links.get(key)!;
    const run = neighbours.length === 1 ? heading(point, neighbours[0]!.point) : (([first, second]) => heading(first.point, second.point))(throughPair(point, neighbours));
    normals.set(key, { x: -run.y, y: run.x });
  });
  /**
   * The step from the hex centre to the track. It starts RAIL_OFFSET out on `side`; then, along each hexside a
   * road shares, the track is pushed until it clears the road's furthest bow toward it by RAIL_OFFSET,
   * measured across that hexside, on the side of the road that `side` faces. Repeated pushes settle on a
   * step that clears every such road at once.
   */
  const step = (key: string, side: Point): Point => {
    const point = centres.get(key)!;
    const clearances = links.get(key)!.flatMap(({ point: other }) => {
      const road = roadCurves.get(pair(key, pointKey(other.x, other.y)));
      if (!road) return [];
      const run = heading(point, other);
      const across = { x: -run.y, y: run.x };
      const away = dot(side, across) >= 0 ? across : { x: -across.x, y: -across.y };
      const lean = Math.max(...road.map(({ x, y }) => dot({ x: x - point.x, y: y - point.y }, away)));
      return [{ away, least: lean + RAIL_OFFSET * hexSize }];
    });
    let vector = { x: side.x * RAIL_OFFSET * hexSize, y: side.y * RAIL_OFFSET * hexSize };
    for (let round = 0; round < 12; round += 1) clearances.forEach(({ away, least }) => {
      const short = least - dot(vector, away);
      if (short > 0) vector = { x: vector.x + away.x * short, y: vector.y + away.y * short };
    });
    return vector;
  };
  const length = ({ x, y }: Point): number => Math.hypot(x, y);
  const flip = ({ x, y }: Point): Point => ({ x: -x, y: -y });
  const sides = new Map<string, Point>();
  centres.forEach((_, root) => {
    if (sides.has(root)) return;
    // Walk the connected line, lining each hex's normal up with its parent's so "the same side" carries along it.
    const aligned = new Map<string, Point>([[root, normals.get(root)!]]);
    const parent = new Map<string, string>();
    const order = [root];
    for (let index = 0; index < order.length; index += 1) {
      const key = order[index]!;
      links.get(key)!.forEach(({ point }) => {
        const next = pointKey(point.x, point.y);
        if (aligned.has(next)) return;
        const normal = normals.get(next)!;
        aligned.set(next, dot(normal, aligned.get(key)!) >= 0 ? normal : flip(normal));
        parent.set(next, key);
        order.push(next);
      });
    }
    // Choose a side per hex (0 keeps the aligned normal, 1 flips it) by dynamic programming over the walk: each
    // hex pays for how far it must step out, heavily once a road cannot be cleared within the limit; changing
    // side costs a little between hexes, and a lot where the track would swap sides of a road along a hexside
    // they share, crossing it lengthwise.
    const sideOf = (key: string, label: number): Point => (label ? flip(aligned.get(key)!) : aligned.get(key)!);
    const cost = (key: string, label: number): number => {
      const distance = length(step(key, sideOf(key, label)));
      return (Math.min(distance, RAIL_OFFSET_LIMIT * hexSize) + 4 * Math.max(0, Math.min(distance, hexSize) - RAIL_OFFSET_LIMIT * hexSize)) / hexSize;
    };
    // Along a hexside shared with a road, the two ends must keep to the same side of that road.
    const change = (key: string, label: number, child: string, childLabel: number): number => {
      if (!roadCurves.has(pair(key, child))) return label === childLabel ? 0 : 0.4;
      const run = heading(centres.get(key)!, centres.get(child)!);
      const across = { x: -run.y, y: run.x };
      return (dot(sideOf(key, label), across) >= 0) === (dot(sideOf(child, childLabel), across) >= 0) ? 0 : 3;
    };
    const children = new Map<string, string[]>();
    parent.forEach((key, child) => children.set(key, [...(children.get(key) ?? []), child]));
    const best = new Map<string, readonly number[]>();
    const childCost = (key: string, label: number, child: string, childLabel: number): number =>
      best.get(child)![childLabel]! + change(key, label, child, childLabel);
    [...order].reverse().forEach((key) => best.set(key, [0, 1].map((label) => cost(key, label)
      + (children.get(key) ?? []).reduce((total, child) => total + Math.min(childCost(key, label, child, 0), childCost(key, label, child, 1)), 0))));
    const labels = new Map<string, number>();
    order.forEach((key) => {
      const above = parent.get(key);
      const label = above === undefined
        ? Number(best.get(key)![1]! < best.get(key)![0]!)
        : Number(childCost(above, labels.get(above)!, key, 1) < childCost(above, labels.get(above)!, key, 0));
      labels.set(key, label);
      sides.set(key, sideOf(key, label));
    });
  });
  const waypoints = new Map<string, Point>();
  sides.forEach((side, key) => {
    const point = centres.get(key)!;
    const vector = step(key, side);
    const scale = Math.min(1, RAIL_OFFSET_LIMIT * hexSize / (length(vector) || 1));
    waypoints.set(key, { x: point.x + vector.x * scale, y: point.y + vector.y * scale });
  });
  return (x, y) => waypoints.get(pointKey(x, y))!;
};

/**
 * Railroads are drawn as on the BtR map: a dark red line with short cross-ties, heavier and
 * double-tied for multi-track. The track runs beside the roads (see railWaypoints) and rounds its
 * bends only close to each waypoint, about half as wide as a road does, so it reads as a stiffer,
 * engineered line. Ties are spaced evenly along each hexside and stop short of the waypoints, so
 * junctions stay clean. A railway leaving the map runs on to the map edge.
 */
export const railStrokes = (
  edges: readonly GeneratedMapPreviewEdge[], cells: readonly GeneratedMapPreviewCell[], hexSize: number,
): RailStroke[] => {
  const { lines, borders } = withMapExits(
    edges.filter((edge): edge is GeneratedMapPreviewEdge & { kind: RailStroke['kind'] } => edge.kind === 'RAIL' || edge.kind === 'MULTI_RAIL'), cells, hexSize);
  const rails = lines
    // Single track first, so the trunk paints over junctions.
    .sort((first, second) => Number(first.kind === 'MULTI_RAIL') - Number(second.kind === 'MULTI_RAIL'));
  const waypoint = railWaypoints(rails, roadCubics(edges, cells, hexSize), hexSize);
  const links = networkLinks(rails.map(({ kind, x1, y1, x2, y2 }) => ({ from: waypoint(x1, y1), to: waypoint(x2, y2), major: kind === 'MULTI_RAIL' })));
  return rails.map((edge) => {
    const full = networkCubic(links, waypoint(edge.x1, edge.y1), waypoint(edge.x2, edge.y2), (alignment) => 0.08 + 0.08 * Math.max(0, alignment));
    const border = borders.get(edge);
    const { cubic, t: cut } = border ? cutCubic(full, border) : { cubic: full, t: 1 };
    const multi = edge.kind === 'MULTI_RAIL';
    const half = hexSize * (multi ? 0.15 : 0.12);
    const offsets = multi ? [-hexSize * 0.035, hexSize * 0.035] : [0];
    const ties: string[] = [];
    // Ties keep their spacing on a stretch cut at the map edge, with none on the edge itself.
    for (const t of [0.22, 0.5, 0.78].filter((at) => at < cut - 0.05)) {
      const { point, direction: { x: ux, y: uy } } = cubicAt(full, t);
      for (const offset of offsets) {
        const cx = point.x + ux * offset;
        const cy = point.y + uy * offset;
        ties.push(`M${fixed(cx - uy * half)} ${fixed(cy + ux * half)}L${fixed(cx + uy * half)} ${fixed(cy - ux * half)}`);
      }
    }
    return { kind: edge.kind, line: cubicPath(cubic), ties: ties.join(''), ...(border ? { exit: true as const } : {}) };
  });
};

/** Track then ties, over the roads. */
export const railsHtml = (edges: readonly GeneratedMapPreviewEdge[], cells: readonly GeneratedMapPreviewCell[], hexSize: number): string =>
  railStrokes(edges, cells, hexSize).map(({ kind, line, ties }) =>
    `<path class="rail-line ${edgeClass(kind)}" d="${line}"></path><path class="rail-ties ${edgeClass(kind)}" d="${ties}"></path>`).join('');

const NAME_PREFIXES =['Ber', 'Mont', 'Vel', 'Hal', 'Dor', 'Kes', 'Ant', 'Lor', 'Rou', 'Sant', 'Bre', 'Gen', 'Tul', 'Mar', 'Vau', 'Ost', 'Lin', 'Cor', 'Ham', 'Wes'];
const NAME_SUFFIXES = ['burg', 'ville', 'dorf', 'stad', 'court', 'heim', 'mont', 'wyck', 'bach', 'lay', 'ford', 'mar'];

/** Cosmetic place name derived from the Hex ID; carries no meaning for rules, scenarios or the OOB. */
export const placeNameFor = (hexId: string): string => {
  const random = seeded(`name:${hexId}`);
  return NAME_PREFIXES[Math.floor(random() * NAME_PREFIXES.length)]! + NAME_SUFFIXES[Math.floor(random() * NAME_SUFFIXES.length)]!;
};

/**
 * A built-up area as the printed map draws it: a dense cluster of dark building blocks sized by settlement
 * class, with a bold serif name to its right (cities and towns only, so villages do not clutter the map).
 */
export interface SettlementArt {
  readonly blocks: readonly { readonly x: number; readonly y: number; readonly width: number; readonly height: number; readonly rotate: number; readonly cx: number; readonly cy: number; readonly alt: boolean }[];
  readonly trees: readonly { readonly cx: number; readonly cy: number; readonly r: number }[];
  readonly name: { readonly text: string; readonly x: number; readonly y: number; readonly fontSize: number; readonly strokeWidth: number } | null;
}

/** Geometry of a built-up area, rounded as drawn. */
export const settlementArt = (cell: GeneratedMapPreviewCell, hexSize: number): SettlementArt | null => {
  if (!cell.settlement) return null;
  const round = (value: number): number => Number(fixed(value));
  const unit = hexSize / GLYPH_HEX_SIZE;
  const random = seeded(`settlement:${cell.id}`);
  const plan = {
    CITY: { blocks: 38, spread: 21, size: 3.6, font: 20 },
    TOWN: { blocks: 16, spread: 12, size: 3.2, font: 16 },
    VILLAGE: { blocks: 5, spread: 6, size: 3, font: 0 },
  }[cell.settlement];
  const blocks = Array.from({ length: plan.blocks }, (_, index) => {
    const angle = index * 2.4 + random();
    const distance = index === 0 ? 0 : plan.spread * Math.sqrt(index / plan.blocks) * unit;
    const width = (plan.size * (0.8 + random() * 1.1)) * unit;
    const height = (plan.size * (0.7 + random() * 0.9)) * unit;
    const x = cell.x + Math.cos(angle) * distance;
    const y = cell.y + Math.sin(angle) * distance * 0.9;
    const alt = random() < 0.22;
    return { x: round(x - width / 2), y: round(y - height / 2), width: round(width), height: round(height), rotate: Math.round(random() * 50 - 25), cx: round(x), cy: round(y), alt };
  });
  // Villages are a few houses among trees.
  const trees = cell.settlement === 'VILLAGE'
    ? Array.from({ length: 3 }, (_, index) => {
      const angle = index * 2.1 + random() * 1.2;
      return { cx: round(cell.x + Math.cos(angle) * 7.5 * unit), cy: round(cell.y + Math.sin(angle) * 6 * unit), r: round((2 + random()) * unit) };
    }) : [];
  const name = plan.font > 0
    ? { text: placeNameFor(cell.id), x: round(cell.x + (plan.spread + 6) * unit), y: round(cell.y + plan.font * 0.35 * unit), fontSize: round(plan.font * unit), strokeWidth: round(3 * unit) } : null;
  return { blocks, trees, name };
};

export const settlementArtHtml = (cell: GeneratedMapPreviewCell, hexSize: number): string => {
  const art = settlementArt(cell, hexSize);
  if (!art || !cell.settlement) return '';
  const blocks = art.blocks.map(({ x, y, width, height, rotate, cx, cy, alt }) =>
    `<rect class="settlement-block${alt ? ' alt' : ''}" x="${fixed(x)}" y="${fixed(y)}" width="${fixed(width)}" height="${fixed(height)}" transform="rotate(${rotate} ${fixed(cx)} ${fixed(cy)})"></rect>`).join('');
  const trees = art.trees.map(({ cx, cy, r }) => `<circle class="settlement-tree" cx="${fixed(cx)}" cy="${fixed(cy)}" r="${fixed(r)}"></circle>`).join('');
  const name = art.name
    ? `<text class="place-name ${cell.settlement.toLowerCase()}" x="${fixed(art.name.x)}" y="${fixed(art.name.y)}" font-size="${fixed(art.name.fontSize)}" stroke-width="${fixed(art.name.strokeWidth)}">${art.name.text}</text>` : '';
  return `${blocks}${trees}${name}`;
};

/** Victory objective: a gold star medallion in the hex's bottom point, the strip a stacked counter leaves uncovered. */
export const objectiveArt = (cell: GeneratedMapPreviewCell, hexSize: number): { readonly cx: number; readonly cy: number; readonly r: number; readonly star: readonly Point[] } => {
  const unit = hexSize / GLYPH_HEX_SIZE;
  const cx = cell.x;
  const cy = cell.y + 39 * unit;
  const star = Array.from({ length: 10 }, (_, index) => {
    const radius = (index % 2 === 0 ? 6 : 2.5) * unit;
    const angle = Math.PI / 5 * index - Math.PI / 2;
    return { x: Number(fixed(cx + Math.cos(angle) * radius)), y: Number(fixed(cy + Math.sin(angle) * radius)) };
  });
  return { cx: Number(fixed(cx)), cy: Number(fixed(cy)), r: Number(fixed(8.5 * unit)), star };
};

export const objectiveArtHtml = (cell: GeneratedMapPreviewCell, hexSize: number): string => {
  const { cx, cy, r, star } = objectiveArt(cell, hexSize);
  return `<circle cx="${fixed(cx)}" cy="${fixed(cy)}" r="${fixed(r)}"></circle><polygon points="${star.map(({ x, y }) => `${fixed(x)},${fixed(y)}`).join(' ')}"></polygon>`;
};

/**
 * Supply Source (12.6a): a disc in the owning side's colour lettered "S", in the hex's bottom point like the objective star.
 * A hex that is also an objective moves its disc up and left so both stay visible.
 */
export const supplySourceArt = (cell: GeneratedMapPreviewCell, hexSize: number, besideObjective = false): { readonly cx: number; readonly cy: number; readonly r: number; readonly fontSize: number } => {
  const unit = hexSize / GLYPH_HEX_SIZE;
  return {
    cx: Number(fixed(cell.x - (besideObjective ? 18 : 0) * unit)),
    cy: Number(fixed(cell.y + (besideObjective ? 32 : 39) * unit)),
    r: Number(fixed(8.5 * unit)),
    fontSize: Number(fixed(11 * unit)),
  };
};

export const supplySourceArtHtml = (cell: GeneratedMapPreviewCell, hexSize: number, besideObjective = false): string => {
  const { cx, cy, r, fontSize } = supplySourceArt(cell, hexSize, besideObjective);
  return `<circle cx="${fixed(cx)}" cy="${fixed(cy)}" r="${fixed(r)}"></circle><text x="${fixed(cx)}" y="${fixed(cy + fontSize * 0.36)}" font-size="${fixed(fontSize)}" text-anchor="middle">S</text>`;
};

/** Anchor of a port (19.0), drawn as strokes in a 24-unit box centred on 12,12. */
export const PORT_ANCHOR_PATH = 'M14.2 5a2.2 2.2 0 1 1-4.4 0a2.2 2.2 0 1 1 4.4 0M12 7.2V21M8 10.5h8M4.5 14.5a7.5 7.5 0 0 0 15 0M2.5 16l2-1.5 2 1.5M17.5 16l2-1.5 2 1.5';

/** A port's anchor sits on a pale disc at the hex's left, clear of the hex number, the place's name and the bottom marks. */
export const portArt = (cell: GeneratedMapPreviewCell, hexSize: number): { readonly cx: number; readonly cy: number; readonly r: number; readonly scale: number } => {
  const unit = hexSize / GLYPH_HEX_SIZE;
  return { cx: Number(fixed(cell.x - 25 * unit)), cy: Number(fixed(cell.y - 13 * unit)), r: Number(fixed(12.5 * unit)), scale: Number(fixed(18 * unit / 24)) };
};

export const portArtHtml = (cell: GeneratedMapPreviewCell, hexSize: number): string => {
  const { cx, cy, r, scale } = portArt(cell, hexSize);
  return `<circle cx="${fixed(cx)}" cy="${fixed(cy)}" r="${fixed(r)}"></circle><path d="${PORT_ANCHOR_PATH}" transform="translate(${fixed(cx - 12 * scale)} ${fixed(cy - 12 * scale)}) scale(${fixed(scale)})"></path>`;
};

/** Entry / supply zone: a band in the owning side's colour along the hex's inner rim. */
export const strategicBandCorners = (cell: GeneratedMapPreviewCell, hexSize: number): Point[] =>
  Array.from({ length: 6 }, (_, index) => {
    const radians = Math.PI / 180 * (60 * index - 30);
    return { x: Number(fixed(cell.x + hexSize * 0.86 * Math.cos(radians))), y: Number(fixed(cell.y + hexSize * 0.86 * Math.sin(radians))) };
  });

export const strategicBandPoints = (cell: GeneratedMapPreviewCell, hexSize: number): string =>
  strategicBandCorners(cell, hexSize).map(({ x, y }) => `${fixed(x)},${fixed(y)}`).join(' ');

/** Axial neighbour across each pointy-top hexside; side i joins vertex i and i + 1 (vertex 0 at -30°). */
const SIDE_NEIGHBOURS: readonly (readonly [number, number])[] = [[1, 0], [0, 1], [-1, 1], [-1, 0], [0, -1], [1, -1]];

/** Hexside path data (on the nudged corners the fills use) wherever `isEdge(cell, neighbour)` holds; map-edge sides are skipped. */
const boundaryPath = (
  cells: readonly GeneratedMapPreviewCell[], hexSize: number,
  isEdge: (cell: GeneratedMapPreviewCell, neighbour: GeneratedMapPreviewCell) => boolean,
): string => {
  const byId = new Map(cells.map((cell) => [cell.id, cell]));
  const vertex = (cell: GeneratedMapPreviewCell, index: number): string => {
    const { x, y } = cornerOf(cell, index, hexSize);
    return `${fixed(x)} ${fixed(y)}`;
  };
  return cells.flatMap((cell) => {
    const [q, r] = cell.id.split(',').map(Number);
    return SIDE_NEIGHBOURS.flatMap(([dq, dr], side) => {
      const neighbour = byId.get(`${q! + dq},${r! + dr}`);
      return neighbour && isEdge(cell, neighbour) ? [`M${vertex(cell, side)}L${vertex(cell, (side + 1) % 6)}`] : [];
    });
  }).join('');
};

/** Shoreline along every hexside where water meets land; the map edge is left open. */
export const coastlinePath = (cells: readonly GeneratedMapPreviewCell[], hexSize: number): string =>
  boundaryPath(cells, hexSize, (cell, neighbour) => cell.terrain === 'WATER' && neighbour.terrain !== 'WATER');

export const coastlineHtml = (cells: readonly GeneratedMapPreviewCell[], hexSize: number): string => {
  const d = coastlinePath(cells, hexSize);
  return d ? `<path class="coastline" d="${d}" aria-hidden="true"></path>` : '';
};

const REGION_RANK = { MOUNTAIN: 3, ROUGH: 2, WOODS: 1 } as const;

/**
 * A fine darker fringe where woods, rough ground or mountains meet other ground, like the printed map's
 * outlined forests. Where two such regions touch, only the higher-ranked one draws the shared side.
 */
export const regionEdgePaths = (cells: readonly GeneratedMapPreviewCell[], hexSize: number): { readonly kind: keyof typeof REGION_RANK; readonly d: string }[] =>
  (['WOODS', 'ROUGH', 'MOUNTAIN'] as const).map((kind) => ({
    kind,
    d: boundaryPath(cells, hexSize, (cell, neighbour) => cell.terrain === kind && neighbour.terrain !== kind
      && (REGION_RANK[neighbour.terrain as keyof typeof REGION_RANK] ?? 0) < REGION_RANK[kind]),
  })).filter(({ d }) => d !== '');

export const regionEdgesHtml = (cells: readonly GeneratedMapPreviewCell[], hexSize: number): string =>
  regionEdgePaths(cells, hexSize).map(({ kind, d }) => `<path class="region-edge ${kind.toLowerCase()}" d="${d}"></path>`).join('');

/** The printed hex grid: one hairline path over the regular hexsides, each side drawn once. */
export const hexGridPath = (cells: readonly GeneratedMapPreviewCell[], hexSize: number): string => {
  const seen = new Set<string>();
  const segments: string[] = [];
  cells.forEach((cell) => {
    const corners = Array.from({ length: 6 }, (_, index) => {
      const radians = Math.PI / 180 * (60 * index - 30);
      return { x: cell.x + hexSize * Math.cos(radians), y: cell.y + hexSize * Math.sin(radians) };
    });
    corners.forEach((from, index) => {
      const to = corners[(index + 1) % 6]!;
      const key = [pointKey(from.x, from.y), pointKey(to.x, to.y)].sort().join('|');
      if (seen.has(key)) return;
      seen.add(key);
      segments.push(`M${fixed(from.x)} ${fixed(from.y)}L${fixed(to.x)} ${fixed(to.y)}`);
    });
  });
  return segments.join('');
};

export const hexGridHtml = (cells: readonly GeneratedMapPreviewCell[], hexSize: number): string =>
  `<path class="hex-grid" d="${hexGridPath(cells, hexSize)}" aria-hidden="true"></path>`;

/** The hex's printed number, set small at the top of the hex where a counter leaves it uncovered. */
export const hexNumberPlacement = (cell: GeneratedMapPreviewCell, hexSize: number): { readonly x: number; readonly y: number; readonly fontSize: number } =>
  ({ x: Number(fixed(cell.x)), y: Number(fixed(cell.y - 33 * hexSize / GLYPH_HEX_SIZE)), fontSize: Number(fixed(10 * hexSize / GLYPH_HEX_SIZE)) });

export const hexNumberHtml = (cell: GeneratedMapPreviewCell, label: string, hexSize: number): string => {
  const { x, y, fontSize } = hexNumberPlacement(cell, hexSize);
  return `<text class="hex-coordinate" x="${fixed(x)}" y="${fixed(y)}" font-size="${fixed(fontSize)}" text-anchor="middle">${label}</text>`;
};
