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

/**
 * What a counter is used for, so the UI never has to guess it from field combinations. A supply counter is a
 * `DUMP` on the map and `CARGO` while a Transport Point carries it; a truck is an `EXTENDER` on its other face.
 */
export type PieceRole = 'COMBAT' | 'ARTILLERY' | 'HQ' | 'TRUCK' | 'EXTENDER' | 'DUMP' | 'CARGO' | 'AIRCRAFT' | 'AIR_BASE' | 'OTHER';

export interface ProjectedPiece {
  readonly role: PieceRole;
  /** Tokens a friendly truck carries (13.2f); null for anything else and for enemy counters. */
  readonly carriedTokens: number | null;
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
  /** The viewer's own unit that is still moving and may spend more MP (6.1g); null otherwise and for the opponent. */
  readonly currentMoverId: PieceId | null;
  readonly stacks: readonly ProjectedStack[];
  readonly pendingDecision: GameState['pendingDecision'];
  readonly victory: GameState['victory'];
  readonly combat: ProjectedCombat | null;
  readonly weather: GameState['weather'];
  readonly fuel: GameState['fuel'];
  readonly air: ProjectedAir;
}

/** Air facts both players can see: Trainbusting markers and Patrol Zones (Active Fighters are on top, 4.8e). */
export interface ProjectedAir {
  readonly trainbusting: GameState['air']['trainbusting'];
  readonly patrolZones: readonly { readonly playerId: PlayerId; readonly hexIds: readonly string[] }[];
}

/** 4.9c/d: an air mission reveals its aircraft, the Flak roll, and the result. */
export interface ProjectedAirMission {
  readonly mission: string;
  readonly target: string | null;
  readonly stage: string;
  readonly aircraftNames: readonly string[];
  readonly log: readonly string[];
}

/** Public facts of the combat or barrage in progress (4.9b/c); units are not identified. */
export interface ProjectedCombat {
  readonly kind: 'COMBAT' | 'OVERRUN' | 'BARRAGE' | 'AIR_MISSION';
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
  readonly air: ProjectedAirMission | null;
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
  /** Least-cost destinations of one own unit with their cost; facts carry `movement.remainingTicks`. */
  readonly queryMovementRange: (state: GameState, actorId: PlayerId, pieceId: PieceId) => RuleQueryResult<readonly import('../movement/movement.js').ReachableHex[]>;
  /** What one own Transport Point can load or unload in its Hex now: Token ranges, MP cost, and the rule behind anything not offered. */
  readonly queryTransportOptions: (state: GameState, actorId: PlayerId, truckId: PieceId) => RuleQueryResult<import('../supply/transport.js').TransportOptions | null>;
}
