import type { HexId, PieceId } from '../core/index.js';
import type { OcsMode } from '../domain/piece/index.js';
import type { ScenarioDefinition } from '../domain/scenario/index.js';
import type {
  ActionFamily,
  AirMissionKind,
  AirRoute,
  GameAction,
  ProjectedPiece,
  RuleExplanation,
  TransportOptions,
} from '../rules/index.js';
import type {
  CheckpointDescriptor,
  GameplayView,
  HistoryRecord,
  PendingDecisionDescriptor,
  SeatBinding,
  SeatId,
} from '../gameplay/index.js';
import type { CombatReport, FeedEntry, TrackStep } from './narrative.js';

export interface UiSelection {
  readonly hexId: string | null;
  readonly pieceId: string | null;
}

/** One line of the supply ledger. `spent` counts Tokens consumed (fuel, feeding); loads and unloads only move SP and count 0. */
export interface LedgerLine {
  readonly revision: number;
  readonly text: string;
  readonly spent: number;
}

export interface MovePreview {
  readonly destinationHexId: string;
  readonly path: readonly string[];
  readonly action: GameAction;
  readonly explanation: RuleExplanation;
}

/** A combat or barrage being prepared in the command deck before it is declared. */
export interface AttackDraft {
  readonly kind: 'REGULAR' | 'OVERRUN' | 'BARRAGE';
  readonly targetHexId: string;
  readonly eligibleIds: readonly PieceId[];
  readonly selectedIds: readonly PieceId[];
  readonly leadId: PieceId | null;
  readonly action: GameAction | null;
  readonly explanation: RuleExplanation | null;
}

/** A Transport that may carry the cargo, and how it is set to fly (14.9e). */
export interface TransportCarrier {
  readonly id: PieceId;
  readonly label: string;
  /** What it carries flown normally, in half-Tokens. */
  readonly capacity: number;
  readonly allowed: readonly AirRoute[];
  readonly route: AirRoute | null;
  readonly selected: boolean;
  readonly integralGlider: boolean;
}

/** The load and Transports of an Air Transport or Air Drop being planned (14.9, 14.10). */
export interface TransportDraft {
  readonly drop: boolean;
  readonly baseHexId: string | null;
  /** Air Bases with a Transport that can reach the mission hex. */
  readonly baseHexIds: readonly string[];
  readonly carriers: readonly TransportCarrier[];
  /** Other Active aircraft that may fly along (14.2e). */
  readonly escorts: readonly { readonly id: PieceId; readonly label: string; readonly selected: boolean }[];
  /** Units at the Air Base that qualify (14.9c) and what each costs in half-Tokens. */
  readonly units: readonly { readonly id: PieceId; readonly label: string; readonly cost: number; readonly selected: boolean; readonly planned: boolean }[];
  readonly tokensAvailable: number;
  readonly tokens: number;
}

/** An air mission being planned: mission type, then target hex, then aircraft (14.2f A-B). */
export interface AirDraft {
  readonly mission: AirMissionKind;
  readonly label: string;
  readonly targetHexId: string | null;
  readonly target: 'COMBAT_UNITS' | 'AIR_BASE' | null;
  /** Barrage targets available in the chosen hex (10.0d). */
  readonly targetOptions: readonly ('COMBAT_UNITS' | 'AIR_BASE')[];
  readonly eligibleIds: readonly PieceId[];
  readonly selectedIds: readonly PieceId[];
  /** Most aircraft this mission may use: four, or one for sweeps, hip shoots and transfers as offered. */
  readonly maximum: number;
  /** Cargo and Transports, for Air Transport and Air Drop only. */
  readonly transport: TransportDraft | null;
  readonly action: GameAction | null;
  readonly explanation: RuleExplanation | null;
}

/** A Drop Plan of the player (14.10b). */
export interface DropPlanView {
  readonly id: string;
  readonly units: readonly { readonly id: PieceId; readonly label: string }[];
  readonly hexId: string;
  readonly turn: number;
  /** The plan's turn is the current Game Turn: the drop may be flown in this Movement Phase. */
  readonly dueNow: boolean;
}

/** A Drop Plan being made in the Aircraft Refit Phase. */
export interface DropPlanDraft {
  readonly candidates: readonly { readonly id: PieceId; readonly label: string; readonly para: boolean; readonly selected: boolean }[];
  readonly hexId: string | null;
  readonly turn: number;
  readonly earliestTurn: number;
  readonly action: GameAction | null;
  readonly explanation: RuleExplanation | null;
}

/** One friendly Air Base in the Aircraft Refit Phase (15.1). */
export interface AirRefit {
  readonly baseId: PieceId;
  readonly hexId: string;
  readonly capacity: number;
  readonly inactiveIds: readonly PieceId[];
  readonly selectedIds: readonly PieceId[];
  readonly sourceIds: readonly PieceId[];
  readonly action: GameAction | null;
  readonly explanation: RuleExplanation | null;
  /** 0 for an Air Strip. */
  readonly level: number;
  /** Active aircraft at the base now, and how many it may hold (14.2a). */
  readonly active: number;
  readonly activeLimit: number;
  /** In an un-negated enemy ZOC with no friendly combat unit: the base cannot refit (15.1C). */
  readonly zocBlocked: boolean;
}

/** One Eq counter that can rebuild aircraft in the Reinforcement Phase (13.5f). */
export interface AirRebuild {
  readonly eqPieceId: PieceId;
  readonly hexId: string;
  readonly equipment: number;
  /** Aircraft the Eq could rebuild: the Dead Pile (two steps each) and reduced aircraft stacked with the Eq (one step each). */
  readonly aircraft: readonly { readonly id: PieceId; readonly label: string; readonly steps: number; readonly deadPile: boolean; readonly selected: boolean }[];
  /** Air Bases a Dead Pile aircraft may arrive at, with their hex. */
  readonly bases: readonly { readonly id: PieceId; readonly hexId: string; readonly selected: boolean }[];
  readonly action: GameAction | null;
  readonly explanation: RuleExplanation | null;
  /** Eq the current selection costs (never partly used, 13.5d). */
  readonly cost: number;
}

/** One way an Engineer-Capable unit can build or improve in the chosen hex (13.8d, 15.2, 15.3). */
export interface BuildOption {
  readonly facility: 'AIR_STRIP' | 'AIR_BASE';
  readonly label: string;
  /** Tokens of supply it costs. */
  readonly cost: number;
  readonly action: GameAction;
  readonly explanation: RuleExplanation;
}

/** Air Base construction by the selected Engineer-Capable unit: where it can build, and the hex being planned. */
export interface ConstructionOverview {
  readonly engineerId: PieceId;
  /** Hexes within the unit's 2-hex radius where something can be built now. */
  readonly hexes: readonly string[];
  /** True while the player is planning: the hexes are highlighted and a click picks one. */
  readonly planning: boolean;
  readonly hexId: string | null;
  readonly options: readonly BuildOption[];
}

export interface AirOverview {
  /** Missions of the current segment; `available` when some aircraft has a legal target. */
  readonly missions: readonly { readonly mission: AirMissionKind; readonly label: string; readonly available: boolean }[];
  readonly draft: AirDraft | null;
  /** Hexes the planned mission can target (highlighted on the map). */
  readonly targetHexes: readonly string[];
  readonly refits: readonly AirRefit[];
  /** Planned Air Drops of combat units (14.10b). */
  readonly dropPlans: readonly DropPlanView[];
  readonly dropDraft: DropPlanDraft | null;
  /** The player has Transports or plans, so the Aircraft Refit Phase offers Drop Plans. */
  readonly dropPlanning: boolean;
  /** Eq counters of the player that can rebuild aircraft now (13.5f). */
  readonly rebuilds: readonly AirRebuild[];
  /** Construction offered to the selected Engineer-Capable unit, if any. */
  readonly construction: ConstructionOverview | null;
  readonly patrolZones: { readonly own: readonly string[]; readonly enemy: readonly string[] };
  readonly trainbusting: readonly { readonly hexId: string; readonly own: boolean }[];
  readonly showZones: boolean;
}

export interface SupplyNeed {
  readonly pieceId: PieceId;
  readonly options: readonly { readonly action: GameAction; readonly dumpId: PieceId }[];
}

export interface Arrival {
  readonly pieceId: PieceId;
  readonly entryHexIds: readonly string[];
}

/** A one-click rules action offered in the command deck (fuel, breakout, trucks, dumps...). */
export interface UnitAction {
  readonly key: string;
  readonly group: 'FUEL' | 'SUPPLY' | 'BREAKOUT' | 'BREAKDOWN' | 'TRANSPORT' | 'DUMP' | 'TRACE' | 'AIR';
  readonly label: string;
  readonly action: GameAction;
  /** Fuel payments: the units this payment would newly fuel, named with their hex. */
  readonly fuels?: readonly string[];
}

export interface EndStep {
  readonly enabled: boolean;
  readonly label: string;
  /** The step that nominally follows; steps without legal actions are passed automatically. */
  readonly next: string;
  readonly blockers: readonly string[];
}

/** A rule that stops the selected unit from moving now, as the engine reported it. */
export interface MoveBlocker {
  readonly code: string;
  readonly message: string;
  readonly rule: string;
}

/** Cost of reaching one Hex of the selected unit's range (6.1). */
export interface MoveRangeEntry {
  readonly path: readonly string[];
  readonly costTicks: number;
  readonly remainingAfterTicks: number;
  /** Entering stops the move (enemy ZOC for Truck units, "All" terrain, minimum move). */
  readonly endsMovement: boolean;
}

/** Why the screen must pass to the other player, phrased without the other player's private data. */
export interface HandoffInfo {
  readonly toSeatId: SeatId;
  readonly toLabel: string;
  readonly reason: string;
}

/** What happened while a seat was away from the screen. */
export interface AwayReport {
  readonly entries: readonly FeedEntry[];
  readonly combats: readonly CombatReport[];
}

/** Progress of the combat decision the viewer is answering. */
export interface CombatSheet {
  readonly role: 'ATTACKER' | 'DEFENDER';
  readonly steps: readonly { readonly label: string; readonly status: 'done' | 'current' | 'upcoming' }[];
  readonly answers: readonly string[];
}

export interface UiSnapshot {
  readonly scenario: ScenarioDefinition;
  readonly view: GameplayView;
  readonly bindings: readonly SeatBinding[];
  readonly families: readonly ActionFamily[];
  readonly selection: UiSelection;
  readonly selectedPiece: ProjectedPiece | null;
  /**
   * The selected unit has begun its move and may still continue it (6.1g). It is only let go by finishing
   * the move (Done), never by a plain deselect that would leave it half-moved.
   */
  readonly selectedIsMoving: boolean;
  /** Legal destinations of the selected unit, keyed by Hex, with the least-cost path. */
  readonly reachable: ReadonlyMap<string, readonly string[]>;
  readonly moveRange: ReadonlyMap<string, MoveRangeEntry>;
  /** Hexes where the overlay shows trace supply reaching (12.6); empty while the overlay is off. */
  readonly traceCoverage: ReadonlySet<string>;
  /**
   * The part of `traceCoverage` that traces straight to a Supply Source rather than through another HQ's throw;
   * for a selected HQ, where it can stand and still throw (12.3b).
   */
  readonly traceDirect: ReadonlySet<string>;
  /** The selected unit the overlay is drawn for; null when it shows where any friendly unit would trace. */
  readonly traceCoverageFor: string | null;
  readonly showTraceCoverage: boolean;
  /**
   * Why the selected own unit cannot begin or continue moving now (e.g. 12.5a fuel), so the deck can say so
   * instead of a bare "cannot move"; empty when it may move or no Movement Segment is open.
   */
  readonly moveBlockers: readonly MoveBlocker[];
  /** MP the selected unit has left this phase, in quarter-MP ticks; null when it cannot move. */
  readonly remainingTicks: number | null;
  readonly movePreview: MovePreview | null;
  /** Enemy Hexes the current segment allows attacking (overruns only for the selected unit). */
  readonly attackTargets: readonly string[];
  readonly barrageTargets: readonly string[];
  readonly draft: AttackDraft | null;
  readonly modeOptions: readonly { readonly mode: OcsMode; readonly action: GameAction }[];
  readonly releaseAction: GameAction | null;
  readonly arrivals: readonly Arrival[];
  readonly placementHexes: readonly string[];
  readonly supplyNeeds: readonly SupplyNeed[];
  /** Actions for the selected unit, dump, or truck. */
  readonly unitActions: readonly UnitAction[];
  /** SP the seat paid or moved this player turn, oldest first: what, from which dump or truck, and what that source holds now. */
  readonly ledger: readonly LedgerLine[];
  /** What the selected own truck can load and unload where it stands (13.2f); null when no truck is selected or it is not the Movement Segment. */
  readonly transportOptions: TransportOptions | null;
  /** Step-wide actions: internal stocks recovery, formation trace routes, breakout attempts. */
  readonly stepActions: readonly UnitAction[];
  /** Hexes the selected Extender may collapse to (9.14d). */
  readonly collapseHexes: readonly string[];
  readonly endStep: EndStep;
  readonly decision: PendingDecisionDescriptor | null;
  readonly decisionSeatId: SeatId | null;
  readonly decisionHexes: readonly string[];
  readonly history: readonly HistoryRecord[];
  readonly checkpoints: readonly CheckpointDescriptor[];
  readonly notice: string;
  readonly busy: boolean;
  readonly handoffPending: boolean;
  readonly requiredSeatId: SeatId | null;
  readonly air: AirOverview;
  readonly handoff: HandoffInfo | null;
  readonly feed: readonly FeedEntry[];
  readonly combatReports: readonly CombatReport[];
  /** Latest combat resolved by this seat's own action, until dismissed. */
  readonly resultCard: CombatReport | null;
  readonly awayReport: AwayReport | null;
  readonly phaseTrack: readonly TrackStep[];
  /** Own units that moved / attacked since the current phase began. */
  readonly movedThisPhase: ReadonlySet<string>;
  readonly attackedThisPhase: ReadonlySet<string>;
  /** Restores the automatic checkpoint taken when this step began (no dice rolled since). */
  readonly undoStep: { readonly label: string; /** ACTION takes back the last action only; STEP returns to the start of the step. */ readonly scope: 'ACTION' | 'STEP' } | null;
  readonly combatSheet: CombatSheet | null;
  /** The pending supply decision can be paid automatically from the largest dumps. */
  readonly autoPay: boolean;
  /** Display name of each formation of the viewer, by formation Definition ID. */
  readonly formationNames: ReadonlyMap<string, string>;
}

export type UiListener = (snapshot: UiSnapshot) => void;

export type { HexId };
