import type { DefinitionId, PieceId, PlayerId, Revision } from '../../core/index.js';
import type { PieceLocation } from '../../domain/map/index.js';
import type { OcsMode } from '../../domain/piece/index.js';
import type { GameAction, GameState, RuleViolation } from '../kernel/model.js';

export interface RuleReason {
  readonly code: string;
  readonly allowed: boolean;
  readonly message: string;
  readonly rule: string;
}

export interface RuleFact {
  readonly key: string;
  readonly value: string | number | boolean;
  readonly visibility: 'PUBLIC' | 'OWNER_ONLY';
  readonly ownerId: PlayerId | null;
}

export interface StateDependency {
  readonly aggregate: 'GAME' | 'MAP' | 'PIECE';
  readonly revision: Revision;
  readonly key: string;
}

export interface RuleQueryResult<T> {
  readonly allowed: boolean;
  readonly value: T | null;
  readonly reasons: readonly RuleReason[];
  readonly facts: readonly RuleFact[];
  readonly dependencies: readonly StateDependency[];
}

export interface RuleExplanation {
  readonly allowed: boolean;
  readonly actionKind: GameAction['kind'];
  readonly reasons: readonly RuleReason[];
  readonly facts: readonly RuleFact[];
  readonly citations: readonly string[];
}

export interface ProjectedPiece {
  readonly currentFaceId: import('../../domain/piece/index.js').FaceId | null;
  readonly resourceQuantity: number | null;
  readonly id: PieceId;
  readonly ownerId: PlayerId;
  readonly definitionId: DefinitionId;
  readonly location: PieceLocation;
  readonly mode: OcsMode | null;
  readonly remainingSteps: number | null;
  readonly statuses: readonly string[];
  /** Values of TEXT and INTEGER statuses (internal stocks level, truck size); empty for enemy units. */
  readonly statusValues: readonly { readonly statusDefinitionId: DefinitionId; readonly value: string | number }[];
  readonly redacted: boolean;
}

export interface ProjectedStack {
  readonly location: PieceLocation;
  readonly pieces: readonly ProjectedPiece[];
  readonly hiddenCount: number;
}

export interface RuleProjection {
  readonly stateRevision: Revision;
  readonly viewerId: PlayerId;
  readonly sequence: GameState['sequence'];
  readonly stacks: readonly ProjectedStack[];
  readonly pendingDecision: GameState['pendingDecision'];
  readonly victory: GameState['victory'];
  readonly combat: ProjectedCombat | null;
  readonly weather: GameState['weather'];
  readonly fuel: GameState['fuel'];
}

/** Public facts of the combat or barrage in progress (4.9b/c); units are not identified. */
export interface ProjectedCombat {
  readonly kind: 'COMBAT' | 'OVERRUN' | 'BARRAGE';
  readonly targetHexId: string;
  readonly attackerOwnerId: PlayerId;
  readonly attackerCount: number;
  readonly defenderCount: number;
  readonly attackerStrength: number;
  readonly defenderStrength: number | null;
  readonly odds: string;
  readonly line: string | null;
  readonly drm: number | null;
  readonly defenderSupplied: boolean | null;
  readonly result: string | null;
  readonly rollTotal: number | null;
  readonly surpriseTotal: number | null;
  readonly shiftDie: number | null;
}

export interface ActionFamily {
  readonly kind: GameAction['kind'];
  readonly enabled: boolean;
}

export interface CandidateRequest {
  readonly actorId: PlayerId;
  readonly kind: GameAction['kind'];
  readonly pieceId: PieceId | null;
  readonly budget: number;
}

export interface CandidateResult {
  readonly actions: readonly GameAction[];
  readonly truncated: boolean;
  readonly reasons: readonly RuleReason[];
}

export interface RuleEngine {
  readonly getActionFamilies: (state: GameState, actorId: PlayerId) => readonly ActionFamily[];
  readonly getActionCandidates: (state: GameState, request: CandidateRequest) => CandidateResult;
  readonly validateAction: (state: GameState, action: GameAction) => { readonly allowed: boolean; readonly violations: readonly RuleViolation[] };
  readonly applyAction: (state: GameState, action: GameAction) => import('../kernel/model.js').TransitionResult;
  readonly explain: (state: GameState, action: GameAction) => RuleExplanation;
  readonly projectForViewer: (state: GameState, viewerId: PlayerId) => RuleProjection;
}
