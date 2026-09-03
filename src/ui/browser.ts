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
let newGameError = '';
let newGamePreview: GeneratedScenarioPackage | null = null;

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
  const terrain = theater.cells.map((cell) => {
    const selected = snapshot.selection.hexId === cell.id ? ' is-selected' : '';
    return `<g class="hex-cell terrain-${cell.terrain.toLowerCase()}${selected}" role="button" tabindex="0" data-hex="${escapeHtml(cell.id)}"
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
  const counters = theater.cells.map((cell) => {
    const stack = stacks.get(cell.id);
    const visiblePieces = (stack?.pieces ?? []).slice(0, 3);
    const counterHtml = visiblePieces.map((piece, index) => {
      const ownerIndex = scenario.players.findIndex(({ id }) => id === piece.ownerId);
      const x = cell.x - 23 + index * 8;
      const y = cell.y - 20 - index * 7;
      const pieceSelected = snapshot.selection.pieceId === piece.id ? ' is-selected' : '';
      const label = pieceLabel(scenario, piece);
      return `<g class="counter owner-${ownerIndex + 1}${pieceSelected}" transform="translate(${x} ${y})"
        role="button" tabindex="0" data-piece="${escapeHtml(piece.id)}" data-hex="${escapeHtml(cell.id)}"
        aria-label="${escapeHtml(`${label}, ${cell.id}, ${piece.mode ?? 'no mode'}, ${piece.remainingSteps ?? 'unknown'} steps`)}">
        <rect width="46" height="40" rx="4"></rect>
        <text class="counter-name" x="23" y="16" text-anchor="middle">${escapeHtml(piece.redacted ? '?' : roleLabel(piece.id))}</text>
        <text class="counter-stats" x="23" y="32" text-anchor="middle">${escapeHtml(piece.redacted ? '?' : `${piece.remainingSteps ?? '?'} · ${piece.mode?.slice(0, 3) ?? '?'}`)}</text>
      </g>`;
    }).join('');
    const hiddenCount = (stack?.hiddenCount ?? 0) + Math.max(0, (stack?.pieces.length ?? 0) - visiblePieces.length);
    const hidden = hiddenCount > 0
      ? `<g class="hidden-count" transform="translate(${cell.x + 23} ${cell.y - 30})"><circle r="12"></circle><text y="5" text-anchor="middle">+${hiddenCount}</text></g>` : '';
    return `${counterHtml}${hidden}`;
  }).join('');
  return `${terrainDefsHtml()}<g class="terrain-layer">${terrain}</g><g class="river-layer">${rivers}</g><g class="road-layer">${roads}</g><g class="feature-layer">${features}</g><g class="counter-layer">${counters}</g>`;
};

const selectedStackHtml = (snapshot: UiSnapshot): string => {
  const stack = [...onMapStacks(snapshot).entries()].find(([hexId]) => hexId === snapshot.selection.hexId)?.[1];
  if (!stack) return '<p class="empty-state">Select a map hex to inspect its stack.</p>';
  if (stack.pieces.length === 0 && stack.hiddenCount === 0) return '<p class="empty-state">This hex has no visible counters.</p>';
  return `<div class="stack-list">${stack.pieces.map((piece) => `
    <button class="stack-piece ${snapshot.selection.pieceId === piece.id ? 'is-selected' : ''}"
      data-piece="${escapeHtml(piece.id)}">
      <span>${escapeHtml(pieceLabel(scenario, piece))}</span>
      <small>${escapeHtml(piece.redacted ? 'Enemy details hidden' : `${piece.mode ?? 'No mode'} · ${piece.remainingSteps ?? '–'} steps`)}</small>
    </button>`).join('')}
    ${stack.hiddenCount > 0 ? `<p>${stack.hiddenCount} additional enemy counter(s) hidden.</p>` : ''}</div>`;
};

const actionPanelHtml = (snapshot: UiSnapshot): string => {
  const enabled = snapshot.families.filter(({ enabled }) => enabled);
  const moveNeedsPiece = snapshot.selection.actionKind === 'MOVE_PIECE' && snapshot.selection.pieceId === null;
  const familyButtons = enabled.map((family) => `
    <button class="action-family ${snapshot.selection.actionKind === family.kind ? 'is-selected' : ''}"
      data-action-kind="${family.kind}">
      ${escapeHtml(actionKindLabel(family.kind))}
    </button>`).join('');
  const candidates = snapshot.candidates.map((action, index) => `
    <button class="candidate ${snapshot.selection.candidateIndex === index ? 'is-selected' : ''}" data-candidate="${index}">
      <strong>${escapeHtml(actionKindLabel(action.kind))}</strong>
      <span>${escapeHtml(actionSummary(action))}</span>
    </button>`).join('');
  const explanation = snapshot.explanation === null ? '<p class="empty-state">Select a legal candidate to see its rule explanation.</p>' : `
    <div class="explanation ${snapshot.explanation.allowed ? 'is-legal' : 'is-illegal'}">
      <strong>${snapshot.explanation.allowed ? 'Legal action' : 'Action blocked'}</strong>
      ${snapshot.explanation.reasons.map(({ message, rule }) => `<p>${escapeHtml(message)} <cite>${escapeHtml(rule)}</cite></p>`).join('')}
      ${snapshot.explanation.facts.map(({ key, value }) => `<dl><dt>${escapeHtml(key)}</dt><dd>${escapeHtml(value)}</dd></dl>`).join('')}
    </div>`;
  return `<section class="panel action-panel" aria-labelledby="actions-title">
    <div class="panel-heading"><div><p class="eyebrow">COMMAND</p><h2 id="actions-title">Legal actions</h2></div><span class="count">${enabled.length} ready</span></div>
    <div class="action-families">${familyButtons}</div>
    <h3>Candidate choices</h3>
    <div class="candidate-list">${candidates || `<p class="empty-state">${moveNeedsPiece ? 'Select one of your counters on the map to list its legal moves.' : 'No candidates for this selection.'}</p>`}</div>
    <h3>Rule explanation</h3>${explanation}
    <button class="primary wide" id="execute-action" ${snapshot.selectedAction && !snapshot.busy ? '' : 'disabled'}>Execute selected action</button>
  </section>`;
};

const historyHtml = (snapshot: UiSnapshot): string => {
  const records = [...snapshot.history].reverse().slice(0, 20);
  return `<section class="panel history-panel" aria-labelledby="history-title">
    <div class="panel-heading"><div><p class="eyebrow">TIMELINE</p><h2 id="history-title">History</h2></div><span class="count">${snapshot.history.length}</span></div>
    <ol class="history-list">${records.map((record) => `<li>
      <span class="revision">R${record.revisionAfter}</span><div><strong>${escapeHtml(actionKindLabel(record.action.kind))}</strong><p>${escapeHtml(record.summary)}</p></div>
    </li>`).join('') || '<li class="empty-state">No actions dispatched yet.</li>'}</ol>
  </section>`;
};

const decisionHtml = (snapshot: UiSnapshot): string => {
  const pending = snapshot.view.pendingDecision;
  if (!pending || snapshot.view.privacyLocked) return '';
  return `<div class="modal-backdrop"><section class="decision-dialog" role="dialog" aria-modal="true" aria-labelledby="decision-title">
    <p class="eyebrow">PENDING DECISION</p><h2 id="decision-title">${escapeHtml(pending.kind.replaceAll('_', ' '))}</h2>
    <p>The rules transaction is paused until the active player chooses an option.</p>
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
    <p>${side.independentUnits.length} independent support / logistics units</p>
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
  const configuredClass = newGamePreview ? 'is-complete' : 'is-active';
  const generatedClass = newGamePreview ? 'is-complete' : '';
  const gameplayClass = newGameBusy ? 'is-active' : '';
  return `<div class="modal-backdrop new-game-backdrop"><section class="new-game-dialog" role="dialog" aria-modal="true" aria-labelledby="new-game-title">
    <header class="generator-header"><div><p class="eyebrow">NEW OPERATION</p><h2 id="new-game-title">Build, inspect, then deploy</h2><p>Map, OOB and deployment are generated as one deterministic package. The preview below is the operation Gameplay will mount.</p></div><button id="close-new-game" ${newGameBusy ? 'disabled' : ''}>Close</button></header>
    <div class="flow-steps" aria-label="New Game generation sequence"><span class="${configuredClass}" ${configuredClass === 'is-active' ? 'aria-current="step"' : ''}>1 Configure</span><span class="${generatedClass}">2 Map</span><span class="${generatedClass}">3 OOB</span><span class="${generatedClass}">4 Deployment</span><span class="${gameplayClass}" ${gameplayClass === 'is-active' ? 'aria-current="step"' : ''}>5 Gameplay</span></div>
    <div class="new-game-body"><form id="new-game-form" class="new-game-form">
      <div class="new-game-submit">
        <div><strong>${newGamePreview ? 'Preview ready' : 'Configure operation'}</strong><p>Any option change invalidates the current preview.</p></div>
        <button class="primary" type="submit" ${newGameBusy ? 'disabled' : ''}>Build operation preview</button>
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

      <aside class="command-rail" aria-label="Command deck">
        <header class="deck-brand"><a class="brand" href="#map-title" aria-label="OCS command map"><span class="brand-mark">OCS</span><span>Operational Command</span></a></header>
        <section class="session-block"><p class="eyebrow">SESSION</p><h1>${escapeHtml(snapshot.view.metadata.label)}</h1>
          <div class="lifecycle"><span>${escapeHtml(lifecycle)}</span><small>${escapeHtml(snapshot.view.metadata.rulesVersion)}</small></div>
          <div class="button-grid">
            <button class="primary" id="open-new-game">New Game</button>
            <button id="toggle-pause" ${lifecycle === 'ACTIVE' || lifecycle === 'PAUSED' ? '' : 'disabled'}>${lifecycle === 'PAUSED' ? 'Resume' : 'Pause'}</button>
          </div>
        </section>
        <section class="operation-block"><p class="eyebrow">OPERATION</p>
          <dl class="session-summary"><div><dt>Units</dt><dd>${currentGame.summary.unitCount}</dd></div><div><dt>Formations</dt><dd>${currentGame.summary.formationCount}</dd></div><div><dt>Objectives</dt><dd>${currentGame.summary.objectiveCount}</dd></div><div><dt>Turns</dt><dd>${currentGame.summary.turnLimit}</dd></div></dl>
        </section>
        ${handoffRequired ? `<section class="handoff-required" role="status"><p class="eyebrow">PLAYER CHANGE</p><h2>Pass control</h2><p>${escapeHtml(actingBinding?.label ?? 'The other player')} owns the next action or decision.</p><button class="primary wide" id="begin-required-handoff">Hand off now</button></section>` : ''}
        ${actionPanelHtml(snapshot)}
        <section class="panel stack-panel" aria-labelledby="stack-title"><div class="panel-heading"><div><p class="eyebrow">INSPECT</p><h2 id="stack-title">Stack ${escapeHtml(snapshot.selection.hexId ?? '')}</h2></div></div>${selectedStackHtml(snapshot)}</section>
        <details class="utility-drawer"><summary>History <span class="count">${snapshot.history.length}</span></summary>${historyHtml(snapshot)}</details>
        <details class="utility-drawer"><summary>Session tools</summary><div class="utility-content">
          <p><strong>${escapeHtml(activeBinding?.label ?? '')}</strong><br><span class="supporting">Acting player: ${escapeHtml(sequence?.actingPlayerId ?? '–')}</span></p>
          <button class="wide" id="begin-handoff" ${otherBinding && lifecycle !== 'READY' ? '' : 'disabled'}>Hand off to ${escapeHtml(otherBinding?.label ?? 'next seat')}</button>
          <div class="button-grid"><button id="save-game">Download save</button><button id="load-game">Load save</button></div>
          <input id="save-file" type="file" accept="application/json,.json" hidden>
          <button class="wide" id="create-checkpoint">Create checkpoint</button>
          <div class="checkpoint-list">${checkpoints || '<p class="empty-state">No checkpoints yet.</p>'}</div>
          <p class="supporting">Seeds: map ${currentGame.request.seeds.map}, OOB ${currentGame.request.seeds.oob}, deployment ${currentGame.request.seeds.deployment}, rules ${currentGame.request.seeds.rules}.</p>
        </div></details>
        <div class="notice" role="status" aria-live="polite">${escapeHtml(snapshot.notice)}</div>
      </aside>

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
  bindEvents(snapshot);
};

const activateKeyboard = (selector: string, callback: (element: HTMLElement) => void): void => {
  root.querySelectorAll<HTMLElement>(selector).forEach((element) => element.addEventListener('keydown', (event) => {
    if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); callback(element); }
  }));
};

const updateCamera = (): void => {
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
  $('#execute-action')?.addEventListener('click', () => void controller.executeSelected());
  $('#zoom-in')?.addEventListener('click', () => zoom(1.2));
  $('#zoom-out')?.addEventListener('click', () => zoom(1 / 1.2));
  $('#zoom-reset')?.addEventListener('click', () => { camera.zoom = 1; camera.x = 0; camera.y = 0; updateCamera(); });

  root.querySelectorAll<HTMLElement>('[data-hex]').forEach((element) => element.addEventListener('click', (event) => {
    event.stopPropagation(); controller.selectHex(element.dataset.hex ?? null);
  }));
  root.querySelectorAll<HTMLElement>('[data-piece]').forEach((element) => element.addEventListener('click', (event) => {
    event.stopPropagation();
    if (element.dataset.hex) controller.selectHex(element.dataset.hex);
    controller.selectPiece(element.dataset.piece ?? null);
  }));
  activateKeyboard('.hex-cell[data-hex]', (element) => controller.selectHex(element.dataset.hex ?? null));
  activateKeyboard('[data-piece]', (element) => controller.selectPiece(element.dataset.piece ?? null));
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

  $('#new-game-form')?.addEventListener('submit', (event) => {
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
    const prepared = newGameOrchestrator.prepare(newGameSettings);
    if (prepared.ok) newGamePreview = prepared.value;
    else {
      newGamePreview = null;
      newGameError = prepared.error.map(({ stage, message }) => `${stage}: ${message}`).join(' ');
    }
    render(snapshot);
  });
  $('#new-game-form')?.addEventListener('change', () => {
    newGamePreview = null;
    const start = root.querySelector<HTMLButtonElement>('#start-previewed-game');
    if (start) {
      start.disabled = true;
      start.textContent = 'Rebuild preview to start';
    }
    root.querySelector('.operation-preview-content')?.classList.add('is-stale');
    const status = root.querySelector<HTMLElement>('.new-game-submit strong');
    const supporting = root.querySelector<HTMLElement>('.new-game-submit p');
    if (status) status.textContent = 'Preview invalidated';
    if (supporting) supporting.textContent = 'Options changed. Build a fresh Map, OOB and deployment package.';
  });
  $('#start-previewed-game')?.addEventListener('click', () => {
    if (newGameBusy || !newGamePreview) return;
    newGameBusy = true;
    newGameError = '';
    const request = newGamePreview.request;
    render(snapshot);
    void newGameOrchestrator.create(request).then(async (created) => {
      if (created.ok) await mountCreatedGame(created.value);
      else {
        newGameBusy = false;
        newGameError = created.error.map(({ stage, message }) => `${stage}: ${message}`).join(' ');
        render(controller.getSnapshot());
      }
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
    render(snapshot);
  });

  const map = $<SVGSVGElement>('#hex-map');
  map?.addEventListener('wheel', (event: WheelEvent) => { event.preventDefault(); zoom(event.deltaY < 0 ? 1.12 : 1 / 1.12); }, { passive: false });
  map?.addEventListener('pointerdown', (event: PointerEvent) => {
    if ((event.target as Element).closest('.counter')) return;
    dragging = { x: event.clientX, y: event.clientY, cameraX: camera.x, cameraY: camera.y };
    map.setPointerCapture(event.pointerId);
  });
  map?.addEventListener('pointermove', (event: PointerEvent) => {
    if (!dragging) return;
    const scale = layout.width / Math.max(1, map.getBoundingClientRect().width);
    camera.x = dragging.cameraX + (event.clientX - dragging.x) * scale;
    camera.y = dragging.cameraY + (event.clientY - dragging.y) * scale;
    updateCamera();
  });
  map?.addEventListener('pointerup', () => { dragging = null; });
}

unsubscribeController = controller.subscribe(render);
