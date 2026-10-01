import type { ProjectedPiece } from '../rules/index.js';
import type { UiSnapshot } from './model.js';
import { counterSvg, counterView } from './counter.js';
import { actionKindLabel, phaseLabel, pieceDefinition, pieceLabel, printedHexLabel } from './presenter.js';

export type DeckList = 'units' | 'stack' | 'history';
export interface DeckState { list: DeckList; search: string; working: boolean; error?: string; hint?: string; }

const esc = (value: unknown): string => String(value).replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;').replaceAll('"', '&quot;').replaceAll("'", '&#039;');
const mp = (ticks: unknown): string => typeof ticks === 'number' ? `${Math.round(ticks / 4 * 100) / 100}` : '–';
const fact = (snapshot: { readonly facts: readonly { readonly key: string; readonly value: unknown }[] } | null | undefined, key: string) =>
  snapshot?.facts.find((entry) => entry.key === key)?.value;

const counterFor = (snapshot: UiSnapshot, piece: ProjectedPiece): string => {
  const definition = pieceDefinition(snapshot.scenario, piece);
  return definition ? counterSvg(counterView(definition, piece)) : '';
};

const isAir = (snapshot: UiSnapshot, piece: ProjectedPiece): boolean => pieceDefinition(snapshot.scenario, piece)?.family === 'AIR';
const isAirBase = (snapshot: UiSnapshot, piece: ProjectedPiece): boolean => pieceDefinition(snapshot.scenario, piece)?.facility?.facilityTypeDefinitionId === 'facility:air-base';

/** Status word under a unit name: mode for ground units, Active/Inactive for aircraft (14.1a), Level for bases. */
const statusName = (snapshot: UiSnapshot, piece: ProjectedPiece): string => {
  if (isAir(snapshot, piece)) return `${piece.statuses.includes('status:air-inactive') ? 'Inactive' : 'Active'}${piece.remainingSteps === 1 ? ' · reduced' : ''}`;
  if (isAirBase(snapshot, piece)) {
    const level = piece.statusValues.find(({ statusDefinitionId }) => statusDefinitionId === 'status:air-base-level')?.value;
    return `Air Base Level ${level ?? 1}`;
  }
  return modeName(piece.mode);
};

const modeName = (mode: string | null): string => mode === null ? 'Supply' : ({
  COMBAT: 'Combat mode', MOVE: 'Move mode', RESERVE: 'Reserve', STRAT: 'Strat mode', DG: 'Disorganized', EXPLOITATION: 'Exploit',
} as Record<string, string>)[mode] ?? mode;

const pieceHex = (piece: ProjectedPiece): string => piece.location.kind === 'ON_MAP' ? printedHexLabel(piece.location.hexId) : 'off map';

/** Replace raw Hex IDs ("q,r") in engine text with printed Hex numbers. */
const withHexLabels = (text: string): string => text.replace(/-?\d+,-?\d+/gu, (hexId) => printedHexLabel(hexId));

const statusValue = (piece: ProjectedPiece, id: string): string | number | undefined =>
  piece.statusValues.find(({ statusDefinitionId }) => statusDefinitionId === id)?.value;

/** Supply details a player sees on his own unit: internal stocks (12.10), truck size and load (13.2). */
const supplyDetails = (snapshot: UiSnapshot, piece: ProjectedPiece): string => {
  const parts: string[] = [];
  const stocks = statusValue(piece, 'status:internal-stocks');
  if (stocks === 'LOW') parts.push('Internal stocks Low');
  if (stocks === 'EXHAUSTED') parts.push('Internal stocks Exhausted');
  const definition = pieceDefinition(snapshot.scenario, piece);
  if (definition?.counter?.kind === 'TRANSPORT') {
    const points = statusValue(piece, 'status:transport-points') ?? definition.counter.transportPoints ?? 0;
    const load = (snapshot.view.projection?.stacks ?? []).filter(({ location }) => location.kind === 'CONTAINER' && location.containerId === piece.id)
      .flatMap(({ pieces }) => pieces).reduce((total, cargo) => total + (cargo.resourceQuantity ?? 0), 0);
    parts.push(piece.currentFaceId === 'extender' ? 'Extender (trace supply source)' : `${points} truck point${points === 1 ? '' : 's'} · load ${load}/${Number(points) * 4}T`);
  }
  if (definition?.family === 'RESOURCE') parts.push(`${piece.resourceQuantity ?? 0}T (${(piece.resourceQuantity ?? 0) / 4} SP)`);
  return parts.join(' · ');
};

const unitRow = (snapshot: UiSnapshot, piece: ProjectedPiece, extra = ''): string => `<button class="deck-unit ${piece.id === snapshot.selection.pieceId ? 'is-selected' : ''}" data-piece="${esc(piece.id)}"${piece.location.kind === 'ON_MAP' ? ` data-hex="${esc(piece.location.hexId)}"` : ''}>
    ${counterFor(snapshot, piece)}<span>${esc(pieceLabel(snapshot.scenario, piece))}<small>${esc(pieceHex(piece))} · ${esc(statusName(snapshot, piece))}${piece.statuses.includes('status:out-of-supply') ? ' · Out of supply' : ''}${supplyDetails(snapshot, piece) ? ` · ${esc(supplyDetails(snapshot, piece))}` : ''}${extra}</small></span></button>`;

const selectedCard = (snapshot: UiSnapshot): string => {
  const piece = snapshot.selectedPiece;
  if (!piece) {
    const hex = snapshot.selection.hexId;
    return `<div><h2>${hex ? `Hex ${esc(printedHexLabel(hex))}` : 'No unit selected'}</h2><p>Click one of your units on the map. Its legal moves light up, and enemy stacks you can attack get a red ring.</p></div>`;
  }
  const own = piece.ownerId === snapshot.view.playerId;
  if (isAir(snapshot, piece) || isAirBase(snapshot, piece)) {
    const step = pieceDefinition(snapshot.scenario, piece)?.faces[0]?.steps.find(({ remainingSteps }) => remainingSteps === (piece.remainingSteps ?? 2));
    return `${counterFor(snapshot, piece)}<div><strong>${esc(pieceLabel(snapshot.scenario, piece))}</strong>
      <p>${esc(pieceHex(piece))} · ${esc(statusName(snapshot, piece))}</p>
      <small>${isAir(snapshot, piece) ? `Range ${step?.range ?? '–'} hexes · flies missions from its Air Base (14.2)` : 'Holds 4 + Level Active aircraft; refits 2 × Level for 1T (15.0-15.1)'}</small></div>`;
  }
  const needsFuel = own && snapshot.unitActions.some(({ group }) => group === 'FUEL') && snapshot.reachable.size === 0;
  const details = own ? supplyDetails(snapshot, piece) : '';
  return `${counterFor(snapshot, piece)}<div><strong>${esc(pieceLabel(snapshot.scenario, piece))}</strong>
    <p>${esc(pieceHex(piece))} · ${esc(modeName(piece.mode))}${details ? ` · ${esc(details)}` : ''}</p>
    <small>${own ? (needsFuel ? 'Needs fuel before it can move (12.5)' : snapshot.reachable.size > 0 ? `${snapshot.reachable.size} hexes reachable` : 'Cannot move now') : 'Enemy · steps lost and internal stocks are hidden'}${piece.statuses.includes('status:out-of-supply') ? ' · Out of supply' : ''}</small></div>`;
};

const explanationBlock = (explanation: NonNullable<UiSnapshot['movePreview']>['explanation'] | null): string => {
  if (!explanation || explanation.allowed) return '';
  return `<ul class="rule-blockers">${explanation.reasons.filter(({ allowed }) => !allowed).map(({ message, rule }) => `<li>${esc(message)} <cite>${esc(rule)}</cite></li>`).join('')}</ul>`;
};

const draftPanel = (snapshot: UiSnapshot): string => {
  const draft = snapshot.draft!;
  const units = draft.eligibleIds.map((id) => snapshot.view.projection?.stacks.flatMap(({ pieces }) => pieces).find((piece) => piece.id === id)).filter((piece): piece is ProjectedPiece => piece !== undefined);
  const facts = draft.explanation;
  const title = draft.kind === 'BARRAGE' ? 'Barrage' : draft.kind === 'OVERRUN' ? 'Overrun' : 'Attack';
  const rows = draft.kind === 'BARRAGE'
    ? `<dl class="combat-facts"><div><dt>Barrage strength</dt><dd>${esc(fact(facts, 'barrage.strength') ?? '–')}</dd></div>
        <div><dt>Shifts</dt><dd>${esc(fact(facts, 'barrage.shifts') || 'none')}</dd></div>
        <div><dt>Spotter</dt><dd>${fact(facts, 'barrage.spotter') ? 'yes' : 'none (3 left)'}</dd></div>
        <div><dt>Supply</dt><dd>${esc(fact(facts, 'barrage.supplyTokens') ?? '–')}T</dd></div></dl>`
    : `<dl class="combat-facts"><div><dt>Strength</dt><dd>${esc(fact(facts, 'combat.attackerStrength') ?? '–')} : ${esc(fact(facts, 'combat.defenderStrength') ?? '?')}</dd></div>
        <div><dt>Odds</dt><dd>${esc(fact(facts, 'combat.odds') ?? '–')} (${esc(String(fact(facts, 'combat.line') ?? '').replace('_', ' ').toLowerCase())})</dd></div>
        <div><dt>If defender withholds supply</dt><dd>${esc(fact(facts, 'combat.oddsUnsupplied') ?? '–')}</dd></div>
        <div><dt>AR DRM</dt><dd>${esc(fact(facts, 'combat.attackerActionRating') ?? '–')} − ${esc(fact(facts, 'combat.defenderActionRating') ?? '?')} = ${esc(fact(facts, 'combat.drm') ?? '–')}</dd></div>
        <div><dt>Your supply cost</dt><dd>${esc(fact(facts, 'combat.attackerSupplyTokens') ?? '–')}T</dd></div></dl>`;
  const participants = units.map((piece) => {
    const checked = draft.selectedIds.includes(piece.id);
    return `<label class="participant"><input type="checkbox" data-participant="${esc(piece.id)}" ${checked ? 'checked' : ''}>
      ${counterFor(snapshot, piece)}<span>${esc(pieceLabel(snapshot.scenario, piece))}<small>${esc(pieceHex(piece))}</small></span>
      ${draft.kind !== 'BARRAGE' && checked ? `<input type="radio" name="lead" data-lead="${esc(piece.id)}" ${draft.leadId === piece.id ? 'checked' : ''} aria-label="Lead with this unit's Action Rating">` : ''}</label>`;
  }).join('');
  return `<section class="deck-context combat-draft" aria-label="${title} plan">
    <h2>${title} ${esc(printedHexLabel(draft.targetHexId))}</h2>
    ${rows}
    <p class="hint">${draft.kind === 'BARRAGE' ? 'Tick the artillery that fires.' : 'Tick the units that attack; the radio button picks the unit whose Action Rating leads.'}</p>
    <div class="participants">${participants || '<p>No eligible units.</p>'}</div>
    ${explanationBlock(facts)}
    <div class="button-grid"><button id="cancel-draft">Cancel</button><button class="primary" id="declare-draft" ${facts?.allowed && !snapshot.busy ? '' : 'disabled'}>${title}</button></div>
  </section>`;
};

const airMissionSummary = (snapshot: UiSnapshot): string => {
  const air = snapshot.view.projection?.combat?.air;
  if (!air) return '';
  return `<div class="combat-summary"><strong>${esc(air.mission)} · ${esc(printedHexLabel(snapshot.view.projection!.combat!.targetHexId))}</strong>
    <ol class="air-log">${air.log.map((line) => `<li>${esc(withHexLabels(line))}</li>`).join('')}</ol></div>`;
};

const pieceById = (snapshot: UiSnapshot, id: string): ProjectedPiece | undefined =>
  snapshot.view.projection?.stacks.flatMap(({ pieces }) => pieces).find((piece) => piece.id === id);

const airDraftPanel = (snapshot: UiSnapshot): string => {
  const draft = snapshot.air.draft!;
  const facts = draft.explanation;
  if (!draft.targetHexId) {
    return `<section class="deck-context air-panel" aria-label="${esc(draft.label)} plan"><h2>${esc(draft.label)}</h2>
      <p class="hint">${snapshot.air.targetHexes.length > 0 ? `Click one of the ${snapshot.air.targetHexes.length} highlighted hexes to choose the mission hex.` : 'No target is in range of a ready aircraft.'}</p>
      <div class="button-grid"><button id="cancel-air-mission">Cancel</button></div></section>`;
  }
  const targetChoice = draft.targetOptions.length > 1
    ? `<div class="chip-row" role="group" aria-label="Barrage target">${draft.targetOptions.map((target) => `<button data-air-target="${target}" aria-pressed="${draft.target === target}">${target === 'AIR_BASE' ? 'Air Base (Facility Table)' : 'Combat units'}</button>`).join('')}</div>` : '';
  const aircraft = draft.eligibleIds.map((id) => {
    const piece = pieceById(snapshot, id);
    if (!piece) return '';
    return `<label class="participant"><input type="${draft.maximum === 1 ? 'radio' : 'checkbox'}" name="air-aircraft" data-air-aircraft="${esc(id)}" ${draft.selectedIds.includes(id) ? 'checked' : ''}>
      ${counterFor(snapshot, piece)}<span>${esc(pieceLabel(snapshot.scenario, piece))}<small>${esc(pieceHex(piece))}</small></span></label>`;
  }).join('');
  const rows = [
    ['Mission hex', printedHexLabel(draft.targetHexId)],
    ...(fact(facts, 'air.finalColumn') !== undefined ? [['Table column', `${fact(facts, 'air.initialColumn') ?? ''}${fact(facts, 'air.initialColumn') ? ' → ' : ''}${fact(facts, 'air.finalColumn')}`]] : []),
    ...(fact(facts, 'air.shifts') ? [['Shifts', fact(facts, 'air.shifts')]] : []),
    ...(['BARRAGE', 'HIP_SHOOT', 'TRAINBUSTING'].includes(draft.mission) ? [['Barrage strength', fact(facts, 'air.strength') ?? '–']] : []),
    ['Flak', fact(facts, 'air.flakSubject') ? `+${fact(facts, 'air.flakModifier') ?? 0}${fact(facts, 'air.flakReasons') ? ` (${fact(facts, 'air.flakReasons')})` : ''}; 11+ on 2d6 costs a step` : 'not rolled for this mission'],
    ['Enemy Patrol Zone', !fact(facts, 'air.enemyPatrolZone') ? 'no' : fact(facts, 'air.flakSubject') ? 'yes: an enemy Fighter may intercept' : 'yes (this mission cannot be intercepted)'],
  ];
  return `<section class="deck-context air-panel combat-draft" aria-label="${esc(draft.label)} plan">
    <h2>${esc(draft.label)} ${esc(printedHexLabel(draft.targetHexId))}</h2>${targetChoice}
    <dl class="combat-facts">${rows.map(([label, value]) => `<div><dt>${esc(label)}</dt><dd>${esc(value)}</dd></div>`).join('')}</dl>
    <p class="hint">${draft.maximum === 1 ? 'Choose the aircraft that flies.' : `Tick up to ${draft.maximum} aircraft; they may come from different bases.`} Every mission aircraft becomes Inactive at a base afterwards${draft.mission === 'BASE_TRANSFER' ? ' (a Fighter staying within range stays Active)' : ''}.</p>
    <div class="participants">${aircraft || '<p>No eligible aircraft.</p>'}</div>
    ${explanationBlock(facts)}
    <div class="button-grid"><button id="cancel-air-mission">Cancel</button><button class="primary" id="declare-air-mission" ${facts?.allowed && !snapshot.busy ? '' : 'disabled'}>Fly ${esc(draft.label)}</button></div>
  </section>`;
};

const refitPanel = (snapshot: UiSnapshot): string => snapshot.air.refits.length === 0 ? '' : `<div class="air-panel"><strong>Aircraft refit</strong>
  <p class="hint">Each Air Base refits once: up to 2 × Level Inactive aircraft for 1T drawn or thrown to the base (15.1).</p>
  ${snapshot.air.refits.map((refit) => `<div class="refit-base"><small>Air Base ${esc(printedHexLabel(refit.hexId))} · up to ${refit.capacity}</small>
    <div class="participants">${refit.inactiveIds.map((id) => { const piece = pieceById(snapshot, id); return piece ? `<label class="participant"><input type="checkbox" data-refit-base="${esc(refit.baseId)}" data-refit-aircraft="${esc(id)}" ${refit.selectedIds.includes(id) ? 'checked' : ''}>${counterFor(snapshot, piece)}<span>${esc(pieceLabel(snapshot.scenario, piece))}</span></label>` : ''; }).join('')}</div>
    ${explanationBlock(refit.explanation)}
    <button class="primary" data-refit="${esc(refit.baseId)}" ${refit.explanation?.allowed && !snapshot.busy ? '' : 'disabled'}>Refit ${refit.selectedIds.length} for 1T</button></div>`).join('')}</div>`;

const airMissionButtons = (snapshot: UiSnapshot): string => snapshot.air.missions.length === 0 ? '' : `<div class="air-panel"><strong>Air missions</strong>
  <div class="chip-row">${snapshot.air.missions.map(({ mission, label, available }) => `<button data-air-mission="${mission}" ${available ? '' : 'disabled'}>${esc(label)}</button>`).join('')}</div></div>`;

const decisionPanel = (snapshot: UiSnapshot): string => {
  const decision = snapshot.decision!;
  const combat = snapshot.view.projection?.combat;
  const summary = combat?.kind === 'AIR_MISSION' ? airMissionSummary(snapshot) : combat ? `<p class="combat-summary">${combat.kind === 'BARRAGE' ? 'Barrage' : combat.kind === 'OVERRUN' ? 'Overrun' : 'Attack'} on ${esc(printedHexLabel(combat.targetHexId))} · ${esc(combat.attackerStrength)}${combat.defenderStrength === null ? '' : ` : ${esc(combat.defenderStrength)}`} · ${esc(combat.odds)}${combat.drm === null ? '' : ` · DRM ${combat.drm >= 0 ? '+' : ''}${combat.drm}`}${combat.result ? ` · <strong>${esc(combat.result)}</strong>` : ''}${combat.rollTotal ? ` (roll ${combat.rollTotal}${combat.shiftDie ? `, surprise ${combat.shiftDie} col` : ''})` : ''}</p>` : '';
  const hexChoice = decision.options.some(({ hexId }) => hexId !== null);
  return `<section class="deck-context decision-panel" aria-label="Decision">
    <p class="eyebrow">YOUR DECISION</p><h2>${esc(withHexLabels(decision.prompt))}</h2>${summary}
    ${hexChoice ? '<p class="hint">Click a highlighted hex on the map, or choose below.</p>' : ''}
    <div class="decision-options">${decision.options.map(({ id, label }) => `<button class="decision-option" data-choice="${esc(id)}">${esc(withHexLabels(label))}</button>`).join('')}</div>
  </section>`;
};

const contextPanel = (snapshot: UiSnapshot, state: DeckState): string => {
  const required = snapshot.view.metadata.lifecycle === 'ACTIVE' && snapshot.requiredSeatId && snapshot.requiredSeatId !== snapshot.view.metadata.activeSeatId;
  if (required) {
    const owner = snapshot.bindings.find(({ seatId }) => seatId === snapshot.requiredSeatId)?.label ?? 'the other player';
    return `<section class="deck-context"><h2>${esc(owner)} to act</h2><p>${snapshot.decisionSeatId ? 'The other player has a decision to make in this combat.' : 'The next step belongs to the other player.'} Hand the screen over when ready.</p>
      <button id="begin-required-handoff" class="primary wide">Hand off to ${esc(owner)}</button></section>`;
  }
  if (snapshot.decision) return decisionPanel(snapshot);
  if (snapshot.draft) return draftPanel(snapshot);
  if (snapshot.air.draft) return airDraftPanel(snapshot);
  const parts: string[] = [refitPanel(snapshot), airMissionButtons(snapshot)].filter(Boolean);
  if (snapshot.movePreview) {
    const preview = snapshot.movePreview;
    const reTicks = (piece: ProjectedPiece): number => Number(pieceDefinition(snapshot.scenario, piece)?.faces
      .find(({ id }) => id === piece.currentFaceId)?.steps.find(({ remainingSteps }) => remainingSteps === piece.remainingSteps)?.regimentalEquivalentTicks ?? 0);
    const already = (snapshot.view.projection?.stacks ?? []).flatMap(({ pieces }) => pieces)
      .filter((piece) => piece.ownerId === snapshot.view.playerId && piece.location.kind === 'ON_MAP' && piece.location.hexId === preview.destinationHexId && piece.id !== snapshot.selectedPiece?.id);
    const total = already.reduce((sum, piece) => sum + reTicks(piece), 0) + (snapshot.selectedPiece ? reTicks(snapshot.selectedPiece) : 0);
    if (total > 40) parts.push(`<p class="blocker">Ending here makes ${total / 4} RE in one hex: over 10 RE at the end of the segment, you must eliminate units (4.8a).</p>`);
    parts.push(`<div class="move-preview"><strong>Move to ${esc(printedHexLabel(preview.destinationHexId))}</strong>
      <p>Cost ${mp(fact(preview.explanation, 'movement.totalTicks'))} MP · ${mp(fact(preview.explanation, 'movement.remainingTicks'))} MP left after the move.</p>
      ${explanationBlock(preview.explanation)}
      <div class="button-grid"><button id="cancel-move">Cancel</button><button class="primary" id="confirm-move" ${preview.explanation.allowed && !snapshot.busy ? '' : 'disabled'}>Confirm move</button></div>
      <small>Tip: click the same hex again to confirm.</small></div>`);
  }
  if (snapshot.modeOptions.length > 0 || snapshot.releaseAction) {
    parts.push(`<div class="mode-actions"><strong>Mode</strong><div class="chip-row">${snapshot.modeOptions.map(({ mode }) => `<button data-mode="${mode}">${esc(modeName(mode))}</button>`).join('')}${snapshot.releaseAction ? '<button id="release-reserve">Release reserve</button>' : ''}</div></div>`);
  }
  if (snapshot.unitActions.length > 0) {
    const groups: [string, string][] = [['FUEL', 'Fuel'], ['SUPPLY', 'Supply'], ['BREAKOUT', 'Breakout'], ['TRANSPORT', 'Trucks'], ['DUMP', 'Dump'], ['AIR', 'Air']];
    parts.push(groups.flatMap(([group, title]) => {
      const entries = snapshot.unitActions.filter((entry) => entry.group === group);
      return entries.length === 0 ? [] : [`<div class="unit-actions"><strong>${title}</strong><div class="action-list">${entries.map(({ key, label }) => `<button data-unit-action="${esc(key)}">${esc(withHexLabels(label))}</button>`).join('')}</div></div>`];
    }).join(''));
  }
  if (snapshot.collapseHexes.length > 0) {
    parts.push('<p class="hint">Or collapse the Extender (9.14d): click a highlighted hex in trace supply within its range.</p>');
  }
  if (snapshot.stepActions.length > 0) {
    const recovery = snapshot.stepActions.filter(({ group }) => group === 'SUPPLY');
    const trace = snapshot.stepActions.filter(({ group }) => group === 'TRACE');
    const breakout = snapshot.stepActions.filter(({ group }) => group === 'BREAKOUT');
    const block = (title: string, hint: string, entries: typeof recovery) => entries.length === 0 ? ''
      : `<div class="step-actions"><strong>${title}</strong><p class="hint">${hint}</p><div class="action-list">${entries.map(({ key, label }) => `<button data-unit-action="${esc(key)}">${esc(withHexLabels(label))}</button>`).join('')}</div></div>`;
    parts.push(block('Recover internal stocks (required first)', 'Units marked Low or Exhausted must recover from dumps in reach before anything else this phase (12.10e).', recovery)
      + block('Formation trace route', 'All units of a division trace through one HQ or one source; the others must eat off the map or go Out of Supply (12.6f).', trace)
      + block('Breakout', 'Units out of trace supply may try to break out: 5-6 they leave and return as reinforcements, 1-4 they are lost (12.8e).', breakout));
  }
  if (snapshot.arrivals.length > 0) {
    const pieces = snapshot.view.projection?.stacks.flatMap(({ pieces: stackPieces }) => stackPieces) ?? [];
    parts.push(`<div class="arrivals"><strong>Reinforcements arriving</strong><p class="hint">Select a unit, then click a highlighted entry hex.</p>${snapshot.arrivals.map(({ pieceId }) => {
      const piece = pieces.find(({ id }) => id === pieceId);
      return piece ? unitRow(snapshot, piece, ' · arriving') : '';
    }).join('')}</div>`);
  }
  if (snapshot.supplyNeeds.length > 0) {
    const pieces = snapshot.view.projection?.stacks.flatMap(({ pieces: stackPieces }) => stackPieces) ?? [];
    parts.push(`<div class="supply-needs"><strong>Out of trace supply</strong><p class="hint">Feed a unit from a dump (1T per 2 RE) or leave it; unfed units become Out of Supply when the phase ends.</p>${snapshot.supplyNeeds.map((need) => {
      const piece = pieces.find(({ id }) => id === need.pieceId);
      if (!piece) return '';
      return `<div class="supply-need">${unitRow(snapshot, piece)}<div class="chip-row">${need.options.map(({ dumpId }) => {
        const dump = pieces.find(({ id }) => id === dumpId);
        return `<button data-feed="${esc(need.pieceId)}" data-dump="${esc(dumpId)}">Feed from ${esc(dump ? pieceHex(dump) : 'dump')}</button>`;
      }).join('')}</div></div>`;
    }).join('')}</div>`);
  }
  if (parts.length === 0) {
    const guidance = snapshot.attackTargets.length > 0 ? 'Red-ringed enemy hexes can be attacked: click one to plan the attack.'
      : snapshot.barrageTargets.length > 0 ? 'Orange-ringed enemy hexes are in artillery range: click one to plan a barrage.'
        : snapshot.selectedPiece && snapshot.reachable.size > 0 ? 'Click a highlighted hex to preview the move.'
          : 'Select a unit, or end this step when you are done.';
    parts.push(`<p class="hint">${esc(state.hint || guidance)}</p>`);
  }
  return `<section class="deck-context">${parts.join('')}</section>`;
};

export const commandDeckHtml = (snapshot: UiSnapshot, state: DeckState): string => {
  const { view } = snapshot;
  const sequence = view.projection?.sequence;
  const busy = state.working || snapshot.busy;
  const pieces = (view.projection?.stacks ?? []).flatMap((stack) => stack.pieces);
  const own = pieces.filter(({ ownerId }) => ownerId === view.playerId);
  const listed = state.list === 'stack'
    ? pieces.filter((piece) => piece.location.kind === 'ON_MAP' && piece.location.hexId === snapshot.selection.hexId)
    : own.filter((piece) => pieceLabel(snapshot.scenario, piece).toLowerCase().includes(state.search.toLowerCase()));
  const hiddenHere = (view.projection?.stacks ?? []).find(({ location }) => location.kind === 'ON_MAP' && location.hexId === snapshot.selection.hexId)?.hiddenCount ?? 0;
  const history = [...snapshot.history].reverse().slice(0, 80).map((record) => `<article class="deck-event"><strong>${esc(actionKindLabel(record.action.kind))}</strong><p>${esc(record.summary)}</p><small>Revision ${record.revisionAfter}</small></article>`).join('');
  const tabs: [DeckList, string][] = [['units', 'My units'], ['stack', 'Hex'], ['history', 'Log']];
  const list = state.list === 'history' ? history || '<p>No actions yet.</p>'
    : `${listed.map((piece) => unitRow(snapshot, piece)).join('') || '<p>No units here.</p>'}${state.list === 'stack' && hiddenHere > 0 ? `<p>${hiddenHere} more enemy unit${hiddenHere === 1 ? '' : 's'} hidden under the top counter.</p>` : ''}`;
  const weather = view.projection?.weather;
  const date = weather?.month ? ` · ${weather.day} ${['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'][weather.month - 1]}` : '';
  const ground = weather ? ` · ${({ DRY: 'Dry ground', MUD: 'Mud', SNOW: 'Snow' } as const)[weather.groundCondition]}` : '';
  return `<header class="deck-phase"><p class="eyebrow">TURN ${sequence?.gameTurn ?? '–'}${esc(date)}${esc(ground)}</p><h1>${esc(sequence ? phaseLabel(sequence.phase, sequence.segment) : view.metadata.lifecycle)}</h1></header>
    <section class="deck-selection" aria-label="Selected unit">${selectedCard(snapshot)}</section>
    ${contextPanel(snapshot, state)}
    <nav class="deck-tabs" aria-label="Lists">${tabs.map(([key, name]) => `<button data-deck-list="${key}" aria-pressed="${state.list === key}">${name}</button>`).join('')}${state.list === 'units' ? `<input id="deck-search" type="search" value="${esc(state.search)}" placeholder="Find unit" aria-label="Find unit">` : ''}</nav>
    <div class="deck-list" data-scroll-key="${state.list}" tabindex="0" aria-busy="${busy}">${list}</div>
    <footer class="deck-footer"><div class="deck-notice" role="status">${busy ? 'Working…' : esc(withHexLabels(state.error || snapshot.notice))}</div>
      ${snapshot.endStep.blockers.length > 0 ? `<p class="blocker">${esc(snapshot.endStep.blockers.join(' '))}</p>` : ''}
      <button id="end-phase" class="wide ${snapshot.endStep.enabled ? 'primary' : ''}" ${snapshot.endStep.enabled && !busy && !snapshot.decision && !snapshot.draft ? '' : 'disabled'}>${esc(snapshot.endStep.label)}</button></footer>`;
};
