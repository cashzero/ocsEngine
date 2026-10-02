import { counterLod, type CounterLod } from './counter.js';
import {
  WAVE_GLYPH_PATH, coastlinePath, hexGridPath, hexNumberPlacement, mapArtDefsHtml, objectiveArt, regionEdgePaths, riverStrokes, roadStrokes,
  settlementArt, strategicBandCorners, terrainFillCorners, terrainGlyphPlacements, type Point,
} from './map-art.js';
import type { GeneratedMapPreview, GeneratedMapPreviewCell } from './map-generator-presenter.js';

/**
 * The theater map, drawn on one canvas.
 *
 * The printed terrain never changes during a game, so it is painted once per zoom level into cached tiles (a ground layer, then
 * lines and labels); panning only copies tiles. Hexes, highlights and counters are drawn over the tiles each frame from a
 * small state object, and clicks are resolved with hex arithmetic rather than by the browser hit-testing thousands of nodes.
 * The artwork comes from map-art.ts and counter.ts, the same sources as the SVG New Game preview: pattern tiles and counters
 * are rasterized from their SVG once and reused.
 */

export interface MapScene {
  readonly theater: GeneratedMapPreview;
  readonly objectiveHexIds: readonly string[];
  readonly hexLabel: (hexId: string) => string;
  /** One line describing a hex for screen readers and the keyboard cursor. */
  readonly describeHex: (hexId: string) => string;
}

export interface MapCounter {
  readonly pieceId: string;
  readonly hexId: string;
  /** Top-left corner in map units; the counter art is 100 units square, drawn at `scale`. */
  readonly x: number;
  readonly y: number;
  readonly scale: number;
  /** counterSvgBody() markup; identical bodies share one bitmap. */
  readonly body: string;
  readonly selected: boolean;
  readonly label: string;
}

export interface MapState {
  readonly selectedHexId: string | null;
  readonly reachable: ReadonlyMap<string, { readonly endsMovement: boolean }>;
  /** Hexes whose ground recedes while a unit's range is shown. */
  readonly dimmed: ReadonlySet<string>;
  readonly attack: ReadonlySet<string>;
  readonly barrage: ReadonlySet<string>;
  readonly placement: ReadonlySet<string>;
  readonly retreat: ReadonlySet<string>;
  /** The hex of a supply source the player is pointing at in the deck. */
  readonly highlight: ReadonlySet<string>;
  readonly airTargets: ReadonlySet<string>;
  readonly destinationHexId: string | null;
  /** The hex of an attack being planned or resolved. */
  readonly targetHexIds: ReadonlySet<string>;
  readonly path: readonly string[];
  readonly ownZone: ReadonlySet<string>;
  readonly enemyZone: ReadonlySet<string>;
  readonly trainbusting: readonly { readonly hexId: string; readonly own: boolean }[];
  /** Back to front; the selected counter last. */
  readonly counters: readonly MapCounter[];
  readonly badges: readonly { readonly hexId: string; readonly count: number }[];
}

export interface MapEvents {
  readonly hexClick: (hexId: string) => void;
  readonly counterClick: (pieceId: string, hexId: string) => void;
  readonly hover: (hexId: string | null) => void;
  /** The camera moved or the canvas was resized: anchored popups must follow. */
  readonly cameraChange: () => void;
}

export const EMPTY_MAP_STATE: MapState = {
  selectedHexId: null, reachable: new Map(), dimmed: new Set(), attack: new Set(), barrage: new Set(), placement: new Set(), retreat: new Set(), highlight: new Set(),
  airTargets: new Set(), destinationHexId: null, targetHexIds: new Set(), path: [], ownZone: new Set(), enemyZone: new Set(), trainbusting: [], counters: [], badges: [],
};

/** Internal scale of the normal framing; the zoom readout is relative to it, so this framing reads 100%. */
export const DEFAULT_ZOOM = 1.4;
const MIN_ZOOM = 0.6 * DEFAULT_ZOOM;
const MAX_ZOOM = 2.6 * DEFAULT_ZOOM;
const TILE = 512;
const MAX_TILES = 96;
/** Pattern tiles are rasterized once at this many pixels per map unit, then resampled for each zoom level. */
const PATTERN_MASTER_SCALE = 4;
const MAX_COUNTER_BITMAPS = 600;
const DRAG_THRESHOLD = 6;
const TERRAINS = ['clear', 'woods', 'rough', 'mountain', 'marsh', 'water'] as const;
const SQRT3 = Math.sqrt(3);
/** Room around a tile for art that spills over it: the map shadow, river banks, place names. */
const GROUND_MARGIN = 80;
const LINES_MARGIN = 140;

type Ctx = CanvasRenderingContext2D;
interface Tile { readonly ground: HTMLCanvasElement; readonly lines: HTMLCanvasElement }
interface Geometry {
  readonly byId: ReadonlyMap<string, GeneratedMapPreviewCell>;
  readonly hexPath: ReadonlyMap<string, Path2D>;
  readonly fillCorners: ReadonlyMap<string, readonly Point[]>;
  readonly origin: Point;
  readonly grid: Path2D;
  readonly coast: Path2D | null;
  readonly regionEdges: readonly { readonly kind: string; readonly path: Path2D }[];
  readonly rivers: readonly { readonly kind: string; readonly path: Path2D }[];
  readonly roads: readonly { readonly kind: string; readonly path: Path2D }[];
  readonly objectives: ReadonlySet<string>;
}

const canvasOf = (width: number, height = width): HTMLCanvasElement => {
  const canvas = document.createElement('canvas');
  canvas.width = Math.max(1, Math.ceil(width));
  canvas.height = Math.max(1, Math.ceil(height));
  return canvas;
};

const context = (canvas: HTMLCanvasElement): Ctx => {
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('Canvas 2D is not available.');
  return ctx;
};

const svgImage = async (markup: string): Promise<HTMLImageElement> => {
  const image = new Image();
  image.src = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(markup)}`;
  await image.decode();
  return image;
};

const polygon = (points: readonly Point[]): Path2D => {
  const path = new Path2D();
  points.forEach(({ x, y }, index) => (index === 0 ? path.moveTo(x, y) : path.lineTo(x, y)));
  path.closePath();
  return path;
};

const regularCorners = (cell: GeneratedMapPreviewCell, size: number, scale = 1): Point[] => Array.from({ length: 6 }, (_, index) => {
  const radians = Math.PI / 180 * (60 * index - 30);
  return { x: cell.x + size * scale * Math.cos(radians), y: cell.y + size * scale * Math.sin(radians) };
});

/** Zoom levels step by √2; level k paints at 2^(k/2) pixels per map unit. */
const levelScale = (level: number): number => 2 ** (level / 2);

/** Rules of the page stylesheets that style counter artwork, for counters rasterized outside the document. */
const counterCss = (): string => {
  const pattern = /counter|symbol|category-|move-band|formation-band|tracked-box|barrage-box|re-dot|load-|air-|nation-|mobility|concealed/u;
  const rules: string[] = [];
  for (const sheet of [...document.styleSheets]) {
    let list: CSSRuleList;
    try { list = sheet.cssRules; } catch { continue; }
    for (const rule of [...list]) if (rule instanceof CSSStyleRule && pattern.test(rule.selectorText)) rules.push(rule.cssText);
  }
  // The drop shadow is drawn by the map (a filter would be clipped at the bitmap's edge).
  return `${rules.join('\n')}\n.counter { filter: none !important; }`;
};

export class MapView {
  readonly canvas: HTMLCanvasElement;
  readonly camera = { zoom: DEFAULT_ZOOM, x: 0, y: 0 };
  readonly #host: HTMLElement;
  readonly #events: MapEvents;
  readonly #live: HTMLElement;
  readonly #ctx: Ctx;
  #scene: MapScene | null = null;
  #geometry: Geometry | null = null;
  #state: MapState = EMPTY_MAP_STATE;
  #ready = false;
  #ready$: Promise<void> = Promise.resolve();
  #cssWidth = 0;
  #cssHeight = 0;
  #dpr = 1;
  #patternMasters = new Map<string, { readonly canvas: HTMLCanvasElement; readonly width: number; readonly height: number }>();
  #levelPatterns = new Map<number, Map<string, CanvasPattern | string>>();
  #tiles = new Map<string, Tile>();
  #coarseLevel = 0;
  #counterCss: string | null = null;
  #counterBitmaps = new Map<string, HTMLCanvasElement | null>();
  #frame: number | null = null;
  #hoverHex: string | null = null;
  #hoverCounter: string | null = null;
  #cursorHex: string | null = null;
  #drag: { readonly x: number; readonly y: number; readonly cameraX: number; readonly cameraY: number; moved: boolean } | null = null;
  #playerColors: readonly [string, string] = ['#d9b54a', '#7fb2e5'];

  constructor(host: HTMLElement, events: MapEvents) {
    this.#host = host;
    this.#events = events;
    this.canvas = document.createElement('canvas');
    this.canvas.id = 'hex-map';
    this.canvas.tabIndex = 0;
    this.canvas.setAttribute('role', 'application');
    this.canvas.setAttribute('aria-roledescription', 'hex map');
    this.canvas.setAttribute('aria-label', 'Hex map. Click a unit to select it, a highlighted hex to move, a ringed enemy hex to attack. Arrow keys move the hex cursor; Enter acts on it.');
    this.#ctx = context(this.canvas);
    this.#live = document.createElement('div');
    this.#live.className = 'visually-hidden';
    this.#live.setAttribute('aria-live', 'polite');
    host.prepend(this.canvas, this.#live);
    this.#bindInput();
    new ResizeObserver(() => this.#resize()).observe(host);
    // The page wiring the events may still be initialising; the first observed size notifies it.
    this.#resize(false);
  }

  /** Draw a new game's map. Resolves once its terrain can be painted. */
  setScene(scene: MapScene): Promise<void> {
    this.#scene = scene;
    this.#ready = false;
    this.#tiles.clear();
    this.#levelPatterns.clear();
    this.#hoverHex = null;
    this.#hoverCounter = null;
    this.#cursorHex = null;
    const { theater } = scene;
    const size = theater.layout.hexSize;
    const first = theater.cells[0];
    const [q, r] = (first?.id ?? '0,0').split(',').map(Number);
    const style = getComputedStyle(document.documentElement);
    this.#playerColors = [style.getPropertyValue('--player-one').trim() || this.#playerColors[0], style.getPropertyValue('--player-two').trim() || this.#playerColors[1]];
    this.#geometry = {
      byId: new Map(theater.cells.map((cell) => [cell.id, cell])),
      hexPath: new Map(theater.cells.map((cell) => [cell.id, polygon(regularCorners(cell, size))])),
      fillCorners: new Map(theater.cells.map((cell) => [cell.id, terrainFillCorners(cell, size)])),
      origin: first ? { x: first.x - size * SQRT3 * (q! + r! / 2), y: first.y - size * 1.5 * r! } : { x: 0, y: 0 },
      grid: new Path2D(hexGridPath(theater.cells, size)),
      coast: (() => { const d = coastlinePath(theater.cells, size); return d ? new Path2D(d) : null; })(),
      regionEdges: regionEdgePaths(theater.cells, size).map(({ kind, d }) => ({ kind, path: new Path2D(d) })),
      rivers: riverStrokes(theater.edges, size).map(({ kind, d }) => ({ kind, path: new Path2D(d) })),
      roads: roadStrokes(theater.edges, theater.cells, size).map(({ kind, d }) => ({ kind, path: new Path2D(d) })),
      objectives: new Set(scene.objectiveHexIds),
    };
    this.resetCamera();
    this.#ready$ = this.#loadPatterns().then(() => {
      if (this.#scene !== scene) return;
      // A coarse copy of the whole map, so a newly exposed area never shows blank while its detailed tiles are painted.
      this.#coarseLevel = Math.floor(2 * Math.log2(1024 / Math.max(theater.layout.width, theater.layout.height, 1)));
      this.#visibleTiles(this.#coarseLevel, true).forEach(({ tx, ty }) => this.#tile(this.#coarseLevel, tx, ty));
      this.#ready = true;
      this.requestRender();
    });
    this.requestRender();
    return this.#ready$;
  }

  /** Resolves when the terrain and every counter on show have been drawn at least once. */
  async whenDrawn(): Promise<void> {
    await this.#ready$;
    await Promise.all(this.#state.counters.map((counter) => this.#counterBitmap(counter.body)));
    await new Promise((resolve) => requestAnimationFrame(resolve));
  }

  /** What the map shows now: highlights, targets and counters (read by scripted acceptance runs). */
  get state(): MapState { return this.#state; }

  update(state: MapState): void {
    this.#state = state;
    if (this.#cursorHex === null) this.#cursorHex = state.selectedHexId;
    this.requestRender();
  }

  // ---------------------------------------------------------------- camera

  resetCamera(): void {
    const layout = this.#scene?.theater.layout;
    this.camera.zoom = DEFAULT_ZOOM;
    this.camera.x = ((layout?.width ?? 0) / 2) * (1 - DEFAULT_ZOOM);
    this.camera.y = ((layout?.height ?? 0) / 2) * (1 - DEFAULT_ZOOM);
    this.#cameraMoved();
  }

  get zoomPercent(): number { return Math.round((this.camera.zoom / DEFAULT_ZOOM) * 100); }

  /** Detail level of the counters at the current zoom (counter.ts). */
  get lod(): CounterLod { return counterLod(70 * this.#fit() * this.camera.zoom); }

  /** Zoom keeping the point under (anchorX, anchorY), in framing units, fixed on screen. */
  zoomAt(factor: number, anchorX?: number, anchorY?: number): void {
    const layout = this.#scene?.theater.layout;
    const ax = anchorX ?? (layout?.width ?? 0) / 2;
    const ay = anchorY ?? (layout?.height ?? 0) / 2;
    const next = Math.max(MIN_ZOOM, Math.min(MAX_ZOOM, this.camera.zoom * factor));
    const ratio = next / this.camera.zoom;
    this.camera.x = ax - (ax - this.camera.x) * ratio;
    this.camera.y = ay - (ay - this.camera.y) * ratio;
    this.camera.zoom = next;
    this.#cameraMoved();
  }

  /** The hex's bounding box in client (viewport) pixels, for popups anchored beside it. */
  hexClientRect(hexId: string): DOMRect | null {
    const cell = this.#geometry?.byId.get(hexId);
    const size = this.#scene?.theater.layout.hexSize;
    if (!cell || size === undefined) return null;
    const frame = this.canvas.getBoundingClientRect();
    const a = this.#toCss(cell.x - size * SQRT3 / 2, cell.y - size);
    const b = this.#toCss(cell.x + size * SQRT3 / 2, cell.y + size);
    return new DOMRect(frame.left + a.x, frame.top + a.y, b.x - a.x, b.y - a.y);
  }

  /** Where each counter is drawn, in client pixels, for scripted checks that click it with real input. */
  counterClientRects(): { readonly pieceId: string; readonly hexId: string; readonly label: string; readonly rect: DOMRect }[] {
    const frame = this.canvas.getBoundingClientRect();
    return this.#state.counters.map(({ pieceId, hexId, label, x, y, scale }) => {
      const a = this.#toCss(x, y);
      const b = this.#toCss(x + 100 * scale, y + 100 * scale);
      return { pieceId, hexId, label, rect: new DOMRect(frame.left + a.x, frame.top + a.y, b.x - a.x, b.y - a.y) };
    });
  }

  // ---------------------------------------------------------------- coordinates

  /** CSS pixels per framing unit: the map is fitted into the canvas like an SVG viewBox (xMidYMid meet). */
  #fit(): number {
    const layout = this.#scene?.theater.layout;
    if (!layout || this.#cssWidth === 0 || this.#cssHeight === 0) return 1;
    return Math.min(this.#cssWidth / layout.width, this.#cssHeight / layout.height);
  }

  #frameOffset(): Point {
    const layout = this.#scene?.theater.layout;
    const fit = this.#fit();
    return layout ? { x: (this.#cssWidth - layout.width * fit) / 2, y: (this.#cssHeight - layout.height * fit) / 2 } : { x: 0, y: 0 };
  }

  #toCss(x: number, y: number): Point {
    const fit = this.#fit();
    const offset = this.#frameOffset();
    return { x: offset.x + fit * (this.camera.x + this.camera.zoom * x), y: offset.y + fit * (this.camera.y + this.camera.zoom * y) };
  }

  /** Canvas CSS pixel to framing units (before the camera), the space zoomAt anchors in. */
  #toFraming(cssX: number, cssY: number): Point {
    const fit = this.#fit();
    const offset = this.#frameOffset();
    return { x: (cssX - offset.x) / fit, y: (cssY - offset.y) / fit };
  }

  #toMap(cssX: number, cssY: number): Point {
    const framing = this.#toFraming(cssX, cssY);
    return { x: (framing.x - this.camera.x) / this.camera.zoom, y: (framing.y - this.camera.y) / this.camera.zoom };
  }

  /** Map units to device pixels. */
  #deviceScale(): number { return this.#fit() * this.camera.zoom * this.#dpr; }

  #hexAt(point: Point): string | null {
    const geometry = this.#geometry;
    const size = this.#scene?.theater.layout.hexSize;
    if (!geometry || size === undefined) return null;
    const r = (point.y - geometry.origin.y) / (size * 1.5);
    const q = (point.x - geometry.origin.x) / (size * SQRT3) - r / 2;
    let [rq, rr, rs] = [Math.round(q), Math.round(r), Math.round(-q - r)];
    const [dq, dr, ds] = [Math.abs(rq - q), Math.abs(rr - r), Math.abs(rs + q + r)];
    if (dq > dr && dq > ds) rq = -rr - rs;
    else if (dr > ds) rr = -rq - rs;
    const id = `${rq},${rr}`;
    return geometry.byId.has(id) ? id : null;
  }

  #counterAt(point: Point): MapCounter | null {
    const counters = this.#state.counters;
    for (let index = counters.length - 1; index >= 0; index -= 1) {
      const counter = counters[index]!;
      const side = 100 * counter.scale;
      if (point.x >= counter.x && point.x <= counter.x + side && point.y >= counter.y && point.y <= counter.y + side) return counter;
    }
    return null;
  }

  #isTarget(hexId: string): boolean {
    const state = this.#state;
    return state.reachable.has(hexId) || state.attack.has(hexId) || state.barrage.has(hexId) || state.placement.has(hexId)
      || state.retreat.has(hexId) || state.airTargets.has(hexId);
  }

  // ---------------------------------------------------------------- input

  #bindInput(): void {
    const canvas = this.canvas;
    const local = (event: MouseEvent): Point => { const box = canvas.getBoundingClientRect(); return { x: event.clientX - box.left, y: event.clientY - box.top }; };
    canvas.addEventListener('pointerdown', (event) => {
      if (event.button !== 0) return;
      this.#drag = { x: event.clientX, y: event.clientY, cameraX: this.camera.x, cameraY: this.camera.y, moved: false };
    });
    canvas.addEventListener('pointermove', (event) => {
      const drag = this.#drag;
      if (drag && (event.buttons & 1) === 1) {
        if (!drag.moved && Math.hypot(event.clientX - drag.x, event.clientY - drag.y) < DRAG_THRESHOLD) return;
        if (!drag.moved) { drag.moved = true; canvas.setPointerCapture(event.pointerId); canvas.classList.add('is-panning'); }
        const fit = this.#fit();
        this.camera.x = drag.cameraX + (event.clientX - drag.x) / fit;
        this.camera.y = drag.cameraY + (event.clientY - drag.y) / fit;
        this.#cameraMoved();
        return;
      }
      this.#hover(this.#toMap(local(event).x, local(event).y));
    });
    const finish = (event: PointerEvent, click: boolean): void => {
      const drag = this.#drag;
      this.#drag = null;
      canvas.classList.remove('is-panning');
      if (!drag || drag.moved || !click) return;
      const point = this.#toMap(local(event).x, local(event).y);
      const counter = this.#counterAt(point);
      // A counter on a hex that is itself a target acts on the hex, as the hex would (the caller decides).
      if (counter) { this.#events.counterClick(counter.pieceId, counter.hexId); return; }
      const hexId = this.#hexAt(point);
      if (hexId) { this.#cursorHex = hexId; this.#events.hexClick(hexId); }
    };
    canvas.addEventListener('pointerup', (event) => finish(event, event.button === 0));
    canvas.addEventListener('pointercancel', (event) => finish(event, false));
    canvas.addEventListener('pointerleave', () => { if (!this.#drag) this.#hover(null); });
    canvas.addEventListener('wheel', (event) => {
      event.preventDefault();
      const anchor = this.#toFraming(local(event).x, local(event).y);
      this.zoomAt(event.deltaY < 0 ? 1.12 : 1 / 1.12, anchor.x, anchor.y);
    }, { passive: false });
    canvas.addEventListener('keydown', (event) => this.#key(event));
    canvas.addEventListener('focus', () => { this.#cursorHex ??= this.#state.selectedHexId ?? this.#scene?.theater.cells[0]?.id ?? null; this.#announce(); this.requestRender(); });
    canvas.addEventListener('blur', () => this.requestRender());
  }

  #hover(point: Point | null): void {
    const counter = point ? this.#counterAt(point) : null;
    const hexId = point ? this.#hexAt(point) : null;
    const counterId = counter?.pieceId ?? null;
    this.canvas.style.cursor = counter || (hexId && this.#isTarget(hexId)) ? 'pointer' : '';
    if (hexId === this.#hoverHex && counterId === this.#hoverCounter) return;
    const hexChanged = hexId !== this.#hoverHex;
    this.#hoverHex = hexId;
    this.#hoverCounter = counterId;
    if (hexChanged && hexId) this.#events.hover(hexId);
    this.requestRender();
  }

  #key(event: KeyboardEvent): void {
    const cursor = this.#cursorHex ?? this.#state.selectedHexId ?? this.#scene?.theater.cells[0]?.id;
    if (!cursor) return;
    if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); this.#events.hexClick(cursor); return; }
    if (event.key === '+' || event.key === '=') { event.preventDefault(); this.zoomAt(1.2); return; }
    if (event.key === '-') { event.preventDefault(); this.zoomAt(1 / 1.2); return; }
    if (!['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown'].includes(event.key)) return;
    event.preventDefault();
    const [q, r] = cursor.split(',').map(Number);
    // Offset-rectangle navigation: left/right along the row, up/down keep the visual column.
    const nextR = r! + (event.key === 'ArrowDown' ? 1 : event.key === 'ArrowUp' ? -1 : 0);
    const column = q! + Math.floor(r! / 2) + (event.key === 'ArrowRight' ? 1 : event.key === 'ArrowLeft' ? -1 : 0);
    const next = `${column - Math.floor(nextR / 2)},${nextR}`;
    if (!this.#geometry?.byId.has(next)) return;
    this.#cursorHex = next;
    this.#events.hover(next);
    this.#announce();
    this.requestRender();
  }

  #announce(): void {
    if (this.#cursorHex && this.#scene) this.#live.textContent = this.#scene.describeHex(this.#cursorHex);
  }

  // ---------------------------------------------------------------- frame

  #resize(notify = true): void {
    const box = this.#host.getBoundingClientRect();
    this.#dpr = window.devicePixelRatio || 1;
    this.#cssWidth = box.width;
    this.#cssHeight = box.height;
    this.canvas.width = Math.max(1, Math.round(box.width * this.#dpr));
    this.canvas.height = Math.max(1, Math.round(box.height * this.#dpr));
    if (notify) this.#cameraMoved();
    else this.requestRender();
  }

  #cameraMoved(): void {
    this.requestRender();
    this.#events.cameraChange();
  }

  requestRender(): void {
    if (this.#frame !== null) return;
    // requestAnimationFrame does not fire in a hidden page; the timer keeps a background tab's map current.
    const run = () => { if (this.#frame === null) return; this.#frame = null; this.#render(); };
    this.#frame = requestAnimationFrame(run);
    setTimeout(() => { if (this.#frame !== null && document.hidden) run(); }, 100);
  }

  #render(): void {
    if ((window.devicePixelRatio || 1) !== this.#dpr) { this.#resize(); return; }
    const ctx = this.#ctx;
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
    if (!this.#scene || !this.#geometry || !this.#ready) return;
    const scale = this.#deviceScale();
    const level = Math.max(this.#coarseLevel, Math.ceil(2 * Math.log2(scale) - 1e-9));
    const started = performance.now();
    let pending = false;
    // Detailed tiles that are still missing are painted within a frame budget; the coarse map stands in meanwhile.
    const tiles = this.#visibleTiles(level).map(({ tx, ty }) => {
      const cached = this.#cachedTile(level, tx, ty);
      if (cached) return { tx, ty, tile: cached };
      if (performance.now() - started < 12) return { tx, ty, tile: this.#tile(level, tx, ty) };
      pending = true;
      return { tx, ty, tile: null };
    });
    const coarse = tiles.some(({ tile }) => tile === null) ? this.#visibleTiles(this.#coarseLevel).map(({ tx, ty }) => ({ tx, ty, tile: this.#cachedTile(this.#coarseLevel, tx, ty) })) : [];
    const blit = (layer: keyof Tile) => {
      coarse.forEach(({ tx, ty, tile }) => tile && this.#blit(tile[layer], this.#coarseLevel, tx, ty));
      tiles.forEach(({ tx, ty, tile }) => tile && this.#blit(tile[layer], level, tx, ty));
    };
    // Paint order follows the printed map: ground and grid, the highlighted hexes, then numbers, water, roads and towns over them.
    blit('ground');
    this.#withMapTransform(() => { this.#drawDimming(); this.#drawHexHighlights(); });
    blit('lines');
    this.#withMapTransform(() => {
      this.#drawHexNumbers();
      this.#drawAirMarks();
      this.#drawPath();
      this.#drawCounters();
      this.#drawBadges();
      this.#drawTargets();
      this.#drawCursor();
    });
    if (pending) this.requestRender();
  }

  /** Tile indices covering the canvas at `level` (or the whole map plus margin). */
  #visibleTiles(level: number, whole = false): { tx: number; ty: number }[] {
    const layout = this.#scene!.theater.layout;
    const span = TILE / levelScale(level);
    const topLeft = whole ? { x: -GROUND_MARGIN, y: -GROUND_MARGIN } : this.#toMap(0, 0);
    const bottomRight = whole ? { x: layout.width + GROUND_MARGIN, y: layout.height + GROUND_MARGIN } : this.#toMap(this.#cssWidth, this.#cssHeight);
    const clampX = (value: number) => Math.max(-GROUND_MARGIN, Math.min(layout.width + GROUND_MARGIN, value));
    const clampY = (value: number) => Math.max(-GROUND_MARGIN, Math.min(layout.height + GROUND_MARGIN, value));
    const tiles: { tx: number; ty: number }[] = [];
    for (let ty = Math.floor(clampY(topLeft.y) / span); ty <= Math.floor(clampY(bottomRight.y) / span); ty += 1) {
      for (let tx = Math.floor(clampX(topLeft.x) / span); tx <= Math.floor(clampX(bottomRight.x) / span); tx += 1) tiles.push({ tx, ty });
    }
    return tiles;
  }

  #cachedTile(level: number, tx: number, ty: number): Tile | null {
    const key = `${level}:${tx}:${ty}`;
    const tile = this.#tiles.get(key);
    if (!tile) return null;
    this.#tiles.delete(key);
    this.#tiles.set(key, tile);
    return tile;
  }

  /** Copy a tile to the canvas with edges rounded to device pixels, so neighbouring tiles meet without seams. */
  #blit(image: HTMLCanvasElement, level: number, tx: number, ty: number): void {
    const span = TILE / levelScale(level);
    const a = this.#toCss(tx * span, ty * span);
    const b = this.#toCss((tx + 1) * span, (ty + 1) * span);
    const left = Math.round(a.x * this.#dpr);
    const top = Math.round(a.y * this.#dpr);
    this.#ctx.drawImage(image, left, top, Math.round(b.x * this.#dpr) - left, Math.round(b.y * this.#dpr) - top);
  }

  #withMapTransform(draw: () => void): void {
    const ctx = this.#ctx;
    const scale = this.#deviceScale();
    const origin = this.#toCss(0, 0);
    ctx.save();
    ctx.setTransform(scale, 0, 0, scale, origin.x * this.#dpr, origin.y * this.#dpr);
    draw();
    ctx.restore();
  }

  /** Line width in map units that renders `pixels` CSS pixels wide (SVG's non-scaling stroke). */
  #px(pixels: number): number { return (pixels * this.#dpr) / this.#deviceScale(); }

  // ---------------------------------------------------------------- terrain tiles

  async #loadPatterns(): Promise<void> {
    if (this.#patternMasters.size > 0) return;
    const defs = mapArtDefsHtml();
    await Promise.all(TERRAINS.map(async (terrain) => {
      const match = new RegExp(`<pattern id="terrain-${terrain}" width="(\\d+)" height="(\\d+)"`, 'u').exec(defs);
      const width = Number(match?.[1] ?? 48);
      const height = Number(match?.[2] ?? 48);
      const image = await svgImage(`<svg xmlns="http://www.w3.org/2000/svg" width="${width * PATTERN_MASTER_SCALE}" height="${height * PATTERN_MASTER_SCALE}" viewBox="0 0 ${width} ${height}">${defs}<rect width="${width}" height="${height}" fill="url(#terrain-${terrain})"/></svg>`);
      const canvas = canvasOf(width * PATTERN_MASTER_SCALE, height * PATTERN_MASTER_SCALE);
      context(canvas).drawImage(image, 0, 0, canvas.width, canvas.height);
      this.#patternMasters.set(terrain, { canvas, width, height });
    }));
  }

  /** Ground patterns resampled for one zoom level, anchored at the map origin like the SVG userSpaceOnUse patterns. */
  #patterns(level: number): Map<string, CanvasPattern | string> {
    const cached = this.#levelPatterns.get(level);
    if (cached) return cached;
    const scale = levelScale(level);
    const patterns = new Map<string, CanvasPattern | string>();
    for (const [terrain, master] of this.#patternMasters) {
      const canvas = canvasOf(Math.max(1, Math.round(master.width * scale)), Math.max(1, Math.round(master.height * scale)));
      const ctx = context(canvas);
      ctx.imageSmoothingQuality = 'high';
      ctx.drawImage(master.canvas, 0, 0, canvas.width, canvas.height);
      const pattern = ctx.createPattern(canvas, 'repeat');
      if (pattern) { pattern.setTransform(new DOMMatrix().scale(master.width / canvas.width, master.height / canvas.height)); patterns.set(terrain, pattern); }
      else patterns.set(terrain, '#d3d4ab');
    }
    this.#levelPatterns.set(level, patterns);
    return patterns;
  }

  #tile(level: number, tx: number, ty: number): Tile {
    const key = `${level}:${tx}:${ty}`;
    const scale = levelScale(level);
    const span = TILE / scale;
    const x0 = tx * span;
    const y0 = ty * span;
    const tile = { ground: canvasOf(TILE), lines: canvasOf(TILE) };
    const cells = (margin: number) => this.#scene!.theater.cells.filter(({ x, y }) => x > x0 - margin && x < x0 + span + margin && y > y0 - margin && y < y0 + span + margin);
    const ground = context(tile.ground);
    ground.setTransform(scale, 0, 0, scale, -x0 * scale, -y0 * scale);
    this.#paintGround(ground, cells(GROUND_MARGIN), level, scale);
    const lines = context(tile.lines);
    lines.setTransform(scale, 0, 0, scale, -x0 * scale, -y0 * scale);
    this.#paintLines(lines, cells(LINES_MARGIN));
    this.#tiles.set(key, tile);
    // Keep the coarse map; drop the least recently used detailed tiles.
    for (const old of this.#tiles.keys()) {
      if (this.#tiles.size <= MAX_TILES) break;
      if (!old.startsWith(`${this.#coarseLevel}:`)) this.#tiles.delete(old);
    }
    return tile;
  }

  #paintGround(ctx: Ctx, cells: readonly GeneratedMapPreviewCell[], level: number, scale: number): void {
    const geometry = this.#geometry!;
    const size = this.#scene!.theater.layout.hexSize;
    const patterns = this.#patterns(level);
    // The printed sheet casts a soft shadow on the table (the old terrain layer's drop-shadow filter).
    ctx.save();
    ctx.shadowColor = 'rgba(0, 0, 0, .55)';
    ctx.shadowBlur = 14 * scale;
    ctx.shadowOffsetY = 4 * scale;
    ctx.fillStyle = '#d3d4ab';
    const outline = new Path2D();
    cells.forEach((cell) => outline.addPath(polygon(geometry.fillCorners.get(cell.id)!)));
    ctx.fill(outline);
    ctx.restore();
    // Each fill is stroked with its own pattern so a forest or sea reads as one region over the seams.
    ctx.lineWidth = 3;
    ctx.lineJoin = 'round';
    cells.forEach((cell) => {
      const path = polygon(geometry.fillCorners.get(cell.id)!);
      const pattern = patterns.get(cell.terrain.toLowerCase()) ?? '#d3d4ab';
      ctx.fillStyle = pattern;
      ctx.strokeStyle = pattern;
      ctx.fill(path);
      ctx.stroke(path);
    });
    const wave = new Path2D(WAVE_GLYPH_PATH);
    ctx.strokeStyle = '#d3ebf7';
    ctx.lineCap = 'round';
    cells.forEach((cell) => terrainGlyphPlacements(cell, size)?.placements.forEach(({ x, y, scale: glyphScale }) => {
      ctx.save();
      ctx.translate(x, y);
      ctx.scale(glyphScale, glyphScale);
      ctx.lineWidth = 1.3;
      ctx.stroke(wave);
      ctx.restore();
    }));
    // Forest and rough-ground fringes, then the hairline grid (both one pixel-ish whatever the zoom).
    const hairline = (pixels: number) => pixels / Math.max(scale, 1e-6);
    const regionColour: Record<string, string> = { WOODS: 'rgba(63, 98, 52, .85)', ROUGH: 'rgba(150, 110, 58, .75)', MOUNTAIN: 'rgba(92, 76, 56, .8)' };
    geometry.regionEdges.forEach(({ kind, path }) => { ctx.strokeStyle = regionColour[kind] ?? '#555'; ctx.lineWidth = hairline(1.4); ctx.stroke(path); });
    ctx.strokeStyle = 'rgba(255, 255, 255, .6)';
    ctx.lineWidth = hairline(1);
    ctx.lineCap = 'butt';
    ctx.stroke(geometry.grid);
  }

  #paintLines(ctx: Ctx, cells: readonly GeneratedMapPreviewCell[]): void {
    const geometry = this.#geometry!;
    const scene = this.#scene!;
    const size = scene.theater.layout.hexSize;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    // Printed hex numbers.
    cells.forEach((cell) => {
      const { x, y, fontSize } = hexNumberPlacement(cell, size);
      ctx.font = `700 ${fontSize}px ui-sans-serif, system-ui, sans-serif`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'alphabetic';
      ctx.lineWidth = 2;
      ctx.strokeStyle = 'rgba(235, 233, 200, .55)';
      ctx.fillStyle = 'rgba(33, 30, 18, .62)';
      const label = scene.hexLabel(cell.id);
      ctx.strokeText(label, x, y);
      ctx.fillText(label, x, y);
    });
    if (geometry.coast) { ctx.strokeStyle = '#4f8fb6'; ctx.lineWidth = 1.8; ctx.stroke(geometry.coast); }
    const stroke = (paths: Geometry['rivers'], styles: Record<string, readonly [string, number]>) => paths.forEach(({ kind, path }) => {
      const style = styles[kind];
      if (!style) return;
      ctx.strokeStyle = style[0];
      ctx.lineWidth = style[1];
      ctx.stroke(path);
    });
    // River banks then water; road casings then surfaces (minor roads first, as roadStrokes orders them).
    stroke(geometry.rivers, { RIVER: ['#2a62a0', 6], MAJOR_RIVER: ['#1f4f8c', 11.5] });
    stroke(geometry.rivers, { RIVER: ['#95cdee', 3.2], MAJOR_RIVER: ['#8cc7ec', 7.6] });
    stroke(geometry.roads, { ROAD: ['#1d150a', 6.4], PRIMARY_ROAD: ['#1d150a', 10.4] });
    stroke(geometry.roads, { ROAD: ['#c4ab5e', 3.4], PRIMARY_ROAD: ['#a88b35', 7.4] });
    cells.forEach((cell) => {
      if (cell.strategic) {
        ctx.save();
        ctx.globalAlpha = 0.9;
        ctx.strokeStyle = cell.strategic === 'SECOND' ? this.#playerColors[1] : this.#playerColors[0];
        ctx.lineWidth = 4.5;
        ctx.setLineDash([9, 5]);
        ctx.stroke(polygon(strategicBandCorners(cell, size)));
        ctx.restore();
      }
      const settlement = settlementArt(cell, size);
      if (settlement) {
        settlement.blocks.forEach(({ x, y, width, height, rotate, cx, cy, alt }) => {
          ctx.save();
          ctx.translate(cx, cy);
          ctx.rotate(rotate * Math.PI / 180);
          ctx.translate(-cx, -cy);
          ctx.fillStyle = cell.settlement === 'VILLAGE' ? '#4a3426' : alt ? '#5c564b' : '#2a2520';
          ctx.strokeStyle = 'rgba(236, 232, 200, .55)';
          ctx.lineWidth = 0.5;
          ctx.fillRect(x, y, width, height);
          ctx.strokeRect(x, y, width, height);
          ctx.restore();
        });
        settlement.trees.forEach(({ cx, cy, r }) => {
          ctx.beginPath();
          ctx.arc(cx, cy, r, 0, Math.PI * 2);
          ctx.fillStyle = '#5d7d3a';
          ctx.fill();
          ctx.strokeStyle = '#3f5a28';
          ctx.lineWidth = 0.6;
          ctx.stroke();
        });
        if (settlement.name) {
          const { text, x, y, fontSize, strokeWidth } = settlement.name;
          ctx.font = `${cell.settlement === 'TOWN' ? 700 : 800} ${fontSize}px Georgia, 'Times New Roman', serif`;
          ctx.textAlign = 'start';
          ctx.lineWidth = strokeWidth;
          ctx.strokeStyle = 'rgba(236, 235, 205, .85)';
          ctx.fillStyle = '#15120a';
          ctx.strokeText(text, x, y);
          ctx.fillText(text, x, y);
        }
      }
      if (geometry.objectives.has(cell.id)) {
        const { cx, cy, r, star } = objectiveArt(cell, size);
        ctx.beginPath();
        ctx.arc(cx, cy, r, 0, Math.PI * 2);
        ctx.fillStyle = '#2a2112';
        ctx.fill();
        ctx.strokeStyle = '#ffd766';
        ctx.lineWidth = 1.8;
        ctx.stroke();
        ctx.fillStyle = '#ffd766';
        ctx.fill(polygon(star));
      }
    });
  }

  // ---------------------------------------------------------------- dynamic layers

  /** Out-of-range ground recedes: brightness .55 and saturation .6, as the old per-hex CSS filter did. */
  #drawDimming(): void {
    const { dimmed } = this.#state;
    if (dimmed.size === 0) return;
    const ctx = this.#ctx;
    const path = new Path2D();
    dimmed.forEach((hexId) => { const corners = this.#geometry!.fillCorners.get(hexId); if (corners) path.addPath(polygon(corners)); });
    ctx.save();
    ctx.globalCompositeOperation = 'multiply';
    ctx.fillStyle = 'rgb(140, 140, 140)';
    ctx.fill(path);
    ctx.globalCompositeOperation = 'saturation';
    ctx.globalAlpha = 0.4;
    ctx.fillStyle = 'rgb(128, 128, 128)';
    ctx.fill(path);
    ctx.restore();
  }

  #hexStyle(hexId: string): { fill: string | null; stroke: string | null; width: number; dash: number[]; scaling: boolean } | null {
    const state = this.#state;
    const reach = state.reachable.get(hexId);
    if (reach) return reach.endsMovement
      ? { fill: 'rgba(255, 255, 255, .16)', stroke: '#ffc66b', width: 3, dash: [3, 3], scaling: false }
      : { fill: 'rgba(255, 255, 255, .16)', stroke: '#b9f2d5', width: 3.5, dash: [], scaling: false };
    if (state.airTargets.has(hexId)) return { fill: hexId === state.selectedHexId || hexId === this.#hoverHex ? 'rgba(255, 255, 255, .22)' : null, stroke: '#5aa0d8', width: 5, dash: [8, 5], scaling: true };
    if (hexId === state.selectedHexId || hexId === this.#hoverHex) return { fill: 'rgba(255, 255, 255, .22)', stroke: '#fff2b8', width: 3, dash: [], scaling: false };
    return null;
  }

  #styledHexes(): string[] {
    const state = this.#state;
    return [...new Set([...state.reachable.keys(), ...state.airTargets, state.selectedHexId, this.#hoverHex].filter((id): id is string => id !== null))];
  }

  #drawHexHighlights(): void {
    const ctx = this.#ctx;
    this.#styledHexes().forEach((hexId) => {
      const style = this.#hexStyle(hexId);
      const path = this.#geometry!.hexPath.get(hexId);
      if (!style?.fill || !path) return;
      ctx.fillStyle = style.fill;
      ctx.fill(path);
    });
    this.#styledHexes().forEach((hexId) => {
      const style = this.#hexStyle(hexId);
      const path = this.#geometry!.hexPath.get(hexId);
      if (!style?.stroke || !path) return;
      const unit = style.scaling ? 1 : this.#px(1);
      ctx.strokeStyle = style.stroke;
      ctx.lineWidth = style.width * unit;
      ctx.lineJoin = 'round';
      ctx.setLineDash(style.dash.map((value) => value * unit));
      ctx.stroke(path);
    });
    ctx.setLineDash([]);
  }

  /** The selected and hovered hexes print their number darker, over the paler one in the tiles. */
  #drawHexNumbers(): void {
    const ctx = this.#ctx;
    const scene = this.#scene!;
    new Set([this.#state.selectedHexId, this.#hoverHex]).forEach((hexId) => {
      const cell = hexId ? this.#geometry!.byId.get(hexId) : undefined;
      if (!cell) return;
      const { x, y, fontSize } = hexNumberPlacement(cell, scene.theater.layout.hexSize);
      ctx.font = `700 ${fontSize}px ui-sans-serif, system-ui, sans-serif`;
      ctx.textAlign = 'center';
      ctx.lineWidth = 2;
      ctx.lineJoin = 'round';
      ctx.strokeStyle = 'rgba(255, 249, 214, .95)';
      ctx.fillStyle = '#15120a';
      ctx.strokeText(scene.hexLabel(cell.id), x, y);
      ctx.fillText(scene.hexLabel(cell.id), x, y);
    });
  }

  #drawAirMarks(): void {
    const ctx = this.#ctx;
    const size = this.#scene!.theater.layout.hexSize;
    const zone = (hexIds: ReadonlySet<string>, scale: number, fill: string, stroke: string) => hexIds.forEach((hexId) => {
      const cell = this.#geometry!.byId.get(hexId);
      if (!cell) return;
      ctx.save();
      ctx.globalAlpha = 0.9;
      ctx.fillStyle = fill;
      ctx.strokeStyle = stroke;
      ctx.lineWidth = 3 * scale;
      ctx.setLineDash([6 * scale, 4 * scale]);
      const path = polygon(regularCorners(cell, size, scale));
      ctx.fill(path);
      ctx.stroke(path);
      ctx.restore();
    });
    zone(this.#state.ownZone, 0.86, 'rgba(90, 160, 216, .16)', '#5aa0d8');
    zone(this.#state.enemyZone, 0.78, 'rgba(224, 107, 90, .16)', '#e06b5a');
    this.#state.trainbusting.forEach(({ hexId }) => {
      const cell = this.#geometry!.byId.get(hexId);
      if (!cell) return;
      ctx.beginPath();
      ctx.roundRect(cell.x + 8, cell.y + 8, 30, 18, 3);
      ctx.fillStyle = '#3b2c1f';
      ctx.fill();
      ctx.strokeStyle = '#f0d48a';
      ctx.lineWidth = 2;
      ctx.stroke();
      ctx.fillStyle = '#f0d48a';
      ctx.font = '700 13px ui-sans-serif, system-ui, sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText('TB', cell.x + 23, cell.y + 21);
    });
  }

  #drawPath(): void {
    const cells = this.#state.path.map((hexId) => this.#geometry!.byId.get(hexId)).filter((cell) => cell !== undefined);
    if (cells.length === 0) return;
    const ctx = this.#ctx;
    ctx.save();
    ctx.beginPath();
    cells.forEach(({ x, y }, index) => (index === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y)));
    ctx.strokeStyle = '#fff1c2';
    ctx.lineWidth = this.#px(5);
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.shadowColor = '#111';
    ctx.shadowBlur = 3 * this.#dpr;
    ctx.stroke();
    ctx.stroke();
    ctx.restore();
    const end = cells.at(-1)!;
    ctx.beginPath();
    ctx.arc(end.x, end.y, 7, 0, Math.PI * 2);
    ctx.fillStyle = '#fff1c2';
    ctx.fill();
    ctx.strokeStyle = '#111';
    ctx.lineWidth = 2;
    ctx.stroke();
  }

  #drawCounters(): void {
    const ctx = this.#ctx;
    const deviceScale = this.#deviceScale();
    for (const counter of this.#state.counters) {
      const side = 100 * counter.scale;
      const bitmap = this.#counterBitmapNow(counter.body, side * deviceScale);
      ctx.save();
      ctx.shadowColor = 'rgba(0, 0, 0, .35)';
      ctx.shadowBlur = 3 * counter.scale * deviceScale;
      ctx.shadowOffsetY = 4 * counter.scale * deviceScale;
      if (bitmap) ctx.drawImage(bitmap, counter.x, counter.y, side, side);
      else {
        ctx.fillStyle = '#a7aba0';
        ctx.fillRect(counter.x, counter.y, side, side);
      }
      ctx.restore();
      if ((counter.selected || counter.pieceId === this.#hoverCounter) && counter.body.includes('counter-paper')) {
        ctx.strokeStyle = '#fff4cb';
        ctx.lineWidth = 4 * counter.scale;
        ctx.strokeRect(counter.x, counter.y, side, side);
      }
    }
  }

  #drawBadges(): void {
    const ctx = this.#ctx;
    this.#state.badges.forEach(({ hexId, count }) => {
      const cell = this.#geometry!.byId.get(hexId);
      if (!cell) return;
      const x = cell.x + 26;
      const y = cell.y - 34;
      ctx.beginPath();
      ctx.arc(x, y, 12, 0, Math.PI * 2);
      ctx.fillStyle = '#17211d';
      ctx.fill();
      ctx.strokeStyle = '#fff0bd';
      ctx.lineWidth = this.#px(2);
      ctx.stroke();
      ctx.fillStyle = '#fff0bd';
      ctx.font = '850 13px ui-sans-serif, system-ui, sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText(`+${count}`, x, y + 5);
    });
  }

  /** Target outlines sit above the counters so a stack never hides an entry, attack or retreat hex. */
  #drawTargets(): void {
    const ctx = this.#ctx;
    const state = this.#state;
    const hexIds = new Set([...state.attack, ...state.barrage, ...state.placement, ...state.retreat, ...state.highlight, ...state.targetHexIds, state.destinationHexId].filter((id): id is string => id !== null));
    ctx.save();
    ctx.lineJoin = 'round';
    ctx.shadowColor = 'rgba(0, 0, 0, .9)';
    ctx.shadowBlur = 4 * this.#dpr;
    hexIds.forEach((hexId) => {
      const path = this.#geometry!.hexPath.get(hexId);
      if (!path) return;
      // When a hex is several kinds of target at once, the later kind wins, as the CSS cascade did.
      const style = state.highlight.has(hexId) ? ['#ffe078', 6, []] as const
        : state.targetHexIds.has(hexId) ? ['#ffffff', 5, []] as const
        : hexId === state.destinationHexId ? ['#ffdc80', 4, []] as const
          : state.retreat.has(hexId) ? ['#ffe09a', 4, [10, 4]] as const
            : state.placement.has(hexId) ? ['#9ed0ff', 4, []] as const
              : state.barrage.has(hexId) ? ['#ffa24a', 4, [8, 5]] as const
                : ['#ff6b5b', 4, []] as const;
      ctx.strokeStyle = style[0];
      ctx.lineWidth = this.#px(style[1]);
      ctx.setLineDash(style[2].map((value) => this.#px(value)));
      ctx.stroke(path);
    });
    ctx.restore();
  }

  /** The keyboard cursor, shown only while the map has keyboard focus. */
  #drawCursor(): void {
    if (!this.#cursorHex || document.activeElement !== this.canvas || !this.canvas.matches(':focus-visible')) return;
    const path = this.#geometry!.hexPath.get(this.#cursorHex);
    if (!path) return;
    const ctx = this.#ctx;
    ctx.strokeStyle = '#ffffff';
    ctx.lineWidth = this.#px(3);
    ctx.setLineDash([this.#px(6), this.#px(4)]);
    ctx.stroke(path);
    ctx.setLineDash([]);
  }

  // ---------------------------------------------------------------- counter bitmaps

  /** Bitmaps come in a few sizes so a counter stays sharp at every zoom without one per pixel size. */
  #counterBucket(pixels: number): number { return [48, 96, 160, 256].find((size) => size >= pixels) ?? 256; }

  #counterKey(body: string, bucket: number): string { return `${this.lod}|${bucket}|${body}`; }

  #counterBitmapNow(body: string, pixels: number): HTMLCanvasElement | null {
    const bucket = this.#counterBucket(pixels);
    const key = this.#counterKey(body, bucket);
    const cached = this.#counterBitmaps.get(key);
    if (cached) return cached;
    if (cached === undefined) void this.#counterBitmap(body, bucket);
    // While a sharper size or another detail level is prepared, any bitmap already drawn for this counter stands in.
    for (const lod of [this.lod, 'full', 'ratings', 'symbol']) {
      for (const size of [256, 160, 96, 48]) {
        const fallback = this.#counterBitmaps.get(`${lod}|${size}|${body}`);
        if (fallback) return fallback;
      }
    }
    return null;
  }

  #counterBitmap(body: string, bucket = this.#counterBucket(100 * 0.7 * this.#deviceScale())): Promise<unknown> {
    const key = this.#counterKey(body, bucket);
    if (this.#counterBitmaps.has(key)) return Promise.resolve();
    this.#counterBitmaps.set(key, null);
    this.#counterCss ??= counterCss();
    const markup = `<svg xmlns="http://www.w3.org/2000/svg" width="${bucket}" height="${bucket}" viewBox="0 0 100 100" data-counter-lod="${this.lod}"><style>${this.#counterCss}</style><g class="counter">${body}</g></svg>`;
    const job = svgImage(markup).then((image) => {
      const canvas = canvasOf(bucket);
      context(canvas).drawImage(image, 0, 0, bucket, bucket);
      this.#counterBitmaps.set(key, canvas);
      for (const old of this.#counterBitmaps.keys()) {
        if (this.#counterBitmaps.size <= MAX_COUNTER_BITMAPS) break;
        this.#counterBitmaps.delete(old);
      }
      this.requestRender();
    }).catch(() => { this.#counterBitmaps.delete(key); });
    return job;
  }
}
