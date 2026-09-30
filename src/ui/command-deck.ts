import type { UiSnapshot } from './model.js';
import { counterSvg, counterView } from './counter.js';
import { actionKindLabel, actionSummary, pieceLabel } from './presenter.js';

export type DeckList = 'units' | 'stack' | 'hq' | 'candidates' | 'history';
export interface DeckState { list: DeckList; search: string; working: boolean; error?: string; hint?: string; }
const esc = (value: unknown): string => String(value).replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;').replaceAll('"', '&quot;').replaceAll("'", '&#039;');
export const actionDestination = (action: UiSnapshot['selectedAction']): string | null => {
  if (!action) return null;
  if (action.kind === 'MOVE_PIECE') return action.path.at(-1) ?? null;
  if (action.kind === 'PLACE_REINFORCEMENT') return action.hexId;
  if (action.kind === 'DECLARE_COMBAT' || action.kind === 'DECLARE_BARRAGE') return action.targetHexId;
  return null;
};
export const commandDeckHtml = (snapshot: UiSnapshot, state: DeckState): string => {
  const { scenario, view } = snapshot;
  const pieces = (view.projection?.stacks ?? []).flatMap(stack => stack.pieces.map(piece => ({ piece, hex: stack.location.kind === 'ON_MAP' ? stack.location.hexId : '' })));
  const selected = pieces.find(({ piece }) => piece.id === snapshot.selection.pieceId);
  const definition = selected && scenario.pieceCatalog.definitions.find(({ id }) => id === selected.piece.definitionId);
  const families = snapshot.families.filter(f => f.enabled && f.kind !== 'ADVANCE_SEQUENCE');
  const advance = snapshot.families.some(f => f.enabled && f.kind === 'ADVANCE_SEQUENCE');
  const busy = state.working || snapshot.busy;
  const required = view.metadata.lifecycle === 'ACTIVE' && snapshot.requiredSeatId && snapshot.requiredSeatId !== view.metadata.activeSeatId;
  const owner = snapshot.bindings.find(b => b.seatId === snapshot.requiredSeatId)?.label;
  const action = snapshot.selectedAction?.kind !== 'ADVANCE_SEQUENCE' ? snapshot.selectedAction : null;
  const destination = actionDestination(action);
  const movementCost = snapshot.explanation?.facts.find(f => f.key === 'movement.totalTicks')?.value;
  const movementRemaining = snapshot.explanation?.facts.find(f => f.key === 'movement.remainingTicks')?.value;
  const moveMode = snapshot.selection.actionKind === 'MOVE_PIECE';
  const moveGuide = !moveMode ? '' : selected === undefined
    ? 'Select a unit on the map or in the Units list.'
    : snapshot.candidates.length === 0
      ? 'This unit cannot move now.'
      : `Click a highlighted hex on the map to choose a destination (${snapshot.candidates.length} reachable).`;
  const effect = action?.kind === 'MOVE_PIECE' && typeof movementCost === 'number' && typeof movementRemaining === 'number'
    ? `${action.path[0]} → ${destination} · Cost ${movementCost / 4} MP · ${movementRemaining / 4} MP left`
    : action ? actionSummary(action) : moveGuide || 'Select an action, or end this phase when ready.';
  const friendlySummary = (candidate: NonNullable<UiSnapshot['selectedAction']>): string => {
    const label = 'pieceId' in candidate ? pieces.find(({ piece }) => piece.id === candidate.pieceId) : undefined;
    const name = label ? pieceLabel(scenario, label.piece) : 'Selected unit';
    if (candidate.kind === 'MOVE_PIECE') return `${name} → ${candidate.path.at(-1)}`;
    if (candidate.kind === 'PLACE_REINFORCEMENT') return `${name} → ${candidate.hexId}`;
    if (candidate.kind === 'CHANGE_MODE') return `${name} → ${candidate.mode}`;
    return actionSummary(candidate);
  };
  const tabs: [DeckList, string][] = [['units', 'Units'], ['stack', 'Stack'], ['hq', 'HQ'], ['candidates', 'Choices'], ['history', 'History']];
  const filtered = pieces.filter(({ piece, hex }) => {
    if (state.list === 'stack' && hex !== snapshot.selection.hexId) return false;
    if (state.list === 'hq' && (piece.redacted || scenario.pieceCatalog.definitions.find(d => d.id === piece.definitionId)?.counter?.kind !== 'HQ')) return false;
    return pieceLabel(scenario, piece).toLowerCase().includes(state.search.toLowerCase());
  });
  const unitRows = filtered.map(({ piece, hex }) => `<button class="deck-unit ${piece.id === snapshot.selection.pieceId ? 'is-selected' : ''}" data-piece="${esc(piece.id)}" data-hex="${esc(hex)}">
    ${counterSvg(counterView(scenario.pieceCatalog.definitions.find(d => d.id === piece.definitionId)!, piece))}<span>${esc(pieceLabel(scenario, piece))}<small>${esc(hex ? `Hex ${hex}` : 'Off map')}${piece.redacted ? ' · Details hidden' : ` · ${esc(piece.mode ?? 'Supply')}`}</small></span></button>`).join('');
  const candidates = snapshot.candidates.map((candidate, index) => candidate.kind === 'ADVANCE_SEQUENCE' ? '' : `<button class="candidate ${snapshot.selection.candidateIndex === index ? 'is-selected' : ''}" data-candidate="${index}"><strong>${esc(actionKindLabel(candidate.kind))}${actionDestination(candidate) ? ` · ${esc(actionDestination(candidate))}` : ''}</strong><span>${esc(friendlySummary(candidate))}</span></button>`).join('');
  const history = [...snapshot.history].reverse().map(record => `<article class="deck-event"><strong>${esc(actionKindLabel(record.action.kind))}</strong><p>${esc(record.summary)}</p><small>Revision ${record.revisionAfter}</small></article>`).join('');
  return `<header class="deck-phase"><p class="eyebrow">COMMAND</p><h1>${esc(view.projection?.sequence.phase.replaceAll('_', ' ') ?? view.metadata.lifecycle)}</h1><span>${required ? `Pass to ${esc(owner ?? 'next player')}` : `${families.length} action types available`}</span></header>
    <section class="deck-selection" aria-label="Selected unit">${selected && definition ? `${counterSvg(counterView(definition, selected.piece))}<div><strong>${esc(pieceLabel(scenario, selected.piece))}</strong><p>${esc(selected.hex ? `Hex ${selected.hex}` : 'Off map')}</p><small>${esc(selected.piece.redacted ? 'Enemy details hidden' : selected.piece.mode ?? 'Supply')}</small></div>` : `<div><h2>${snapshot.selection.hexId ? `Hex ${esc(snapshot.selection.hexId)}` : 'Select a unit'}</h2><p>Choose a counter on the map or from the unit list.</p></div>`}</section>
    <div class="deck-actions"><label for="deck-action">Action</label><select id="deck-action" ${busy || required ? 'disabled' : ''}><option value="">Choose an action</option>${families.map(f => `<option value="${f.kind}" ${snapshot.selection.actionKind === f.kind ? 'selected' : ''}>${esc(actionKindLabel(f.kind))}</option>`).join('')}</select></div>
    <nav class="deck-tabs" aria-label="Command lists">${tabs.map(([key, name]) => `<button data-deck-list="${key}" aria-pressed="${state.list === key}">${name}</button>`).join('')}</nav>
    <label class="deck-search">Find unit<input id="deck-search" type="search" value="${esc(state.search)}" placeholder="Name or formation" ${state.list === 'candidates' || state.list === 'history' ? 'disabled' : ''}></label>
    <div class="deck-list" data-scroll-key="${state.list}" tabindex="0" aria-label="${tabs.find(([key]) => key === state.list)?.[1]} list" aria-busy="${busy}">${state.list === 'history' ? history || '<p>No actions yet.</p>' : state.list === 'candidates' && moveMode ? `<p>${esc(moveGuide)}</p>` : state.list === 'candidates' ? (candidates || '<p>No choices for this selection. Choose a different unit or action.</p>') + (snapshot.candidatesTruncated ? '<button id="load-more-candidates" class="wide">Load more choices</button>' : '') : unitRows || '<p>No visible units match this selection.</p>'}</div>
    <section class="deck-consequence"><strong>${action ? esc(actionKindLabel(action.kind)) : moveMode ? 'Move unit' : 'Current phase'}</strong><p>${esc(effect)}</p><button id="open-rule-details" ${snapshot.explanation ? '' : 'disabled'}>Review rules &amp; effects</button></section>
    <footer class="deck-footer"><div class="deck-notice" role="status" title="${esc(state.error || state.hint || snapshot.notice)}">${busy ? 'Preparing action…' : esc(state.error || state.hint || snapshot.notice)}</div><div class="button-grid"><button id="clear-action" ${busy ? 'disabled' : ''}>Clear selection</button><button class="primary" id="execute-action" ${action && snapshot.explanation?.allowed && !busy && !required && !state.error ? '' : 'disabled'}>${busy ? 'Working…' : destination ? `Confirm · ${esc(destination)}` : action ? esc(actionKindLabel(action.kind)) : moveMode ? 'Choose destination' : 'Select action'}</button></div>${required ? `<button id="begin-required-handoff" class="primary wide">Hand off to ${esc(owner ?? 'next player')}</button>` : `<button id="end-phase" class="wide" ${advance && !busy ? '' : 'disabled'}>End phase / segment</button>`}</footer>`;
};
