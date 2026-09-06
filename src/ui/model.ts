import type { ScenarioDefinition } from '../domain/scenario/index.js';
import type {
  ActionFamily,
  GameAction,
  RuleExplanation,
} from '../rules/index.js';
import type {
  CheckpointDescriptor,
  GameplayView,
  HistoryRecord,
  SeatBinding,
  SeatId,
} from '../gameplay/index.js';

export interface UiSelection {
  readonly hexId: string | null;
  readonly pieceId: string | null;
  readonly actionKind: GameAction['kind'] | null;
  readonly candidateIndex: number;
}

export interface UiSnapshot {
  readonly scenario: ScenarioDefinition;
  readonly view: GameplayView;
  readonly bindings: readonly SeatBinding[];
  readonly families: readonly ActionFamily[];
  readonly candidates: readonly GameAction[];
  readonly candidatesTruncated: boolean;
  readonly selectedAction: GameAction | null;
  readonly explanation: RuleExplanation | null;
  readonly selection: UiSelection;
  readonly history: readonly HistoryRecord[];
  readonly checkpoints: readonly CheckpointDescriptor[];
  readonly notice: string;
  readonly busy: boolean;
  readonly handoffPending: boolean;
  readonly requiredSeatId: SeatId | null;
}

export type UiListener = (snapshot: UiSnapshot) => void;
