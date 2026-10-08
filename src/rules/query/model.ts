import type { DefinitionId, HexId, PieceId, PlayerId, Revision } from '../../core/index.js';
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
export type PieceRole = 'COMBAT' | 'ARTILLERY' | 'HQ' | 'TRUCK' | 'EXTENDER' | 'DUMP' | 'CARGO' | 'AIRCRAFT' | 'AIR_BASE' | 'HEDGEHOG' | 'REPLACEMENT' | 'OTHER';

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
  /** The viewer's Breakdowns that reduced units will absorb when the phase ends (20.0d), with who may take each. */
  readonly breakdownAbsorptions: readonly { readonly breakdownId: PieceId; readonly absorberIds: readonly PieceId[] }[];
  readonly stacks: readonly ProjectedStack[];
  readonly pendingDecision: GameState['pendingDecision'];
  readonly victory: GameState['victory'];
  /**
   * Every objective with its VP and who controls its Hex now (null: neutral). Hex control is public, and this is live,
   * unlike `victory`, which is scored at Clean Up.
   */
  readonly objectives: readonly { readonly hexId: HexId; readonly points: number; readonly controllerId: PlayerId | null }[];
  readonly combat: ProjectedCombat | null;
  readonly weather: GameState['weather'];
  readonly fuel: GameState['fuel'];
  readonly air: ProjectedAir;
  readonly replacements: ProjectedReplacements;
}

/** The viewer's own ground rebuilds (13.5a-e); empty for the other player's data (4.9a). */
export interface ProjectedReplacements {
  readonly rebuilds: readonly ProjectedUnitRebuild[];
  /** 13.5e: truck points the viewer lost to enemy action and may rebuild with Eq. */
  readonly lostTruckPoints: number;
}

/** One hex of the viewer's Repls near an HQ that can rebuild: what they could bring back and what each step costs. */
export interface ProjectedUnitRebuild {
  readonly hexId: string;
  readonly hqId: PieceId;
  readonly pax: number;
  readonly eq: number;
  readonly units: readonly {
    readonly id: PieceId;
    readonly definitionId: DefinitionId;
    /** Rebuild Table cost per step. */
    readonly cost: 'PAX' | 'EQ';
    readonly missing: number;
    readonly deadPile: boolean;
    /** Voluntary modes a Dead Pile unit may be placed in (13.5b); empty for a reduced unit, which keeps its mode. */
    readonly modes: readonly string[];
  }[];
  readonly truckPoints: number;
}

/** Air facts both players can see: Trainbusting markers and Patrol Zones (Active Fighters are on top, 4.8e). */
export interface ProjectedAir {
  /** The viewer's Transports, loadable units and dumps at each Air Base they can fly from now (14.9). */
  readonly transport: readonly ProjectedTransportBase[];
  /** The viewer's Drop Plans (14.10b) and the earliest Game Turn a new one may name. */
  readonly dropPlans: readonly { readonly id: string; readonly unitIds: readonly PieceId[]; readonly hexId: string; readonly turn: number }[];
  readonly earliestDropTurn: number;
  readonly trainbusting: GameState['air']['trainbusting'];
  readonly patrolZones: readonly { readonly playerId: PlayerId; readonly hexIds: readonly string[] }[];
  /** The viewer's own Eq counters that can rebuild aircraft now (13.5f); empty for the other player's data. */
  readonly rebuilds: readonly ProjectedRebuild[];
  /** The viewer's own Air Bases and Air Strips: Level, Active aircraft against the limit (14.2a), and the refit ZOC bar (15.1C). */
  readonly bases: readonly ProjectedAirBase[];
}

export interface ProjectedAirBase {
  readonly id: PieceId;
  readonly hexId: string;
  /** 0 for an Air Strip. */
  readonly level: number;
  readonly active: number;
  readonly activeLimit: number;
  /** Aircraft it refits in one Aircraft Refit Phase (15.1B, 15.2B). */
  readonly refitCapacity: number;
  readonly inactive: number;
  /** In an un-negated enemy ZOC with no friendly combat unit: it cannot refit (15.1C). */
  readonly refitBlockedByZoc: boolean;
  /** A game-specific off-map airfield (its `hexId` is empty): no Active limit, refits every aircraft without SP. */
  readonly offMap: boolean;
}

/** What the viewer can load and fly from one Air Base: ready Transports, units in Move Mode that qualify, and dumps (14.9a, 14.9c). */
export interface ProjectedTransportBase {
  readonly hexId: string;
  readonly transports: readonly { readonly id: PieceId; readonly definitionId: DefinitionId; readonly capacity: number; readonly range: number; readonly integralGlider: boolean }[];
  readonly units: readonly { readonly id: PieceId; readonly definitionId: DefinitionId; readonly cost: number }[];
  readonly dumps: readonly { readonly id: PieceId; readonly tokens: number }[];
}

/** One Eq counter of the viewer: what it could rebuild, and where Dead Pile aircraft may arrive. */
export interface ProjectedRebuild {
  readonly eqPieceId: PieceId;
  readonly hqId: PieceId;
  readonly hexId: string;
  readonly equipment: number;
  readonly aircraft: readonly { readonly id: PieceId; readonly definitionId: DefinitionId; readonly steps: number; readonly deadPile: boolean }[];
  readonly baseIds: readonly PieceId[];
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
  /** The combat roll's net DRM: the AR difference less the defender's hedgehog Level (9.6, 16.0d). */
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
  /** Hexes where the actor's trace supply reaches: for the given unit (13.1d and 12.6f apply), or for any unit when null (12.6). */
  readonly queryTraceCoverage: (state: GameState, actorId: PlayerId, pieceId: PieceId | null) => RuleQueryResult<import('../supply/supply.js').TraceCoverage>;
  /** Where each of the actor's dumps can feed the given unit (any unit when null) out of trace (12.6c). */
  readonly queryFeedCoverage: (state: GameState, actorId: PlayerId, pieceId: PieceId | null) => RuleQueryResult<readonly import('../supply/supply.js').FeedSource[]>;
  /** The actor's Supply Sources (12.6a) with why each counts: map edge, detrainable rail Hex (13.3c) or Extender (12.7a). */
  readonly querySupplySources: (state: GameState, actorId: PlayerId) => RuleQueryResult<readonly import('../supply/supply.js').SupplySourceHex[]>;
  /** Control of every rail Hex from the actor's side: own, enemy or neutral (13.3h). */
  readonly queryRailControl: (state: GameState, actorId: PlayerId) => RuleQueryResult<readonly import('../supply/rail.js').RailControlHex[]>;
  /** Each fuel payment open to one own unit with the units it would newly fuel (12.5c). */
  readonly queryFuelPreview: (state: GameState, actorId: PlayerId, pieceId: PieceId) => RuleQueryResult<readonly import('../supply/fuel.js').FuelPreview[]>;
}
