import {
  DEFAULT_NEW_GAME_REQUEST,
  createGameplayEngine,
  createMemoryGameplayPorts,
  createNewGameOrchestrator,
  buildGeneratedMapPreview,
  buildGeneratedOobPreview,
  type CreatedNewGame,
  type GeneratedScenarioPackage,
  type MapGenerationStyle,
  type NewGameRequest,
  type OobScale,
} from '../index.js';
import { createUiController, type UiController } from './controller.js';
import { counterView, counterSvgBody, counterSvg, counterLod } from './counter.js';
import { commandDeckHtml, actionDestination, type DeckState, type DeckList } from './command-deck.js';
import type { UiSnapshot } from './model.js';
import {
  actionKindLabel,
  actionSummary,
  pieceLabel,
} from './presenter.js';

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
let utilityOpen: 'session' | 'rules' | null = null;
let rulePage = 0;
const listPositions = new Map<string, number>();
let settingsTab = 'basic';
let previewStale = false;
let mapDragged = false;
const afterPaint = (): Promise<void> => new Promise(resolve => requestAnimationFrame(() => setTimeout(resolve, 0)));
const runUi = async (operation: () => void | Promise<void>): Promise<void> => {
  if (deck.working) return;
  deck.error = '';
  deck.working = true;
  root.querySelectorAll<HTMLButtonElement>('#execute-action, #end-phase').forEach(button => { button.disabled = true; });
  const notice = root.querySelector('.deck-notice');
  if (notice) notice.textContent = 'Preparing action…';
  await afterPaint();
  try { await operation(); }
  catch (error) { deck.error = `${error instanceof Error ? error.message : 'Action could not be prepared.'} Choose the action again to retry.`; }
  finally { deck.working = false; render(controller.getSnapshot()); }
};

const onMapStacks = (snapshot: UiSnapshot) => new Map(
  (snapshot.view.projection?.stacks ?? [])
    .filter((stack) => stack.location.kind === 'ON_MAP')
    .map((stack) => [stack.location.kind === 'ON_MAP' ? stack.location.hexId : '', stack]),
);

const terrainDefsHtml = (): string => `<defs>
  <pattern id="terrain-clear" width="18" height="18" patternUnits="userSpaceOnUse"><rect width="18" height="18" fill="#7d805b"/><path d="M2 14l4-3m7-7l3-2" stroke="#97966e" stroke-width="1"/></pattern>
  <pattern id="terrain-woods" width="20" height="20" patternUnits="userSpaceOnUse"><rect width="20" height="20" fill="#35583d"/><path d="M5 15l3-8 3 8zm8 2l2-6 3 6z" fill="#1f3f2a"/><path d="M8 15v3m7-1v2" stroke="#b9a477" stroke-width="1.2"/></pattern>
  <pattern id="terrain-rough" width="18" height="18" patternUnits="userSpaceOnUse"><rect width="18" height="18" fill="#806f50"/><path d="M1 16L7 9l3 3 4-7 4 11" fill="none" stroke="#a79569" stroke-width="1.3"/></pattern>
  <pattern id="terrain-mountain" width="24" height="22" patternUnits="userSpaceOnUse"><rect width="24" height="22" fill="#5b5c57"/><path d="M1 19L8 6l4 7 4-10 7 16" fill="#74756e" stroke="#343633" stroke-width="1.2"/><path d="M6 10l2-4 2 4m4-3l2-4 2 5" fill="#d2d1c7"/></pattern>
  <pattern id="terrain-marsh" width="22" height="18" patternUnits="userSpaceOnUse"><rect width="22" height="18" fill="#536c55"/><path d="M1 13c4-3 7 3 11 0s7 2 10-1M4 6v6m4-8v7m9-5v6" fill="none" stroke="#8da484" stroke-width="1.1"/></pattern>
  <pattern id="terrain-water" width="24" height="18" patternUnits="userSpaceOnUse"><rect width="24" height="18" fill="#315e78"/><path d="M0 5c4-3 8 3 12 0s8 3 12 0M0 13c4-3 8 3 12 0s8 3 12 0" fill="none" stroke="#69a8c6" stroke-width="1.2"/></pattern>
</defs>`;

const riverEdgeLine = (edge: (typeof theater.edges)[number]): string => {
  const dx = edge.x2 - edge.x1;
  const dy = edge.y2 - edge.y1;
  const length = Math.hypot(dx, dy) || 1;
  const half = layout.hexSize / 2;
  const middleX = (edge.x1 + edge.x2) / 2;
  const middleY = (edge.y1 + edge.y2) / 2;
  const perpendicularX = -dy / length * half;
  const perpendicularY = dx / length * half;
  return `<line class="map-edge ${edge.kind.toLowerCase().replace('_', '-')}" x1="${middleX - perpendicularX}" y1="${middleY - perpendicularY}" x2="${middleX + perpendicularX}" y2="${middleY + perpendicularY}"></line>`;
};

const renderMap = (snapshot: UiSnapshot): string => {
  const stacks = onMapStacks(snapshot);
  const objectives = new Set<string>(currentGame.deployment.objectiveHexIds);
  const roles = new Map(currentGame.generatedOob.sides.flatMap((side) => [
    ...side.formations.flatMap((formation) => formation.units),
    ...side.independentUnits,
  ]).map((unit) => [unit.id, unit.role]));
  const roleLabel = (pieceId: string): string => {
    switch (roles.get(pieceId)) {
      case 'FORMATION_COMMAND': return 'HQ';
      case 'COMBAT': return 'CBT';
      case 'ARTILLERY': return 'ART';
      case 'RECONNAISSANCE': return 'REC';
      case 'ENGINEER': return 'ENG';
      case 'TRANSPORT': return 'TRN';
      case 'SUPPLY': return 'SUP';
      default: return 'UNIT';
    }
  };
  const destinations = snapshot.selection.actionKind === 'ADVANCE_SEQUENCE' ? new Set<string>()
    : new Set(snapshot.candidates.map(actionDestination).filter((hexId) => hexId !== null));
  const chosenDestination = actionDestination(snapshot.selectedAction);
  const terrain = theater.cells.map((cell) => {
    const selected = snapshot.selection.hexId === cell.id ? ' is-selected' : '';
    const reachable = destinations.has(cell.id);
    const destination = chosenDestination === cell.id ? ' is-destination' : '';
    return `<g class="hex-cell terrain-${cell.terrain.toLowerCase()}${selected}${reachable ? ' is-reachable' : ''}${destination}" role="button" tabindex="${cell.id === (snapshot.selection.hexId ?? theater.cells[0]?.id) ? 0 : -1}" data-hex="${escapeHtml(cell.id)}"
      aria-label="Hex ${escapeHtml(cell.id)}, ${escapeHtml(cell.terrain.toLowerCase())} terrain">
      <polygon points="${cell.points}"></polygon>
      <text class="hex-coordinate" x="${cell.x}" y="${cell.y + 39}" text-anchor="middle">${escapeHtml(cell.id)}</text>
    </g>`;
  }).join('');
  const rivers = theater.edges.filter(({ kind }) => kind.includes('RIVER')).map(riverEdgeLine).join('');
  const roads = theater.edges.filter(({ kind }) => kind.includes('ROAD')).map((edge) =>
    `<line class="map-edge ${edge.kind.toLowerCase().replace('_', '-')}" x1="${edge.x1}" y1="${edge.y1}" x2="${edge.x2}" y2="${edge.y2}"></line>`).join('');
  const features = theater.cells.map((cell) => {
    const settlement = cell.settlement ? `<g class="settlement settlement-${cell.settlement.toLowerCase()}" aria-label="${cell.settlement.toLowerCase()}">
      <circle cx="${cell.x}" cy="${cell.y}" r="${cell.settlement === 'CITY' ? 9 : cell.settlement === 'TOWN' ? 7 : 5}"></circle>
      <path d="M${cell.x - 5} ${cell.y + 8}h10M${cell.x} ${cell.y - 6}v12"></path></g>` : '';
    const strategic = cell.strategic ? `<path class="strategic-zone side-${cell.strategic.toLowerCase()}" d="M${cell.x - 14} ${cell.y - 29}h28" aria-label="${cell.strategic.toLowerCase()} entry or supply zone"></path>` : '';
    const objective = objectives.has(cell.id) ? `<g class="objective-marker" aria-label="objective"><circle cx="${cell.x}" cy="${cell.y}" r="15"></circle><path d="M${cell.x - 20} ${cell.y}h40M${cell.x} ${cell.y - 20}v40"></path></g>` : '';
    return `${strategic}${settlement}${objective}`;
  }).join('');
  const selectedCounters: string[] = [];
  const selectedPath = snapshot.selectedAction?.kind === 'MOVE_PIECE'
    ? snapshot.selectedAction.path.map(id => theater.cells.find(cell => cell.id === id)).filter(cell => cell !== undefined).map(cell => `${cell.x},${cell.y}`).join(' ')
    : '';
  const lastPoint = selectedPath.split(' ').at(-1)?.split(',');
  const pathEnd = selectedPath && lastPoint ? `<circle class="movement-path-end" cx="${lastPoint[0]}" cy="${lastPoint[1]}" r="7"></circle>` : '';
  const stackBadges: string[] = [];
  const counters = theater.cells.map((cell) => {
    const stack = stacks.get(cell.id);
    const visiblePieces = (stack?.pieces ?? []).slice(0, 3);
    const selectedPiece = stack?.pieces.find(({id}) => id === snapshot.selection.pieceId);
    if (selectedPiece && !visiblePieces.includes(selectedPiece)) visiblePieces.push(selectedPiece);
    const counterHtml = visiblePieces.map((piece, index) => {
      const ownerIndex = scenario.players.findIndex(({ id }) => id === piece.ownerId);
      const x = cell.x - 35 + index * 8;
      const y = cell.y - 35 - index * 7;
      const pieceSelected = snapshot.selection.pieceId === piece.id ? ' is-selected' : '';
      const label = pieceLabel(scenario, piece);
      const definition = scenario.pieceCatalog.definitions.find(({id}) => id === piece.definitionId)!;
      const markup = `<g class="counter owner-${ownerIndex + 1}${pieceSelected}" transform="translate(${x} ${y}) scale(.7)"
        role="button" tabindex="-1" data-piece="${escapeHtml(piece.id)}" data-hex="${escapeHtml(cell.id)}"
        aria-label="${escapeHtml(`${label}, ${cell.id}, ${piece.mode ?? 'no mode'}, ${piece.remainingSteps ?? 'unknown'} steps`)}">
        ${counterSvgBody(counterView(definition, piece))}
      </g>`;
      if (pieceSelected) { selectedCounters.push(markup); return ''; }
      return markup;
    }).join('');
    const hiddenCount = (stack?.hiddenCount ?? 0) + Math.max(0, (stack?.pieces.length ?? 0) - visiblePieces.length);
    const hidden = hiddenCount > 0
      ? `<g class="hidden-count" transform="translate(${cell.x + 23} ${cell.y - 30})"><circle r="12"></circle><text y="5" text-anchor="middle">+${hiddenCount}</text></g>` : '';
    stackBadges.push(hidden);
    return counterHtml;
  }).join('');
  // SVG uses document paint order, not CSS z-index. Keep ALL hex artwork below
  // counters, and the selected counter above every other stack's counters.
  return `${terrainDefsHtml()}<g class="hex-map-layer${snapshot.selection.actionKind === 'MOVE_PIECE' && snapshot.selection.pieceId !== null ? ' is-moving' : ''}"><g class="terrain-layer">${terrain}</g><g class="river-layer">${rivers}</g><g class="road-layer">${roads}</g><g class="feature-layer">${features}</g><polyline class="movement-path" points="${selectedPath}" />${pathEnd}</g><g class="counter-layer"><g class="unselected-counter-layer">${counters}</g><g class="selected-counter-layer">${selectedCounters.join('')}</g><g class="stack-badge-layer">${stackBadges.join('')}</g></g>`;
};


const decisionHtml = (snapshot: UiSnapshot): string => {
  const pending = snapshot.view.pendingDecision;
  if (!pending || snapshot.view.privacyLocked) return '';
  return `<div class="modal-backdrop"><section class="decision-dialog" role="dialog" aria-modal="true" aria-labelledby="decision-title">
    <p class="eyebrow">PENDING DECISION</p><h2 id="decision-title">${escapeHtml(pending.kind.replaceAll('_', ' '))}</h2>
    <p>Choose an option to continue.</p>
    <div class="decision-options">${pending.options.map(({ id, label }) => `
      <button class="decision-option" data-choice="${escapeHtml(id)}">${escapeHtml(label)}</button>`).join('')}</div>
  </section></div>`;
};

const privacyHtml = (snapshot: UiSnapshot): string => snapshot.view.privacyLocked ? `
  <div class="privacy-screen" role="dialog" aria-modal="true" aria-labelledby="handoff-title">
    <div><p class="eyebrow">HOT-SEAT PRIVACY</p><h2 id="handoff-title">Pass the screen</h2>
    <p>The map and player information are hidden until the next player confirms.</p>
    <button class="primary" id="complete-handoff">I am the next player</button></div>
  </div>` : '';

const oobRoleLabel = (role: string): string => role.replaceAll('_', ' ').toLowerCase();

const operationPreviewHtml = (prepared: GeneratedScenarioPackage): string => {
  const map = buildGeneratedMapPreview(prepared.generatedMap, 32);
  const oob = buildGeneratedOobPreview(prepared.generatedOob);
  const previewCounter = (unit: {id:string}): string => {
    const piece = prepared.scenario.initialPieceState.pieces.find(({id}) => id === unit.id)!;
    const definition = prepared.scenario.pieceCatalog.definitions.find(({id}) => id === piece.definitionId)!;
    return `<figure class="preview-counter">${counterSvg(counterView(definition, {...piece, statuses: [], redacted: false}))}<figcaption>${escapeHtml(definition.name)}</figcaption></figure>`;
  };
  const objectives = new Set<string>(prepared.deployment.objectiveHexIds);
  const cells = map.cells.map((cell) => `<g class="generated-cell terrain-${cell.terrain.toLowerCase()}">
    <polygon points="${cell.points}"></polygon>
    ${cell.settlement ? `<circle class="settlement-marker" cx="${cell.x}" cy="${cell.y}" r="${cell.settlement === 'CITY' ? 7 : 5}"></circle>` : ''}
    ${cell.strategic ? `<path class="preview-entry side-${cell.strategic.toLowerCase()}" d="M${cell.x - 10} ${cell.y - 18}h20"></path>` : ''}
    ${objectives.has(cell.id) ? `<circle class="preview-objective" cx="${cell.x}" cy="${cell.y}" r="11"></circle>` : ''}
  </g>`).join('');
  const rivers = map.edges.filter(({ kind }) => kind.includes('RIVER')).map((edge) =>
    `<line class="generated-edge ${edge.kind.toLowerCase().replace('_', '-')}" x1="${edge.x1}" y1="${edge.y1}" x2="${edge.x2}" y2="${edge.y2}"></line>`).join('');
  const roads = map.edges.filter(({ kind }) => kind.includes('ROAD')).map((edge) =>
    `<line class="generated-edge ${edge.kind.toLowerCase().replace('_', '-')}" x1="${edge.x1}" y1="${edge.y1}" x2="${edge.x2}" y2="${edge.y2}"></line>`).join('');
  const forces = oob.sides.map((side) => `<section class="preview-force side-${side.side.toLowerCase()}">
    <header><strong>${escapeHtml(side.side)}</strong><span>${prepared.generatedOob.metrics.pointsBySide[side.side]} points</span></header>
    <ul>${side.formations.map((formation) => `<li><span>${escapeHtml(formation.name)}</span><small>${formation.units.length} units · ${escapeHtml(formation.archetype.replaceAll('_', ' ').toLowerCase())}</small></li>`).join('')}</ul>
    ${side.formations.map((formation) => `<details class="counter-formation"><summary>${escapeHtml(formation.name)}</summary><div class="counter-grid">${formation.units.map(previewCounter).join('')}</div></details>`).join('')}
    <details class="counter-formation"><summary>${side.independentUnits.length} independent support / logistics units</summary><div class="counter-grid">${side.independentUnits.map(previewCounter).join('')}</div></details>
  </section>`).join('');
  return `<div class="operation-preview-content">
    <div class="operation-map-wrap"><svg class="operation-map" viewBox="0 0 ${map.layout.width} ${map.layout.height}" role="img" aria-label="Generated operation map preview">${terrainDefsHtml()}${cells}${rivers}${roads}</svg></div>
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
      </fieldset>
      <fieldset><legend>Game rules</legend>
        <label>Turn limit<input id="new-game-turn-limit" type="number" min="1" max="20" value="${newGameSettings.turnLimit}"></label>
        <label>Rules seed<input id="new-game-rules-seed" type="number" min="0" max="4294967295" value="${newGameSettings.seeds.rules}"></label>
        <button type="button" id="randomize-new-game">Randomize all seeds</button>
      </fieldset>
      ${newGameError ? `<p class="generator-error new-game-error" role="alert">${escapeHtml(newGameError)}</p>` : ''}
    </form><section class="operation-preview" aria-label="Combined generated operation preview">${newGamePreview ? operationPreviewHtml(newGamePreview) : '<div class="operation-preview-empty"><strong>No operation built yet</strong><p>Choose map and force options, then build one combined preview. Starting is unavailable until map, OOB and deployment all validate together.</p></div>'}</section></div>
  </section></div>`;
};

const gameEndHtml = (snapshot: UiSnapshot): string => {
  if (snapshot.view.metadata.lifecycle !== 'FINISHED' || newGameOpen) return '';
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
    <div class="game-end-actions"><button id="download-final-save">Download final save</button><button id="download-replay">Download replay</button><button class="primary" id="new-game-after-end">New Game</button></div>
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
  if (snapshot.view.pendingDecision && !newGameOpen) {
    utilityOpen = null;
    root.innerHTML = decisionHtml(snapshot);
    bindEvents(snapshot);
    const options = [...root.querySelectorAll<HTMLButtonElement>('[data-choice]')];
    options[0]?.focus();
    root.querySelector<HTMLElement>('.decision-dialog')!.onkeydown = event => {
      if (event.key !== 'Tab' || !options.length) return;
      event.preventDefault();
      const index = options.indexOf(document.activeElement as HTMLButtonElement);
      options[(index + (event.shiftKey ? -1 : 1) + options.length) % options.length]?.focus();
    };
    return;
  }
  const projection = snapshot.view.projection;
  const sequence = projection?.sequence;
  const activeBinding = snapshot.bindings.find(({ seatId }) => seatId === snapshot.view.metadata.activeSeatId);
  const otherBinding = snapshot.bindings.find(({ seatId }) => seatId !== snapshot.view.metadata.activeSeatId);
  const lifecycle = snapshot.view.metadata.lifecycle;
  const actingBinding = snapshot.bindings.find(({ seatId }) => seatId === snapshot.requiredSeatId);
  const handoffRequired = lifecycle === 'ACTIVE' && snapshot.requiredSeatId !== null
    && snapshot.view.metadata.activeSeatId !== snapshot.requiredSeatId;
  const checkpoints = snapshot.checkpoints.map((checkpoint) => `
    <button class="checkpoint" data-checkpoint="${escapeHtml(checkpoint.id)}">${escapeHtml(checkpoint.label || checkpoint.id)} · R${checkpoint.revision}</button>`).join('');
  root.innerHTML = `
    <div class="app-shell">
      <header class="topbar">
        <div class="theater-title"><p class="eyebrow">GENERATED THEATER</p><strong id="map-title">${escapeHtml(currentGame.summary.mapSize)} · ${escapeHtml(currentGame.summary.mapStyle.replaceAll('_', ' ').toLowerCase())}</strong></div>
        <div class="turn-strip" aria-label="Current turn state">
          <span><small>TURN</small><strong>${sequence?.gameTurn ?? '–'}</strong></span>
          <span><small>PHASE</small><strong>${escapeHtml(sequence?.phase ?? lifecycle)}</strong></span>
          <span><small>SEGMENT</small><strong>${escapeHtml(sequence?.segment ?? '–')}</strong></span>
          <span><small>REVISION</small><strong>${snapshot.view.stateRevision}</strong></span>
        </div>
        <div class="seat-badge"><span class="status-dot"></span><div><small>ACTIVE SEAT</small><strong>${escapeHtml(activeBinding?.label ?? snapshot.view.playerId)}</strong></div></div>
      </header>

      <aside class="command-rail" aria-label="Command deck">${commandDeckHtml(snapshot, deck)}</aside>

      <main class="workspace">
        <section class="map-card" aria-labelledby="map-title">
          <div class="map-viewport" id="map-viewport">
            <svg id="hex-map" viewBox="0 0 ${layout.width} ${layout.height}" role="img" aria-label="Hex map; use arrow-free pointer pan and zoom controls">
              <g id="map-camera" transform="translate(${camera.x} ${camera.y}) scale(${camera.zoom})">${renderMap(snapshot)}</g>
            </svg>
            <div class="map-controls" aria-label="Map zoom controls"><button id="zoom-out" aria-label="Zoom out">−</button><output id="zoom-level">${Math.round(camera.zoom * 100)}%</output><button id="zoom-in" aria-label="Zoom in">+</button><button id="zoom-reset">Reset</button></div>
            <div class="map-legend"><span class="terrain-key woods">Woods</span><span class="terrain-key rough">Rough</span><span class="terrain-key mountain">Mountain</span><span class="terrain-key marsh">Marsh</span><span class="terrain-key water">Water</span><span class="line-key road">Road</span><span class="line-key river">River</span><span class="legend-chip owner-1">Player one</span><span class="legend-chip owner-2">Player two</span></div>
          </div>
        </section>
      </main>
    </div>${decisionHtml(snapshot)}${newGameDialogHtml()}${privacyHtml(snapshot)}${gameEndHtml(snapshot)}`;
  const sessionContent = `<p><strong>${escapeHtml(activeBinding?.label ?? '')}</strong> · ${escapeHtml(lifecycle)}</p>
    <button class="wide" id="begin-handoff" ${otherBinding && lifecycle !== 'READY' ? '' : 'disabled'}>Hand off to ${escapeHtml(otherBinding?.label ?? 'next seat')}</button>
    <div class="button-grid"><button id="save-game">Download save</button><button id="load-game">Load save</button></div>
    <input id="save-file" type="file" accept="application/json,.json" hidden>
    <button id="create-checkpoint">Create checkpoint</button><div class="checkpoint-list">${checkpoints || '<p>No checkpoints yet.</p>'}</div>
    <p class="supporting">${currentGame.summary.unitCount} units · ${currentGame.summary.formationCount} formations · ${currentGame.summary.turnLimit} turns</p>
    <p class="supporting">Seeds: map ${currentGame.request.seeds.map}, OOB ${currentGame.request.seeds.oob}, deployment ${currentGame.request.seeds.deployment}, rules ${currentGame.request.seeds.rules}.</p>`;
  root.querySelector('.topbar')?.insertAdjacentHTML('beforeend', `<div class="session-actions"><button id="open-new-game">New Game</button><button id="toggle-pause" ${lifecycle === 'ACTIVE' || lifecycle === 'PAUSED' ? '' : 'disabled'}>${lifecycle === 'PAUSED' ? 'Resume' : 'Pause'}</button><button id="open-session">Session</button></div>`);
  if (utilityOpen) {
    const facts = snapshot.explanation ? [...snapshot.explanation.reasons.map(r => `${r.message} (${r.rule})`), ...snapshot.explanation.facts.map(f => `${f.key}: ${f.value}`)] : [];
    rulePage = Math.min(rulePage, Math.max(0, facts.length - 1));
    root.insertAdjacentHTML('beforeend', `<div class="modal-backdrop utility-backdrop"><section class="utility-dialog" role="dialog" aria-modal="true" aria-labelledby="utility-title"><header><h2 id="utility-title">${utilityOpen === 'session' ? 'Session' : 'Rules & effects'}</h2><button id="close-utility">Close</button></header>${utilityOpen === 'session' ? `<div class="utility-content">${sessionContent}</div>` : `<p>${escapeHtml(snapshot.selectedAction ? actionSummary(snapshot.selectedAction) : '')}</p><p class="rule-detail">${escapeHtml(facts[rulePage] ?? 'No additional rule details.')}</p><div class="button-grid"><button id="previous-rule" ${rulePage === 0 ? 'disabled' : ''}>Previous</button><button id="next-rule" ${rulePage >= facts.length - 1 ? 'disabled' : ''}>Next (${rulePage + 1}/${facts.length})</button></div>`}</section></div>`);
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

const activateKeyboard = (selector: string, callback: (element: HTMLElement) => void): void => {
  root.querySelectorAll<HTMLElement>(selector).forEach((element) => element.addEventListener('keydown', (event) => {
    if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); callback(element); }
  }));
};

const updateCamera = (): void => {
  const svg = root.querySelector<SVGSVGElement>('#hex-map');
  const cameraGroup = root.querySelector<SVGGElement>('#map-camera');
  const matrix = svg?.getScreenCTM();
  if (cameraGroup && matrix) cameraGroup.dataset.counterLod = counterLod(70 * Math.hypot(matrix.a, matrix.b) * camera.zoom);
  root.querySelector<SVGGElement>('#map-camera')?.setAttribute('transform', `translate(${camera.x} ${camera.y}) scale(${camera.zoom})`);
  const output = root.querySelector<HTMLOutputElement>('#zoom-level');
  if (output) output.value = `${Math.round(camera.zoom * 100)}%`;
};

const zoom = (factor: number): void => {
  camera.zoom = Math.max(0.65, Math.min(2.4, camera.zoom * factor));
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
  deck.search = ''; deck.list = 'units'; listPositions.clear(); utilityOpen = null;
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

const moving = (snapshot: UiSnapshot): boolean =>
  snapshot.selection.actionKind === 'MOVE_PIECE' && snapshot.selection.pieceId !== null;

const isDestination = (snapshot: UiSnapshot, hexId: string | null): boolean =>
  hexId !== null && snapshot.candidates.some((action) => actionDestination(action) === hexId);

const chooseDestination = (snapshot: UiSnapshot, hexId: string | null): void => {
  if (isDestination(snapshot, hexId)) { deck.hint = ''; controller.selectDestination(hexId); return; }
  const origin = (snapshot.view.projection?.stacks ?? []).find((stack) => stack.pieces.some(({ id }) => id === snapshot.selection.pieceId));
  const atOrigin = origin?.location.kind === 'ON_MAP' && origin.location.hexId === hexId;
  deck.hint = atOrigin ? '' : `Hex ${hexId} is not a legal destination for this unit. Choose a highlighted hex, or Clear selection to pick another unit.`;
  controller.selectDestination(null);
};

/** Selecting a friendly unit enters Move directly when movement is legal and no other action was chosen. */
const selectUnit = (snapshot: UiSnapshot, hexId: string | null, pieceId: string | null): void => {
  deck.hint = '';
  if (hexId) controller.selectHex(hexId);
  const piece = (snapshot.view.projection?.stacks ?? []).flatMap((stack) => stack.pieces).find(({ id }) => id === pieceId);
  const kind = snapshot.selection.actionKind;
  const moveAvailable = snapshot.families.some((family) => family.kind === 'MOVE_PIECE' && family.enabled);
  if (piece && !piece.redacted && piece.ownerId === snapshot.view.playerId && moveAvailable
    && (kind === null || kind === 'ADVANCE_SEQUENCE')) controller.selectActionKind('MOVE_PIECE');
  controller.selectPiece(pieceId);
};

function bindEvents(snapshot: UiSnapshot): void {
  const $ = <T extends Element>(selector: string) => root.querySelector<T>(selector);
  $('#open-new-game')?.addEventListener('click', () => openNewGame(snapshot));
  $('#new-game-after-end')?.addEventListener('click', () => openNewGame(snapshot));
  $('#close-new-game')?.addEventListener('click', () => {
    newGameOpen = false;
    history.replaceState(null, '', location.pathname);
    render(snapshot);
  });
  $('#toggle-pause')?.addEventListener('click', controller.togglePause);
  $('#begin-handoff')?.addEventListener('click', controller.beginHandoff);
  $('#begin-required-handoff')?.addEventListener('click', controller.beginHandoff);
  $('#complete-handoff')?.addEventListener('click', controller.completeHandoff);
  $('#create-checkpoint')?.addEventListener('click', controller.createCheckpoint);
  $('#execute-action')?.addEventListener('click', () => void runUi(controller.executeSelected));
  $('#open-session')?.addEventListener('click', () => { utilityOpen = 'session'; render(snapshot); });
  $('#close-utility')?.addEventListener('click', () => { utilityOpen = null; render(snapshot); });
  $('#open-rule-details')?.addEventListener('click', () => { utilityOpen = 'rules'; rulePage = 0; render(snapshot); });
  $('#previous-rule')?.addEventListener('click', () => { rulePage--; render(snapshot); });
  $('#next-rule')?.addEventListener('click', () => { rulePage++; render(snapshot); });
  $('#clear-action')?.addEventListener('click', () => void runUi(() => { deck.list = 'units'; deck.hint = ''; controller.selectPiece(null); controller.selectActionKind('ADVANCE_SEQUENCE'); }));
  $('#load-more-candidates')?.addEventListener('click', () => void runUi(controller.loadMoreCandidates));
  $('#end-phase')?.addEventListener('click', () => void runUi(async () => { controller.selectActionKind('ADVANCE_SEQUENCE'); await controller.executeSelected(); }));
  $('#deck-action')?.addEventListener('change', event => {
    const kind = (event.target as HTMLSelectElement).value;
    // Movement is chosen on the map, so it keeps the current list instead of opening Choices.
    if (kind) void runUi(() => { if (kind !== 'MOVE_PIECE') deck.list = 'candidates'; controller.selectActionKind(kind as NonNullable<UiSnapshot['selection']['actionKind']>); });
  });
  $('#deck-search')?.addEventListener('input', event => { deck.search = (event.target as HTMLInputElement).value; render(snapshot); });
  root.querySelectorAll<HTMLButtonElement>('[data-settings]').forEach(button => button.addEventListener('click', () => {
    settingsTab = button.dataset.settings!;
    const form = root.querySelector<HTMLElement>('#new-game-form'); if (form) form.dataset.settingsTab = settingsTab;
    root.querySelectorAll<HTMLButtonElement>('[data-settings]').forEach(item => item.setAttribute('aria-pressed', String(item.dataset.settings === settingsTab)));
  }));
  root.querySelectorAll<HTMLElement>('[data-deck-list]').forEach(button => button.addEventListener('click', () => { deck.list = button.dataset.deckList as DeckList; render(snapshot); }));
  $('#zoom-in')?.addEventListener('click', () => zoom(1.2));
  $('#zoom-out')?.addEventListener('click', () => zoom(1 / 1.2));
  $('#zoom-reset')?.addEventListener('click', () => { camera.zoom = 1; camera.x = 0; camera.y = 0; updateCamera(); });

  root.querySelectorAll<HTMLElement>('.hex-cell[data-hex]').forEach((element) => element.addEventListener('click', (event) => {
    event.stopPropagation();
    if (mapDragged) { mapDragged = false; return; }
    const hexId = element.dataset.hex ?? null;
    if (moving(snapshot)) { chooseDestination(snapshot, hexId); return; }
    const candidate = snapshot.candidates.findIndex(action => actionDestination(action) === hexId);
    if (deck.list === 'candidates' && candidate >= 0) controller.selectCandidate(candidate);
    else { deck.list = 'stack'; controller.selectHex(hexId); }
  }));
  root.querySelectorAll<HTMLElement>('[data-piece]').forEach((element) => element.addEventListener('click', (event) => {
    event.stopPropagation();
    // On the map, a counter standing on a legal destination is part of that destination.
    if (element.closest('#hex-map') && moving(snapshot) && isDestination(snapshot, element.dataset.hex ?? null)) {
      chooseDestination(snapshot, element.dataset.hex ?? null);
      return;
    }
    void runUi(() => selectUnit(snapshot, element.dataset.hex ?? null, element.dataset.piece ?? null));
  }));
  activateKeyboard('.hex-cell[data-hex]', (element) => element.dispatchEvent(new MouseEvent('click', { bubbles: true })));
  activateKeyboard('.counter[data-piece]', (element) => selectUnit(snapshot, element.dataset.hex ?? null, element.dataset.piece ?? null));
  root.querySelectorAll<HTMLButtonElement>('[data-action-kind]').forEach((button) => button.addEventListener('click', () =>
    controller.selectActionKind(button.dataset.actionKind as NonNullable<UiSnapshot['selection']['actionKind']>)));
  root.querySelectorAll<HTMLButtonElement>('[data-candidate]').forEach((button) => button.addEventListener('click', () =>
    controller.selectCandidate(Number(button.dataset.candidate))));
  root.querySelectorAll<HTMLButtonElement>('[data-choice]').forEach((button) => button.addEventListener('click', () =>
    void controller.respondToDecision(button.dataset.choice ?? '')));
  root.querySelectorAll<HTMLButtonElement>('[data-checkpoint]').forEach((button) => button.addEventListener('click', () =>
    void controller.undoTo(button.dataset.checkpoint ?? '')));

  $('#save-game')?.addEventListener('click', () => {
    downloadJson(controller.serializeSave(), `ocs-${snapshot.view.metadata.id}.json`);
  });
  $('#download-final-save')?.addEventListener('click', () =>
    downloadJson(controller.serializeSave(), `ocs-final-${snapshot.view.metadata.id}.json`));
  $('#download-replay')?.addEventListener('click', () =>
    downloadJson(controller.serializeReplay(), `ocs-replay-${snapshot.view.metadata.id}.json`));
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
      },
      seeds: {
        map: Number(root.querySelector<HTMLInputElement>('#new-game-map-seed')?.value ?? -1),
        oob: Number(root.querySelector<HTMLInputElement>('#new-game-oob-seed')?.value ?? -1),
        deployment: Number(root.querySelector<HTMLInputElement>('#new-game-deployment-seed')?.value ?? -1),
        rules: Number(root.querySelector<HTMLInputElement>('#new-game-rules-seed')?.value ?? -1),
      },
      turnLimit: Number(root.querySelector<HTMLInputElement>('#new-game-turn-limit')?.value ?? 0),
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
    if (id === 'new-game-turn-limit') newGameSettings = { ...newGameSettings, turnLimit: value };
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
    const nextQ = q! + (event.key === 'ArrowRight' ? 1 : event.key === 'ArrowLeft' ? -1 : 0);
    const nextR = r! + (event.key === 'ArrowDown' ? 1 : event.key === 'ArrowUp' ? -1 : 0);
    const next = [...root.querySelectorAll<HTMLElement>('.hex-cell')].find(e => e.dataset.hex === `${nextQ},${nextR}`);
    if (next) { current.setAttribute('tabindex', '-1'); next.setAttribute('tabindex', '0'); next.focus({ preventScroll: true }); }
  });
  map?.addEventListener('wheel', (event: WheelEvent) => { event.preventDefault(); zoom(event.deltaY < 0 ? 1.12 : 1 / 1.12); }, { passive: false });
  map?.addEventListener('pointerdown', (event: PointerEvent) => {
    if ((event.target as Element).closest('.counter')) return;
    mapDragged = false;
    dragging = { x: event.clientX, y: event.clientY, cameraX: camera.x, cameraY: camera.y };
  });
  map?.addEventListener('pointermove', (event: PointerEvent) => {
    if (!dragging) return;
    if (Math.hypot(event.clientX - dragging.x, event.clientY - dragging.y) < 5) return;
    mapDragged = true; map.setPointerCapture(event.pointerId);
    const scale = layout.width / Math.max(1, map.getBoundingClientRect().width);
    camera.x = dragging.cameraX + (event.clientX - dragging.x) * scale;
    camera.y = dragging.cameraY + (event.clientY - dragging.y) * scale;
    updateCamera();
  });
  map?.addEventListener('pointerup', () => { dragging = null; });
}

unsubscribeController = controller.subscribe(render);
window.addEventListener('resize', updateCamera);
