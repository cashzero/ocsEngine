import type { PieceId, PlayerId } from '../core/index.js';
import type { OcsMode } from '../domain/piece/index.js';
import type { ScenarioDefinition } from '../domain/scenario/index.js';
import {
  parseDispatchRequestId,
  type CheckpointDescriptor,
  type GameSession,
  type GameplayEngine,
  type HandoffToken,
  type HistoryRecord,
  type SeatBinding,
  type SeatId,
  type SessionNotification,
} from '../gameplay/index.js';
import {
  AIR_MISSION_KINDS, AIR_MISSION_LABELS, missionSegment, parseRuleActionId,
  type AirMissionKind, type GameAction, type ProjectedCombat, type ProjectedPiece, type RuleEvent, type RuleExplanation,
} from '../rules/index.js';
import type {
  AirDraft, AirOverview, AirRefit, Arrival, AttackDraft, AwayReport, CombatSheet, EndStep, HandoffInfo, MovePreview, MoveRangeEntry,
  SupplyNeed, UiListener, UiSelection, UiSnapshot, UnitAction,
} from './model.js';
import {
  buildCombatReports, describeRecord, nominalNextStep, playerTurnTrack,
  type CombatReport, type FeedEntry, type NarrativeContext,
} from './narrative.js';
import { phaseLabel, printedHexLabel, unitLabel } from './presenter.js';

export interface UiControllerOptions {
  readonly engine: GameplayEngine;
  readonly session: GameSession;
  readonly scenario: ScenarioDefinition;
  readonly bindings: readonly SeatBinding[];
  /**
   * Pass, without a hand-over, a step of the other player whose only legal action is blowing a dump
   * (12.11a). Default true; the players can turn it off in the Session dialog.
   */
  readonly skipDumpOnlySteps?: boolean;
}

/** Action ID scope of steps passed by the dump-only setting, so the log can say why. */
export const AUTO_PASS_SCOPE = 'auto-pass';

export interface UiController {
  readonly getSnapshot: () => UiSnapshot;
  readonly subscribe: (listener: UiListener) => () => void;
  /** A click (or Enter) on a map Hex: confirms, previews, targets, or selects depending on context. */
  readonly clickHex: (hexId: string) => Promise<void>;
  readonly selectPiece: (pieceId: string | null) => void;
  readonly clearSelection: () => void;
  readonly confirmMove: () => Promise<void>;
  readonly toggleParticipant: (pieceId: string) => void;
  readonly setLead: (pieceId: string) => void;
  readonly declareDraft: () => Promise<void>;
  readonly cancelDraft: () => void;
  readonly changeMode: (mode: OcsMode) => Promise<void>;
  readonly releaseReserve: () => Promise<void>;
  readonly feedSupply: (pieceId: string, dumpId: string) => Promise<void>;
  /** Run one of the snapshot's unitActions or stepActions by key. */
  readonly runAction: (key: string) => Promise<void>;
  readonly respondToDecision: (choiceId: string) => Promise<void>;
  /** Pay the pending combat-supply decision from the largest dumps, consumer by consumer. */
  readonly autoPay: () => Promise<void>;
  readonly endStep: () => Promise<void>;
  /** Restore the automatic checkpoint taken at the start of the current step. */
  readonly undoStep: () => Promise<void>;
  readonly dismissResult: () => void;
  readonly dismissAwayReport: () => void;
  readonly setSkipDumpOnlySteps: (enabled: boolean) => void;
  readonly start: () => void;
  readonly togglePause: () => void;
  readonly createCheckpoint: () => void;
  readonly undoTo: (checkpointId: string) => Promise<void>;
  readonly serializeSave: () => string;
  readonly serializeReplay: () => string;
  readonly loadSave: (serialized: string) => Promise<void>;
  readonly beginHandoff: () => void;
  readonly completeHandoff: () => void;
  /** Start planning an air mission of this type; then click a highlighted target hex. */
  readonly planAirMission: (mission: AirMissionKind) => void;
  readonly toggleAirAircraft: (pieceId: string) => void;
  readonly setAirTarget: (target: 'COMBAT_UNITS' | 'AIR_BASE') => void;
  readonly declareAirMission: () => Promise<void>;
  readonly cancelAirMission: () => void;
  readonly toggleRefitAircraft: (baseId: string, pieceId: string) => void;
  readonly refitBase: (baseId: string) => Promise<void>;
  readonly toggleAirZones: () => void;
  readonly dispose: () => void;
}

interface AirDraftInput {
  readonly mission: AirMissionKind;
  readonly targetHexId: string | null;
  readonly target: 'COMBAT_UNITS' | 'AIR_BASE' | null;
  readonly selectedIds: readonly PieceId[];
}

const initialSelection = (): UiSelection => ({ hexId: null, pieceId: null });

/** Replace raw Hex IDs ("q,r") in engine text with printed Hex numbers. */
const withPrintedHexes = (text: string): string => text.replace(/-?\d+,-?\d+/gu, (hexId) => printedHexLabel(hexId));

interface DraftInput {
  readonly kind: AttackDraft['kind'];
  readonly targetHexId: string;
  readonly eligibleIds: readonly PieceId[];
  readonly selectedIds: readonly PieceId[];
  readonly leadId: PieceId | null;
}

interface AutoCheckpoint {
  readonly id: CheckpointDescriptor['id'];
  readonly stepKey: string;
  readonly historyLength: number;
  readonly seatId: SeatId;
  readonly label: string;
}

/** Events after which "undo this step" would let a player re-roll or retract what the opponent saw. */
const IRREVERSIBLE_EVENTS: ReadonlySet<RuleEvent['kind']> = new Set([
  'DICE_ROLLED', 'TRANSACTION_DECLARED', 'SUPPLY_ARRIVED', 'BREAKOUT_ROLLED', 'ATTRITION_ROLLED',
  'FIRST_PLAYER_ROLLED', 'WEATHER_DETERMINED', 'DUMP_BLOWN', 'DECISION_REQUESTED',
]);

/** Number the second and later of identical labels so every choice can be told apart. */
export const distinctLabels = <T extends { readonly label: string }>(items: readonly T[]): T[] => {
  const totals = new Map<string, number>();
  for (const { label } of items) totals.set(label, (totals.get(label) ?? 0) + 1);
  const seen = new Map<string, number>();
  return items.map((item) => {
    if ((totals.get(item.label) ?? 0) < 2) return item;
    const index = (seen.get(item.label) ?? 0) + 1;
    seen.set(item.label, index);
    return { ...item, label: `${item.label} (#${index})` };
  });
};

const formationNameOf = (unitName: string): string => unitName.includes(' / ') ? unitName.slice(unitName.lastIndexOf(' / ') + 3) : unitName;

class DefaultUiController implements UiController {
  readonly #engine: GameplayEngine;
  readonly #scenario: ScenarioDefinition;
  readonly #bindings: readonly SeatBinding[];
  #session: GameSession;
  #selection = initialSelection();
  #destination: string | null = null;
  #draft: DraftInput | null = null;
  #listeners = new Set<UiListener>();
  #unsubscribeSession: (() => void) | null = null;
  #notice = '';
  #busy = false;
  #requestSequence = 0;
  #actionSequence = 0;
  #handoffToken: HandoffToken | null = null;
  #handoffInfo: HandoffInfo | null = null;
  #cache = new Map<string, unknown>();
  #cacheScope = '';
  #airDraft: AirDraftInput | null = null;
  #refitSelection = new Map<string, readonly PieceId[]>();
  #showAirZones = false;
  /** Public combat facts per transaction, captured while the combat is open. */
  #combatFacts = new Map<string, ProjectedCombat>();
  #openTransaction: string | null = null;
  /** History length each seat has already seen at the screen. */
  #seen = new Map<SeatId, number>();
  #awayReport: AwayReport | null = null;
  #resultCard = new Map<SeatId, string>();
  #answers = new Map<string, string[]>();
  #autoCheckpoint: AutoCheckpoint | null = null;
  #skipDumpOnlySteps: boolean;

  constructor(options: UiControllerOptions) {
    this.#engine = options.engine;
    this.#session = options.session;
    this.#scenario = options.scenario;
    this.#bindings = options.bindings.map((binding) => ({ ...binding }));
    this.#skipDumpOnlySteps = options.skipDumpOnlySteps ?? true;
    this.#notice = options.session.getMetadata().lifecycle === 'ACTIVE'
      ? 'Select a unit on the map to see where it can move and what it can attack.'
      : 'Scenario ready. Start the session when you are ready.';
    this.#bindSession();
    this.#afterChange();
  }

  #bindSession(): void {
    this.#unsubscribeSession?.();
    this.#unsubscribeSession = this.#session.subscribe((notification) => {
      this.#observe(notification);
      this.#emit();
    });
  }

  #activeSeat(): SeatId { return this.#session.getMetadata().activeSeatId; }

  #playerOf(seatId: SeatId): PlayerId { return this.#bindings.find((binding) => binding.seatId === seatId)!.playerId; }

  #cached<T>(key: string, compute: () => T): T {
    const metadata = this.#session.getMetadata();
    const scope = `${this.#session.getRevision()}|${metadata.lifecycle}|${metadata.activeSeatId}|${this.#handoffToken ?? ''}`;
    if (scope !== this.#cacheScope) { this.#cache.clear(); this.#cacheScope = scope; }
    if (!this.#cache.has(key)) this.#cache.set(key, compute());
    return this.#cache.get(key) as T;
  }

  #history(): readonly HistoryRecord[] {
    return this.#cached('history', () => this.#session.getHistory({ offset: 0, limit: Number.MAX_SAFE_INTEGER, actionKind: null }).records);
  }

  #candidates(kind: GameAction['kind'], pieceId: string | null = null, budget = 500): readonly GameAction[] {
    const seatId = this.#activeSeat();
    return this.#cached(`candidates|${kind}|${pieceId}|${budget}`, () => this.#session.getActionCandidates(seatId, {
      kind, pieceId: pieceId as PieceId | null, budget,
    }).actions);
  }

  #explain(action: GameAction): RuleExplanation {
    return this.#cached(`explain|${JSON.stringify({ ...action, actionId: '' })}`, () =>
      this.#session.validateDraft(this.#session.createDraft(this.#activeSeat(), action)).explanation);
  }

  #actionId(scope: string) {
    const parsed = parseRuleActionId(`ui:${scope}:${this.#session.getRevision()}:${++this.#actionSequence}`);
    if (!parsed.ok) throw new Error('Generated UI Action ID is invalid.');
    return parsed.value;
  }

  #pieces(): readonly ProjectedPiece[] {
    return (this.#session.getView(this.#activeSeat()).projection?.stacks ?? []).flatMap(({ pieces }) => pieces);
  }

  #decision() {
    for (const binding of this.#bindings) {
      const decision = this.#session.getPendingDecision(binding.seatId);
      if (decision) return { decision, seatId: binding.seatId };
    }
    return null;
  }

  /** Track open combats and remember their public facts, so results can be reported after the fact. */
  #observe(notification: SessionNotification): void {
    if (notification.kind === 'DISPATCH_ACCEPTED') {
      for (const event of notification.record.events) {
        if (event.kind === 'TRANSACTION_DECLARED') this.#openTransaction = event.transactionId;
        if ((event.kind === 'TRANSACTION_RESOLVED' || event.kind === 'TRANSACTION_CANCELLED') && this.#openTransaction === event.transactionId) this.#openTransaction = null;
      }
    }
    if (notification.kind === 'CHECKPOINT_RESTORED') {
      this.#openTransaction = null;
      const length = this.#session.getHistory({ offset: 0, limit: 0, actionKind: null }).total;
      for (const [seat, seen] of this.#seen) this.#seen.set(seat, Math.min(seen, length));
    }
    if (this.#openTransaction !== null) {
      const view = this.#session.getView(this.#activeSeat());
      const combat = view.projection?.combat;
      // Keep the odds as declared: after the roll, losses change the strengths shown in the projection.
      if (combat && combat.result === null) this.#combatFacts.set(this.#openTransaction, combat);
    }
    this.#afterChange();
  }

  #stepKey(): string | null {
    const sequence = this.#session.getView(this.#activeSeat()).projection?.sequence;
    return sequence ? `${sequence.gameTurn}:${sequence.playerTurnIndex}:${sequence.phase}:${sequence.segment}:${sequence.actingPlayerId}` : null;
  }

  /** Keep one rolling automatic checkpoint at the start of the current step; older ones are dropped. */
  #afterChange(): void {
    const metadata = this.#session.getMetadata();
    if (metadata.lifecycle !== 'ACTIVE' || this.#handoffToken !== null || this.#decision() !== null) return;
    const key = this.#stepKey();
    if (key === null || this.#autoCheckpoint?.stepKey === key) return;
    const sequence = this.#session.getView(this.#activeSeat()).projection!.sequence;
    const label = `Auto: start of ${phaseLabel(sequence.phase, sequence.segment)} (turn ${sequence.gameTurn})`;
    if (this.#autoCheckpoint) this.#session.removeCheckpoint(this.#autoCheckpoint.id);
    const checkpoint = this.#session.createCheckpoint(label);
    const actingSeat = this.#bindings.find(({ playerId }) => playerId === sequence.actingPlayerId)?.seatId ?? this.#activeSeat();
    this.#autoCheckpoint = { id: checkpoint.id, stepKey: key, historyLength: checkpoint.actionIndex, seatId: actingSeat, label };
  }

  #buildDraftAction(input: DraftInput): GameAction | null {
    if (input.selectedIds.length === 0) return null;
    const view = this.#session.getView(this.#activeSeat());
    const actor = view.playerId;
    if (input.kind === 'BARRAGE') {
      const targets = this.#candidates('DECLARE_BARRAGE').find((action) => action.kind === 'DECLARE_BARRAGE' && action.targetHexId === input.targetHexId);
      if (!targets || targets.kind !== 'DECLARE_BARRAGE') return null;
      return {
        actionId: this.#actionId('barrage'), actorId: actor, expectedRevision: this.#session.getRevision(),
        kind: 'DECLARE_BARRAGE', firerIds: input.selectedIds, targetPieceIds: targets.targetPieceIds, targetHexId: targets.targetHexId,
      };
    }
    const template = this.#candidates('DECLARE_COMBAT').find((action) => action.kind === 'DECLARE_COMBAT' && action.targetHexId === input.targetHexId)
      ?? this.#candidates('DECLARE_COMBAT', this.#selection.pieceId).find((action) => action.kind === 'DECLARE_COMBAT' && action.targetHexId === input.targetHexId);
    if (!template || template.kind !== 'DECLARE_COMBAT') return null;
    return {
      actionId: this.#actionId('combat'), actorId: actor, expectedRevision: this.#session.getRevision(),
      kind: 'DECLARE_COMBAT', combatKind: input.kind, attackerIds: input.selectedIds, defenderIds: template.defenderIds,
      targetHexId: template.targetHexId, leadAttackerId: input.leadId && input.selectedIds.includes(input.leadId) ? input.leadId : input.selectedIds[0]!,
    };
  }

  #endStep(): EndStep {
    const view = this.#session.getView(this.#activeSeat());
    const sequence = view.projection?.sequence;
    const label = sequence ? `Finish ${phaseLabel(sequence.phase, sequence.segment)}` : 'End step';
    const next = sequence ? nominalNextStep(sequence) : '';
    const advance = this.#candidates('ADVANCE_SEQUENCE', null, 1)[0];
    if (advance) return { enabled: true, label, next, blockers: [] };
    const probe: GameAction = {
      actionId: this.#actionId('advance-probe'), actorId: view.playerId, expectedRevision: this.#session.getRevision(), kind: 'ADVANCE_SEQUENCE',
    };
    const explanation = this.#explain(probe);
    return { enabled: false, label, next, blockers: explanation.reasons.filter(({ allowed }) => !allowed).map(({ message }) => message) };
  }

  #narrativeContext(seatId: SeatId): NarrativeContext {
    const viewerId = this.#playerOf(seatId);
    const definitions = new Map(this.#scenario.pieceCatalog.definitions.map((definition) => [String(definition.id), definition]));
    const known = new Map<string, { name: string; ownerId: PlayerId }>();
    for (const piece of this.#scenario.initialPieceState.pieces) {
      known.set(String(piece.id), { name: definitions.get(String(piece.definitionId))?.name ?? 'Unit', ownerId: piece.ownerId });
    }
    for (const piece of this.#pieces()) known.set(String(piece.id), { name: unitLabel(this.#scenario, piece), ownerId: piece.ownerId });
    return {
      viewerId,
      playerName: (playerId) => this.#bindings.find((binding) => binding.playerId === playerId)?.label
        ?? this.#scenario.players.find(({ id }) => id === playerId)?.name ?? String(playerId),
      piece: (pieceId) => known.get(String(pieceId)) ?? null,
    };
  }

  #feed(seatId: SeatId): readonly FeedEntry[] {
    return this.#cached(`feed|${seatId}`, () => {
      const context = this.#narrativeContext(seatId);
      return this.#history().map((record) => describeRecord(record, context));
    });
  }

  #combatReports(seatId: SeatId): readonly CombatReport[] {
    return this.#cached(`combats|${seatId}|${this.#combatFacts.size}`, () => buildCombatReports(this.#history(), this.#combatFacts, this.#narrativeContext(seatId)));
  }

  #handoffReason(toSeatId: SeatId): string {
    const pending = this.#decision();
    const combat = this.#session.getView(this.#activeSeat()).projection?.combat;
    const where = combat ? ` at ${printedHexLabel(combat.targetHexId)}` : '';
    const what = combat?.kind === 'BARRAGE' ? 'barrage' : combat?.kind === 'OVERRUN' ? 'overrun' : 'attack';
    if (pending && pending.seatId === toSeatId) {
      switch (pending.decision.kind) {
        case 'SUPPLY_SOURCE': return combat && combat.attackerOwnerId !== this.#playerOf(toSeatId)
          ? `Defend against the ${what}${where}: combat supply, Action Rating unit and terrain.` : `Pay combat supply for the ${what}${where}.`;
        case 'DEFENDER_LEAD': case 'DEFENDER_TERRAIN': return `Defend against the ${what}${where}: Action Rating unit and terrain.`;
        case 'STEP_LOSS': case 'OPTION_SPLIT': case 'RETREAT_HEX': return `Apply the combat result${where}: losses and retreats.`;
        case 'ADVANCE_HEX': return `Choose units to advance after combat${where}.`;
        case 'FIRST_PLAYER': return 'Choose who takes the first Player Turn (2.3).';
        case 'OVERSTACK_ELIMINATION': return 'Remove units from an overstacked Hex (4.8a).';
        case 'ATTRITION_LOSS': return 'Choose the units lost to attrition (12.8).';
        case 'DISPLACEMENT_HEX': return 'Place displaced trucks (9.14).';
      }
    }
    const sequence = this.#session.getView(this.#activeSeat()).projection?.sequence;
    if (!sequence) return 'Their turn to act.';
    if (sequence.phase === 'REACTION') return 'Reaction Phase: move released Reserves and fire barrages (7.0).';
    const phasing = this.#bindings.find(({ playerId }) => playerId === sequence.phasingPlayerId)?.seatId === toSeatId;
    const step = phaseLabel(sequence.phase, sequence.segment);
    if (!phasing) return `${step}.`;
    return ['AIRCRAFT_REFIT', 'REINFORCEMENT'].includes(sequence.phase) ? `Their Player Turn begins: ${step}.` : `Continue their Player Turn: ${step}.`;
  }

  #phaseRecords(): readonly HistoryRecord[] {
    const records = this.#history();
    for (let index = records.length - 1; index >= 0; index -= 1) {
      if (records[index]!.events.some((event) => event.kind === 'SEQUENCE_ADVANCED')) return records.slice(index + 1);
    }
    return records;
  }

  #undoStepAvailable(): { label: string } | null {
    const auto = this.#autoCheckpoint;
    if (!auto || auto.stepKey !== this.#stepKey() || auto.seatId !== this.#activeSeat() || this.#decision() !== null) return null;
    if (!this.#session.listCheckpoints().some(({ id }) => id === auto.id)) return null;
    const since = this.#history().slice(auto.historyLength);
    if (since.length === 0) return null;
    if (since.some((record) => record.seatId !== auto.seatId || record.events.some((event) => IRREVERSIBLE_EVENTS.has(event.kind)))) return null;
    return { label: auto.label.replace(/^Auto: /u, '') };
  }

  #combatSheet(decision: NonNullable<UiSnapshot['decision']>, playerId: PlayerId): CombatSheet | null {
    if (!decision.transactionId) return null;
    const combat = this.#session.getView(this.#activeSeat()).projection?.combat;
    const role = combat && combat.attackerOwnerId === playerId ? 'ATTACKER' : 'DEFENDER';
    const labels = role === 'ATTACKER' ? ['Combat supply', 'Defender decides', 'Roll', 'Results'] : ['Combat supply', 'AR unit', 'Terrain', 'Roll', 'Results'];
    const current = decision.kind === 'SUPPLY_SOURCE' ? 0 : decision.kind === 'DEFENDER_LEAD' ? 1 : decision.kind === 'DEFENDER_TERRAIN' ? 2 : labels.length - 1;
    return {
      role,
      steps: labels.map((label, index) => ({ label, status: index < current ? 'done' : index === current ? 'current' : 'upcoming' })),
      answers: this.#answers.get(`${decision.transactionId}|${this.#activeSeat()}`) ?? [],
    };
  }

  #formationNames(playerId: PlayerId): ReadonlyMap<string, string> {
    return this.#cached(`formations|${playerId}`, () => {
      const names = new Map<string, string>();
      const owned = new Set(this.#scenario.initialPieceState.pieces.filter(({ ownerId }) => ownerId === playerId).map(({ definitionId }) => String(definitionId)));
      for (const definition of this.#scenario.pieceCatalog.definitions) {
        const formation = definition.ownership.formationDefinitionId;
        if (!formation || !owned.has(String(definition.id))) continue;
        const name = formationNameOf(definition.name);
        if (!names.has(String(formation)) || definition.counter?.kind === 'HQ') names.set(String(formation), name);
      }
      return names;
    });
  }

  getSnapshot = (): UiSnapshot => {
    const seatId = this.#activeSeat();
    const view = this.#session.getView(seatId);
    const families = this.#cached('families', () => this.#session.getActionFamilies(seatId));
    const enabled = (kind: GameAction['kind']) => families.some((family) => family.kind === kind && family.enabled);
    const pieces = this.#pieces();
    const selectedPiece = pieces.find(({ id }) => id === this.#selection.pieceId) ?? null;
    const ownSelected = selectedPiece !== null && selectedPiece.ownerId === view.playerId ? selectedPiece : null;
    const segment = view.projection?.sequence.segment;

    const reachable = new Map<string, readonly string[]>();
    const moveRange = new Map<string, MoveRangeEntry>();
    let remainingTicks: number | null = null;
    if (ownSelected && enabled('MOVE_PIECE')) {
      const range = this.#cached(`range|${ownSelected.id}`, () => this.#session.getMovementRange(seatId, ownSelected.id));
      const remaining = range.facts.find(({ key }) => key === 'movement.remainingTicks')?.value;
      remainingTicks = typeof remaining === 'number' ? remaining : null;
      for (const entry of range.value ?? []) {
        reachable.set(entry.hexId, entry.path);
        moveRange.set(entry.hexId, {
          path: entry.path, costTicks: entry.costTicks,
          remainingAfterTicks: Math.max(0, (remainingTicks ?? 0) - entry.costTicks), endsMovement: entry.endsMovement === true,
        });
      }
    }
    let movePreview: MovePreview | null = null;
    if (ownSelected && this.#destination !== null && reachable.has(this.#destination)) {
      const action: GameAction = {
        actionId: this.#actionId('move'), actorId: view.playerId, expectedRevision: this.#session.getRevision(),
        kind: 'MOVE_PIECE', pieceId: ownSelected.id, path: reachable.get(this.#destination)! as never,
      };
      movePreview = { destinationHexId: this.#destination, path: reachable.get(this.#destination)!, action, explanation: this.#explain(action) };
    }

    const combatCandidates = enabled('DECLARE_COMBAT')
      ? segment === 'COMBAT' ? this.#candidates('DECLARE_COMBAT') : ownSelected ? this.#candidates('DECLARE_COMBAT', ownSelected.id) : []
      : [];
    const attackTargets = [...new Set(combatCandidates.flatMap((action) => action.kind === 'DECLARE_COMBAT' ? [action.targetHexId] : []))];
    const barrageTargets = enabled('DECLARE_BARRAGE')
      ? [...new Set(this.#candidates('DECLARE_BARRAGE').flatMap((action) => action.kind === 'DECLARE_BARRAGE' ? [action.targetHexId] : []))]
      : [];

    let draft: AttackDraft | null = null;
    if (this.#draft) {
      const action = this.#buildDraftAction(this.#draft);
      draft = { ...this.#draft, action, explanation: action ? this.#explain(action) : null };
    }

    const modeOptions = ownSelected && enabled('CHANGE_MODE')
      ? this.#candidates('CHANGE_MODE', ownSelected.id).flatMap((action) => action.kind === 'CHANGE_MODE' ? [{ mode: action.mode, action }] : [])
      : [];
    const releaseAction = ownSelected && enabled('RELEASE_RESERVE') ? this.#candidates('RELEASE_RESERVE', ownSelected.id)[0] ?? null : null;
    const arrivals: Arrival[] = [];
    if (enabled('PLACE_REINFORCEMENT')) {
      const byPiece = new Map<string, string[]>();
      for (const action of this.#candidates('PLACE_REINFORCEMENT')) {
        if (action.kind === 'PLACE_REINFORCEMENT') byPiece.set(action.pieceId, [...(byPiece.get(action.pieceId) ?? []), action.hexId]);
      }
      for (const [pieceId, entryHexIds] of byPiece) arrivals.push({ pieceId: pieceId as PieceId, entryHexIds });
    }
    const placementHexes = arrivals.find(({ pieceId }) => pieceId === this.#selection.pieceId)?.entryHexIds ?? [];
    const supplyNeeds: SupplyNeed[] = [];
    if (enabled('CHECK_SUPPLY')) {
      const byPiece = new Map<string, { action: GameAction; dumpId: PieceId }[]>();
      for (const action of this.#candidates('CHECK_SUPPLY')) {
        if (action.kind === 'CHECK_SUPPLY' && action.sourcePieceId) {
          byPiece.set(action.pieceIds[0]!, [...(byPiece.get(action.pieceIds[0]!) ?? []), { action, dumpId: action.sourcePieceId }]);
        }
      }
      for (const [pieceId, options] of byPiece) supplyNeeds.push({ pieceId: pieceId as PieceId, options });
    }
    const unitActions = ownSelected ? this.#unitActions(ownSelected, enabled) : [];
    const stepActions = this.#stepActions(enabled);
    const collapseHexes = ownSelected && ownSelected.currentFaceId === 'extender' && ownSelected.location.kind === 'ON_MAP' && enabled('COLLAPSE_EXTENDER')
      ? this.#cached(`collapse|${ownSelected.id}`, () => this.#session.getActionFamilies(seatId) && this.#collapseHexes(ownSelected)) : [];
    const pending = this.#decision();
    const ownDecision = pending?.seatId === seatId ? pending.decision : null;
    const decisionHexes = ownDecision ? [...new Set(ownDecision.options.flatMap(({ hexId }) => hexId ? [hexId] : []))] : [];
    const sequence = view.projection?.sequence;
    const sequenceOwner = this.#bindings.find(({ playerId }) => playerId === sequence?.actingPlayerId);
    const requiredSeatId = pending?.seatId ?? sequenceOwner?.seatId ?? null;
    const otherBinding = this.#bindings.find((binding) => binding.seatId !== seatId);
    const handoff: HandoffInfo | null = this.#handoffInfo
      ?? (requiredSeatId && requiredSeatId !== seatId && view.metadata.lifecycle === 'ACTIVE'
        ? { toSeatId: requiredSeatId, toLabel: this.#bindings.find((binding) => binding.seatId === requiredSeatId)?.label ?? 'the other player', reason: this.#handoffReason(requiredSeatId) }
        : null);
    const reports = view.privacyLocked ? [] : this.#combatReports(seatId);
    const resultId = this.#resultCard.get(seatId);
    const phaseRecords = view.privacyLocked ? [] : this.#phaseRecords();
    const own = new Set(pieces.filter(({ ownerId }) => ownerId === view.playerId).map(({ id }) => String(id)));
    const movedThisPhase = new Set<string>();
    const attackedThisPhase = new Set<string>();
    for (const record of phaseRecords) {
      if (record.action.kind === 'MOVE_PIECE' && own.has(String(record.action.pieceId))) movedThisPhase.add(String(record.action.pieceId));
      if (record.action.kind === 'DECLARE_COMBAT') for (const id of record.action.attackerIds) if (own.has(String(id))) attackedThisPhase.add(String(id));
      if (record.action.kind === 'DECLARE_BARRAGE') for (const id of record.action.firerIds) if (own.has(String(id))) attackedThisPhase.add(String(id));
    }
    return {
      scenario: this.#scenario,
      view,
      bindings: this.#bindings,
      families,
      selection: { ...this.#selection },
      selectedPiece,
      reachable,
      moveRange,
      remainingTicks,
      movePreview,
      attackTargets,
      barrageTargets,
      draft,
      modeOptions,
      releaseAction,
      arrivals,
      placementHexes,
      supplyNeeds,
      unitActions,
      stepActions,
      collapseHexes,
      endStep: this.#endStep(),
      decision: ownDecision ? { ...ownDecision, options: distinctLabels(ownDecision.options) } : null,
      decisionSeatId: pending?.seatId ?? null,
      decisionHexes,
      history: this.#history(),
      checkpoints: this.#session.listCheckpoints(),
      notice: this.#notice,
      busy: this.#busy,
      handoffPending: this.#handoffToken !== null,
      requiredSeatId,
      air: this.#airOverview(enabled),
      handoff,
      feed: view.privacyLocked ? [] : this.#feed(seatId),
      combatReports: reports,
      resultCard: reports.find(({ transactionId }) => transactionId === resultId) ?? null,
      awayReport: view.privacyLocked ? null : this.#awayReport,
      phaseTrack: sequence && otherBinding ? playerTurnTrack(this.#history(), sequence, sequence.phasingPlayerId === view.playerId ? otherBinding.playerId : view.playerId) : [],
      movedThisPhase,
      attackedThisPhase,
      undoStep: view.privacyLocked ? null : this.#undoStepAvailable(),
      combatSheet: ownDecision ? this.#combatSheet(ownDecision, view.playerId) : null,
      autoPay: ownDecision?.kind === 'SUPPLY_SOURCE' && ownDecision.options.some(({ id }) => id.startsWith('pay:')),
      formationNames: this.#formationNames(view.playerId),
    };
  };

  /** Air missions each of the player's ready aircraft could fly now: mission → hex → targets → aircraft. */
  #airOptions(): ReadonlyMap<AirMissionKind, ReadonlyMap<string, ReadonlyMap<string, readonly PieceId[]>>> {
    return this.#cached('air-options', () => {
      const options = new Map<AirMissionKind, Map<string, Map<string, PieceId[]>>>();
      const view = this.#session.getView(this.#activeSeat());
      const own = this.#pieces().filter((piece) => piece.ownerId === view.playerId && piece.location.kind === 'ON_MAP'
        && this.#definition(piece)?.family === 'AIR' && !piece.statuses.includes('status:air-inactive'));
      for (const plane of own) {
        for (const action of this.#candidates('DECLARE_AIR_MISSION', plane.id, 5000)) {
          if (action.kind !== 'DECLARE_AIR_MISSION') continue;
          const byHex = options.get(action.mission) ?? new Map<string, Map<string, PieceId[]>>();
          const byTarget = byHex.get(action.targetHexId) ?? new Map<string, PieceId[]>();
          const key = action.target ?? 'HEX';
          byTarget.set(key, [...(byTarget.get(key) ?? []), plane.id]);
          byHex.set(action.targetHexId, byTarget);
          options.set(action.mission, byHex);
        }
      }
      return options;
    });
  }

  #definition(piece: Pick<ProjectedPiece, 'definitionId'>) {
    return this.#scenario.pieceCatalog.definitions.find(({ id }) => id === piece.definitionId);
  }

  #airDraftView(): AirDraft | null {
    const input = this.#airDraft;
    if (!input) return null;
    const byHex = this.#airOptions().get(input.mission);
    const byTarget = input.targetHexId ? byHex?.get(input.targetHexId) : undefined;
    const targetOptions = [...(byTarget?.keys() ?? [])].filter((key): key is 'COMBAT_UNITS' | 'AIR_BASE' => key !== 'HEX');
    const eligible = byTarget?.get(input.target ?? 'HEX') ?? [];
    const maximum = input.mission === 'BARRAGE' || input.mission === 'TRAINBUSTING' || input.mission === 'BASE_TRANSFER' ? 4 : 1;
    const selected = input.selectedIds.filter((id) => eligible.includes(id));
    let action: GameAction | null = null;
    if (input.targetHexId && selected.length > 0) {
      const view = this.#session.getView(this.#activeSeat());
      action = {
        actionId: this.#actionId('air'), actorId: view.playerId, expectedRevision: this.#session.getRevision(),
        kind: 'DECLARE_AIR_MISSION', mission: input.mission, aircraftIds: selected, targetHexId: input.targetHexId as never, target: input.target,
      };
    }
    return {
      mission: input.mission, label: AIR_MISSION_LABELS[input.mission], targetHexId: input.targetHexId, target: input.target,
      targetOptions, eligibleIds: eligible, selectedIds: selected, maximum,
      action, explanation: action ? this.#explain(action) : null,
    };
  }

  #airOverview(enabled: (kind: GameAction['kind']) => boolean): AirOverview {
    const view = this.#session.getView(this.#activeSeat());
    const projection = view.projection;
    const segment = projection?.sequence.segment;
    const missionsEnabled = enabled('DECLARE_AIR_MISSION') && !this.#decision();
    const options = missionsEnabled ? this.#airOptions() : new Map();
    const missions = missionsEnabled
      ? AIR_MISSION_KINDS.filter((mission) => missionSegment(mission) === segment)
        .map((mission) => ({ mission, label: AIR_MISSION_LABELS[mission], available: (options.get(mission)?.size ?? 0) > 0 }))
        .filter(({ mission, available }) => available || mission !== 'HIP_SHOOT')
      : [];
    const draft = missionsEnabled ? this.#airDraftView() : null;
    const refits: AirRefit[] = [];
    if (enabled('REFIT_AIRCRAFT')) {
      for (const candidate of this.#candidates('REFIT_AIRCRAFT', null, 50)) {
        if (candidate.kind !== 'REFIT_AIRCRAFT' || refits.some(({ baseId }) => baseId === candidate.baseId)) continue;
        const base = this.#pieces().find(({ id }) => id === candidate.baseId);
        if (!base || base.location.kind !== 'ON_MAP') continue;
        const hexId = base.location.hexId;
        const inactive = this.#pieces().filter((piece) => piece.ownerId === view.playerId && piece.location.kind === 'ON_MAP'
          && piece.location.hexId === hexId && piece.statuses.includes('status:air-inactive')).map(({ id }) => id);
        const sources = this.#candidates('REFIT_AIRCRAFT', null, 50).flatMap((action) => action.kind === 'REFIT_AIRCRAFT' && action.baseId === candidate.baseId ? [action.sourcePieceId] : []);
        const selected = (this.#refitSelection.get(candidate.baseId) ?? candidate.aircraftIds).filter((id) => inactive.includes(id));
        const action: GameAction | null = selected.length > 0 ? { ...candidate, actionId: this.#actionId('refit'), aircraftIds: selected } : null;
        const level = base.statusValues.find(({ statusDefinitionId }) => statusDefinitionId === 'status:air-base-level')?.value;
        refits.push({
          baseId: candidate.baseId, hexId, capacity: 2 * (typeof level === 'number' ? level : 1),
          inactiveIds: inactive, selectedIds: selected, sourceIds: sources, action, explanation: action ? this.#explain(action) : null,
        });
      }
    }
    const zones = projection?.air.patrolZones ?? [];
    return {
      missions, draft,
      targetHexes: draft ? [...(options.get(draft.mission)?.keys() ?? [])] : [],
      refits,
      patrolZones: {
        own: zones.find(({ playerId }) => playerId === view.playerId)?.hexIds ?? [],
        enemy: zones.filter(({ playerId }) => playerId !== view.playerId).flatMap(({ hexIds }) => hexIds),
      },
      trainbusting: (projection?.air.trainbusting ?? []).map(({ hexId, ownerId }) => ({ hexId, own: ownerId === view.playerId })),
      showZones: this.#showAirZones,
    };
  }

  planAirMission = (mission: AirMissionKind): void => {
    this.#resetIntent();
    const byHex = this.#airOptions().get(mission);
    this.#airDraft = { mission, targetHexId: null, target: null, selectedIds: [] };
    this.#notice = byHex && byHex.size > 0 ? `${AIR_MISSION_LABELS[mission]}: click a highlighted target hex.` : `No ${AIR_MISSION_LABELS[mission]} target is in range now.`;
    this.#emit();
  };

  #chooseAirTarget(hexId: string): void {
    const draft = this.#airDraft!;
    const byTarget = this.#airOptions().get(draft.mission)?.get(hexId);
    if (!byTarget) return;
    const target = byTarget.has('COMBAT_UNITS') ? 'COMBAT_UNITS' as const : byTarget.has('AIR_BASE') ? 'AIR_BASE' as const : null;
    const eligible = byTarget.get(target ?? 'HEX') ?? [];
    const maximum = draft.mission === 'BARRAGE' || draft.mission === 'TRAINBUSTING' || draft.mission === 'BASE_TRANSFER' ? 4 : 1;
    this.#airDraft = { ...draft, targetHexId: hexId, target, selectedIds: eligible.slice(0, maximum) };
    this.#notice = `${AIR_MISSION_LABELS[draft.mission]} on ${printedHexLabel(hexId)}: choose the aircraft, check the Flak and table, then fly.`;
    this.#selection = { ...this.#selection, hexId };
  }

  toggleAirAircraft = (pieceId: string): void => {
    const draft = this.#airDraftView();
    if (!draft || !draft.eligibleIds.includes(pieceId as PieceId)) return;
    const selected = draft.selectedIds.includes(pieceId as PieceId)
      ? draft.selectedIds.filter((id) => id !== pieceId)
      : draft.maximum === 1 ? [pieceId as PieceId] : [...draft.selectedIds, pieceId as PieceId].slice(0, draft.maximum);
    this.#airDraft = { ...this.#airDraft!, selectedIds: selected };
    this.#emit();
  };

  setAirTarget = (target: 'COMBAT_UNITS' | 'AIR_BASE'): void => {
    if (!this.#airDraft) return;
    const eligible = this.#airOptions().get(this.#airDraft.mission)?.get(this.#airDraft.targetHexId ?? '')?.get(target) ?? [];
    this.#airDraft = { ...this.#airDraft, target, selectedIds: eligible.slice(0, this.#airDraft.mission === 'BARRAGE' ? 4 : 1) };
    this.#emit();
  };

  declareAirMission = async (): Promise<void> => {
    const draft = this.#airDraftView();
    if (!draft?.action || !draft.explanation?.allowed) return;
    this.#airDraft = null;
    await this.#dispatch(draft.action, `${draft.label} on ${printedHexLabel(draft.targetHexId ?? '')} flown.`);
  };

  cancelAirMission = (): void => { this.#airDraft = null; this.#emit(); };

  toggleRefitAircraft = (baseId: string, pieceId: string): void => {
    const refit = this.getSnapshot().air.refits.find((entry) => entry.baseId === baseId);
    if (!refit || !refit.inactiveIds.includes(pieceId as PieceId)) return;
    const selected = refit.selectedIds.includes(pieceId as PieceId)
      ? refit.selectedIds.filter((id) => id !== pieceId) : [...refit.selectedIds, pieceId as PieceId];
    this.#refitSelection.set(baseId, selected);
    this.#emit();
  };

  refitBase = async (baseId: string): Promise<void> => {
    const refit = this.getSnapshot().air.refits.find((entry) => entry.baseId === baseId);
    if (!refit?.action || !refit.explanation?.allowed) return;
    this.#refitSelection.delete(baseId);
    await this.#dispatch({ ...refit.action, actionId: this.#actionId('refit'), expectedRevision: this.#session.getRevision() } as GameAction,
      `Refit ${refit.selectedIds.length} aircraft at ${printedHexLabel(refit.hexId)} (1T).`);
  };

  toggleAirZones = (): void => { this.#showAirZones = !this.#showAirZones; this.#emit(); };

  #dumpLabel(dumpId: string): string {
    const dump = this.#pieces().find(({ id }) => id === dumpId);
    if (!dump) return 'a dump';
    const size = dump.resourceQuantity !== null ? `${dump.resourceQuantity}T ` : '';
    if (dump.location.kind === 'ON_MAP') return `the ${size}dump at ${printedHexLabel(dump.location.hexId)}`;
    const truck = dump.location.kind === 'CONTAINER' ? this.#pieces().find(({ id }) => id === (dump.location as { containerId: string }).containerId) : undefined;
    return truck?.location.kind === 'ON_MAP' ? `the ${size}truck load at ${printedHexLabel(truck.location.hexId)}` : 'a dump';
  }

  #probe(action: Omit<GameAction, 'actionId' | 'actorId' | 'expectedRevision'>): GameAction | null {
    const view = this.#session.getView(this.#activeSeat());
    const full = { ...action, actionId: this.#actionId('probe'), actorId: view.playerId, expectedRevision: this.#session.getRevision() } as GameAction;
    return this.#explain(full).allowed ? full : null;
  }

  #unitActions(piece: ProjectedPiece, enabled: (kind: GameAction['kind']) => boolean): readonly UnitAction[] {
    return this.#cached(`unit-actions|${piece.id}`, () => {
      const actions: UnitAction[] = [];
      const add = (group: UnitAction['group'], label: string, action: GameAction | null | undefined) => {
        if (action) actions.push({ key: `${group}:${actions.length}:${action.kind}`, group, label, action });
      };
      if (enabled('PAY_FUEL')) {
        for (const action of this.#candidates('PAY_FUEL', piece.id)) {
          if (action.kind !== 'PAY_FUEL') continue;
          const what = action.method === 'SINGLE_UNIT' ? 'Fuel this unit for this phase (1T)'
            : action.method === 'FORMATION' ? 'Fuel its whole formation until Clean Up (1 SP)' : 'Fuel this HQ and the independent units in its range until Clean Up (1 SP)';
          add('FUEL', `${what} from ${this.#dumpLabel(action.sourcePieceId)}`, action);
        }
      }
      if (enabled('ATTEMPT_BREAKOUT')) add('BREAKOUT', 'Attempt breakout (5-6 on one die)', this.#candidates('ATTEMPT_BREAKOUT', piece.id)[0]);
      if (enabled('RECOVER_INTERNALS')) add('SUPPLY', 'Recover internal stocks', this.#candidates('RECOVER_INTERNALS', piece.id)[0]);
      const isDump = piece.resourceQuantity !== null && piece.remainingSteps === null && piece.mode === null && piece.currentFaceId !== 'move' && piece.currentFaceId !== 'extender';
      if (enabled('BLOW_DUMP') && isDump && (piece.resourceQuantity ?? 0) > 0) {
        add('DUMP', `Blow this dump (${piece.resourceQuantity}T; roll for 25-100% destroyed)`, this.#probe({ kind: 'BLOW_DUMP', dumpId: piece.id, tokens: piece.resourceQuantity ?? 0 } as never));
      }
      if (enabled('LOAD_SUPPLY')) {
        for (const action of this.#candidates('LOAD_SUPPLY', piece.id)) {
          if (action.kind === 'LOAD_SUPPLY') add('TRANSPORT', `Load ${action.tokens}T from ${this.#dumpLabel(action.dumpId)} (10% of MA)`, action);
        }
      }
      if (enabled('UNLOAD_SUPPLY')) {
        for (const action of this.#candidates('UNLOAD_SUPPLY', piece.id)) {
          if (action.kind === 'UNLOAD_SUPPLY') add('TRANSPORT', `Unload all ${action.tokens}T here (10% of MA)`, action);
        }
      }
      if (enabled('COMBINE_TRANSPORT')) {
        for (const action of this.#candidates('COMBINE_TRANSPORT', piece.id)) add('TRANSPORT', 'Combine the trucks in this Hex into one counter', action);
      }
      if (enabled('DIVIDE_TRANSPORT')) {
        const size = this.#pieces().find(({ id }) => id === piece.id)?.statusValues.find(({ statusDefinitionId }) => statusDefinitionId === 'status:transport-points')?.value;
        const points = typeof size === 'number' ? size : this.#scenario.pieceCatalog.definitions.find(({ id }) => id === piece.definitionId)?.counter?.transportPoints ?? 0;
        for (let split = 1; split < points; split += 1) {
          add('TRANSPORT', `Split off ${split} truck point${split === 1 ? '' : 's'}`, this.#probe({ kind: 'DIVIDE_TRANSPORT', truckId: piece.id, points: split } as never));
        }
      }
      if (enabled('FORM_EXTENDER')) add('TRANSPORT', 'Form an Extender here (half MA; a trace supply source, 20 Truck MP back)', this.#candidates('FORM_EXTENDER', piece.id)[0]);
      if (enabled('DISSOLVE_EXTENDER')) add('TRANSPORT', 'Flip the Extender back to trucks (half MA)', this.#candidates('DISSOLVE_EXTENDER', piece.id)[0]);
      if (enabled('REDUCE_AIR_BASE')) add('AIR', 'Reduce this Air Base one Level with 1 RE of Combat Mode units here (they do not move)', this.#candidates('REDUCE_AIR_BASE', piece.id)[0]);
      if (enabled('COMBINE_AIRCRAFT')) add('AIR', 'Combine with the other reduced aircraft of the same type here', this.#candidates('COMBINE_AIRCRAFT', piece.id)[0]);
      return distinctLabels(actions);
    });
  }

  #stepActions(enabled: (kind: GameAction['kind']) => boolean): readonly UnitAction[] {
    return this.#cached('step-actions', () => {
      const actions: UnitAction[] = [];
      const name = (pieceId: string) => { const piece = this.#pieces().find(({ id }) => id === pieceId); return piece ? unitLabel(this.#scenario, piece) : 'Unit'; };
      const formations = this.#formationNames(this.#session.getView(this.#activeSeat()).playerId);
      if (enabled('RECOVER_INTERNALS')) {
        for (const action of this.#candidates('RECOVER_INTERNALS')) {
          if (action.kind === 'RECOVER_INTERNALS') actions.push({ key: `recover:${action.pieceId}`, group: 'SUPPLY', label: `${name(action.pieceId)}: recover internal stocks`, action });
        }
      }
      if (enabled('CHOOSE_FORMATION_TRACE')) {
        for (const action of this.#candidates('CHOOSE_FORMATION_TRACE')) {
          if (action.kind !== 'CHOOSE_FORMATION_TRACE') continue;
          const route = action.routeKey.startsWith('HQ:') ? `through ${name(action.routeKey.slice(3))}` : `directly from the source at ${printedHexLabel(action.routeKey.slice(5))}`;
          const formation = formations.get(String(action.formationId)) ?? 'the formation';
          actions.push({ key: `trace:${action.formationId}:${action.routeKey}`, group: 'TRACE', label: `${formation}: trace ${route}`, action });
        }
      }
      if (enabled('ATTEMPT_BREAKOUT')) {
        for (const action of this.#candidates('ATTEMPT_BREAKOUT')) {
          if (action.kind === 'ATTEMPT_BREAKOUT') actions.push({ key: `breakout:${action.pieceId}`, group: 'BREAKOUT', label: `${name(action.pieceId)}: attempt breakout`, action });
        }
      }
      return distinctLabels(actions);
    });
  }

  #collapseHexes(piece: ProjectedPiece): readonly string[] {
    if (piece.location.kind !== 'ON_MAP') return [];
    const origin = piece.location.hexId;
    return this.#scenario.mapDefinition.hexes.map(({ id }) => id).filter((hexId) => hexId !== origin
      && this.#probe({ kind: 'COLLAPSE_EXTENDER', extenderId: piece.id, hexId } as never) !== null);
  }

  runAction = async (key: string): Promise<void> => {
    const snapshot = this.getSnapshot();
    const entry = [...snapshot.unitActions, ...snapshot.stepActions].find((candidate) => candidate.key === key);
    if (!entry) return;
    await this.#dispatch({ ...entry.action, actionId: this.#actionId('unit-action'), expectedRevision: this.#session.getRevision() } as GameAction, `${entry.label}: done.`);
  };

  #emit(): void {
    const view = this.#session.getView(this.#activeSeat());
    if (!view.privacyLocked) this.#seen.set(this.#activeSeat(), this.#history().length);
    const snapshot = this.getSnapshot();
    for (const listener of this.#listeners) listener(snapshot);
  }

  subscribe = (listener: UiListener): (() => void) => {
    this.#listeners.add(listener);
    listener(this.getSnapshot());
    return () => this.#listeners.delete(listener);
  };

  #resetIntent(): void { this.#destination = null; this.#draft = null; this.#airDraft = null; }

  selectPiece = (pieceId: string | null): void => {
    const piece = this.#pieces().find(({ id }) => id === pieceId);
    this.#selection = { pieceId, hexId: piece?.location.kind === 'ON_MAP' ? piece.location.hexId : this.#selection.hexId };
    this.#resetIntent();
    this.#emit();
  };

  clearSelection = (): void => {
    this.#selection = initialSelection();
    this.#resetIntent();
    this.#emit();
  };

  #openDraft(kind: AttackDraft['kind'], targetHexId: string): void {
    const snapshotSegment = this.#session.getView(this.#activeSeat()).projection?.sequence.segment;
    if (kind === 'BARRAGE') {
      const candidates = this.#candidates('DECLARE_BARRAGE').filter((action) => action.kind === 'DECLARE_BARRAGE' && action.targetHexId === targetHexId);
      const eligible = [...new Set(candidates.flatMap((action) => action.kind === 'DECLARE_BARRAGE' ? action.firerIds : []))];
      const first = candidates[0];
      this.#draft = { kind, targetHexId, eligibleIds: eligible, selectedIds: first?.kind === 'DECLARE_BARRAGE' ? first.firerIds : [], leadId: null };
      return;
    }
    const pieceFilter = snapshotSegment === 'COMBAT' ? null : this.#selection.pieceId;
    const candidates = this.#candidates('DECLARE_COMBAT', pieceFilter).filter((action) => action.kind === 'DECLARE_COMBAT' && action.targetHexId === targetHexId);
    const eligible = [...new Set(candidates.flatMap((action) => action.kind === 'DECLARE_COMBAT' ? action.attackerIds : []))];
    const first = candidates[0];
    this.#draft = {
      kind, targetHexId, eligibleIds: eligible,
      selectedIds: first?.kind === 'DECLARE_COMBAT' ? first.attackerIds : [],
      leadId: first?.kind === 'DECLARE_COMBAT' ? first.leadAttackerId : null,
    };
  }

  clickHex = async (hexId: string): Promise<void> => {
    const snapshot = this.getSnapshot();
    if (snapshot.view.privacyLocked || snapshot.view.metadata.lifecycle !== 'ACTIVE') return;
    if (snapshot.decision && snapshot.decisionHexes.includes(hexId)) {
      const option = snapshot.decision.options.find((candidate) => candidate.hexId === hexId);
      if (option) { await this.respondToDecision(option.id); return; }
    }
    if (this.#airDraft && snapshot.air.targetHexes.includes(hexId)) {
      this.#chooseAirTarget(hexId);
      this.#emit();
      return;
    }
    if (snapshot.collapseHexes.includes(hexId) && snapshot.selectedPiece) {
      const action = this.#probe({ kind: 'COLLAPSE_EXTENDER', extenderId: snapshot.selectedPiece.id, hexId } as never);
      if (action) { await this.#dispatch(action, `Extender collapsed to ${printedHexLabel(hexId)}.`); return; }
    }
    if (snapshot.placementHexes.includes(hexId) && snapshot.selectedPiece) {
      const action = this.#candidates('PLACE_REINFORCEMENT', snapshot.selectedPiece.id)
        .find((candidate) => candidate.kind === 'PLACE_REINFORCEMENT' && candidate.hexId === hexId);
      if (action) {
        this.#selection = { ...this.#selection, hexId };
        await this.#dispatch(action, `${unitLabel(this.#scenario, snapshot.selectedPiece)} placed at ${printedHexLabel(hexId)}.`);
        return;
      }
    }
    if (snapshot.reachable.has(hexId)) {
      if (this.#destination === hexId) { await this.confirmMove(); return; }
      this.#destination = hexId;
      this.#draft = null;
      this.#emit();
      return;
    }
    const segment = snapshot.view.projection?.sequence.segment;
    if (snapshot.attackTargets.includes(hexId)) {
      this.#destination = null;
      this.#openDraft(segment === 'COMBAT' ? 'REGULAR' : 'OVERRUN', hexId);
      this.#selection = { ...this.#selection, hexId };
      this.#emit();
      return;
    }
    if (snapshot.barrageTargets.includes(hexId)) {
      this.#destination = null;
      this.#openDraft('BARRAGE', hexId);
      this.#selection = { ...this.#selection, hexId };
      this.#emit();
      return;
    }
    // Otherwise select the Hex and its top friendly unit, if any.
    const friendly = this.#pieces().filter((piece) => piece.location.kind === 'ON_MAP' && piece.location.hexId === hexId
      && piece.ownerId === snapshot.view.playerId);
    const current = friendly.findIndex(({ id }) => id === this.#selection.pieceId);
    const next = friendly.length === 0 ? null : friendly[current >= 0 ? current : friendly.length - 1]!;
    this.#selection = { hexId, pieceId: next?.id ?? null };
    this.#resetIntent();
    this.#emit();
  };

  confirmMove = async (): Promise<void> => {
    const preview = this.getSnapshot().movePreview;
    if (!preview) return;
    const destination = preview.destinationHexId;
    await this.#dispatch(preview.action, `Moved to ${printedHexLabel(destination)}.`);
    this.#selection = { ...this.#selection, hexId: destination };
    this.#destination = null;
    // A unit with nowhere left to go is finished: release it so the player is not left holding a dead selection.
    if (this.getSnapshot().reachable.size === 0) this.#selection = initialSelection();
    this.#emit();
  };

  toggleParticipant = (pieceId: string): void => {
    if (!this.#draft || !this.#draft.eligibleIds.includes(pieceId as PieceId)) return;
    const selected = this.#draft.selectedIds.includes(pieceId as PieceId)
      ? this.#draft.selectedIds.filter((id) => id !== pieceId)
      : [...this.#draft.selectedIds, pieceId as PieceId];
    this.#draft = { ...this.#draft, selectedIds: selected, leadId: this.#draft.leadId && selected.includes(this.#draft.leadId) ? this.#draft.leadId : selected[0] ?? null };
    this.#emit();
  };

  setLead = (pieceId: string): void => {
    if (!this.#draft || !this.#draft.selectedIds.includes(pieceId as PieceId)) return;
    this.#draft = { ...this.#draft, leadId: pieceId as PieceId };
    this.#emit();
  };

  declareDraft = async (): Promise<void> => {
    const draft = this.getSnapshot().draft;
    if (!draft?.action || !draft.explanation?.allowed) return;
    const target = draft.targetHexId;
    this.#draft = null;
    await this.#dispatch(draft.action, draft.kind === 'BARRAGE' ? `Barrage on ${printedHexLabel(target)} declared.` : `${draft.kind === 'OVERRUN' ? 'Overrun' : 'Attack'} on ${printedHexLabel(target)} declared.`, draft.explanation);
  };

  cancelDraft = (): void => { this.#draft = null; this.#emit(); };

  changeMode = async (mode: OcsMode): Promise<void> => {
    const option = this.getSnapshot().modeOptions.find((candidate) => candidate.mode === mode);
    if (option) await this.#dispatch(option.action, `Mode changed to ${mode.toLowerCase()}.`);
  };

  releaseReserve = async (): Promise<void> => {
    const action = this.getSnapshot().releaseAction;
    if (action) await this.#dispatch(action, 'Reserve released.');
  };

  feedSupply = async (pieceId: string, dumpId: string): Promise<void> => {
    const option = this.getSnapshot().supplyNeeds.find((need) => need.pieceId === pieceId)?.options.find((candidate) => candidate.dumpId === dumpId);
    if (option) await this.#dispatch(option.action, 'Supply drawn from the dump.');
  };

  /**
   * When the other player's step offers nothing but blowing dumps, end it for them instead of
   * asking for two hand-overs. Recorded with its own action scope so the log explains it.
   */
  async #autoPassDumpOnly(): Promise<string> {
    if (!this.#skipDumpOnlySteps) return '';
    const passed: string[] = [];
    for (let guard = 0; guard < 12; guard += 1) {
      if (this.#session.getMetadata().lifecycle !== 'ACTIVE' || this.#handoffToken !== null || this.#decision() !== null) break;
      const sequence = this.#session.getView(this.#activeSeat()).projection?.sequence;
      const seat = this.#bindings.find(({ playerId }) => playerId === sequence?.actingPlayerId);
      if (!sequence || !seat || seat.seatId === this.#activeSeat()) break;
      const enabled = this.#session.getActionFamilies(seat.seatId).filter(({ enabled: on }) => on).map(({ kind }) => kind);
      if (!enabled.includes('ADVANCE_SEQUENCE') || !enabled.every((kind) => kind === 'ADVANCE_SEQUENCE' || kind === 'BLOW_DUMP')) break;
      const action: GameAction = { actionId: this.#actionId(AUTO_PASS_SCOPE), actorId: seat.playerId, expectedRevision: this.#session.getRevision(), kind: 'ADVANCE_SEQUENCE' };
      const result = await this.#session.dispatch({ requestId: this.#requestId(), seatId: seat.seatId, action });
      if (result.status !== 'ACCEPTED') break;
      passed.push(`${seat.label}: ${phaseLabel(sequence.phase, sequence.segment)}`);
    }
    return passed.length > 0 ? ` Passed without a hand-over (only dump blowing was possible): ${passed.join('; ')}.` : '';
  }

  async #run(operation: () => Promise<string>): Promise<void> {
    if (this.#busy) return;
    this.#busy = true;
    this.#emit();
    try { this.#notice = await operation(); this.#notice += await this.#autoPassDumpOnly(); }
    catch (error) { this.#notice = error instanceof Error ? error.message : 'Unexpected UI operation failure.'; }
    finally { this.#busy = false; this.#emit(); }
  }

  #requestId() {
    const parsed = parseDispatchRequestId(`ui:request:${String(++this.#requestSequence).padStart(6, '0')}`);
    if (!parsed.ok) throw new Error(parsed.error.message);
    return parsed.value;
  }

  /** A combat resolved by this seat's own action is shown to it as a result card. */
  #noteResolved(events: readonly RuleEvent[]): string {
    const resolved = events.filter((event): event is Extract<RuleEvent, { kind: 'TRANSACTION_RESOLVED' }> => event.kind === 'TRANSACTION_RESOLVED');
    if (resolved.length === 0) return '';
    this.#resultCard.set(this.#activeSeat(), resolved.at(-1)!.transactionId);
    return ` Result ${resolved.map(({ result }) => result).join(', ')}.`;
  }

  /** Facts of a declared combat, kept in case it resolves before any projection shows it. */
  #rememberDeclaration(events: readonly RuleEvent[], explanation: RuleExplanation | undefined, action: GameAction): void {
    const declared = events.find((event) => event.kind === 'TRANSACTION_DECLARED');
    if (!declared || declared.kind !== 'TRANSACTION_DECLARED' || !explanation || this.#combatFacts.has(declared.transactionId)) return;
    const fact = (key: string) => explanation.facts.find((entry) => entry.key === key)?.value;
    const number = (key: string): number | null => (typeof fact(key) === 'number' ? fact(key) as number : null);
    const barrage = action.kind === 'DECLARE_BARRAGE';
    this.#combatFacts.set(declared.transactionId, {
      kind: declared.transactionKind, targetHexId: action.kind === 'DECLARE_COMBAT' || action.kind === 'DECLARE_BARRAGE' ? action.targetHexId : '',
      attackerOwnerId: action.actorId, attackerCount: action.kind === 'DECLARE_COMBAT' ? action.attackerIds.length : action.kind === 'DECLARE_BARRAGE' ? action.firerIds.length : 0,
      defenderCount: 0, attackerStrength: number(barrage ? 'barrage.strength' : 'combat.attackerStrength') ?? 0,
      defenderStrength: barrage ? null : number('combat.defenderStrength'), odds: String(fact(barrage ? 'barrage.finalColumn' : 'combat.odds') ?? ''),
      line: barrage ? null : String(fact('combat.line') ?? ''), drm: barrage ? null : number('combat.drm'),
      defenderSupplied: null, result: null, rollTotal: null, surpriseTotal: null, shiftDie: null, air: null,
    });
  }

  #dispatch = async (action: GameAction, message: string, explanation?: RuleExplanation): Promise<void> => this.#run(async () => {
    let success = message;
    const result = await this.#session.dispatch({ requestId: this.#requestId(), seatId: this.#activeSeat(), action });
    if (result.status !== 'ACCEPTED') {
      return `Not allowed: ${result.violations.map(({ message }) => message).join(' ')}`;
    }
    this.#rememberDeclaration(result.events, explanation, action);
    if (action.kind !== 'MOVE_PIECE') this.#resetIntent();
    const airResults = result.events.flatMap((event) => event.kind === 'TRANSACTION_RESOLVED' && action.kind === 'DECLARE_AIR_MISSION' ? [event.result] : []);
    if (airResults.length > 0) success = `${success} ${withPrintedHexes(airResults.join(' '))}`;
    const resolved = airResults.length > 0 ? (this.#noteResolved(result.events), '') : this.#noteResolved(result.events);
    const pending = this.#decision();
    if (pending && pending.seatId !== this.#activeSeat()) {
      const owner = this.#bindings.find(({ seatId }) => seatId === pending.seatId);
      return `${success}${resolved} ${owner?.label ?? 'The other player'} must decide next.`;
    }
    return `${success}${resolved}`;
  });

  respondToDecision = async (choiceId: string): Promise<void> => this.#run(async () => this.#respond(choiceId));

  async #respond(choiceId: string): Promise<string> {
    const decision = this.#session.getPendingDecision(this.#activeSeat());
    const chosen = decision ? distinctLabels(decision.options).find(({ id }) => id === choiceId)?.label : undefined;
    const result = await this.#session.respondToPendingDecision(this.#requestId(), this.#activeSeat(), choiceId);
    if (result.status !== 'ACCEPTED') return `Decision not accepted: ${result.violations.map(({ message }) => message).join(' ')}`;
    // Answers are kept per seat: the defender must not see where the attacker drew supply from.
    const answerKey = `${decision?.transactionId}|${this.#activeSeat()}`;
    if (decision?.transactionId && chosen) this.#answers.set(answerKey, [...(this.#answers.get(answerKey) ?? []), chosen.replace(/-?\d+,-?\d+/gu, (id) => printedHexLabel(id))]);
    const resolved = this.#noteResolved(result.events);
    const combat = result.events.filter((event) => event.kind === 'TRANSACTION_RESOLVED');
    if (combat.length > 0 && result.events.some((event) => event.kind === 'AIRCRAFT_STATUS_CHANGED')) {
      return `Air mission resolved: ${withPrintedHexes(combat.map((event) => event.kind === 'TRANSACTION_RESOLVED' ? event.result : '').join(' '))}`;
    }
    return resolved ? `Combat resolved.${resolved}` : 'Decision recorded.';
  }

  autoPay = async (): Promise<void> => this.#run(async () => {
    let paid = 0;
    for (let guard = 0; guard < 20; guard += 1) {
      const decision = this.#session.getPendingDecision(this.#activeSeat());
      if (!decision || decision.kind !== 'SUPPLY_SOURCE') break;
      const pieces = this.#pieces();
      const scored = decision.options.flatMap(({ id }) => {
        if (!id.startsWith('pay:')) return [];
        const body = id.slice('pay:'.length);
        const dumpId = body.slice(0, body.lastIndexOf(':'));
        const tokens = Number(body.slice(body.lastIndexOf(':') + 1));
        const available = pieces.find((piece) => piece.id === dumpId)?.resourceQuantity ?? 0;
        return [{ id, tokens, available }];
      }).sort((left, right) => right.tokens - left.tokens || right.available - left.available);
      if (scored.length === 0) break;
      const message = await this.#respond(scored[0]!.id);
      paid += scored[0]!.tokens;
      if (!message.startsWith('Decision recorded') && !message.startsWith('Combat resolved')) return message;
      if (message.startsWith('Combat resolved')) return `Paid ${paid}T. ${message}`;
    }
    return `Paid ${paid}T of combat supply from the largest dumps.`;
  });

  endStep = async (): Promise<void> => {
    const view = this.#session.getView(this.#activeSeat());
    const action: GameAction = {
      actionId: this.#actionId('advance'), actorId: view.playerId, expectedRevision: this.#session.getRevision(), kind: 'ADVANCE_SEQUENCE',
    };
    this.#selection = initialSelection();
    this.#resetIntent();
    const step = view.projection?.sequence;
    await this.#dispatch(action, step ? `${phaseLabel(step.phase, step.segment)} finished.` : 'Step ended.');
  };

  undoStep = async (): Promise<void> => this.#run(async () => {
    const available = this.#undoStepAvailable();
    const auto = this.#autoCheckpoint;
    if (!available || !auto) return 'Nothing to undo in this step.';
    const result = await this.#session.undoTo(auto.id);
    if (!result.ok) return result.code;
    const resumed = this.#session.resume();
    this.#selection = initialSelection();
    this.#resetIntent();
    return resumed.ok ? `Back to the ${available.label}.` : resumed.code;
  });

  dismissResult = (): void => { this.#resultCard.delete(this.#activeSeat()); this.#emit(); };

  dismissAwayReport = (): void => { this.#awayReport = null; this.#emit(); };

  setSkipDumpOnlySteps = (enabled: boolean): void => {
    this.#skipDumpOnlySteps = enabled;
    this.#notice = enabled ? 'Steps where the other player could only blow dumps now pass without a hand-over.' : 'Every step with a legal action now asks for a hand-over.';
    this.#emit();
  };

  start = (): void => {
    const result = this.#session.start();
    this.#notice = result.ok ? 'Session started.' : result.code;
    this.#afterChange();
    this.#emit();
  };

  togglePause = (): void => {
    const lifecycle = this.#session.getMetadata().lifecycle;
    const result = lifecycle === 'PAUSED' ? this.#session.resume() : this.#session.pause();
    this.#notice = result.ok ? (lifecycle === 'PAUSED' ? 'Resumed.' : 'Paused. Resume to continue playing.') : result.code;
    this.#emit();
  };

  createCheckpoint = (): void => {
    const checkpoint = this.#session.createCheckpoint(`Revision ${this.#session.getRevision()}`);
    this.#notice = `Checkpoint created at revision ${checkpoint.revision}.`;
    this.#emit();
  };

  undoTo = async (checkpointId: string): Promise<void> => this.#run(async () => {
    const checkpoint = this.#session.listCheckpoints().find(({ id }) => id === checkpointId);
    if (!checkpoint) return 'Checkpoint no longer exists.';
    const result = await this.#session.undoTo(checkpoint.id);
    this.#resetIntent();
    return result.ok ? `Restored ${checkpoint.label || checkpoint.id}. Resume to continue.` : result.code;
  });

  serializeSave = (): string => this.#session.serializeSave();

  serializeReplay = (): string => JSON.stringify(this.#session.exportReplay(), null, 2);

  loadSave = async (serialized: string): Promise<void> => this.#run(async () => {
    const loaded = await this.#engine.loadSession(serialized);
    if (loaded.getMetadata().scenarioId !== this.#scenario.id) {
      await loaded.close();
      throw new Error('This UI currently accepts saves for the loaded scenario only.');
    }
    await this.#session.close();
    this.#session = loaded;
    this.#cache.clear();
    this.#cacheScope = '';
    this.#selection = initialSelection();
    this.#resetIntent();
    this.#handoffToken = null;
    this.#handoffInfo = null;
    this.#awayReport = null;
    this.#autoCheckpoint = null;
    this.#openTransaction = null;
    this.#seen.clear();
    // An automatic checkpoint inside the save belongs to a step that is over; keep only the new one.
    for (const checkpoint of loaded.listCheckpoints()) if (checkpoint.label.startsWith('Auto: ')) loaded.removeCheckpoint(checkpoint.id);
    this.#bindSession();
    this.#afterChange();
    return `Save loaded at revision ${loaded.getRevision()}.`;
  });

  beginHandoff = (): void => {
    const from = this.#activeSeat();
    const snapshot = this.getSnapshot();
    const to = snapshot.handoff?.toSeatId ?? this.#bindings.find(({ seatId }) => seatId !== from)?.seatId;
    if (!to) { this.#notice = 'No second seat is available.'; this.#emit(); return; }
    const toLabel = this.#bindings.find(({ seatId }) => seatId === to)?.label ?? 'the next player';
    const reason = snapshot.handoff?.reason ?? 'Hand-over requested from the Session menu.';
    this.#handoffInfo = { toSeatId: to, toLabel, reason };
    this.#handoffToken = this.#session.beginHandoff(from, to);
    this.#notice = `Screen locked for ${toLabel}.`;
    this.#emit();
  };

  completeHandoff = (): void => {
    if (this.#handoffToken === null || !this.#handoffInfo) return;
    const to = this.#handoffInfo.toSeatId;
    // Everything the incoming player has not yet seen: the other seat's actions and automatic steps.
    const seen = this.#seen.get(to) ?? 0;
    const missed = this.#history().slice(seen).filter((record) => record.seatId !== to);
    const result = this.#session.completeHandoff(this.#handoffToken);
    if (result.ok) {
      this.#handoffToken = null;
      const label = this.#handoffInfo.toLabel;
      this.#handoffInfo = null;
      const context = this.#narrativeContext(to);
      const revisions = new Set(missed.map(({ revisionAfter }) => Number(revisionAfter)));
      const combats = buildCombatReports(this.#history(), this.#combatFacts, context)
        .filter((report) => report.status !== 'OPEN' && revisions.has(report.lastRevision));
      this.#awayReport = missed.length > 0 ? { entries: missed.map((record) => describeRecord(record, context)), combats } : null;
      this.#notice = `Your turn, ${label}.`;
    } else {
      this.#notice = result.code;
    }
    this.#selection = initialSelection();
    this.#resetIntent();
    this.#afterChange();
    this.#emit();
  };

  dispose = (): void => {
    this.#unsubscribeSession?.();
    this.#unsubscribeSession = null;
    this.#listeners.clear();
  };
}

export const createUiController = (options: UiControllerOptions): UiController =>
  new DefaultUiController(options);
