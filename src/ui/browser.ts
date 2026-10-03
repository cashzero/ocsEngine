import { html, nothing, render as renderTemplate, type TemplateResult } from 'lit-html';
import { keyed } from 'lit-html/directives/keyed.js';
import { unsafeHTML } from 'lit-html/directives/unsafe-html.js';
import {
  DEFAULT_NEW_GAME_REQUEST,
  NEW_GAME_MAP_LIMITS,
  createGameplayEngine,
  createMemoryGameplayPorts,
  createNewGameOrchestrator,
  buildGeneratedMapPreview,
  buildGeneratedOobPreview,
  type CreatedNewGame,
  type GeneratedScenarioPackage,
  type AirForceLevel,
  type MapGenerationStyle,
  type NewGameRequest,
  type OobScale,
  OOB_DIVISION_LIMITS,
} from '../index.js';
import { createUiController, type UiController } from './controller.js';
import { counterView, counterSvgBody, counterSvg } from './counter.js';
import {
  coastlineHtml, hexGridHtml, mapArtDefsHtml, objectiveArtHtml, regionEdgesHtml, riversHtml, roadsHtml, settlementArtHtml,
  strategicBandPoints, terrainFillHtml, terrainGlyphsHtml,
} from './map-art.js';
import { MapView, type MapCounter, type MapState } from './map-canvas.js';
import {
  commandDeckView, movePopupView, phaseControlsView, selectDeckTab, syncDeckTab, unitRosterView, unmovedUnits, withHexLabels, type DeckState, type UnitFilter,
} from './command-deck.js';
import type { UiSnapshot } from './model.js';
import { phaseLabel, pieceLabel, printedHexLabel } from './presenter.js';

const root = document.querySelector<HTMLElement>('#app') ?? (() => {
  throw new Error('UI root was not found.');
})();

/** For the New Game preview, which is drawn as one SVG string from the shared map art. */
const escapeHtml = (value: unknown): string => String(value)
  .replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;')
  .replaceAll('"', '&quot;').replaceAll("'", '&#039;');

const engine = createGameplayEngine(createMemoryGameplayPorts());
const newGameOrchestrator = createNewGameOrchestrator(engine);
performance.mark('ocs:boot:create');
const initialGame = await newGameOrchestrator.create(DEFAULT_NEW_GAME_REQUEST);
performance.mark('ocs:boot:created');
if (!initialGame.ok) {
  const message = initialGame.error.map(({ stage, message }) => `${stage}: ${message}`).join(' ');
  root.innerHTML = `<main class="boot-message"><h1>New Game bootstrap failed</h1><p>${escapeHtml(message)}</p></main>`;
  throw new Error(message);
}
let currentGame: CreatedNewGame = initialGame.value;
let scenario = currentGame.scenario;
let bindings = currentGame.bindings;
let skipDumpOnlySteps = true;
let controller: UiController = createUiController({ engine, session: currentGame.session, scenario, bindings, skipDumpOnlySteps });
let theater = buildGeneratedMapPreview(currentGame.generatedMap, 50);
let cellsById = new Map(theater.cells.map((cell) => [cell.id, cell]));
let unsubscribeController: (() => void) | null = null;
/** The snapshot drawn last; the map's listeners and the keyboard handlers read it. */
let shown: UiSnapshot | null = null;
/** The hex of the supply option the pointer is on in the deck; drawn on the map. */
let sourceHighlightHex: string | null = null;

let newGameSettings: NewGameRequest = {
  ...DEFAULT_NEW_GAME_REQUEST,
  map: { ...DEFAULT_NEW_GAME_REQUEST.map },
  oob: { ...DEFAULT_NEW_GAME_REQUEST.oob },
  seeds: { ...DEFAULT_NEW_GAME_REQUEST.seeds },
};
let newGameOpen = location.hash === '#new-game';
let newGameBusy = false;
let preparingPreview = false;
let newGameError = '';
let newGamePreview: GeneratedScenarioPackage | null = null;
let newGameErrors: readonly { readonly stage: string; readonly code: string; readonly message: string; readonly path: readonly (string | number)[] }[] = [];
let previewTimer: ReturnType<typeof setTimeout> | null = null;
/** The field the browser rejected last (its "invalid" event), shown beside the field. */
let fieldError: { readonly id: string; readonly message: string } | null = null;
/** Fields the player has edited since the last failed build: their error mark is withdrawn. */
let editedFields = new Set<string>();
/** Bumped when the seeds are randomized, so their fields are redrawn with the new values even if the player typed in them. */
let seedVersion = 0;

/** Which settings to change for a failed build, and the fields to flag. */
const NEW_GAME_FIXES: readonly { readonly codes: readonly string[]; readonly text: string; readonly fields: readonly string[] }[] = [
  { codes: ['INITIAL_OVERSTACK', 'DEPLOYMENT_INVALID'], text: 'Too many units for the starting areas of this map: make the map wider or taller, or lower Scale or Divisions per side.', fields: ['new-game-width', 'new-game-height', 'new-game-scale', 'new-game-divisions'] },
  { codes: ['CALENDAR_EXCEEDS_WEATHER_TABLE', 'INVALID_START_MONTH'], text: 'The game would run past April: start earlier or lower the Turn limit.', fields: ['new-game-start-month', 'new-game-turn-limit'] },
  { codes: ['INVALID_TURN_LIMIT'], text: 'Turn limit must be from 1 to 20.', fields: ['new-game-turn-limit'] },
  { codes: ['MAP_WIDTH_OUT_OF_RANGE'], text: `Width must be from ${NEW_GAME_MAP_LIMITS.minWidth} to ${NEW_GAME_MAP_LIMITS.maxWidth} hexes.`, fields: ['new-game-width'] },
  { codes: ['MAP_HEIGHT_OUT_OF_RANGE'], text: `Height must be from ${NEW_GAME_MAP_LIMITS.minHeight} to ${NEW_GAME_MAP_LIMITS.maxHeight} hexes.`, fields: ['new-game-height'] },
];
const newGameGuidance = (): string => NEW_GAME_FIXES.filter(({ codes }) => newGameErrors.some(({ code }) => codes.includes(code))).map(({ text }) => text).join(' ');
const newGameInvalidFields = (): readonly string[] => [
  ...NEW_GAME_FIXES.filter(({ codes }) => newGameErrors.some(({ code }) => codes.includes(code))).flatMap(({ fields }) => fields),
  ...newGameErrors.filter(({ code }) => code === 'INVALID_SEED').map(({ path }) => `new-game-${String(path[1])}-seed`),
  ...newGameErrors.filter(({ stage, code }) => stage === 'OOB' && code === 'INVALID_OPTIONS')
    .flatMap(({ path }) => path[0] === 'divisionsPerSide' ? ['new-game-divisions'] : path[0] === 'armoredDivisionsPerSide' ? ['new-game-armored'] : []),
];
const deck: DeckState = { search: '', working: false };
let rosterOpen = false;
/** Destination of the move popup drawn last, to hand focus to it when it opens and back to the map when it closes. */
let lastMoveHex: string | null = null;
/** Whether the roster popup was open when the page was drawn last, to move focus in and back out of it. */
let rosterWasOpen = false;
/** The modal dialog drawn last, to move focus into a dialog only when it opens. */
let lastDialog: Element | null = null;
let utilityOpen: 'menu' | null = null;
let gameEndDismissed = false;
/** Scroll position of each list by its scroll key, so a tab's list comes back where the player left it. */
const listPositions = new Map<string, number>();
const listKeys = new WeakMap<Element, string>();
let settingsTab = 'basic';
let previewStale = false;
let hoverHexId: string | null = null;
let stackPickerHex: string | null = null;

/**
 * Yield once so the busy state can paint. requestAnimationFrame does not fire in a hidden or
 * background page, so a timer guarantees the action still runs there.
 */
const afterPaint = (): Promise<void> => new Promise((resolve) => {
  let done = false;
  const finish = () => { if (!done) { done = true; setTimeout(resolve, 0); } };
  requestAnimationFrame(finish);
  setTimeout(finish, 50);
});

/** Run a player's action: its controls are disabled and painted as such before the engine works. */
const runUi = async (operation: () => void | Promise<void>): Promise<void> => {
  if (deck.working) return;
  deck.error = '';
  deck.confirmEnd = false;
  deck.working = true;
  render(controller.getSnapshot());
  await afterPaint();
  try { await operation(); }
  catch (error) { deck.error = `${error instanceof Error ? error.message : 'Action could not be completed.'}`; }
  finally { deck.working = false; render(controller.getSnapshot()); }
};

const onMapStacks = (snapshot: UiSnapshot) => new Map(
  (snapshot.view.projection?.stacks ?? [])
    .filter((stack) => stack.location.kind === 'ON_MAP')
    .map((stack) => [stack.location.kind === 'ON_MAP' ? stack.location.hexId : '', stack]),
);

const definitionOf = (definitionId: string) => scenario.pieceCatalog.definitions.find(({ id }) => id === definitionId);

/** One line under a turn-track phase: who acts (Reaction) and, for the current phase, the segment. */
const trackSubLabel = (step: UiSnapshot['phaseTrack'][number], sequence: NonNullable<UiSnapshot['view']['projection']>['sequence'] | undefined) => {
  const segment = step.status === 'current' && sequence && sequence.segment !== 'NONE' ? (phaseLabel(sequence.phase, sequence.segment).split(' · ')[1] ?? '').replace(/ Segment$/u, '') : '';
  const parts = [
    step.actorId !== sequence?.phasingPlayerId ? playerName(step.actorId) : '',
    // "Movement · Movement Segment" would read "Movement Movement"; only name a segment that adds information.
    segment.toLowerCase() === step.label.toLowerCase() ? '' : segment,
  ].filter(Boolean);
  return parts.length > 0 ? html`<small class="track-sub">${parts.join(' · ')}</small>` : nothing;
};

const TRACK_MARKS: Readonly<Record<string, string>> = { done: '✓', skipped: '–', current: '▸' };

/** One row of the turn popup: a fixed mark column, the phase, then who acts or the current segment, all on one line. */
const phaseTrackItem = (step: UiSnapshot['phaseTrack'][number], sequence: NonNullable<UiSnapshot['view']['projection']>['sequence'] | undefined) =>
  html`<li class="is-${step.status}" aria-current=${step.status === 'current' ? 'step' : nothing} title=${`${step.label}${step.actorId !== sequence?.phasingPlayerId ? ` (${playerName(step.actorId)})` : ''}: ${step.status === 'skipped' ? 'passed automatically, no legal actions' : step.status}`}><span class="track-mark" aria-hidden="true">${TRACK_MARKS[step.status] ?? ''}</span><span class="track-label">${step.label}</span>${trackSubLabel(step, sequence)}</li>`;

/**
 * The picker's face, read like the Turn cell beside it (it is state, not a button): whose turn it is and who must act
 * when that is the other player (a Reaction Phase, a defender's decision) on top, where the game is underneath.
 */
const phaseTrackCurrent = (snapshot: UiSnapshot, sequence: NonNullable<UiSnapshot['view']['projection']>['sequence'] | undefined) => {
  if (!sequence) return nothing;
  const current = snapshot.phaseTrack.find((step) => step.status === 'current');
  const segment = current && sequence.segment !== 'NONE' ? (phaseLabel(sequence.phase, sequence.segment).split(' · ')[1] ?? '').replace(/ Segment$/u, '') : '';
  // Steps outside the turn track (First Player roll, Weather, Game over) still name where the game is.
  const label = current ? [current.label, segment.toLowerCase() === current.label.toLowerCase() ? '' : segment].filter(Boolean).join(' · ') : phaseLabel(sequence.phase, sequence.segment);
  const actor = snapshot.bindings.find(({ seatId }) => seatId === snapshot.view.metadata.activeSeatId)?.playerId;
  const turn = `${playerName(sequence.phasingPlayerId)} player turn${actor && actor !== sequence.phasingPlayerId ? ` · ${playerName(actor)} to act` : ''}`;
  return html`<small>${turn}</small><strong>${label}<span class="caret" aria-hidden="true">▾</span></strong>`;
};

const playerName = (playerId: string | undefined): string =>
  bindings.find((binding) => binding.playerId === playerId)?.label.replace(/ commander$/u, '') ?? scenario.players.find(({ id }) => id === playerId)?.name ?? '–';

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

/** Date and ground condition of the Game Turn (17.0). */
const weatherLabel = (snapshot: UiSnapshot): string => {
  const weather = snapshot.view.projection?.weather;
  if (!weather) return '–';
  const ground = { DRY: 'Dry', MUD: 'Mud', SNOW: 'Snow' }[weather.groundCondition];
  return weather.month ? `${weather.day} ${MONTHS[weather.month - 1]} · ${ground}` : ground;
};

/** Draw order inside a stack, bottom first: dumps, trucks, HQs, artillery, then combat units on top. */
const STACK_PRIORITY: Readonly<Record<string, number>> = { SUPPLY: 0, TRANSPORT: 1, HQ: 2, ARTILLERY: 3, COMBAT: 4 };
const stackOrder = <T extends { readonly definitionId: string; readonly id: string }>(pieces: readonly T[]): T[] => pieces
  .map((piece, index) => {
    const definition = definitionOf(piece.definitionId);
    const rank = definition?.family === 'RESOURCE' ? 0 : STACK_PRIORITY[definition?.counter?.kind ?? 'COMBAT'] ?? 4;
    return { piece, rank, index };
  })
  .sort((left, right) => left.rank - right.rank || left.index - right.index)
  .map(({ piece }) => piece);

/** Terrain of the hovered hex and, while a unit is selected, the MP it would cost to get there. */
const hoverText = (snapshot: UiSnapshot, hexId: string): string => {
  const cell = cellsById.get(hexId);
  if (!cell) return 'Hover a hex for terrain.';
  const range = snapshot.moveRange.get(hexId);
  const cost = range ? ` · ${range.costTicks / 4} MP, ${range.remainingAfterTicks / 4} left${range.endsMovement ? ', move ends here' : ''}`
    : snapshot.moveRange.size > 0 && snapshot.selectedPiece?.location.kind === 'ON_MAP' && snapshot.selectedPiece.location.hexId !== hexId ? ' · out of reach' : '';
  return `Hex ${printedHexLabel(cell.id)} · ${cell.terrain.toLowerCase()}${cell.settlement ? ` · ${cell.settlement.toLowerCase()}` : ''}${currentGame.deployment.objectiveHexIds.includes(cell.id as never) ? ' · objective' : ''}${cost}`;
};

/** What a screen reader hears for the map's keyboard cursor: the hover line, what the hex is a target for, then the units there. */
const describeHex = (hexId: string): string => {
  if (!shown) return '';
  const snapshot = shown;
  const stack = onMapStacks(snapshot).get(hexId);
  const units = stackOrder(stack?.pieces ?? []).reverse().map((piece) => `${piece.ownerId === snapshot.view.playerId ? '' : 'enemy '}${pieceLabel(scenario, piece)}`);
  const hidden = stack?.hiddenCount ?? 0;
  const targets = [snapshot.reachable.has(hexId) ? 'reachable' : '', snapshot.attackTargets.includes(hexId) ? 'attack target' : '', snapshot.barrageTargets.includes(hexId) ? 'barrage target' : '',
    snapshot.placementHexes.includes(hexId) ? 'entry hex' : '', snapshot.decisionHexes.includes(hexId) ? 'choice' : ''].filter(Boolean);
  return `${hoverText(snapshot, hexId)}${targets.length > 0 ? ` · ${targets.join(', ')}` : ''}${units.length + hidden > 0 ? ` · ${units.join(', ')}${hidden > 0 ? `, ${hidden} hidden` : ''}` : ' · no units'}`;
};

// ------------------------------------------------------------------ map

const mapHost = document.createElement('div');
mapHost.className = 'map-host';
const mapView = new MapView(mapHost, {
  hexClick: (hexId) => { stackPickerHex = null; void runUi(() => controller.clickHex(hexId)); },
  counterClick: (pieceId, hexId) => { if (shown) { const snapshot = shown; void runUi(() => clickCounter(snapshot, pieceId, hexId)); } },
  hover: (hexId) => {
    hoverHexId = hexId;
    const info = root.querySelector<HTMLElement>('.hover-info');
    if (info && hexId && shown) info.textContent = hoverText(shown, hexId);
  },
  cameraChange: () => updateCameraUi(),
});
const showScene = (): Promise<void> => mapView.setScene({
  theater, objectiveHexIds: currentGame.deployment.objectiveHexIds, hexLabel: printedHexLabel, describeHex,
});
/** For scripted acceptance runs that drive the map with real pointer input. */
Object.assign(window, { ocsMap: mapView });

/** What the map draws for a snapshot: highlights, targets, the move path and every visible counter. */
const mapStateOf = (snapshot: UiSnapshot): MapState => {
  const stacks = onMapStacks(snapshot);
  const attack = new Set(snapshot.attackTargets);
  const moving = snapshot.reachable.size > 0;
  const counters: MapCounter[] = [];
  const selectedCounters: MapCounter[] = [];
  const badges: { hexId: string; count: number }[] = [];
  for (const cell of theater.cells) {
    const stack = stacks.get(cell.id);
    if (!stack) continue;
    const allPieces = stackOrder(stack.pieces);
    // Supply lies in the hex rather than in the stack: a hex's dump is one small marker at its corner and does not take one of the
    // three counter places or count towards the hidden ones.
    const dumps = allPieces.filter(({ role }) => role === 'DUMP').sort((left, right) => (right.resourceQuantity ?? 0) - (left.resourceQuantity ?? 0));
    const pieces = allPieces.filter(({ role }) => role !== 'DUMP');
    // Draw the bottom of the stack first; at most three counters are shown, the rest are counted.
    const visible = pieces.slice(-3);
    const selectedPiece = pieces.find(({ id }) => id === snapshot.selection.pieceId);
    if (selectedPiece && !visible.includes(selectedPiece)) visible.push(selectedPiece);
    const place = (piece: (typeof allPieces)[number], x: number, y: number, scale: number) => {
      const definition = definitionOf(piece.definitionId);
      if (!definition) return;
      const selected = snapshot.selection.pieceId === piece.id;
      (selected ? selectedCounters : counters).push({
        pieceId: piece.id, hexId: cell.id, x, y, scale, body: counterSvgBody(counterView(definition, piece)), selected,
        label: `${piece.ownerId === snapshot.view.playerId ? '' : 'Enemy '}${pieceLabel(scenario, piece)}, hex ${printedHexLabel(cell.id)}`,
      });
    };
    const dump = dumps[0];
    if (dump) place(dump, cell.x - 4, cell.y - 2, 0.5);
    visible.forEach((piece, index) => place(piece, cell.x - 35 + index * 6, cell.y - 35 - index * 6, 0.7));
    const hiddenCount = stack.hiddenCount + Math.max(0, pieces.length - visible.length) + Math.max(0, dumps.length - 1);
    if (hiddenCount > 0) badges.push({ hexId: cell.id, count: hiddenCount });
  }
  const combatHex = snapshot.view.projection?.combat?.targetHexId ?? null;
  return {
    selectedHexId: snapshot.selection.hexId,
    reachable: new Map([...snapshot.reachable.keys()].map((hexId) => [hexId, { endsMovement: snapshot.moveRange.get(hexId)?.endsMovement === true }])),
    // While a unit is selected, hexes outside its range recede so its legal range reads as one area.
    dimmed: new Set(moving ? theater.cells.filter(({ id }) => !snapshot.reachable.has(id) && !attack.has(id) && snapshot.selection.hexId !== id).map(({ id }) => id) : []),
    attack,
    barrage: new Set(snapshot.barrageTargets),
    placement: new Set(snapshot.placementHexes),
    retreat: new Set([...snapshot.decisionHexes, ...snapshot.collapseHexes]),
    highlight: new Set(sourceHighlightHex ? [sourceHighlightHex] : []),
    airTargets: new Set(snapshot.air.targetHexes),
    destinationHexId: snapshot.movePreview?.destinationHexId ?? null,
    targetHexIds: new Set([snapshot.draft?.targetHexId, combatHex].filter((id): id is string => typeof id === 'string')),
    path: snapshot.movePreview?.path ?? [],
    // 14.4c Patrol Zones (both sides can see Active Fighters on top, 4.8e) and 14.8 Trainbusting markers.
    ownZone: new Set(snapshot.air.showZones ? snapshot.air.patrolZones.own : []),
    enemyZone: new Set(snapshot.air.showZones ? snapshot.air.patrolZones.enemy : []),
    trainbusting: snapshot.air.trainbusting,
    counters: [...counters, ...selectedCounters],
    badges,
  };
};

/**
 * Clicking a counter on a hex that is itself a target acts on the hex. Otherwise it selects the
 * player's own unit there (opening the stack list when the hex holds several).
 */
const clickCounter = (snapshot: UiSnapshot, pieceId: string, hexId: string): Promise<void> | void => {
  const targetsHex = snapshot.reachable.has(hexId) || snapshot.attackTargets.includes(hexId) || snapshot.air.targetHexes.includes(hexId)
    || snapshot.barrageTargets.includes(hexId) || snapshot.placementHexes.includes(hexId) || snapshot.decisionHexes.includes(hexId)
    || snapshot.collapseHexes.includes(hexId);
  if (targetsHex) { stackPickerHex = null; return controller.clickHex(hexId); }
  const stack = onMapStacks(snapshot).get(hexId);
  const piece = stack?.pieces.find(({ id }) => id === pieceId);
  stackPickerHex = (stack?.pieces.length ?? 0) + (stack?.hiddenCount ?? 0) > 1 ? hexId : null;
  if (!piece || piece.ownerId !== snapshot.view.playerId) {
    const own = stackOrder(stack?.pieces.filter(({ ownerId }) => ownerId === snapshot.view.playerId) ?? []).at(-1);
    if (own) { controller.selectPiece(own.id); return; }
    return controller.clickHex(hexId);
  }
  controller.selectPiece(pieceId);
};

const stackPicker = (snapshot: UiSnapshot) => {
  if (!stackPickerHex) return nothing;
  const stack = onMapStacks(snapshot).get(stackPickerHex);
  if (!stack || stack.pieces.length + stack.hiddenCount < 2) return nothing;
  const rows = [...stackOrder(stack.pieces)].reverse().map((piece) => {
    const definition = definitionOf(piece.definitionId)!;
    const own = piece.ownerId === snapshot.view.playerId;
    return html`<button class="stack-pick${snapshot.selection.pieceId === piece.id ? ' is-selected' : ''}" data-pick-piece=${piece.id} ?disabled=${!own} @click=${() => controller.selectPiece(piece.id)}>
      <span class="stack-pick-art" aria-hidden="true">${unsafeHTML(counterSvg(counterView(definition, piece)))}</span><span>${`${own ? '' : 'Enemy · '}${pieceLabel(scenario, piece)}${piece.role === 'DUMP' ? ` · ${piece.resourceQuantity ?? 0}T` : ''}${typeof piece.carriedTokens === 'number' ? ` · carries ${piece.carriedTokens}T` : ''}`}</span></button>`;
  });
  return html`<div class="stack-picker" role="group" aria-label=${`Units in hex ${printedHexLabel(stackPickerHex)}`} data-anchor-hex=${stackPickerHex}>
    <header><strong>Hex ${printedHexLabel(stackPickerHex)} · ${stack.pieces.length + stack.hiddenCount} units</strong><button id="close-stack-picker" aria-label="Close stack list" @click=${() => { stackPickerHex = null; render(controller.getSnapshot()); }}>×</button></header>
    ${rows}${stack.hiddenCount > 0 ? html`<p>${stack.hiddenCount} enemy unit${stack.hiddenCount === 1 ? '' : 's'} hidden under the top counter.</p>` : nothing}
  </div>`;
};

/** Place the stack picker beside its hex, inside the map viewport. */
const positionStackPicker = (): void => {
  const picker = root.querySelector<HTMLElement>('.stack-picker');
  const viewport = root.querySelector<HTMLElement>('#map-viewport');
  if (!picker || !viewport) return;
  const box = mapView.hexClientRect(picker.dataset.anchorHex ?? '');
  if (!box) return;
  const frame = viewport.getBoundingClientRect();
  const left = Math.min(frame.width - picker.offsetWidth - 12, Math.max(12, box.right - frame.left + 8));
  const top = Math.min(frame.height - picker.offsetHeight - 12, Math.max(12, box.top - frame.top - 20));
  picker.style.left = `${left}px`;
  picker.style.top = `${top}px`;
};

/**
 * Place the move popup beside its destination, on the side away from the path that arrives there,
 * clear of the destination hex and of the map's own overlays; flip to another side when it does not fit.
 */
const positionMovePopup = (): void => {
  const popup = root.querySelector<HTMLElement>('.move-popup');
  const viewport = root.querySelector<HTMLElement>('#map-viewport');
  if (!popup || !viewport) return;
  const target = popup.dataset.anchorHex ? mapView.hexClientRect(popup.dataset.anchorHex) : null;
  if (!target) return;
  const frame = viewport.getBoundingClientRect();
  const from = popup.dataset.fromHex ? mapView.hexClientRect(popup.dataset.fromHex) : null;
  const margin = 12;
  const gap = 10;
  const width = popup.offsetWidth;
  const height = popup.offsetHeight;
  const hex = { left: target.left - frame.left, right: target.right - frame.left, top: target.top - frame.top, bottom: target.bottom - frame.top };
  const centre = { x: (hex.left + hex.right) / 2, y: (hex.top + hex.bottom) / 2 };
  const dx = from ? centre.x - ((from.left + from.right) / 2 - frame.left) : 1;
  const dy = from ? centre.y - ((from.top + from.bottom) / 2 - frame.top) : 0;
  const clamp = (value: number, low: number, high: number) => Math.max(low, Math.min(high, value));
  type Side = 'right' | 'left' | 'bottom' | 'top';
  const along: Side = Math.abs(dx) >= Math.abs(dy) ? (dx >= 0 ? 'right' : 'left') : (dy >= 0 ? 'bottom' : 'top');
  const opposite: Record<Side, Side> = { right: 'left', left: 'right', bottom: 'top', top: 'bottom' };
  const across: Side[] = along === 'right' || along === 'left' ? ['bottom', 'top'] : ['right', 'left'];
  const place = (side: Side) => {
    const left = side === 'right' ? hex.right + gap : side === 'left' ? hex.left - gap - width : centre.x - width / 2;
    const top = side === 'bottom' ? hex.bottom + gap : side === 'top' ? hex.top - gap - height : centre.y - height / 2;
    return { side, left: clamp(left, margin, frame.width - width - margin), top: clamp(top, margin, frame.height - height - margin) };
  };
  // Map overlays the popup must not sit on.
  const obstacles = ['.map-controls', '.map-legend', '.hover-info'].flatMap((selector) => {
    const box = viewport.querySelector<HTMLElement>(selector)?.getBoundingClientRect();
    return box ? [{ left: box.left - frame.left, right: box.right - frame.left, top: box.top - frame.top, bottom: box.bottom - frame.top }] : [];
  });
  const overlaps = (a: { left: number; top: number; width: number; height: number }, b: { left: number; right: number; top: number; bottom: number }) =>
    a.left < b.right && a.left + a.width > b.left && a.top < b.bottom && a.top + a.height > b.top;
  // Past the destination first; then above or below it (they leave the arriving path clear); the path side last.
  const candidates = [along, ...across, opposite[along]].map(place);
  const fits = (spot: ReturnType<typeof place>) => !overlaps({ ...spot, width, height }, hex) && !obstacles.some((box) => overlaps({ ...spot, width, height }, box));
  // Pinned to an edge (hex out of view, or beside an overlay), slide clear of the overlay it landed on.
  const nudged = candidates.flatMap((candidate) => obstacles.flatMap((box) => [
    { ...candidate, left: clamp(box.left - gap - width, margin, frame.width - width - margin) },
    { ...candidate, top: clamp(box.bottom + gap, margin, frame.height - height - margin) },
  ]));
  const spot = candidates.find(fits) ?? nudged.find(fits) ?? candidates.find((candidate) => !overlaps({ ...candidate, width, height }, hex)) ?? candidates[0]!;
  popup.style.left = `${spot.left}px`;
  popup.style.top = `${spot.top}px`;
  popup.dataset.side = spot.side;
  // The pointer aims at the hex centre; hidden when the hex has been panned out of view.
  const visible = centre.x > 0 && centre.x < frame.width && centre.y > 0 && centre.y < frame.height;
  const pointer = spot.side === 'left' || spot.side === 'right' ? centre.y - spot.top : centre.x - spot.left;
  popup.style.setProperty('--pointer', `${clamp(pointer, 14, (spot.side === 'left' || spot.side === 'right' ? height : width) - 14)}px`);
  popup.classList.toggle('no-pointer', !visible);
};

/** Popups follow their hexes and the zoom readout follows the camera; neither needs the page redrawn. */
const updateCameraUi = (): void => {
  positionStackPicker();
  positionMovePopup();
  const output = root.querySelector<HTMLOutputElement>('#zoom-level');
  if (output) output.value = `${mapView.zoomPercent}%`;
};

// ------------------------------------------------------------------ dialogs

const privacyView = (snapshot: UiSnapshot) => html`
  <div class="privacy-screen" role="dialog" aria-modal="true" aria-labelledby="handoff-title">
    <div><p class="eyebrow">HOT-SEAT PRIVACY</p><h2 id="handoff-title">Pass the screen to ${snapshot.handoff?.toLabel ?? 'the next player'}</h2>
    <p>${snapshot.handoff?.reason ?? 'The map is hidden until the next player confirms.'}</p>
    <p class="supporting">The map stays hidden until they confirm.</p>
    <button class="primary" id="complete-handoff" @click=${() => controller.completeHandoff()}>I am ${snapshot.handoff?.toLabel ?? 'the next player'}</button></div>
  </div>`;

const oobRoleLabel = (role: string): string => role.replaceAll('_', ' ').toLowerCase();

/** The combined preview: map with starting stacks, metrics and both forces, as one string drawn from the shared art. */
const operationPreviewHtml = (prepared: GeneratedScenarioPackage): string => {
  const map = buildGeneratedMapPreview(prepared.generatedMap, 32);
  const oob = buildGeneratedOobPreview(prepared.generatedOob);
  const previewCounter = (unit: {id:string}): string => {
    const piece = prepared.scenario.initialPieceState.pieces.find(({id}) => id === unit.id)!;
    const definition = prepared.scenario.pieceCatalog.definitions.find(({id}) => id === piece.definitionId)!;
    return `<figure class="preview-counter">${counterSvg(counterView(definition, {...piece, statuses: [], statusValues: piece.statuses.flatMap(({ statusDefinitionId, value }) => value.kind === 'INTEGER' ? [{ statusDefinitionId, value: value.value }] : []), redacted: false}))}<figcaption>${escapeHtml(definition.name)}</figcaption></figure>`;
  };
  const objectives = new Set<string>(prepared.deployment.objectiveHexIds);
  const hexSize = map.layout.hexSize;
  // Starting positions: one marker per occupied hex, coloured by side, with the unit count.
  const deployed = new Map<string, { owner: number; count: number }>();
  for (const piece of prepared.scenario.initialPieceState.pieces) {
    if (piece.location.kind !== 'ON_MAP') continue;
    const owner = prepared.scenario.players.findIndex(({ id }) => id === piece.ownerId);
    const entry = deployed.get(piece.location.hexId) ?? { owner, count: 0 };
    deployed.set(piece.location.hexId, { owner, count: entry.count + 1 });
  }
  const deploymentMarks = map.cells.flatMap((cell) => {
    const entry = deployed.get(cell.id);
    return entry ? [`<g class="preview-deployment owner-${entry.owner + 1}"><rect x="${cell.x - 12}" y="${cell.y - 12}" width="24" height="24" rx="3"></rect><text x="${cell.x}" y="${cell.y + 5}" text-anchor="middle">${entry.count}</text></g>`] : [];
  }).join('');
  const cells = `<g class="terrain-layer">${map.cells.map((cell) => terrainFillHtml(cell, hexSize)).join('')}</g>`
    + `<g class="grid-layer">${regionEdgesHtml(map.cells, hexSize)}${hexGridHtml(map.cells, hexSize)}</g>`
    + `<g class="generated-cells">${map.cells.map((cell) => terrainGlyphsHtml(cell, hexSize)).join('')}</g>`;
  const features = map.cells.map((cell) => [
    cell.strategic ? `<polygon class="preview-entry side-${cell.strategic.toLowerCase()}" points="${strategicBandPoints(cell, hexSize)}"></polygon>` : '',
    cell.settlement ? `<g class="settlement-marker">${settlementArtHtml(cell, hexSize)}</g>` : '',
    objectives.has(cell.id) ? `<g class="preview-objective">${objectiveArtHtml(cell, hexSize)}</g>` : '',
  ].join('')).join('');
  const rivers = coastlineHtml(map.cells, hexSize) + riversHtml(map.edges, hexSize, 'generated-edge');
  const roads = roadsHtml(map.edges, map.cells, hexSize, 'generated-edge');
  const forces = oob.sides.map((side) => `<section class="preview-force side-${side.side.toLowerCase()}">
    <header><strong>${escapeHtml(side.side)}</strong><span>${prepared.generatedOob.metrics.pointsBySide[side.side]} points</span></header>
    ${side.formations.map((formation) => `<details class="counter-formation"><summary><span>${escapeHtml(formation.name)}</span><small>${formation.units.length} units · ${escapeHtml(oobRoleLabel(formation.archetype))}</small></summary><div class="counter-grid">${formation.units.map(previewCounter).join('')}</div></details>`).join('')}
    <details class="counter-formation"><summary>${side.independentUnits.filter(({ role }) => role !== 'AIRCRAFT' && role !== 'AIR_BASE').length} independent support / logistics units</summary><div class="counter-grid">${side.independentUnits.filter(({ role }) => role !== 'AIRCRAFT' && role !== 'AIR_BASE').map(previewCounter).join('')}</div></details>
    ${side.independentUnits.some(({ role }) => role === 'AIRCRAFT') ? `<details class="counter-formation"><summary>Air forces: ${side.independentUnits.filter(({ role }) => role === 'AIRCRAFT').length} aircraft, ${side.independentUnits.filter(({ role }) => role === 'AIR_BASE').length} Air Base(s)</summary><div class="counter-grid">${side.independentUnits.filter(({ role }) => role === 'AIRCRAFT' || role === 'AIR_BASE').map(previewCounter).join('')}</div></details>` : ''}
  </section>`).join('');
  return `<div class="operation-map-wrap"><svg class="operation-map" viewBox="0 0 ${map.layout.width} ${map.layout.height}" role="img" aria-label="Generated operation map preview with starting positions">${mapArtDefsHtml()}${cells}${rivers}${roads}${features}${deploymentMarks}</svg><p class="preview-key"><span class="key owner-1">${escapeHtml(prepared.scenario.players[0]?.name ?? '')}</span><span class="key owner-2">${escapeHtml(prepared.scenario.players[1]?.name ?? '')}</span> starting stacks (unit count)</p></div>
    <dl class="operation-metrics"><div><dt>Map</dt><dd>${escapeHtml(prepared.summary.mapSize)}</dd></div><div><dt>Units</dt><dd>${prepared.summary.unitCount}</dd></div><div><dt>Formations</dt><dd>${prepared.summary.formationCount}</dd></div><div><dt>Deployed hexes</dt><dd>${prepared.deployment.metrics.occupiedHexes}</dd></div><div><dt>Objectives</dt><dd>${prepared.summary.objectiveCount}</dd></div><div><dt>Warnings</dt><dd>${prepared.warnings.length}</dd></div></dl>
    <div class="preview-forces">${forces}</div>
    ${prepared.warnings.length > 0 ? `<details class="preview-warnings"><summary>${prepared.warnings.length} generation warning(s)</summary><ul>${prepared.warnings.map((warning) => `<li>${escapeHtml(warning)}</li>`).join('')}</ul></details>` : ''}`;
};
/** The preview markup is built once per prepared package (a few hundred kilobytes for a large operation). */
const previewMarkup = new WeakMap<GeneratedScenarioPackage, string>();

/** BTR Weather Table months (17.0), in campaign order. */
const START_MONTHS: readonly (readonly [number, string])[] = [
  [9, 'September'], [10, 'October'], [11, 'November'], [12, 'December'], [1, 'January'], [2, 'February'], [3, 'March'], [4, 'April'],
];

const closeNewGame = (): void => {
  newGameOpen = false;
  history.replaceState(null, '', location.pathname);
  render(controller.getSnapshot());
};

/** Settings change as the player types; the preview is rebuilt shortly after they stop. */
const onNewGameInput = (event: Event): void => {
  const input = event.target as HTMLInputElement | HTMLSelectElement;
  const value = Number(input.value);
  const id = input.id;
  previewStale = true;
  fieldError = null;
  editedFields.add(id);
  newGameSettings = { ...newGameSettings, map: { ...newGameSettings.map }, oob: { ...newGameSettings.oob }, seeds: { ...newGameSettings.seeds } };
  if (id === 'new-game-width') newGameSettings = { ...newGameSettings, map: { ...newGameSettings.map, width: value } };
  if (id === 'new-game-height') newGameSettings = { ...newGameSettings, map: { ...newGameSettings.map, height: value } };
  if (id === 'new-game-style') newGameSettings = { ...newGameSettings, map: { ...newGameSettings.map, style: input.value as MapGenerationStyle } };
  if (id === 'new-game-scale') newGameSettings = { ...newGameSettings, oob: { ...newGameSettings.oob, scale: input.value as OobScale } };
  if (id === 'new-game-divisions') newGameSettings = { ...newGameSettings, oob: { ...newGameSettings.oob, divisionsPerSide: value } };
  if (id === 'new-game-armored') newGameSettings = { ...newGameSettings, oob: { ...newGameSettings.oob, armoredDivisionsPerSide: value } };
  if (id === 'new-game-air') newGameSettings = { ...newGameSettings, oob: { ...newGameSettings.oob, air: input.value as AirForceLevel } };
  if (id === 'new-game-turn-limit') newGameSettings = { ...newGameSettings, turnLimit: value };
  if (id === 'new-game-start-month') newGameSettings = { ...newGameSettings, startMonth: value };
  for (const key of ['map', 'oob', 'deployment', 'rules'] as const) if (id === `new-game-${key}-seed`) newGameSettings = { ...newGameSettings, seeds: { ...newGameSettings.seeds, [key]: value } };
  render(controller.getSnapshot());
  schedulePreview();
};

/** checkValidity fires "invalid" per bad field: open the tab that holds it and say what is wrong beside it. */
const onNewGameInvalid = (event: Event): void => {
  const input = event.target as HTMLInputElement;
  settingsTab = input.id.endsWith('-seed') ? 'advanced' : 'basic';
  fieldError = { id: input.id, message: input.validationMessage };
  editedFields.delete(input.id);
  render(controller.getSnapshot());
};

const startPreviewedGame = (): void => {
  if (newGameBusy || !newGamePreview || previewStale) return;
  newGameBusy = true;
  newGameError = '';
  const request = newGamePreview.request;
  render(controller.getSnapshot());
  void afterPaint().then(() => newGameOrchestrator.create(request)).then(async (created) => {
    if (created.ok) await mountCreatedGame(created.value);
    else {
      newGameBusy = false;
      newGameErrors = created.error;
      newGameError = created.error.map(({ stage, message }) => `${stage}: ${withHexLabels(message)}`).join(' ');
      render(controller.getSnapshot());
    }
  }).catch(error => {
    newGameBusy = false;
    newGameError = `${error instanceof Error ? error.message : 'Operation could not start.'} Build a new preview to retry.`;
    render(controller.getSnapshot());
  });
};

const randomizeSeeds = (): void => {
  const values = new Uint32Array(4);
  crypto.getRandomValues(values);
  newGameSettings = {
    ...newGameSettings,
    seeds: { map: values[0]!, oob: values[1]!, deployment: values[2]!, rules: values[3]! },
  };
  previewStale = true;
  seedVersion += 1;
  render(controller.getSnapshot());
  schedulePreview(0);
};

const newGameDialog = () => {
  if (!newGameOpen) return nothing;
  // Every stage reports its real state: current, generating, done, or the stage that failed.
  const ready = newGamePreview !== null && !previewStale;
  const failed = new Set(newGameErrors.map(({ stage }) => stage));
  const stageClass = (stages: readonly string[]): string => stages.some((stage) => failed.has(stage)) ? 'is-error'
    : preparingPreview ? 'is-active' : ready ? 'is-complete' : '';
  const configuredClass = failed.has('OPTIONS') ? 'is-error' : ready || preparingPreview ? 'is-complete' : 'is-active';
  const gameplayClass = failed.has('GAMEPLAY_BOOTSTRAP') ? 'is-error' : newGameBusy && !preparingPreview ? 'is-active' : '';
  const invalid = new Set(newGameInvalidFields().filter((id) => !editedFields.has(id)));
  const error = (id: string) => fieldError?.id === id ? html`<span id="field-error" class="field-error" role="alert">${fieldError.message}</span>` : nothing;
  const marks = (id: string) => ({ invalid: invalid.has(id) || fieldError?.id === id ? 'true' : nothing, described: fieldError?.id === id ? 'field-error' : nothing });
  const number = (id: string, label: string, min: number, max: number, value: number) => {
    const mark = marks(id);
    return html`<label>${label}<input id=${id} type="number" min=${min} max=${max} value=${value} required aria-invalid=${mark.invalid} aria-describedby=${mark.described}>${error(id)}</label>`;
  };
  const select = (id: string, label: string, options: readonly (readonly [string | number, string])[], value: string | number) => {
    const mark = marks(id);
    return html`<label>${label}<select id=${id} aria-invalid=${mark.invalid} aria-describedby=${mark.described}>${options.map(([option, name]) => html`<option value=${option} ?selected=${option === value}>${name}</option>`)}</select>${error(id)}</label>`;
  };
  const status = preparingPreview ? 'Generating map, forces and deployment…' : newGameErrors.length > 0 ? 'Cannot build this operation' : previewStale ? 'Updating preview…' : newGamePreview ? 'Preview ready' : 'Configure operation';
  let previewHtml = '';
  if (newGamePreview) {
    previewHtml = previewMarkup.get(newGamePreview) ?? operationPreviewHtml(newGamePreview);
    previewMarkup.set(newGamePreview, previewHtml);
  }
  return html`<div class="modal-backdrop new-game-backdrop"><section class="new-game-dialog" role="dialog" aria-modal="true" aria-labelledby="new-game-title" @keydown=${trapFocus}>
    <header class="generator-header"><div><p class="eyebrow">NEW OPERATION</p><h2 id="new-game-title">Build, inspect, then deploy</h2><p>Map, OOB and deployment are generated as one deterministic package. The preview below is the operation Gameplay will mount.</p></div><button id="close-new-game" ?disabled=${newGameBusy} @click=${closeNewGame}>Close</button></header>
    <div class="flow-steps" aria-label="New Game generation sequence"><span class=${configuredClass} aria-current=${configuredClass === 'is-active' ? 'step' : nothing}>1 Configure</span><span class=${stageClass(['MAP'])}>2 Map</span><span class=${stageClass(['OOB'])}>3 OOB</span><span class=${stageClass(['DEPLOYMENT', 'SCENARIO'])}>4 Deployment</span><span class=${gameplayClass} aria-current=${gameplayClass === 'is-active' ? 'step' : nothing}>5 Gameplay</span></div>
    <div class="new-game-body"><form id="new-game-form" class="new-game-form" data-settings-tab=${settingsTab} @submit=${(event: Event) => { event.preventDefault(); void buildPreview(); }} @input=${onNewGameInput} @invalid=${{ handleEvent: onNewGameInvalid, capture: true }}>
      <nav class="settings-tabs" aria-label="New Game settings">${(['basic', 'advanced'] as const).map((tab) => html`<button type="button" data-settings=${tab} aria-pressed=${String(settingsTab === tab)} @click=${() => { settingsTab = tab; render(controller.getSnapshot()); }}>${tab === 'basic' ? 'Basic' : 'Advanced seeds'}</button>`)}</nav>
      ${newGameError ? html`<div class="generator-error new-game-error" role="alert">${newGameGuidance() ? html`<p><strong>${newGameGuidance()}</strong></p>` : nothing}<p>${newGameError}</p></div>` : nothing}
      <div class="settings-basic">
        <fieldset><legend>Operational map</legend>
          ${select('new-game-style', 'Style', [['TEMPERATE_INLAND', 'Temperate inland'], ['MEDITERRANEAN_COAST', 'Mediterranean coast']], newGameSettings.map.style)}
          ${number('new-game-width', 'Width', NEW_GAME_MAP_LIMITS.minWidth, NEW_GAME_MAP_LIMITS.maxWidth, newGameSettings.map.width)}
          ${number('new-game-height', 'Height', NEW_GAME_MAP_LIMITS.minHeight, NEW_GAME_MAP_LIMITS.maxHeight, newGameSettings.map.height)}
        </fieldset>
        <fieldset><legend>Order of battle</legend>
          ${select('new-game-scale', 'Scale', [['COMPACT', 'Compact'], ['STANDARD', 'Standard'], ['LARGE', 'Large']], newGameSettings.oob.scale)}
          ${number('new-game-divisions', 'Divisions per side', OOB_DIVISION_LIMITS.minDivisions, OOB_DIVISION_LIMITS.maxDivisions, newGameSettings.oob.divisionsPerSide)}
          ${number('new-game-armored', 'of which armored', 0, OOB_DIVISION_LIMITS.maxArmored, newGameSettings.oob.armoredDivisionsPerSide)}
          <p class="field-help">The other divisions are infantry, about one in four airborne.</p>
          ${select('new-game-air', 'Air forces', [['NONE', 'None (ground duel)'], ['STANDARD', 'Fighters, bombers and Air Bases']], newGameSettings.oob.air ?? 'NONE')}
        </fieldset>
        <fieldset><legend>Game rules</legend>
          ${number('new-game-turn-limit', 'Turn limit', 1, 20, newGameSettings.turnLimit)}
          ${select('new-game-start-month', 'Start month', START_MONTHS, newGameSettings.startMonth)}
          <p class="field-help">The month sets the weather: September is always dry, autumn brings mud, and midwinter snow.</p>
        </fieldset>
      </div>
      ${keyed(seedVersion, html`<fieldset class="settings-advanced"><legend>Reproducible seeds</legend>
        ${number('new-game-map-seed', 'Map seed', 0, 4294967295, newGameSettings.seeds.map)}
        ${number('new-game-oob-seed', 'OOB seed', 0, 4294967295, newGameSettings.seeds.oob)}
        ${number('new-game-deployment-seed', 'Deployment seed', 0, 4294967295, newGameSettings.seeds.deployment)}
        ${number('new-game-rules-seed', 'Rules seed', 0, 4294967295, newGameSettings.seeds.rules)}
        <button type="button" id="randomize-new-game" @click=${randomizeSeeds}>Randomize all seeds</button>
      </fieldset>`)}
    </form><section class="operation-preview" aria-label="Combined generated operation preview">${newGamePreview
      ? html`<div class="operation-preview-content${previewStale ? ' is-stale' : ''}">${unsafeHTML(previewHtml)}</div>`
      : html`<div class="operation-preview-empty"><strong>No operation built yet</strong><p>Choose map and force options, then build one combined preview. Starting is unavailable until map, OOB and deployment all validate together.</p></div>`}</section></div>
    <footer class="new-game-footer">
      <div class="new-game-submit">
        <div><strong>${status}</strong><p>${newGameErrors.length > 0 ? 'Adjust the highlighted settings.' : 'The preview updates as you change settings; Start plays exactly this package.'}</p></div>
        <button type="submit" form="new-game-form" ?disabled=${newGameBusy}>${preparingPreview ? 'Building preview…' : 'Rebuild operation preview'}</button>
      </div>
      ${newGamePreview ? html`<button id="start-previewed-game" class="primary wide" ?disabled=${newGameBusy || previewStale} @click=${startPreviewedGame}>${newGameBusy ? 'Starting operation…' : previewStale ? 'Updating preview…' : 'Start this operation'}</button>` : nothing}
    </footer>
  </section></div>`;
};

const gameEndDialog = (snapshot: UiSnapshot) => {
  if (snapshot.view.metadata.lifecycle !== 'FINISHED' || newGameOpen || gameEndDismissed) return nothing;
  const victory = snapshot.view.projection?.victory;
  const winner = victory?.winnerId === null
    ? 'Draw'
    : scenario.players.find(({ id }) => id === victory?.winnerId)?.name ?? 'Undetermined';
  const scores = victory?.scores.map(({ playerId, points }) => {
    const player = scenario.players.find(({ id }) => id === playerId);
    return html`<div><dt>${player?.name ?? playerId}</dt><dd>${points}</dd></div>`;
  }) ?? [];
  return html`<div class="modal-backdrop game-end-backdrop"><section class="game-end-dialog" role="dialog" aria-modal="true" aria-labelledby="game-end-title" @keydown=${trapFocus}>
    <p class="eyebrow">GAME END</p><h2 id="game-end-title">${winner}</h2>
    <p>${victory?.winnerId === null ? 'The operation ends without a sole winner.' : `${winner} wins the generated operation.`}</p>
    <dl class="game-end-scores">${scores}</dl>
    <p class="game-end-reason">Result: ${victory?.reason?.replaceAll('_', ' ') ?? 'completed'} · final revision ${snapshot.view.stateRevision}</p>
    <div class="game-end-actions"><button id="download-final-save" @click=${() => downloadJson(controller.serializeSave(), `ocs-final-${snapshot.view.metadata.id}.json`)}>Download final save</button><button id="download-replay" @click=${() => downloadJson(controller.serializeReplay(), `ocs-replay-${snapshot.view.metadata.id}.json`)}>Download replay</button><button id="close-game-end" @click=${() => { gameEndDismissed = true; render(controller.getSnapshot()); }}>View final map</button><button class="primary" id="new-game-after-end" @click=${openNewGame}>New Game</button></div>
  </section></div>`;
};

/** The game menu: everything outside the turn itself (new game, saves, hot-seat, checkpoints), grouped by what it touches. */
const menuDialog = (snapshot: UiSnapshot) => {
  if (!utilityOpen) return nothing;
  const lifecycle = snapshot.view.metadata.lifecycle;
  const activeBinding = snapshot.bindings.find(({ seatId }) => seatId === snapshot.view.metadata.activeSeatId);
  const otherBinding = snapshot.bindings.find(({ seatId }) => seatId !== snapshot.view.metadata.activeSeatId);
  const close = () => { utilityOpen = null; render(controller.getSnapshot()); };
  return html`<div class="modal-backdrop utility-backdrop"><section class="utility-dialog menu-dialog" role="dialog" aria-modal="true" aria-labelledby="utility-title" @keydown=${trapFocus}><header><h2 id="utility-title">Menu</h2><button id="close-utility" @click=${close}>Close</button></header><div class="utility-content">
    <section class="menu-section" aria-labelledby="menu-game"><h3 id="menu-game">Game</h3>
      <div class="menu-row"><button class="primary" id="open-new-game" @click=${openNewGame}>New Game…</button><button id="save-game" @click=${() => downloadJson(controller.serializeSave(), `ocs-${snapshot.view.metadata.id}.json`)}>Download save</button><button id="load-game" @click=${() => root.querySelector<HTMLInputElement>('#save-file')?.click()}>Load save…</button></div>
      <input id="save-file" type="file" accept="application/json,.json" hidden @change=${(event: Event) => {
        const file = (event.currentTarget as HTMLInputElement).files?.[0];
        if (file) { utilityOpen = null; void file.text().then((text) => controller.loadSave(text)); }
      }}>
      <p class="supporting">${currentGame.summary.unitCount} units · ${currentGame.summary.formationCount} formations · ${currentGame.summary.turnLimit} turns · seeds map ${currentGame.request.seeds.map}, OOB ${currentGame.request.seeds.oob}, deployment ${currentGame.request.seeds.deployment}, rules ${currentGame.request.seeds.rules}</p>
    </section>
    <section class="menu-section" aria-labelledby="menu-seats"><h3 id="menu-seats">Hot seat</h3>
      <p class="supporting">${activeBinding?.label ?? ''} has the screen.</p>
      <button class="wide" id="begin-handoff" ?disabled=${!(otherBinding && lifecycle !== 'READY')} @click=${() => { utilityOpen = null; controller.beginHandoff(); }}>Hand the screen to ${otherBinding?.label ?? 'the next seat'}</button>
      <label class="setting-toggle"><input type="checkbox" id="skip-dump-only" .checked=${skipDumpOnlySteps} @change=${(event: Event) => {
        skipDumpOnlySteps = (event.target as HTMLInputElement).checked;
        controller.setSkipDumpOnlySteps(skipDumpOnlySteps);
      }}> Pass the other player's step without a hand-over when blowing a dump (12.11a) is their only option</label>
    </section>
    <section class="menu-section" aria-labelledby="menu-checkpoints"><h3 id="menu-checkpoints">Checkpoints</h3>
      <button id="create-checkpoint" @click=${() => controller.createCheckpoint()}>Create checkpoint</button>
      <div class="checkpoint-list">${snapshot.checkpoints.length > 0 ? snapshot.checkpoints.map((checkpoint) => html`
        <button class="checkpoint" data-checkpoint=${checkpoint.id} @click=${() => { utilityOpen = null; void controller.undoTo(checkpoint.id); }}>Restore ${checkpoint.label || checkpoint.id} · R${checkpoint.revision}</button>`) : html`<p class="supporting">No checkpoints yet.</p>`}</div>
    </section>
  </div></section></div>`;
};

/** Keep Tab inside an open modal dialog. */
const trapFocus = (event: KeyboardEvent): void => {
  if (event.key !== 'Tab') return;
  const dialog = event.currentTarget as HTMLElement;
  const items = [...dialog.querySelectorAll<HTMLElement>('button:not(:disabled), input:not(:disabled), select:not(:disabled), [tabindex="0"]')].filter(e => e.getClientRects().length);
  const index = items.indexOf(document.activeElement as HTMLElement);
  if (event.shiftKey && index <= 0) { event.preventDefault(); items.at(-1)?.focus(); }
  else if (!event.shiftKey && index === items.length - 1) { event.preventDefault(); items[0]?.focus(); }
};

// ------------------------------------------------------------------ page

const appView = (snapshot: UiSnapshot): TemplateResult => {
  const sequence = snapshot.view.projection?.sequence;
  const activeBinding = snapshot.bindings.find(({ seatId }) => seatId === snapshot.view.metadata.activeSeatId);
  const lifecycle = snapshot.view.metadata.lifecycle;
  const modal = newGameOpen || utilityOpen !== null || (lifecycle === 'FINISHED' && !gameEndDismissed);
  return html`
    <div class="app-shell" ?inert=${modal}>
      <header class="topbar" data-active-seat=${activeBinding?.label ?? snapshot.view.playerId}>
        <div class="turn-strip" aria-label="Current turn state">
          <span class="turn-cell"><small>Turn ${sequence?.gameTurn ?? '–'} / ${currentGame.summary.turnLimit}</small><strong>${weatherLabel(snapshot)}</strong></span>
          <div class="phase-picker" tabindex="0" aria-label=${`${playerName(sequence?.phasingPlayerId)} Player Turn`}>
            ${phaseTrackCurrent(snapshot, sequence)}
            <ol class="phase-track phase-popup" aria-label=${`${playerName(sequence?.phasingPlayerId)} Player Turn phases`}>
              ${snapshot.phaseTrack.map((step) => phaseTrackItem(step, sequence))}
            </ol>
          </div>
          <div class="bar-controls">${phaseControlsView(snapshot, deck)}</div>
        </div>
        <div class="session-actions"><button id="open-menu" class="bar-button" aria-haspopup="dialog" @click=${() => { utilityOpen = 'menu'; render(controller.getSnapshot()); }}><span class="bar-label">☰ Menu</span></button></div>
      </header>

      <aside class="command-rail" aria-label="Command deck">${commandDeckView(snapshot, deck)}</aside>

      <main class="workspace">
        <section class="map-card" aria-label=${`${currentGame.summary.mapSize} · ${currentGame.summary.mapStyle.replaceAll('_', ' ').toLowerCase()}`}>
          <div class="map-viewport" id="map-viewport">
            ${mapHost}
            ${stackPicker(snapshot)}${rosterOpen ? unitRosterView(snapshot, deck) : movePopupView(snapshot, deck)}
            <div class="map-controls" aria-label="Map zoom controls"><button id="zoom-out" aria-label="Zoom out" @click=${() => mapView.zoomStep(-1)}>−</button><output id="zoom-level"></output><button id="zoom-in" aria-label="Zoom in" @click=${() => mapView.zoomStep(1)}>+</button><button id="zoom-reset" @click=${() => mapView.resetCamera()}>Reset</button><button id="toggle-air-zones" aria-pressed=${String(snapshot.air.showZones)} title="Show the 10-hex Patrol Zones of Air Bases with Active Fighters (14.4c)" @click=${() => controller.toggleAirZones()}>Patrol Zones</button></div>
            <div class="map-legend"><span class="terrain-key clear">Clear</span><span class="terrain-key woods">Woods</span><span class="terrain-key rough">Rough</span><span class="terrain-key mountain">Mountain</span><span class="terrain-key marsh">Marsh</span><span class="terrain-key water">Water</span><span class="line-key road">Road</span><span class="line-key river">River</span><span class="legend-mark objective">Objective</span><span class="legend-ring move">Move</span><span class="legend-ring move-stop" title="You must stop here (for example on entering an enemy ZOC)">Move ends here</span><span class="legend-ring attack">Attack</span><span class="legend-ring barrage">Barrage</span>${snapshot.air.showZones ? html`<span class="legend-ring air-zone">Your Patrol Zone</span><span class="legend-ring air-zone enemy">Enemy Patrol Zone</span>` : nothing}</div>
            <div class="hover-info" aria-live="off"></div>
          </div>
        </section>
      </main>
    </div>${newGameDialog()}${gameEndDialog(snapshot)}${menuDialog(snapshot)}`;
};

const render = (snapshot: UiSnapshot): void => {
  shown = snapshot;
  root.querySelectorAll<HTMLElement>('[data-scroll-key]').forEach((element) => listPositions.set(element.dataset.scrollKey!, element.scrollTop));
  if (snapshot.view.privacyLocked) {
    // The next seat sees nothing of this one: the map leaves the page and the deck forgets its state.
    utilityOpen = null; deck.search = ''; deck.tab = undefined; deck.lastPiece = null; rosterOpen = false; rosterWasOpen = false; lastMoveHex = null; listPositions.clear(); stackPickerHex = null;
    renderTemplate(privacyView(snapshot), root);
    root.querySelector<HTMLButtonElement>('#complete-handoff')?.focus();
    lastDialog = null;
    return;
  }
  syncDeckTab(snapshot, deck);
  mapView.update(mapStateOf(snapshot));
  renderTemplate(appView(snapshot), root);
  afterRender();
};

/** Focus, scroll and popup placement that follow from what was just drawn. */
const afterRender = (): void => {
  // A list keeps its scroll position per tab: when its key changes, restore where that tab was left.
  root.querySelectorAll<HTMLElement>('[data-scroll-key]').forEach((element) => {
    const key = element.dataset.scrollKey!;
    if (listKeys.get(element) !== key) { element.scrollTop = listPositions.get(key) ?? 0; listKeys.set(element, key); }
  });
  const info = root.querySelector<HTMLElement>('.hover-info');
  if (info && shown) info.textContent = hoverHexId ? hoverText(shown, hoverHexId) : 'Hover a hex for terrain.';
  updateCameraUi();
  const dialog = root.querySelector<HTMLElement>('[role="dialog"][aria-modal="true"], .modal-backdrop [role="dialog"]');
  if (dialog && dialog !== lastDialog && !dialog.contains(document.activeElement)) dialog.querySelector<HTMLElement>('button:not(:disabled), input, select')?.focus({ preventScroll: true });
  lastDialog = dialog;
  if (dialog) return;
  const focusLost = document.activeElement === document.body || document.activeElement === null;
  // The move popup takes focus when it opens (Enter confirms) and returns it to the map when it closes.
  const moveHex = root.querySelector<HTMLElement>('.move-popup')?.dataset.anchorHex ?? null;
  if (moveHex && moveHex !== lastMoveHex) (root.querySelector<HTMLElement>('#confirm-move:not(:disabled)') ?? root.querySelector<HTMLElement>('#cancel-move'))?.focus({ preventScroll: true });
  else if (!moveHex && lastMoveHex && focusLost) mapView.canvas.focus({ preventScroll: true });
  lastMoveHex = moveHex;
  // The roster takes focus into its search box when it opens and gives it back to its button when it closes.
  const rosterShown = root.querySelector('.roster-popup') !== null;
  if (rosterShown && !rosterWasOpen) root.querySelector<HTMLElement>('#roster-search')?.focus({ preventScroll: true });
  else if (!rosterShown && rosterWasOpen && focusLost) root.querySelector<HTMLElement>('#open-roster')?.focus({ preventScroll: true });
  rosterWasOpen = rosterShown;
};

/** Clicks on the command deck and the map popups, which are drawn without handlers of their own. */
root.addEventListener('click', (event) => {
  const target = event.target as Element;
  const closest = <T extends HTMLElement = HTMLElement>(selector: string) => target.closest<T>(selector);
  const byId = (id: string) => closest(`#${id}`) !== null;
  if (closest('button:disabled')) return;
  if (byId('end-phase')) {
    const snapshot = controller.getSnapshot();
    // Finishing Movement with units that have not moved asks for a second press (no undo after dice).
    if (unmovedUnits(snapshot) > 0 && !deck.confirmEnd) { deck.confirmEnd = true; render(snapshot); return; }
    deck.confirmEnd = false;
    stackPickerHex = null;
    void runUi(controller.endStep);
    return;
  }
  if (byId('deselect')) { controller.clearSelection(); return; }
  if (byId('finish-move')) { void runUi(controller.finishMove); return; }
  if (byId('resume-game')) { controller.resume(); return; }
  if (byId('undo-step')) { void runUi(controller.undoStep); return; }
  if (byId('auto-pay')) { void runUi(controller.autoPay); return; }
  if (byId('dismiss-result')) { controller.dismissResult(); return; }
  if (byId('dismiss-away')) { controller.dismissAwayReport(); return; }
  if (byId('begin-required-handoff')) { controller.beginHandoff(); return; }
  if (byId('confirm-move')) { void runUi(controller.confirmMove); return; }
  if (byId('cancel-move')) { controller.selectPiece(controller.getSnapshot().selection.pieceId); return; }
  if (byId('declare-draft')) { void runUi(controller.declareDraft); return; }
  if (byId('cancel-draft')) { controller.cancelDraft(); return; }
  if (byId('release-reserve')) { void runUi(controller.releaseReserve); return; }
  if (byId('declare-air-mission')) { void runUi(controller.declareAirMission); return; }
  if (byId('cancel-air-mission')) { controller.cancelAirMission(); return; }
  if (byId('open-roster')) { rosterOpen = !rosterOpen; stackPickerHex = null; render(controller.getSnapshot()); return; }
  if (byId('close-roster')) { rosterOpen = false; render(controller.getSnapshot()); return; }
  const pick = closest('[data-roster-pick]');
  if (pick) { rosterOpen = false; controller.selectPiece(pick.dataset.rosterPick ?? null); return; }
  const filter = closest('[data-unit-filter]');
  if (filter) { deck.filter = filter.dataset.unitFilter as UnitFilter; render(controller.getSnapshot()); return; }
  const tab = closest('[data-deck-tab]');
  if (tab) { const current = controller.getSnapshot(); selectDeckTab(current, deck, tab.dataset.deckTab!); render(current); return; }
  const targetHex = closest('[data-target-hex]');
  if (targetHex) { void runUi(() => controller.clickHex(targetHex.dataset.targetHex!)); return; }
  const mode = closest('[data-mode]');
  if (mode) { void runUi(() => controller.changeMode(mode.dataset.mode as never)); return; }
  const feed = closest('[data-feed]');
  if (feed) { void runUi(() => controller.feedSupply(feed.dataset.feed!, feed.dataset.dump!)); return; }
  // Fuel step 1 only remembers the pick; the dump list (step 2) is drawn from it.
  const fuelMethod = closest('[data-fuel-method]');
  if (fuelMethod) { const current = controller.getSnapshot(); deck.fuelMethod = { pieceId: current.selection.pieceId ?? '', method: fuelMethod.dataset.fuelMethod! }; render(current); return; }
  const action = closest('[data-unit-action]');
  if (action) { void runUi(() => controller.runAction(action.dataset.unitAction!)); return; }
  // The truck's supply area: the Token count is read from the row's own field when the button is pressed.
  const transfer = closest('[data-transfer]');
  if (transfer) {
    const field = transfer.closest('.transfer-row')?.querySelector<HTMLInputElement>('.transfer-tokens');
    const tokens = Number(field?.value);
    const min = Number(field?.min), max = Number(field?.max);
    if (!field || !Number.isSafeInteger(tokens) || tokens < min || tokens > max) { field?.focus(); field?.reportValidity(); return; }
    void runUi(() => controller.transferSupply(transfer.dataset.transfer as 'LOAD' | 'UNLOAD', transfer.dataset.dump ?? null, tokens));
    return;
  }
  const divide = closest('[data-divide]');
  if (divide) {
    const field = divide.closest('.transfer-row')?.querySelector<HTMLInputElement>('.divide-points');
    const points = Number(field?.value);
    if (!field || !Number.isSafeInteger(points) || points < Number(field.min) || points > Number(field.max)) { field?.focus(); field?.reportValidity(); return; }
    void runUi(() => controller.divideTruck(points));
    return;
  }
  const choice = closest('[data-choice]');
  if (choice) { void runUi(() => controller.respondToDecision(choice.dataset.choice ?? '')); return; }
  const mission = closest('[data-air-mission]');
  if (mission) { controller.planAirMission(mission.dataset.airMission as never); return; }
  const airTarget = closest('[data-air-target]');
  if (airTarget) { controller.setAirTarget(airTarget.dataset.airTarget as never); return; }
  const refit = closest('[data-refit]');
  if (refit) { void runUi(() => controller.refitBase(refit.dataset.refit!)); return; }
  const unit = closest('.deck-unit[data-piece]');
  if (unit) controller.selectPiece(unit.dataset.piece ?? null);
});

/** Pointing at (or focusing) a supply option in the deck marks its hex on the map without redrawing the deck. */
const markSource = (event: Event, entering: boolean): void => {
  const hexId = (event.target as Element).closest<HTMLElement>('[data-highlight-hex]')?.dataset.highlightHex ?? null;
  if (!hexId && entering) return;
  const next = entering ? hexId : null;
  if (next === sourceHighlightHex || !shown) return;
  sourceHighlightHex = next;
  mapView.update(mapStateOf(shown));
};
root.addEventListener('pointerover', (event) => markSource(event, true));
root.addEventListener('pointerout', (event) => markSource(event, false));
root.addEventListener('focusin', (event) => markSource(event, true));
root.addEventListener('focusout', (event) => markSource(event, false));

root.addEventListener('change', (event) => {
  const input = event.target as HTMLInputElement;
  if (input.dataset.participant) controller.toggleParticipant(input.dataset.participant);
  else if (input.dataset.lead) controller.setLead(input.dataset.lead);
  else if (input.dataset.airAircraft) controller.toggleAirAircraft(input.dataset.airAircraft);
  else if (input.dataset.refitAircraft) controller.toggleRefitAircraft(input.dataset.refitBase!, input.dataset.refitAircraft);
});

/** Typing in the roster search filters its rows; the rows are keyed, so the counters already drawn are kept. */
root.addEventListener('input', (event) => {
  const input = event.target as HTMLInputElement;
  if (input.id !== 'roster-search') return;
  deck.search = input.value;
  render(controller.getSnapshot());
});

const downloadJson = (content: string, filename: string): void => {
  const blob = new Blob([content], { type: 'application/json' });
  const anchor = document.createElement('a');
  anchor.href = URL.createObjectURL(blob);
  anchor.download = filename;
  anchor.click();
  URL.revokeObjectURL(anchor.href);
};

const openNewGame = (): void => {
  utilityOpen = null;
  previewStale = false;
  settingsTab = 'basic';
  newGameOpen = true;
  newGamePreview = null;
  newGameError = '';
  newGameErrors = [];
  fieldError = null;
  editedFields = new Set();
  history.replaceState(null, '', '#new-game');
  render(controller.getSnapshot());
  schedulePreview(0);
};

/** Rebuild the combined preview shortly after the settings stop changing (it takes ~0.1 s). */
const schedulePreview = (delay = 350): void => {
  if (previewTimer !== null) clearTimeout(previewTimer);
  previewTimer = setTimeout(() => { previewTimer = null; void buildPreview(); }, delay);
};

const buildPreview = async (): Promise<void> => {
  if (!newGameOpen) return;
  if (newGameBusy) { schedulePreview(); return; }
  const form = root.querySelector<HTMLFormElement>('#new-game-form');
  // checkValidity fires the per-field "invalid" handler without stealing focus from the field being typed in.
  if (form && !form.checkValidity()) {
    newGamePreview = null;
    return;
  }
  newGameError = '';
  newGameErrors = [];
  editedFields = new Set();
  newGameBusy = true;
  preparingPreview = true;
  render(controller.getSnapshot());
  await afterPaint();
  try {
    const prepared = newGameOrchestrator.prepare(newGameSettings);
    if (prepared.ok) newGamePreview = prepared.value;
    else {
      newGamePreview = null;
      newGameErrors = prepared.error;
      newGameError = prepared.error.map(({ stage, message }) => `${stage}: ${withHexLabels(message)}`).join(' ');
    }
  } catch (error) {
    newGamePreview = null;
    newGameError = `${error instanceof Error ? error.message : 'Preview failed.'} Adjust the settings and try again.`;
  }
  newGameBusy = false;
  preparingPreview = false;
  previewStale = false;
  render(controller.getSnapshot());
};

const mountCreatedGame = async (created: CreatedNewGame): Promise<void> => {
  unsubscribeController?.();
  unsubscribeController = null;
  controller.dispose();
  await currentGame.session.close();
  currentGame = created;
  deck.search = ''; deck.tab = undefined; deck.lastPiece = null; rosterOpen = false; rosterWasOpen = false; lastMoveHex = null; deck.filter = 'all'; deck.confirmEnd = false; listPositions.clear(); utilityOpen = null; gameEndDismissed = false;
  hoverHexId = null; stackPickerHex = null;
  scenario = created.scenario;
  bindings = created.bindings;
  theater = buildGeneratedMapPreview(created.generatedMap, 50);
  cellsById = new Map(theater.cells.map((cell) => [cell.id, cell]));
  void showScene();
  newGameSettings = created.request;
  newGamePreview = null;
  newGameOpen = false;
  newGameBusy = false;
  newGameError = '';
  history.replaceState(null, '', location.pathname);
  controller = createUiController({ engine, session: created.session, scenario, bindings, skipDumpOnlySteps });
  unsubscribeController = controller.subscribe(render);
};

window.addEventListener('keydown', (event) => {
  if (event.key !== 'Escape') return;
  if (rosterOpen) { rosterOpen = false; render(controller.getSnapshot()); return; }
  if (controller.getSnapshot().movePreview) { controller.selectPiece(controller.getSnapshot().selection.pieceId); return; }
  if (stackPickerHex) { stackPickerHex = null; render(controller.getSnapshot()); return; }
  if (utilityOpen) { utilityOpen = null; render(controller.getSnapshot()); return; }
  if (newGameOpen && !newGameBusy) { closeNewGame(); return; }
  const snapshot = controller.getSnapshot();
  if (snapshot.draft) { controller.cancelDraft(); return; }
  // A unit part-way through its move is not dropped by Esc: only Done ends it (6.1g). Point the player at Done instead.
  if (snapshot.selectedIsMoving) {
    deck.hint = 'This unit is still moving. Press Done to finish its move, or pick another unit.';
    render(snapshot);
    document.querySelector<HTMLButtonElement>('#finish-move')?.focus();
    return;
  }
  controller.clearSelection();
});

performance.mark('ocs:boot:render');
void showScene();
root.replaceChildren();
unsubscribeController = controller.subscribe(render);
performance.mark('ocs:boot:ready');
