import {
  createGameplayEngine,
  createMemoryGameplayPorts,
  createRuleConfigurationFixture,
  createRuleGameStateFixture,
  parseSeatId,
  type SeatBinding,
} from '../index.js';
import { createUiController } from './controller.js';
import type { UiSnapshot } from './model.js';
import {
  actionKindLabel,
  actionSummary,
  layoutHexMap,
  pieceLabel,
} from './presenter.js';

const root = document.querySelector<HTMLElement>('#app') ?? (() => {
  throw new Error('UI root was not found.');
})();

const escapeHtml = (value: unknown): string => String(value)
  .replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;')
  .replaceAll('"', '&quot;').replaceAll("'", '&#039;');

const mustSeat = (value: string) => {
  const parsed = parseSeatId(value);
  if (!parsed.ok) throw new Error(parsed.error.message);
  return parsed.value;
};

const scenario = createRuleGameStateFixture().scenario;
const bindings: readonly SeatBinding[] = scenario.players.map((player, index) => ({
  seatId: mustSeat(`seat:ui:${index + 1}`), playerId: player.id, label: player.name,
}));
const engine = createGameplayEngine(createMemoryGameplayPorts([scenario]));
const session = await engine.createSession({
  scenario,
  configuration: createRuleConfigurationFixture(),
  rulesSeed: 0x12345678,
  bindings,
  label: 'OCS synthetic UI scenario',
});
const controller = createUiController({ engine, session, scenario, bindings });
const layout = layoutHexMap(scenario);

const camera = { zoom: 1, x: 0, y: 0 };
let dragging: { x: number; y: number; cameraX: number; cameraY: number } | null = null;

const onMapStacks = (snapshot: UiSnapshot) => new Map(
  (snapshot.view.projection?.stacks ?? [])
    .filter((stack) => stack.location.kind === 'ON_MAP')
    .map((stack) => [stack.location.kind === 'ON_MAP' ? stack.location.hexId : '', stack]),
);

const renderMap = (snapshot: UiSnapshot): string => {
  const stacks = onMapStacks(snapshot);
  return layout.cells.map((cell) => {
    const stack = stacks.get(cell.id);
    const selected = snapshot.selection.hexId === cell.id ? ' is-selected' : '';
    const counters = (stack?.pieces ?? []).map((piece, index) => {
      const ownerIndex = scenario.players.findIndex(({ id }) => id === piece.ownerId);
      const x = cell.x - 25 + Math.min(index, 2) * 10;
      const y = cell.y - 29 - Math.min(index, 2) * 8;
      const pieceSelected = snapshot.selection.pieceId === piece.id ? ' is-selected' : '';
      const label = pieceLabel(scenario, piece);
      return `<g class="counter owner-${ownerIndex + 1}${pieceSelected}" transform="translate(${x} ${y})"
        role="button" tabindex="0" data-piece="${escapeHtml(piece.id)}" data-hex="${escapeHtml(cell.id)}"
        aria-label="${escapeHtml(`${label}, ${cell.id}, ${piece.mode ?? 'no mode'}, ${piece.remainingSteps ?? 'unknown'} steps`)}">
        <rect width="50" height="42" rx="5"></rect>
        <text class="counter-name" x="25" y="17" text-anchor="middle">${escapeHtml(label.slice(0, 8))}</text>
        <text class="counter-stats" x="25" y="33" text-anchor="middle">${escapeHtml(piece.redacted ? '?' : `${piece.remainingSteps ?? '–'} · ${piece.mode?.slice(0, 3) ?? '–'}`)}</text>
      </g>`;
    }).join('');
    const hidden = (stack?.hiddenCount ?? 0) > 0
      ? `<text class="hidden-count" x="${cell.x + 30}" y="${cell.y - 30}">+${stack!.hiddenCount}</text>` : '';
    return `<g class="hex-cell${selected}" role="button" tabindex="0" data-hex="${escapeHtml(cell.id)}"
      aria-label="Hex ${escapeHtml(cell.id)}, ${escapeHtml(cell.terrain)}">
      <polygon points="${cell.points}"></polygon>
      <text class="hex-coordinate" x="${cell.x}" y="${cell.y + 41}" text-anchor="middle">${escapeHtml(cell.id)}</text>
      <text class="terrain-label" x="${cell.x}" y="${cell.y - 34}" text-anchor="middle">${escapeHtml(cell.terrain)}</text>
      ${counters}${hidden}
    </g>`;
  }).join('');
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
  const familyButtons = snapshot.families.map((family) => `
    <button class="action-family ${snapshot.selection.actionKind === family.kind ? 'is-selected' : ''}"
      data-action-kind="${family.kind}" ${family.enabled ? '' : 'disabled'}>
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
    <div class="candidate-list">${candidates || '<p class="empty-state">No candidates for this selection.</p>'}</div>
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

const render = (snapshot: UiSnapshot): void => {
  const projection = snapshot.view.projection;
  const sequence = projection?.sequence;
  const activeBinding = snapshot.bindings.find(({ seatId }) => seatId === snapshot.view.metadata.activeSeatId);
  const otherBinding = snapshot.bindings.find(({ seatId }) => seatId !== snapshot.view.metadata.activeSeatId);
  const lifecycle = snapshot.view.metadata.lifecycle;
  const checkpoints = snapshot.checkpoints.map((checkpoint) => `
    <button class="checkpoint" data-checkpoint="${escapeHtml(checkpoint.id)}">${escapeHtml(checkpoint.label || checkpoint.id)} · R${checkpoint.revision}</button>`).join('');
  root.innerHTML = `
    <div class="app-shell">
      <header class="topbar">
        <a class="brand" href="#map-title" aria-label="OCS command map"><span class="brand-mark">OCS</span><span>Operational Command</span></a>
        <div class="turn-strip" aria-label="Current turn state">
          <span><small>TURN</small><strong>${sequence?.gameTurn ?? '–'}</strong></span>
          <span><small>PHASE</small><strong>${escapeHtml(sequence?.phase ?? lifecycle)}</strong></span>
          <span><small>SEGMENT</small><strong>${escapeHtml(sequence?.segment ?? '–')}</strong></span>
          <span><small>REVISION</small><strong>${snapshot.view.stateRevision}</strong></span>
        </div>
        <div class="seat-badge"><span class="status-dot"></span><div><small>ACTIVE SEAT</small><strong>${escapeHtml(activeBinding?.label ?? snapshot.view.playerId)}</strong></div></div>
      </header>

      <aside class="command-rail" aria-label="Session controls">
        <section><p class="eyebrow">SESSION</p><h1>${escapeHtml(snapshot.view.metadata.label)}</h1>
          <div class="lifecycle"><span>${escapeHtml(lifecycle)}</span><small>${escapeHtml(snapshot.view.metadata.rulesVersion)}</small></div>
          <div class="button-grid">
            <button class="primary" id="start-session" ${lifecycle === 'READY' ? '' : 'disabled'}>Start</button>
            <button id="toggle-pause" ${lifecycle === 'ACTIVE' || lifecycle === 'PAUSED' ? '' : 'disabled'}>${lifecycle === 'PAUSED' ? 'Resume' : 'Pause'}</button>
          </div>
        </section>
        <section><p class="eyebrow">HOT-SEAT</p><h2>${escapeHtml(activeBinding?.label ?? '')}</h2>
          <p class="supporting">Acting player: ${escapeHtml(sequence?.actingPlayerId ?? '–')}</p>
          <button class="wide" id="begin-handoff" ${otherBinding && lifecycle !== 'READY' ? '' : 'disabled'}>Hand off to ${escapeHtml(otherBinding?.label ?? 'next seat')}</button>
        </section>
        <section><p class="eyebrow">SAVE & RECOVERY</p>
          <div class="button-grid"><button id="save-game">Download save</button><button id="load-game">Load save</button></div>
          <input id="save-file" type="file" accept="application/json,.json" hidden>
          <button class="wide" id="create-checkpoint">Create checkpoint</button>
          <div class="checkpoint-list">${checkpoints || '<p class="empty-state">No checkpoints yet.</p>'}</div>
        </section>
        <div class="notice" role="status" aria-live="polite">${escapeHtml(snapshot.notice)}</div>
      </aside>

      <main class="workspace">
        <section class="map-card" aria-labelledby="map-title">
          <div class="map-toolbar"><div><p class="eyebrow">SYNTHETIC THEATER</p><h2 id="map-title">Command map</h2></div>
            <div class="map-controls" aria-label="Map zoom controls"><button id="zoom-out" aria-label="Zoom out">−</button><output id="zoom-level">${Math.round(camera.zoom * 100)}%</output><button id="zoom-in" aria-label="Zoom in">+</button><button id="zoom-reset">Reset</button></div>
          </div>
          <div class="map-viewport" id="map-viewport">
            <svg id="hex-map" viewBox="0 0 ${layout.width} ${layout.height}" role="img" aria-label="Hex map; use arrow-free pointer pan and zoom controls">
              <g id="map-camera" transform="translate(${camera.x} ${camera.y}) scale(${camera.zoom})">${renderMap(snapshot)}</g>
            </svg>
            <div class="map-legend"><span class="legend-chip owner-1">Player one</span><span class="legend-chip owner-2">Player two</span><span>Wheel to zoom · drag to pan</span></div>
          </div>
        </section>
        <section class="panel stack-panel" aria-labelledby="stack-title"><div class="panel-heading"><div><p class="eyebrow">INSPECT</p><h2 id="stack-title">Stack ${escapeHtml(snapshot.selection.hexId ?? '')}</h2></div></div>${selectedStackHtml(snapshot)}</section>
      </main>

      <aside class="detail-rail">${actionPanelHtml(snapshot)}${historyHtml(snapshot)}</aside>
    </div>${decisionHtml(snapshot)}${privacyHtml(snapshot)}`;
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

function bindEvents(snapshot: UiSnapshot): void {
  const $ = <T extends Element>(selector: string) => root.querySelector<T>(selector);
  $('#start-session')?.addEventListener('click', controller.start);
  $('#toggle-pause')?.addEventListener('click', controller.togglePause);
  $('#begin-handoff')?.addEventListener('click', controller.beginHandoff);
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
    const blob = new Blob([controller.serializeSave()], { type: 'application/json' });
    const anchor = document.createElement('a');
    anchor.href = URL.createObjectURL(blob);
    anchor.download = `ocs-${snapshot.view.metadata.id}.json`;
    anchor.click();
    URL.revokeObjectURL(anchor.href);
  });
  $('#load-game')?.addEventListener('click', () => $('#save-file')?.dispatchEvent(new MouseEvent('click')));
  $('#save-file')?.addEventListener('change', (event) => {
    const file = (event.currentTarget as HTMLInputElement).files?.[0];
    if (file) void file.text().then((text) => controller.loadSave(text));
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

controller.subscribe(render);
