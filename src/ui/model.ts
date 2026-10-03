import type { HexId, PieceId } from '../core/index.js';
import type { OcsMode } from '../domain/piece/index.js';
import type { ScenarioDefinition } from '../domain/scenario/index.js';
import type {
  ActionFamily,
  AirMissionKind,
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
}

export interface AirOverview {
  /** Missions of the current segment; `available` when some aircraft has a legal target. */
  readonly missions: readonly { readonly mission: AirMissionKind; readonly label: string; readonly available: boolean }[];
  readonly draft: AirDraft | null;
  /** Hexes the planned mission can target (highlighted on the map). */
  readonly targetHexes: readonly string[];
  readonly refits: readonly AirRefit[];
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
}

export interface EndStep {
  readonly enabled: boolean;
  readonly label: string;
  /** The step that nominally follows; steps without legal actions are passed automatically. */
  readonly next: string;
  readonly blockers: readonly string[];
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
