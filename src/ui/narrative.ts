import type { PlayerId } from '../core/index.js';
import type { HistoryRecord } from '../gameplay/index.js';
import {
  COMBAT_TABLE_COLUMNS,
  COMBAT_TABLE_ROWS,
  PHASE_SEGMENTS,
  combatTableRowIndex,
  parseBarrageResult,
  parseCombatResult,
  type CombatLine,
  type ProjectedCombat,
  type RuleEvent,
  type RulePhase,
  type TurnSequenceState,
} from '../rules/index.js';
import { phaseLabel, printedHexLabel } from './presenter.js';

/**
 * Player-facing narrative of the game: readable log lines, combat reports and the turn track.
 * Everything here is derived from accepted history records, never from raw rule state.
 */

export interface NarrativeContext {
  readonly viewerId: PlayerId;
  readonly playerName: (playerId: PlayerId | string) => string;
  /** Name and owner of a piece, or null when the viewer cannot know it. */
  readonly piece: (pieceId: string) => { readonly name: string; readonly ownerId: PlayerId } | null;
}

export interface FeedEntry {
  readonly revision: number;
  readonly turn: number;
  /** The player who acted, or null for automatic sequence steps. */
  readonly actorId: PlayerId | null;
  readonly title: string;
  readonly lines: readonly string[];
  /** Engine summary kept for diagnostics. */
  readonly technical: string;
}

export interface CombatReport {
  readonly transactionId: string;
  readonly kind: 'COMBAT' | 'OVERRUN' | 'BARRAGE' | 'AIR_MISSION';
  readonly attackerId: PlayerId;
  readonly targetHexId: string;
  /** Public combat facts last seen before the result (odds, DRM, strengths). */
  readonly facts: ProjectedCombat | null;
  readonly result: string | null;
  readonly explanation: string;
  readonly surpriseRoll: number | null;
  readonly roll: number | null;
  readonly outcomes: readonly string[];
  readonly status: 'OPEN' | 'RESOLVED' | 'CANCELLED';
  readonly declaredRevision: number;
  readonly lastRevision: number;
}

export type TrackStatus = 'done' | 'skipped' | 'current' | 'upcoming';

export interface TrackStep {
  readonly phase: RulePhase;
  readonly label: string;
  readonly actorId: PlayerId;
  readonly status: TrackStatus;
}

const signed = (value: number): string => (value > 0 ? `+${value}` : value < 0 ? `−${-value}` : '0');
const plural = (count: number, word: string): string => `${count} ${word}${count === 1 ? '' : 's'}`;

/** Plain-language reading of a Combat Table cell such as "AL1o1/Do1" (9.9–9.13). */
export const explainCombatResult = (text: string): string => {
  const result = parseCombatResult(text);
  const side = (name: string, loss: number, option: number): string => {
    const parts = [loss > 0 ? `loses ${plural(loss, 'step')}` : '', option > 0 ? `takes ${plural(option, 'option')} (each a step loss or a hex of retreat)` : ''].filter(Boolean);
    return `${name} ${parts.length > 0 ? parts.join(' and ') : 'is unaffected'}`;
  };
  return [
    side('Attacker', result.attacker.loss, result.attacker.option),
    side('defender', result.defender.loss, result.defender.option),
    result.defenderDisorganized ? 'the defenders become Disorganized' : '',
    result.exploitRating !== null ? `attackers with Action Rating ${result.exploitRating}+ may enter Exploit mode` : '',
  ].filter(Boolean).join('; ') + '.';
};

/** Plain-language reading of a Barrage Table cell (10.0a). */
export const explainBarrageResult = (text: string): string => {
  const result = parseBarrageResult(text);
  switch (result.kind) {
    case 'NONE': return 'No effect.';
    case 'DG': return 'The target is Disorganized.';
    case 'BRACKETED_HALF': return 'Bracketed half result: a die decides between a step loss and Disorganization (10.0a).';
    case 'HALF': return 'Half result: a die decides between a step loss and Disorganization (10.0a).';
    case 'STEPS': return `The target loses ${plural(result.steps, 'step')}.`;
  }
};

/** Chance of each outcome on one Combat Table column for 2d6 + DRM, ignoring Surprise (9.8, 9.9). */
export const combatOutlook = (line: string, column: string, drm: number): { attackerStep: number; attackerHurt: number; defenderHurt: number; exploit: number } | null => {
  const columns = COMBAT_TABLE_COLUMNS[line as CombatLine];
  if (!columns) return null;
  const index = columns.findIndex(({ attacker, defender }) => `${attacker}:${defender}` === column);
  if (index < 0) return null;
  let attackerStep = 0; let attackerHurt = 0; let defenderHurt = 0; let exploit = 0;
  for (let first = 1; first <= 6; first += 1) {
    for (let second = 1; second <= 6; second += 1) {
      const cell = COMBAT_TABLE_ROWS[combatTableRowIndex(first + second + drm)]![index]!;
      const result = parseCombatResult(cell);
      if (result.attacker.loss > 0) attackerStep += 1;
      if (result.attacker.loss + result.attacker.option > 0) attackerHurt += 1;
      if (result.defender.loss + result.defender.option > 0 || result.defenderDisorganized) defenderHurt += 1;
      if (result.exploitRating !== null) exploit += 1;
    }
  }
  return { attackerStep: attackerStep / 36, attackerHurt: attackerHurt / 36, defenderHurt: defenderHurt / 36, exploit: exploit / 36 };
};

const stepName = (sequence: Pick<TurnSequenceState, 'phase' | 'segment'>): string => phaseLabel(sequence.phase, sequence.segment);

const NEXT_PHASE: Readonly<Partial<Record<RulePhase, RulePhase>>> = {
  WEATHER: 'FIRST_PLAYER', FIRST_PLAYER: 'AIRCRAFT_REFIT', AIRCRAFT_REFIT: 'REINFORCEMENT', REINFORCEMENT: 'MOVEMENT',
  MOVEMENT: 'SUPPLY', SUPPLY: 'REACTION', REACTION: 'COMBAT', COMBAT: 'EXPLOITATION', EXPLOITATION: 'CLEAN_UP',
  CLEAN_UP: 'AIRCRAFT_REFIT', TURN_END: 'WEATHER',
};

/** Name of the step that nominally follows (2.2); steps without legal actions are passed automatically. */
export const nominalNextStep = (sequence: Pick<TurnSequenceState, 'phase' | 'segment'>): string => {
  const segments = PHASE_SEGMENTS[sequence.phase];
  const index = segments?.indexOf(sequence.segment) ?? -1;
  if (segments && index >= 0 && index < segments.length - 1) return phaseLabel(sequence.phase, segments[index + 1]!);
  const next = NEXT_PHASE[sequence.phase];
  if (!next) return 'Game end';
  return phaseLabel(next, 'NONE');
};

const TRACK_PHASES: readonly RulePhase[] = ['REINFORCEMENT', 'MOVEMENT', 'SUPPLY', 'REACTION', 'COMBAT', 'EXPLOITATION', 'CLEAN_UP'];

/**
 * The current Player Turn as a strip of phases: done, automatically passed (no legal action),
 * current, or still to come. The non-phasing player acts in the Reaction Phase (7.0).
 */
export const playerTurnTrack = (records: readonly HistoryRecord[], current: TurnSequenceState, otherPlayerId: PlayerId): readonly TrackStep[] => {
  const rested = new Set<string>();
  const turnKey = (sequence: TurnSequenceState) => `${sequence.gameTurn}:${sequence.playerTurnIndex}`;
  const currentTurn = turnKey(current);
  const traversed = new Set<RulePhase>();
  let resting: TurnSequenceState | null = null;
  for (const record of records) {
    const advances = record.events.filter((event): event is Extract<RuleEvent, { kind: 'SEQUENCE_ADVANCED' }> => event.kind === 'SEQUENCE_ADVANCED');
    resting ??= advances[0]?.from ?? null;
    // Any action other than ending a step means the player stopped in that phase.
    if (record.action.kind !== 'ADVANCE_SEQUENCE' && resting && turnKey(resting) === currentTurn) rested.add(resting.phase);
    advances.forEach((event, index) => {
      if (turnKey(event.to) !== currentTurn) return;
      traversed.add(event.to.phase);
      if (index === advances.length - 1) rested.add(event.to.phase);
    });
    if (advances.length > 0) resting = advances.at(-1)!.to;
  }
  rested.add(current.phase);
  const currentIndex = TRACK_PHASES.indexOf(current.phase);
  const finished = currentIndex < 0 && (current.phase === 'TURN_END' || current.phase === 'COMPLETE');
  return TRACK_PHASES.map((phase, index) => {
    const past = index < currentIndex || finished;
    // A past phase the sequence went through without stopping was passed automatically.
    const status: TrackStatus = index === currentIndex ? 'current'
      : past ? (traversed.has(phase) && !rested.has(phase) ? 'skipped' : 'done') : 'upcoming';
    return {
      phase,
      label: phaseLabel(phase, 'NONE').replace(/ Phase$/u, ''),
      actorId: phase === 'REACTION' ? otherPlayerId : current.phasingPlayerId,
      status,
    };
  });
};

const hex = (hexId: string | null | undefined): string => (hexId ? printedHexLabel(hexId) : 'off map');
const withPrintedHexIds = (text: string): string => text.replace(/-?\d+,-?\d+/gu, (hexId) => printedHexLabel(hexId));

/** What a decision was about, read from its ID (combat decisions embed their kind; see combat.ts, lifecycle.ts). */
const DECISION_VERBS: readonly (readonly [string, string])[] = [
  [':SUPPLY_SOURCE:', 'chose a combat supply source'], [':DEFENDER_LEAD:', 'chose the defending Action Rating unit'],
  [':DEFENDER_TERRAIN:', 'chose the defending terrain'], [':STEP_LOSS:', 'chose which unit loses a step'],
  [':OPTION_SPLIT:', 'applied a combat option'], [':RETREAT_HEX:', 'chose a retreat hex'], [':ADVANCE_HEX:', 'chose the advance after combat'],
  ['decision:first-player:', 'chose the turn order'], ['decision:overstack:', 'removed units from an overstacked hex'],
  ['decision:breakdown-absorb:', 'chose which unit absorbs a Breakdown'],
  ['decision:interrupt:', 'resolved attrition or displaced trucks'],
];
const decisionVerb = (decisionId: string): string => DECISION_VERBS.find(([marker]) => decisionId.includes(marker))?.[1] ?? 'made a decision';

/** One readable entry per accepted record; enemy logistics stay private, combat results are public (4.9). */
export const describeRecord = (record: HistoryRecord, context: NarrativeContext): FeedEntry => {
  const actorId = record.action.actorId;
  const own = actorId === context.viewerId;
  const who = own ? 'You' : context.playerName(actorId);
  const lines: string[] = [];
  const name = (pieceId: string): string => context.piece(pieceId)?.name ?? 'a unit';
  const isOwn = (pieceId: string): boolean => context.piece(pieceId)?.ownerId === context.viewerId;
  const advances = record.events.filter((event): event is Extract<RuleEvent, { kind: 'SEQUENCE_ADVANCED' }> => event.kind === 'SEQUENCE_ADVANCED');
  let title: string;
  const action = record.action;
  switch (action.kind) {
    case 'ADVANCE_SEQUENCE': title = String(action.actionId).startsWith('ui:auto-pass:') && advances[0]
      ? `${stepName(advances[0].from)} of ${context.playerName(actorId)} passed: only dump blowing was possible`
      : advances[0] ? `${who} finished ${stepName(advances[0].from)}` : `${who} ended the step`; break;
    case 'MOVE_PIECE': {
      // 6.1f: a stack moving together is one entry.
      const together = (action.companionIds ?? []).length;
      title = own || isOwn(action.pieceId)
        ? `${name(action.pieceId)}${together > 0 ? ` and ${together} more` : ''} moved ${hex(action.path[0])} → ${hex(action.path.at(-1))}`
        : together > 0 ? `An enemy stack of ${together + 1} units moved to ${hex(action.path.at(-1))}` : `An enemy unit moved to ${hex(action.path.at(-1))}`;
      break;
    }
    case 'DECLARE_COMBAT': title = `${who} ${action.combatKind === 'OVERRUN' ? 'overran' : 'attacked'} ${hex(action.targetHexId)}`; break;
    case 'DECLARE_BARRAGE': title = `${who} barraged ${action.target === 'AIR_BASE' ? 'the Air Base at ' : action.target === 'PORT' ? 'the port at ' : ''}${hex(action.targetHexId)}`; break;
    case 'DECLARE_AIR_MISSION': title = `${who} flew ${action.mission.replaceAll('_', ' ').toLowerCase()} at ${hex(action.targetHexId)}`; break;
    case 'BUILD_AIR_BASE': title = `${who} ${action.facility === 'AIR_STRIP' ? 'built an Air Strip' : 'built or improved an Air Base'} at ${hex(action.hexId)}`; break;
    // 4.9a: the enemy always sees a hedgehog, so the work is public.
    case 'BUILD_HEDGEHOG': title = `${who} dug in at ${hex(action.hexId)}`; break;
    case 'REDUCE_HEDGEHOG': title = `${who} reduced a hedgehog`; break;
    case 'REBUILD_AIRCRAFT': title = `${who} rebuilt ${action.aircraftIds.length === 1 ? 'an aircraft' : `${action.aircraftIds.length} aircraft`} with Eq`; break;
    case 'CONSOLIDATE_UNITS': title = own ? (action.consolidation === 'MERGE' ? 'You combined two reduced units' : 'You exchanged a unit for one of another division') : `${who} consolidated units`; break;
    case 'REBUILD_UNITS': title = own ? `You rebuilt ${[action.units.length > 0 ? `${action.units.length} unit${action.units.length === 1 ? '' : 's'}` : '', action.truckPoints > 0 ? `${action.truckPoints} truck point${action.truckPoints === 1 ? '' : 's'}` : ''].filter(Boolean).join(' and ')} at ${hex(action.hexId)}` : `${who} rebuilt units with replacements`; break;
    case 'PLAN_AIR_DROP': title = own ? `You planned an Air Drop at ${hex(action.hexId)} for turn ${action.turn}` : `${who} made a plan`; break;
    case 'UPDATE_AIR_DROP_PLAN': title = own ? `You ${action.change === 'DELAY' ? 'delayed' : 'cancelled'} a Drop Plan` : `${who} changed a plan`; break;
    case 'RESPOND_DECISION': title = `${who} ${decisionVerb(String(action.decisionId))}`; break;
    case 'PLACE_REINFORCEMENT': title = own ? `${name(action.pieceId)} entered at ${hex(action.hexId)}` : `Enemy reinforcements entered at ${hex(action.hexId)}`; break;
    case 'END_MOVE': title = own ? `${name(action.pieceId)} finished moving` : 'An enemy unit finished moving'; break;
    // 4.9a: the enemy is not told that a division lost a step to a Breakdown; he sees the new counter only if it is on top.
    case 'CREATE_BREAKDOWN': {
      const created = record.events.find((event): event is Extract<RuleEvent, { kind: 'BREAKDOWN_CREATED' }> => event.kind === 'BREAKDOWN_CREATED');
      title = own ? `${name(action.pieceId)} detached ${created?.name ?? 'a Breakdown'}` : 'An enemy unit reorganized';
      break;
    }
    case 'CHANGE_MODE': title = own ? `${name(action.pieceId)} changed to ${action.mode.toLowerCase()} mode` : 'An enemy unit changed mode'; break;
    case 'RELEASE_RESERVE': title = own ? `${name(action.pieceId)} released from Reserve` : 'An enemy Reserve was released'; break;
    default: title = own ? `You: ${action.kind.replaceAll('_', ' ').toLowerCase()}` : `${who} took a logistics action`; break;
  }
  for (const event of record.events) {
    switch (event.kind) {
      case 'WEATHER_DETERMINED': lines.push(`Weather: ${event.groundCondition.toLowerCase()} ground${event.roll === null ? '' : ` (roll ${event.roll})`}.`); break;
      case 'FIRST_PLAYER_ROLLED': lines.push(`First player roll: ${event.rolls.map(({ playerId, total }) => `${context.playerName(playerId)} ${total}`).join(', ')}; ${context.playerName(event.winnerId)} chooses.`); break;
      case 'AIR_BASE_BUILT': lines.push(event.strip ? `An Air Strip stands at ${hex(event.hexId)}.` : `The Air Base at ${hex(event.hexId)} is Level ${event.level}.`); break;
      // 9.14f: both players see the capture and each aircraft's roll; displaced aircraft follow as PIECE_DISPLACED.
      case 'AIR_BASE_CAPTURED':
        lines.push(`${context.playerName(event.capturerId)} ${event.baseCaptured ? 'captured the Air Base at' : 'took'} ${hex(event.hexId)}.`);
        for (const roll of event.rolls) lines.push(`${name(roll.pieceId)}: ${roll.total}${roll.total === roll.roll ? '' : ` (roll ${roll.roll} +${roll.total - roll.roll})`} on the Air Base Capture Table, ${roll.eliminated ? 'destroyed' : roll.stepLost ? 'loses a step and displaces' : 'displaces'}.`);
        break;
      case 'HEDGEHOG_LEVEL_CHANGED': lines.push(event.level > 0 ? `The hedgehog at ${hex(event.hexId)} is Level ${event.level}.` : `The hedgehog at ${hex(event.hexId)} was removed.`); break;
      case 'HEDGEHOG_CAPTURED': lines.push(`${context.playerName(event.capturerId)} captured the Level ${event.level} hedgehog at ${hex(event.hexId)}.`); break;
      case 'PIECE_DISPLACED': lines.push(event.toHexId === null ? `${name(event.pieceId)} had nowhere to go and was lost.` : `${name(event.pieceId)} was displaced to ${hex(event.toHexId)}.`); break;
      case 'AIRCRAFT_REBUILT': lines.push(`${name(event.pieceId)} was rebuilt${event.hexId ? ` at ${hex(event.hexId)}` : ''}.`); break;
      // 4.9a: the roll and what it brought are the roller's own information.
      case 'REPLACEMENT_TABLE_ROLLED': if (event.playerId === context.viewerId) lines.push(`Variable Replacement Table roll ${event.roll}: ${event.pax === 0 && event.eq === 0 ? 'no replacements' : [event.pax > 0 ? `${event.pax} Pax` : '', event.eq > 0 ? `${event.eq} Eq` : ''].filter(Boolean).join(' and ')}.`); break;
      case 'UNITS_CONSOLIDATED': lines.push(own ? (event.consolidation === 'MERGE'
        ? `${name(event.withId)} joined ${name(event.pieceId)} at ${hex(event.hexId)}: ${event.steps} step${event.steps === 1 ? '' : 's'} regained; ${name(event.withId)} went to the Dead Pile.`
        : `${name(event.withId)} took the place of ${name(event.pieceId)} at ${hex(event.hexId)}; ${name(event.pieceId)} went to the Dead Pile.`)
        : `Enemy units were consolidated at ${hex(event.hexId)}.`); break;
      case 'REPLACEMENTS_ARRIVED': if (event.playerId === context.viewerId) lines.push(`${event.quantity} ${event.replacement === 'PAX' ? 'Pax' : 'Eq'} arrived.`); break;
      // 4.9a: a rebuilt unit shows up on the map, but how many steps it regained is the owner's to know.
      case 'UNIT_REBUILT': lines.push(own ? `${name(event.pieceId)} ${event.fromDeadPile ? 'returned from the Dead Pile' : 'regained'} with ${event.steps} step${event.steps === 1 ? '' : 's'} at ${hex(event.hexId)}.` : `An enemy unit was rebuilt at ${hex(event.hexId)}.`); break;
      case 'TRUCKS_REBUILT': lines.push(own ? `${event.points} truck point${event.points === 1 ? '' : 's'} rebuilt at ${hex(event.hexId)}.` : `Enemy trucks were rebuilt at ${hex(event.hexId)}.`); break;
      case 'DROP_PLAN_CHANGED': if (record.action.actorId === context.viewerId) lines.push(`Drop Plan ${event.change.toLowerCase()} (turn ${event.turn}).`); break;
      case 'STEP_LOST': lines.push(event.remainingSteps === null ? `${name(event.pieceId)} was eliminated.` : `${name(event.pieceId)} lost a step (${event.remainingSteps} left).`); break;
      case 'PIECE_RETREATED': lines.push(`${name(event.pieceId)} retreated to ${hex(event.toHexId)}.`); break;
      case 'PIECE_ADVANCED': lines.push(`${name(event.pieceId)} advanced into ${hex(event.toHexId)}.`); break;
      case 'FACILITY_DIE_ROLLED': lines.push(event.purpose === 'FACILITY' ? `Facility die: ${event.value}.` : `${name(event.pieceId)} aircraft check: ${event.value}.`); break;
      case 'TRANSACTION_RESOLVED': {
        const barrage = record.events.some((entry) => entry.kind === 'DICE_ROLLED' && entry.purpose === 'BARRAGE');
        if (record.action.kind === 'DECLARE_AIR_MISSION' || record.events.some((entry) => entry.kind === 'AIRCRAFT_STATUS_CHANGED')) lines.push(`Air mission: ${withPrintedHexIds(event.result)}`);
        else if (record.events.some((entry) => entry.kind === 'FACILITY_DIE_ROLLED' && entry.purpose === 'FACILITY')) lines.push(withPrintedHexIds(event.result));
        else lines.push(`Result ${event.result}: ${barrage ? explainBarrageResult(event.result) : event.result === 'NONE' ? 'no effect.' : explainCombatResult(event.result)}`);
        break;
      }
      case 'TRANSACTION_CANCELLED': lines.push('The combat was withdrawn.'); break;
      case 'BREAKDOWN_ABSORBED': if (isOwn(event.pieceId)) lines.push(`${name(event.pieceId)} absorbed ${event.name} and regained a step.`); break;
      // Detached while retreating or advancing after combat (20.0a); a Detach action already says so in its title.
      case 'BREAKDOWN_CREATED': if (action.kind !== 'CREATE_BREAKDOWN' && isOwn(event.pieceId)) lines.push(`${name(event.pieceId)} detached ${event.name}.`); break;
      case 'SUPPLY_STATUS_CHANGED': if (isOwn(event.pieceId)) lines.push(`${name(event.pieceId)} is ${event.inSupply ? 'back in supply' : 'Out of Supply'}.`); break;
      case 'SUPPLY_ARRIVED': if (event.playerId === context.viewerId) lines.push(`${event.tokens}T of supply arrived (Supply Table roll ${event.roll}).`); break;
      case 'FUEL_PAID': if (isOwn(event.pieceId)) lines.push(`Fuel paid: ${event.tokens}T.`); break;
      case 'INTERNAL_STOCKS_CHANGED': if (isOwn(event.pieceId)) lines.push(`${name(event.pieceId)} internal stocks: ${event.level.toLowerCase()}.`); break;
      case 'ATTRITION_ROLLED': lines.push(`Attrition at ${hex(event.hexId)}: roll ${event.total}, ${plural(event.steps, 'step')} lost.`); break;
      case 'BREAKOUT_ROLLED': lines.push(isOwn(event.pieceId) ? `${name(event.pieceId)} breakout roll ${event.roll}: ${event.succeeded ? 'escaped' : 'lost'}.` : `An enemy unit attempted a breakout and ${event.succeeded ? 'escaped' : 'was lost'}.`); break;
      case 'SUPPLY_CAPTURED': lines.push(`Supply captured: ${event.captured}T taken, ${event.destroyed}T destroyed.`); break;
      case 'TRANSPORT_CAPTURED': lines.push(`${context.playerName(event.capturerId)} captured ${event.captured} of ${event.points} transport point${event.points === 1 ? '' : 's'} at ${hex(event.hexId)} (roll ${event.roll})${event.captured < event.points ? '; the rest must displace' : ''}.`); break;
      case 'DUMP_BLOWN': if (isOwn(event.resourcePieceId)) lines.push(`Dump blown: ${event.destroyed}T destroyed.`); break;
      case 'VICTORY_RECORDED': lines.push(event.winnerId ? `${context.playerName(event.winnerId)} wins (${event.reason.replaceAll('_', ' ').toLowerCase()}).` : `The game ends in a draw (${event.reason.replaceAll('_', ' ').toLowerCase()}).`); break;
      default: break;
    }
  }
  // Steps passed in one go had no legal action for their player; say so instead of hiding them.
  const passed = advances.slice(0, -1).map(({ to }) => to).filter(({ phase }) => phase !== 'COMPLETE');
  if (passed.length > 0) {
    // Name whole phases when all their segments were passed, otherwise the passed segments.
    const groups = new Map<string, { phase: RulePhase; actor: PlayerId; segments: Set<string> }>();
    for (const sequence of passed) {
      const key = `${sequence.phase}|${sequence.actingPlayerId}`;
      const group = groups.get(key) ?? { phase: sequence.phase, actor: sequence.actingPlayerId, segments: new Set<string>() };
      group.segments.add(sequence.segment);
      groups.set(key, group);
    }
    const names = [...groups.values()].map(({ phase, actor, segments }) => {
      const all = PHASE_SEGMENTS[phase];
      const phaseName = phaseLabel(phase, 'NONE').replace(/ Phase$/u, '');
      const partial = all && !all.every((segment) => segments.has(segment));
      const label = partial ? `${phaseName} ${[...segments].map((segment) => phaseLabel(phase, segment as never).split(' · ')[1]?.replace(/ Segment$/u, '').toLowerCase()).join(' and ')} segment` : phaseName;
      return `${label}${actor !== actorId ? ` (${context.playerName(actor)})` : ''}`;
    });
    lines.push(`Passed automatically, no legal actions: ${names.join(', ')}.`);
  }
  const last = advances.at(-1);
  if (last) lines.push(`Now: ${stepName(last.to)}${last.to.phase === 'COMPLETE' ? '' : ` · ${context.playerName(last.to.actingPlayerId)}`}.`);
  const turn = (last?.to ?? advances[0]?.from)?.gameTurn ?? 0;
  return { revision: Number(record.revisionAfter), turn, actorId, title, lines, technical: record.summary };
};

/** Combat and barrage reports grouped by transaction, newest last. */
export const buildCombatReports = (
  records: readonly HistoryRecord[],
  facts: ReadonlyMap<string, ProjectedCombat>,
  context: NarrativeContext,
): readonly CombatReport[] => {
  const reports = new Map<string, CombatReport>();
  let open: string | null = null;
  for (const record of records) {
    for (const event of record.events) {
      if (event.kind === 'TRANSACTION_DECLARED') {
        const action = record.action;
        const targetHexId = action.kind === 'DECLARE_COMBAT' || action.kind === 'DECLARE_BARRAGE' || action.kind === 'DECLARE_AIR_MISSION' ? action.targetHexId : '';
        open = event.transactionId;
        reports.set(open, {
          transactionId: open, kind: event.transactionKind, attackerId: action.actorId, targetHexId,
          facts: facts.get(open) ?? null, result: null, explanation: '', surpriseRoll: null, roll: null, outcomes: [],
          status: 'OPEN', declaredRevision: Number(record.revisionAfter), lastRevision: Number(record.revisionAfter),
        });
        continue;
      }
      const id = 'transactionId' in event ? String(event.transactionId) : open;
      const report = id ? reports.get(id) : undefined;
      if (!report) continue;
      const update = (patch: Partial<CombatReport>) => reports.set(report.transactionId, { ...reports.get(report.transactionId)!, ...patch, lastRevision: Number(record.revisionAfter) });
      const current = () => reports.get(report.transactionId)!;
      const name = (pieceId: string) => context.piece(pieceId)?.name ?? 'A unit';
      if (event.kind === 'DICE_ROLLED') update(event.purpose === 'SURPRISE' ? { surpriseRoll: event.roll.total } : { roll: event.roll.total });
      else if (event.kind === 'FACILITY_DIE_ROLLED' && event.purpose === 'FACILITY') update({ roll: event.value });
      else if (event.kind === 'AIR_BASE_LEVEL_CHANGED') update({ outcomes: [...current().outcomes, `${name(event.pieceId)} reduced to Level ${event.level}`] });
      else if (event.kind === 'PORT_DAMAGED') update({ outcomes: [...current().outcomes, `Port damaged`] });
      else if (event.kind === 'STEP_LOST') update({ outcomes: [...current().outcomes, event.remainingSteps === null ? `${name(event.pieceId)} eliminated` : `${name(event.pieceId)} lost a step`] });
      else if (event.kind === 'PIECE_RETREATED') update({ outcomes: [...current().outcomes, `${name(event.pieceId)} retreated to ${hex(event.toHexId)}`] });
      else if (event.kind === 'PIECE_ADVANCED') update({ outcomes: [...current().outcomes, `${name(event.pieceId)} advanced into ${hex(event.toHexId)}`] });
      else if (event.kind === 'MODE_CHANGED' && event.to === 'DG') update({ outcomes: [...current().outcomes, `${name(event.pieceId)} Disorganized`] });
      else if (event.kind === 'TRANSACTION_RESOLVED') {
        update({
          status: 'RESOLVED', result: event.result,
          // Air missions report their own outcome text (14.x); combats and barrages use the table readings.
          explanation: current().kind === 'AIR_MISSION' ? withPrintedHexIds(event.result)
            : current().kind === 'BARRAGE' ? (event.result.startsWith('Barrage vs Facility') ? withPrintedHexIds(event.result) : explainBarrageResult(event.result)) : event.result === 'NONE' ? 'No effect.' : explainCombatResult(event.result),
        });
        if (open === report.transactionId) open = null;
      } else if (event.kind === 'TRANSACTION_CANCELLED') {
        update({ status: 'CANCELLED', explanation: 'Withdrawn before the roll.' });
        if (open === report.transactionId) open = null;
      }
    }
  }
  return [...reports.values()].map((report) => ({ ...report, facts: facts.get(report.transactionId) ?? report.facts }));
};

/** Short odds line for a combat report header. */
export const combatHeadline = (report: CombatReport, context: NarrativeContext): string => {
  const what = report.kind === 'AIR_MISSION' ? 'Air mission' : report.kind === 'BARRAGE' ? 'Barrage' : report.kind === 'OVERRUN' ? 'Overrun' : 'Attack';
  const facts = report.facts;
  // A mission that carries cargo has no Barrage Strength to print; its headline is just the mission and the hex.
  const odds = facts && !(report.kind === 'AIR_MISSION' && facts.attackerStrength === 0) ? ` · ${facts.attackerStrength}${facts.defenderStrength === null ? '' : ` : ${facts.defenderStrength}`} · ${facts.odds}${facts.drm === null ? '' : ` · DRM ${signed(facts.drm)}`}` : '';
  return `${context.playerName(report.attackerId)} ${what.toLowerCase()} on ${hex(report.targetHexId)}${odds}`;
};
