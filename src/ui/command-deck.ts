import { html, nothing, type TemplateResult } from 'lit-html';
import { repeat } from 'lit-html/directives/repeat.js';
import { unsafeHTML } from 'lit-html/directives/unsafe-html.js';
import type { ProjectedPiece } from '../rules/index.js';
import type { UiSnapshot } from './model.js';
import { counterSvg, counterView } from './counter.js';
import { combatHeadline, combatOutlook, type CombatReport, type FeedEntry, type NarrativeContext } from './narrative.js';
import { phaseLabel, pieceDefinition, pieceLabel, printedHexLabel } from './presenter.js';

/**
 * The left command deck, the phase controls and the map popups, as lit-html templates. They carry no handlers: browser.ts
 * delegates clicks by the ids and data attributes here, so these stay plain views of a UiSnapshot that tests can render.
 */

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
  /** Fuel step 1: the coverage the player picked (single unit, formation, HQ); step 2 then lists the dumps that can pay for it. */
  fuelMethod?: { readonly pieceId: string; readonly method: string } | undefined;
}

export type View = TemplateResult | typeof nothing;

const mp = (ticks: unknown): string => typeof ticks === 'number' ? `${Math.round(ticks / 4 * 100) / 100}` : '–';
const fact = (snapshot: { readonly facts: readonly { readonly key: string; readonly value: unknown }[] } | null | undefined, key: string) =>
  snapshot?.facts.find((entry) => entry.key === key)?.value;
const percent = (value: number): string => `${Math.round(value * 100)}%`;
/** Controls stay disabled while the engine works or while the page is about to run a player's action. */
const busyOf = (snapshot: UiSnapshot, state?: DeckState): boolean => snapshot.busy || state?.working === true;
const text = (value: unknown): string => value === null || value === undefined ? '' : String(value);

/** Counter art is markup built (and escaped) by counter.ts. */
const counterFor = (snapshot: UiSnapshot, piece: ProjectedPiece): View => {
  const definition = pieceDefinition(snapshot.scenario, piece);
  return definition ? html`${unsafeHTML(counterSvg(counterView(definition, piece)))}` : nothing;
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
export const withHexLabels = (value: string): string => value.replace(/-?\d+,-?\d+/gu, (hexId) => printedHexLabel(hexId));

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

const badges = (snapshot: UiSnapshot, piece: ProjectedPiece): View => {
  const list: [string, string][] = [];
  if (snapshot.movedThisPhase.has(String(piece.id))) list.push(['moved', 'Moved']);
  if (snapshot.attackedThisPhase.has(String(piece.id))) list.push(['attacked', 'Attacked']);
  if (piece.statuses.includes('status:out-of-supply')) list.push(['oos', 'Out of supply']);
  if (piece.mode === 'DG') list.push(['dg', 'DG']);
  return list.length === 0 ? nothing : html`<span class="badges">${list.map(([kind, label]) => html`<em class="badge badge-${kind}">${label}</em>`)}</span>`;
};

const unitRow = (snapshot: UiSnapshot, piece: ProjectedPiece, extra = ''): TemplateResult => {
  const details = supplyDetails(snapshot, piece);
  return html`<button class="deck-unit ${piece.id === snapshot.selection.pieceId ? 'is-selected' : ''}" data-piece=${piece.id} data-hex=${piece.location.kind === 'ON_MAP' ? piece.location.hexId : nothing} aria-label=${`${pieceLabel(snapshot.scenario, piece)}, ${pieceHex(piece)}`}>
    <span class="deck-unit-art" aria-hidden="true">${counterFor(snapshot, piece)}</span><span>${pieceLabel(snapshot.scenario, piece)}<small>${pieceHex(piece)} · ${statusName(snapshot, piece)}${details ? ` · ${details}` : ''}${extra}</small>${badges(snapshot, piece)}</span></button>`;
};

/** What the current step asks of the player, in one sentence. */
export const stepObjective = (snapshot: UiSnapshot): string => {
  const sequence = snapshot.view.projection?.sequence;
  if (!sequence) return '';
  // The paused banner, with its Resume button, says it.
  if (snapshot.view.metadata.lifecycle === 'PAUSED') return '';
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

const selectedCard = (snapshot: UiSnapshot): TemplateResult => {
  const piece = snapshot.selectedPiece;
  if (!piece) {
    const hex = snapshot.selection.hexId;
    return html`<div><h2>${hex ? `Hex ${printedHexLabel(hex)}` : 'No unit selected'}</h2><p>${hex ? 'No unit of yours here.' : 'Click one of your units on the map, or open All units.'}</p></div>`;
  }
  const own = piece.ownerId === snapshot.view.playerId;
  if (isAir(snapshot, piece) || isAirBase(snapshot, piece)) {
    const step = pieceDefinition(snapshot.scenario, piece)?.faces[0]?.steps.find(({ remainingSteps }) => remainingSteps === (piece.remainingSteps ?? 2));
    return html`${counterFor(snapshot, piece)}<div><strong>${pieceLabel(snapshot.scenario, piece)}</strong>
      <p>${pieceHex(piece)} · ${statusName(snapshot, piece)}</p>
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
  return html`${counterFor(snapshot, piece)}<div><strong>${pieceLabel(snapshot.scenario, piece)}</strong>
    <p>${pieceHex(piece)} · ${statusName(snapshot, piece)}${details ? ` · ${details}` : ''}</p>
    <small>${status}${piece.statuses.includes('status:out-of-supply') ? ' · Out of supply' : ''}</small></div>`;
};

const explanationBlock = (explanation: NonNullable<UiSnapshot['movePreview']>['explanation'] | null): View => {
  if (!explanation || explanation.allowed) return nothing;
  return html`<ul class="rule-blockers">${explanation.reasons.filter(({ allowed }) => !allowed).map(({ message, rule }) => html`<li>${withHexLabels(message)} <cite>${rule}</cite></li>`)}</ul>`;
};

const narrativeContext = (snapshot: UiSnapshot): NarrativeContext => ({
  viewerId: snapshot.view.playerId,
  playerName: (playerId) => snapshot.bindings.find((binding) => binding.playerId === playerId)?.label ?? String(playerId),
  piece: () => null,
});

/** A resolved (or withdrawn) combat, shown to both players in plain language. */
export const combatCard = (snapshot: UiSnapshot, report: CombatReport, dismissId = ''): TemplateResult => {
  const rolls = [report.surpriseRoll !== null ? `surprise roll ${report.surpriseRoll}` : '', report.roll !== null ? `${report.kind === 'BARRAGE' ? 'barrage' : 'combat'} roll ${report.roll}` : ''].filter(Boolean).join(' · ');
  return html`<article class="combat-card status-${report.status.toLowerCase()}">
    <header><strong>${combatHeadline(report, narrativeContext(snapshot))}</strong></header>
    ${report.result ? html`<p class="combat-result"><b>${report.result}</b>${rolls ? html` <small>${rolls}</small>` : nothing}</p>` : nothing}
    <p>${report.explanation || 'In progress.'}</p>
    ${report.outcomes.length > 0 ? html`<ul>${report.outcomes.map((line) => html`<li>${line}</li>`)}</ul>` : report.status === 'RESOLVED' ? html`<p class="hint">No unit was lost or moved.</p>` : nothing}
    ${dismissId ? html`<button id=${dismissId}>OK</button>` : nothing}
  </article>`;
};

const feedEntry = (entry: FeedEntry & { readonly repeat?: number }): TemplateResult => html`<article class="deck-event" title=${entry.technical}><strong>${entry.title}${(entry.repeat ?? 1) > 1 ? html` <small>×${entry.repeat}</small>` : nothing}</strong>${entry.lines.map((line) => html`<p>${line}</p>`)}</article>`;

/** Fold consecutive entries that say the same thing and carry no detail ("answered a decision" x4). */
const collapse = (entries: readonly FeedEntry[]): (FeedEntry & { repeat: number })[] => entries.reduce<(FeedEntry & { repeat: number })[]>((folded, entry) => {
  const last = folded.at(-1);
  if (last && last.title === entry.title && last.lines.length === 0 && entry.lines.length === 0) folded[folded.length - 1] = { ...last, repeat: last.repeat + 1 };
  else folded.push({ ...entry, repeat: 1 });
  return folded;
}, []);

const awayPanel = (snapshot: UiSnapshot): View => {
  const report = snapshot.awayReport;
  if (!report) return nothing;
  const entries = report.entries.filter((entry) => entry.lines.length > 0 || !entry.title.startsWith('An enemy unit moved'));
  const moves = report.entries.length - entries.length;
  return html`<section class="deck-context away-report" aria-label="While you were away">
    <p class="eyebrow">WHILE YOU WERE AWAY</p>
    ${report.combats.map((combat) => combatCard(snapshot, combat))}
    ${moves > 0 ? html`<p class="hint">${moves} enemy move${moves === 1 ? '' : 's'} (see the map).</p>` : nothing}
    <div class="away-entries">${collapse(entries).map(feedEntry)}</div>
    <button class="primary" id="dismiss-away">Got it</button>
  </section>`;
};

const draftPanel = (snapshot: UiSnapshot, state: DeckState): TemplateResult => {
  const draft = snapshot.draft!;
  const units = draft.eligibleIds.map((id) => snapshot.view.projection?.stacks.flatMap(({ pieces }) => pieces).find((piece) => piece.id === id)).filter((piece): piece is ProjectedPiece => piece !== undefined);
  const facts = draft.explanation;
  const title = draft.kind === 'BARRAGE' ? 'Barrage' : draft.kind === 'OVERRUN' ? 'Overrun' : 'Attack';
  const outlook = draft.kind === 'BARRAGE' ? null
    : combatOutlook(String(fact(facts, 'combat.line') ?? ''), String(fact(facts, 'combat.column') ?? ''), Number(fact(facts, 'combat.drm') ?? 0));
  const rows = draft.kind === 'BARRAGE'
    ? html`<dl class="combat-facts"><div><dt>Barrage strength</dt><dd>${text(fact(facts, 'barrage.strength') ?? '–')}</dd></div>
        <div><dt>Shifts</dt><dd>${text(fact(facts, 'barrage.shifts') || 'none')}</dd></div>
        <div><dt>Spotter</dt><dd>${fact(facts, 'barrage.spotter') ? 'yes' : 'none (3 left)'}</dd></div>
        <div><dt>Supply</dt><dd>${text(fact(facts, 'barrage.supplyTokens') ?? '–')}T</dd></div></dl>`
    : html`<dl class="combat-facts"><div><dt>Strength</dt><dd>${text(fact(facts, 'combat.attackerStrength') ?? '–')} : ${text(fact(facts, 'combat.defenderStrength') ?? '?')}</dd></div>
        <div><dt>Odds</dt><dd>${text(fact(facts, 'combat.odds') ?? '–')} (${String(fact(facts, 'combat.line') ?? '').replace('_', ' ').toLowerCase()})</dd></div>
        <div><dt>If defender withholds supply</dt><dd>${text(fact(facts, 'combat.oddsUnsupplied') ?? '–')}</dd></div>
        <div><dt>AR DRM</dt><dd>${text(fact(facts, 'combat.attackerActionRating') ?? '–')} − ${text(fact(facts, 'combat.defenderActionRating') ?? '?')} = ${text(fact(facts, 'combat.drm') ?? '–')}</dd></div>
        <div><dt>Your supply cost</dt><dd>${text(fact(facts, 'combat.attackerSupplyTokens') ?? '–')}T</dd></div></dl>`;
  const outlookView = draft.kind === 'BARRAGE' ? nothing
    : outlook ? html`<p class="outlook${outlook.attackerStep > outlook.defenderHurt ? ' is-poor' : ''}">Before Surprise: you lose a mandatory step on ${percent(outlook.attackerStep)} of rolls (a loss or option on ${percent(outlook.attackerHurt)}); the defender loses, retreats or is DG on ${percent(outlook.defenderHurt)}${outlook.exploit > 0 ? `; exploitation on ${percent(outlook.exploit)}` : ''}.</p>`
      : facts?.allowed ? html`<p class="outlook is-poor">These odds are off the Combat Table columns.</p>` : nothing;
  const participants = units.map((piece) => {
    const checked = draft.selectedIds.includes(piece.id);
    return html`<label class="participant"><input type="checkbox" data-participant=${piece.id} .checked=${checked}>
      ${counterFor(snapshot, piece)}<span>${pieceLabel(snapshot.scenario, piece)}<small>${pieceHex(piece)}</small></span>
      ${draft.kind !== 'BARRAGE' && checked ? html`<input type="radio" name="lead" data-lead=${piece.id} .checked=${draft.leadId === piece.id} aria-label="Lead with this unit's Action Rating">` : nothing}</label>`;
  });
  const note = draft.kind === 'OVERRUN' ? 'Overrun costs 3 MP; if it succeeds the units must enter the hex (8.0).'
    : draft.kind === 'BARRAGE' ? 'Tick the artillery that fires.' : 'Tick the attacking units; the radio button picks the unit whose Action Rating leads.';
  return html`<section class="deck-context combat-draft" aria-label="${title} plan">
    <h2>${title} ${printedHexLabel(draft.targetHexId)}</h2>
    ${rows}${outlookView}
    <p class="hint">${note} Supply is paid from dumps in reach; if several can pay you will choose, or pay automatically.</p>
    <div class="participants">${participants.length > 0 ? participants : html`<p>No eligible units.</p>`}</div>
    ${explanationBlock(facts)}
    <div class="button-grid"><button id="cancel-draft">Cancel</button><button class="primary" id="declare-draft" ?disabled=${!(facts?.allowed && !busyOf(snapshot, state))}>${title}</button></div>
  </section>`;
};

const airMissionSummary = (snapshot: UiSnapshot): View => {
  const air = snapshot.view.projection?.combat?.air;
  if (!air) return nothing;
  return html`<div class="combat-summary"><strong>${air.mission} · ${printedHexLabel(snapshot.view.projection!.combat!.targetHexId)}</strong>
    <ol class="air-log">${air.log.map((line) => html`<li>${withHexLabels(line)}</li>`)}</ol></div>`;
};

const pieceById = (snapshot: UiSnapshot, id: string): ProjectedPiece | undefined =>
  snapshot.view.projection?.stacks.flatMap(({ pieces }) => pieces).find((piece) => piece.id === id);

const airDraftPanel = (snapshot: UiSnapshot, state: DeckState): TemplateResult => {
  const draft = snapshot.air.draft!;
  const facts = draft.explanation;
  if (!draft.targetHexId) {
    return html`<section class="deck-context air-panel" aria-label="${draft.label} plan"><h2>${draft.label}</h2>
      <p class="hint">${snapshot.air.targetHexes.length > 0 ? `Click one of the ${snapshot.air.targetHexes.length} highlighted hexes to choose the mission hex.` : 'No target is in range of a ready aircraft.'}</p>
      <div class="button-grid"><button id="cancel-air-mission">Cancel</button></div></section>`;
  }
  const targetChoice = draft.targetOptions.length > 1
    ? html`<div class="chip-row" role="group" aria-label="Barrage target">${draft.targetOptions.map((target) => html`<button data-air-target=${target} aria-pressed=${String(draft.target === target)}>${target === 'AIR_BASE' ? 'Air Base (Facility Table)' : 'Combat units'}</button>`)}</div>` : nothing;
  const aircraft = draft.eligibleIds.flatMap((id) => {
    const piece = pieceById(snapshot, id);
    if (!piece) return [];
    return [html`<label class="participant"><input type=${draft.maximum === 1 ? 'radio' : 'checkbox'} name="air-aircraft" data-air-aircraft=${id} .checked=${draft.selectedIds.includes(id)}>
      ${counterFor(snapshot, piece)}<span>${pieceLabel(snapshot.scenario, piece)}<small>${pieceHex(piece)}</small></span></label>`];
  });
  const rows: [string, unknown][] = [
    ['Mission hex', printedHexLabel(draft.targetHexId)],
    ...(fact(facts, 'air.finalColumn') !== undefined ? [['Table column', `${text(fact(facts, 'air.initialColumn') ?? '')}${fact(facts, 'air.initialColumn') ? ' → ' : ''}${text(fact(facts, 'air.finalColumn'))}`] as [string, unknown]] : []),
    ...(fact(facts, 'air.shifts') ? [['Shifts', fact(facts, 'air.shifts')] as [string, unknown]] : []),
    ...(['BARRAGE', 'HIP_SHOOT', 'TRAINBUSTING'].includes(draft.mission) ? [['Barrage strength', fact(facts, 'air.strength') ?? '–'] as [string, unknown]] : []),
    ['Flak', fact(facts, 'air.flakSubject') ? `+${text(fact(facts, 'air.flakModifier') ?? 0)}${fact(facts, 'air.flakReasons') ? ` (${text(fact(facts, 'air.flakReasons'))})` : ''}; 11+ on 2d6 costs a step` : 'not rolled for this mission'],
    ['Enemy Patrol Zone', !fact(facts, 'air.enemyPatrolZone') ? 'no' : fact(facts, 'air.flakSubject') ? 'yes: an enemy Fighter may intercept' : 'yes (this mission cannot be intercepted)'],
  ];
  return html`<section class="deck-context air-panel combat-draft" aria-label="${draft.label} plan">
    <h2>${draft.label} ${printedHexLabel(draft.targetHexId)}</h2>${targetChoice}
    <dl class="combat-facts">${rows.map(([label, value]) => html`<div><dt>${label}</dt><dd>${text(value)}</dd></div>`)}</dl>
    <p class="hint">${draft.maximum === 1 ? 'Choose the aircraft that flies.' : `Tick up to ${draft.maximum} aircraft; they may come from different bases.`} Every mission aircraft becomes Inactive at a base afterwards${draft.mission === 'BASE_TRANSFER' ? ' (a Fighter staying within range stays Active)' : ''}.</p>
    <div class="participants">${aircraft.length > 0 ? aircraft : html`<p>No eligible aircraft.</p>`}</div>
    ${explanationBlock(facts)}
    <div class="button-grid"><button id="cancel-air-mission">Cancel</button><button class="primary" id="declare-air-mission" ?disabled=${!(facts?.allowed && !busyOf(snapshot, state))}>Fly ${draft.label}</button></div>
  </section>`;
};

const refitPanel = (snapshot: UiSnapshot, state: DeckState): View => snapshot.air.refits.length === 0 ? nothing : html`<div class="air-panel"><strong>Aircraft refit</strong>
  <p class="hint">Each Air Base refits once: up to 2 × Level Inactive aircraft for 1T drawn or thrown to the base (15.1).</p>
  ${snapshot.air.refits.map((refit) => html`<div class="refit-base"><small>Air Base ${printedHexLabel(refit.hexId)} · up to ${refit.capacity}</small>
    <div class="participants">${refit.inactiveIds.map((id) => { const piece = pieceById(snapshot, id); return piece ? html`<label class="participant"><input type="checkbox" data-refit-base=${refit.baseId} data-refit-aircraft=${id} .checked=${refit.selectedIds.includes(id)}>${counterFor(snapshot, piece)}<span>${pieceLabel(snapshot.scenario, piece)}</span></label>` : nothing; })}</div>
    ${explanationBlock(refit.explanation)}
    <button class="primary" data-refit=${refit.baseId} ?disabled=${!(refit.explanation?.allowed && !busyOf(snapshot, state))}>Refit ${refit.selectedIds.length} for 1T</button></div>`)}</div>`;

const airMissionButtons = (snapshot: UiSnapshot): View => snapshot.air.missions.length === 0 ? nothing : html`<div class="air-panel"><strong>Air missions</strong>
  <div class="chip-row">${snapshot.air.missions.map(({ mission, label, available }) => html`<button data-air-mission=${mission} ?disabled=${!available}>${label}</button>`)}</div></div>`;

const decisionPanel = (snapshot: UiSnapshot): TemplateResult => {
  const decision = snapshot.decision!;
  const combat = snapshot.view.projection?.combat;
  const sheet = snapshot.combatSheet;
  const what = combat ? (combat.kind === 'AIR_MISSION' ? 'Air mission' : combat.kind === 'BARRAGE' ? 'Barrage' : combat.kind === 'OVERRUN' ? 'Overrun' : 'Attack') : '';
  const summary = combat?.kind === 'AIR_MISSION' ? airMissionSummary(snapshot) : combat ? html`<p class="combat-summary">${what} on ${printedHexLabel(combat.targetHexId)} · ${combat.attackerStrength}${combat.defenderStrength === null ? '' : ` : ${combat.defenderStrength}`} · ${combat.odds}${combat.drm === null ? '' : ` · DRM ${combat.drm >= 0 ? '+' : ''}${combat.drm}`}${combat.result ? html` · <strong>${combat.result}</strong>` : nothing}${combat.rollTotal ? ` (roll ${combat.rollTotal}${combat.shiftDie ? `, surprise ${combat.shiftDie} col` : ''})` : ''}</p>` : nothing;
  const steps = sheet ? html`<ol class="combat-steps" aria-label="Combat steps">${sheet.steps.map(({ label, status }) => html`<li class="is-${status}" aria-current=${status === 'current' ? 'step' : nothing}>${label}</li>`)}</ol>` : nothing;
  const answers = sheet && sheet.answers.length > 0 ? html`<ul class="combat-answers">${sheet.answers.map((answer) => html`<li>✓ ${answer}</li>`)}</ul>` : nothing;
  const hexChoice = decision.options.some(({ hexId }) => hexId !== null);
  const title = sheet ? `${sheet.role === 'DEFENDER' ? 'Defend' : what} ${combat ? printedHexLabel(combat.targetHexId) : ''}` : 'Your decision';
  return html`<section class="deck-context decision-panel" aria-label="Decision">
    <p class="eyebrow">${title.toUpperCase()}</p>${steps}${summary}${answers}
    <h2>${withHexLabels(decision.prompt)}</h2>
    ${hexChoice ? html`<p class="hint">Click a highlighted hex on the map, or choose below.</p>` : nothing}
    ${snapshot.autoPay ? html`<button class="primary" id="auto-pay">Pay automatically from the largest dumps</button>` : nothing}
    <div class="decision-options">${decision.options.map(({ id, label }) => html`<button class="decision-option" data-choice=${id}>${withHexLabels(label)}</button>`)}</div>
  </section>`;
};

const resultPanel = (snapshot: UiSnapshot): View => snapshot.resultCard
  ? html`<section class="deck-context result-card" aria-label="Combat result"><p class="eyebrow">COMBAT RESULT</p>${combatCard(snapshot, snapshot.resultCard, 'dismiss-result')}</section>` : nothing;

/**
 * Work that interrupts the tabs: a hand-over, a pending decision or an open attack/air plan. It takes
 * the whole body of the deck until it is finished, then the player returns to the tab they were on.
 * It is drawn first: what the player must answer is never pushed below the fold by the report of what happened.
 */
const interruptPanel = (snapshot: UiSnapshot, state: DeckState): View => {
  if (snapshot.view.metadata.lifecycle === 'ACTIVE' && snapshot.handoff && !snapshot.decision) {
    return html`<section class="deck-context handoff-panel"><p class="eyebrow">HAND OVER</p><h2>${snapshot.handoff.toLabel} to act</h2><p>${snapshot.handoff.reason}</p>
      <button id="begin-required-handoff" class="primary wide">Hand the screen to ${snapshot.handoff.toLabel}</button></section>`;
  }
  if (snapshot.decision) return decisionPanel(snapshot);
  if (snapshot.draft) return draftPanel(snapshot, state);
  if (snapshot.air.draft) return airDraftPanel(snapshot, state);
  return nothing;
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

const arrivalsTab = (snapshot: UiSnapshot): TemplateResult => {
  if (snapshot.arrivals.length === 0) return html`<p class="hint">All reinforcements are placed.</p>`;
  const pieces = snapshot.view.projection?.stacks.flatMap(({ pieces: stackPieces }) => stackPieces) ?? [];
  return html`<div class="arrivals"><strong>Reinforcements arriving (${snapshot.arrivals.length})</strong><p class="hint">Select a unit, then click a blue entry hex on the map.</p>${snapshot.arrivals.map(({ pieceId }) => {
    const piece = pieces.find(({ id }) => id === pieceId);
    return piece ? unitRow(snapshot, piece, ' · arriving') : nothing;
  })}</div>`;
};

const actionButtons = (entries: readonly { readonly key: string; readonly label: string }[]): TemplateResult =>
  html`<div class="action-list">${entries.map(({ key, label }) => html`<button data-unit-action=${key}>${withHexLabels(label)}</button>`)}</div>`;

const supplyTab = (snapshot: UiSnapshot): TemplateResult => {
  const parts: View[] = [];
  if (snapshot.stepActions.length > 0) {
    const recovery = snapshot.stepActions.filter(({ group }) => group === 'SUPPLY');
    const trace = snapshot.stepActions.filter(({ group }) => group === 'TRACE');
    const breakout = snapshot.stepActions.filter(({ group }) => group === 'BREAKOUT');
    const block = (title: string, hint: string, entries: typeof recovery): View => entries.length === 0 ? nothing
      : html`<div class="step-actions"><strong>${title}</strong><p class="hint">${hint}</p>${actionButtons(entries)}</div>`;
    parts.push(block('Recover internal stocks (required first)', 'Units marked Low or Exhausted must recover from dumps in reach before anything else this phase (12.10e).', recovery),
      block('Formation trace route', 'All units of a division trace through one HQ or one source; the others must eat off the map or go Out of Supply (12.6f).', trace),
      block('Breakout', 'Units out of trace supply may try to break out: 5-6 they leave and return as reinforcements, 1-4 they are lost (12.8e).', breakout));
  }
  if (snapshot.view.projection?.sequence.phase === 'SUPPLY') {
    const own = (snapshot.view.projection?.stacks ?? []).flatMap(({ pieces }) => pieces).filter((piece) => piece.ownerId === snapshot.view.playerId && piece.location.kind === 'ON_MAP');
    const outOfSupply = own.filter((piece) => piece.statuses.includes('status:out-of-supply')).length;
    parts.push(html`<p class="summary-line">${snapshot.supplyNeeds.length} unit${snapshot.supplyNeeds.length === 1 ? '' : 's'} out of trace supply now · ${outOfSupply} marked Out of Supply.</p>`);
  }
  if (snapshot.supplyNeeds.length > 0) {
    const pieces = snapshot.view.projection?.stacks.flatMap(({ pieces: stackPieces }) => stackPieces) ?? [];
    parts.push(html`<div class="supply-needs"><strong>Out of trace supply</strong><p class="hint">Feed a unit from a dump (1T per 2 RE) or leave it; unfed units become Out of Supply when the phase ends.</p>${snapshot.supplyNeeds.map((need) => {
      const piece = pieces.find(({ id }) => id === need.pieceId);
      if (!piece) return nothing;
      return html`<div class="supply-need">${unitRow(snapshot, piece)}<div class="chip-row">${need.options.map(({ dumpId }) => {
        const dump = pieces.find(({ id }) => id === dumpId);
        return html`<button data-feed=${need.pieceId} data-dump=${dumpId}>Feed from ${dump ? `${dump.resourceQuantity ?? 0}T at ${pieceHex(dump)}` : 'dump'}</button>`;
      })}</div></div>`;
    })}</div>`);
  }
  return parts.some((part) => part !== nothing) ? html`${parts}` : html`<p class="hint">Nothing needs supply attention in this step.</p>`;
};

const refitTab = (snapshot: UiSnapshot, state: DeckState): View => snapshot.air.refits.length > 0 ? refitPanel(snapshot, state) : html`<p class="hint">No Air Base has aircraft to refit.</p>`;

const targetsTab = (snapshot: UiSnapshot): TemplateResult => {
  const segment = snapshot.view.projection?.sequence.segment;
  const chips = (title: string, verb: string, hexes: readonly string[]): View => hexes.length === 0 ? nothing
    : html`<div class="target-list"><strong>${title}</strong><div class="chip-row">${hexes.map((hexId) => html`<button data-target-hex=${hexId}>${verb} ${printedHexLabel(hexId)}</button>`)}</div></div>`;
  if (snapshot.attackTargets.length === 0 && snapshot.barrageTargets.length === 0) {
    return html`<p class="hint">${segment === 'BARRAGE' ? 'No barrage targets in range.' : 'No enemy hex can be attacked.'}</p>`;
  }
  return html`${chips(segment === 'COMBAT' ? 'Enemy hexes you can attack' : 'Enemy hexes the selected unit can overrun', segment === 'COMBAT' ? 'Attack' : 'Overrun', snapshot.attackTargets)}${chips('Enemy hexes in artillery range', 'Barrage', snapshot.barrageTargets)}`;
};

const airTab = (snapshot: UiSnapshot): TemplateResult => html`${airMissionButtons(snapshot)}<p class="hint">Pick a mission, then a highlighted target hex and the aircraft that fly it.</p>`;

/** A supply dump is a generic counter: it reads as its size, never by a name (the board-game counter has none). */
const supplyText = (tokens: number): string => `${tokens}T (${tokens / 4} SP)`;

const transferRow = (title: string, kind: 'LOAD' | 'UNLOAD', dumpId: string | null, option: NonNullable<UiSnapshot['transportOptions']>['loads'][number]): TemplateResult => {
  const verb = kind === 'LOAD' ? 'Load' : 'Unload';
  if (!option.available) {
    const reason = option.reasons[0];
    return html`<div class="transfer-row is-blocked"><span class="transfer-title">${title}</span><button disabled>${verb}</button>
      <small class="blocker">${reason ? withHexLabels(reason.message) : 'Not available now.'}${reason ? html` <cite>${reason.rule}</cite>` : nothing}</small></div>`;
  }
  return html`<div class="transfer-row"><span class="transfer-title">${title}</span>
    <label class="transfer-amount">Tokens <input type="number" class="transfer-tokens" min=${option.minTokens} max=${option.maxTokens} value=${option.maxTokens} inputmode="numeric" aria-label=${`Tokens to ${verb.toLowerCase()}: ${option.minTokens} to ${option.maxTokens}`}></label>
    <button class="primary" data-transfer=${kind} data-dump=${dumpId ?? nothing}>${verb}</button>
    <small>${option.minTokens}–${option.maxTokens}T · costs ${mp(option.costTicks)} MP, ${mp(option.remainingAfterTicks)} MP left afterwards</small></div>`;
};

/** The truck's supply area: what is here to load, what it carries, what each action costs, and why something is not offered. */
const transportSection = (snapshot: UiSnapshot, others: readonly { key: string; label: string }[]): TemplateResult => {
  const options = snapshot.transportOptions!;
  const pieces = (snapshot.view.projection?.stacks ?? []).flatMap(({ pieces: stackPieces }) => stackPieces);
  const divide = snapshot.unitActions.flatMap(({ action }) => action.kind === 'DIVIDE_TRANSPORT' ? [action.points] : []);
  const loads = options.loads.map((option) => {
    const dump = pieces.find(({ id }) => id === option.pieceId);
    return transferRow(`Dump here · ${supplyText(dump?.resourceQuantity ?? 0)}`, 'LOAD', option.pieceId, option);
  });
  const nothingHere = options.loads.length === 0 ? html`<p class="hint">No friendly supply dump in this hex to load from.</p>` : nothing;
  const unload = options.unload ? transferRow(`Carrying ${supplyText(options.loadedTokens)}`, 'UNLOAD', null, options.unload) : nothing;
  const midMove = options.isCurrentMover && options.remainingTicks > 0
    ? html`<p class="warning">This truck is mid-move. Finish with it before moving another unit, or it loses its remaining MP and load (6.1g) <cite>6.1g</cite></p>` : nothing;
  const split = divide.length > 0
    ? html`<div class="transfer-row"><span class="transfer-title">Split the counter</span>
      <label class="transfer-amount">Points <input type="number" class="divide-points" min="1" max=${Math.max(...divide)} value="1" inputmode="numeric" aria-label="Truck points to split off"></label>
      <button data-divide>Split off</button><small>No MP cost (13.2c)</small></div>` : nothing;
  return html`<div class="unit-actions transport-panel"><strong>Trucks</strong>
    <p class="summary-line">${options.points} truck point${options.points === 1 ? '' : 's'} · carrying ${options.loadedTokens}/${options.capacityTokens}T · ${mp(options.remainingTicks)} MP left</p>
    ${midMove}${loads}${nothingHere}${unload}${split}
    ${others.length > 0 ? actionButtons(others) : nothing}</div>`;
};

const FUEL_METHODS: Readonly<Record<string, { readonly title: string; readonly detail: string }>> = {
  SINGLE_UNIT: { title: 'This unit only', detail: '1T, this phase' },
  FORMATION: { title: 'Whole formation', detail: '1 SP, until Clean Up' },
  HQ: { title: 'This HQ and units in its range', detail: '1 SP, until Clean Up' },
};

/** The hex a supply source stands in: a dump on the map, or the truck carrying it. */
const sourceHex = (snapshot: UiSnapshot, pieceId: string): string | null => {
  const pieces = (snapshot.view.projection?.stacks ?? []).flatMap((stack) => stack.pieces);
  const piece = pieces.find(({ id }) => id === pieceId);
  if (!piece) return null;
  if (piece.location.kind === 'ON_MAP') return piece.location.hexId;
  const carrier = piece.location.kind === 'CONTAINER' ? pieces.find(({ id }) => id === (piece.location as { containerId: string }).containerId) : undefined;
  return carrier?.location.kind === 'ON_MAP' ? carrier.location.hexId : null;
};

/** Fuel in two steps: first what to fuel (this unit, its formation, the HQ), then which supply dump pays. Hovering a dump marks its hex on the map. */
const fuelSection = (snapshot: UiSnapshot, state: DeckState): View => {
  const entries = snapshot.unitActions.filter((entry) => entry.group === 'FUEL' && entry.action.kind === 'PAY_FUEL');
  if (entries.length === 0) return nothing;
  const methodOf = (entry: (typeof entries)[number]): string => (entry.action as { method: string }).method;
  const methods = [...new Set(entries.map(methodOf))];
  const pieceId = snapshot.selection.pieceId ?? '';
  // One method is the only choice; otherwise the pick is remembered for this unit only.
  const picked = state.fuelMethod?.pieceId === pieceId && methods.includes(state.fuelMethod.method) ? state.fuelMethod.method : methods.length === 1 ? methods[0]! : null;
  const step1 = html`<div class="fuel-step"><small class="step-title">1 · What to fuel</small><div class="chip-row">${methods.map((method) => {
    const info = FUEL_METHODS[method] ?? { title: method, detail: '' };
    return html`<button data-fuel-method=${method} aria-pressed=${String(method === picked)} class=${method === picked ? 'is-picked' : ''}>${info.title}<small> · ${info.detail}</small></button>`;
  })}</div></div>`;
  const dumps = picked === null ? html`<p class="hint">Choose what to fuel first; then you pick the supply dump that pays.</p>`
    : html`<div class="fuel-step"><small class="step-title">2 · Pay from which dump</small><div class="action-list">${entries.filter((entry) => methodOf(entry) === picked).map(({ key, label, action }) => {
      const hex = sourceHex(snapshot, (action as { sourcePieceId: string }).sourcePieceId);
      return html`<button data-unit-action=${key} data-highlight-hex=${hex ?? nothing}>${withHexLabels(label.replace(/^.*? from /u, ''))}</button>`;
    })}</div><p class="hint">Hover a dump to see its hex on the map.</p></div>`;
  return html`<div class="unit-actions fuel-panel"><strong>Fuel</strong>${step1}${dumps}</div>`;
};

const unitTab = (snapshot: UiSnapshot, state: DeckState): TemplateResult => {
  const parts: View[] = [];
  if (snapshot.movePreview && !snapshot.movePreview.explanation.allowed) parts.push(html`<div class="move-preview"><strong>Move to ${printedHexLabel(snapshot.movePreview.destinationHexId)} is not allowed</strong>${explanationBlock(snapshot.movePreview.explanation)}</div>`);
  if (snapshot.modeOptions.length > 0 || snapshot.releaseAction) {
    parts.push(html`<div class="mode-actions"><strong>Mode</strong><div class="chip-row">${snapshot.modeOptions.map(({ mode }) => html`<button data-mode=${mode}>${modeName(mode)}</button>`)}${snapshot.releaseAction ? html`<button id="release-reserve">Release reserve</button>` : nothing}</div></div>`);
  }
  if (snapshot.unitActions.length > 0 || snapshot.transportOptions) {
    const groups: [string, string][] = [['FUEL', 'Fuel'], ['SUPPLY', 'Supply'], ['BREAKOUT', 'Breakout'], ['TRANSPORT', 'Trucks'], ['DUMP', 'Dump'], ['AIR', 'Air']];
    // Loading, unloading and splitting live in the truck's supply area; the buttons that remain are the other truck actions.
    const inPanel = (kind: string) => ['LOAD_SUPPLY', 'UNLOAD_SUPPLY', 'DIVIDE_TRANSPORT'].includes(kind);
    parts.push(...groups.flatMap(([group, title]): View[] => {
      if (group === 'TRANSPORT' && snapshot.transportOptions) {
        return [transportSection(snapshot, snapshot.unitActions.filter((entry) => entry.group === 'TRANSPORT' && !inPanel(entry.action.kind)))];
      }
      if (group === 'FUEL') return [fuelSection(snapshot, state)];
      const entries = snapshot.unitActions.filter((entry) => entry.group === group);
      return entries.length === 0 ? [] : [html`<div class="unit-actions"><strong>${title}</strong>${actionButtons(entries)}</div>`];
    }));
  }
  // A dump has no move of its own: it is carried, so say which trucks here can carry it.
  const dump = snapshot.selectedPiece;
  const sequence = snapshot.view.projection?.sequence;
  if (dump?.role === 'DUMP' && dump.ownerId === snapshot.view.playerId && dump.location.kind === 'ON_MAP' && sequence?.phase === 'MOVEMENT' && sequence.segment === 'MOVEMENT') {
    const hexId = dump.location.hexId;
    const trucks = (snapshot.view.projection?.stacks ?? []).flatMap(({ pieces }) => pieces)
      .filter((piece) => piece.role === 'TRUCK' && piece.ownerId === dump.ownerId && piece.location.kind === 'ON_MAP' && piece.location.hexId === hexId);
    parts.push(html`<div class="unit-actions"><strong>Carry with a truck</strong>${trucks.length > 0
      ? html`<p class="hint">Select a truck in this hex to choose how many Tokens to load from this ${supplyText(dump.resourceQuantity ?? 0)} dump.</p>${trucks.map((truck) => unitRow(snapshot, truck))}`
      : html`<p class="hint">No friendly truck in this hex. Move one here to load from this dump.</p>`}</div>`);
  }
  if (snapshot.collapseHexes.length > 0) {
    parts.push(html`<p class="hint">Or collapse the Extender (9.14d): click a highlighted hex in trace supply within its range.</p>`);
  }
  if (parts.length === 0) {
    const unmoved = unmovedUnits(snapshot);
    const guidance = snapshot.selectedPiece && snapshot.reachable.size > 0 ? 'Click a highlighted hex to preview the move; darker hexes are out of reach.'
      : snapshot.attackTargets.length > 0 ? 'Red-ringed enemy hexes can be attacked: click one to plan it.'
        : state.hint || (snapshot.selectedPiece ? 'This unit has no actions in this step.' : 'Select a unit on the map, or open All units, to see its actions.');
    parts.push(html`<p class="hint">${guidance}</p>${unmoved > 0 && !snapshot.selectedPiece ? html`<p class="summary-line">${unmoved} unit${unmoved === 1 ? ' has' : 's have'} not moved yet.</p>` : nothing}`);
  }
  return html`${parts}`;
};

/** The supply the seat has paid or moved in this step, newest last, with what each source holds now. */
const ledgerTab = (snapshot: UiSnapshot): TemplateResult => {
  const spent = snapshot.ledger.reduce((total, { spent: tokens }) => total + tokens, 0);
  return html`<div class="ledger"><strong>Supply this turn</strong>
    <p class="summary-line">${spent}T paid · ${snapshot.ledger.length} entr${snapshot.ledger.length === 1 ? 'y' : 'ies'}</p>
    <ol class="ledger-list">${snapshot.ledger.map(({ text: line }) => html`<li>${withHexLabels(line)}</li>`)}</ol></div>`;
};

const logTab = (snapshot: UiSnapshot): TemplateResult => {
  const entries = collapse(snapshot.feed).reverse().slice(0, 120);
  return entries.length > 0 ? html`${entries.map(feedEntry)}` : html`<p class="hint">No actions yet.</p>`;
};

const tabBody = (snapshot: UiSnapshot, state: DeckState, tab: string): View => {
  switch (tab) {
    case 'arrivals': return arrivalsTab(snapshot);
    case 'supply': return supplyTab(snapshot);
    case 'refit': return refitTab(snapshot, state);
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
export const movePopupView = (snapshot: UiSnapshot, state?: DeckState): View => {
  const preview = snapshot.movePreview;
  if (!preview) return nothing;
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
    ? html`<p class="warning">This ends the move of ${pieceLabel(snapshot.scenario, endsPiece)}: its ${mp(fact(preview.explanation, 'movement.endsOtherMover.remainingTicks'))} MP left${endsLoad > 0 ? ` and ${endsLoad}T aboard` : ''} cannot be used again this phase <cite>6.1g</cite></p>`
    : nothing;
  return html`<div class="move-popup" role="group" aria-label=${`Confirm move to ${printedHexLabel(preview.destinationHexId)}`} data-anchor-hex=${preview.destinationHexId} data-from-hex=${from}>
    <strong>Move to ${printedHexLabel(preview.destinationHexId)}</strong>
    <p>Cost ${mp(fact(preview.explanation, 'movement.totalTicks'))} MP · ${mp(fact(preview.explanation, 'movement.remainingTicks'))} MP left after the move.</p>
    ${range?.endsMovement ? html`<p class="blocker">The move ends there (enemy ZOC, all-MP terrain, or minimum move).</p>` : nothing}
    ${total > 40 ? html`<p class="blocker">Ending here makes ${total / 4} RE in one hex: over 10 RE at the end of the segment, you must eliminate units (4.8a).</p>` : nothing}
    ${reasons.length > 0 ? html`<p class="blocker">${withHexLabels(reasons[0]!.message)} <cite>${reasons[0]!.rule}</cite></p>${reasons.length > 1 ? html`<p class="hint">${reasons.length - 1} more reason${reasons.length === 2 ? '' : 's'} in the Unit tab.</p>` : nothing}` : nothing}
    ${endsWarning}
    <div class="button-grid"><button id="cancel-move">Cancel</button><button class="primary" id="confirm-move" ?disabled=${!(preview.explanation.allowed && !busyOf(snapshot, state))}>${endsPiece ? 'Confirm anyway' : 'Confirm'}</button></div>
  </div>`;
};

const unitFormation = (snapshot: UiSnapshot, piece: ProjectedPiece): string => {
  const formation = pieceDefinition(snapshot.scenario, piece)?.ownership.formationDefinitionId;
  return formation ? snapshot.formationNames.get(String(formation)) ?? '' : '';
};

/**
 * Every unit the player commands. A supply dump is supply lying on the map, not a unit, so it is never listed or counted here (it is
 * reached on the map and in the stack picker); SP a truck carries is part of that truck, not another unit.
 */
const rosterOwn = (snapshot: UiSnapshot): ProjectedPiece[] =>
  (snapshot.view.projection?.stacks ?? []).flatMap((stack) => stack.pieces)
    .filter(({ ownerId, role }) => ownerId === snapshot.view.playerId && role !== 'CARGO' && role !== 'DUMP');

/** Trucks and extenders haul supply rather than fight, so the roster lists them in a group of their own after the formations. */
const isTransport = ({ role }: ProjectedPiece): boolean => role === 'TRUCK' || role === 'EXTENDER';

/** The scrolling part of the roster; rows are keyed by unit so filtering moves them instead of redrawing their counters. */
export const unitRosterBodyView = (snapshot: UiSnapshot, state: DeckState): TemplateResult => {
  const search = state.search.trim().toLowerCase();
  const filter = state.filter ?? 'all';
  const byName = (left: ProjectedPiece, right: ProjectedPiece): number =>
    pieceLabel(snapshot.scenario, left).localeCompare(pieceLabel(snapshot.scenario, right)) || String(left.id).localeCompare(String(right.id));
  const matches = (piece: ProjectedPiece): boolean => search === '' || `${pieceLabel(snapshot.scenario, piece)} ${unitFormation(snapshot, piece)} ${pieceHex(piece)}`.toLowerCase().includes(search);
  const all = rosterOwn(snapshot).filter(matches);
  const active = all.filter(({ location }) => location.kind !== 'ELIMINATED')
    .filter((piece) => filter === 'all' || (filter === 'moved') === snapshot.movedThisPhase.has(String(piece.id)));
  const groups = new Map<string, ProjectedPiece[]>();
  for (const piece of active.filter((piece) => !isTransport(piece))) {
    const name = unitFormation(snapshot, piece) || 'Independent units';
    groups.set(name, [...(groups.get(name) ?? []), piece]);
  }
  const row = (piece: ProjectedPiece): TemplateResult => html`<button class="roster-unit${piece.id === snapshot.selection.pieceId ? ' is-selected' : ''}" data-piece=${piece.id} data-roster-pick=${piece.id} aria-label=${`${pieceLabel(snapshot.scenario, piece)}, ${pieceHex(piece)}`}>
    <span class="roster-art" aria-hidden="true">${counterFor(snapshot, piece)}</span><span class="roster-text">${pieceLabel(snapshot.scenario, piece)}<small>${pieceHex(piece)} · ${statusName(snapshot, piece)}</small></span>${badges(snapshot, piece)}</button>`;
  const rows = (pieces: ProjectedPiece[]) => repeat(pieces.sort(byName), (piece) => piece.id, row);
  const transport = active.filter(isTransport);
  const sorted: { key: string; name: string; pieces: ProjectedPiece[]; extra: string }[] = [
    ...[...groups.entries()].sort(([left], [right]) => left.localeCompare(right)).map(([name, pieces]) => ({ key: `formation:${name}`, name, pieces, extra: '' })),
    ...(transport.length > 0 ? [{ key: 'transport', name: 'Trucks', pieces: transport, extra: ' roster-transport' }] : []),
  ];
  const eliminated = all.filter(({ location }) => location.kind === 'ELIMINATED');
  return html`${sorted.length > 0
    ? repeat(sorted, ({ key }) => key, ({ name, pieces, extra }) => html`<details class="roster-group${extra}" open><summary>${name} <small>${pieces.length}</small></summary><div class="roster-grid">${rows(pieces)}</div></details>`)
    : html`<p class="roster-empty">No units match.</p>`}${eliminated.length > 0 && filter === 'all' ? html`<details class="roster-group roster-eliminated"><summary>Eliminated <small>${eliminated.length}</small></summary><div class="roster-grid">${rows(eliminated)}</div></details>` : nothing}`;
};

/**
 * Every unit the player commands, as one wide popup over the map: grouped by formation in several
 * columns of compact rows, searchable by name, formation or hex. Sized for a force of hundreds.
 */
export const unitRosterView = (snapshot: UiSnapshot, state: DeckState): TemplateResult => {
  const sequence = snapshot.view.projection?.sequence;
  const movement = sequence?.phase === 'MOVEMENT' && sequence.segment === 'MOVEMENT';
  const filters = movement
    ? html`<div class="unit-filter" role="group" aria-label="Filter units">${(['all', 'unmoved', 'moved'] as const).map((key) => html`<button data-unit-filter=${key} aria-pressed=${String((state.filter ?? 'all') === key)}>${key === 'all' ? 'All' : key === 'moved' ? `Moved ${snapshot.movedThisPhase.size}` : `Not moved ${unmovedUnits(snapshot)}`}</button>`)}</div>` : nothing;
  return html`<div class="roster-popup" role="dialog" aria-label="All my units">
    <header><strong>My units · ${rosterOwn(snapshot).filter(({ location }) => location.kind !== 'ELIMINATED').length}</strong>
      <input id="roster-search" type="search" .value=${state.search} placeholder="Find by name, formation or hex" aria-label="Find unit">${filters}
      <button id="close-roster" aria-label="Close unit list">×</button></header>
    <div class="roster-body" id="roster-body" data-scroll-key="roster" tabindex="0">${unitRosterBodyView(snapshot, state)}</div>
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
export const phaseControlsView = (snapshot: UiSnapshot, state: DeckState): TemplateResult => {
  const busy = busyOf(snapshot, state);
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
  const undo = snapshot.undoStep ? (snapshot.undoStep.scope === 'ACTION' ? `Undo: ${snapshot.undoStep.label}` : `Undo back to the ${snapshot.undoStep.label}`) : null;
  // The phase picker beside it already names the phase: "End Movement Segment · Next: Barrage Segment", not the phase twice over.
  const sequence = snapshot.view.projection?.sequence;
  const [phase, segment] = sequence ? phaseLabel(sequence.phase, sequence.segment).split(' · ') : [];
  const [nextPhase, nextSegment] = snapshot.endStep.next.split(' · ');
  const endLabel = phase ? `End ${segment ?? phase}` : snapshot.endStep.label;
  const nextLabel = !nextSegment ? snapshot.endStep.next : nextPhase === phase ? nextSegment
    : nextSegment === `${nextPhase} Segment` ? `${nextPhase} Phase` : snapshot.endStep.next;
  // Undo keeps its place when there is nothing to take back, so End phase never jumps sideways under the pointer.
  return html`<div class="phase-actions">
    <button id="undo-step" class="bar-button" title=${undo ?? 'Nothing to undo in this step'} aria-label=${undo ?? 'Undo'} ?disabled=${!undo || busy}><span class="bar-label">↶ Undo</span></button>
    <span class="end-anchor"><button id="end-phase" class="bar-button ${confirming ? 'warning' : snapshot.endStep.enabled ? 'primary' : ''}" ?disabled=${disabled}><span class="bar-label">${confirming
      ? `Finish anyway: ${unmoved} unit${unmoved === 1 ? ' has' : 's have'} not moved`
      : endLabel}</span><small class="bar-sub">${confirming ? 'Press again to confirm' : `Next: ${nextLabel}`}</small></button>
    ${reasons.length > 0 ? html`<p class="end-note" role="status">${reasons.join(' ')}</p>` : nothing}</span>
  </div>`;
};

export const commandDeckView = (snapshot: UiSnapshot, state: DeckState): TemplateResult => {
  const { view } = snapshot;
  const sequence = view.projection?.sequence;
  const busy = busyOf(snapshot, state);
  const own = rosterOwn(snapshot);
  const objective = stepObjective(snapshot);
  const interrupt = interruptPanel(snapshot, state);
  const away = awayPanel(snapshot);
  const tabs = deckTabs(snapshot);
  const active = activeDeckTab(snapshot, state);
  const body = away !== nothing || interrupt !== nothing
    ? html`<div class="deck-body deck-task" data-scroll-key="task" aria-busy=${String(busy)}>${interrupt}${resultPanel(snapshot)}${away}</div>`
    : html`<nav class="deck-tabs" aria-label=${sequence ? phaseLabel(sequence.phase, sequence.segment) : 'Deck'}>${tabs.map(({ id, label, badge }) => html`<button data-deck-tab=${id} aria-pressed=${String(active === id)} aria-label=${badge > 0 ? `${label}, ${badge} waiting` : nothing}>${label}${badge > 0 ? html` <span class="tab-badge" aria-hidden="true">${badge}</span>` : nothing}</button>`)}<button id="open-roster" class="roster-open" aria-haspopup="dialog" title="List every unit you command">All units (${own.filter(({ location }) => location.kind !== 'ELIMINATED').length})</button></nav>
      <div class="deck-body" data-scroll-key=${`tab-${active}`} tabindex="0" aria-busy=${String(busy)}>${resultPanel(snapshot)}<section class="deck-context">${tabBody(snapshot, state, active)}</section></div>`;
  return html`${objective ? html`<p class="deck-objective">${objective}</p>` : nothing}
    ${view.metadata.lifecycle === 'PAUSED' ? html`<p class="paused-banner" role="status">This game was saved paused. <button id="resume-game" class="bar-button">Resume</button></p>` : nothing}
    <section class="deck-selection" aria-label="Selected unit">${selectedCard(snapshot)}${snapshot.selectedPiece || snapshot.selection.hexId ? html`<button id="deselect" class="subtle" title="Finish with this unit and clear the selection (Esc)">Done</button>` : nothing}</section>
    ${body}
    <footer class="deck-footer"><div class="deck-notice" role="status">${snapshot.busy ? 'Working…' : withHexLabels(state.error || snapshot.notice)}</div></footer>`;
};
