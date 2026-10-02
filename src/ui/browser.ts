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
} from '../index.js';
import { createUiController, type UiController } from './controller.js';
import { counterView, counterSvgBody, counterSvg, counterLod } from './counter.js';
import {
  coastlineHtml, hexGridHtml, hexNumberHtml, mapArtDefsHtml, objectiveArtHtml, regionEdgesHtml, riversHtml, roadsHtml, settlementArtHtml,
  strategicBandPoints, terrainFillHtml, terrainGlyphsHtml,
} from './map-art.js';
import { commandDeckHtml, movePopupHtml, phaseControlsHtml, selectDeckTab, syncDeckTab, unitRosterBodyHtml, unitRosterHtml, unmovedUnits, withHexLabels, type DeckState, type UnitFilter } from './command-deck.js';
import type { UiSnapshot } from './model.js';
import { phaseLabel, pieceLabel, printedHexLabel } from './presenter.js';

const root = document.querySelector<HTMLElement>('#app') ?? (() => {
  throw new Error('UI root was not found.');
})();

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
let layout = theater.layout;
let unsubscribeController: (() => void) | null = null;

/** Internal scale of the normal framing; the zoom readout is relative to it, so this framing reads 100%. */
const DEFAULT_ZOOM = 1.4;
const zoomPercent = (): number => Math.round((camera.zoom / DEFAULT_ZOOM) * 100);
const camera = { zoom: DEFAULT_ZOOM, x: 0, y: 0 };
let dragging: { x: number; y: number; cameraX: number; cameraY: number } | null = null;
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

/** Which settings to change for a failed build, and the fields to flag. */
const NEW_GAME_FIXES: readonly { readonly codes: readonly string[]; readonly text: string; readonly fields: readonly string[] }[] = [
  { codes: ['INITIAL_OVERSTACK', 'DEPLOYMENT_INVALID'], text: 'Too many units for the starting areas of this map: make the map wider or taller, or lower Scale or Formations per side.', fields: ['new-game-width', 'new-game-height', 'new-game-scale', 'new-game-formations'] },
  { codes: ['CALENDAR_EXCEEDS_WEATHER_TABLE', 'INVALID_START_MONTH'], text: 'The game would run past April: start earlier or lower the Turn limit.', fields: ['new-game-start-month', 'new-game-turn-limit'] },
  { codes: ['INVALID_TURN_LIMIT'], text: 'Turn limit must be from 1 to 20.', fields: ['new-game-turn-limit'] },
  { codes: ['MAP_WIDTH_OUT_OF_RANGE'], text: `Width must be from ${NEW_GAME_MAP_LIMITS.minWidth} to ${NEW_GAME_MAP_LIMITS.maxWidth} hexes.`, fields: ['new-game-width'] },
  { codes: ['MAP_HEIGHT_OUT_OF_RANGE'], text: `Height must be from ${NEW_GAME_MAP_LIMITS.minHeight} to ${NEW_GAME_MAP_LIMITS.maxHeight} hexes.`, fields: ['new-game-height'] },
];
const newGameGuidance = (): string => NEW_GAME_FIXES.filter(({ codes }) => newGameErrors.some(({ code }) => codes.includes(code))).map(({ text }) => text).join(' ');
const newGameInvalidFields = (): readonly string[] => [
  ...NEW_GAME_FIXES.filter(({ codes }) => newGameErrors.some(({ code }) => codes.includes(code))).flatMap(({ fields }) => fields),
  ...newGameErrors.filter(({ code }) => code === 'INVALID_SEED').map(({ path }) => `new-game-${String(path[1])}-seed`),
];
const deck: DeckState = { search: '', working: false };
let rosterOpen = false;
/** Destination of the move popup drawn last, to hand focus to it when it opens and back to the hex when it closes. */
let lastMoveHex: string | null = null;
/** Whether the roster popup was open when the page was drawn last, to move focus in and back out of it. */
let rosterWasOpen = false;
let utilityOpen: 'session' | null = null;
let gameEndDismissed = false;
const listPositions = new Map<string, number>();
let settingsTab = 'basic';
let previewStale = false;
let mapDragged = false;
let hoverHexId: string | null = null;
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
let stackPickerHex: string | null = null;
const runUi = async (operation: () => void | Promise<void>): Promise<void> => {
  if (deck.working) return;
  deck.error = '';
  deck.confirmEnd = false;
  deck.working = true;
  root.querySelectorAll<HTMLButtonElement>('#end-phase, #confirm-move, #declare-draft').forEach(button => { button.disabled = true; });
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

/** One line under a turn-track phase: who acts (Reaction) and, for the current phase, the segment. */
const trackSubLabel = (step: UiSnapshot['phaseTrack'][number], sequence: NonNullable<UiSnapshot['view']['projection']>['sequence'] | undefined): string => {
  const segment = step.status === 'current' && sequence && sequence.segment !== 'NONE' ? (phaseLabel(sequence.phase, sequence.segment).split(' · ')[1] ?? '').replace(/ Segment$/u, '') : '';
  const parts = [
    step.actorId !== sequence?.phasingPlayerId ? playerName(step.actorId) : '',
    // "Movement · Movement Segment" would read "Movement Movement"; only name a segment that adds information.
    segment.toLowerCase() === step.label.toLowerCase() ? '' : segment,
  ].filter(Boolean);
  return parts.length > 0 ? `<small>${escapeHtml(parts.join(' · '))}</small>` : '';
};

const phaseTrackItemHtml = (step: UiSnapshot['phaseTrack'][number], sequence: NonNullable<UiSnapshot['view']['projection']>['sequence'] | undefined): string =>
  `<li class="is-${step.status}"${step.status === 'current' ? ' aria-current="step"' : ''} title="${escapeHtml(`${step.label}${step.actorId !== sequence?.phasingPlayerId ? ` (${playerName(step.actorId)})` : ''}: ${step.status === 'skipped' ? 'passed automatically, no legal actions' : step.status}`)}">${escapeHtml(step.label)}${trackSubLabel(step, sequence)}</li>`;

/** The always-visible chip: just the current phase. Hovering the picker opens the full list as a popup. */
const phaseTrackCurrentHtml = (snapshot: UiSnapshot, sequence: NonNullable<UiSnapshot['view']['projection']>['sequence'] | undefined): string => {
  const current = snapshot.phaseTrack.find((step) => step.status === 'current');
  // Steps outside the turn track (First Player roll, Weather, Game over) still name where the game is.
  if (!current) return sequence ? `<span class="phase-current">${escapeHtml(phaseLabel(sequence.phase, sequence.segment))}</span>` : '';
  return `<span class="phase-current">${escapeHtml(current.label)}${trackSubLabel(current, sequence)}</span>`;
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
    const definition = scenario.pieceCatalog.definitions.find(({ id }) => id === piece.definitionId);
    const rank = definition?.family === 'RESOURCE' ? 0 : STACK_PRIORITY[definition?.counter?.kind ?? 'COMBAT'] ?? 4;
    return { piece, rank, index };
  })
  .sort((left, right) => left.rank - right.rank || left.index - right.index)
  .map(({ piece }) => piece);

/** Terrain of the hovered hex and, while a unit is selected, the MP it would cost to get there. */
const hoverText = (snapshot: UiSnapshot, hexId: string): string => {
  const cell = theater.cells.find(({ id }) => id === hexId);
  if (!cell) return 'Hover a hex for terrain.';
  const range = snapshot.moveRange.get(hexId);
  const cost = range ? ` · ${range.costTicks / 4} MP, ${range.remainingAfterTicks / 4} left${range.endsMovement ? ', move ends here' : ''}`
    : snapshot.moveRange.size > 0 && snapshot.selectedPiece?.location.kind === 'ON_MAP' && snapshot.selectedPiece.location.hexId !== hexId ? ' · out of reach' : '';
  return `Hex ${printedHexLabel(cell.id)} · ${cell.terrain.toLowerCase()}${cell.settlement ? ` · ${cell.settlement.toLowerCase()}` : ''}${currentGame.deployment.objectiveHexIds.includes(cell.id as never) ? ' · objective' : ''}${cost}`;
};

const renderMap = (snapshot: UiSnapshot): string => {
  const stacks = onMapStacks(snapshot);
  const objectives = new Set<string>(currentGame.deployment.objectiveHexIds);
  const attack = new Set(snapshot.attackTargets);
  const barrage = new Set(snapshot.barrageTargets);
  const placement = new Set(snapshot.placementHexes);
  const retreat = new Set([...snapshot.decisionHexes, ...snapshot.collapseHexes]);
  const airTargets = new Set(snapshot.air.targetHexes);
  const ownZone = new Set(snapshot.air.showZones ? snapshot.air.patrolZones.own : []);
  const enemyZone = new Set(snapshot.air.showZones ? snapshot.air.patrolZones.enemy : []);
  const moving = snapshot.reachable.size > 0;
  const combatHex = snapshot.view.projection?.combat?.targetHexId ?? null;
  const reachBand = (hexId: string): string => {
    const entry = snapshot.moveRange.get(hexId);
    if (!entry) return '';
    return entry.endsMovement ? 'reach-stop' : '';
  };
  const terrain = theater.cells.map((cell) => {
    const classes = [
      'hex-cell', `terrain-${cell.terrain.toLowerCase()}`,
      snapshot.selection.hexId === cell.id ? 'is-selected' : '',
      snapshot.reachable.has(cell.id) ? `is-reachable ${reachBand(cell.id)}` : '',
      snapshot.movePreview?.destinationHexId === cell.id ? 'is-destination' : '',
      attack.has(cell.id) ? 'is-attack' : '',
      barrage.has(cell.id) ? 'is-barrage' : '',
      placement.has(cell.id) ? 'is-placement' : '',
      retreat.has(cell.id) ? 'is-retreat' : '',
      airTargets.has(cell.id) ? 'is-air-target' : '',
      snapshot.draft?.targetHexId === cell.id || combatHex === cell.id ? 'is-target' : '',
    ].filter(Boolean).join(' ');
    return `<g class="${classes}" role="button" tabindex="${cell.id === (snapshot.selection.hexId ?? theater.cells[0]?.id) ? 0 : -1}" data-hex="${escapeHtml(cell.id)}"
      aria-label="Hex ${escapeHtml(printedHexLabel(cell.id))}, ${escapeHtml(cell.terrain.toLowerCase())}">
      <polygon points="${cell.points}"></polygon>
      ${terrainGlyphsHtml(cell, layout.hexSize)}
      ${hexNumberHtml(cell, escapeHtml(printedHexLabel(cell.id)), layout.hexSize)}
    </g>`;
  }).join('');
  // Ground fills carry no outline or interaction; while a unit is selected, hexes outside its range recede.
  const fills = theater.cells.map((cell) => terrainFillHtml(cell, layout.hexSize,
    moving && !snapshot.reachable.has(cell.id) && !attack.has(cell.id) && snapshot.selection.hexId !== cell.id ? 'is-dimmed' : '')).join('');
  const gridLines = regionEdgesHtml(theater.cells, layout.hexSize) + hexGridHtml(theater.cells, layout.hexSize);
  const rivers = coastlineHtml(theater.cells, layout.hexSize) + riversHtml(theater.edges, layout.hexSize, 'map-edge');
  const roads = roadsHtml(theater.edges, theater.cells, layout.hexSize, 'map-edge');
  const features = theater.cells.map((cell) => {
    const settlement = cell.settlement ? `<g class="settlement settlement-${cell.settlement.toLowerCase()}" aria-label="${cell.settlement.toLowerCase()}">${settlementArtHtml(cell, layout.hexSize)}</g>` : '';
    const strategic = cell.strategic ? `<polygon class="strategic-zone side-${cell.strategic.toLowerCase()}" points="${strategicBandPoints(cell, layout.hexSize)}" aria-label="${cell.strategic.toLowerCase()} entry or supply zone"></polygon>` : '';
    const objective = objectives.has(cell.id) ? `<g class="objective-marker" aria-label="objective">${objectiveArtHtml(cell, layout.hexSize)}</g>` : '';
    // 14.4c Patrol Zones (both sides can see Active Fighters on top, 4.8e) and 14.8 Trainbusting markers.
    const zone = [ownZone.has(cell.id) ? `<polygon class="air-zone-mark" points="${cell.points}" transform="translate(${cell.x} ${cell.y}) scale(.86) translate(${-cell.x} ${-cell.y})"></polygon>` : '',
      enemyZone.has(cell.id) ? `<polygon class="air-zone-mark enemy" points="${cell.points}" transform="translate(${cell.x} ${cell.y}) scale(.78) translate(${-cell.x} ${-cell.y})"></polygon>` : ''].join('');
    const busting = snapshot.air.trainbusting.find(({ hexId }) => hexId === cell.id);
    const trainbusting = busting ? `<g class="trainbusting-mark" aria-label="Trainbusting marker${busting.own ? '' : ' (enemy)'}"><rect x="${cell.x + 8}" y="${cell.y + 8}" width="30" height="18" rx="3"></rect><text x="${cell.x + 23}" y="${cell.y + 21}" text-anchor="middle">TB</text></g>` : '';
    return `${strategic}${settlement}${objective}${zone}${trainbusting}`;
  }).join('');
  const pathPoints = (snapshot.movePreview?.path ?? [])
    .map(id => theater.cells.find(cell => cell.id === id)).filter(cell => cell !== undefined).map(cell => `${cell.x},${cell.y}`).join(' ');
  const lastPoint = pathPoints.split(' ').at(-1)?.split(',');
  const pathEnd = pathPoints && lastPoint ? `<circle class="movement-path-end" cx="${lastPoint[0]}" cy="${lastPoint[1]}" r="7"></circle>` : '';
  const selectedCounters: string[] = [];
  const stackBadges: string[] = [];
  const counters = theater.cells.map((cell) => {
    const stack = stacks.get(cell.id);
    const allPieces = stackOrder(stack?.pieces ?? []);
    // Supply lies in the hex rather than in the stack: a hex's dump is one small marker at its corner and does not take one of the
    // three counter places or count towards the hidden ones.
    const dumps = allPieces.filter(({ role }) => role === 'DUMP').sort((left, right) => (right.resourceQuantity ?? 0) - (left.resourceQuantity ?? 0));
    const pieces = allPieces.filter(({ role }) => role !== 'DUMP');
    // Draw the bottom of the stack first; at most three counters are shown, the rest are counted.
    const visible = pieces.slice(-3);
    const selectedPiece = pieces.find(({ id }) => id === snapshot.selection.pieceId);
    if (selectedPiece && !visible.includes(selectedPiece)) visible.push(selectedPiece);
    const dump = dumps[0];
    const dumpMarkup = dump ? (() => {
      const definition = scenario.pieceCatalog.definitions.find(({ id }) => id === dump.definitionId)!;
      const ownerIndex = scenario.players.findIndex(({ id }) => id === dump.ownerId);
      const isSelected = snapshot.selection.pieceId === dump.id;
      const markup = `<g class="counter dump-marker owner-${ownerIndex + 1}${isSelected ? ' is-selected' : ''}" transform="translate(${cell.x - 4} ${cell.y - 2}) scale(.5)"
        role="button" tabindex="-1" data-piece="${escapeHtml(dump.id)}" data-hex="${escapeHtml(cell.id)}"
        aria-label="${escapeHtml(`${dump.ownerId === snapshot.view.playerId ? '' : 'Enemy '}${pieceLabel(scenario, dump)}, hex ${printedHexLabel(cell.id)}`)}">
        ${counterSvgBody(counterView(definition, dump))}
      </g>`;
      if (isSelected) { selectedCounters.push(markup); return ''; }
      return markup;
    })() : '';
    const html = dumpMarkup + visible.map((piece, index) => {
      const ownerIndex = scenario.players.findIndex(({ id }) => id === piece.ownerId);
      const x = cell.x - 35 + index * 6;
      const y = cell.y - 35 - index * 6;
      const isSelected = snapshot.selection.pieceId === piece.id;
      const definition = scenario.pieceCatalog.definitions.find(({ id }) => id === piece.definitionId)!;
      const markup = `<g class="counter owner-${ownerIndex + 1}${isSelected ? ' is-selected' : ''}" transform="translate(${x} ${y}) scale(.7)"
        role="button" tabindex="-1" data-piece="${escapeHtml(piece.id)}" data-hex="${escapeHtml(cell.id)}"
        aria-label="${escapeHtml(`${piece.ownerId === snapshot.view.playerId ? '' : 'Enemy '}${pieceLabel(scenario, piece)}, hex ${printedHexLabel(cell.id)}`)}">
        ${counterSvgBody(counterView(definition, piece))}
      </g>`;
      if (isSelected) { selectedCounters.push(markup); return ''; }
      return markup;
    }).join('');
    const hiddenCount = (stack?.hiddenCount ?? 0) + Math.max(0, pieces.length - visible.length) + Math.max(0, dumps.length - 1);
    if (hiddenCount > 0) stackBadges.push(`<g class="hidden-count" transform="translate(${cell.x + 26} ${cell.y - 34})"><circle r="12"></circle><text y="5" text-anchor="middle">+${hiddenCount}</text></g>`);
    return html;
  }).join('');
  // Target outlines sit above the counters so a stack never hides an entry, attack or retreat hex.
  const overlay = theater.cells.flatMap((cell) => {
    const kinds = [
      attack.has(cell.id) ? 'attack' : '', barrage.has(cell.id) ? 'barrage' : '', placement.has(cell.id) ? 'placement' : '',
      retreat.has(cell.id) ? 'retreat' : '', snapshot.movePreview?.destinationHexId === cell.id ? 'destination' : '',
      snapshot.draft?.targetHexId === cell.id || combatHex === cell.id ? 'target' : '',
    ].filter(Boolean);
    return kinds.length === 0 ? [] : [`<polygon class="target-outline ${kinds.map((kind) => `outline-${kind}`).join(' ')}" points="${cell.points}"></polygon>`];
  }).join('');
  // SVG paints in document order: every hex below every counter, the selected counter on top.
  return `${mapArtDefsHtml()}<g class="hex-map-layer${moving ? ' is-moving' : ''}"><g class="terrain-layer">${fills}</g><g class="grid-layer">${gridLines}</g><g class="hex-cells">${terrain}</g><g class="river-layer">${rivers}</g><g class="road-layer">${roads}</g><g class="feature-layer">${features}</g><polyline class="movement-path" points="${pathPoints}" />${pathEnd}</g><g class="counter-layer"><g class="unselected-counter-layer">${counters}</g><g class="selected-counter-layer">${selectedCounters.join('')}</g><g class="stack-badge-layer">${stackBadges.join('')}</g></g><g class="target-overlay" aria-hidden="true">${overlay}</g>`;
};

const privacyHtml = (snapshot: UiSnapshot): string => snapshot.view.privacyLocked ? `
  <div class="privacy-screen" role="dialog" aria-modal="true" aria-labelledby="handoff-title">
    <div><p class="eyebrow">HOT-SEAT PRIVACY</p><h2 id="handoff-title">Pass the screen to ${escapeHtml(snapshot.handoff?.toLabel ?? 'the next player')}</h2>
    <p>${escapeHtml(snapshot.handoff?.reason ?? 'The map is hidden until the next player confirms.')}</p>
    <p class="supporting">The map stays hidden until they confirm.</p>
    <button class="primary" id="complete-handoff">I am ${escapeHtml(snapshot.handoff?.toLabel ?? 'the next player')}</button></div>
  </div>` : '';

const oobRoleLabel = (role: string): string => role.replaceAll('_', ' ').toLowerCase();

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
    ${side.formations.map((formation) => `<details class="counter-formation"><summary><span>${escapeHtml(formation.name)}</span><small>${formation.units.length} units · ${escapeHtml(formation.archetype.replaceAll('_', ' ').toLowerCase())}</small></summary><div class="counter-grid">${formation.units.map(previewCounter).join('')}</div></details>`).join('')}
    <details class="counter-formation"><summary>${side.independentUnits.filter(({ role }) => role !== 'AIRCRAFT' && role !== 'AIR_BASE').length} independent support / logistics units</summary><div class="counter-grid">${side.independentUnits.filter(({ role }) => role !== 'AIRCRAFT' && role !== 'AIR_BASE').map(previewCounter).join('')}</div></details>
    ${side.independentUnits.some(({ role }) => role === 'AIRCRAFT') ? `<details class="counter-formation"><summary>Air forces: ${side.independentUnits.filter(({ role }) => role === 'AIRCRAFT').length} aircraft, ${side.independentUnits.filter(({ role }) => role === 'AIR_BASE').length} Air Base(s)</summary><div class="counter-grid">${side.independentUnits.filter(({ role }) => role === 'AIRCRAFT' || role === 'AIR_BASE').map(previewCounter).join('')}</div></details>` : ''}
  </section>`).join('');
  return `<div class="operation-preview-content">
    <div class="operation-map-wrap"><svg class="operation-map" viewBox="0 0 ${map.layout.width} ${map.layout.height}" role="img" aria-label="Generated operation map preview with starting positions">${mapArtDefsHtml()}${cells}${rivers}${roads}${features}${deploymentMarks}</svg><p class="preview-key"><span class="key owner-1">${escapeHtml(prepared.scenario.players[0]?.name ?? '')}</span><span class="key owner-2">${escapeHtml(prepared.scenario.players[1]?.name ?? '')}</span> starting stacks (unit count)</p></div>
    <dl class="operation-metrics"><div><dt>Map</dt><dd>${escapeHtml(prepared.summary.mapSize)}</dd></div><div><dt>Units</dt><dd>${prepared.summary.unitCount}</dd></div><div><dt>Formations</dt><dd>${prepared.summary.formationCount}</dd></div><div><dt>Deployed hexes</dt><dd>${prepared.deployment.metrics.occupiedHexes}</dd></div><div><dt>Objectives</dt><dd>${prepared.summary.objectiveCount}</dd></div><div><dt>Warnings</dt><dd>${prepared.warnings.length}</dd></div></dl>
    <div class="preview-forces">${forces}</div>
    ${prepared.warnings.length > 0 ? `<details class="preview-warnings"><summary>${prepared.warnings.length} generation warning(s)</summary><ul>${prepared.warnings.map((warning) => `<li>${escapeHtml(warning)}</li>`).join('')}</ul></details>` : ''}
    <button id="start-previewed-game" class="primary wide" ${newGameBusy ? 'disabled' : ''}>${newGameBusy ? 'Starting operation…' : 'Start this operation'}</button>
  </div>`;
};

const newGameDialogHtml = (): string => {
  if (!newGameOpen) return '';
  // Every stage reports its real state: current, generating, done, or the stage that failed.
  const ready = newGamePreview !== null && !previewStale;
  const failed = new Set(newGameErrors.map(({ stage }) => stage));
  const stageClass = (stages: readonly string[]): string => stages.some((stage) => failed.has(stage)) ? 'is-error'
    : preparingPreview ? 'is-active' : ready ? 'is-complete' : '';
  const configuredClass = failed.has('OPTIONS') ? 'is-error' : ready || preparingPreview ? 'is-complete' : 'is-active';
  const generatedClass = stageClass(['MAP']);
  const oobClass = stageClass(['OOB']);
  const deploymentClass = stageClass(['DEPLOYMENT', 'SCENARIO']);
  const gameplayClass = failed.has('GAMEPLAY_BOOTSTRAP') ? 'is-error' : newGameBusy && !preparingPreview ? 'is-active' : '';
  return `<div class="modal-backdrop new-game-backdrop"><section class="new-game-dialog" role="dialog" aria-modal="true" aria-labelledby="new-game-title">
    <header class="generator-header"><div><p class="eyebrow">NEW OPERATION</p><h2 id="new-game-title">Build, inspect, then deploy</h2><p>Map, OOB and deployment are generated as one deterministic package. The preview below is the operation Gameplay will mount.</p></div><button id="close-new-game" ${newGameBusy ? 'disabled' : ''}>Close</button></header>
    <div class="flow-steps" aria-label="New Game generation sequence"><span class="${configuredClass}" ${configuredClass === 'is-active' ? 'aria-current="step"' : ''}>1 Configure</span><span class="${generatedClass}">2 Map</span><span class="${oobClass}">3 OOB</span><span class="${deploymentClass}">4 Deployment</span><span class="${gameplayClass}" ${gameplayClass === 'is-active' ? 'aria-current="step"' : ''}>5 Gameplay</span></div>
    <div class="new-game-body"><form id="new-game-form" class="new-game-form">
      <div class="new-game-submit">
        <div><strong>${preparingPreview ? 'Generating map, forces and deployment…' : newGameErrors.length > 0 ? 'Cannot build this operation' : previewStale ? 'Updating preview…' : newGamePreview ? 'Preview ready' : 'Configure operation'}</strong><p>${newGameErrors.length > 0 ? 'Adjust the highlighted settings.' : 'The preview updates as you change settings; Start plays exactly this package.'}</p></div>
        <button type="submit" ${newGameBusy ? 'disabled' : ''}>${preparingPreview ? 'Building preview…' : 'Rebuild operation preview'}</button>
      </div>
      <fieldset><legend>Operational map</legend>
        <label>Style<select id="new-game-style"><option value="TEMPERATE_INLAND" ${newGameSettings.map.style === 'TEMPERATE_INLAND' ? 'selected' : ''}>Temperate inland</option><option value="MEDITERRANEAN_COAST" ${newGameSettings.map.style === 'MEDITERRANEAN_COAST' ? 'selected' : ''}>Mediterranean coast</option></select></label>
        <label>Width<input id="new-game-width" type="number" min="${NEW_GAME_MAP_LIMITS.minWidth}" max="${NEW_GAME_MAP_LIMITS.maxWidth}" value="${newGameSettings.map.width}"></label>
        <label>Height<input id="new-game-height" type="number" min="${NEW_GAME_MAP_LIMITS.minHeight}" max="${NEW_GAME_MAP_LIMITS.maxHeight}" value="${newGameSettings.map.height}"></label>
        <label>Map seed<input id="new-game-map-seed" type="number" min="0" max="4294967295" value="${newGameSettings.seeds.map}"></label>
      </fieldset>
      <fieldset><legend>Order of battle</legend>
        <label>Scale<select id="new-game-scale"><option value="COMPACT" ${newGameSettings.oob.scale === 'COMPACT' ? 'selected' : ''}>Compact</option><option value="STANDARD" ${newGameSettings.oob.scale === 'STANDARD' ? 'selected' : ''}>Standard</option><option value="LARGE" ${newGameSettings.oob.scale === 'LARGE' ? 'selected' : ''}>Large</option></select></label>
        <label>Formations per side<input id="new-game-formations" type="number" min="1" max="6" value="${newGameSettings.oob.formationsPerSide}"></label>
        <label>OOB seed<input id="new-game-oob-seed" type="number" min="0" max="4294967295" value="${newGameSettings.seeds.oob}"></label>
        <label>Deployment seed<input id="new-game-deployment-seed" type="number" min="0" max="4294967295" value="${newGameSettings.seeds.deployment}"></label>
        <label>Air forces<select id="new-game-air"><option value="NONE" ${(newGameSettings.oob.air ?? 'NONE') === 'NONE' ? 'selected' : ''}>None (ground duel)</option><option value="STANDARD" ${newGameSettings.oob.air === 'STANDARD' ? 'selected' : ''}>Fighters, bombers and Air Bases</option></select></label>
      </fieldset>
      <fieldset><legend>Game rules</legend>
        <label>Turn limit<input id="new-game-turn-limit" type="number" min="1" max="20" value="${newGameSettings.turnLimit}"></label>
        <label>Start month<select id="new-game-start-month">${START_MONTHS.map(([month, name]) => `<option value="${month}" ${newGameSettings.startMonth === month ? 'selected' : ''}>${name}</option>`).join('')}</select></label>
        <p class="field-help">The month sets the weather: September is always dry, autumn brings mud, and midwinter snow.</p>
        <label>Rules seed<input id="new-game-rules-seed" type="number" min="0" max="4294967295" value="${newGameSettings.seeds.rules}"></label>
        <button type="button" id="randomize-new-game">Randomize all seeds</button>
      </fieldset>
      ${newGameError ? `<div class="generator-error new-game-error" role="alert">${newGameGuidance() ? `<p><strong>${escapeHtml(newGameGuidance())}</strong></p>` : ''}<p>${escapeHtml(newGameError)}</p></div>` : ''}
    </form><section class="operation-preview" aria-label="Combined generated operation preview">${newGamePreview ? operationPreviewHtml(newGamePreview) : '<div class="operation-preview-empty"><strong>No operation built yet</strong><p>Choose map and force options, then build one combined preview. Starting is unavailable until map, OOB and deployment all validate together.</p></div>'}</section></div>
  </section></div>`;
};

/** BTR Weather Table months (17.0), in campaign order. */
const START_MONTHS: readonly (readonly [number, string])[] = [
  [9, 'September'], [10, 'October'], [11, 'November'], [12, 'December'], [1, 'January'], [2, 'February'], [3, 'March'], [4, 'April'],
];

const gameEndHtml = (snapshot: UiSnapshot): string => {
  if (snapshot.view.metadata.lifecycle !== 'FINISHED' || newGameOpen || gameEndDismissed) return '';
  const victory = snapshot.view.projection?.victory;
  const winner = victory?.winnerId === null
    ? 'Draw'
    : scenario.players.find(({ id }) => id === victory?.winnerId)?.name ?? 'Undetermined';
  const scores = victory?.scores.map(({ playerId, points }) => {
    const player = scenario.players.find(({ id }) => id === playerId);
    return `<div><dt>${escapeHtml(player?.name ?? playerId)}</dt><dd>${points}</dd></div>`;
  }).join('') ?? '';
  return `<div class="modal-backdrop game-end-backdrop"><section class="game-end-dialog" role="dialog" aria-modal="true" aria-labelledby="game-end-title">
    <p class="eyebrow">GAME END</p><h2 id="game-end-title">${escapeHtml(winner)}</h2>
    <p>${victory?.winnerId === null ? 'The operation ends without a sole winner.' : `${winner} wins the generated operation.`}</p>
    <dl class="game-end-scores">${scores}</dl>
    <p class="game-end-reason">Result: ${escapeHtml(victory?.reason?.replaceAll('_', ' ') ?? 'completed')} · final revision ${snapshot.view.stateRevision}</p>
    <div class="game-end-actions"><button id="download-final-save">Download final save</button><button id="download-replay">Download replay</button><button id="close-game-end">View final map</button><button class="primary" id="new-game-after-end">New Game</button></div>
  </section></div>`;
};

const render = (snapshot: UiSnapshot): void => {
  const focused = document.activeElement as HTMLElement | null;
  const focusId = focused?.id;
  const focusHex = focused?.dataset.hex;
  const focusPiece = focused?.dataset.piece;
  root.querySelectorAll<HTMLElement>('[data-scroll-key]').forEach(element => listPositions.set(element.dataset.scrollKey!, element.scrollTop));
  if (snapshot.view.privacyLocked) {
    utilityOpen = null; deck.search = ''; deck.tab = undefined; deck.lastPiece = null; rosterOpen = false; rosterWasOpen = false; lastMoveHex = null; listPositions.clear();
    root.innerHTML = privacyHtml(snapshot);
    bindEvents(snapshot);
    root.querySelector<HTMLButtonElement>('#complete-handoff')?.focus();
    return;
  }
  syncDeckTab(snapshot, deck);
  const projection = snapshot.view.projection;
  const sequence = projection?.sequence;
  const activeBinding = snapshot.bindings.find(({ seatId }) => seatId === snapshot.view.metadata.activeSeatId);
  const otherBinding = snapshot.bindings.find(({ seatId }) => seatId !== snapshot.view.metadata.activeSeatId);
  const lifecycle = snapshot.view.metadata.lifecycle;
  const checkpoints = snapshot.checkpoints.map((checkpoint) => `
    <button class="checkpoint" data-checkpoint="${escapeHtml(checkpoint.id)}">${escapeHtml(checkpoint.label || checkpoint.id)} · R${checkpoint.revision}</button>`).join('');
  const hover = hoverHexId ? theater.cells.find(({ id }) => id === hoverHexId) : undefined;
  root.innerHTML = `
    <div class="app-shell">
      <header class="topbar">
        <div class="turn-strip" aria-label="Current turn state">
          <span class="turn-cell"><small>TURN ${sequence?.gameTurn ?? '–'} / ${currentGame.summary.turnLimit}</small><strong>${escapeHtml(weatherLabel(snapshot))}</strong></span>
          <div class="phase-picker" tabindex="0" aria-label="${escapeHtml(`${playerName(sequence?.phasingPlayerId)} Player Turn`)}">
            <span class="track-owner">${escapeHtml(playerName(sequence?.phasingPlayerId))}</span>
            ${phaseTrackCurrentHtml(snapshot, sequence)}
            <ol class="phase-track phase-popup" aria-label="${escapeHtml(`${playerName(sequence?.phasingPlayerId)} Player Turn phases`)}">
              ${snapshot.phaseTrack.map((step) => phaseTrackItemHtml(step, sequence)).join('')}
            </ol>
          </div>
          ${phaseControlsHtml(snapshot, deck)}
        </div>
        <div class="seat-badge"><span class="status-dot"></span><div><small>AT THE SCREEN</small><strong>${escapeHtml(activeBinding?.label ?? snapshot.view.playerId)}</strong></div></div>
      </header>

      <aside class="command-rail" aria-label="Command deck">${commandDeckHtml(snapshot, deck)}</aside>

      <main class="workspace">
        <section class="map-card" aria-label="${escapeHtml(`${currentGame.summary.mapSize} · ${currentGame.summary.mapStyle.replaceAll('_', ' ').toLowerCase()}`)}">
          <div class="map-viewport" id="map-viewport">
            <svg id="hex-map" viewBox="0 0 ${layout.width} ${layout.height}" role="application" aria-label="Hex map. Click a unit to select it, a highlighted hex to move, a ringed enemy hex to attack.">
              <g id="map-camera" transform="translate(${camera.x} ${camera.y}) scale(${camera.zoom})">${renderMap(snapshot)}</g>
            </svg>
            ${stackPickerHtml(snapshot)}${rosterOpen ? unitRosterHtml(snapshot, deck) : movePopupHtml(snapshot)}
            <div class="map-controls" aria-label="Map zoom controls"><button id="zoom-out" aria-label="Zoom out">−</button><output id="zoom-level">${zoomPercent()}%</output><button id="zoom-in" aria-label="Zoom in">+</button><button id="zoom-reset">Reset</button><button id="toggle-air-zones" aria-pressed="${snapshot.air.showZones}" title="Show the 10-hex Patrol Zones of Air Bases with Active Fighters (14.4c)">Patrol Zones</button></div>
            <div class="map-legend"><span class="terrain-key clear">Clear</span><span class="terrain-key woods">Woods</span><span class="terrain-key rough">Rough</span><span class="terrain-key mountain">Mountain</span><span class="terrain-key marsh">Marsh</span><span class="terrain-key water">Water</span><span class="line-key road">Road</span><span class="line-key river">River</span><span class="legend-mark objective">Objective</span><span class="legend-ring move">Move</span><span class="legend-ring move-stop" title="You must stop here (for example on entering an enemy ZOC)">Move ends here</span><span class="legend-ring attack">Attack</span><span class="legend-ring barrage">Barrage</span>${snapshot.air.showZones ? '<span class="legend-ring air-zone">Your Patrol Zone</span><span class="legend-ring air-zone enemy">Enemy Patrol Zone</span>' : ''}</div>
            <div class="hover-info" aria-live="off">${hover ? escapeHtml(hoverText(snapshot, hover.id)) : 'Hover a hex for terrain.'}</div>
          </div>
        </section>
      </main>
    </div>${newGameDialogHtml()}${privacyHtml(snapshot)}${gameEndHtml(snapshot)}`;
  const sessionContent = `<p><strong>${escapeHtml(activeBinding?.label ?? '')}</strong> · ${escapeHtml(lifecycle)}</p>
    <button class="wide" id="begin-handoff" ${otherBinding && lifecycle !== 'READY' ? '' : 'disabled'}>Hand off to ${escapeHtml(otherBinding?.label ?? 'next seat')}</button>
    <div class="button-grid"><button id="save-game">Download save</button><button id="load-game">Load save</button></div>
    <input id="save-file" type="file" accept="application/json,.json" hidden>
    <label class="setting-toggle"><input type="checkbox" id="skip-dump-only" ${skipDumpOnlySteps ? 'checked' : ''}> Pass the other player's step without a hand-over when blowing a dump (12.11a) is their only option</label>
    <button id="create-checkpoint">Create checkpoint</button><div class="checkpoint-list">${checkpoints || '<p>No checkpoints yet.</p>'}</div>
    <p class="supporting">${currentGame.summary.unitCount} units · ${currentGame.summary.formationCount} formations · ${currentGame.summary.turnLimit} turns</p>
    <p class="supporting">Seeds: map ${currentGame.request.seeds.map}, OOB ${currentGame.request.seeds.oob}, deployment ${currentGame.request.seeds.deployment}, rules ${currentGame.request.seeds.rules}.</p>`;
  root.querySelector('.topbar')?.insertAdjacentHTML('beforeend', `<div class="session-actions"><button id="open-new-game">New Game</button><button id="toggle-pause" ${lifecycle === 'ACTIVE' || lifecycle === 'PAUSED' ? '' : 'disabled'}>${lifecycle === 'PAUSED' ? 'Resume' : 'Pause'}</button><button id="open-session">Session</button></div>`);
  if (utilityOpen) {
    root.insertAdjacentHTML('beforeend', `<div class="modal-backdrop utility-backdrop"><section class="utility-dialog" role="dialog" aria-modal="true" aria-labelledby="utility-title"><header><h2 id="utility-title">Session</h2><button id="close-utility">Close</button></header><div class="utility-content">${sessionContent}</div></section></div>`);
  }
  const form = root.querySelector<HTMLElement>('#new-game-form');
  if (form) {
    form.querySelectorAll<HTMLInputElement>('input').forEach(input => { input.required = true; });
    form.dataset.settingsTab = settingsTab;
    const basic = document.createElement('div'); basic.className = 'settings-basic';
    const advanced = document.createElement('fieldset'); advanced.className = 'settings-advanced'; advanced.innerHTML = '<legend>Reproducible seeds</legend>';
    form.querySelectorAll('fieldset').forEach(fieldset => basic.append(fieldset));
    basic.querySelectorAll<HTMLInputElement>('input[id$="-seed"]').forEach(input => { const label = input.closest('label'); if (label) advanced.append(label); });
    const random = basic.querySelector('#randomize-new-game'); if (random) advanced.append(random);
    form.append(basic, advanced);
    form.insertAdjacentHTML('afterbegin', `<nav class="settings-tabs" aria-label="New Game settings"><button type="button" data-settings="basic" aria-pressed="${settingsTab === 'basic'}">Basic</button><button type="button" data-settings="advanced" aria-pressed="${settingsTab === 'advanced'}">Advanced seeds</button></nav>`);
    const footer = document.createElement('footer'); footer.className = 'new-game-footer';
    const submit = form.querySelector<HTMLElement>('.new-game-submit'); if (submit) footer.append(submit);
    footer.querySelector('button')?.setAttribute('form', 'new-game-form');
    const start = root.querySelector('#start-previewed-game'); if (start) footer.append(start);
    root.querySelector('.new-game-dialog')?.append(footer);
    if (previewStale) { root.querySelector('.operation-preview-content')?.classList.add('is-stale'); if (start) (start as HTMLButtonElement).disabled = true; }
    for (const id of newGameInvalidFields()) root.querySelector(`#${id}`)?.setAttribute('aria-invalid', 'true');
  }
  bindEvents(snapshot);
  root.querySelectorAll<HTMLElement>('[data-scroll-key]').forEach(element => { element.scrollTop = listPositions.get(element.dataset.scrollKey!) ?? 0; });
  // Only true modals inert the app shell; the non-modal stack picker lives inside it.
  const dialog = root.querySelector<HTMLElement>('[role="dialog"][aria-modal="true"], .modal-backdrop [role="dialog"]');
  if (dialog) {
    root.querySelector<HTMLElement>('.app-shell')!.inert = true;
    const target = focusId ? document.getElementById(focusId) : null;
    if (target && dialog.contains(target)) target.focus({ preventScroll: true });
    else dialog.querySelector<HTMLElement>('button, input, select')?.focus({ preventScroll: true });
    dialog.onkeydown = event => {
      if (event.key !== 'Tab') return;
      const items = [...dialog.querySelectorAll<HTMLElement>('button:not(:disabled), input:not(:disabled), select:not(:disabled), [tabindex="0"]')].filter(e => e.getClientRects().length);
      const index = items.indexOf(document.activeElement as HTMLElement);
      if (event.shiftKey && index <= 0) { event.preventDefault(); items.at(-1)?.focus(); }
      else if (!event.shiftKey && index === items.length - 1) { event.preventDefault(); items[0]?.focus(); }
    };
  } else if (focusId) document.getElementById(focusId)?.focus({ preventScroll: true });
  else if (focusPiece || focusHex) {
    const match = [...root.querySelectorAll<HTMLElement>('[data-hex], [data-piece]')].find(e => focusPiece ? e.dataset.piece === focusPiece : e.dataset.hex === focusHex);
    match?.focus({ preventScroll: true });
  }
  // The move popup takes focus when it opens (Enter confirms) and returns it to the hex when it closes.
  const moveHex = root.querySelector<HTMLElement>('.move-popup')?.dataset.anchorHex ?? null;
  if (moveHex && moveHex !== lastMoveHex) (root.querySelector<HTMLElement>('#confirm-move:not(:disabled)') ?? root.querySelector<HTMLElement>('#cancel-move'))?.focus({ preventScroll: true });
  else if (!moveHex && lastMoveHex && document.activeElement === document.body && !dialog) {
    root.querySelector<HTMLElement>(`#hex-map .hex-cell[data-hex="${CSS.escape(lastMoveHex)}"]`)?.focus({ preventScroll: true });
  }
  lastMoveHex = moveHex;
  // The roster takes focus into its search box when it opens and gives it back to its button when it closes.
  const rosterShown = root.querySelector('.roster-popup') !== null;
  if (rosterShown && !rosterWasOpen) root.querySelector<HTMLElement>('#roster-search')?.focus({ preventScroll: true });
  else if (!rosterShown && rosterWasOpen && document.activeElement === document.body) root.querySelector<HTMLElement>('#open-roster')?.focus({ preventScroll: true });
  rosterWasOpen = rosterShown;
  updateCamera();
};

const updateCamera = (): void => {
  positionStackPicker();
  positionMovePopup();
  const svg = root.querySelector<SVGSVGElement>('#hex-map');
  const cameraGroup = root.querySelector<SVGGElement>('#map-camera');
  const matrix = svg?.getScreenCTM();
  if (cameraGroup && matrix) cameraGroup.dataset.counterLod = counterLod(70 * Math.hypot(matrix.a, matrix.b) * camera.zoom);
  cameraGroup?.setAttribute('transform', `translate(${camera.x} ${camera.y}) scale(${camera.zoom})`);
  const output = root.querySelector<HTMLOutputElement>('#zoom-level');
  if (output) output.value = `${zoomPercent()}%`;
};

/** Default zoom, centred on the map (the camera group scales about the viewBox origin). */
const resetCamera = (): void => {
  camera.zoom = DEFAULT_ZOOM;
  camera.x = (layout.width / 2) * (1 - DEFAULT_ZOOM);
  camera.y = (layout.height / 2) * (1 - DEFAULT_ZOOM);
};

resetCamera();

/** Zoom keeping the map point under (anchorX, anchorY), in viewBox units, fixed on screen. */
const zoomAt = (factor: number, anchorX = layout.width / 2, anchorY = layout.height / 2): void => {
  const next = Math.max(0.6 * DEFAULT_ZOOM, Math.min(2.6 * DEFAULT_ZOOM, camera.zoom * factor));
  const ratio = next / camera.zoom;
  camera.x = anchorX - (anchorX - camera.x) * ratio;
  camera.y = anchorY - (anchorY - camera.y) * ratio;
  camera.zoom = next;
  updateCamera();
};

const downloadJson = (content: string, filename: string): void => {
  const blob = new Blob([content], { type: 'application/json' });
  const anchor = document.createElement('a');
  anchor.href = URL.createObjectURL(blob);
  anchor.download = filename;
  anchor.click();
  URL.revokeObjectURL(anchor.href);
};

const openNewGame = (snapshot: UiSnapshot): void => {
  utilityOpen = null;
  previewStale = false;
  settingsTab = 'basic';
  newGameOpen = true;
  newGamePreview = null;
  newGameError = '';
  newGameErrors = [];
  history.replaceState(null, '', '#new-game');
  render(snapshot);
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
  layout = theater.layout;
  resetCamera();
  newGameSettings = created.request;
  newGamePreview = null;
  newGameOpen = false;
  newGameBusy = false;
  newGameError = '';
  history.replaceState(null, '', location.pathname);
  controller = createUiController({ engine, session: created.session, scenario, bindings, skipDumpOnlySteps });
  unsubscribeController = controller.subscribe(render);
};

/**
 * Clicking a counter on a hex that is itself a target acts on the hex. Otherwise it selects the
 * unit, and a stack of several units opens the stack picker so any unit in it can be chosen.
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

const stackPickerHtml = (snapshot: UiSnapshot): string => {
  if (!stackPickerHex) return '';
  const stack = onMapStacks(snapshot).get(stackPickerHex);
  if (!stack || stack.pieces.length + stack.hiddenCount < 2) return '';
  const rows = [...stackOrder(stack.pieces)].reverse().map((piece) => {
    const definition = scenario.pieceCatalog.definitions.find(({ id }) => id === piece.definitionId)!;
    const own = piece.ownerId === snapshot.view.playerId;
    return `<button class="stack-pick${snapshot.selection.pieceId === piece.id ? ' is-selected' : ''}" data-pick-piece="${escapeHtml(piece.id)}" ${own ? '' : 'disabled'}>
      <span class="stack-pick-art" aria-hidden="true">${counterSvg(counterView(definition, piece))}</span><span>${escapeHtml(`${own ? '' : 'Enemy · '}${pieceLabel(scenario, piece)}${piece.role === 'DUMP' ? ` · ${piece.resourceQuantity ?? 0}T` : ''}${typeof piece.carriedTokens === 'number' ? ` · carries ${piece.carriedTokens}T` : ''}`)}</span></button>`;
  }).join('');
  return `<div class="stack-picker" role="group" aria-label="Units in hex ${escapeHtml(printedHexLabel(stackPickerHex))}" data-anchor-hex="${escapeHtml(stackPickerHex)}">
    <header><strong>Hex ${escapeHtml(printedHexLabel(stackPickerHex))} · ${stack.pieces.length + stack.hiddenCount} units</strong><button id="close-stack-picker" aria-label="Close stack list">×</button></header>
    ${rows}${stack.hiddenCount > 0 ? `<p>${stack.hiddenCount} enemy unit${stack.hiddenCount === 1 ? '' : 's'} hidden under the top counter.</p>` : ''}
  </div>`;
};

/** Place the stack picker beside its hex, inside the map viewport. */
const positionStackPicker = (): void => {
  const picker = root.querySelector<HTMLElement>('.stack-picker');
  const viewport = root.querySelector<HTMLElement>('#map-viewport');
  if (!picker || !viewport) return;
  const cell = root.querySelector<SVGGElement>(`#hex-map .hex-cell[data-hex="${CSS.escape(picker.dataset.anchorHex ?? '')}"]`);
  if (!cell) return;
  const box = cell.getBoundingClientRect();
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
  const cellOf = (hexId: string | undefined) => hexId ? root.querySelector<SVGGElement>(`#hex-map .hex-cell[data-hex="${CSS.escape(hexId)}"]`) : null;
  const target = cellOf(popup.dataset.anchorHex)?.getBoundingClientRect();
  if (!target) return;
  const frame = viewport.getBoundingClientRect();
  const from = cellOf(popup.dataset.fromHex)?.getBoundingClientRect();
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

function bindEvents(snapshot: UiSnapshot): void {
  const $ = <T extends Element>(selector: string) => root.querySelector<T>(selector);
  $('#open-new-game')?.addEventListener('click', () => openNewGame(snapshot));
  $('#new-game-after-end')?.addEventListener('click', () => openNewGame(snapshot));
  $('#close-game-end')?.addEventListener('click', () => { gameEndDismissed = true; render(controller.getSnapshot()); });
  $('#close-new-game')?.addEventListener('click', () => {
    newGameOpen = false;
    history.replaceState(null, '', location.pathname);
    render(controller.getSnapshot());
  });
  $('#toggle-pause')?.addEventListener('click', controller.togglePause);
  $('#begin-handoff')?.addEventListener('click', () => { utilityOpen = null; controller.beginHandoff(); });
  $('#begin-required-handoff')?.addEventListener('click', controller.beginHandoff);
  $('#complete-handoff')?.addEventListener('click', controller.completeHandoff);
  $('#create-checkpoint')?.addEventListener('click', controller.createCheckpoint);
  $<HTMLInputElement>('#skip-dump-only')?.addEventListener('change', (event) => {
    skipDumpOnlySteps = (event.target as HTMLInputElement).checked;
    controller.setSkipDumpOnlySteps(skipDumpOnlySteps);
  });
  $('#open-session')?.addEventListener('click', () => { utilityOpen = 'session'; render(snapshot); });
  $('#close-utility')?.addEventListener('click', () => { utilityOpen = null; render(snapshot); });
  $('#end-phase')?.addEventListener('click', () => {
    // Finishing Movement with units that have not moved asks for a second press (no undo after dice).
    if (unmovedUnits(snapshot) > 0 && !deck.confirmEnd) { deck.confirmEnd = true; render(controller.getSnapshot()); return; }
    deck.confirmEnd = false;
    stackPickerHex = null;
    void runUi(controller.endStep);
  });
  $('#deselect')?.addEventListener('click', controller.clearSelection);
  $('#undo-step')?.addEventListener('click', () => void runUi(controller.undoStep));
  $('#auto-pay')?.addEventListener('click', () => void runUi(controller.autoPay));
  $('#dismiss-result')?.addEventListener('click', controller.dismissResult);
  $('#dismiss-away')?.addEventListener('click', controller.dismissAwayReport);
  $('#close-stack-picker')?.addEventListener('click', () => { stackPickerHex = null; render(controller.getSnapshot()); });
  root.querySelectorAll<HTMLButtonElement>('[data-pick-piece]').forEach((button) => button.addEventListener('click', () => controller.selectPiece(button.dataset.pickPiece!)));
  root.querySelectorAll<HTMLButtonElement>('[data-unit-filter]').forEach((button) => button.addEventListener('click', () => { deck.filter = button.dataset.unitFilter as UnitFilter; render(controller.getSnapshot()); }));
  root.querySelectorAll<HTMLButtonElement>('[data-target-hex]').forEach((button) => button.addEventListener('click', () => void runUi(() => controller.clickHex(button.dataset.targetHex!))));
  $('#confirm-move')?.addEventListener('click', () => void runUi(controller.confirmMove));
  $('#cancel-move')?.addEventListener('click', () => controller.selectPiece(snapshot.selection.pieceId));
  $('#declare-draft')?.addEventListener('click', () => void runUi(controller.declareDraft));
  $('#cancel-draft')?.addEventListener('click', controller.cancelDraft);
  $('#release-reserve')?.addEventListener('click', () => void runUi(controller.releaseReserve));
  $('#open-roster')?.addEventListener('click', () => { rosterOpen = !rosterOpen; stackPickerHex = null; render(controller.getSnapshot()); });
  $('#close-roster')?.addEventListener('click', () => { rosterOpen = false; render(controller.getSnapshot()); });
  $('.roster-popup')?.addEventListener('click', (event) => {
    const pick = (event.target as Element).closest<HTMLElement>('[data-roster-pick]');
    if (pick) { rosterOpen = false; controller.selectPiece(pick.dataset.rosterPick ?? null); }
  });
  const rosterSearch = $<HTMLInputElement>('#roster-search');
  // Typing refreshes only the list body; a full render would repaint the map and every counter per keystroke.
  rosterSearch?.addEventListener('input', () => {
    deck.search = rosterSearch.value;
    const body = $('#roster-body'); if (body) body.innerHTML = unitRosterBodyHtml(controller.getSnapshot(), deck);
  });
  if (rosterSearch && document.activeElement === rosterSearch) rosterSearch.setSelectionRange(rosterSearch.value.length, rosterSearch.value.length);
  root.querySelectorAll<HTMLElement>('[data-deck-tab]').forEach(button => button.addEventListener('click', () => {
    const current = controller.getSnapshot();
    selectDeckTab(current, deck, button.dataset.deckTab!);
    render(current);
  }));
  root.querySelectorAll<HTMLButtonElement>('[data-mode]').forEach(button => button.addEventListener('click', () => void runUi(() => controller.changeMode(button.dataset.mode as never))));
  root.querySelectorAll<HTMLButtonElement>('[data-feed]').forEach(button => button.addEventListener('click', () => void runUi(() => controller.feedSupply(button.dataset.feed!, button.dataset.dump!))));
  root.querySelectorAll<HTMLButtonElement>('[data-unit-action]').forEach(button => button.addEventListener('click', () => void runUi(() => controller.runAction(button.dataset.unitAction!))));
  // The truck's supply area: the Token count is read from the row's own field when the button is pressed.
  root.querySelectorAll<HTMLButtonElement>('[data-transfer]').forEach(button => button.addEventListener('click', () => {
    const field = button.closest('.transfer-row')?.querySelector<HTMLInputElement>('.transfer-tokens');
    const tokens = Number(field?.value);
    const min = Number(field?.min), max = Number(field?.max);
    if (!field || !Number.isSafeInteger(tokens) || tokens < min || tokens > max) { field?.focus(); field?.reportValidity(); return; }
    void runUi(() => controller.transferSupply(button.dataset.transfer as 'LOAD' | 'UNLOAD', button.dataset.dump ?? null, tokens));
  }));
  root.querySelectorAll<HTMLButtonElement>('[data-divide]').forEach(button => button.addEventListener('click', () => {
    const field = button.closest('.transfer-row')?.querySelector<HTMLInputElement>('.divide-points');
    const points = Number(field?.value);
    if (!field || !Number.isSafeInteger(points) || points < Number(field.min) || points > Number(field.max)) { field?.focus(); field?.reportValidity(); return; }
    void runUi(() => controller.divideTruck(points));
  }));
  root.querySelectorAll<HTMLInputElement>('[data-participant]').forEach(input => input.addEventListener('change', () => controller.toggleParticipant(input.dataset.participant!)));
  root.querySelectorAll<HTMLInputElement>('[data-lead]').forEach(input => input.addEventListener('change', () => controller.setLead(input.dataset.lead!)));
  root.querySelectorAll<HTMLButtonElement>('[data-choice]').forEach((button) => button.addEventListener('click', () => void runUi(() => controller.respondToDecision(button.dataset.choice ?? ''))));
  root.querySelectorAll<HTMLButtonElement>('[data-air-mission]').forEach((button) => button.addEventListener('click', () => controller.planAirMission(button.dataset.airMission as never)));
  root.querySelectorAll<HTMLButtonElement>('[data-air-target]').forEach((button) => button.addEventListener('click', () => controller.setAirTarget(button.dataset.airTarget as never)));
  root.querySelectorAll<HTMLInputElement>('[data-air-aircraft]').forEach((input) => input.addEventListener('change', () => controller.toggleAirAircraft(input.dataset.airAircraft!)));
  root.querySelectorAll<HTMLInputElement>('[data-refit-aircraft]').forEach((input) => input.addEventListener('change', () => controller.toggleRefitAircraft(input.dataset.refitBase!, input.dataset.refitAircraft!)));
  root.querySelectorAll<HTMLButtonElement>('[data-refit]').forEach((button) => button.addEventListener('click', () => void runUi(() => controller.refitBase(button.dataset.refit!))));
  $('#declare-air-mission')?.addEventListener('click', () => void runUi(controller.declareAirMission));
  $('#cancel-air-mission')?.addEventListener('click', controller.cancelAirMission);
  $('#toggle-air-zones')?.addEventListener('click', controller.toggleAirZones);
  root.querySelectorAll<HTMLButtonElement>('[data-checkpoint]').forEach((button) => button.addEventListener('click', () => void controller.undoTo(button.dataset.checkpoint ?? '')));
  root.querySelectorAll<HTMLElement>('[data-settings]').forEach(button => button.addEventListener('click', () => {
    settingsTab = button.dataset.settings!;
    const form = root.querySelector<HTMLElement>('#new-game-form'); if (form) form.dataset.settingsTab = settingsTab;
    root.querySelectorAll<HTMLButtonElement>('[data-settings]').forEach(item => item.setAttribute('aria-pressed', String(item.dataset.settings === settingsTab)));
  }));
  $('#zoom-in')?.addEventListener('click', () => zoomAt(1.2));
  $('#zoom-out')?.addEventListener('click', () => zoomAt(1 / 1.2));
  $('#zoom-reset')?.addEventListener('click', () => { resetCamera(); updateCamera(); });

  // Deck unit rows select the unit and centre the map selection on its hex.
  root.querySelectorAll<HTMLElement>('.deck-unit[data-piece]').forEach((element) => element.addEventListener('click', () => controller.selectPiece(element.dataset.piece ?? null)));
  root.querySelectorAll<HTMLElement>('#hex-map .hex-cell[data-hex]').forEach((element) => {
    element.addEventListener('click', (event) => {
      event.stopPropagation();
      if (mapDragged) { mapDragged = false; return; }
      stackPickerHex = null;
      void runUi(() => controller.clickHex(element.dataset.hex!));
    });
    element.addEventListener('pointerenter', () => {
      hoverHexId = element.dataset.hex ?? null;
      const info = root.querySelector<HTMLElement>('.hover-info');
      if (info && hoverHexId) info.textContent = hoverText(snapshot, hoverHexId);
    });
    element.addEventListener('keydown', (event) => {
      if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); void runUi(() => controller.clickHex(element.dataset.hex!)); }
    });
  });
  root.querySelectorAll<HTMLElement>('#hex-map .counter[data-piece]').forEach((element) => element.addEventListener('click', (event) => {
    event.stopPropagation();
    if (mapDragged) { mapDragged = false; return; }
    void runUi(() => clickCounter(snapshot, element.dataset.piece!, element.dataset.hex!));
  }));

  $('#save-game')?.addEventListener('click', () => downloadJson(controller.serializeSave(), `ocs-${snapshot.view.metadata.id}.json`));
  $('#download-final-save')?.addEventListener('click', () => downloadJson(controller.serializeSave(), `ocs-final-${snapshot.view.metadata.id}.json`));
  $('#download-replay')?.addEventListener('click', () => downloadJson(controller.serializeReplay(), `ocs-replay-${snapshot.view.metadata.id}.json`));
  $('#load-game')?.addEventListener('click', () => $('#save-file')?.dispatchEvent(new MouseEvent('click')));
  $('#save-file')?.addEventListener('change', (event) => {
    const file = (event.currentTarget as HTMLInputElement).files?.[0];
    if (file) void file.text().then((text) => controller.loadSave(text));
  });

  $('#new-game-form')?.addEventListener('submit', (event) => {
    event.preventDefault();
    void buildPreview();
  });
  $('#new-game-form')?.addEventListener('input', (event) => {
    previewStale = true;
    const input = event.target as HTMLInputElement;
    const value = Number(input.value);
    const id = input.id;
    root.querySelector('.field-error')?.remove(); input.removeAttribute('aria-invalid');
    newGameSettings = { ...newGameSettings, map: { ...newGameSettings.map }, oob: { ...newGameSettings.oob }, seeds: { ...newGameSettings.seeds } };
    if (id === 'new-game-width') newGameSettings = { ...newGameSettings, map: { ...newGameSettings.map, width: value } };
    if (id === 'new-game-height') newGameSettings = { ...newGameSettings, map: { ...newGameSettings.map, height: value } };
    if (id === 'new-game-style') newGameSettings = { ...newGameSettings, map: { ...newGameSettings.map, style: input.value as MapGenerationStyle } };
    if (id === 'new-game-scale') newGameSettings = { ...newGameSettings, oob: { ...newGameSettings.oob, scale: input.value as OobScale } };
    if (id === 'new-game-formations') newGameSettings = { ...newGameSettings, oob: { ...newGameSettings.oob, formationsPerSide: value } };
    if (id === 'new-game-air') {
      const { air: _air, ...ground } = newGameSettings.oob;
      newGameSettings = { ...newGameSettings, oob: input.value === 'STANDARD' ? { ...ground, air: 'STANDARD' as AirForceLevel } : ground };
    }
    if (id === 'new-game-air') newGameSettings = { ...newGameSettings, oob: { ...newGameSettings.oob, air: input.value as AirForceLevel } };
    if (id === 'new-game-turn-limit') newGameSettings = { ...newGameSettings, turnLimit: value };
    if (id === 'new-game-start-month') newGameSettings = { ...newGameSettings, startMonth: value };
    for (const key of ['map', 'oob', 'deployment', 'rules'] as const) if (id === `new-game-${key}-seed`) newGameSettings = { ...newGameSettings, seeds: { ...newGameSettings.seeds, [key]: value } };
    const start = root.querySelector<HTMLButtonElement>('#start-previewed-game');
    if (start) {
      start.disabled = true;
      start.textContent = 'Updating preview…';
    }
    root.querySelector('.operation-preview-content')?.classList.add('is-stale');
    root.querySelectorAll('.flow-steps span').forEach((step, index) => { if (index > 0) step.className = ''; });
    const status = root.querySelector<HTMLElement>('.new-game-submit strong');
    if (status) status.textContent = 'Updating preview…';
    schedulePreview();
  });
  $('#new-game-form')?.addEventListener('invalid', event => {
    const input = event.target as HTMLInputElement;
    const form = root.querySelector<HTMLElement>('#new-game-form')!;
    settingsTab = input.id.endsWith('-seed') ? 'advanced' : 'basic'; form.dataset.settingsTab = settingsTab;
    root.querySelectorAll<HTMLElement>('[data-settings]').forEach(button => button.setAttribute('aria-pressed', String(button.dataset.settings === settingsTab)));
    root.querySelector('.field-error')?.remove();
    input.setAttribute('aria-invalid', 'true'); input.setAttribute('aria-describedby', 'field-error');
    input.closest('label')?.insertAdjacentHTML('beforeend', `<span id="field-error" class="field-error" role="alert">${escapeHtml(input.validationMessage)}</span>`);
  }, true);
  $('#start-previewed-game')?.addEventListener('click', () => {
    if (newGameBusy || !newGamePreview || previewStale) return;
    newGameBusy = true;
    newGameError = '';
    const request = newGamePreview.request;
    render(snapshot);
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
  });
  $('#randomize-new-game')?.addEventListener('click', () => {
    const values = new Uint32Array(4);
    crypto.getRandomValues(values);
    newGameSettings = {
      ...newGameSettings,
      seeds: { map: values[0]!, oob: values[1]!, deployment: values[2]!, rules: values[3]! },
    };
    previewStale = true;
    render(snapshot);
    schedulePreview(0);
  });

  const map = $<SVGSVGElement>('#hex-map');
  map?.addEventListener('keydown', (event: KeyboardEvent) => {
    if (!['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown'].includes(event.key)) return;
    const current = (event.target as HTMLElement).closest<HTMLElement>('.hex-cell');
    if (!current) return;
    event.preventDefault();
    const [q, r] = (current.dataset.hex ?? '0,0').split(',').map(Number);
    // Offset-rectangle navigation: left/right along the row, up/down keep the visual column.
    const nextR = r! + (event.key === 'ArrowDown' ? 1 : event.key === 'ArrowUp' ? -1 : 0);
    const column = q! + Math.floor(r! / 2) + (event.key === 'ArrowRight' ? 1 : event.key === 'ArrowLeft' ? -1 : 0);
    const nextQ = column - Math.floor(nextR / 2);
    const next = [...root.querySelectorAll<HTMLElement>('.hex-cell')].find(e => e.dataset.hex === `${nextQ},${nextR}`);
    if (next) { current.setAttribute('tabindex', '-1'); next.setAttribute('tabindex', '0'); next.focus({ preventScroll: true }); }
  });
  map?.addEventListener('wheel', (event: WheelEvent) => {
    event.preventDefault();
    const bounds = map.getBoundingClientRect();
    const scale = layout.width / Math.max(1, bounds.width);
    zoomAt(event.deltaY < 0 ? 1.12 : 1 / 1.12, (event.clientX - bounds.left) * scale, (event.clientY - bounds.top) * scale);
  }, { passive: false });
  map?.addEventListener('pointerdown', (event: PointerEvent) => {
    mapDragged = false;
    dragging = { x: event.clientX, y: event.clientY, cameraX: camera.x, cameraY: camera.y };
  });
  map?.addEventListener('pointermove', (event: PointerEvent) => {
    if (!dragging) return;
    if (Math.hypot(event.clientX - dragging.x, event.clientY - dragging.y) < 6) return;
    mapDragged = true; map.setPointerCapture(event.pointerId);
    const scale = layout.width / Math.max(1, map.getBoundingClientRect().width);
    camera.x = dragging.cameraX + (event.clientX - dragging.x) * scale;
    camera.y = dragging.cameraY + (event.clientY - dragging.y) * scale;
    updateCamera();
  });
  map?.addEventListener('pointerup', () => { dragging = null; });
}

window.addEventListener('keydown', (event) => {
  if (event.key !== 'Escape') return;
  if (rosterOpen) { rosterOpen = false; render(controller.getSnapshot()); return; }
  if (controller.getSnapshot().movePreview) { controller.selectPiece(controller.getSnapshot().selection.pieceId); return; }
  if (stackPickerHex) { stackPickerHex = null; render(controller.getSnapshot()); return; }
  if (utilityOpen) { utilityOpen = null; render(controller.getSnapshot()); return; }
  if (newGameOpen && !newGameBusy) { newGameOpen = false; history.replaceState(null, '', location.pathname); render(controller.getSnapshot()); return; }
  const snapshot = controller.getSnapshot();
  if (snapshot.draft) controller.cancelDraft();
  else controller.clearSelection();
});

performance.mark('ocs:boot:render');
unsubscribeController = controller.subscribe(render);
performance.mark('ocs:boot:ready');
window.addEventListener('resize', updateCamera);
