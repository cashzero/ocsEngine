import type { HexId, PieceId, PlayerId } from '../core/index.js';
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
  AIR_MISSION_KINDS, AIR_MISSION_LABELS, FUEL_COSTS, distanceBetween, missionSegment, parseRuleActionId, routesForRange,
  type AirMissionKind, type AirRoute, type AttackerSupplyChoice, type AttackerSupplyOption, type GameAction, type ProjectedCombat, type ProjectedPiece, type RuleEvent, type RuleExplanation, type UnitRebuild,
} from '../rules/index.js';
import type {
  AirDraft, AirOverview, AirRefit, Arrival, AttackDraft, AwayReport, AirRebuild, BuildOption, GroundRebuild, ConstructionOverview, CombatSheet, EndStep, HandoffInfo, MoveBlocker, MovePreview, MoveRangeEntry,
  DropPlanDraft, DropPlanView, LedgerLine, RailPanel, SeaPanel, SupplyNeed, TransportCarrier, UiListener, UiSelection, UiSnapshot, UnitAction, UnitFilterKind,
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
  /** Finish the selected unit's move (6.1g) and let it go; a unit that has not begun moving is only deselected. */
  readonly finishMove: () => Promise<void>;
  readonly confirmMove: () => Promise<void>;
  readonly toggleParticipant: (pieceId: string) => void;
  readonly setLead: (pieceId: string) => void;
  /** Declare where a ticked attacker gets its combat supply (9.5, 12.10a). */
  readonly chooseAttackerSupply: (pieceId: string, optionId: string) => void;
  readonly declareDraft: () => Promise<void>;
  readonly cancelDraft: () => void;
  readonly changeMode: (mode: OcsMode) => Promise<void>;
  readonly releaseReserve: () => Promise<void>;
  readonly feedSupply: (pieceId: string, dumpId: string) => Promise<void>;
  /** Run one of the snapshot's unitActions or stepActions by key. */
  readonly runAction: (key: string) => Promise<void>;
  /** Load a chosen number of Tokens from a dump in the selected truck's Hex, or unload some of its load (13.2f). */
  readonly transferSupply: (kind: 'LOAD' | 'UNLOAD', dumpId: string | null, tokens: number) => Promise<void>;
  /** Split a chosen number of Transport Points off the selected truck (13.2c). */
  readonly divideTruck: (points: number) => Promise<void>;
  /** Rail transport from the selected hex (13.3): tick cargo, set Tokens per dump, pick the detraining hex, confirm. */
  readonly toggleRailUnit: (pieceId: string) => void;
  readonly setRailTokens: (dumpId: string, tokens: number) => void;
  readonly chooseRailDestination: (hexId: string) => void;
  readonly openRail: () => void;
  readonly closeRail: () => void;
  readonly confirmRailMove: () => Promise<void>;
  /** Shipping (19.0f) from the selected unit's port or, with nothing selected, from the reinforcement Box. */
  readonly toggleSeaUnit: (pieceId: string) => void;
  readonly setSeaTokens: (dumpId: string, tokens: number) => void;
  readonly chooseSeaDestination: (hexId: string) => void;
  readonly confirmSeaMove: () => Promise<void>;
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
  /** A turn-based game has no pause: this only takes back a session that arrived paused (an older save). */
  readonly resume: () => void;
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
  readonly setAirTarget: (target: 'COMBAT_UNITS' | 'AIR_BASE' | 'PORT') => void;
  readonly declareAirMission: () => Promise<void>;
  readonly cancelAirMission: () => void;
  /** Start planning Air Base construction with the selected Engineer-Capable unit; then click a highlighted hex. */
  readonly toggleRebuildAircraft: (eqPieceId: string, pieceId: string) => void;
  readonly setRebuildBase: (eqPieceId: string, baseId: string) => void;
  readonly rebuildAircraft: (eqPieceId: string) => Promise<void>;
  /** 13.5a-e: choose what the Repls in a hex rebuild: units, the steps each regains, a Dead Pile unit's mode, and trucks. */
  readonly toggleRebuildUnit: (hexId: string, pieceId: string) => void;
  readonly setRebuildUnitSteps: (hexId: string, pieceId: string, steps: number) => void;
  readonly setRebuildUnitMode: (hexId: string, pieceId: string, mode: string) => void;
  readonly setRebuildTrucks: (hexId: string, points: number) => void;
  readonly rebuildUnits: (hexId: string) => Promise<void>;
  readonly toggleTransportCarrier: (pieceId: string) => void;
  readonly setTransportRoute: (pieceId: string, route: string) => void;
  readonly toggleTransportEscort: (pieceId: string) => void;
  readonly toggleTransportUnit: (pieceId: string) => void;
  readonly setTransportTokens: (tokens: number) => void;
  readonly setTransportBase: (hexId: string) => void;
  readonly startDropPlan: () => void;
  readonly toggleDropUnit: (pieceId: string) => void;
  readonly setDropTurn: (turn: number) => void;
  readonly cancelDropPlan: () => void;
  readonly confirmDropPlan: () => Promise<void>;
  readonly changeDropPlan: (planId: string, change: 'DELAY' | 'CANCEL') => Promise<void>;
  readonly planConstruction: () => void;
  readonly cancelConstruction: () => void;
  readonly buildAirBase: (facility: 'AIR_STRIP' | 'AIR_BASE' | 'HEDGEHOG') => Promise<void>;
  readonly toggleRefitAircraft: (baseId: string, pieceId: string) => void;
  readonly refitBase: (baseId: string) => Promise<void>;
  readonly toggleAirZones: () => void;
  readonly toggleTraceCoverage: () => void;
  readonly toggleHideUnits: () => void;
  readonly toggleUnitKind: (kind: UnitFilterKind) => void;
  readonly dispose: () => void;
}

interface AirDraftInput {
  readonly mission: AirMissionKind;
  readonly targetHexId: string | null;
  readonly target: 'COMBAT_UNITS' | 'AIR_BASE' | 'PORT' | null;
  readonly selectedIds: readonly PieceId[];
  /** Air Transport and Air Drop: where the cargo is loaded, which Transports carry it and how they fly, the escorts, the units and Tokens. */
  readonly baseHexId?: string | null;
  readonly carrierIds?: readonly PieceId[] | null;
  readonly routes?: Readonly<Record<string, AirRoute>>;
  readonly escortIds?: readonly PieceId[];
  readonly unitIds?: readonly PieceId[] | null;
  readonly tokens?: number | null;
}

const initialSelection = (): UiSelection => ({ hexId: null, pieceId: null });

/** Replace raw Hex IDs ("q,r") in engine text with printed Hex numbers. */
const withPrintedHexes = (text: string): string => text.replace(/-?\d+,-?\d+/gu, (hexId) => printedHexLabel(hexId));

/** Two Piece locations are the same hex or the same off-map box. */
const sameLocation = (left: { readonly kind: string; readonly hexId?: unknown; readonly boxId?: unknown }, right: { readonly kind: string; readonly hexId?: unknown; readonly boxId?: unknown }): boolean =>
  left.kind === right.kind && (left.kind === 'ON_MAP' ? left.hexId === right.hexId : left.kind === 'OFF_MAP_BOX' ? left.boxId === right.boxId : false);

interface DraftInput {
  readonly kind: AttackDraft['kind'];
  readonly targetHexId: string;
  readonly eligibleIds: readonly PieceId[];
  readonly selectedIds: readonly PieceId[];
  readonly leadId: PieceId | null;
  /** Declared combat supply of the ticked attackers, in the order they were ticked and pay. */
  readonly supply: readonly AttackerSupplyChoice[];
}

const sameSupplyChoice = (left: AttackerSupplyChoice, right: AttackerSupplyChoice): boolean =>
  left.method === right.method && (left.method === 'INTERNAL' || (right.method === 'DUMPS' && left.dumpIds.join('|') === right.dumpIds.join('|')));

interface AutoCheckpoint {
  readonly id: CheckpointDescriptor['id'];
  readonly stepKey: string;
  readonly historyLength: number;
  readonly seatId: SeatId;
  readonly label: string;
}

/** One action that Undo can take back: the state just before it, kept as a checkpoint. */
interface UndoPoint {
  readonly id: CheckpointDescriptor['id'];
  readonly stepKey: string;
  readonly seatId: SeatId;
  /** What the action did, in the words shown to the player ("Moved to 0316."). */
  readonly label: string;
}

/** Label prefix of the checkpoints taken before each undoable action; they are never listed with the player's own checkpoints. */
const UNDO_POINT_PREFIX = 'Before: ';
/** Most actions Undo can step back through in one step. */
const UNDO_DEPTH = 30;
/**
 * Actions that only rearrange the player's own units and stores, so taking one back reveals nothing and re-rolls
 * nothing. Anything else (combat, barrage, decisions, ending a step, air missions, blowing a dump...) clears Undo.
 */
const UNDOABLE_ACTIONS: ReadonlySet<GameAction['kind']> = new Set([
  'MOVE_PIECE', 'END_MOVE', 'CREATE_BREAKDOWN', 'CHANGE_MODE', 'RELEASE_RESERVE', 'PLACE_REINFORCEMENT', 'PAY_FUEL', 'RECOVER_INTERNALS', 'CHOOSE_FORMATION_TRACE',
  'LOAD_SUPPLY', 'UNLOAD_SUPPLY', 'COMBINE_TRANSPORT', 'DIVIDE_TRANSPORT', 'FORM_EXTENDER', 'DISSOLVE_EXTENDER',
]);

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

/** A rebuilt Dead Pile unit is placed in Combat Mode when its counter has that side, otherwise the first mode it may take (13.5b). */
const defaultPlacementMode = (modes: readonly OcsMode[]): OcsMode | null => modes.includes('COMBAT') ? 'COMBAT' : modes[0] ?? null;

/** Quarters from the engine's Rail Cap text ("2 1/4" is nine). */
const quartersOf = (text: string): number => {
  const [whole, part] = text.includes(' ') ? text.split(' ') : text.includes('/') ? ['0', text] : [text, ''];
  return Number(whole) * 4 + (({ '1/4': 1, '1/2': 2, '3/4': 3 } as Record<string, number>)[part ?? ''] ?? 0);
};

/** "2 1/4" for nine quarters. */
export const quartersLabel = (quarters: number): string => {
  const whole = Math.floor(quarters / 4);
  const part = ['', '1/4', '1/2', '3/4'][quarters % 4]!;
  return whole === 0 ? (part || '0') : part ? `${whole} ${part}` : String(whole);
};

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
  #buildDraft: { readonly engineerId: string; readonly hexId: string | null } | null = null;
  #dropDraft: { readonly unitIds: readonly PieceId[]; readonly hexId: string | null; readonly turn: number | null } | null = null;
  /** A rail move being put together (13.3): units ticked, Tokens per dump, and the destination; kept while the hex stays selected. */
  #railDraft: { readonly fromHexId: string; readonly unitIds: ReadonlySet<string>; readonly tokens: ReadonlyMap<string, number>; readonly toHexId: string | null } | null = null;
  /** A shipment being put together (19.0f); `fromHexId` null is the reinforcement Box. */
  /** The piece whose Rail transport panel the player opened (13.3); the panel shows only while that piece stays selected. */
  #railOpen: string | null = null;
  #seaDraft: { readonly fromHexId: string | null; readonly unitIds: ReadonlySet<string>; readonly tokens: ReadonlyMap<string, number>; readonly toHexId: string | null } | null = null;
  #rebuildSelection = new Map<string, { readonly aircraftIds: readonly PieceId[] | null; readonly baseId: PieceId | null }>();
  /** Per hex of Repls: the units chosen (null: the default rebuild) and the truck points (null: the default). */
  #unitRebuildSelection = new Map<string, { readonly units: readonly UnitRebuild[] | null; readonly truckPoints: number | null }>();
  #refitSelection = new Map<string, readonly PieceId[]>();
  #showAirZones = false;
  #showTraceCoverage = false;
  #hideUnits = false;
  #hiddenUnitKinds = new Set<UnitFilterKind>();
  /** Public combat facts per transaction, captured while the combat is open. */
  #combatFacts = new Map<string, ProjectedCombat>();
  #openTransaction: string | null = null;
  /** History length each seat has already seen at the screen. */
  #seen = new Map<SeatId, number>();
  #awayReport: AwayReport | null = null;
  #resultCard = new Map<SeatId, string>();
  #answers = new Map<string, string[]>();
  #autoCheckpoint: AutoCheckpoint | null = null;
  /** Actions of the current step that Undo can take back, oldest first. */
  #undoPoints: UndoPoint[] = [];
  #undoing = false;
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
    this.#continueNumbering();
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

  /** The seat's view, projected and copied once per revision, lifecycle, active seat and hand-over (one click read it ~50 times). */
  #view(seatId: SeatId): ReturnType<GameSession['getView']> {
    return this.#cached(`view|${seatId}`, () => this.#session.getView(seatId));
  }

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
    return (this.#view(this.#activeSeat()).projection?.stacks ?? []).flatMap(({ pieces }) => pieces);
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
      // Whatever path dispatched it, an action Undo cannot take back (or one that rolled or revealed) ends what came before.
      if (!UNDOABLE_ACTIONS.has(notification.record.action.kind) || notification.record.events.some((event) => IRREVERSIBLE_EVENTS.has(event.kind))) this.#clearUndoPoints();
      for (const event of notification.record.events) {
        if (event.kind === 'TRANSACTION_DECLARED') this.#openTransaction = event.transactionId;
        if ((event.kind === 'TRANSACTION_RESOLVED' || event.kind === 'TRANSACTION_CANCELLED') && this.#openTransaction === event.transactionId) this.#openTransaction = null;
      }
    }
    if (notification.kind === 'CHECKPOINT_RESTORED') {
      // A restore the player asked for from the Session list invalidates the stack; Undo's own restore keeps it.
      if (!this.#undoing) this.#clearUndoPoints();
      this.#openTransaction = null;
      const length = this.#session.getHistory({ offset: 0, limit: 0, actionKind: null }).total;
      for (const [seat, seen] of this.#seen) this.#seen.set(seat, Math.min(seen, length));
    }
    if (this.#openTransaction !== null) {
      const view = this.#view(this.#activeSeat());
      const combat = view.projection?.combat;
      // Keep the odds as declared: after the roll, losses change the strengths shown in the projection.
      if (combat && combat.result === null) this.#combatFacts.set(this.#openTransaction, combat);
    }
    this.#afterChange();
  }

  #stepKey(): string | null {
    const sequence = this.#view(this.#activeSeat()).projection?.sequence;
    return sequence ? `${sequence.gameTurn}:${sequence.playerTurnIndex}:${sequence.phase}:${sequence.segment}:${sequence.actingPlayerId}` : null;
  }

  /** Keep one rolling automatic checkpoint at the start of the current step; older ones are dropped. */
  #afterChange(): void {
    const metadata = this.#session.getMetadata();
    if (metadata.lifecycle !== 'ACTIVE' || this.#handoffToken !== null || this.#decision() !== null) return;
    const key = this.#stepKey();
    if (key === null || this.#autoCheckpoint?.stepKey === key) return;
    const sequence = this.#view(this.#activeSeat()).projection!.sequence;
    const label = `Auto: start of ${phaseLabel(sequence.phase, sequence.segment)} (turn ${sequence.gameTurn})`;
    if (this.#autoCheckpoint) this.#session.removeCheckpoint(this.#autoCheckpoint.id);
    const checkpoint = this.#session.createCheckpoint(label);
    const actingSeat = this.#bindings.find(({ playerId }) => playerId === sequence.actingPlayerId)?.seatId ?? this.#activeSeat();
    this.#autoCheckpoint = { id: checkpoint.id, stepKey: key, historyLength: checkpoint.actionIndex, seatId: actingSeat, label };
  }

  #buildDraftAction(input: DraftInput): GameAction | null {
    if (input.selectedIds.length === 0) return null;
    const view = this.#view(this.#activeSeat());
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
      attackerSupply: input.supply,
    };
  }

  #endStep(): EndStep {
    const view = this.#view(this.#activeSeat());
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
    // A Breakdown absorbed back into its pool (20.0d) is no longer in play; its creation still names it in the log.
    for (const record of this.#history()) {
      for (const event of record.events) {
        if (event.kind === 'BREAKDOWN_CREATED') known.set(String(event.breakdownId), { name: event.name, ownerId: record.action.actorId });
      }
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
    const combat = this.#view(this.#activeSeat()).projection?.combat;
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
        case 'BREAKDOWN_ABSORPTION': return 'Choose which unit absorbs a Breakdown as the phase ends (20.0d).';
        case 'ATTRITION_LOSS': return 'Choose the units lost to attrition (12.8).';
        case 'DISPLACEMENT_HEX': return 'Place displaced trucks (9.14).';
      }
    }
    const sequence = this.#view(this.#activeSeat()).projection?.sequence;
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

  /** Everything since the current player turn began (a new game turn or the other player's turn starting). */
  #turnRecords(): readonly HistoryRecord[] {
    const records = this.#history();
    for (let index = records.length - 1; index >= 0; index -= 1) {
      const turnChanged = records[index]!.events.some((event) => event.kind === 'SEQUENCE_ADVANCED'
        && (event.from.gameTurn !== event.to.gameTurn || event.from.playerTurnIndex !== event.to.playerTurnIndex));
      if (turnChanged) return records.slice(index + 1);
    }
    return records;
  }

  /** The supply the seat paid or moved this turn, from its own accepted actions. */
  #ledger(records: readonly HistoryRecord[], seatId: SeatId, pieces: readonly ProjectedPiece[]): readonly LedgerLine[] {
    const lines: LedgerLine[] = [];
    // Where a payment was drawn from is read from the action and from the state now, so it is the same after a save is loaded
    // or a checkpoint restored: the dump's Hex, or the truck carrying it, and what it holds now ("used up" when it is gone).
    const sourceOf = (action: GameAction): string | null => action.kind === 'PAY_FUEL' || action.kind === 'CHECK_SUPPLY' ? action.sourcePieceId : null;
    const where = (sourceId: string | null): string => {
      const source = sourceId ? pieces.find(({ id }) => id === sourceId) : undefined;
      if (!source) return 'a dump';
      const container = source.location.kind === 'CONTAINER' ? pieces.find(({ id }) => id === (source.location as { containerId: string }).containerId) : undefined;
      const hexId = source.location.kind === 'ON_MAP' ? source.location.hexId : container?.location.kind === 'ON_MAP' ? container.location.hexId : null;
      const what = `the ${container ? 'truck load' : 'dump'}${hexId ? ` at ${printedHexLabel(hexId)}` : ''}`;
      const left = source.location.kind !== 'ELIMINATED' && (source.resourceQuantity ?? 0) > 0 ? `${source.resourceQuantity}T there now` : 'used up';
      return `${what} (${left})`;
    };
    const method = { SINGLE_UNIT: 'this unit', FORMATION: 'its whole formation', HQ: 'the HQ and its range' } as const;
    const playerId = this.#bindings.find((binding) => binding.seatId === seatId)?.playerId;
    for (const record of records) {
      for (const event of record.events) {
        const revision = record.revisionAfter;
        // Combat and barrage supply is consumed when the dice are rolled, which may be on the other player's action, so it is read
        // by whose dump it was, not by who acted; the other side's dumps are never shown.
        if (event.kind === 'RESOURCE_CONSUMED') {
          const source = pieces.find(({ id }) => id === event.reservation.resourcePieceId);
          if (source && source.ownerId === playerId) {
            lines.push({ revision, spent: event.reservation.quantity, text: `Combat or barrage supply ${event.reservation.quantity}T from ${where(String(source.id))}.` });
          }
          continue;
        }
        if (record.seatId !== seatId) continue;
        if (event.kind === 'FUEL_PAID') {
          const unit = pieces.find(({ id }) => id === event.pieceId);
          lines.push({ revision, spent: event.tokens, text: `Fuel ${event.tokens}T for ${unit ? unitLabel(this.#scenario, unit) : 'a unit'} (${method[event.method]}) from ${where(sourceOf(record.action))}.` });
        } else if (event.kind === 'SUPPLY_SPENT') {
          lines.push({ revision, spent: event.quantity, text: `${event.quantity}T drawn from ${where(sourceOf(record.action))}.` });
        } else if (event.kind === 'SUPPLY_TRANSFERRED') {
          lines.push({ revision, spent: 0, text: `${event.loaded ? 'Loaded' : 'Unloaded'} ${event.tokens}T ${event.loaded ? 'onto' : 'from'} a truck.` });
        } else if (event.kind === 'DUMP_BLOWN') {
          lines.push({ revision, spent: 0, text: `Blew a dump: ${event.destroyed}T destroyed.` });
        }
      }
    }
    return lines;
  }

  /**
   * Request and action numbers continue after those a loaded game already used: the session refuses a request it has seen
   * as a duplicate, so a page that starts counting from 1 again would have its first actions refused.
   */
  #continueNumbering(): void {
    const trailing = (id: string): number => Number(/(\d+)$/u.exec(id)?.[1] ?? 0);
    for (const record of this.#session.getHistory({ offset: 0, limit: Number.MAX_SAFE_INTEGER, actionKind: null }).records) {
      this.#requestSequence = Math.max(this.#requestSequence, trailing(String(record.requestId)));
      this.#actionSequence = Math.max(this.#actionSequence, trailing(String(record.action.actionId)));
    }
  }

  #clearUndoPoints(): void {
    for (const point of this.#undoPoints) this.#session.removeCheckpoint(point.id);
    this.#undoPoints = [];
  }

  /** The state just before an undoable action, taken only when nothing is pending and no hand-over is under way. */
  #takeUndoPoint(action: GameAction, label: string): CheckpointDescriptor | null {
    const stepKey = this.#stepKey();
    if (!UNDOABLE_ACTIONS.has(action.kind) || stepKey === null || this.#handoffToken !== null || this.#decision() !== null) return null;
    if (this.#session.getMetadata().lifecycle !== 'ACTIVE') return null;
    return this.#session.createCheckpoint(`${UNDO_POINT_PREFIX}${label}`);
  }

  /**
   * After an accepted action: remember it for Undo, or, when it cannot be taken back (not an undoable kind, or it drew
   * from the dice or asks the other player to decide), forget everything before it. Returns text for the player when
   * something that could have been undone no longer can be.
   */
  #recordUndoPoint(taken: CheckpointDescriptor | null, action: GameAction, label: string, result: { readonly randomUsed?: boolean; readonly events: readonly RuleEvent[]; readonly pendingDecision: unknown }): string {
    const irreversible = result.randomUsed === true || result.pendingDecision !== null || result.events.some((event) => IRREVERSIBLE_EVENTS.has(event.kind));
    if (taken && !irreversible) {
      this.#undoPoints.push({ id: taken.id, stepKey: this.#stepKey() ?? '', seatId: this.#activeSeat(), label });
      while (this.#undoPoints.length > UNDO_DEPTH) this.#session.removeCheckpoint(this.#undoPoints.shift()!.id);
      return '';
    }
    const hadSomething = this.#undoPoints.length > 0;
    if (taken) this.#session.removeCheckpoint(taken.id);
    this.#clearUndoPoints();
    return UNDOABLE_ACTIONS.has(action.kind) && hadSomething ? ' This cannot be undone: dice were rolled or the other player must decide.' : '';
  }

  #undoActionAvailable(): { label: string; scope: 'ACTION' } | null {
    const point = this.#undoPoints.at(-1);
    if (!point || point.stepKey !== this.#stepKey() || point.seatId !== this.#activeSeat() || this.#decision() !== null) return null;
    if (!this.#session.listCheckpoints().some(({ id }) => id === point.id)) return null;
    return { label: point.label, scope: 'ACTION' };
  }

  #undoStepAvailable(): { label: string; scope: 'STEP' } | null {
    const auto = this.#autoCheckpoint;
    if (!auto || auto.stepKey !== this.#stepKey() || auto.seatId !== this.#activeSeat() || this.#decision() !== null) return null;
    if (!this.#session.listCheckpoints().some(({ id }) => id === auto.id)) return null;
    const since = this.#history().slice(auto.historyLength);
    if (since.length === 0) return null;
    if (since.some((record) => record.seatId !== auto.seatId || record.events.some((event) => IRREVERSIBLE_EVENTS.has(event.kind)))) return null;
    return { label: auto.label.replace(/^Auto: /u, ''), scope: 'STEP' };
  }

  #combatSheet(decision: NonNullable<UiSnapshot['decision']>, playerId: PlayerId): CombatSheet | null {
    if (!decision.transactionId) return null;
    const combat = this.#view(this.#activeSeat()).projection?.combat;
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
        if (!names.has(String(formation))) names.set(String(formation), name);
      }
      return names;
    });
  }

  getSnapshot = (): UiSnapshot => {
    const seatId = this.#activeSeat();
    const view = this.#view(seatId);
    const families = this.#cached('families', () => this.#session.getActionFamilies(seatId));
    const enabled = (kind: GameAction['kind']) => families.some((family) => family.kind === kind && family.enabled);
    const pieces = this.#pieces();
    const selectedPiece = pieces.find(({ id }) => id === this.#selection.pieceId) ?? null;
    const ownSelected = selectedPiece !== null && selectedPiece.ownerId === view.playerId ? selectedPiece : null;
    const segment = view.projection?.sequence.segment;

    const reachable = new Map<string, readonly string[]>();
    const moveRange = new Map<string, MoveRangeEntry>();
    let remainingTicks: number | null = null;
    let moveBlockers: readonly MoveBlocker[] = [];
    // MOVE_PIECE is disabled whenever no unit can move (e.g. every Track unit awaits fuel), yet the player
    // still needs to hear why the selected one cannot: query it in any Movement Segment (6.0).
    const movementSegment = segment === 'MOVEMENT' && ['MOVEMENT', 'REACTION', 'EXPLOITATION'].includes(view.projection?.sequence.phase ?? '');
    if (ownSelected && (enabled('MOVE_PIECE') || movementSegment)) {
      const range = this.#cached(`range|${ownSelected.id}`, () => this.#session.getMovementRange(seatId, ownSelected.id));
      if (!range.allowed) moveBlockers = range.reasons.filter(({ allowed }) => !allowed).map(({ code, message, rule }) => ({ code, message, rule }));
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
    const selectedFuel = ownSelected ? this.#cached(`fuel-coverage|${ownSelected.id}`, () => this.#session.getFuelCoverage(seatId, ownSelected.id)).value ?? null : null;
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
      draft = { ...this.#draft, supply: this.#supplyRows(this.#draft), action, explanation: action ? this.#explain(action) : null };
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
    // Trace Supply overlay: the selected unit's own reach (13.1d, 12.6f), else where any friendly unit would trace.
    const traceUnitId = ownSelected?.location.kind === 'ON_MAP' ? ownSelected.id : null;
    const { traceCoverage, traceDirect } = this.#showTraceCoverage && view.projection !== null
      ? this.#cached(`trace|${traceUnitId}`, () => {
        const coverage = this.#session.getTraceCoverage(seatId, traceUnitId as PieceId | null).value;
        return { traceCoverage: new Set<string>(coverage?.hexIds ?? []), traceDirect: new Set<string>(coverage?.directHexIds ?? []) };
      })
      : { traceCoverage: new Set<string>(), traceDirect: new Set<string>() };
    // The same overlay marks the seat's Supply Sources: map edge, detrainable rail Hexes (13.3c) and Extenders (12.7).
    const supplySources = this.#showTraceCoverage && view.projection !== null
      ? this.#cached('sources', () => this.#session.getSupplySources(seatId).value) ?? []
      : [];
    // ...and who controls each rail Hex (13.3h): only controlled stations carry supply forward.
    const railControl = this.#showTraceCoverage && view.projection !== null
      ? this.#cached('rail-control', () => this.#session.getRailControl(seatId).value) ?? []
      : [];
    const unitActions = ownSelected ? this.#unitActions(ownSelected, enabled) : [];
    const transportOptions = ownSelected?.role === 'TRUCK' && view.metadata.lifecycle === 'ACTIVE' && !view.privacyLocked
      && view.projection?.sequence.phase === 'MOVEMENT' && segment === 'MOVEMENT'
      ? this.#cached(`transport|${ownSelected.id}`, () => this.#session.getTransportOptions(seatId, ownSelected.id).value) : null;
    const stepActions = this.#stepActions(enabled);
    // A unit selected offers its units to entrain, a dump offers its SP; the panel opens only when the player asks for it.
    const railFull = ownSelected?.location.kind === 'ON_MAP' && view.metadata.lifecycle === 'ACTIVE' && !view.privacyLocked && enabled('RAIL_MOVE')
      ? this.#railPanel(ownSelected.location.hexId, ownSelected.role === 'DUMP' ? ownSelected.id : null) : null;
    const rail = railFull && this.#railOpen === ownSelected?.id ? railFull : null;
    const railOffer = railFull && !rail ? (railFull.units.length > 0 ? 'UNITS' as const : 'SUPPLY' as const) : null;
    // 19.0f: a selected unit in a friendly port ships from there; with nothing selected, the Box ships (a sea-landing side).
    const seaOrigin = ownSelected?.location.kind === 'ON_MAP'
      ? (view.projection?.ports?.some(({ hexId, controllerId }) => hexId === (ownSelected.location as { hexId: string }).hexId && controllerId === view.playerId) ? ownSelected.location.hexId : undefined)
      : selectedPiece === null ? null : undefined;
    const sea = seaOrigin !== undefined && view.metadata.lifecycle === 'ACTIVE' && !view.privacyLocked && enabled('SEA_MOVE') ? this.#seaPanel(seaOrigin) : null;
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
    const ledger = view.privacyLocked ? [] : this.#ledger(this.#turnRecords(), seatId, pieces);
    return {
      scenario: this.#scenario,
      view,
      bindings: this.#bindings,
      families,
      selection: { ...this.#selection },
      selectedPiece,
      selectedIsMoving: ownSelected !== null && view.projection?.currentMoverId === ownSelected.id,
      reachable,
      moveRange,
      moveBlockers,
      traceCoverage,
      traceDirect,
      supplySources,
      railControl,
      traceCoverageFor: this.#showTraceCoverage ? traceUnitId : null,
      showTraceCoverage: this.#showTraceCoverage,
      hideUnits: this.#hideUnits,
      hiddenUnitKinds: [...this.#hiddenUnitKinds],
      remainingTicks,
      movePreview,
      selectedFuel,
      attackTargets,
      barrageTargets,
      draft,
      modeOptions,
      releaseAction,
      arrivals,
      placementHexes,
      supplyNeeds,
      unitActions,
      ledger,
      transportOptions,
      stepActions,
      collapseHexes,
      rail,
      railOffer,
      sea,
      endStep: this.#endStep(),
      decision: ownDecision ? { ...ownDecision, options: distinctLabels(ownDecision.options) } : null,
      decisionSeatId: pending?.seatId ?? null,
      decisionHexes,
      history: this.#history(),
      checkpoints: this.#session.listCheckpoints().filter(({ label }) => !label.startsWith(UNDO_POINT_PREFIX)),
      notice: this.#notice,
      busy: this.#busy,
      handoffPending: this.#handoffToken !== null,
      requiredSeatId,
      air: this.#airOverview(enabled, ownSelected),
      groundRebuilds: this.#groundRebuilds(enabled),
      handoff,
      feed: view.privacyLocked ? [] : this.#feed(seatId),
      combatReports: reports,
      resultCard: reports.find(({ transactionId }) => transactionId === resultId) ?? null,
      awayReport: view.privacyLocked ? null : this.#awayReport,
      phaseTrack: sequence && otherBinding ? playerTurnTrack(this.#history(), sequence, sequence.phasingPlayerId === view.playerId ? otherBinding.playerId : view.playerId) : [],
      movedThisPhase,
      attackedThisPhase,
      undoStep: view.privacyLocked ? null : this.#undoActionAvailable() ?? this.#undoStepAvailable(),
      combatSheet: ownDecision ? this.#combatSheet(ownDecision, view.playerId) : null,
      autoPay: ownDecision?.kind === 'SUPPLY_SOURCE' && ownDecision.options.some(({ id }) => id.startsWith('pay:')),
      formationNames: this.#formationNames(view.playerId),
    };
  };

  /** Air missions each of the player's ready aircraft could fly now: mission → hex → targets → aircraft. */
  #airOptions(): ReadonlyMap<AirMissionKind, ReadonlyMap<string, ReadonlyMap<string, readonly PieceId[]>>> {
    return this.#cached('air-options', () => {
      const options = new Map<AirMissionKind, Map<string, Map<string, PieceId[]>>>();
      const view = this.#view(this.#activeSeat());
      // Aircraft at their bases on the map, and at an off-map airfield (its box); the rules say which can fly now.
      const own = this.#pieces().filter((piece) => piece.ownerId === view.playerId && (piece.location.kind === 'ON_MAP' || piece.location.kind === 'OFF_MAP_BOX')
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

  /** Air Transport and Air Drop: the cargo is part of the order, so the draft carries Transports, routes, units and Tokens. */
  #transportDraftView(input: AirDraftInput): AirDraft {
    const view = this.#view(this.#activeSeat());
    const bases = view.projection?.air.transport ?? [];
    const target = input.targetHexId as HexId | null;
    const drop = input.mission === 'AIR_DROP';
    const name = (definitionId: string) => this.#definition({ definitionId: definitionId as never })?.name ?? 'Aircraft';
    const reach = (hexId: string, range: number) => target === null ? [] : routesForRange(range, distanceBetween(hexId as HexId, target), input.mission);
    const plannedHere = (hexId: string, unitIds: readonly PieceId[]) => (view.projection?.air.dropPlans ?? []).some((plan) => plan.hexId === input.targetHexId
      && plan.turn === view.projection?.sequence.gameTurn && plan.unitIds.some((id) => unitIds.includes(id)));
    // The bases that could fly it, the one holding the planned units or the cargo first.
    const baseHexIds = bases.filter((entry) => entry.transports.some((plane) => reach(entry.hexId, plane.range).length > 0))
      .map((entry) => ({ hexId: entry.hexId, rank: drop && plannedHere(entry.hexId, entry.units.map(({ id }) => id)) ? 0 : entry.units.length > 0 || entry.dumps.length > 0 ? 1 : 2 }))
      .sort((left, right) => left.rank - right.rank).map(({ hexId }) => hexId);
    const baseHexId = input.baseHexId && baseHexIds.includes(input.baseHexId) ? input.baseHexId : baseHexIds[0] ?? null;
    const base = bases.find((entry) => entry.hexId === baseHexId);
    const usable = (base?.transports ?? []).filter((plane) => reach(base!.hexId, plane.range).length > 0);
    const carrierIds = (input.carrierIds ?? usable.slice(0, 4).map(({ id }) => id)).filter((id) => usable.some((plane) => plane.id === id));
    const carriers: TransportCarrier[] = usable.map((plane) => {
      const allowed = reach(base!.hexId, plane.range);
      const chosen = input.routes?.[plane.id];
      return {
        id: plane.id, label: name(plane.definitionId), capacity: plane.capacity, allowed,
        route: chosen && allowed.includes(chosen) ? chosen : allowed[0] ?? null, selected: carrierIds.includes(plane.id), integralGlider: plane.integralGlider,
      };
    });
    const flying = new Set(bases.flatMap(({ transports }) => transports.map(({ id }) => String(id))));
    const escortIds = input.escortIds ?? [];
    const escorts = this.#pieces().filter((piece) => piece.ownerId === view.playerId && piece.role === 'AIRCRAFT' && piece.location.kind === 'ON_MAP'
      && !piece.statuses.includes('status:air-inactive') && !flying.has(String(piece.id)))
      .map((piece) => ({ id: piece.id, label: `${this.#definition(piece)?.name ?? 'Aircraft'} at ${printedHexLabel(piece.location.kind === 'ON_MAP' ? piece.location.hexId : '')}`, selected: escortIds.includes(piece.id) }));
    const plans = view.projection?.air.dropPlans ?? [];
    const units = (base?.units ?? []).map((entry) => {
      const planned = plans.some((plan) => plan.unitIds.includes(entry.id) && plan.hexId === input.targetHexId && plan.turn === view.projection?.sequence.gameTurn);
      return { id: entry.id, label: name(entry.definitionId), cost: entry.cost, planned };
    });
    const selectedUnitIds = (input.unitIds ?? (drop ? units.filter(({ planned }) => planned).map(({ id }) => id) : [])).filter((id) => units.some((unit) => unit.id === id));
    const tokensAvailable = (base?.dumps ?? []).reduce((total, dump) => total + dump.tokens, 0);
    const capacityHT = carriers.filter(({ selected }) => selected).reduce((total, plane) => total + plane.capacity * (plane.route?.startsWith('HALF') ? 2 : 1), 0);
    const usedHT = units.filter(({ id }) => selectedUnitIds.includes(id)).reduce((total, unit) => total + unit.cost, 0);
    const tokens = Math.max(0, Math.min(tokensAvailable, input.tokens ?? Math.floor((capacityHT - usedHT) / 2)));
    const supply: { sourcePieceId: PieceId; tokens: number }[] = [];
    let remaining = tokens;
    for (const dump of [...(base?.dumps ?? [])]) {
      if (remaining <= 0) break;
      const take = Math.min(remaining, dump.tokens);
      supply.push({ sourcePieceId: dump.id, tokens: take });
      remaining -= take;
    }
    const aircraftIds = [...carrierIds, ...escortIds];
    let action: GameAction | null = null;
    if (input.targetHexId && base && aircraftIds.length > 0 && (selectedUnitIds.length > 0 || tokens > 0)) {
      action = {
        actionId: this.#actionId('air'), actorId: view.playerId, expectedRevision: this.#session.getRevision(),
        kind: 'DECLARE_AIR_MISSION', mission: input.mission, aircraftIds, targetHexId: input.targetHexId as never, target: null,
        cargo: {
          baseHexId: base.hexId as never, unitIds: selectedUnitIds, supply,
          routes: carriers.filter(({ selected, route }) => selected && route !== null).map(({ id, route }) => ({ pieceId: id, route: route! })),
        },
      };
    }
    return {
      mission: input.mission, label: AIR_MISSION_LABELS[input.mission], targetHexId: input.targetHexId, target: null, targetOptions: [],
      eligibleIds: [], selectedIds: [], maximum: 4,
      transport: {
        drop, baseHexId, baseHexIds, carriers, escorts, units: units.map((unit) => ({ ...unit, selected: selectedUnitIds.includes(unit.id) })),
        tokensAvailable, tokens,
      },
      action, explanation: action ? this.#explain(action) : null,
    };
  }

  #airDraftView(): AirDraft | null {
    const input = this.#airDraft;
    if (!input) return null;
    if (input.mission === 'AIR_TRANSPORT' || input.mission === 'AIR_DROP') return this.#transportDraftView(input);
    const byHex = this.#airOptions().get(input.mission);
    const byTarget = input.targetHexId ? byHex?.get(input.targetHexId) : undefined;
    const targetOptions = [...(byTarget?.keys() ?? [])].filter((key): key is 'COMBAT_UNITS' | 'AIR_BASE' | 'PORT' => key !== 'HEX');
    const eligible = byTarget?.get(input.target ?? 'HEX') ?? [];
    const maximum = input.mission === 'BARRAGE' || input.mission === 'TRAINBUSTING' || input.mission === 'BASE_TRANSFER' ? 4 : 1;
    const selected = input.selectedIds.filter((id) => eligible.includes(id));
    let action: GameAction | null = null;
    if (input.targetHexId && selected.length > 0) {
      const view = this.#view(this.#activeSeat());
      action = {
        actionId: this.#actionId('air'), actorId: view.playerId, expectedRevision: this.#session.getRevision(),
        kind: 'DECLARE_AIR_MISSION', mission: input.mission, aircraftIds: selected, targetHexId: input.targetHexId as never, target: input.target,
      };
    }
    return {
      mission: input.mission, label: AIR_MISSION_LABELS[input.mission], targetHexId: input.targetHexId, target: input.target,
      targetOptions, eligibleIds: eligible, selectedIds: selected, maximum, transport: null,
      action, explanation: action ? this.#explain(action) : null,
    };
  }

  /** Level of the Air Base or Strip in a hex now: 0 for a strip, null when there is none. */
  #facilityLevelAt(hexId: string): number | null {
    for (const piece of this.#pieces()) {
      if (piece.location.kind !== 'ON_MAP' || piece.location.hexId !== hexId) continue;
      const facility = this.#definition(piece)?.facility?.facilityTypeDefinitionId;
      if (facility === 'facility:air-strip') return 0;
      if (facility === 'facility:air-base') {
        const level = piece.statusValues.find(({ statusDefinitionId }) => statusDefinitionId === 'status:air-base-level')?.value;
        return typeof level === 'number' ? level : 1;
      }
    }
    return null;
  }

  #buildLabel(facility: 'AIR_STRIP' | 'AIR_BASE', hexId: string): string {
    const level = this.#facilityLevelAt(hexId);
    if (facility === 'AIR_STRIP') return 'Build an Air Strip';
    if (level === null) return 'Build a Level 1 Air Base';
    return level === 0 ? 'Upgrade the Air Strip to a Level 1 Air Base' : `Improve the Air Base to Level ${level + 1}`;
  }

  #rebuilds(enabled: (kind: GameAction['kind']) => boolean): readonly AirRebuild[] {
    const projected = this.#view(this.#activeSeat()).projection?.air.rebuilds ?? [];
    if (!enabled('REBUILD_AIRCRAFT')) return [];
    const view = this.#view(this.#activeSeat());
    return projected.map((option): AirRebuild => {
      const choice = this.#rebuildSelection.get(option.eqPieceId);
      // Default: as many aircraft as the Eq pay for (two steps each), reduced ones here first.
      let budget = option.equipment * 2;
      const defaults: PieceId[] = [];
      for (const plane of option.aircraft) if (plane.steps <= budget) { defaults.push(plane.id); budget -= plane.steps; }
      const selectedIds = (choice?.aircraftIds ?? defaults).filter((id) => option.aircraft.some((plane) => plane.id === id));
      const arriving = selectedIds.some((id) => option.aircraft.find((plane) => plane.id === id)?.deadPile);
      const baseId = arriving ? (choice?.baseId && option.baseIds.includes(choice.baseId) ? choice.baseId : option.baseIds[0] ?? null) : null;
      const steps = selectedIds.reduce((total, id) => total + (option.aircraft.find((plane) => plane.id === id)?.steps ?? 0), 0);
      const action: GameAction | null = selectedIds.length > 0 ? {
        actionId: this.#actionId('rebuild'), actorId: view.playerId, expectedRevision: this.#session.getRevision(),
        kind: 'REBUILD_AIRCRAFT', eqPieceId: option.eqPieceId, hqId: option.hqId, aircraftIds: selectedIds, baseId,
      } : null;
      return {
        eqPieceId: option.eqPieceId, hexId: option.hexId, equipment: option.equipment,
        aircraft: option.aircraft.map((plane) => ({
          id: plane.id, label: this.#definition({ definitionId: plane.definitionId })?.name ?? 'Aircraft', steps: plane.steps, deadPile: plane.deadPile,
          selected: selectedIds.includes(plane.id),
        })),
        bases: option.baseIds.map((id) => {
          const base = this.#pieces().find((piece) => piece.id === id);
          return { id, hexId: base?.location.kind === 'ON_MAP' ? base.location.hexId : '', selected: id === baseId };
        }),
        action, explanation: action ? this.#explain(action) : null, cost: Math.ceil(steps / 2),
      };
    });
  }

  toggleRebuildAircraft = (eqPieceId: string, pieceId: string): void => {
    const rebuild = this.getSnapshot().air.rebuilds.find((entry) => entry.eqPieceId === eqPieceId);
    if (!rebuild) return;
    const selected = rebuild.aircraft.filter((plane) => plane.selected).map(({ id }) => id);
    const next = selected.includes(pieceId as PieceId) ? selected.filter((id) => id !== pieceId) : [...selected, pieceId as PieceId];
    this.#rebuildSelection.set(eqPieceId, { aircraftIds: next, baseId: this.#rebuildSelection.get(eqPieceId)?.baseId ?? null });
    this.#emit();
  };

  setRebuildBase = (eqPieceId: string, baseId: string): void => {
    const current = this.#rebuildSelection.get(eqPieceId);
    this.#rebuildSelection.set(eqPieceId, { aircraftIds: current?.aircraftIds ?? null, baseId: baseId as PieceId });
    this.#emit();
  };

  rebuildAircraft = async (eqPieceId: string): Promise<void> => {
    const rebuild = this.getSnapshot().air.rebuilds.find((entry) => entry.eqPieceId === eqPieceId);
    if (!rebuild?.action || !rebuild.explanation?.allowed) return;
    this.#rebuildSelection.delete(eqPieceId);
    await this.#dispatch({ ...rebuild.action, actionId: this.#actionId('rebuild'), expectedRevision: this.#session.getRevision() } as GameAction,
      `Rebuilt ${rebuild.action.kind === 'REBUILD_AIRCRAFT' ? rebuild.action.aircraftIds.length : 0} aircraft with ${rebuild.cost} Eq.`);
  };

  #groundRebuilds(enabled: (kind: GameAction['kind']) => boolean): readonly GroundRebuild[] {
    if (!enabled('REBUILD_UNITS')) return [];
    const view = this.#view(this.#activeSeat());
    return (view.projection?.replacements.rebuilds ?? []).map((option): GroundRebuild => {
      const choice = this.#unitRebuildSelection.get(option.hexId);
      // Default: reduced units here first, then the Dead Pile, as many steps as the Repls pay for; trucks with the Eq left.
      const left = { PAX: option.pax, EQ: option.eq };
      const defaults: UnitRebuild[] = [];
      for (const unit of option.units) {
        const steps = Math.min(unit.missing, left[unit.cost]);
        if (steps <= 0) continue;
        left[unit.cost] -= steps;
        defaults.push({ pieceId: unit.id, steps, mode: unit.deadPile ? defaultPlacementMode(unit.modes as readonly OcsMode[]) : null });
      }
      const chosen = (choice?.units ?? defaults).filter(({ pieceId }) => option.units.some(({ id }) => id === pieceId));
      const truckPoints = Math.max(0, Math.min(option.truckPoints, choice?.truckPoints ?? left.EQ));
      const cost = { pax: 0, eq: truckPoints };
      for (const entry of chosen) {
        if (option.units.find(({ id }) => id === entry.pieceId)?.cost === 'PAX') cost.pax += entry.steps; else cost.eq += entry.steps;
      }
      const action: GameAction | null = chosen.length > 0 || truckPoints > 0 ? {
        actionId: this.#actionId('rebuild-units'), actorId: view.playerId, expectedRevision: this.#session.getRevision(),
        kind: 'REBUILD_UNITS', hexId: option.hexId as HexId, hqId: option.hqId, units: chosen, truckPoints,
      } : null;
      return {
        hexId: option.hexId, pax: option.pax, eq: option.eq, truckMax: option.truckPoints, truckPoints, cost,
        units: option.units.map((unit) => {
          const entry = chosen.find(({ pieceId }) => pieceId === unit.id);
          const modes = unit.modes as readonly OcsMode[];
          return {
            id: unit.id, label: this.#rebuildUnitLabel(unit.id, unit.definitionId), cost: unit.cost, missing: unit.missing, deadPile: unit.deadPile,
            selected: entry !== undefined, steps: entry?.steps ?? unit.missing, mode: unit.deadPile ? entry?.mode ?? defaultPlacementMode(modes) : null, modes,
          };
        }),
        action, explanation: action ? this.#explain(action) : null,
      };
    });
  }

  /** A Dead Pile unit is not among the projected stacks, so its name may come from its Definition. */
  #rebuildUnitLabel(pieceId: PieceId, definitionId: string): string {
    const piece = this.#pieces().find(({ id }) => id === pieceId);
    return piece ? unitLabel(this.#scenario, piece) : this.#definition({ definitionId: definitionId as never })?.name ?? 'Unit';
  }

  #updateUnitRebuild(hexId: string, change: (units: readonly UnitRebuild[], rebuild: GroundRebuild) => readonly UnitRebuild[]): void {
    const rebuild = this.getSnapshot().groundRebuilds.find((entry) => entry.hexId === hexId);
    if (!rebuild) return;
    const current = rebuild.units.filter(({ selected }) => selected).map(({ id, steps, mode }) => ({ pieceId: id, steps, mode }));
    this.#unitRebuildSelection.set(hexId, { units: change(current, rebuild), truckPoints: rebuild.truckPoints });
    this.#emit();
  }

  toggleRebuildUnit = (hexId: string, pieceId: string): void => this.#updateUnitRebuild(hexId, (units, rebuild) => {
    if (units.some((entry) => entry.pieceId === pieceId)) return units.filter((entry) => entry.pieceId !== pieceId);
    const unit = rebuild.units.find(({ id }) => id === pieceId);
    return unit ? [...units, { pieceId: unit.id, steps: unit.missing, mode: unit.deadPile ? unit.mode : null }] : units;
  });

  setRebuildUnitSteps = (hexId: string, pieceId: string, steps: number): void => this.#updateUnitRebuild(hexId, (units) =>
    units.map((entry) => entry.pieceId === pieceId && Number.isSafeInteger(steps) ? { ...entry, steps } : entry));

  setRebuildUnitMode = (hexId: string, pieceId: string, mode: string): void => this.#updateUnitRebuild(hexId, (units) =>
    units.map((entry) => entry.pieceId === pieceId && entry.mode !== null ? { ...entry, mode: mode as OcsMode } : entry));

  setRebuildTrucks = (hexId: string, points: number): void => {
    const rebuild = this.getSnapshot().groundRebuilds.find((entry) => entry.hexId === hexId);
    if (!rebuild || !Number.isSafeInteger(points)) return;
    const units = rebuild.units.filter(({ selected }) => selected).map(({ id, steps, mode }) => ({ pieceId: id, steps, mode }));
    this.#unitRebuildSelection.set(hexId, { units, truckPoints: Math.max(0, points) });
    this.#emit();
  };

  rebuildUnits = async (hexId: string): Promise<void> => {
    const rebuild = this.getSnapshot().groundRebuilds.find((entry) => entry.hexId === hexId);
    if (!rebuild?.action || !rebuild.explanation?.allowed || rebuild.action.kind !== 'REBUILD_UNITS') return;
    this.#unitRebuildSelection.delete(hexId);
    const { units, truckPoints } = rebuild.action;
    const parts = [units.length > 0 ? `${units.length} unit${units.length === 1 ? '' : 's'}` : '', truckPoints > 0 ? `${truckPoints} truck point${truckPoints === 1 ? '' : 's'}` : ''].filter(Boolean);
    const spent = [rebuild.cost.pax > 0 ? `${rebuild.cost.pax} Pax` : '', rebuild.cost.eq > 0 ? `${rebuild.cost.eq} Eq` : ''].filter(Boolean);
    await this.#dispatch({ ...rebuild.action, actionId: this.#actionId('rebuild-units'), expectedRevision: this.#session.getRevision() } as GameAction,
      `Rebuilt ${parts.join(' and ')} with ${spent.join(' and ')}.`);
  };

  /** The player's Drop Plans and the one being made (14.10b), for the Aircraft Refit Phase. */
  #dropPlanning(enabled: (kind: GameAction['kind']) => boolean): { readonly dropPlans: readonly DropPlanView[]; readonly dropDraft: DropPlanDraft | null; readonly dropPlanning: boolean } {
    const view = this.#view(this.#activeSeat());
    const projection = view.projection;
    const turn = projection?.sequence.gameTurn ?? 0;
    const label = (pieceId: string) => { const piece = this.#pieces().find(({ id }) => id === pieceId); return piece ? unitLabel(this.#scenario, piece) : 'Unit'; };
    const dropPlans = (projection?.air.dropPlans ?? []).map((plan): DropPlanView => ({
      id: plan.id, units: plan.unitIds.map((id) => ({ id, label: label(id) })), hexId: plan.hexId, turn: plan.turn, dueNow: plan.turn === turn,
    }));
    const hasTransports = this.#pieces().some((piece) => piece.ownerId === view.playerId && piece.role === 'AIRCRAFT' && piece.location.kind === 'ON_MAP'
      && this.#definition(piece)?.faces[0]?.steps.some((step) => step.ratings.some(({ ratingDefinitionId }) => ratingDefinitionId === 'rating:transport-capacity')));
    const inRefit = projection?.sequence.phase === 'AIRCRAFT_REFIT' && projection.sequence.actingPlayerId === view.playerId;
    const dropPlanning = inRefit === true && (hasTransports || dropPlans.length > 0);
    const input = dropPlanning ? this.#dropDraft : null;
    if (!input) return { dropPlans, dropDraft: null, dropPlanning };
    const planned = new Set(dropPlans.flatMap((plan) => plan.units.map(({ id }) => String(id))));
    const earliest = projection?.air.earliestDropTurn ?? turn;
    const chosenTurn = input.turn ?? earliest;
    const candidates = this.#pieces().filter((piece) => piece.ownerId === view.playerId && piece.location.kind === 'ON_MAP' && !planned.has(String(piece.id))
      && (piece.role === 'COMBAT' || piece.role === 'HQ' || piece.role === 'ARTILLERY'))
      .flatMap((piece) => {
        const definition = this.#definition(piece);
        const para = definition?.counter?.symbol === 'AIRBORNE';
        const leg = definition?.faces.find(({ id }) => id === 'move')?.mobilityClassDefinitionId === 'mobility:leg';
        return para || leg ? [{ id: piece.id, label: `${unitLabel(this.#scenario, piece)} at ${printedHexLabel(piece.location.kind === 'ON_MAP' ? piece.location.hexId : '')}`, para: para === true, selected: input.unitIds.includes(piece.id) }] : [];
      }).sort((left, right) => Number(right.para) - Number(left.para) || String(left.label).localeCompare(String(right.label)));
    const selected = candidates.filter(({ selected: on }) => on).map(({ id }) => id);
    const action: GameAction | null = selected.length > 0 && input.hexId ? {
      actionId: this.#actionId('plan-drop'), actorId: view.playerId, expectedRevision: this.#session.getRevision(),
      kind: 'PLAN_AIR_DROP', unitIds: selected, hexId: input.hexId as never, turn: chosenTurn,
    } : null;
    void enabled;
    return {
      dropPlans, dropPlanning,
      dropDraft: { candidates, hexId: input.hexId, turn: chosenTurn, earliestTurn: earliest, action, explanation: action ? this.#explain(action) : null },
    };
  }

  startDropPlan = (): void => {
    this.#resetIntent();
    this.#dropDraft = { unitIds: [], hexId: null, turn: null };
    this.#notice = 'Drop Plan: tick the units, then click the hex where they will drop.';
    this.#emit();
  };

  toggleDropUnit = (pieceId: string): void => {
    if (!this.#dropDraft) return;
    const current = this.#dropDraft.unitIds;
    this.#dropDraft = { ...this.#dropDraft, unitIds: current.includes(pieceId as PieceId) ? current.filter((id) => id !== pieceId) : [...current, pieceId as PieceId] };
    this.#emit();
  };

  setDropTurn = (turn: number): void => {
    if (!this.#dropDraft || !Number.isFinite(turn)) return;
    this.#dropDraft = { ...this.#dropDraft, turn: Math.floor(turn) };
    this.#emit();
  };

  cancelDropPlan = (): void => { this.#dropDraft = null; this.#emit(); };

  confirmDropPlan = async (): Promise<void> => {
    const draft = this.getSnapshot().air.dropDraft;
    if (!draft?.action || !draft.explanation?.allowed) return;
    this.#dropDraft = null;
    await this.#dispatch({ ...draft.action, actionId: this.#actionId('plan-drop'), expectedRevision: this.#session.getRevision() } as GameAction,
      `Drop planned at ${printedHexLabel(draft.hexId ?? '')} for turn ${draft.turn}.`);
  };

  changeDropPlan = async (planId: string, change: 'DELAY' | 'CANCEL'): Promise<void> => {
    const plan = this.getSnapshot().air.dropPlans.find(({ id }) => id === planId);
    if (!plan) return;
    await this.#dispatch({
      kind: 'UPDATE_AIR_DROP_PLAN', planId, unitIds: plan.units.map(({ id }) => id), change,
      actionId: this.#actionId('drop-plan'), actorId: this.#view(this.#activeSeat()).playerId, expectedRevision: this.#session.getRevision(),
    } as GameAction, change === 'DELAY' ? `Drop at ${printedHexLabel(plan.hexId)} delayed to turn ${plan.turn + 1}.` : `Drop at ${printedHexLabel(plan.hexId)} cancelled.`);
  };

  #constructionOverview(enabled: (kind: GameAction['kind']) => boolean, selected: ProjectedPiece | null): ConstructionOverview | null {
    if (!selected || !(enabled('BUILD_AIR_BASE') || enabled('BUILD_HEDGEHOG')) || this.#decision()) return null;
    type Build = Extract<GameAction, { readonly kind: 'BUILD_AIR_BASE' | 'BUILD_HEDGEHOG' }>;
    const byHex = new Map<string, Build[]>();
    const kinds = (['BUILD_AIR_BASE', 'BUILD_HEDGEHOG'] as const).filter((kind) => enabled(kind));
    for (const action of kinds.flatMap((kind) => this.#candidates(kind, selected.id, 5000))) {
      // 13.8d: only the work this unit does as an engineer; a crew digging in its own hex is a unit action.
      if ((action.kind === 'BUILD_AIR_BASE' || action.kind === 'BUILD_HEDGEHOG') && action.engineerId === selected.id) byHex.set(action.hexId, [...(byHex.get(action.hexId) ?? []), action]);
    }
    if (byHex.size === 0) return null;
    const all = [...byHex.values()].flat();
    const facilities = [...(all.some(({ kind }) => kind === 'BUILD_AIR_BASE') ? ['AIR' as const] : []), ...(all.some(({ kind }) => kind === 'BUILD_HEDGEHOG') ? ['HEDGEHOG' as const] : [])];
    const draft = this.#buildDraft && this.#buildDraft.engineerId === selected.id ? this.#buildDraft : null;
    const hexId = draft?.hexId && byHex.has(draft.hexId) ? draft.hexId : null;
    const options = hexId === null ? [] : (byHex.get(hexId) ?? []).map((action): BuildOption => {
      const facility = action.kind === 'BUILD_HEDGEHOG' ? 'HEDGEHOG' as const : action.facility;
      return {
        facility,
        label: facility === 'HEDGEHOG' ? this.#hedgehogLabel(hexId) : this.#buildLabel(facility, hexId),
        cost: action.payments.reduce((total, { tokens }) => total + tokens, 0),
        action, explanation: this.#explain(action),
      };
    });
    return { engineerId: selected.id, facilities, hexes: [...byHex.keys()].sort(), planning: draft !== null, hexId, options };
  }

  /** "Build a Level 1 hedgehog" or "Improve the hedgehog to Level N" (16.0b). */
  #hedgehogLabel(hexId: string): string {
    const level = this.#hedgehogLevelAt(hexId);
    return level === null ? 'Build a Level 1 hedgehog' : `Improve the hedgehog to Level ${level + 1}`;
  }

  #hedgehogLevelAt(hexId: string): number | null {
    const hog = this.#pieces().find((piece) => piece.role === 'HEDGEHOG' && piece.location.kind === 'ON_MAP' && piece.location.hexId === hexId);
    if (!hog) return null;
    const level = hog.statusValues.find(({ statusDefinitionId }) => statusDefinitionId === 'status:hedgehog-level')?.value;
    return typeof level === 'number' ? level : 1;
  }

  planConstruction = (): void => {
    const selected = this.getSnapshot().selectedPiece;
    if (!selected || !this.getSnapshot().air.construction) return;
    const id = selected.id;
    this.#resetIntent();
    this.#buildDraft = { engineerId: id, hexId: null };
    this.#notice = 'Construction: click a highlighted hex to choose where to build.';
    this.#emit();
  };

  cancelConstruction = (): void => { this.#buildDraft = null; this.#emit(); };

  buildAirBase = async (facility: 'AIR_STRIP' | 'AIR_BASE' | 'HEDGEHOG'): Promise<void> => {
    const option = this.getSnapshot().air.construction?.options.find((entry) => entry.facility === facility);
    if (!option?.explanation.allowed) return;
    const hexId = this.getSnapshot().air.construction!.hexId!;
    this.#buildDraft = null;
    await this.#dispatch({ ...option.action, actionId: this.#actionId('build'), expectedRevision: this.#session.getRevision() } as GameAction,
      `${option.label} at ${printedHexLabel(hexId)} (${option.cost}T).`);
  };

  #airOverview(enabled: (kind: GameAction['kind']) => boolean, selected: ProjectedPiece | null): AirOverview {
    const view = this.#view(this.#activeSeat());
    const projection = view.projection;
    const segment = projection?.sequence.segment;
    const missionsEnabled = enabled('DECLARE_AIR_MISSION') && !this.#decision();
    const options = missionsEnabled ? this.#airOptions() : new Map();
    const missions = missionsEnabled
      ? AIR_MISSION_KINDS.filter((mission) => missionSegment(mission) === segment)
        .map((mission) => ({ mission, label: AIR_MISSION_LABELS[mission], available: (options.get(mission)?.size ?? 0) > 0 }))
        // Hip Shoots and the Transport missions are shown only when they can be flown now.
        .filter(({ mission, available }) => available || !['HIP_SHOOT', 'AIR_TRANSPORT', 'AIR_DROP'].includes(mission))
      : [];
    const draft = missionsEnabled ? this.#airDraftView() : null;
    const refits: AirRefit[] = [];
    if (enabled('REFIT_AIRCRAFT')) {
      for (const candidate of this.#candidates('REFIT_AIRCRAFT', null, 50)) {
        if (candidate.kind !== 'REFIT_AIRCRAFT' || refits.some(({ baseId }) => baseId === candidate.baseId)) continue;
        const base = this.#pieces().find(({ id }) => id === candidate.baseId);
        if (!base || (base.location.kind !== 'ON_MAP' && base.location.kind !== 'OFF_MAP_BOX')) continue;
        const hexId = base.location.kind === 'ON_MAP' ? base.location.hexId : '';
        const inactive = this.#pieces().filter((piece) => piece.ownerId === view.playerId && sameLocation(piece.location, base.location)
          && piece.statuses.includes('status:air-inactive')).map(({ id }) => id);
        const sources = this.#candidates('REFIT_AIRCRAFT', null, 50).flatMap((action) => action.kind === 'REFIT_AIRCRAFT' && action.baseId === candidate.baseId ? [action.sourcePieceId] : []);
        const selected = (this.#refitSelection.get(candidate.baseId) ?? candidate.aircraftIds).filter((id) => inactive.includes(id));
        const action: GameAction | null = selected.length > 0 ? { ...candidate, actionId: this.#actionId('refit'), aircraftIds: selected } : null;
        const facts = projection?.air.bases.find(({ id }) => id === candidate.baseId);
        refits.push({
          baseId: candidate.baseId, hexId, capacity: facts?.refitCapacity ?? 2,
          inactiveIds: inactive, selectedIds: selected, sourceIds: sources, action, explanation: action ? this.#explain(action) : null,
          level: facts?.level ?? 1, active: facts?.active ?? 0, activeLimit: facts?.activeLimit ?? 0, zocBlocked: facts?.refitBlockedByZoc ?? false,
          offMap: facts?.offMap ?? false,
        });
      }
    }
    // A base with Inactive aircraft that cannot refit (an enemy ZOC, or no supply in reach) is still listed, with why (15.1C).
    if (projection?.sequence.phase === 'AIRCRAFT_REFIT' && projection.sequence.actingPlayerId === view.playerId) {
      for (const facts of projection.air.bases) {
        if (facts.inactive === 0 || refits.some(({ baseId }) => baseId === facts.id)) continue;
        const field = this.#pieces().find(({ id }) => id === facts.id);
        const inactive = this.#pieces().filter((piece) => piece.ownerId === view.playerId && piece.statuses.includes('status:air-inactive')
          && (facts.offMap ? field !== undefined && sameLocation(piece.location, field.location) : piece.location.kind === 'ON_MAP' && piece.location.hexId === facts.hexId)).map(({ id }) => id);
        refits.push({
          baseId: facts.id, hexId: facts.hexId, capacity: facts.refitCapacity, inactiveIds: inactive, selectedIds: [], sourceIds: [], action: null, explanation: null,
          level: facts.level, active: facts.active, activeLimit: facts.activeLimit, zocBlocked: facts.refitBlockedByZoc, offMap: facts.offMap,
        });
      }
    }
    const zones = projection?.air.patrolZones ?? [];
    const construction = this.#constructionOverview(enabled, selected);
    return {
      ...this.#dropPlanning(enabled),
      rebuilds: this.#rebuilds(enabled),
      missions, draft,
      targetHexes: draft ? [...(options.get(draft.mission)?.keys() ?? [])] : [],
      refits,
      construction,
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
    const target = byTarget.has('COMBAT_UNITS') ? 'COMBAT_UNITS' as const : byTarget.has('AIR_BASE') ? 'AIR_BASE' as const : byTarget.has('PORT') ? 'PORT' as const : null;
    const eligible = byTarget.get(target ?? 'HEX') ?? [];
    const maximum = draft.mission === 'BARRAGE' || draft.mission === 'TRAINBUSTING' || draft.mission === 'BASE_TRANSFER' ? 4 : 1;
    this.#airDraft = draft.mission === 'AIR_TRANSPORT' || draft.mission === 'AIR_DROP'
      ? { mission: draft.mission, targetHexId: hexId, target: null, selectedIds: [] }
      : { ...draft, targetHexId: hexId, target, selectedIds: eligible.slice(0, maximum) };
    this.#notice = `${AIR_MISSION_LABELS[draft.mission]} on ${printedHexLabel(hexId)}: choose the aircraft, check the Flak and table, then fly.`;
    this.#selection = { ...this.#selection, hexId };
  }

  #patchTransport(patch: Partial<AirDraftInput>): void {
    if (!this.#airDraft) return;
    this.#airDraft = { ...this.#airDraft, ...patch };
    this.#emit();
  }

  toggleTransportCarrier = (pieceId: string): void => {
    const transport = this.#airDraftView()?.transport;
    if (!transport) return;
    const selected = transport.carriers.filter(({ selected: on }) => on).map(({ id }) => id);
    this.#patchTransport({ carrierIds: selected.includes(pieceId as PieceId) ? selected.filter((id) => id !== pieceId) : [...selected, pieceId as PieceId].slice(0, 4), tokens: null });
  };

  setTransportRoute = (pieceId: string, route: string): void => {
    this.#patchTransport({ routes: { ...(this.#airDraft?.routes ?? {}), [pieceId]: route as AirRoute }, tokens: null });
  };

  toggleTransportEscort = (pieceId: string): void => {
    const current = this.#airDraft?.escortIds ?? [];
    this.#patchTransport({ escortIds: current.includes(pieceId as PieceId) ? current.filter((id) => id !== pieceId) : [...current, pieceId as PieceId] });
  };

  toggleTransportUnit = (pieceId: string): void => {
    const transport = this.#airDraftView()?.transport;
    if (!transport) return;
    const selected = transport.units.filter(({ selected: on }) => on).map(({ id }) => id);
    this.#patchTransport({ unitIds: selected.includes(pieceId as PieceId) ? selected.filter((id) => id !== pieceId) : [...selected, pieceId as PieceId], tokens: null });
  };

  setTransportTokens = (tokens: number): void => { this.#patchTransport({ tokens: Number.isFinite(tokens) ? Math.max(0, Math.floor(tokens)) : 0 }); };

  setTransportBase = (hexId: string): void => {
    this.#patchTransport({ baseHexId: hexId, carrierIds: null, routes: {}, unitIds: null, tokens: null });
  };

  toggleAirAircraft = (pieceId: string): void => {
    const draft = this.#airDraftView();
    if (!draft || !draft.eligibleIds.includes(pieceId as PieceId)) return;
    const selected = draft.selectedIds.includes(pieceId as PieceId)
      ? draft.selectedIds.filter((id) => id !== pieceId)
      : draft.maximum === 1 ? [pieceId as PieceId] : [...draft.selectedIds, pieceId as PieceId].slice(0, draft.maximum);
    this.#airDraft = { ...this.#airDraft!, selectedIds: selected };
    this.#emit();
  };

  setAirTarget = (target: 'COMBAT_UNITS' | 'AIR_BASE' | 'PORT'): void => {
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
      (refit.offMap ? `Refit ${refit.selectedIds.length} aircraft at the off-map airfield, from its own stocks.` : `Refit ${refit.selectedIds.length} aircraft at ${printedHexLabel(refit.hexId)} (1T).`));
  };

  toggleAirZones = (): void => { this.#showAirZones = !this.#showAirZones; this.#emit(); };
  toggleTraceCoverage = (): void => { this.#showTraceCoverage = !this.#showTraceCoverage; this.#emit(); };
  toggleHideUnits = (): void => { this.#hideUnits = !this.#hideUnits; this.#emit(); };
  toggleUnitKind = (kind: UnitFilterKind): void => {
    if (!this.#hiddenUnitKinds.delete(kind)) this.#hiddenUnitKinds.add(kind);
    this.#emit();
  };

  #dumpLabel(dumpId: string): string {
    const dump = this.#pieces().find(({ id }) => id === dumpId);
    if (!dump) return 'a dump';
    const size = dump.resourceQuantity !== null ? `${dump.resourceQuantity}T ` : '';
    if (dump.location.kind === 'ON_MAP') return `the ${size}dump at ${printedHexLabel(dump.location.hexId)}`;
    const truck = dump.location.kind === 'CONTAINER' ? this.#pieces().find(({ id }) => id === (dump.location as { containerId: string }).containerId) : undefined;
    return truck?.location.kind === 'ON_MAP' ? `the ${size}truck load at ${printedHexLabel(truck.location.hexId)}` : 'a dump';
  }

  #probe(action: Omit<GameAction, 'actionId' | 'actorId' | 'expectedRevision'>): GameAction | null {
    const view = this.#view(this.#activeSeat());
    const full = { ...action, actionId: this.#actionId('probe'), actorId: view.playerId, expectedRevision: this.#session.getRevision() } as GameAction;
    return this.#explain(full).allowed ? full : null;
  }

  #unitActions(piece: ProjectedPiece, enabled: (kind: GameAction['kind']) => boolean): readonly UnitAction[] {
    return this.#cached(`unit-actions|${piece.id}`, () => {
      const actions: UnitAction[] = [];
      const add = (group: UnitAction['group'], label: string, action: GameAction | null | undefined, fuels?: readonly string[]) => {
        if (action) actions.push({ key: `${group}:${actions.length}:${action.kind}`, group, label, action, ...(fuels ? { fuels } : {}) });
      };
      if (enabled('CREATE_BREAKDOWN')) {
        // 20.0: the Breakdown's printed values come from the division's pool; the engine numbers it ("1/101.Abn").
        const definitions = this.#scenario.pieceCatalog.definitions;
        const pool = definitions.find(({ id }) => id === piece.definitionId)?.capabilities.find(({ id }) => id === 'BREAKDOWN')
          ?.parameters.find(({ key }) => key === 'definitionId');
        const counter = pool?.kind === 'TEXT' ? definitions.find(({ id }) => id === pool.value)?.name.replace(/^.*Brkdwn /u, '') : undefined;
        add('BREAKDOWN', `Detach a Breakdown${counter ? ` (${counter}, 1 RE; the division loses a step)` : ''}`, this.#candidates('CREATE_BREAKDOWN', piece.id)[0]);
      }
      if (enabled('PAY_FUEL')) {
        const previews = this.#cached(`fuel-preview|${piece.id}`, () => this.#session.getFuelPreview(this.#activeSeat(), piece.id as PieceId).value);
        for (const action of this.#candidates('PAY_FUEL', piece.id)) {
          if (action.kind !== 'PAY_FUEL') continue;
          const fueled = previews?.find(({ method }) => method === action.method)?.fueledPieceIds ?? [];
          // 12.5c: the HQ Method costs 1 SP (4T); it only beats paying 1T per unit when it fuels more than four units.
          if (action.method === 'HQ' && fueled.length * FUEL_COSTS.singleUnit <= FUEL_COSTS.hq) continue;
          const what = action.method === 'SINGLE_UNIT' ? 'Fuel this unit for this phase (1T)'
            : action.method === 'FORMATION' ? 'Fuel its whole formation until Clean Up (1 SP)' : 'Fuel this HQ and the independent units in its range until Clean Up (1 SP)';
          const names = fueled.map((id) => {
            const unit = this.#pieces().find((candidate) => candidate.id === id);
            return unit ? `${unitLabel(this.#scenario, unit)}${unit.location.kind === 'ON_MAP' ? ` ${printedHexLabel(unit.location.hexId)}` : ''}` : 'a unit';
          });
          add('FUEL', `${what} from ${this.#dumpLabel(action.sourcePieceId)}`, action, names);
        }
      }
      if (enabled('ATTEMPT_BREAKOUT')) add('BREAKOUT', 'Attempt breakout (5-6 on one die)', this.#candidates('ATTEMPT_BREAKOUT', piece.id)[0]);
      if (enabled('RECOVER_INTERNALS')) add('SUPPLY', 'Recover internal stocks', this.#candidates('RECOVER_INTERNALS', piece.id)[0]);
      // A dump on the map, or SP a truck carries (12.11a: either can be blown).
      const isDump = piece.role === 'DUMP' || piece.role === 'CARGO';
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
      if (enabled('REDUCE_AIR_BASE')) {
        add('AIR', 'Reduce this Air Base one Level with 1 RE of Combat Mode units here (they do not move)', this.#candidates('REDUCE_AIR_BASE', piece.id).find((action) => action.kind === 'REDUCE_AIR_BASE' && !action.engineerId));
        // 15.4, 13.8d: an Engineer-Capable unit does the same work for any Level 2+ base within its 2-hex radius, at no SP cost.
        for (const action of this.#candidates('REDUCE_AIR_BASE', piece.id)) {
          if (action.kind !== 'REDUCE_AIR_BASE' || action.engineerId !== piece.id) continue;
          const base = this.#pieces().find(({ id }) => id === action.baseId);
          add('AIR', `Reduce the Air Base at ${printedHexLabel(base?.location.kind === 'ON_MAP' ? base.location.hexId : '')} one Level (engineer work, no SP; this unit cannot move)`, action);
        }
      }
      // 16.0b-c: one RE of Combat Mode units in the hex digs in (2 SP) or reduces its own hedgehog (free); none of them may move after.
      const crewNames = (ids: readonly string[]) => ids.map((id) => { const unit = this.#pieces().find((candidate) => candidate.id === id); return unit ? unitLabel(this.#scenario, unit) : 'a unit'; });
      if (enabled('BUILD_HEDGEHOG')) {
        for (const action of this.#candidates('BUILD_HEDGEHOG', piece.id)) {
          if (action.kind !== 'BUILD_HEDGEHOG' || action.engineerId !== null) continue;
          const sources = action.payments.map(({ sourcePieceId }) => this.#dumpLabel(sourcePieceId)).join(', ');
          add('HEDGEHOG', `${this.#hedgehogLabel(action.hexId)} at ${printedHexLabel(action.hexId)} (2 SP from ${sources}; crew ${crewNames(action.pieceIds).join(', ')} cannot move this phase)`, action);
        }
      }
      if (enabled('REDUCE_HEDGEHOG')) {
        for (const action of this.#candidates('REDUCE_HEDGEHOG', piece.id)) {
          if (action.kind !== 'REDUCE_HEDGEHOG') continue;
          const hog = this.#pieces().find(({ id }) => id === action.hedgehogId);
          const where = hog?.location.kind === 'ON_MAP' ? hog.location.hexId : '';
          const level = this.#hedgehogLevelAt(where) ?? 1;
          const result = level > 1 ? `to Level ${level - 1}` : '(it is removed)';
          add('HEDGEHOG', action.engineerId
            ? `Reduce the hedgehog at ${printedHexLabel(where)} ${result} (engineer work, no SP; ${action.engineerId === piece.id ? 'this unit' : crewNames([action.engineerId])[0]} cannot move)`
            : `Reduce the hedgehog at ${printedHexLabel(where)} ${result} (no SP; crew ${crewNames(action.pieceIds).join(', ')} cannot move this phase)`, action);
        }
      }
      // 19.0c-d: wreck a friendly port one hit before the enemy takes it, or repair a hit (engineer, 1 SP).
      if (enabled('REDUCE_PORT')) {
        for (const action of this.#candidates('REDUCE_PORT', piece.id)) {
          if (action.kind !== 'REDUCE_PORT') continue;
          add('PORT', action.engineerId
            ? `Inflict a hit on the port at ${printedHexLabel(action.hexId)} (engineer work, no SP; ${action.engineerId === piece.id ? 'this unit' : crewNames([action.engineerId])[0]} cannot move)`
            : `Inflict a hit on this port (no SP; crew ${crewNames(action.pieceIds).join(', ')} cannot move this phase)`, action);
        }
      }
      if (enabled('REPAIR_PORT')) {
        for (const action of this.#candidates('REPAIR_PORT', piece.id)) {
          if (action.kind !== 'REPAIR_PORT') continue;
          const sources = action.payments.map(({ sourcePieceId }) => this.#dumpLabel(sourcePieceId)).join(', ');
          add('PORT', `Repair one hit of the port at ${printedHexLabel(action.hexId)} (1 SP from ${sources}; this unit cannot move)`, action);
        }
      }
      if (enabled('COMBINE_AIRCRAFT')) add('AIR', 'Combine with the other reduced aircraft of the same type here', this.#candidates('COMBINE_AIRCRAFT', piece.id)[0]);
      return distinctLabels(actions);
    });
  }

  #stepActions(enabled: (kind: GameAction['kind']) => boolean): readonly UnitAction[] {
    return this.#cached('step-actions', () => {
      const actions: UnitAction[] = [];
      const name = (pieceId: string) => { const piece = this.#pieces().find(({ id }) => id === pieceId); return piece ? unitLabel(this.#scenario, piece) : 'Unit'; };
      const formations = this.#formationNames(this.#view(this.#activeSeat()).playerId);
      if (enabled('RECOVER_INTERNALS')) {
        for (const action of this.#candidates('RECOVER_INTERNALS')) {
          if (action.kind === 'RECOVER_INTERNALS') actions.push({ key: `recover:${action.pieceId}`, group: 'SUPPLY', label: `${name(action.pieceId)}: recover internal stocks`, action });
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

  /** The rail move from `hexId` as the player has ticked it so far, with what it costs and why it may not go (13.3). */
  #railPanel(hexId: string, dumpId: string | null): RailPanel | null {
    const seatId = this.#activeSeat();
    const options = this.#cached(`rail|${hexId}`, () => this.#session.getRailMoveOptions(seatId, hexId as never).value);
    if (!options || options.capacityPoints === null || options.entrainProblem !== null || options.destinations.length === 0) return null;
    const draft = this.#railDraft?.fromHexId === hexId ? this.#railDraft : null;
    const pieces = this.#pieces();
    const units = (dumpId === null ? options.units : []).map(({ pieceId, quarters, problem }) => {
      const piece = pieces.find(({ id }) => id === pieceId);
      return { pieceId, label: piece ? unitLabel(this.#scenario, piece) : 'Unit', quarters, problem, selected: draft?.unitIds.has(pieceId) === true };
    });
    const dumps = options.dumps.filter(({ pieceId }) => pieceId === dumpId).map(({ pieceId, loadableTokens }) => ({
      pieceId, holds: pieces.find(({ id }) => id === pieceId)?.resourceQuantity ?? 0, loadableTokens, tokens: Math.min(loadableTokens, draft?.tokens.get(pieceId) ?? 0),
    }));
    const destinations = options.destinations.map(({ hexId: to, halves, path }) => ({ hexId: to, halves, hexes: path.length - 1 }));
    const toHexId = draft?.toHexId && destinations.some(({ hexId: to }) => to === draft.toHexId) ? draft.toHexId : null;
    const supply = dumps.filter(({ tokens }) => tokens > 0).map(({ pieceId, tokens }) => ({ sourcePieceId: pieceId as PieceId, tokens }));
    const unitIds = units.filter(({ selected }) => selected).map(({ pieceId }) => pieceId as PieceId);
    let costQuarters: number | null = null;
    let allowed = false;
    let blockers: string[] = [];
    if (toHexId !== null && (supply.length > 0 || unitIds.length > 0)) {
      const explanation = this.#explain(this.#railAction(hexId, toHexId, unitIds, supply));
      const cost = explanation.facts.find(({ key }) => key === 'rail.cost')?.value;
      costQuarters = typeof cost === 'string' && cost !== '' ? quartersOf(cost) : null;
      allowed = explanation.allowed;
      blockers = explanation.reasons.filter(({ allowed: ok }) => !ok).map(({ message }) => message);
    }
    if (units.length === 0 && dumps.length === 0) return null;
    return {
      hexId, capacityPoints: options.capacityPoints, remainingQuarters: options.remainingQuarters,
      arrivalTokens: options.arrival && options.dumps.length > 0 ? options.arrival.tokens : null,
      units, dumps, destinations, toHexId, costQuarters, allowed, blockers,
    };
  }

  #railAction(fromHexId: string, toHexId: string, unitIds: readonly PieceId[], supply: readonly { readonly sourcePieceId: PieceId; readonly tokens: number }[]): GameAction {
    return {
      kind: 'RAIL_MOVE', fromHexId, toHexId, unitIds, supply,
      actionId: this.#actionId('rail'), actorId: this.#view(this.#activeSeat()).playerId, expectedRevision: this.#session.getRevision(),
    } as GameAction;
  }

  /** The Rail transport button: start a fresh draft for the selected piece (a unit comes ticked) and show the panel. */
  openRail = (): void => {
    const pieceId = this.#selection.pieceId;
    const piece = this.#pieces().find(({ id }) => id === pieceId);
    if (!piece || piece.location.kind !== 'ON_MAP') return;
    this.#railDraft = { fromHexId: piece.location.hexId, unitIds: new Set(piece.role === 'DUMP' ? [] : [piece.id]), tokens: new Map(), toHexId: null };
    this.#railOpen = piece.id;
    this.#emit();
  };

  closeRail = (): void => { this.#railOpen = null; this.#railDraft = null; this.#emit(); };

  #railDraftFor(hexId: string) {
    return this.#railDraft?.fromHexId === hexId ? this.#railDraft : { fromHexId: hexId, unitIds: new Set<string>(), tokens: new Map<string, number>(), toHexId: null };
  }

  /** Tick or untick a unit (or truck) for the rail move from the selected hex. */
  toggleRailUnit = (pieceId: string): void => {
    const panel = this.getSnapshot().rail;
    if (!panel) return;
    const draft = this.#railDraftFor(panel.hexId);
    const unitIds = new Set(draft.unitIds);
    if (unitIds.has(pieceId)) unitIds.delete(pieceId); else unitIds.add(pieceId);
    this.#railDraft = { ...draft, unitIds };
    this.#emit();
  };

  /** Tokens of one dump to entrain. */
  setRailTokens = (dumpId: string, tokens: number): void => {
    const panel = this.getSnapshot().rail;
    if (!panel || !Number.isSafeInteger(tokens) || tokens < 0) return;
    const draft = this.#railDraftFor(panel.hexId);
    this.#railDraft = { ...draft, tokens: new Map([...draft.tokens, [dumpId, tokens]]) };
    this.#emit();
  };

  /** The detraining hex: chosen from the list or by clicking a highlighted hex on the map. */
  chooseRailDestination = (hexId: string): void => {
    const panel = this.getSnapshot().rail;
    if (!panel || !panel.destinations.some(({ hexId: to }) => to === hexId)) return;
    this.#railDraft = { ...this.#railDraftFor(panel.hexId), toHexId: hexId };
    this.#emit();
  };

  confirmRailMove = async (): Promise<void> => {
    const panel = this.getSnapshot().rail;
    if (!panel || !panel.allowed || panel.toHexId === null) return;
    const unitIds = panel.units.filter(({ selected }) => selected).map(({ pieceId }) => pieceId as PieceId);
    const supply = panel.dumps.filter(({ tokens }) => tokens > 0).map(({ pieceId, tokens }) => ({ sourcePieceId: pieceId as PieceId, tokens }));
    const tokens = supply.reduce((total, { tokens: quantity }) => total + quantity, 0);
    const cargo = [unitIds.length > 0 ? `${unitIds.length} unit${unitIds.length === 1 ? '' : 's'}` : '', tokens > 0 ? `${tokens}T` : ''].filter(Boolean).join(' and ');
    const to = panel.toHexId;
    this.#railDraft = null;
    this.#railOpen = null;
    this.#selection = { ...this.#selection, hexId: to };
    await this.#dispatch(this.#railAction(panel.hexId, to, unitIds, supply),
      `Moved ${cargo} by rail from ${printedHexLabel(panel.hexId)} to ${printedHexLabel(to)} for ${quartersLabel(panel.costQuarters ?? 0)} Rail Cap.`);
  };

  /** The shipment from `fromHexId` (null: the Box) as the player has ticked it so far, with its cost and what stops it (19.0f). */
  #seaPanel(fromHexId: string | null): SeaPanel | null {
    const seatId = this.#activeSeat();
    const options = this.#cached(`sea|${fromHexId ?? 'box'}`, () => this.#session.getSeaMoveOptions(seatId, fromHexId as never).value);
    if (!options || options.capacityPoints === null || options.problem !== null || options.destinations.length === 0) return null;
    if (options.units.length === 0 && options.dumps.length === 0) return null;
    const draft = this.#seaDraft?.fromHexId === fromHexId ? this.#seaDraft : null;
    const pieces = this.#pieces();
    const units = options.units.map(({ pieceId, quarters, problem }) => {
      const piece = pieces.find(({ id }) => id === pieceId);
      return { pieceId, label: piece ? unitLabel(this.#scenario, piece) : 'Unit', quarters, problem, selected: draft?.unitIds.has(pieceId) === true };
    });
    const dumps = options.dumps.map(({ pieceId, loadableTokens }) => ({
      pieceId, holds: pieces.find(({ id }) => id === pieceId)?.resourceQuantity ?? 0, loadableTokens, tokens: Math.min(loadableTokens, draft?.tokens.get(pieceId) ?? 0),
    }));
    const destinations = options.destinations.map(({ hexId, remainingTokens }) => ({ hexId, remainingTokens }));
    const toHexId = draft?.toHexId && destinations.some(({ hexId }) => hexId === draft.toHexId) ? draft.toHexId : null;
    const supply = dumps.filter(({ tokens }) => tokens > 0).map(({ pieceId, tokens }) => ({ sourcePieceId: pieceId as PieceId, tokens }));
    const unitIds = units.filter(({ selected }) => selected).map(({ pieceId }) => pieceId as PieceId);
    let costQuarters: number | null = null;
    let allowed = false;
    let blockers: string[] = [];
    if (toHexId !== null && (supply.length > 0 || unitIds.length > 0)) {
      const explanation = this.#explain(this.#seaAction(fromHexId, toHexId, unitIds, supply));
      const cost = explanation.facts.find(({ key }) => key === 'sea.cost')?.value;
      costQuarters = typeof cost === 'string' && cost !== '' ? quartersOf(cost) : null;
      allowed = explanation.allowed;
      blockers = explanation.reasons.filter(({ allowed: ok }) => !ok).map(({ message }) => message);
    }
    const fromRemainingTokens = fromHexId === null ? null
      : this.#view(seatId).projection?.ports?.find(({ hexId }) => hexId === fromHexId)?.remainingTokens ?? 0;
    return { fromHexId, capacityPoints: options.capacityPoints, remainingQuarters: options.remainingQuarters, fromRemainingTokens, units, dumps, destinations, toHexId, costQuarters, allowed, blockers };
  }

  #seaAction(fromHexId: string | null, toHexId: string, unitIds: readonly PieceId[], supply: readonly { readonly sourcePieceId: PieceId; readonly tokens: number }[]): GameAction {
    return {
      kind: 'SEA_MOVE', fromHexId, toHexId, unitIds, supply,
      actionId: this.#actionId('sea'), actorId: this.#view(this.#activeSeat()).playerId, expectedRevision: this.#session.getRevision(),
    } as GameAction;
  }

  #seaDraftFor(fromHexId: string | null) {
    return this.#seaDraft?.fromHexId === fromHexId ? this.#seaDraft : { fromHexId, unitIds: new Set<string>(), tokens: new Map<string, number>(), toHexId: null };
  }

  toggleSeaUnit = (pieceId: string): void => {
    const panel = this.getSnapshot().sea;
    if (!panel) return;
    const draft = this.#seaDraftFor(panel.fromHexId);
    const unitIds = new Set(draft.unitIds);
    if (unitIds.has(pieceId)) unitIds.delete(pieceId); else unitIds.add(pieceId);
    this.#seaDraft = { ...draft, unitIds };
    this.#emit();
  };

  setSeaTokens = (dumpId: string, tokens: number): void => {
    const panel = this.getSnapshot().sea;
    if (!panel || !Number.isSafeInteger(tokens) || tokens < 0) return;
    const draft = this.#seaDraftFor(panel.fromHexId);
    this.#seaDraft = { ...draft, tokens: new Map([...draft.tokens, [dumpId, tokens]]) };
    this.#emit();
  };

  /** The unloading port: chosen from the list or by clicking a highlighted port on the map. */
  chooseSeaDestination = (hexId: string): void => {
    const panel = this.getSnapshot().sea;
    if (!panel || !panel.destinations.some(({ hexId: to }) => to === hexId)) return;
    this.#seaDraft = { ...this.#seaDraftFor(panel.fromHexId), toHexId: hexId };
    this.#emit();
  };

  confirmSeaMove = async (): Promise<void> => {
    const panel = this.getSnapshot().sea;
    if (!panel || !panel.allowed || panel.toHexId === null) return;
    const unitIds = panel.units.filter(({ selected }) => selected).map(({ pieceId }) => pieceId as PieceId);
    const supply = panel.dumps.filter(({ tokens }) => tokens > 0).map(({ pieceId, tokens }) => ({ sourcePieceId: pieceId as PieceId, tokens }));
    const tokens = supply.reduce((total, { tokens: quantity }) => total + quantity, 0);
    const cargo = [unitIds.length > 0 ? `${unitIds.length} unit${unitIds.length === 1 ? '' : 's'}` : '', tokens > 0 ? `${tokens}T` : ''].filter(Boolean).join(' and ');
    const to = panel.toHexId;
    const from = panel.fromHexId;
    this.#seaDraft = null;
    await this.#dispatch(this.#seaAction(from, to, unitIds, supply),
      `Shipped ${cargo} ${from === null ? 'from the reinforcement Box' : `from ${printedHexLabel(from)}`} to ${printedHexLabel(to)} for ${quartersLabel(panel.costQuarters ?? 0)} Sea Cap.`);
  };

  #collapseHexes(piece: ProjectedPiece): readonly string[] {
    if (piece.location.kind !== 'ON_MAP') return [];
    const origin = piece.location.hexId;
    return this.#scenario.mapDefinition.hexes.map(({ id }) => id).filter((hexId) => hexId !== origin
      && this.#probe({ kind: 'COLLAPSE_EXTENDER', extenderId: piece.id, hexId } as never) !== null);
  }

  /** Load Tokens from a dump in the selected truck's Hex, or unload Tokens it carries (13.2f): any count the options allow. */
  transferSupply = async (kind: 'LOAD' | 'UNLOAD', dumpId: string | null, tokens: number): Promise<void> => {
    const truck = this.getSnapshot().selectedPiece;
    const options = this.getSnapshot().transportOptions;
    if (!truck || !options || !Number.isSafeInteger(tokens) || tokens < 1) return;
    const where = printedHexLabel(options.hexId);
    const action = kind === 'LOAD'
      ? { kind: 'LOAD_SUPPLY', truckId: truck.id, dumpId: dumpId as PieceId, tokens }
      : { kind: 'UNLOAD_SUPPLY', truckId: truck.id, tokens };
    await this.#dispatch({ ...action, actionId: this.#actionId('transfer'), actorId: this.#view(this.#activeSeat()).playerId, expectedRevision: this.#session.getRevision() } as GameAction,
      kind === 'LOAD' ? `Loaded ${tokens}T onto the truck at ${where}.` : `Unloaded ${tokens}T at ${where}.`);
  };

  /** Split `points` Transport Points off the selected truck (13.2c). */
  divideTruck = async (points: number): Promise<void> => {
    const truck = this.getSnapshot().selectedPiece;
    if (!truck || !Number.isSafeInteger(points) || points < 1) return;
    await this.#dispatch({
      kind: 'DIVIDE_TRANSPORT', truckId: truck.id, points,
      actionId: this.#actionId('divide'), actorId: this.#view(this.#activeSeat()).playerId, expectedRevision: this.#session.getRevision(),
    } as GameAction, `Split off ${points} truck point${points === 1 ? '' : 's'}.`);
  };

  runAction = async (key: string): Promise<void> => {
    const snapshot = this.getSnapshot();
    const entry = [...snapshot.unitActions, ...snapshot.stepActions].find((candidate) => candidate.key === key);
    if (!entry) return;
    await this.#dispatch({ ...entry.action, actionId: this.#actionId('unit-action'), expectedRevision: this.#session.getRevision() } as GameAction, `${entry.label}: done.`);
  };

  #emit(): void {
    const view = this.#view(this.#activeSeat());
    if (!view.privacyLocked) this.#seen.set(this.#activeSeat(), this.#history().length);
    const snapshot = this.getSnapshot();
    for (const listener of this.#listeners) listener(snapshot);
  }

  subscribe = (listener: UiListener): (() => void) => {
    this.#listeners.add(listener);
    listener(this.getSnapshot());
    return () => this.#listeners.delete(listener);
  };

  #resetIntent(): void { this.#destination = null; this.#draft = null; this.#airDraft = null; this.#buildDraft = null; this.#dropDraft = null; this.#railDraft = null; this.#railOpen = null; this.#seaDraft = null; }

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

  finishMove = async (): Promise<void> => {
    const pieceId = this.#selection.pieceId;
    if (!pieceId || !this.getSnapshot().selectedIsMoving) { this.clearSelection(); return; }
    const action = this.#probe({ kind: 'END_MOVE', pieceId } as never);
    if (!action) return;
    await this.#dispatch(action, 'Move finished.');
    // Keep the selection when the game refused, so the notice explains why the unit is still held.
    if (this.#view(this.#activeSeat()).projection?.currentMoverId !== pieceId) this.clearSelection();
  };

  #openDraft(kind: AttackDraft['kind'], targetHexId: string): void {
    const snapshotSegment = this.#view(this.#activeSeat()).projection?.sequence.segment;
    if (kind === 'BARRAGE') {
      const candidates = this.#candidates('DECLARE_BARRAGE').filter((action) => action.kind === 'DECLARE_BARRAGE' && action.targetHexId === targetHexId);
      const eligible = [...new Set(candidates.flatMap((action) => action.kind === 'DECLARE_BARRAGE' ? action.firerIds : []))];
      const first = candidates[0];
      this.#draft = { kind, targetHexId, eligibleIds: eligible, selectedIds: first?.kind === 'DECLARE_BARRAGE' ? first.firerIds : [], leadId: null, supply: [] };
      return;
    }
    const pieceFilter = snapshotSegment === 'COMBAT' ? null : this.#selection.pieceId;
    const candidates = this.#candidates('DECLARE_COMBAT', pieceFilter).filter((action) => action.kind === 'DECLARE_COMBAT' && action.targetHexId === targetHexId);
    const eligible = [...new Set(candidates.flatMap((action) => action.kind === 'DECLARE_COMBAT' ? action.attackerIds : []))];
    const first = candidates[0];
    this.#draft = this.#settleSupply({
      kind, targetHexId, eligibleIds: eligible,
      selectedIds: first?.kind === 'DECLARE_COMBAT' ? first.attackerIds : [],
      leadId: first?.kind === 'DECLARE_COMBAT' ? first.leadAttackerId : null,
      supply: [],
    });
  }

  clickHex = async (hexId: string): Promise<void> => {
    const snapshot = this.getSnapshot();
    if (snapshot.view.privacyLocked || snapshot.view.metadata.lifecycle !== 'ACTIVE') return;
    if (snapshot.decision && snapshot.decisionHexes.includes(hexId)) {
      const option = snapshot.decision.options.find((candidate) => candidate.hexId === hexId);
      if (option) { await this.respondToDecision(option.id); return; }
    }
    if (this.#dropDraft) {
      // A drop may be planned on any hex (14.10b): the click picks it.
      this.#dropDraft = { ...this.#dropDraft, hexId };
      this.#selection = { ...this.#selection, hexId };
      this.#emit();
      return;
    }
    if (this.#buildDraft && snapshot.air.construction?.hexes.includes(hexId)) {
      this.#buildDraft = { ...this.#buildDraft, hexId };
      this.#selection = { ...this.#selection, hexId };
      this.#emit();
      return;
    }
    if (this.#airDraft && snapshot.air.targetHexes.includes(hexId)) {
      this.#chooseAirTarget(hexId);
      this.#emit();
      return;
    }
    if (snapshot.rail && snapshot.rail.destinations.some(({ hexId: to }) => to === hexId)) {
      this.chooseRailDestination(hexId);
      return;
    }
    if (snapshot.sea && snapshot.sea.destinations.some(({ hexId: to }) => to === hexId) && (snapshot.sea.units.some(({ selected }) => selected) || snapshot.sea.dumps.some(({ tokens }) => tokens > 0))) {
      this.chooseSeaDestination(hexId);
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
    this.#draft = this.#settleSupply({ ...this.#draft, selectedIds: selected });
    this.#emit();
  };

  chooseAttackerSupply = (pieceId: string, optionId: string): void => {
    const draft = this.#draft;
    if (!draft || draft.kind === 'BARRAGE' || !draft.selectedIds.includes(pieceId as PieceId)) return;
    const prior = draft.supply.slice(0, draft.supply.findIndex((choice) => choice.pieceId === pieceId));
    const option = this.#supplyOptions(prior, pieceId as PieceId).find(({ id }) => id === optionId);
    if (!option) return;
    this.#draft = this.#settleSupply({ ...draft, supply: draft.supply.map((choice) => (choice.pieceId === pieceId ? option.choice : choice)) });
    this.#emit();
  };

  #supplyOptions(prior: readonly AttackerSupplyChoice[], pieceId: PieceId): readonly AttackerSupplyOption[] {
    return this.#cached(`attacker-supply|${pieceId}|${JSON.stringify(prior)}`,
      () => this.#session.getAttackerSupplyOptions(this.#activeSeat(), prior, pieceId).value?.options ?? []);
  }

  /**
   * 9.5, 12.10a: the ticked attackers declare their supply in tick order. Each keeps its source while it stays legal
   * after the units above it, else takes the first legal one; a unit left with none leaves the attack, and the notice says why.
   */
  #settleSupply(input: DraftInput): DraftInput {
    if (input.kind === 'BARRAGE') return input;
    const supply: AttackerSupplyChoice[] = [];
    const dropped: string[] = [];
    for (const id of input.selectedIds) {
      const options = this.#supplyOptions(supply, id);
      const current = input.supply.find((choice) => choice.pieceId === id);
      const pick = (current && options.find(({ choice }) => sameSupplyChoice(choice, current))) ?? options[0];
      if (pick) supply.push(pick.choice);
      else dropped.push(id);
    }
    if (dropped.length > 0) {
      const names = dropped.map((id) => { const piece = this.#pieces().find((candidate) => candidate.id === id); return piece ? unitLabel(this.#scenario, piece) : 'Unit'; }).join(', ');
      this.#notice = `${names} cannot join: no SP in reach after the units above and internal stocks Exhausted (12.10c).`;
    }
    const selectedIds = supply.map(({ pieceId }) => pieceId);
    return { ...input, selectedIds, supply, leadId: input.leadId && selectedIds.includes(input.leadId) ? input.leadId : selectedIds[0] ?? null };
  }

  #supplyRows(input: DraftInput): AttackDraft['supply'] {
    if (input.kind === 'BARRAGE') return [];
    const seatId = this.#activeSeat();
    return input.eligibleIds.map((pieceId) => {
      const index = input.supply.findIndex((choice) => choice.pieceId === pieceId);
      const prior = index >= 0 ? input.supply.slice(0, index) : input.supply;
      const result = this.#cached(`attacker-supply-row|${pieceId}|${JSON.stringify(prior)}`,
        () => this.#session.getAttackerSupplyOptions(seatId, prior, pieceId).value);
      const options = result?.options ?? [];
      return {
        pieceId, need: result?.need ?? 0,
        options: options.map(({ id, label, hexIds, wastedTokens }) => ({ id, label: withPrintedHexes(label), hexIds, wastedTokens })),
        chosenId: index >= 0 ? options.find(({ choice }) => sameSupplyChoice(choice, input.supply[index]!))?.id ?? null : null,
        reason: result?.reason ? withPrintedHexes(result.reason) : null,
      };
    });
  }

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
      const sequence = this.#view(this.#activeSeat()).projection?.sequence;
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
      line: barrage ? null : String(fact('combat.line') ?? ''), // The combat roll's net DRM: the AR difference less the defender's hedgehog Level (16.0d).
      drm: barrage ? null : (number('combat.drm') ?? 0) - (number('combat.hedgehogLevel') ?? 0),
      defenderSupplied: null, result: null, rollTotal: null, surpriseTotal: null, shiftDie: null, air: null,
    });
  }

  #dispatch = async (action: GameAction, message: string, explanation?: RuleExplanation): Promise<void> => this.#run(async () => {
    let success = message;
    const taken = this.#takeUndoPoint(action, message);
    const result = await this.#session.dispatch({ requestId: this.#requestId(), seatId: this.#activeSeat(), action });
    if (result.status !== 'ACCEPTED') {
      if (taken) this.#session.removeCheckpoint(taken.id);
      const reasons = result.violations.map(({ message: reason }) => reason).join(' ');
      return `Not allowed: ${reasons || `the game refused the action (${result.status.toLowerCase()}).`}`;
    }
    success += this.#recordUndoPoint(taken, action, message, result);
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
    const view = this.#view(this.#activeSeat());
    const action: GameAction = {
      actionId: this.#actionId('advance'), actorId: view.playerId, expectedRevision: this.#session.getRevision(), kind: 'ADVANCE_SEQUENCE',
    };
    this.#selection = initialSelection();
    this.#resetIntent();
    const step = view.projection?.sequence;
    await this.#dispatch(action, step ? `${phaseLabel(step.phase, step.segment)} finished.` : 'Step ended.');
  };

  undoStep = async (): Promise<void> => this.#run(async () => {
    // Take back the last action only, when Undo has one; otherwise fall back to the start of the step.
    const point = this.#undoPoints.at(-1);
    if (point && this.#undoActionAvailable()) {
      this.#undoing = true;
      try {
        const restored = await this.#session.undoTo(point.id);
        if (!restored.ok) return restored.code;
      } finally { this.#undoing = false; }
      this.#undoPoints.pop();
      this.#session.removeCheckpoint(point.id);
      const resumed = this.#session.resume();
      // Keep the player's selection when that unit still exists, so a truck can be loaded again without picking it anew.
      if (!this.#pieces().some(({ id }) => id === this.#selection.pieceId)) this.#selection = initialSelection();
      this.#resetIntent();
      return resumed.ok ? `Undid: ${point.label}` : resumed.code;
    }
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

  resume = (): void => {
    const result = this.#session.resume();
    this.#notice = result.ok ? 'Resumed.' : result.code;
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
    if (!result.ok) return result.code;
    // The session pauses on a restore; play goes straight on from the checkpoint (a finished game stays finished).
    if (result.lifecycle === 'PAUSED') this.#session.resume();
    return `Restored ${checkpoint.label || checkpoint.id}.`;
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
    this.#undoPoints = [];
    for (const checkpoint of loaded.listCheckpoints()) if (checkpoint.label.startsWith('Auto: ') || checkpoint.label.startsWith(UNDO_POINT_PREFIX)) loaded.removeCheckpoint(checkpoint.id);
    // A save made while paused (before the UI dropped Pause) is played on at once.
    if (loaded.getMetadata().lifecycle === 'PAUSED') loaded.resume();
    this.#bindSession();
    this.#continueNumbering();
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
