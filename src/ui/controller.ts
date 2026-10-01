import type { PieceId } from '../core/index.js';
import type { OcsMode } from '../domain/piece/index.js';
import type { ScenarioDefinition } from '../domain/scenario/index.js';
import {
  parseDispatchRequestId,
  type GameSession,
  type GameplayEngine,
  type HandoffToken,
  type SeatBinding,
  type SeatId,
} from '../gameplay/index.js';
import { AIR_MISSION_KINDS, AIR_MISSION_LABELS, missionSegment, parseRuleActionId, type AirMissionKind, type GameAction, type ProjectedPiece, type RuleExplanation } from '../rules/index.js';
import type { AirDraft, AirOverview, AirRefit, Arrival, AttackDraft, EndStep, MovePreview, SupplyNeed, UiListener, UiSelection, UiSnapshot, UnitAction } from './model.js';
import { phaseLabel, printedHexLabel, unitLabel } from './presenter.js';

export interface UiControllerOptions {
  readonly engine: GameplayEngine;
  readonly session: GameSession;
  readonly scenario: ScenarioDefinition;
  readonly bindings: readonly SeatBinding[];
}

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
  readonly endStep: () => Promise<void>;
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
  #cache = new Map<string, unknown>();
  #cacheScope = '';
  #airDraft: AirDraftInput | null = null;
  #refitSelection = new Map<string, readonly PieceId[]>();
  #showAirZones = false;

  constructor(options: UiControllerOptions) {
    this.#engine = options.engine;
    this.#session = options.session;
    this.#scenario = options.scenario;
    this.#bindings = options.bindings.map((binding) => ({ ...binding }));
    this.#notice = options.session.getMetadata().lifecycle === 'ACTIVE'
      ? 'Select a unit on the map to see where it can move and what it can attack.'
      : 'Scenario ready. Start the session when you are ready.';
    this.#bindSession();
  }

  #bindSession(): void {
    this.#unsubscribeSession?.();
    this.#unsubscribeSession = this.#session.subscribe(() => this.#emit());
  }

  #activeSeat(): SeatId { return this.#session.getMetadata().activeSeatId; }

  #cached<T>(key: string, compute: () => T): T {
    const metadata = this.#session.getMetadata();
    const scope = `${this.#session.getRevision()}|${metadata.lifecycle}|${metadata.activeSeatId}|${this.#handoffToken ?? ''}`;
    if (scope !== this.#cacheScope) { this.#cache.clear(); this.#cacheScope = scope; }
    if (!this.#cache.has(key)) this.#cache.set(key, compute());
    return this.#cache.get(key) as T;
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
    const label = sequence ? `End ${phaseLabel(sequence.phase, sequence.segment)}` : 'End step';
    const advance = this.#candidates('ADVANCE_SEQUENCE', null, 1)[0];
    if (advance) return { enabled: true, label, blockers: [] };
    const probe: GameAction = {
      actionId: this.#actionId('advance-probe'), actorId: view.playerId, expectedRevision: this.#session.getRevision(), kind: 'ADVANCE_SEQUENCE',
    };
    const explanation = this.#explain(probe);
    return { enabled: false, label, blockers: explanation.reasons.filter(({ allowed }) => !allowed).map(({ message }) => message) };
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
    if (ownSelected && enabled('MOVE_PIECE')) {
      for (const action of this.#candidates('MOVE_PIECE', ownSelected.id, 2000)) {
        if (action.kind === 'MOVE_PIECE') reachable.set(action.path.at(-1)!, action.path);
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
    const decisionHexes = pending && pending.seatId === seatId
      ? [...new Set(pending.decision.options.flatMap(({ hexId }) => hexId ? [hexId] : []))] : [];
    const sequenceOwner = this.#bindings.find(({ playerId }) => playerId === view.projection?.sequence.actingPlayerId);
    return {
      scenario: this.#scenario,
      view,
      bindings: this.#bindings,
      families,
      selection: { ...this.#selection },
      selectedPiece,
      reachable,
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
      decision: pending?.seatId === seatId ? pending.decision : null,
      decisionSeatId: pending?.seatId ?? null,
      decisionHexes,
      history: this.#session.getHistory({ offset: 0, limit: 400, actionKind: null }).records,
      checkpoints: this.#session.listCheckpoints(),
      notice: this.#notice,
      busy: this.#busy,
      handoffPending: this.#handoffToken !== null,
      requiredSeatId: pending?.seatId ?? sequenceOwner?.seatId ?? null,
      air: this.#airOverview(enabled),
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
    if (dump.location.kind === 'ON_MAP') return `the dump at ${printedHexLabel(dump.location.hexId)}`;
    const truck = dump.location.kind === 'CONTAINER' ? this.#pieces().find(({ id }) => id === (dump.location as { containerId: string }).containerId) : undefined;
    return truck?.location.kind === 'ON_MAP' ? `the truck load at ${printedHexLabel(truck.location.hexId)}` : 'a dump';
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
          if (action.kind === 'LOAD_SUPPLY') add('TRANSPORT', `Load ${action.tokens}T from the dump here (10% of MA)`, action);
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
      return actions;
    });
  }

  #stepActions(enabled: (kind: GameAction['kind']) => boolean): readonly UnitAction[] {
    return this.#cached('step-actions', () => {
      const actions: UnitAction[] = [];
      const name = (pieceId: string) => { const piece = this.#pieces().find(({ id }) => id === pieceId); return piece ? unitLabel(this.#scenario, piece) : 'Unit'; };
      if (enabled('RECOVER_INTERNALS')) {
        for (const action of this.#candidates('RECOVER_INTERNALS')) {
          if (action.kind === 'RECOVER_INTERNALS') actions.push({ key: `recover:${action.pieceId}`, group: 'SUPPLY', label: `${name(action.pieceId)}: recover internal stocks`, action });
        }
      }
      if (enabled('CHOOSE_FORMATION_TRACE')) {
        for (const action of this.#candidates('CHOOSE_FORMATION_TRACE')) {
          if (action.kind !== 'CHOOSE_FORMATION_TRACE') continue;
          const route = action.routeKey.startsWith('HQ:') ? `through ${name(action.routeKey.slice(3))}` : `directly from the source at ${printedHexLabel(action.routeKey.slice(5))}`;
          actions.push({ key: `trace:${action.formationId}:${action.routeKey}`, group: 'TRACE', label: `Trace the formation ${route}`, action });
        }
      }
      if (enabled('ATTEMPT_BREAKOUT')) {
        for (const action of this.#candidates('ATTEMPT_BREAKOUT')) {
          if (action.kind === 'ATTEMPT_BREAKOUT') actions.push({ key: `breakout:${action.pieceId}`, group: 'BREAKOUT', label: `${name(action.pieceId)}: attempt breakout`, action });
        }
      }
      return actions;
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
    if (snapshot.view.privacyLocked) return;
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
      if (action) { await this.#dispatch(action, `${unitLabel(this.#scenario, snapshot.selectedPiece)} placed at ${printedHexLabel(hexId)}.`); return; }
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
    await this.#dispatch(draft.action, draft.kind === 'BARRAGE' ? `Barrage on ${printedHexLabel(target)} resolved.` : `Attack on ${printedHexLabel(target)} declared.`);
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

  async #run(operation: () => Promise<string>): Promise<void> {
    if (this.#busy) return;
    this.#busy = true;
    this.#emit();
    try { this.#notice = await operation(); }
    catch (error) { this.#notice = error instanceof Error ? error.message : 'Unexpected UI operation failure.'; }
    finally { this.#busy = false; this.#emit(); }
  }

  #requestId() {
    const parsed = parseDispatchRequestId(`ui:request:${String(++this.#requestSequence).padStart(6, '0')}`);
    if (!parsed.ok) throw new Error(parsed.error.message);
    return parsed.value;
  }

  #dispatch = async (action: GameAction, message: string): Promise<void> => this.#run(async () => {
    let success = message;
    const result = await this.#session.dispatch({ requestId: this.#requestId(), seatId: this.#activeSeat(), action });
    if (result.status !== 'ACCEPTED') {
      return `Not allowed: ${result.violations.map(({ message }) => message).join(' ')}`;
    }
    if (action.kind !== 'MOVE_PIECE') this.#resetIntent();
    const resolved = result.events.flatMap((event) => event.kind === 'TRANSACTION_RESOLVED' && action.kind === 'DECLARE_AIR_MISSION' ? [event.result] : []);
    if (resolved.length > 0) success = `${success} ${withPrintedHexes(resolved.join(' '))}`;
    const pending = this.#decision();
    if (pending && pending.seatId !== this.#activeSeat()) {
      const owner = this.#bindings.find(({ seatId }) => seatId === pending.seatId);
      return `${success} ${owner?.label ?? 'The other player'} must decide: ${pending.decision.prompt}`;
    }
    return success;
  });

  respondToDecision = async (choiceId: string): Promise<void> => this.#run(async () => {
    const result = await this.#session.respondToPendingDecision(this.#requestId(), this.#activeSeat(), choiceId);
    if (result.status !== 'ACCEPTED') return `Decision not accepted: ${result.violations.map(({ message }) => message).join(' ')}`;
    const combat = result.events.filter((event) => event.kind === 'TRANSACTION_RESOLVED');
    if (combat.length > 0 && result.events.some((event) => event.kind === 'AIRCRAFT_STATUS_CHANGED')) {
      return `Air mission resolved: ${withPrintedHexes(combat.map((event) => event.kind === 'TRANSACTION_RESOLVED' ? event.result : '').join(' '))}`;
    }
    return combat.length > 0 ? `Combat resolved (${combat.map((event) => event.kind === 'TRANSACTION_RESOLVED' ? event.result : '').join(', ')}).` : 'Decision recorded.';
  });

  endStep = async (): Promise<void> => {
    const view = this.#session.getView(this.#activeSeat());
    const action: GameAction = {
      actionId: this.#actionId('advance'), actorId: view.playerId, expectedRevision: this.#session.getRevision(), kind: 'ADVANCE_SEQUENCE',
    };
    this.#selection = initialSelection();
    this.#resetIntent();
    await this.#dispatch(action, 'Step ended.');
  };

  start = (): void => {
    const result = this.#session.start();
    this.#notice = result.ok ? 'Session started.' : result.code;
    this.#emit();
  };

  togglePause = (): void => {
    const lifecycle = this.#session.getMetadata().lifecycle;
    const result = lifecycle === 'PAUSED' ? this.#session.resume() : this.#session.pause();
    this.#notice = result.ok ? result.code.replaceAll('_', ' ').toLowerCase() : result.code;
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
    this.#bindSession();
    return `Save loaded at revision ${loaded.getRevision()}.`;
  });

  beginHandoff = (): void => {
    const from = this.#activeSeat();
    const to = this.#bindings.find(({ seatId }) => seatId !== from)?.seatId;
    if (!to) { this.#notice = 'No second seat is available.'; this.#emit(); return; }
    this.#handoffToken = this.#session.beginHandoff(from, to);
    this.#notice = 'Privacy screen locked. Pass control to the next player.';
    this.#emit();
  };

  completeHandoff = (): void => {
    if (this.#handoffToken === null) return;
    const result = this.#session.completeHandoff(this.#handoffToken);
    if (result.ok) this.#handoffToken = null;
    this.#notice = result.ok ? 'Your turn to act.' : result.code;
    this.#selection = initialSelection();
    this.#resetIntent();
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
