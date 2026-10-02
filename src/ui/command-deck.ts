import type { ProjectedPiece } from '../rules/index.js';
import type { UiSnapshot } from './model.js';
import { counterSvg, counterView } from './counter.js';
import { combatHeadline, combatOutlook, type CombatReport, type FeedEntry, type NarrativeContext } from './narrative.js';
import { phaseLabel, pieceDefinition, pieceLabel, printedHexLabel } from './presenter.js';

export type UnitFilter = 'all' | 'unmoved' | 'moved';
export interface DeckState {
  /** The tab the player picked, valid only for the phase it was picked in. */
  tab?: { readonly key: string; readonly id: string } | undefined;
  /** Unit selected when the deck was last drawn, to notice a new pick. */
  lastPiece?: string | null;
  search: string;
  working: boolean;
  error?: string;
  hint?: string;
  filter?: UnitFilter;
  /** The End button was pressed once while units had not moved; the next press confirms. */
  confirmEnd?: boolean;
}

const esc = (value: unknown): string => String(value).replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;').replaceAll('"', '&quot;').replaceAll("'", '&#039;');
const mp = (ticks: unknown): string => typeof ticks === 'number' ? `${Math.round(ticks / 4 * 100) / 100}` : '–';
const fact = (snapshot: { readonly facts: readonly { readonly key: string; readonly value: unknown }[] } | null | undefined, key: string) =>
  snapshot?.facts.find((entry) => entry.key === key)?.value;
const percent = (value: number): string => `${Math.round(value * 100)}%`;

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

const pieceHex = (piece: ProjectedPiece): string => piece.location.kind === 'ON_MAP' ? printedHexLabel(piece.location.hexId)
  : piece.location.kind === 'ELIMINATED' ? 'eliminated' : 'off map';

/** Replace raw Hex IDs ("q,r") in engine text with printed Hex numbers. */
export const withHexLabels = (text: string): string => text.replace(/-?\d+,-?\d+/gu, (hexId) => printedHexLabel(hexId));

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

const badges = (snapshot: UiSnapshot, piece: ProjectedPiece): string => {
  const list: [string, string][] = [];
  if (snapshot.movedThisPhase.has(String(piece.id))) list.push(['moved', 'Moved']);
  if (snapshot.attackedThisPhase.has(String(piece.id))) list.push(['attacked', 'Attacked']);
  if (piece.statuses.includes('status:out-of-supply')) list.push(['oos', 'Out of supply']);
  if (piece.mode === 'DG') list.push(['dg', 'DG']);
  return list.length === 0 ? '' : `<span class="badges">${list.map(([kind, text]) => `<em class="badge badge-${kind}">${text}</em>`).join('')}</span>`;
};

const unitRow = (snapshot: UiSnapshot, piece: ProjectedPiece, extra = ''): string => `<button class="deck-unit ${piece.id === snapshot.selection.pieceId ? 'is-selected' : ''}" data-piece="${esc(piece.id)}"${piece.location.kind === 'ON_MAP' ? ` data-hex="${esc(piece.location.hexId)}"` : ''} aria-label="${esc(`${pieceLabel(snapshot.scenario, piece)}, ${pieceHex(piece)}`)}">
    <span class="deck-unit-art" aria-hidden="true">${counterFor(snapshot, piece)}</span><span>${esc(pieceLabel(snapshot.scenario, piece))}<small>${esc(pieceHex(piece))} · ${esc(statusName(snapshot, piece))}${supplyDetails(snapshot, piece) ? ` · ${esc(supplyDetails(snapshot, piece))}` : ''}${extra}</small>${badges(snapshot, piece)}</span></button>`;

/** What the current step asks of the player, in one sentence. */
export const stepObjective = (snapshot: UiSnapshot): string => {
  const sequence = snapshot.view.projection?.sequence;
  if (!sequence) return '';
  if (snapshot.view.metadata.lifecycle === 'PAUSED') return 'The game is paused. Resume to continue playing.';
  if (snapshot.view.metadata.lifecycle === 'FINISHED') return 'The operation has ended.';
  if (sequence.segment === 'BREAKOUT') return 'Units out of trace supply may attempt a breakout (12.8e); otherwise finish this segment.';
  if (sequence.segment === 'BARRAGE') return snapshot.barrageTargets.length > 0 ? 'Orange-ringed enemy hexes are in artillery range: click one to plan a barrage.' : 'No barrage targets in range.';
  switch (sequence.phase) {
    case 'REINFORCEMENT': return snapshot.arrivals.length > 0 ? 'Place every arriving unit: select it, then click a blue entry hex.' : 'All reinforcements are placed.';
    case 'MOVEMENT': return 'Move units one at a time: select a unit to see its range. Red rings mark overrun targets.';
    case 'SUPPLY': return 'Pick formation trace routes and feed units out of trace supply; unfed units become Out of Supply when the phase ends (12.6).';
    case 'REACTION': return 'Only released Reserves may move (half MA) and attack by overrun (7.0).';
    case 'COMBAT': return snapshot.attackTargets.length > 0 ? 'Click a red-ringed enemy hex to plan an attack (9.0).' : 'No enemy hex can be attacked.';
    case 'EXPLOITATION': return 'Exploit-mode units and released Reserves may move and attack (11.0).';
    default: return `${phaseLabel(sequence.phase, sequence.segment)}.`;
  }
};

const selectedCard = (snapshot: UiSnapshot): string => {
  const piece = snapshot.selectedPiece;
  if (!piece) {
    const hex = snapshot.selection.hexId;
    return `<div><h2>${hex ? `Hex ${esc(printedHexLabel(hex))}` : 'No unit selected'}</h2><p>${hex ? 'No unit of yours here.' : 'Click one of your units on the map, or open All units.'}</p></div>`;
  }
  const own = piece.ownerId === snapshot.view.playerId;
  if (isAir(snapshot, piece) || isAirBase(snapshot, piece)) {
    const step = pieceDefinition(snapshot.scenario, piece)?.faces[0]?.steps.find(({ remainingSteps }) => remainingSteps === (piece.remainingSteps ?? 2));
    return `${counterFor(snapshot, piece)}<div><strong>${esc(pieceLabel(snapshot.scenario, piece))}</strong>
      <p>${esc(pieceHex(piece))} · ${esc(statusName(snapshot, piece))}</p>
      <small>${isAir(snapshot, piece) ? `Range ${step?.range ?? '–'} hexes · flies missions from its Air Base (14.2)` : 'Holds 4 + Level Active aircraft; refits 2 × Level for 1T (15.0-15.1)'}</small></div>`;
  }
  const arriving = snapshot.arrivals.some(({ pieceId }) => pieceId === piece.id);
  const needsFuel = own && snapshot.unitActions.some(({ group }) => group === 'FUEL') && snapshot.reachable.size === 0;
  const details = own ? supplyDetails(snapshot, piece) : '';
  const paused = snapshot.view.metadata.lifecycle === 'PAUSED';
  const status = !own ? 'Enemy · steps lost and internal stocks are hidden'
    : paused ? 'Paused'
      : arriving ? 'Arriving: click a blue entry hex to place it'
        : needsFuel ? 'Needs fuel before it can move (12.5)'
          : snapshot.reachable.size > 0 ? `${mp(snapshot.remainingTicks)} MP left · ${snapshot.reachable.size} hexes reachable`
            : snapshot.movedThisPhase.has(String(piece.id)) ? 'Already moved this phase' : 'Cannot move in this step';
  return `${counterFor(snapshot, piece)}<div><strong>${esc(pieceLabel(snapshot.scenario, piece))}</strong>
    <p>${esc(pieceHex(piece))} · ${esc(statusName(snapshot, piece))}${details ? ` · ${esc(details)}` : ''}</p>
    <small>${esc(status)}${piece.statuses.includes('status:out-of-supply') ? ' · Out of supply' : ''}</small></div>`;
};

const explanationBlock = (explanation: NonNullable<UiSnapshot['movePreview']>['explanation'] | null): string => {
  if (!explanation || explanation.allowed) return '';
  return `<ul class="rule-blockers">${explanation.reasons.filter(({ allowed }) => !allowed).map(({ message, rule }) => `<li>${esc(withHexLabels(message))} <cite>${esc(rule)}</cite></li>`).join('')}</ul>`;
};

const narrativeContext = (snapshot: UiSnapshot): NarrativeContext => ({
  viewerId: snapshot.view.playerId,
  playerName: (playerId) => snapshot.bindings.find((binding) => binding.playerId === playerId)?.label ?? String(playerId),
  piece: () => null,
});

/** A resolved (or withdrawn) combat, shown to both players in plain language. */
export const combatCard = (snapshot: UiSnapshot, report: CombatReport, dismissId = ''): string => {
  const rolls = [report.surpriseRoll !== null ? `surprise roll ${report.surpriseRoll}` : '', report.roll !== null ? `${report.kind === 'BARRAGE' ? 'barrage' : 'combat'} roll ${report.roll}` : ''].filter(Boolean).join(' · ');
  return `<article class="combat-card status-${report.status.toLowerCase()}">
    <header><strong>${esc(combatHeadline(report, narrativeContext(snapshot)))}</strong></header>
    ${report.result ? `<p class="combat-result"><b>${esc(report.result)}</b>${rolls ? ` <small>${esc(rolls)}</small>` : ''}</p>` : ''}
    <p>${esc(report.explanation || 'In progress.')}</p>
    ${report.outcomes.length > 0 ? `<ul>${report.outcomes.map((line) => `<li>${esc(line)}</li>`).join('')}</ul>` : report.status === 'RESOLVED' ? '<p class="hint">No unit was lost or moved.</p>' : ''}
    ${dismissId ? `<button id="${dismissId}">OK</button>` : ''}
  </article>`;
};

const feedEntryHtml = (entry: FeedEntry & { readonly repeat?: number }): string => `<article class="deck-event" title="${esc(entry.technical)}"><strong>${esc(entry.title)}${(entry.repeat ?? 1) > 1 ? ` <small>×${entry.repeat}</small>` : ''}</strong>${entry.lines.map((line) => `<p>${esc(line)}</p>`).join('')}</article>`;

/** Fold consecutive entries that say the same thing and carry no detail ("answered a decision" x4). */
const collapse = (entries: readonly FeedEntry[]): (FeedEntry & { repeat: number })[] => entries.reduce<(FeedEntry & { repeat: number })[]>((folded, entry) => {
  const last = folded.at(-1);
  if (last && last.title === entry.title && last.lines.length === 0 && entry.lines.length === 0) folded[folded.length - 1] = { ...last, repeat: last.repeat + 1 };
  else folded.push({ ...entry, repeat: 1 });
  return folded;
}, []);

const awayPanel = (snapshot: UiSnapshot): string => {
  const report = snapshot.awayReport;
  if (!report) return '';
  const entries = report.entries.filter((entry) => entry.lines.length > 0 || !entry.title.startsWith('An enemy unit moved'));
  const moves = report.entries.length - entries.length;
  return `<section class="deck-context away-report" aria-label="While you were away">
    <p class="eyebrow">WHILE YOU WERE AWAY</p>
    ${report.combats.map((combat) => combatCard(snapshot, combat)).join('')}
    ${moves > 0 ? `<p class="hint">${moves} enemy move${moves === 1 ? '' : 's'} (see the map).</p>` : ''}
    <div class="away-entries">${collapse(entries).map(feedEntryHtml).join('')}</div>
    <button class="primary" id="dismiss-away">Got it</button>
  </section>`;
};

const draftPanel = (snapshot: UiSnapshot): string => {
  const draft = snapshot.draft!;
  const units = draft.eligibleIds.map((id) => snapshot.view.projection?.stacks.flatMap(({ pieces }) => pieces).find((piece) => piece.id === id)).filter((piece): piece is ProjectedPiece => piece !== undefined);
  const facts = draft.explanation;
  const title = draft.kind === 'BARRAGE' ? 'Barrage' : draft.kind === 'OVERRUN' ? 'Overrun' : 'Attack';
  const outlook = draft.kind === 'BARRAGE' ? null
    : combatOutlook(String(fact(facts, 'combat.line') ?? ''), String(fact(facts, 'combat.column') ?? ''), Number(fact(facts, 'combat.drm') ?? 0));
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
  const outlookHtml = draft.kind === 'BARRAGE' ? ''
    : outlook ? `<p class="outlook${outlook.attackerStep > outlook.defenderHurt ? ' is-poor' : ''}">Before Surprise: you lose a mandatory step on ${percent(outlook.attackerStep)} of rolls (a loss or option on ${percent(outlook.attackerHurt)}); the defender loses, retreats or is DG on ${percent(outlook.defenderHurt)}${outlook.exploit > 0 ? `; exploitation on ${percent(outlook.exploit)}` : ''}.</p>`
      : facts?.allowed ? '<p class="outlook is-poor">These odds are off the Combat Table columns.</p>' : '';
  const participants = units.map((piece) => {
    const checked = draft.selectedIds.includes(piece.id);
    return `<label class="participant"><input type="checkbox" data-participant="${esc(piece.id)}" ${checked ? 'checked' : ''}>
      ${counterFor(snapshot, piece)}<span>${esc(pieceLabel(snapshot.scenario, piece))}<small>${esc(pieceHex(piece))}</small></span>
      ${draft.kind !== 'BARRAGE' && checked ? `<input type="radio" name="lead" data-lead="${esc(piece.id)}" ${draft.leadId === piece.id ? 'checked' : ''} aria-label="Lead with this unit's Action Rating">` : ''}</label>`;
  }).join('');
  const note = draft.kind === 'OVERRUN' ? 'Overrun costs 3 MP; if it succeeds the units must enter the hex (8.0).'
    : draft.kind === 'BARRAGE' ? 'Tick the artillery that fires.' : 'Tick the attacking units; the radio button picks the unit whose Action Rating leads.';
  return `<section class="deck-context combat-draft" aria-label="${title} plan">
    <h2>${title} ${esc(printedHexLabel(draft.targetHexId))}</h2>
    ${rows}${outlookHtml}
    <p class="hint">${esc(note)} Supply is paid from dumps in reach; if several can pay you will choose, or pay automatically.</p>
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
  const sheet = snapshot.combatSheet;
  const what = combat ? (combat.kind === 'AIR_MISSION' ? 'Air mission' : combat.kind === 'BARRAGE' ? 'Barrage' : combat.kind === 'OVERRUN' ? 'Overrun' : 'Attack') : '';
  const summary = combat?.kind === 'AIR_MISSION' ? airMissionSummary(snapshot) : combat ? `<p class="combat-summary">${what} on ${esc(printedHexLabel(combat.targetHexId))} · ${esc(combat.attackerStrength)}${combat.defenderStrength === null ? '' : ` : ${esc(combat.defenderStrength)}`} · ${esc(combat.odds)}${combat.drm === null ? '' : ` · DRM ${combat.drm >= 0 ? '+' : ''}${combat.drm}`}${combat.result ? ` · <strong>${esc(combat.result)}</strong>` : ''}${combat.rollTotal ? ` (roll ${combat.rollTotal}${combat.shiftDie ? `, surprise ${combat.shiftDie} col` : ''})` : ''}</p>` : '';
  const steps = sheet ? `<ol class="combat-steps" aria-label="Combat steps">${sheet.steps.map(({ label, status }) => `<li class="is-${status}"${status === 'current' ? ' aria-current="step"' : ''}>${esc(label)}</li>`).join('')}</ol>` : '';
  const answers = sheet && sheet.answers.length > 0 ? `<ul class="combat-answers">${sheet.answers.map((answer) => `<li>✓ ${esc(answer)}</li>`).join('')}</ul>` : '';
  const hexChoice = decision.options.some(({ hexId }) => hexId !== null);
  const title = sheet ? `${sheet.role === 'DEFENDER' ? 'Defend' : what} ${combat ? esc(printedHexLabel(combat.targetHexId)) : ''}` : 'Your decision';
  return `<section class="deck-context decision-panel" aria-label="Decision">
    <p class="eyebrow">${esc(title.toUpperCase())}</p>${steps}${summary}${answers}
    <h2>${esc(withHexLabels(decision.prompt))}</h2>
    ${hexChoice ? '<p class="hint">Click a highlighted hex on the map, or choose below.</p>' : ''}
    ${snapshot.autoPay ? '<button class="primary" id="auto-pay">Pay automatically from the largest dumps</button>' : ''}
    <div class="decision-options">${decision.options.map(({ id, label }) => `<button class="decision-option" data-choice="${esc(id)}">${esc(withHexLabels(label))}</button>`).join('')}</div>
  </section>`;
};

const resultPanel = (snapshot: UiSnapshot): string => snapshot.resultCard
  ? `<section class="deck-context result-card" aria-label="Combat result"><p class="eyebrow">COMBAT RESULT</p>${combatCard(snapshot, snapshot.resultCard, 'dismiss-result')}</section>` : '';

/**
 * Work that interrupts the tabs: a hand-over, a pending decision or an open attack/air plan. It takes
 * the whole body of the deck until it is finished, then the player returns to the tab they were on.
 * It is drawn first: what the player must answer is never pushed below the fold by the report of what happened.
 */
const interruptPanel = (snapshot: UiSnapshot): string => {
  if (snapshot.view.metadata.lifecycle === 'ACTIVE' && snapshot.handoff && !snapshot.decision) {
    return `<section class="deck-context handoff-panel"><p class="eyebrow">HAND OVER</p><h2>${esc(snapshot.handoff.toLabel)} to act</h2><p>${esc(snapshot.handoff.reason)}</p>
      <button id="begin-required-handoff" class="primary wide">Hand the screen to ${esc(snapshot.handoff.toLabel)}</button></section>`;
  }
  if (snapshot.decision) return decisionPanel(snapshot);
  if (snapshot.draft) return draftPanel(snapshot);
  if (snapshot.air.draft) return airDraftPanel(snapshot);
  return '';
};

const phaseKey = (snapshot: UiSnapshot): string => {
  const sequence = snapshot.view.projection?.sequence;
  return sequence ? `${sequence.phase}:${sequence.segment}` : 'none';
};

export interface DeckTab { readonly id: string; readonly label: string; /** Things waiting for the player in this tab. */ readonly badge: number }

/** The tabs of the current phase, required work first, optional air missions after the unit's own tab. Every phase ends with Log. */
export const deckTabs = (snapshot: UiSnapshot): DeckTab[] => {
  const sequence = snapshot.view.projection?.sequence;
  const phase = sequence?.phase;
  const segment = sequence?.segment;
  const tabs: DeckTab[] = [];
  if (phase === 'REINFORCEMENT' || snapshot.arrivals.length > 0) tabs.push({ id: 'arrivals', label: 'Arrivals', badge: snapshot.arrivals.length });
  if (phase === 'SUPPLY' || segment === 'BREAKOUT' || snapshot.stepActions.length > 0 || snapshot.supplyNeeds.length > 0) {
    tabs.push({ id: 'supply', label: segment === 'BREAKOUT' ? 'Breakout' : 'Supply', badge: snapshot.supplyNeeds.length + snapshot.stepActions.length });
  }
  if (phase === 'AIRCRAFT_REFIT' || snapshot.air.refits.length > 0) tabs.push({ id: 'refit', label: 'Refit', badge: snapshot.air.refits.length });
  if (phase === 'COMBAT' || phase === 'EXPLOITATION' || segment === 'COMBAT' || segment === 'BARRAGE') {
    tabs.push({ id: 'targets', label: 'Targets', badge: new Set([...snapshot.attackTargets, ...snapshot.barrageTargets]).size });
  }
  if (phase !== 'AIRCRAFT_REFIT') tabs.push({ id: 'unit', label: 'Unit', badge: 0 });
  // Air missions are optional in every step that offers them, so Air never takes the lead from the step's own work.
  if (snapshot.air.missions.length > 0) tabs.push({ id: 'air', label: 'Air', badge: snapshot.air.missions.filter(({ available }) => available).length });
  // What the seat has paid or moved this step, once there is something to read; optional, so it never takes the first place.
  if (snapshot.ledger.length > 0) tabs.push({ id: 'ledger', label: 'Ledger', badge: 0 });
  tabs.push({ id: 'log', label: 'Log', badge: 0 });
  return tabs;
};

/** The tab on show: the player's pick within this phase, otherwise the phase's first (required) tab. */
export const activeDeckTab = (snapshot: UiSnapshot, state: DeckState): string => {
  const tabs = deckTabs(snapshot);
  return state.tab?.key === phaseKey(snapshot) && tabs.some(({ id }) => id === state.tab?.id) ? state.tab.id : tabs[0]!.id;
};

/** The player picks a tab; it stays for the rest of this phase. */
export const selectDeckTab = (snapshot: UiSnapshot, state: DeckState, id: string): void => { state.tab = { key: phaseKey(snapshot), id }; };

/** Tabs that are worked through by clicking their own rows; picking a unit there must not leave them. */
const WORK_LISTS: readonly string[] = ['arrivals', 'supply', 'refit'];

/** Call before drawing: a new phase forgets the previous pick, and choosing a unit opens its Unit tab. */
export const syncDeckTab = (snapshot: UiSnapshot, state: DeckState): void => {
  const key = phaseKey(snapshot);
  if (state.tab && state.tab.key !== key) state.tab = undefined;
  const piece = snapshot.selection.pieceId;
  if (piece && piece !== state.lastPiece && !WORK_LISTS.includes(activeDeckTab(snapshot, state)) && deckTabs(snapshot).some(({ id }) => id === 'unit')) {
    state.tab = { key, id: 'unit' };
  }
  state.lastPiece = piece;
};

const arrivalsTab = (snapshot: UiSnapshot): string => {
  if (snapshot.arrivals.length === 0) return '<p class="hint">All reinforcements are placed.</p>';
  const pieces = snapshot.view.projection?.stacks.flatMap(({ pieces: stackPieces }) => stackPieces) ?? [];
  return `<div class="arrivals"><strong>Reinforcements arriving (${snapshot.arrivals.length})</strong><p class="hint">Select a unit, then click a blue entry hex on the map.</p>${snapshot.arrivals.map(({ pieceId }) => {
    const piece = pieces.find(({ id }) => id === pieceId);
    return piece ? unitRow(snapshot, piece, ' · arriving') : '';
  }).join('')}</div>`;
};

const supplyTab = (snapshot: UiSnapshot): string => {
  const parts: string[] = [];
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
  if (snapshot.view.projection?.sequence.phase === 'SUPPLY') {
    const own = (snapshot.view.projection?.stacks ?? []).flatMap(({ pieces }) => pieces).filter((piece) => piece.ownerId === snapshot.view.playerId && piece.location.kind === 'ON_MAP');
    const outOfSupply = own.filter((piece) => piece.statuses.includes('status:out-of-supply')).length;
    parts.push(`<p class="summary-line">${snapshot.supplyNeeds.length} unit${snapshot.supplyNeeds.length === 1 ? '' : 's'} out of trace supply now · ${outOfSupply} marked Out of Supply.</p>`);
  }
  if (snapshot.supplyNeeds.length > 0) {
    const pieces = snapshot.view.projection?.stacks.flatMap(({ pieces: stackPieces }) => stackPieces) ?? [];
    parts.push(`<div class="supply-needs"><strong>Out of trace supply</strong><p class="hint">Feed a unit from a dump (1T per 2 RE) or leave it; unfed units become Out of Supply when the phase ends.</p>${snapshot.supplyNeeds.map((need) => {
      const piece = pieces.find(({ id }) => id === need.pieceId);
      if (!piece) return '';
      return `<div class="supply-need">${unitRow(snapshot, piece)}<div class="chip-row">${need.options.map(({ dumpId }) => {
        const dump = pieces.find(({ id }) => id === dumpId);
        return `<button data-feed="${esc(need.pieceId)}" data-dump="${esc(dumpId)}">Feed from ${esc(dump ? `${dump.resourceQuantity ?? 0}T at ${pieceHex(dump)}` : 'dump')}</button>`;
      }).join('')}</div></div>`;
    }).join('')}</div>`);
  }
  return parts.join('') || '<p class="hint">Nothing needs supply attention in this step.</p>';
};

const refitTab = (snapshot: UiSnapshot): string => refitPanel(snapshot) || '<p class="hint">No Air Base has aircraft to refit.</p>';

const targetsTab = (snapshot: UiSnapshot): string => {
  const segment = snapshot.view.projection?.sequence.segment;
  const chips = (title: string, verb: string, hexes: readonly string[]) => hexes.length === 0 ? ''
    : `<div class="target-list"><strong>${title}</strong><div class="chip-row">${hexes.map((hexId) => `<button data-target-hex="${esc(hexId)}">${verb} ${esc(printedHexLabel(hexId))}</button>`).join('')}</div></div>`;
  const attack = chips(segment === 'COMBAT' ? 'Enemy hexes you can attack' : 'Enemy hexes the selected unit can overrun', segment === 'COMBAT' ? 'Attack' : 'Overrun', snapshot.attackTargets);
  const barrage = chips('Enemy hexes in artillery range', 'Barrage', snapshot.barrageTargets);
  return attack + barrage || `<p class="hint">${snapshot.view.projection?.sequence.segment === 'BARRAGE' ? 'No barrage targets in range.' : 'No enemy hex can be attacked.'}</p>`;
};

const airTab = (snapshot: UiSnapshot): string => `${airMissionButtons(snapshot)}<p class="hint">Pick a mission, then a highlighted target hex and the aircraft that fly it.</p>`;

/** A supply dump is a generic counter: it reads as its size, never by a name (the board-game counter has none). */
const supplyText = (tokens: number): string => `${tokens}T (${tokens / 4} SP)`;

const transferRow = (title: string, kind: 'LOAD' | 'UNLOAD', dumpId: string | null, option: NonNullable<UiSnapshot['transportOptions']>['loads'][number]): string => {
  const verb = kind === 'LOAD' ? 'Load' : 'Unload';
  if (!option.available) {
    const reason = option.reasons[0];
    return `<div class="transfer-row is-blocked"><span class="transfer-title">${esc(title)}</span><button disabled>${verb}</button>
      <small class="blocker">${esc(reason ? withHexLabels(reason.message) : 'Not available now.')}${reason ? ` <cite>${esc(reason.rule)}</cite>` : ''}</small></div>`;
  }
  return `<div class="transfer-row"><span class="transfer-title">${esc(title)}</span>
    <label class="transfer-amount">Tokens <input type="number" class="transfer-tokens" min="${option.minTokens}" max="${option.maxTokens}" value="${option.maxTokens}" inputmode="numeric" aria-label="${esc(`Tokens to ${verb.toLowerCase()}: ${option.minTokens} to ${option.maxTokens}`)}"></label>
    <button class="primary" data-transfer="${kind}"${dumpId ? ` data-dump="${esc(dumpId)}"` : ''}>${verb}</button>
    <small>${option.minTokens}–${option.maxTokens}T · costs ${mp(option.costTicks)} MP, ${mp(option.remainingAfterTicks)} MP left afterwards</small></div>`;
};

/** The truck's supply area: what is here to load, what it carries, what each action costs, and why something is not offered. */
const transportSection = (snapshot: UiSnapshot, others: readonly { key: string; label: string }[]): string => {
  const options = snapshot.transportOptions!;
  const pieces = (snapshot.view.projection?.stacks ?? []).flatMap(({ pieces: stackPieces }) => stackPieces);
  const divide = snapshot.unitActions.flatMap(({ action }) => action.kind === 'DIVIDE_TRANSPORT' ? [action.points] : []);
  const loads = options.loads.map((option) => {
    const dump = pieces.find(({ id }) => id === option.pieceId);
    return transferRow(`Dump here · ${supplyText(dump?.resourceQuantity ?? 0)}`, 'LOAD', option.pieceId, option);
  }).join('');
  const nothingHere = options.loads.length === 0 ? '<p class="hint">No friendly supply dump in this hex to load from.</p>' : '';
  const unload = options.unload ? transferRow(`Carrying ${supplyText(options.loadedTokens)}`, 'UNLOAD', null, options.unload) : '';
  const midMove = options.isCurrentMover && options.remainingTicks > 0
    ? '<p class="warning">This truck is mid-move. Finish with it before moving another unit, or it loses its remaining MP and load (6.1g) <cite>6.1g</cite></p>' : '';
  const split = divide.length > 0
    ? `<div class="transfer-row"><span class="transfer-title">Split the counter</span>
      <label class="transfer-amount">Points <input type="number" class="divide-points" min="1" max="${Math.max(...divide)}" value="1" inputmode="numeric" aria-label="Truck points to split off"></label>
      <button data-divide>Split off</button><small>No MP cost (13.2c)</small></div>` : '';
  return `<div class="unit-actions transport-panel"><strong>Trucks</strong>
    <p class="summary-line">${options.points} truck point${options.points === 1 ? '' : 's'} · carrying ${options.loadedTokens}/${options.capacityTokens}T · ${mp(options.remainingTicks)} MP left</p>
    ${midMove}${loads}${nothingHere}${unload}${split}
    ${others.length > 0 ? `<div class="action-list">${others.map(({ key, label }) => `<button data-unit-action="${esc(key)}">${esc(withHexLabels(label))}</button>`).join('')}</div>` : ''}</div>`;
};

const unitTab = (snapshot: UiSnapshot, state: DeckState): string => {
  const parts: string[] = [];
  if (snapshot.movePreview && !snapshot.movePreview.explanation.allowed) parts.push(`<div class="move-preview"><strong>Move to ${esc(printedHexLabel(snapshot.movePreview.destinationHexId))} is not allowed</strong>${explanationBlock(snapshot.movePreview.explanation)}</div>`);
  if (snapshot.modeOptions.length > 0 || snapshot.releaseAction) {
    parts.push(`<div class="mode-actions"><strong>Mode</strong><div class="chip-row">${snapshot.modeOptions.map(({ mode }) => `<button data-mode="${mode}">${esc(modeName(mode))}</button>`).join('')}${snapshot.releaseAction ? '<button id="release-reserve">Release reserve</button>' : ''}</div></div>`);
  }
  if (snapshot.unitActions.length > 0 || snapshot.transportOptions) {
    const groups: [string, string][] = [['FUEL', 'Fuel'], ['SUPPLY', 'Supply'], ['BREAKOUT', 'Breakout'], ['TRANSPORT', 'Trucks'], ['DUMP', 'Dump'], ['AIR', 'Air']];
    // Loading, unloading and splitting live in the truck's supply area; the buttons that remain are the other truck actions.
    const inPanel = (kind: string) => ['LOAD_SUPPLY', 'UNLOAD_SUPPLY', 'DIVIDE_TRANSPORT'].includes(kind);
    parts.push(groups.flatMap(([group, title]) => {
      if (group === 'TRANSPORT' && snapshot.transportOptions) {
        return [transportSection(snapshot, snapshot.unitActions.filter((entry) => entry.group === 'TRANSPORT' && !inPanel(entry.action.kind)))];
      }
      const entries = snapshot.unitActions.filter((entry) => entry.group === group);
      return entries.length === 0 ? [] : [`<div class="unit-actions"><strong>${title}</strong><div class="action-list">${entries.map(({ key, label }) => `<button data-unit-action="${esc(key)}">${esc(withHexLabels(label))}</button>`).join('')}</div></div>`];
    }).join(''));
  }
  // A dump has no move of its own: it is carried, so say which trucks here can carry it.
  const dump = snapshot.selectedPiece;
  const sequence = snapshot.view.projection?.sequence;
  if (dump?.role === 'DUMP' && dump.ownerId === snapshot.view.playerId && dump.location.kind === 'ON_MAP' && sequence?.phase === 'MOVEMENT' && sequence.segment === 'MOVEMENT') {
    const hexId = dump.location.hexId;
    const trucks = (snapshot.view.projection?.stacks ?? []).flatMap(({ pieces }) => pieces)
      .filter((piece) => piece.role === 'TRUCK' && piece.ownerId === dump.ownerId && piece.location.kind === 'ON_MAP' && piece.location.hexId === hexId);
    parts.push(`<div class="unit-actions"><strong>Carry with a truck</strong>${trucks.length > 0
      ? `<p class="hint">Select a truck in this hex to choose how many Tokens to load from this ${supplyText(dump.resourceQuantity ?? 0)} dump.</p>${trucks.map((truck) => unitRow(snapshot, truck)).join('')}`
      : '<p class="hint">No friendly truck in this hex. Move one here to load from this dump.</p>'}</div>`);
  }
  if (snapshot.collapseHexes.length > 0) {
    parts.push('<p class="hint">Or collapse the Extender (9.14d): click a highlighted hex in trace supply within its range.</p>');
  }
  if (parts.length === 0) {
    const unmoved = unmovedUnits(snapshot);
    const guidance = snapshot.selectedPiece && snapshot.reachable.size > 0 ? 'Click a highlighted hex to preview the move; darker hexes are out of reach.'
      : snapshot.attackTargets.length > 0 ? 'Red-ringed enemy hexes can be attacked: click one to plan it.'
        : state.hint || (snapshot.selectedPiece ? 'This unit has no actions in this step.' : 'Select a unit on the map, or open All units, to see its actions.');
    parts.push(`<p class="hint">${esc(guidance)}</p>${unmoved > 0 && !snapshot.selectedPiece ? `<p class="summary-line">${unmoved} unit${unmoved === 1 ? ' has' : 's have'} not moved yet.</p>` : ''}`);
  }
  return parts.join('');
};

/** The supply the seat has paid or moved in this step, newest last, with what each source holds now. */
const ledgerTab = (snapshot: UiSnapshot): string => {
  const spent = snapshot.ledger.reduce((total, { spent: tokens }) => total + tokens, 0);
  return `<div class="ledger"><strong>Supply this turn</strong>
    <p class="summary-line">${spent}T paid · ${snapshot.ledger.length} entr${snapshot.ledger.length === 1 ? 'y' : 'ies'}</p>
    <ol class="ledger-list">${snapshot.ledger.map(({ text }) => `<li>${esc(withHexLabels(text))}</li>`).join('')}</ol></div>`;
};

const logTab = (snapshot: UiSnapshot): string => collapse(snapshot.feed).reverse().slice(0, 120).map(feedEntryHtml).join('') || '<p class="hint">No actions yet.</p>';

const tabBody = (snapshot: UiSnapshot, state: DeckState, tab: string): string => {
  switch (tab) {
    case 'arrivals': return arrivalsTab(snapshot);
    case 'supply': return supplyTab(snapshot);
    case 'refit': return refitTab(snapshot);
    case 'targets': return targetsTab(snapshot);
    case 'air': return airTab(snapshot);
    case 'unit': return unitTab(snapshot, state);
    case 'ledger': return ledgerTab(snapshot);
    default: return logTab(snapshot);
  }
};

/**
 * Confirmation of the previewed move, drawn beside the destination hex on the map. Short on purpose:
 * cost, what is left, why it is blocked; the full rule explanation stays in the Unit tab.
 */
export const movePopupHtml = (snapshot: UiSnapshot): string => {
  const preview = snapshot.movePreview;
  if (!preview) return '';
  const range = snapshot.moveRange.get(preview.destinationHexId);
  const reTicks = (piece: ProjectedPiece): number => Number(pieceDefinition(snapshot.scenario, piece)?.faces
    .find(({ id }) => id === piece.currentFaceId)?.steps.find(({ remainingSteps }) => remainingSteps === piece.remainingSteps)?.regimentalEquivalentTicks ?? 0);
  const already = (snapshot.view.projection?.stacks ?? []).flatMap(({ pieces }) => pieces)
    .filter((piece) => piece.ownerId === snapshot.view.playerId && piece.location.kind === 'ON_MAP' && piece.location.hexId === preview.destinationHexId && piece.id !== snapshot.selectedPiece?.id);
  const total = already.reduce((sum, piece) => sum + reTicks(piece), 0) + (snapshot.selectedPiece ? reTicks(snapshot.selectedPiece) : 0);
  const reasons = preview.explanation.allowed ? [] : preview.explanation.reasons.filter(({ allowed }) => !allowed);
  const from = preview.path.length > 1 ? preview.path[preview.path.length - 2]! : snapshot.selectedPiece?.location.kind === 'ON_MAP' ? snapshot.selectedPiece.location.hexId : '';
  // 6.1g: starting this move ends a Transport Point's move; say what it would give up before the player confirms.
  const endsId = fact(preview.explanation, 'movement.endsOtherMover.pieceId');
  const endsPiece = typeof endsId === 'string' ? (snapshot.view.projection?.stacks ?? []).flatMap(({ pieces }) => pieces).find(({ id }) => id === endsId) : undefined;
  const endsLoad = Number(fact(preview.explanation, 'movement.endsOtherMover.loadTokens') ?? 0);
  const endsWarning = endsPiece
    ? `<p class="warning">This ends the move of ${esc(pieceLabel(snapshot.scenario, endsPiece))}: its ${mp(fact(preview.explanation, 'movement.endsOtherMover.remainingTicks'))} MP left${endsLoad > 0 ? ` and ${endsLoad}T aboard` : ''} cannot be used again this phase <cite>6.1g</cite></p>`
    : '';
  return `<div class="move-popup" role="group" aria-label="Confirm move to ${esc(printedHexLabel(preview.destinationHexId))}" data-anchor-hex="${esc(preview.destinationHexId)}" data-from-hex="${esc(from)}">
    <strong>Move to ${esc(printedHexLabel(preview.destinationHexId))}</strong>
    <p>Cost ${mp(fact(preview.explanation, 'movement.totalTicks'))} MP · ${mp(fact(preview.explanation, 'movement.remainingTicks'))} MP left after the move.</p>
    ${range?.endsMovement ? '<p class="blocker">The move ends there (enemy ZOC, all-MP terrain, or minimum move).</p>' : ''}
    ${total > 40 ? `<p class="blocker">Ending here makes ${total / 4} RE in one hex: over 10 RE at the end of the segment, you must eliminate units (4.8a).</p>` : ''}
    ${reasons.length > 0 ? `<p class="blocker">${esc(withHexLabels(reasons[0]!.message))} <cite>${esc(reasons[0]!.rule)}</cite></p>${reasons.length > 1 ? `<p class="hint">${reasons.length - 1} more reason${reasons.length === 2 ? '' : 's'} in the Unit tab.</p>` : ''}` : ''}
    ${endsWarning}
    <div class="button-grid"><button id="cancel-move">Cancel</button><button class="primary" id="confirm-move" ${preview.explanation.allowed && !snapshot.busy ? '' : 'disabled'}>${endsWarning ? 'Confirm anyway' : 'Confirm'}</button></div>
  </div>`;
};

const unitFormation = (snapshot: UiSnapshot, piece: ProjectedPiece): string => {
  const formation = pieceDefinition(snapshot.scenario, piece)?.ownership.formationDefinitionId;
  return formation ? snapshot.formationNames.get(String(formation)) ?? '' : '';
};

/**
 * Every counter the player commands. SP a truck carries is part of that truck, not another unit, and a dump that was merged into
 * another or used up is gone, not an eliminated unit.
 */
const rosterOwn = (snapshot: UiSnapshot): ProjectedPiece[] =>
  (snapshot.view.projection?.stacks ?? []).flatMap((stack) => stack.pieces)
    .filter(({ ownerId, role, location }) => ownerId === snapshot.view.playerId && role !== 'CARGO' && !(role === 'DUMP' && location.kind === 'ELIMINATED'));

/** The scrolling part of the roster. Rebuilt on its own while typing so a force of hundreds does not repaint the whole page. */
export const unitRosterBodyHtml = (snapshot: UiSnapshot, state: DeckState): string => {
  const search = state.search.trim().toLowerCase();
  const filter = state.filter ?? 'all';
  const byName = (left: ProjectedPiece, right: ProjectedPiece): number =>
    pieceLabel(snapshot.scenario, left).localeCompare(pieceLabel(snapshot.scenario, right)) || String(left.id).localeCompare(String(right.id));
  const matches = (piece: ProjectedPiece): boolean => search === '' || `${pieceLabel(snapshot.scenario, piece)} ${unitFormation(snapshot, piece)} ${pieceHex(piece)}`.toLowerCase().includes(search);
  const all = rosterOwn(snapshot).filter(matches);
  const active = all.filter(({ location }) => location.kind !== 'ELIMINATED')
    .filter((piece) => filter === 'all' || (filter === 'moved') === snapshot.movedThisPhase.has(String(piece.id)));
  const groups = new Map<string, ProjectedPiece[]>();
  for (const piece of active) {
    const name = unitFormation(snapshot, piece) || 'Independent units';
    groups.set(name, [...(groups.get(name) ?? []), piece]);
  }
  const row = (piece: ProjectedPiece): string => `<button class="roster-unit${piece.id === snapshot.selection.pieceId ? ' is-selected' : ''}" data-piece="${esc(piece.id)}" data-roster-pick="${esc(piece.id)}" aria-label="${esc(`${pieceLabel(snapshot.scenario, piece)}, ${pieceHex(piece)}`)}">
    <span class="roster-art" aria-hidden="true">${counterFor(snapshot, piece)}</span><span class="roster-text">${esc(pieceLabel(snapshot.scenario, piece))}<small>${esc(pieceHex(piece))} · ${esc(statusName(snapshot, piece))}</small></span>${badges(snapshot, piece)}</button>`;
  const body = [...groups.entries()].sort(([left], [right]) => left.localeCompare(right))
    .map(([name, pieces]) => `<details class="roster-group" open><summary>${esc(name)} <small>${pieces.length}</small></summary><div class="roster-grid">${pieces.sort(byName).map(row).join('')}</div></details>`).join('')
    || '<p class="roster-empty">No units match.</p>';
  const eliminated = all.filter(({ location }) => location.kind === 'ELIMINATED');
  return `${body}${eliminated.length > 0 && filter === 'all' ? `<details class="roster-group roster-eliminated"><summary>Eliminated <small>${eliminated.length}</small></summary><div class="roster-grid">${eliminated.sort(byName).map(row).join('')}</div></details>` : ''}`;
};

/**
 * Every unit the player commands, as one wide popup over the map: grouped by formation in several
 * columns of compact rows, searchable by name, formation or hex. Sized for a force of hundreds.
 */
export const unitRosterHtml = (snapshot: UiSnapshot, state: DeckState): string => {
  const sequence = snapshot.view.projection?.sequence;
  const movement = sequence?.phase === 'MOVEMENT' && sequence.segment === 'MOVEMENT';
  const filters = movement
    ? `<div class="unit-filter" role="group" aria-label="Filter units">${(['all', 'unmoved', 'moved'] as const).map((key) => `<button data-unit-filter="${key}" aria-pressed="${(state.filter ?? 'all') === key}">${key === 'all' ? 'All' : key === 'moved' ? `Moved ${snapshot.movedThisPhase.size}` : `Not moved ${unmovedUnits(snapshot)}`}</button>`).join('')}</div>` : '';
  return `<div class="roster-popup" role="dialog" aria-label="All my units">
    <header><strong>My units · ${rosterOwn(snapshot).filter(({ location }) => location.kind !== 'ELIMINATED').length}</strong>
      <input id="roster-search" type="search" value="${esc(state.search)}" placeholder="Find by name, formation or hex" aria-label="Find unit">${filters}
      <button id="close-roster" aria-label="Close unit list">×</button></header>
    <div class="roster-body" id="roster-body" data-scroll-key="roster" tabindex="0">${unitRosterBodyHtml(snapshot, state)}</div>
  </div>`;
};

/** Units that could still move this Movement Phase but have not, for the End confirmation. */
export const unmovedUnits = (snapshot: UiSnapshot): number => {
  const sequence = snapshot.view.projection?.sequence;
  if (sequence?.phase !== 'MOVEMENT' || sequence.segment !== 'MOVEMENT') return 0;
  return (snapshot.view.projection?.stacks ?? []).flatMap(({ pieces }) => pieces)
    .filter((piece) => piece.ownerId === snapshot.view.playerId && piece.location.kind === 'ON_MAP' && piece.mode !== null && piece.remainingSteps !== null
      && !snapshot.movedThisPhase.has(String(piece.id))).length;
};

/** Undo and End phase, drawn beside the phase chip in the top bar, with the reasons the phase cannot end yet. */
export const phaseControlsHtml = (snapshot: UiSnapshot, state: DeckState): string => {
  const busy = state.working || snapshot.busy;
  const unmoved = unmovedUnits(snapshot);
  const disabled = !(snapshot.endStep.enabled && !busy && !snapshot.decision && !snapshot.draft && snapshot.view.metadata.lifecycle === 'ACTIVE');
  const confirming = state.confirmEnd && unmoved > 0;
  // While the screen is being handed over, the hand-over panel says what is needed; a blocker would only be noise.
  const handingOver = snapshot.view.metadata.lifecycle === 'ACTIVE' && snapshot.handoff !== null && !snapshot.decision;
  const reasons = [
    ...(handingOver ? [] : snapshot.endStep.blockers.map(withHexLabels)),
  ];
  if (reasons.length === 0 && snapshot.decision) reasons.push('Answer the open decision first.');
  else if (reasons.length === 0 && snapshot.draft) reasons.push('Finish or cancel the open plan first.');
  return `<div class="phase-actions">
    ${snapshot.undoStep ? (() => {
      const text = snapshot.undoStep.scope === 'ACTION' ? `Undo: ${snapshot.undoStep.label}` : `Undo back to the ${snapshot.undoStep.label}`;
      return `<button id="undo-step" class="subtle" title="${esc(text)}" aria-label="${esc(text)}">↶ Undo</button>`;
    })() : ''}
    <button id="end-phase" class="${confirming ? 'warning' : snapshot.endStep.enabled ? 'primary' : ''}" ${disabled ? 'disabled' : ''}>${confirming
      ? `Finish anyway: ${unmoved} unit${unmoved === 1 ? ' has' : 's have'} not moved`
      : esc(snapshot.endStep.label)}<small>${esc(confirming ? 'Press again to confirm' : `Next: ${snapshot.endStep.next}`)}</small></button>
    ${reasons.length > 0 ? `<p class="end-note" role="status">${esc(reasons.join(' '))}</p>` : ''}
  </div>`;
};

export const commandDeckHtml = (snapshot: UiSnapshot, state: DeckState): string => {
  const { view } = snapshot;
  const sequence = view.projection?.sequence;
  const busy = state.working || snapshot.busy;
  const own = (view.projection?.stacks ?? []).flatMap((stack) => stack.pieces).filter(({ ownerId, role }) => ownerId === view.playerId && role !== 'CARGO');
  const objective = stepObjective(snapshot);
  const interrupt = interruptPanel(snapshot);
  const away = awayPanel(snapshot);
  const tabs = deckTabs(snapshot);
  const active = activeDeckTab(snapshot, state);
  const body = away || interrupt
    ? `<div class="deck-body deck-task" data-scroll-key="task" aria-busy="${busy}">${interrupt}${resultPanel(snapshot)}${away}</div>`
    : `<nav class="deck-tabs" aria-label="${esc(sequence ? phaseLabel(sequence.phase, sequence.segment) : 'Deck')}">${tabs.map(({ id, label, badge }) => `<button data-deck-tab="${id}" aria-pressed="${active === id}"${badge > 0 ? ` aria-label="${esc(label)}, ${badge} waiting"` : ''}>${esc(label)}${badge > 0 ? ` <span class="tab-badge" aria-hidden="true">${badge}</span>` : ''}</button>`).join('')}<button id="open-roster" class="roster-open" aria-haspopup="dialog" title="List every unit you command">All units (${own.filter(({ location }) => location.kind !== 'ELIMINATED').length})</button></nav>
      <div class="deck-body" data-scroll-key="tab-${active}" tabindex="0" aria-busy="${busy}">${resultPanel(snapshot)}<section class="deck-context">${tabBody(snapshot, state, active)}</section></div>`;
  return `${objective ? `<p class="deck-objective">${esc(objective)}</p>` : ''}
    ${view.metadata.lifecycle === 'PAUSED' ? '<p class="paused-banner" role="status">Paused — press Resume in the top bar to continue.</p>' : ''}
    <section class="deck-selection" aria-label="Selected unit">${selectedCard(snapshot)}${snapshot.selectedPiece || snapshot.selection.hexId ? '<button id="deselect" class="subtle" title="Finish with this unit and clear the selection (Esc)">Done</button>' : ''}</section>
    ${body}
    <footer class="deck-footer"><div class="deck-notice" role="status">${busy ? 'Working…' : esc(withHexLabels(state.error || snapshot.notice))}</div></footer>`;
};
