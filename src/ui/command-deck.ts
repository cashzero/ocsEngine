import { html, nothing, type TemplateResult } from 'lit-html';
import { repeat } from 'lit-html/directives/repeat.js';
import { unsafeHTML } from 'lit-html/directives/unsafe-html.js';
import type { ProjectedPiece } from '../rules/index.js';
import type { UiSnapshot } from './model.js';
import { ROUTE_LABELS, halfTokenText, isMultiStepDefinition } from '../rules/index.js';
import { airSentences, emphasizeAir } from './air-text.js';
import { counterSvg, counterView, replacementAbbreviation } from './counter.js';
import { combatHeadline, combatOutlook, type CombatReport, type FeedEntry, type NarrativeContext } from './narrative.js';
import { ownOverstackedHexes, type OverstackedHex, phaseLabel, pieceDefinition, pieceLabel, printedHexLabel, STACKING_LIMIT_RE_TICKS, stackingReTicks } from './presenter.js';

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
  /** Why Esc did not let go of the selected unit; dropped once the pick changes or the unit stops moving. */
  hint?: string | undefined;
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
const isAirStrip = (snapshot: UiSnapshot, piece: ProjectedPiece): boolean => pieceDefinition(snapshot.scenario, piece)?.facility?.facilityTypeDefinitionId === 'facility:air-strip';

/** Status word under a unit name: mode for ground units, Active/Inactive for aircraft (14.1a), Level for bases. */
const statusName = (snapshot: UiSnapshot, piece: ProjectedPiece): string => {
  if (isAir(snapshot, piece)) return `${piece.statuses.includes('status:air-inactive') ? 'Inactive' : 'Active'}${piece.remainingSteps === 1 ? ' · reduced' : ''}`;
  if (isAirBase(snapshot, piece)) {
    const level = piece.statusValues.find(({ statusDefinitionId }) => statusDefinitionId === 'status:air-base-level')?.value;
    return `Air Base Level ${level ?? 1}`;
  }
  if (isAirStrip(snapshot, piece)) return 'Air Strip';
  if (pieceDefinition(snapshot.scenario, piece)?.family === 'REPLACEMENT') return 'Replacements';
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
  // A quantity hidden from this seat (4.9a) is null: print "?" rather than a misleading 0.
  if (definition?.family === 'REPLACEMENT') parts.push(`${piece.resourceQuantity ?? '?'} ${replacementAbbreviation(definition)}`);
  if (definition?.family === 'RESOURCE') parts.push(piece.resourceQuantity == null ? '? SP (size hidden)' : `${piece.resourceQuantity}T (${piece.resourceQuantity / 4} SP)`);
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
  // 12.5a with no payment on offer: no friendly dump can draw or throw fuel to this unit.
  const unfuelable = own && !needsFuel && snapshot.moveBlockers.some(({ code }) => code === 'FUEL_REQUIRED');
  const details = own ? supplyDetails(snapshot, piece) : '';
  const paused = snapshot.view.metadata.lifecycle === 'PAUSED';
  const status = !own ? 'Enemy · steps lost and internal stocks are hidden'
    : paused ? 'Paused'
      : arriving ? 'Arriving: click a blue entry hex to place it'
        : needsFuel ? 'Needs fuel before it can move (12.5)'
          : snapshot.reachable.size > 0 ? `${mp(snapshot.remainingTicks)} MP left · ${snapshot.reachable.size} hexes reachable`
            : snapshot.movedThisPhase.has(String(piece.id)) ? 'Already moved this phase'
              : unfuelable ? 'Needs fuel to move (12.5a), but no supply dump in range has the SP to pay for it: bring supply within range first'
                : snapshot.moveBlockers.length > 0 ? snapshot.moveBlockers.map(({ message, rule }) => `${withHexLabels(message)} (${rule})`).join(' · ')
                  : 'Cannot move in this step';
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

/** An air mission's outcome: one sentence per line, with aircraft, rolls and losses picked out (air-text.ts). */
const airLines = (result: string): TemplateResult =>
  html`<ul class="air-log">${airSentences(result).map((sentence) => html`<li>${emphasizeAir(sentence)}</li>`)}</ul>`;

/** A resolved (or withdrawn) combat, shown to both players in plain language. */
export const combatCard = (snapshot: UiSnapshot, report: CombatReport, dismissId = ''): TemplateResult => {
  const air = report.kind === 'AIR_MISSION';
  // An air mission tells its own story, sentence by sentence; the table roll and result code of a ground fight do not apply.
  const rolls = air ? '' : [report.surpriseRoll !== null ? `surprise roll ${report.surpriseRoll}` : '', report.roll !== null ? `${report.kind === 'BARRAGE' ? 'barrage' : 'combat'} roll ${report.roll}` : ''].filter(Boolean).join(' · ');
  return html`<article class="combat-card status-${report.status.toLowerCase()}">
    <header><strong>${combatHeadline(report, narrativeContext(snapshot))}</strong></header>
    ${report.result && !air ? html`<p class="combat-result"><b>${report.result}</b>${rolls ? html` <small>${rolls}</small>` : nothing}</p>` : nothing}
    ${report.kind === 'AIR_MISSION' && report.explanation ? airLines(report.explanation) : html`<p>${report.explanation || 'In progress.'}</p>`}
    ${report.outcomes.length > 0 ? html`<ul>${report.outcomes.map((line) => html`<li>${line}</li>`)}</ul>` : report.status === 'RESOLVED' && !air ? html`<p class="hint">No unit was lost or moved.</p>` : nothing}
    ${dismissId ? html`<button id=${dismissId}>OK</button>` : nothing}
  </article>`;
};

const AIR_MISSION_LINE = 'Air mission: ';
const feedEntry = (entry: FeedEntry & { readonly repeat?: number }): TemplateResult => html`<article class="deck-event" title=${entry.technical}><strong>${entry.title}${(entry.repeat ?? 1) > 1 ? html` <small>×${entry.repeat}</small>` : nothing}</strong>${entry.lines.map((line) => line.startsWith(AIR_MISSION_LINE) ? airLines(line.slice(AIR_MISSION_LINE.length)) : html`<p>${line}</p>`)}</article>`;

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
    <ol class="air-log">${air.log.map((line) => html`<li>${emphasizeAir(withHexLabels(line))}</li>`)}</ol></div>`;
};

const pieceById = (snapshot: UiSnapshot, id: string): ProjectedPiece | undefined =>
  snapshot.view.projection?.stacks.flatMap(({ pieces }) => pieces).find((piece) => piece.id === id);

/** The hexes a click on the map could choose, as buttons, so the choice needs no pointer precision. */
const hexChips = (hexes: readonly string[], label: string): View => hexes.length === 0 ? nothing
  : html`<div class="chip-row hex-chips" role="group" aria-label=${label}>${hexes.slice(0, 60).map((hexId) => html`<button data-target-hex=${hexId}>${printedHexLabel(hexId)}</button>`)}${hexes.length > 60 ? html`<small>and ${hexes.length - 60} more on the map</small>` : nothing}</div>`;

/** Air Transport and Air Drop: where the cargo loads, which Transports carry it and how each flies, what it carries (14.9, 14.10). */
const transportDraftPanel = (snapshot: UiSnapshot, state: DeckState): TemplateResult => {
  const draft = snapshot.air.draft!;
  const transport = draft.transport!;
  const facts = draft.explanation;
  const baseChoice = transport.baseHexIds.length > 1
    ? html`<div class="chip-row" role="group" aria-label="Loaded at">${transport.baseHexIds.map((hexId) => html`<button data-transport-base=${hexId} aria-pressed=${String(hexId === transport.baseHexId)}>Load at ${printedHexLabel(hexId)}</button>`)}</div>` : nothing;
  const art = (id: string): View => { const piece = pieceById(snapshot, id); return piece ? counterFor(snapshot, piece) : nothing; };
  const carriers = transport.carriers.map((carrier) => html`<div class="carrier-row">
    <label class="participant"><input type="checkbox" data-transport-carrier=${carrier.id} .checked=${carrier.selected}>${art(carrier.id)}<span>${carrier.label}<small>carries ${halfTokenText(carrier.capacity)}${carrier.integralGlider ? ' · tows its own glider' : ''}</small></span></label>
    ${carrier.selected && carrier.route ? html`<select data-transport-route=${carrier.id} aria-label="How ${carrier.label} flies">${carrier.allowed.map((route) => html`<option value=${route} ?selected=${route === carrier.route}>${ROUTE_LABELS[route]}</option>`)}</select>` : nothing}</div>`);
  const units = transport.units.map((unit) => html`<label class="participant"><input type="checkbox" data-transport-unit=${unit.id} .checked=${unit.selected}>${art(unit.id)}<span>${unit.label}<small>${halfTokenText(unit.cost)}${unit.planned ? ' · on a Drop Plan for this hex' : ''}</small></span></label>`);
  const escorts = transport.escorts.map((escort) => html`<label class="participant"><input type="checkbox" data-transport-escort=${escort.id} .checked=${escort.selected}>${art(escort.id)}<span>${escort.label}</span></label>`);
  const rows: [string, unknown][] = [
    ['Load', `${text(fact(facts, 'air.cargoLoad') ?? '0T')} of ${text(fact(facts, 'air.cargoCapacity') ?? '0T')} capacity`],
    ...(transport.drop ? (fact(facts, 'air.dropMethod') === undefined ? [] : [['Landing', `${text(fact(facts, 'air.dropMethod'))} · each unit and 1T roll 2d6${fact(facts, 'air.landingDrm') ? ` +${text(fact(facts, 'air.landingDrm'))} (glider)` : ''}; it fails on ${text(fact(facts, 'air.landingFailsOn'))} or less`] as [string, unknown]])
      : fact(facts, 'air.unloadLimit') !== undefined ? [['Unloading', `${text(fact(facts, 'air.unloadCounted'))}T count against ${text(fact(facts, 'air.unloadLimit'))}T left at this base this segment`] as [string, unknown]] : []),
    ['Flak', fact(facts, 'air.flakSubject') ? `+${text(fact(facts, 'air.flakModifier') ?? 0)}${fact(facts, 'air.flakReasons') ? ` (${text(fact(facts, 'air.flakReasons'))})` : ''}; 11+ on 2d6 costs a step` : 'not rolled (not in an enemy Patrol Zone)'],
  ];
  return html`<section class="deck-context air-panel combat-draft" aria-label="${draft.label} plan"><h2>${draft.label} ${printedHexLabel(draft.targetHexId!)}</h2>
    ${baseChoice}
    <small class="step-title">1 · Transports${transport.baseHexId ? ` at ${printedHexLabel(transport.baseHexId)}` : ''} and how they fly</small>
    <div class="participants">${carriers.length > 0 ? carriers : html`<p>No ready Transport can reach this hex.</p>`}</div>
    <small class="step-title">2 · Units to carry</small>
    <div class="participants">${units.length > 0 ? units : html`<p class="hint">No unit in the Air Base hex qualifies: Leg units in Move Mode, MA 10 or less, no more than half their MA spent (14.9c).</p>`}</div>
    <small class="step-title">3 · Supply from the dumps in that hex</small>
    <label class="field">Tokens <input type="number" min="0" max=${transport.tokensAvailable} step="1" id="transport-tokens" .value=${String(transport.tokens)} aria-label="Tokens of supply to carry"> <small>of ${transport.tokensAvailable}T there</small></label>
    ${escorts.length > 0 ? html`<small class="step-title">Other aircraft that fly along</small><div class="participants">${escorts}</div>` : nothing}
    <dl class="combat-facts">${rows.map(([label, value]) => html`<div><dt>${label}</dt><dd>${text(value)}</dd></div>`)}</dl>
    ${explanationBlock(facts)}
    <div class="button-grid"><button id="cancel-air-mission">Cancel</button><button class="primary" id="declare-air-mission" ?disabled=${!(facts?.allowed && !busyOf(snapshot, state))}>Fly ${draft.label}</button></div>
  </section>`;
};

const airDraftPanel = (snapshot: UiSnapshot, state: DeckState): TemplateResult => {
  const draft = snapshot.air.draft!;
  const facts = draft.explanation;
  if (!draft.targetHexId) {
    return html`<section class="deck-context air-panel" aria-label="${draft.label} plan"><h2>${draft.label}</h2>
      <p class="hint">${snapshot.air.targetHexes.length > 0 ? `Click one of the ${snapshot.air.targetHexes.length} highlighted hexes to choose the mission hex, or pick its number here.` : 'No target is in range of a ready aircraft.'}</p>
      ${hexChips(snapshot.air.targetHexes, 'air-target-hexes')}
      <div class="button-grid"><button id="cancel-air-mission">Cancel</button></div></section>`;
  }
  if (draft.transport) return transportDraftPanel(snapshot, state);
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

/** Offered in the Unit tab of an Engineer-Capable unit that can build or improve an Air Base or Air Strip now (13.8d, 15.3). */
const constructionSection = (snapshot: UiSnapshot): View => {
  const construction = snapshot.air.construction;
  if (!construction || construction.planning) return nothing;
  return html`<div class="unit-actions"><strong>Construction</strong>
    <p class="hint">Build or improve an Air Base or Air Strip in a hex within 2 hexes (Leg MP). The supply is paid from dumps in reach, and this unit cannot move afterwards.</p>
    <button id="plan-construction">Build an Air Base or Air Strip… (${construction.hexes.length} hex${construction.hexes.length === 1 ? '' : 'es'})</button></div>`;
};

/** The hex being built in: each thing that can be done there, its cost, and why one cannot. */
const constructionPanel = (snapshot: UiSnapshot, state: DeckState): TemplateResult => {
  const construction = snapshot.air.construction!;
  if (!construction.hexId) {
    return html`<section class="deck-context air-panel" aria-label="Construction plan"><h2>Build an Air Base or Air Strip</h2>
      <p class="hint">Click one of the ${construction.hexes.length} highlighted hexes to choose where to build, or pick its number here.</p>
      ${hexChips(construction.hexes, 'construction-hexes')}
      <div class="button-grid"><button id="cancel-construction">Cancel</button></div></section>`;
  }
  return html`<section class="deck-context air-panel combat-draft" aria-label="Construction plan"><h2>Build at ${printedHexLabel(construction.hexId)}</h2>
    <p class="hint">Pick what to build. Each costs the supply shown, drawn or thrown from dumps in reach; an Air Base rises one Level per turn (15.3).</p>
    <div class="action-list">${construction.options.map((option) => html`<button class="primary" data-build-facility=${option.facility} ?disabled=${!option.explanation.allowed || busyOf(snapshot, state)}>${option.label} <small>· ${option.cost}T${option.cost >= 4 ? ` (${option.cost / 4} SP)` : ''}</small></button>${explanationBlock(option.explanation)}`)}</div>
    <div class="button-grid"><button id="cancel-construction">Cancel</button></div></section>`;
};

const MODE_NAMES: Readonly<Record<string, string>> = { COMBAT: 'Combat Mode', MOVE: 'Move Mode', RESERVE: 'Reserve Mode', STRAT: 'Strat Mode' };

/** Pax and Eq in the Reinforcement Phase: rebuild ground units and trucks lost to the enemy (13.5a-e). */
const groundRebuildPanel = (snapshot: UiSnapshot, state: DeckState): View => snapshot.groundRebuilds.length === 0 ? nothing : html`<div class="air-panel"><strong>Rebuild units</strong>
  <p class="hint">Repls in a hex at or within 2 hexes of an HQ in Combat Mode, and not in an enemy ZOC, rebuild units: each step of an Armor, Mech or artillery unit costs 1 Eq, each step of any other unit 1 Pax. A Dead Pile unit returns in the Repls' hex; a reduced unit must be stacked with them. Units with the no-rebuild dot never return (13.5c).</p>
  ${snapshot.groundRebuilds.map((rebuild) => html`<div class="refit-base"><small>${rebuild.pax} Pax and ${rebuild.eq} Eq at ${printedHexLabel(rebuild.hexId)} · this rebuild costs ${rebuild.cost.pax} Pax and ${rebuild.cost.eq} Eq</small>
    <div class="participants">${rebuild.units.map((unit) => html`<div class="rebuild-unit"><label class="participant plain"><input type="checkbox" data-rebuild-hex=${rebuild.hexId} data-rebuild-unit=${unit.id} .checked=${unit.selected}><span>${unit.label}<small>${unit.deadPile ? 'Dead Pile' : 'reduced here'} · ${unit.missing} step${unit.missing === 1 ? '' : 's'} missing · 1 ${unit.cost === 'PAX' ? 'Pax' : 'Eq'} a step</small></span></label>
      ${unit.selected && unit.missing > 1 ? html`<label class="rebuild-steps">Steps <input type="number" min="1" max=${unit.missing} .value=${String(unit.steps)} data-rebuild-hex=${rebuild.hexId} data-rebuild-steps=${unit.id}></label>` : nothing}
      ${unit.selected && unit.deadPile ? html`<label class="rebuild-mode">Place in <select data-rebuild-hex=${rebuild.hexId} data-rebuild-mode=${unit.id}>${unit.modes.map((mode) => html`<option value=${mode} ?selected=${mode === unit.mode}>${MODE_NAMES[mode] ?? mode}</option>`)}</select></label>` : nothing}</div>`)}</div>
    ${rebuild.truckMax > 0 ? html`<label class="rebuild-trucks">Truck points lost to the enemy to rebuild (1 Eq each, up to ${rebuild.truckMax}) <input type="number" min="0" max=${rebuild.truckMax} .value=${String(rebuild.truckPoints)} data-rebuild-hex=${rebuild.hexId} data-rebuild-trucks="1"></label>` : nothing}
    ${explanationBlock(rebuild.explanation)}
    <button class="primary" data-rebuild-units=${rebuild.hexId} ?disabled=${!(rebuild.explanation?.allowed && !busyOf(snapshot, state))}>Rebuild (${rebuild.cost.pax} Pax, ${rebuild.cost.eq} Eq)</button></div>`)}</div>`;

/** The Rebuild tab: ground units and trucks first, then aircraft. */
const rebuildTab = (snapshot: UiSnapshot, state: DeckState): TemplateResult => html`${groundRebuildPanel(snapshot, state)}${airRebuildPanel(snapshot, state)}`;

/** Eq in the Reinforcement Phase: rebuild lost aircraft at any friendly Air Base (13.5f). */
const airRebuildPanel = (snapshot: UiSnapshot, state: DeckState): View => snapshot.air.rebuilds.length === 0 ? nothing : html`<div class="air-panel"><strong>Rebuild aircraft</strong>
  <p class="hint">Each Eq rebuilds two aircraft steps: a Dead Pile aircraft (two steps) arrives Active at the Air Base you pick; a reduced aircraft stacked with the Eq becomes whole. Eq are never partly used (13.5d).</p>
  ${snapshot.air.rebuilds.map((rebuild) => html`<div class="refit-base"><small>${rebuild.equipment} Eq at ${printedHexLabel(rebuild.hexId)} · this rebuild costs ${rebuild.cost} Eq</small>
    <div class="participants">${rebuild.aircraft.map((plane) => html`<label class="participant plain"><input type="checkbox" data-rebuild-eq=${rebuild.eqPieceId} data-rebuild-aircraft=${plane.id} .checked=${plane.selected}><span>${plane.label}<small>${plane.deadPile ? 'Dead Pile · 2 steps' : 'reduced here · 1 step'}</small></span></label>`)}</div>
    ${rebuild.aircraft.some((plane) => plane.selected && plane.deadPile) ? html`<div class="chip-row" role="group" aria-label="Arrive at Air Base">${rebuild.bases.map((base) => html`<button data-rebuild-eq=${rebuild.eqPieceId} data-rebuild-base=${base.id} aria-pressed=${String(base.selected)}>Arrive at ${printedHexLabel(base.hexId)}</button>`)}</div>` : nothing}
    ${explanationBlock(rebuild.explanation)}
    <button class="primary" data-rebuild=${rebuild.eqPieceId} ?disabled=${!(rebuild.explanation?.allowed && !busyOf(snapshot, state))}>Rebuild ${rebuild.aircraft.filter((plane) => plane.selected).length} aircraft (${rebuild.cost} Eq)</button></div>`)}</div>`;

const refitPanel = (snapshot: UiSnapshot, state: DeckState): View => snapshot.air.refits.length === 0 ? nothing : html`<div class="air-panel"><strong>Aircraft refit</strong>
  <p class="hint">Each Air Base refits once: up to 2 × Level Inactive aircraft for 1T drawn or thrown to the base (15.1).</p>
  <p class="hint">A base in an un-negated enemy ZOC cannot refit (15.1C), and no base holds more Active aircraft than its limit (14.2a).</p>
  ${snapshot.air.refits.map((refit) => html`<div class="refit-base"><small>${refit.level === 0 ? 'Air Strip' : `Air Base Level ${refit.level}`} ${printedHexLabel(refit.hexId)} · refits up to ${refit.capacity} · Active ${refit.active} of ${refit.activeLimit} · ${refit.zocBlocked ? html`<strong class="is-blocked">in an enemy ZOC: cannot refit</strong>` : 'not in an enemy ZOC'}</small>
    <div class="participants">${refit.inactiveIds.map((id) => { const piece = pieceById(snapshot, id); return piece ? html`<label class="participant"><input type="checkbox" data-refit-base=${refit.baseId} data-refit-aircraft=${id} .checked=${refit.selectedIds.includes(id)}>${counterFor(snapshot, piece)}<span>${pieceLabel(snapshot.scenario, piece)}</span></label>` : nothing; })}</div>
    ${explanationBlock(refit.explanation)}${refit.sourceIds.length === 0 && !refit.zocBlocked ? html`<p class="hint">No supply dump can pay 1T to this base now (12.9c).</p>` : nothing}
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
  const isAirDecision = ['AIR_ABORT', 'AIR_COMBAT_PICK', 'INTERCEPTION', 'MISSION_LOSS', 'AIR_RETURN'].includes(decision.kind);
  const title = sheet ? `${sheet.role === 'DEFENDER' ? 'Defend' : what} ${combat ? printedHexLabel(combat.targetHexId) : ''}` : 'Your decision';
  return html`<section class="deck-context decision-panel" aria-label="Decision">
    <p class="eyebrow">${title.toUpperCase()}</p>${steps}${summary}${answers}
    <h2>${isAirDecision ? emphasizeAir(withHexLabels(decision.prompt)) : withHexLabels(decision.prompt)}</h2>
    ${hexChoice ? html`<p class="hint">Click a highlighted hex on the map, or choose below.</p>` : nothing}
    ${snapshot.autoPay ? html`<button class="primary" id="auto-pay">Pay automatically from the largest dumps</button>` : nothing}
    <div class="decision-options">${decision.options.map(({ id, label }) => html`<button class="decision-option" data-choice=${id}>${isAirDecision ? emphasizeAir(withHexLabels(label)) : withHexLabels(label)}</button>`)}</div>
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
  if (snapshot.air.dropDraft) return dropDraftPanel(snapshot, state);
  if (snapshot.air.construction?.planning) return constructionPanel(snapshot, state);
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
  // Rebuilding with Pax and Eq is optional work, so the tab never carries a count.
  if (snapshot.groundRebuilds.length > 0 || snapshot.air.rebuilds.length > 0) tabs.push({ id: 'rebuild', label: 'Rebuild', badge: 0 });
  if (phase === 'COMBAT' || phase === 'EXPLOITATION' || segment === 'COMBAT' || segment === 'BARRAGE') {
    tabs.push({ id: 'targets', label: 'Targets', badge: new Set([...snapshot.attackTargets, ...snapshot.barrageTargets]).size });
  }
  if (phase !== 'AIRCRAFT_REFIT') tabs.push({ id: 'unit', label: 'Unit', badge: 0 });
  // Air missions are optional in every step that offers them, so Air never takes the lead from the step's own work and never carries a
  // "waiting for you" count: a Base Transfer being possible is not something the player has to deal with.
  if (snapshot.air.missions.length > 0) tabs.push({ id: 'air', label: 'Air', badge: 0 });
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
const WORK_LISTS: readonly string[] = ['arrivals', 'supply', 'refit', 'rebuild'];

/** Call before drawing: a new phase forgets the previous pick, and choosing a unit opens its Unit tab. */
export const syncDeckTab = (snapshot: UiSnapshot, state: DeckState): void => {
  const key = phaseKey(snapshot);
  if (state.tab && state.tab.key !== key) state.tab = undefined;
  const piece = snapshot.selection.pieceId;
  if (piece && piece !== state.lastPiece && !WORK_LISTS.includes(activeDeckTab(snapshot, state)) && deckTabs(snapshot).some(({ id }) => id === 'unit')) {
    state.tab = { key, id: 'unit' };
  }
  if (piece !== state.lastPiece || !snapshot.selectedIsMoving) state.hint = undefined;
  state.lastPiece = piece;
};

const arrivalsTab = (snapshot: UiSnapshot): TemplateResult => {
  if (snapshot.arrivals.length === 0) return html`<p class="hint">All reinforcements are placed.</p>`;
  const pieces = snapshot.view.projection?.stacks.flatMap(({ pieces: stackPieces }) => stackPieces) ?? [];
  // Unit first, then hex: the entry hexes are picked on the map, where they show blue; the panel lists only the units.
  return html`<div class="arrivals"><strong>Reinforcements arriving (${snapshot.arrivals.length})</strong><p class="hint">Select a unit, then click a blue entry hex on the map (aircraft arrive at an Air Base, Eq at an entry hex or beside an HQ).</p>${snapshot.arrivals.map(({ pieceId }) => {
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
    const breakout = snapshot.stepActions.filter(({ group }) => group === 'BREAKOUT');
    const block = (title: string, hint: string, entries: typeof recovery): View => entries.length === 0 ? nothing
      : html`<div class="step-actions"><strong>${title}</strong><p class="hint">${hint}</p>${actionButtons(entries)}</div>`;
    parts.push(block('Recover internal stocks (required first)', 'Units marked Low or Exhausted must recover from dumps in reach before anything else this phase (12.10e).', recovery),
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

/** Planned Air Drops (14.10b): change them in the Aircraft Refit Phase (14.10c), make new ones there. */
const dropPlansSection = (snapshot: UiSnapshot, state: DeckState): View => {
  if (!snapshot.air.dropPlanning && snapshot.air.dropPlans.length === 0) return nothing;
  const editable = snapshot.air.dropPlanning;
  return html`<div class="air-panel drop-plans"><strong>Drop Plans</strong>
    ${snapshot.air.dropPlans.length === 0 ? html`<p class="hint">No Air Drop is planned.</p>` : snapshot.air.dropPlans.map((plan) => html`<div class="refit-base"><small>${plan.units.map(({ label }) => label).join(', ')} → ${printedHexLabel(plan.hexId)} on turn ${plan.turn}${plan.dueNow ? ' (this turn)' : ''}</small>
      ${editable ? html`<div class="chip-row"><button data-drop-plan=${plan.id} data-drop-change="DELAY" ?disabled=${busyOf(snapshot, state)}>Delay one turn</button><button data-drop-plan=${plan.id} data-drop-change="CANCEL" ?disabled=${busyOf(snapshot, state)}>Cancel</button></div>` : nothing}</div>`)}
    ${editable ? html`<button id="start-drop-plan" ?disabled=${busyOf(snapshot, state)}>Plan an Air Drop…</button><p class="hint">A drop of combat units is planned here two turns ahead (in the first Refit Phase of the game, for any turn) and flown in that turn's Movement Phase with Air Drop (14.10b).</p>` : nothing}</div>`;
};

/** The Drop Plan being made: units, the hex (click it on the map) and the turn. */
const dropDraftPanel = (snapshot: UiSnapshot, state: DeckState): TemplateResult => {
  const draft = snapshot.air.dropDraft!;
  return html`<section class="deck-context air-panel combat-draft" aria-label="Drop Plan"><h2>Plan an Air Drop</h2>
    <p class="hint">Tick the units, click the drop hex on the map, and choose the Game Turn (turn ${draft.earliestTurn} or later now).</p>
    <div class="participants">${draft.candidates.length > 0 ? draft.candidates.map((unit) => html`<label class="participant"><input type="checkbox" data-drop-unit=${unit.id} .checked=${unit.selected}>${(() => { const piece = pieceById(snapshot, unit.id); return piece ? counterFor(snapshot, piece) : nothing; })()}<span>${unit.label}<small>${unit.para ? 'Para unit' : 'Leg unit (needs glider Transports)'}</small></span></label>`) : html`<p>No unit qualifies.</p>`}</div>
    <dl class="combat-facts"><div><dt>Drop hex</dt><dd>${draft.hexId ? printedHexLabel(draft.hexId) : 'click a hex on the map'}</dd></div>
      <div><dt>Hex number</dt><dd><input type="text" id="drop-hex" inputmode="numeric" maxlength="4" placeholder="0507" aria-label="Drop hex number" .value=${draft.hexId ? printedHexLabel(draft.hexId) : ''}></dd></div>
      <div><dt>Game Turn</dt><dd><input type="number" id="drop-turn" min=${draft.earliestTurn} step="1" .value=${String(draft.turn)} aria-label="Game Turn of the drop"></dd></div></dl>
    ${explanationBlock(draft.explanation)}
    <div class="button-grid"><button id="cancel-drop-plan">Cancel</button><button class="primary" id="confirm-drop-plan" ?disabled=${!(draft.explanation?.allowed && !busyOf(snapshot, state))}>Plan the drop</button></div></section>`;
};

const refitTab = (snapshot: UiSnapshot, state: DeckState): View => html`${snapshot.air.refits.length > 0 ? refitPanel(snapshot, state) : html`<p class="hint">No Air Base has aircraft to refit.</p>`}${dropPlansSection(snapshot, state)}`;

const targetsTab = (snapshot: UiSnapshot): TemplateResult => {
  const segment = snapshot.view.projection?.sequence.segment;
  const chips = (title: string, verb: string, hexes: readonly string[]): View => hexes.length === 0 ? nothing
    : html`<div class="target-list"><strong>${title}</strong><div class="chip-row">${hexes.map((hexId) => html`<button data-target-hex=${hexId}>${verb} ${printedHexLabel(hexId)}</button>`)}</div></div>`;
  if (snapshot.attackTargets.length === 0 && snapshot.barrageTargets.length === 0) {
    return html`<p class="hint">${segment === 'BARRAGE' ? 'No barrage targets in range.' : 'No enemy hex can be attacked.'}</p>`;
  }
  return html`${chips(segment === 'COMBAT' ? 'Enemy hexes you can attack' : 'Enemy hexes the selected unit can overrun', segment === 'COMBAT' ? 'Attack' : 'Overrun', snapshot.attackTargets)}${chips('Enemy hexes in artillery range', 'Barrage', snapshot.barrageTargets)}`;
};

const airTab = (snapshot: UiSnapshot): TemplateResult => html`${airMissionButtons(snapshot)}<p class="hint">Pick a mission, then a highlighted target hex and the aircraft that fly it.</p>${dropPlansSection(snapshot, { search: '', working: false })}`;

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
  const fuelsOf = (method: string): readonly string[] => entries.find((entry) => methodOf(entry) === method)?.fuels ?? [];
  const step1 = html`<div class="fuel-step"><small class="step-title">1 · What to fuel</small><div class="chip-row">${methods.map((method) => {
    const info = FUEL_METHODS[method] ?? { title: method, detail: '' };
    const count = fuelsOf(method).length;
    return html`<button data-fuel-method=${method} aria-pressed=${String(method === picked)} class=${method === picked ? 'is-picked' : ''}>${info.title}<small> · ${info.detail}${count > 0 ? ` · fuels ${count}` : ''}</small></button>`;
  })}</div></div>`;
  const fueled = picked === null ? [] : fuelsOf(picked);
  const fuels = fueled.length > 0 ? html`<p class="hint fuel-covers">Fuels ${fueled.length} unit${fueled.length === 1 ? '' : 's'}: ${fueled.join(', ')}</p>` : nothing;
  const dumps = picked === null ? html`<p class="hint">Choose what to fuel first; then you pick the supply dump that pays.</p>`
    : html`<div class="fuel-step"><small class="step-title">2 · Pay from which dump</small>${fuels}<div class="action-list">${entries.filter((entry) => methodOf(entry) === picked).map(({ key, label, action }) => {
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
    const groups: [string, string][] = [['BREAKDOWN', 'Breakdowns'], ['FUEL', 'Fuel'], ['SUPPLY', 'Supply'], ['BREAKOUT', 'Breakout'], ['TRANSPORT', 'Trucks'], ['DUMP', 'Dump'], ['AIR', 'Air']];
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
  if (snapshot.air.construction && !snapshot.air.construction.planning) parts.push(constructionSection(snapshot));
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
    case 'rebuild': return rebuildTab(snapshot, state);
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
  const already = (snapshot.view.projection?.stacks ?? []).flatMap(({ pieces }) => pieces)
    .filter((piece) => piece.ownerId === snapshot.view.playerId && piece.location.kind === 'ON_MAP' && piece.location.hexId === preview.destinationHexId && piece.id !== snapshot.selectedPiece?.id);
  const total = already.reduce((sum, piece) => sum + stackingReTicks(snapshot.scenario, piece), 0) + (snapshot.selectedPiece ? stackingReTicks(snapshot.scenario, snapshot.selectedPiece) : 0);
  const overstacks = total > STACKING_LIMIT_RE_TICKS;
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
    ${overstacks ? html`<p class="warning overstack-warning" role="alert">⚠ Overstack: ending here puts ${total / 4} RE in one hex (limit ${STACKING_LIMIT_RE_TICKS / 4}). Unless it is back to 10 RE or fewer when the segment ends, you must eliminate units <cite>4.8a</cite></p>` : nothing}
    ${reasons.length > 0 ? html`<p class="blocker">${withHexLabels(reasons[0]!.message)} <cite>${reasons[0]!.rule}</cite></p>${reasons.length > 1 ? html`<p class="hint">${reasons.length - 1} more reason${reasons.length === 2 ? '' : 's'} in the Unit tab.</p>` : nothing}` : nothing}
    ${endsWarning}
    <div class="button-grid"><button id="cancel-move">Cancel</button><button class="primary" id="confirm-move" ?disabled=${!(preview.explanation.allowed && !busyOf(snapshot, state))}>${endsPiece || overstacks ? 'Confirm anyway' : 'Confirm'}</button></div>
  </div>`;
};

const unitFormation = (snapshot: UiSnapshot, piece: ProjectedPiece): string => {
  const formation = pieceDefinition(snapshot.scenario, piece)?.ownership.formationDefinitionId;
  return formation ? snapshot.formationNames.get(String(formation)) ?? '' : '';
};

/**
 * Every unit the player commands. A supply dump is supply lying on the map, not a unit, so it is never listed or counted here (it is
 * reached on the map and in the stack picker); SP a truck carries is part of that truck, not another unit. An air base is a facility
 * on the map in the same way, so it is left out too.
 */
const rosterOwn = (snapshot: UiSnapshot): ProjectedPiece[] =>
  (snapshot.view.projection?.stacks ?? []).flatMap((stack) => stack.pieces)
    .filter((piece) => piece.ownerId === snapshot.view.playerId && piece.role !== 'CARGO' && piece.role !== 'DUMP' && !isAirBase(snapshot, piece));

/** Trucks and extenders haul supply rather than fight, so the roster lists them in a group of their own after the formations. */
const isTransport = ({ role }: ProjectedPiece): boolean => role === 'TRUCK' || role === 'EXTENDER';

/** HQs belong to no formation (3.2f) and throw supply and fuel, so the roster lists them first in a group of their own. */
const isHqPiece = ({ role }: ProjectedPiece): boolean => role === 'HQ';

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
  // 3.2f: a single-counter division is a multi-step unit, not an independent one (HQ fuel does not cover it), so it is listed apart.
  const divisions: ProjectedPiece[] = [];
  const independents: ProjectedPiece[] = [];
  for (const piece of active.filter((piece) => !isHqPiece(piece) && !isTransport(piece) && !isAir(snapshot, piece))) {
    const name = unitFormation(snapshot, piece);
    if (name) groups.set(name, [...(groups.get(name) ?? []), piece]);
    else if (isMultiStepDefinition(pieceDefinition(snapshot.scenario, piece))) divisions.push(piece);
    else independents.push(piece);
  }
  const row = (piece: ProjectedPiece): TemplateResult => html`<button class="roster-unit${piece.id === snapshot.selection.pieceId ? ' is-selected' : ''}" data-piece=${piece.id} data-roster-pick=${piece.id} aria-label=${`${pieceLabel(snapshot.scenario, piece)}, ${pieceHex(piece)}`}>
    <span class="roster-art" aria-hidden="true">${counterFor(snapshot, piece)}</span><span class="roster-text">${pieceLabel(snapshot.scenario, piece)}<small>${pieceHex(piece)} · ${statusName(snapshot, piece)}</small></span>${badges(snapshot, piece)}</button>`;
  const rows = (pieces: ProjectedPiece[]) => repeat(pieces.sort(byName), (piece) => piece.id, row);
  // Air units fly missions from air bases rather than move with a formation, so they get a group of their own before the Trucks.
  const air = active.filter((piece) => isAir(snapshot, piece));
  const transport = active.filter(isTransport);
  const hqs = active.filter(isHqPiece);
  const sorted: { key: string; name: string; pieces: ProjectedPiece[]; extra: string }[] = [
    ...(hqs.length > 0 ? [{ key: 'hq', name: 'HQ', pieces: hqs, extra: ' roster-hq' }] : []),
    ...[...groups.entries()].sort(([left], [right]) => left.localeCompare(right)).map(([name, pieces]) => ({ key: `formation:${name}`, name, pieces, extra: '' })),
    ...(divisions.length > 0 ? [{ key: 'multi-step', name: 'Multi-step divisions', pieces: divisions, extra: ' roster-multi-step' }] : []),
    ...(independents.length > 0 ? [{ key: 'independent', name: 'Independent units', pieces: independents, extra: ' roster-independent' }] : []),
    ...(air.length > 0 ? [{ key: 'air', name: 'Air', pieces: air, extra: ' roster-air' }] : []),
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

/**
 * The player's Hexes that are over 10 RE right now. 4.8a checks them only when a segment or phase ends (never in the
 * Reinforcement Phase), so until then this is a warning: ending the step with any of them forces eliminations.
 */
export const endOverstack = (snapshot: UiSnapshot): readonly OverstackedHex[] => {
  const projection = snapshot.view.projection;
  if (!projection || projection.sequence.phase === 'REINFORCEMENT' || snapshot.view.metadata.lifecycle !== 'ACTIVE') return [];
  return ownOverstackedHexes(snapshot.scenario, projection.stacks.flatMap(({ pieces }) => pieces), String(snapshot.view.playerId));
};

const overstackNote = (overstacked: readonly OverstackedHex[]): TemplateResult | typeof nothing => overstacked.length === 0 ? nothing
  : html`<p class="end-note overstack-note warning" role="alert">⚠ Overstacked: ${overstacked.map(({ hexId, reTicks }) => `${printedHexLabel(hexId)} holds ${reTicks / 4} RE`).join(', ')} (limit ${STACKING_LIMIT_RE_TICKS / 4}). Move units out before ending this step or you must eliminate units <cite>4.8a</cite></p>`;

/** Undo and End phase, drawn beside the phase chip in the top bar, with the reasons the phase cannot end yet. */
export const phaseControlsView = (snapshot: UiSnapshot, state: DeckState): TemplateResult => {
  const busy = busyOf(snapshot, state);
  const unmoved = unmovedUnits(snapshot);
  const overstacked = endOverstack(snapshot);
  const disabled = !(snapshot.endStep.enabled && !busy && !snapshot.decision && !snapshot.draft && snapshot.view.metadata.lifecycle === 'ACTIVE');
  const confirming = state.confirmEnd && (unmoved > 0 || overstacked.length > 0);
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
    <span class="end-anchor"><button id="end-phase" class="bar-button ${confirming || overstacked.length > 0 ? 'warning' : snapshot.endStep.enabled ? 'primary' : ''}" ?disabled=${disabled}><span class="bar-label">${confirming
      ? overstacked.length > 0
        ? `Finish anyway: ${overstacked.length} hex${overstacked.length === 1 ? ' is' : 'es are'} overstacked`
        : `Finish anyway: ${unmoved} unit${unmoved === 1 ? ' has' : 's have'} not moved`
      : endLabel}</span><small class="bar-sub">${confirming ? 'Press again to confirm' : `Next: ${nextLabel}`}</small></button>
    ${reasons.length > 0 || (!handingOver && (absorptionNote(snapshot) !== nothing || overstacked.length > 0))
      ? html`<div class="end-notes">${reasons.length > 0 ? html`<p class="end-note" role="status">${reasons.join(' ')}</p>` : nothing}${handingOver ? nothing : html`${overstackNote(overstacked)}${absorptionNote(snapshot)}`}</div>`
      : nothing}</span>
  </div>`;
};

/** 20.0d: name the player's Breakdowns that reduced units will absorb when the phase ends, before End is pressed. */
const absorptionNote = (snapshot: UiSnapshot): TemplateResult | typeof nothing => {
  const absorptions = snapshot.view.projection?.breakdownAbsorptions ?? [];
  if (absorptions.length === 0) return nothing;
  const pieces = new Map((snapshot.view.projection?.stacks ?? []).flatMap(({ pieces: stack }) => stack).map((piece) => [String(piece.id), piece]));
  const name = (pieceId: string) => { const piece = pieces.get(pieceId); return piece ? pieceLabel(snapshot.scenario, piece) : 'a unit'; };
  const lines = absorptions.map(({ breakdownId, absorberIds }) => absorberIds.length === 1
    ? `${name(breakdownId)} rejoins ${name(absorberIds[0]!)}`
    : `${name(breakdownId)} is absorbed by ${absorberIds.map(name).join(' or ')} (you choose)`);
  return html`<p class="end-note absorb-note" role="status">When this phase ends: ${lines.join('; ')} <cite>20.0d</cite></p>`;
};

/**
 * A unit that has begun moving can only be let go by finishing its move (6.1g): Done ends it for the phase.
 * Anything else selected is simply deselected, as Esc does.
 */
const selectionButton = (snapshot: UiSnapshot, busy: boolean): TemplateResult | typeof nothing => {
  if (snapshot.selectedIsMoving) {
    const left = snapshot.remainingTicks ?? 0;
    const title = left > 0 ? `Finish this unit's move: its ${mp(left)} MP left cannot be used again this phase (6.1g)` : 'Finish this unit\'s move (6.1g)';
    return html`<button id="finish-move" class="primary" title=${title} ?disabled=${busy}>Done</button>`;
  }
  return snapshot.selectedPiece || snapshot.selection.hexId
    ? html`<button id="deselect" class="subtle" title="Clear the selection (Esc)">Deselect</button>` : nothing;
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
    <section class="deck-selection" aria-label="Selected unit">${selectedCard(snapshot)}${selectionButton(snapshot, busy)}</section>
    ${body}
    <footer class="deck-footer"><div class="deck-notice" role="status">${snapshot.busy ? 'Working…' : withHexLabels(state.error || state.hint || snapshot.notice)}</div></footer>`;
};
