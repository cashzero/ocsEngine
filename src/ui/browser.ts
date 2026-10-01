import {
  DEFAULT_NEW_GAME_REQUEST,
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
  coastlineHtml, mapArtDefsHtml, objectiveArtHtml, riversHtml, roadsHtml, settlementArtHtml, strategicBandPoints, terrainGlyphsHtml,
} from './map-art.js';
import { commandDeckHtml, type DeckState, type DeckList } from './command-deck.js';
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
const initialGame = await newGameOrchestrator.create(DEFAULT_NEW_GAME_REQUEST);
if (!initialGame.ok) {
  const message = initialGame.error.map(({ stage, message }) => `${stage}: ${message}`).join(' ');
  root.innerHTML = `<main class="boot-message"><h1>New Game bootstrap failed</h1><p>${escapeHtml(message)}</p></main>`;
  throw new Error(message);
}
let currentGame: CreatedNewGame = initialGame.value;
let scenario = currentGame.scenario;
let bindings = currentGame.bindings;
let controller: UiController = createUiController({ engine, session: currentGame.session, scenario, bindings });
let theater = buildGeneratedMapPreview(currentGame.generatedMap, 50);
let layout = theater.layout;
let unsubscribeController: (() => void) | null = null;

const camera = { zoom: 1, x: 0, y: 0 };
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
const deck: DeckState = { list: 'units', search: '', working: false };
let utilityOpen: 'session' | null = null;
let gameEndDismissed = false;
const listPositions = new Map<string, number>();
let settingsTab = 'basic';
let previewStale = false;
let mapDragged = false;
let hoverHexId: string | null = null;
const afterPaint = (): Promise<void> => new Promise(resolve => requestAnimationFrame(() => setTimeout(resolve, 0)));
const runUi = async (operation: () => void | Promise<void>): Promise<void> => {
  if (deck.working) return;
  deck.error = '';
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

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

/** Date and ground condition of the Game Turn (17.0). */
const weatherLabel = (snapshot: UiSnapshot): string => {
  const weather = snapshot.view.projection?.weather;
  if (!weather) return '–';
  const ground = { DRY: 'Dry', MUD: 'Mud', SNOW: 'Snow' }[weather.groundCondition];
  return weather.month ? `${weather.day} ${MONTHS[weather.month - 1]} · ${ground}` : ground;
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
  const terrain = theater.cells.map((cell) => {
    const classes = [
      'hex-cell', `terrain-${cell.terrain.toLowerCase()}`,
      snapshot.selection.hexId === cell.id ? 'is-selected' : '',
      snapshot.reachable.has(cell.id) ? 'is-reachable' : '',
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
      <text class="hex-coordinate" x="${cell.x}" y="${cell.y + 40}" text-anchor="middle">${escapeHtml(printedHexLabel(cell.id))}</text>
    </g>`;
  }).join('');
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
    const pieces = stack?.pieces ?? [];
    // Draw the bottom of the stack first; at most three counters are shown, the rest are counted.
    const visible = pieces.slice(-3);
    const selectedPiece = pieces.find(({ id }) => id === snapshot.selection.pieceId);
    if (selectedPiece && !visible.includes(selectedPiece)) visible.push(selectedPiece);
    const html = visible.map((piece, index) => {
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
    const hiddenCount = (stack?.hiddenCount ?? 0) + Math.max(0, pieces.length - visible.length);
    if (hiddenCount > 0) stackBadges.push(`<g class="hidden-count" transform="translate(${cell.x + 26} ${cell.y - 34})"><circle r="12"></circle><text y="5" text-anchor="middle">+${hiddenCount}</text></g>`);
    return html;
  }).join('');
  // SVG paints in document order: every hex below every counter, the selected counter on top.
  return `${mapArtDefsHtml()}<g class="hex-map-layer${moving ? ' is-moving' : ''}"><g class="terrain-layer">${terrain}</g><g class="river-layer">${rivers}</g><g class="road-layer">${roads}</g><g class="feature-layer">${features}</g><polyline class="movement-path" points="${pathPoints}" />${pathEnd}</g><g class="counter-layer"><g class="unselected-counter-layer">${counters}</g><g class="selected-counter-layer">${selectedCounters.join('')}</g><g class="stack-badge-layer">${stackBadges.join('')}</g></g>`;
};

const privacyHtml = (snapshot: UiSnapshot): string => snapshot.view.privacyLocked ? `
  <div class="privacy-screen" role="dialog" aria-modal="true" aria-labelledby="handoff-title">
    <div><p class="eyebrow">HOT-SEAT PRIVACY</p><h2 id="handoff-title">Pass the screen</h2>
    <p>The map is hidden until the next player confirms.</p>
    <button class="primary" id="complete-handoff">I am the next player</button></div>
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
  const cells = map.cells.map((cell) => `<g class="generated-cell terrain-${cell.terrain.toLowerCase()}">
    <polygon points="${cell.points}"></polygon>${terrainGlyphsHtml(cell, hexSize)}</g>`).join('');
  const features = map.cells.map((cell) => [
    cell.strategic ? `<polygon class="preview-entry side-${cell.strategic.toLowerCase()}" points="${strategicBandPoints(cell, hexSize)}"></polygon>` : '',
    cell.settlement ? `<g class="settlement-marker">${settlementArtHtml(cell, hexSize)}</g>` : '',
    objectives.has(cell.id) ? `<g class="preview-objective">${objectiveArtHtml(cell, hexSize)}</g>` : '',
  ].join('')).join('');
  const rivers = coastlineHtml(map.cells, hexSize) + riversHtml(map.edges, hexSize, 'generated-edge');
  const roads = roadsHtml(map.edges, map.cells, hexSize, 'generated-edge');
  const forces = oob.sides.map((side) => `<section class="preview-force side-${side.side.toLowerCase()}">
    <header><strong>${escapeHtml(side.side)}</strong><span>${prepared.generatedOob.metrics.pointsBySide[side.side]} points</span></header>
    <ul>${side.formations.map((formation) => `<li><span>${escapeHtml(formation.name)}</span><small>${formation.units.length} units · ${escapeHtml(formation.archetype.replaceAll('_', ' ').toLowerCase())}</small></li>`).join('')}</ul>
    ${side.formations.map((formation) => `<details class="counter-formation"><summary>${escapeHtml(formation.name)}</summary><div class="counter-grid">${formation.units.map(previewCounter).join('')}</div></details>`).join('')}
    <details class="counter-formation"><summary>${side.independentUnits.filter(({ role }) => role !== 'AIRCRAFT' && role !== 'AIR_BASE').length} independent support / logistics units</summary><div class="counter-grid">${side.independentUnits.filter(({ role }) => role !== 'AIRCRAFT' && role !== 'AIR_BASE').map(previewCounter).join('')}</div></details>
    ${side.independentUnits.some(({ role }) => role === 'AIRCRAFT') ? `<details class="counter-formation"><summary>Air forces: ${side.independentUnits.filter(({ role }) => role === 'AIRCRAFT').length} aircraft, ${side.independentUnits.filter(({ role }) => role === 'AIR_BASE').length} Air Base(s)</summary><div class="counter-grid">${side.independentUnits.filter(({ role }) => role === 'AIRCRAFT' || role === 'AIR_BASE').map(previewCounter).join('')}</div></details>` : ''}
  </section>`).join('');
  return `<div class="operation-preview-content">
    <div class="operation-map-wrap"><svg class="operation-map" viewBox="0 0 ${map.layout.width} ${map.layout.height}" role="img" aria-label="Generated operation map preview">${mapArtDefsHtml()}${cells}${rivers}${roads}${features}</svg></div>
    <dl class="operation-metrics"><div><dt>Map</dt><dd>${escapeHtml(prepared.summary.mapSize)}</dd></div><div><dt>Units</dt><dd>${prepared.summary.unitCount}</dd></div><div><dt>Formations</dt><dd>${prepared.summary.formationCount}</dd></div><div><dt>Deployed hexes</dt><dd>${prepared.deployment.metrics.occupiedHexes}</dd></div><div><dt>Objectives</dt><dd>${prepared.summary.objectiveCount}</dd></div><div><dt>Warnings</dt><dd>${prepared.warnings.length}</dd></div></dl>
    <div class="preview-forces">${forces}</div>
    ${prepared.warnings.length > 0 ? `<details class="preview-warnings"><summary>${prepared.warnings.length} generation warning(s)</summary><ul>${prepared.warnings.map((warning) => `<li>${escapeHtml(warning)}</li>`).join('')}</ul></details>` : ''}
    <button id="start-previewed-game" class="primary wide" ${newGameBusy ? 'disabled' : ''}>${newGameBusy ? 'Starting operation…' : 'Start this operation'}</button>
  </div>`;
};

const newGameDialogHtml = (): string => {
  if (!newGameOpen) return '';
  const configuredClass = newGamePreview && !previewStale || preparingPreview ? 'is-complete' : 'is-active';
  const generatedClass = newGamePreview && !previewStale ? 'is-complete' : '';
  const gameplayClass = newGameBusy && !preparingPreview ? 'is-active' : '';
  return `<div class="modal-backdrop new-game-backdrop"><section class="new-game-dialog" role="dialog" aria-modal="true" aria-labelledby="new-game-title">
    <header class="generator-header"><div><p class="eyebrow">NEW OPERATION</p><h2 id="new-game-title">Build, inspect, then deploy</h2><p>Map, OOB and deployment are generated as one deterministic package. The preview below is the operation Gameplay will mount.</p></div><button id="close-new-game" ${newGameBusy ? 'disabled' : ''}>Close</button></header>
    <div class="flow-steps" aria-label="New Game generation sequence"><span class="${configuredClass}" ${configuredClass === 'is-active' ? 'aria-current="step"' : ''}>1 Configure</span><span class="${generatedClass}">2 Map</span><span class="${generatedClass}">3 OOB</span><span class="${generatedClass}">4 Deployment</span><span class="${gameplayClass}" ${gameplayClass === 'is-active' ? 'aria-current="step"' : ''}>5 Gameplay</span></div>
    <div class="new-game-body"><form id="new-game-form" class="new-game-form">
      <div class="new-game-submit">
        <div><strong>${preparingPreview ? 'Generating map, forces and deployment…' : previewStale && newGamePreview ? 'Preview out of date' : newGamePreview ? 'Preview ready' : 'Configure operation'}</strong><p>${previewStale && newGamePreview ? 'Build a fresh preview before starting.' : 'Review your map and forces before starting.'}</p></div>
        <button class="primary" type="submit" ${newGameBusy ? 'disabled' : ''}>${preparingPreview ? 'Building preview…' : 'Build operation preview'}</button>
      </div>
      <fieldset><legend>Operational map</legend>
        <label>Style<select id="new-game-style"><option value="TEMPERATE_INLAND" ${newGameSettings.map.style === 'TEMPERATE_INLAND' ? 'selected' : ''}>Temperate inland</option><option value="MEDITERRANEAN_COAST" ${newGameSettings.map.style === 'MEDITERRANEAN_COAST' ? 'selected' : ''}>Mediterranean coast</option></select></label>
        <label>Width<input id="new-game-width" type="number" min="8" max="64" value="${newGameSettings.map.width}"></label>
        <label>Height<input id="new-game-height" type="number" min="8" max="48" value="${newGameSettings.map.height}"></label>
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
      ${newGameError ? `<p class="generator-error new-game-error" role="alert">${escapeHtml(newGameError)}</p>` : ''}
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
    utilityOpen = null; deck.search = ''; deck.list = 'units'; listPositions.clear();
    root.innerHTML = privacyHtml(snapshot);
    bindEvents(snapshot);
    root.querySelector<HTMLButtonElement>('#complete-handoff')?.focus();
    return;
  }
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
        <div class="theater-title"><p class="eyebrow">GENERATED THEATER</p><strong id="map-title">${escapeHtml(currentGame.summary.mapSize)} · ${escapeHtml(currentGame.summary.mapStyle.replaceAll('_', ' ').toLowerCase())}</strong></div>
        <div class="turn-strip" aria-label="Current turn state">
          <span><small>TURN</small><strong>${sequence?.gameTurn ?? '–'} / ${currentGame.summary.turnLimit}</strong></span>
          <span class="phase-cell"><small>STEP</small><strong>${escapeHtml(sequence ? phaseLabel(sequence.phase, sequence.segment) : lifecycle)}</strong></span>
          <span><small>WEATHER</small><strong>${escapeHtml(weatherLabel(snapshot))}</strong></span>
          <span><small>PHASING</small><strong>${escapeHtml(scenario.players.find(({ id }) => id === sequence?.phasingPlayerId)?.name ?? '–')}</strong></span>
        </div>
        <div class="seat-badge"><span class="status-dot"></span><div><small>AT THE SCREEN</small><strong>${escapeHtml(activeBinding?.label ?? snapshot.view.playerId)}</strong></div></div>
      </header>

      <aside class="command-rail" aria-label="Command deck">${commandDeckHtml(snapshot, deck)}</aside>

      <main class="workspace">
        <section class="map-card" aria-labelledby="map-title">
          <div class="map-viewport" id="map-viewport">
            <svg id="hex-map" viewBox="0 0 ${layout.width} ${layout.height}" role="application" aria-label="Hex map. Click a unit to select it, a highlighted hex to move, a ringed enemy hex to attack.">
              <g id="map-camera" transform="translate(${camera.x} ${camera.y}) scale(${camera.zoom})">${renderMap(snapshot)}</g>
            </svg>
            <div class="map-controls" aria-label="Map zoom controls"><button id="zoom-out" aria-label="Zoom out">−</button><output id="zoom-level">${Math.round(camera.zoom * 100)}%</output><button id="zoom-in" aria-label="Zoom in">+</button><button id="zoom-reset">Reset</button><button id="toggle-air-zones" aria-pressed="${snapshot.air.showZones}" title="Show the 10-hex Patrol Zones of Air Bases with Active Fighters (14.4c)">Patrol Zones</button></div>
            <div class="map-legend"><span class="terrain-key clear">Clear</span><span class="terrain-key woods">Woods</span><span class="terrain-key rough">Rough</span><span class="terrain-key mountain">Mountain</span><span class="terrain-key marsh">Marsh</span><span class="terrain-key water">Water</span><span class="line-key road">Road</span><span class="line-key river">River</span><span class="legend-mark objective">Objective</span><span class="legend-ring move">Move</span><span class="legend-ring attack">Attack</span><span class="legend-ring barrage">Barrage</span>${snapshot.air.showZones ? '<span class="legend-ring air-zone">Your Patrol Zone</span><span class="legend-ring air-zone enemy">Enemy Patrol Zone</span>' : ''}</div>
            <div class="hover-info" aria-live="off">${hover ? `Hex ${escapeHtml(printedHexLabel(hover.id))} · ${escapeHtml(hover.terrain.toLowerCase())}${hover.settlement ? ` · ${hover.settlement.toLowerCase()}` : ''}${currentGame.deployment.objectiveHexIds.includes(hover.id as never) ? ' · objective' : ''}` : 'Hover a hex for terrain.'}</div>
          </div>
        </section>
      </main>
    </div>${newGameDialogHtml()}${privacyHtml(snapshot)}${gameEndHtml(snapshot)}`;
  const sessionContent = `<p><strong>${escapeHtml(activeBinding?.label ?? '')}</strong> · ${escapeHtml(lifecycle)}</p>
    <button class="wide" id="begin-handoff" ${otherBinding && lifecycle !== 'READY' ? '' : 'disabled'}>Hand off to ${escapeHtml(otherBinding?.label ?? 'next seat')}</button>
    <div class="button-grid"><button id="save-game">Download save</button><button id="load-game">Load save</button></div>
    <input id="save-file" type="file" accept="application/json,.json" hidden>
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
  }
  bindEvents(snapshot);
  root.querySelectorAll<HTMLElement>('[data-scroll-key]').forEach(element => { element.scrollTop = listPositions.get(element.dataset.scrollKey!) ?? 0; });
  const dialog = root.querySelector<HTMLElement>('[role="dialog"]');
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
  updateCamera();
};

const updateCamera = (): void => {
  const svg = root.querySelector<SVGSVGElement>('#hex-map');
  const cameraGroup = root.querySelector<SVGGElement>('#map-camera');
  const matrix = svg?.getScreenCTM();
  if (cameraGroup && matrix) cameraGroup.dataset.counterLod = counterLod(70 * Math.hypot(matrix.a, matrix.b) * camera.zoom);
  cameraGroup?.setAttribute('transform', `translate(${camera.x} ${camera.y}) scale(${camera.zoom})`);
  const output = root.querySelector<HTMLOutputElement>('#zoom-level');
  if (output) output.value = `${Math.round(camera.zoom * 100)}%`;
};

/** Zoom keeping the map point under (anchorX, anchorY), in viewBox units, fixed on screen. */
const zoomAt = (factor: number, anchorX = layout.width / 2, anchorY = layout.height / 2): void => {
  const next = Math.max(0.6, Math.min(2.6, camera.zoom * factor));
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
  history.replaceState(null, '', '#new-game');
  render(snapshot);
};

const mountCreatedGame = async (created: CreatedNewGame): Promise<void> => {
  unsubscribeController?.();
  unsubscribeController = null;
  controller.dispose();
  await currentGame.session.close();
  currentGame = created;
  deck.search = ''; deck.list = 'units'; listPositions.clear(); utilityOpen = null; gameEndDismissed = false;
  scenario = created.scenario;
  bindings = created.bindings;
  theater = buildGeneratedMapPreview(created.generatedMap, 50);
  layout = theater.layout;
  camera.zoom = 1; camera.x = 0; camera.y = 0;
  newGameSettings = created.request;
  newGamePreview = null;
  newGameOpen = false;
  newGameBusy = false;
  newGameError = '';
  history.replaceState(null, '', location.pathname);
  controller = createUiController({ engine, session: created.session, scenario, bindings });
  unsubscribeController = controller.subscribe(render);
};

/** Clicking a counter on a hex that is itself a target acts on the hex; otherwise it selects the unit. */
const clickCounter = (snapshot: UiSnapshot, pieceId: string, hexId: string): Promise<void> | void => {
  const targetsHex = snapshot.reachable.has(hexId) || snapshot.attackTargets.includes(hexId) || snapshot.air.targetHexes.includes(hexId)
    || snapshot.barrageTargets.includes(hexId) || snapshot.placementHexes.includes(hexId) || snapshot.decisionHexes.includes(hexId)
    || snapshot.collapseHexes.includes(hexId);
  const piece = snapshot.view.projection?.stacks.flatMap(({ pieces }) => pieces).find(({ id }) => id === pieceId);
  if (targetsHex || !piece || piece.ownerId !== snapshot.view.playerId) return controller.clickHex(hexId);
  controller.selectPiece(pieceId);
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
  $('#open-session')?.addEventListener('click', () => { utilityOpen = 'session'; render(snapshot); });
  $('#close-utility')?.addEventListener('click', () => { utilityOpen = null; render(snapshot); });
  $('#end-phase')?.addEventListener('click', () => void runUi(controller.endStep));
  $('#confirm-move')?.addEventListener('click', () => void runUi(controller.confirmMove));
  $('#cancel-move')?.addEventListener('click', () => controller.selectPiece(snapshot.selection.pieceId));
  $('#declare-draft')?.addEventListener('click', () => void runUi(controller.declareDraft));
  $('#cancel-draft')?.addEventListener('click', controller.cancelDraft);
  $('#release-reserve')?.addEventListener('click', () => void runUi(controller.releaseReserve));
  $('#deck-search')?.addEventListener('input', event => { deck.search = (event.target as HTMLInputElement).value; render(controller.getSnapshot()); });
  root.querySelectorAll<HTMLElement>('[data-deck-list]').forEach(button => button.addEventListener('click', () => { deck.list = button.dataset.deckList as DeckList; render(controller.getSnapshot()); }));
  root.querySelectorAll<HTMLButtonElement>('[data-mode]').forEach(button => button.addEventListener('click', () => void runUi(() => controller.changeMode(button.dataset.mode as never))));
  root.querySelectorAll<HTMLButtonElement>('[data-feed]').forEach(button => button.addEventListener('click', () => void runUi(() => controller.feedSupply(button.dataset.feed!, button.dataset.dump!))));
  root.querySelectorAll<HTMLButtonElement>('[data-unit-action]').forEach(button => button.addEventListener('click', () => void runUi(() => controller.runAction(button.dataset.unitAction!))));
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
  $('#zoom-reset')?.addEventListener('click', () => { camera.zoom = 1; camera.x = 0; camera.y = 0; updateCamera(); });

  // Deck unit rows select the unit and centre the map selection on its hex.
  root.querySelectorAll<HTMLElement>('.deck-unit[data-piece]').forEach((element) => element.addEventListener('click', () => controller.selectPiece(element.dataset.piece ?? null)));
  root.querySelectorAll<HTMLElement>('#hex-map .hex-cell[data-hex]').forEach((element) => {
    element.addEventListener('click', (event) => {
      event.stopPropagation();
      if (mapDragged) { mapDragged = false; return; }
      void runUi(() => controller.clickHex(element.dataset.hex!));
    });
    element.addEventListener('pointerenter', () => {
      hoverHexId = element.dataset.hex ?? null;
      const info = root.querySelector<HTMLElement>('.hover-info');
      const cell = theater.cells.find(({ id }) => id === hoverHexId);
      if (info && cell) info.textContent = `Hex ${printedHexLabel(cell.id)} · ${cell.terrain.toLowerCase()}${cell.settlement ? ` · ${cell.settlement.toLowerCase()}` : ''}${currentGame.deployment.objectiveHexIds.includes(cell.id as never) ? ' · objective' : ''}`;
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

  $('#new-game-form')?.addEventListener('submit', async (event) => {
    event.preventDefault();
    if (newGameBusy) return;
    newGameSettings = {
      templateId: 'GROUND_DUEL',
      map: {
        width: Number(root.querySelector<HTMLInputElement>('#new-game-width')?.value ?? 0),
        height: Number(root.querySelector<HTMLInputElement>('#new-game-height')?.value ?? 0),
        style: root.querySelector<HTMLSelectElement>('#new-game-style')?.value as MapGenerationStyle,
      },
      oob: {
        scale: root.querySelector<HTMLSelectElement>('#new-game-scale')?.value as OobScale,
        formationsPerSide: Number(root.querySelector<HTMLInputElement>('#new-game-formations')?.value ?? 0),
        ...(root.querySelector<HTMLSelectElement>('#new-game-air')?.value === 'STANDARD' ? { air: 'STANDARD' as AirForceLevel } : {}),
      },
      seeds: {
        map: Number(root.querySelector<HTMLInputElement>('#new-game-map-seed')?.value ?? -1),
        oob: Number(root.querySelector<HTMLInputElement>('#new-game-oob-seed')?.value ?? -1),
        deployment: Number(root.querySelector<HTMLInputElement>('#new-game-deployment-seed')?.value ?? -1),
        rules: Number(root.querySelector<HTMLInputElement>('#new-game-rules-seed')?.value ?? -1),
      },
      turnLimit: Number(root.querySelector<HTMLInputElement>('#new-game-turn-limit')?.value ?? 0),
      startMonth: Number(root.querySelector<HTMLSelectElement>('#new-game-start-month')?.value ?? 0),
    };
    newGameError = '';
    newGameBusy = true;
    preparingPreview = true;
    render(snapshot);
    await afterPaint();
    try {
      const prepared = newGameOrchestrator.prepare(newGameSettings);
      if (prepared.ok) newGamePreview = prepared.value;
      else { newGamePreview = null; newGameError = prepared.error.map(({ stage, message }) => `${stage}: ${message}`).join(' '); }
    } catch (error) {
      newGamePreview = null;
      newGameError = `${error instanceof Error ? error.message : 'Preview failed.'} Adjust the settings and build again.`;
    }
    newGameBusy = false;
    preparingPreview = false;
    previewStale = false;
    render(snapshot);
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
    if (id === 'new-game-air') newGameSettings = { ...newGameSettings, oob: { ...newGameSettings.oob, air: input.value as AirForceLevel } };
    if (id === 'new-game-turn-limit') newGameSettings = { ...newGameSettings, turnLimit: value };
    if (id === 'new-game-start-month') newGameSettings = { ...newGameSettings, startMonth: value };
    for (const key of ['map', 'oob', 'deployment', 'rules'] as const) if (id === `new-game-${key}-seed`) newGameSettings = { ...newGameSettings, seeds: { ...newGameSettings.seeds, [key]: value } };
    const start = root.querySelector<HTMLButtonElement>('#start-previewed-game');
    if (start) {
      start.disabled = true;
      start.textContent = 'Rebuild preview to start';
    }
    root.querySelector('.operation-preview-content')?.classList.add('is-stale');
    const status = root.querySelector<HTMLElement>('.new-game-submit strong');
    const supporting = root.querySelector<HTMLElement>('.new-game-submit p');
    if (status) status.textContent = newGamePreview ? 'Preview out of date' : 'Settings updated';
    if (supporting) supporting.textContent = 'Build a fresh preview before starting.';
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
        newGameError = created.error.map(({ stage, message }) => `${stage}: ${message}`).join(' ');
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
    newGamePreview = null;
    previewStale = false;
    render(snapshot);
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
  if (utilityOpen) { utilityOpen = null; render(controller.getSnapshot()); return; }
  if (newGameOpen && !newGameBusy) { newGameOpen = false; history.replaceState(null, '', location.pathname); render(controller.getSnapshot()); return; }
  const snapshot = controller.getSnapshot();
  if (snapshot.draft) controller.cancelDraft();
  else controller.clearSelection();
});

unsubscribeController = controller.subscribe(render);
window.addEventListener('resize', updateCamera);
