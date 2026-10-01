import type { HexId, PieceId } from '../core/index.js';
import type { OcsMode } from '../domain/piece/index.js';
import type { ScenarioDefinition } from '../domain/scenario/index.js';
import type {
  ActionFamily,
  GameAction,
  ProjectedPiece,
  RuleExplanation,
} from '../rules/index.js';
import type {
  CheckpointDescriptor,
  GameplayView,
  HistoryRecord,
  PendingDecisionDescriptor,
  SeatBinding,
  SeatId,
} from '../gameplay/index.js';

export interface UiSelection {
  readonly hexId: string | null;
  readonly pieceId: string | null;
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
  readonly group: 'FUEL' | 'SUPPLY' | 'BREAKOUT' | 'TRANSPORT' | 'DUMP' | 'TRACE';
  readonly label: string;
  readonly action: GameAction;
}

export interface EndStep {
  readonly enabled: boolean;
  readonly label: string;
  readonly blockers: readonly string[];
}

export interface UiSnapshot {
  readonly scenario: ScenarioDefinition;
  readonly view: GameplayView;
  readonly bindings: readonly SeatBinding[];
  readonly families: readonly ActionFamily[];
  readonly selection: UiSelection;
  readonly selectedPiece: ProjectedPiece | null;
  /** Legal destinations of the selected unit, keyed by Hex, with the least-cost path. */
  readonly reachable: ReadonlyMap<string, readonly string[]>;
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
}

export type UiListener = (snapshot: UiSnapshot) => void;

export type { HexId };
