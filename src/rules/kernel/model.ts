import type {
  DefinitionId,
  HexId,
  PieceId,
  PlayerId,
  Revision,
  ScenarioId,
  SchemaVersion,
  ValidationIssue,
} from '../../core/index.js';
import type { MapBoxId, MapState } from '../../domain/map/index.js';
import type { OcsMode, PieceRuntimeState } from '../../domain/piece/index.js';
import type { ScenarioDefinition } from '../../domain/scenario/index.js';
import type { CombatLine } from '../tables/ocs-4.3.js';
import type { RuleActionId, RuleDecisionId, RuleTransactionId } from './ids.js';

export type { CombatLine } from '../tables/ocs-4.3.js';

export const RULE_PHASES = [
  'WEATHER', 'FIRST_PLAYER', 'AIRCRAFT_REFIT', 'REINFORCEMENT', 'MOVEMENT',
  'SUPPLY', 'REACTION', 'COMBAT', 'EXPLOITATION', 'CLEAN_UP', 'TURN_END', 'COMPLETE',
] as const;
export type RulePhase = (typeof RULE_PHASES)[number];

export type RuleSegment = 'NONE' | 'BREAKOUT' | 'MOVEMENT' | 'BARRAGE' | 'COMBAT';

export interface TurnSequenceState {
  readonly gameTurn: number;
  readonly playerTurnIndex: 0 | 1;
  readonly phase: RulePhase;
  readonly segment: RuleSegment;
  /** Player who took (or will take) the first Player Turn of this Game Turn (2.3). */
  readonly firstPlayerId: PlayerId;
  readonly phasingPlayerId: PlayerId;
  readonly actingPlayerId: PlayerId;
}

/**
 * One Terrain Effects Chart cell (6.2). `MP` is exact quarter-MP ticks, `ALL` requires the
 * unit's entire MA, `PROHIBITED` forbids entry (6.2c), and `OTHER_TERRAIN` defers to the
 * other terrain in the Hex (TEC "ot").
 */
export type MovementCost =
  | { readonly kind: 'MP'; readonly ticks: number }
  | { readonly kind: 'ALL' }
  | { readonly kind: 'PROHIBITED' }
  | { readonly kind: 'OTHER_TERRAIN' };

/** TEC costs per mobility type (3.1a). */
export interface MobilityMovementCosts {
  readonly leg: MovementCost;
  readonly truck: MovementCost;
  readonly tracked: MovementCost;
}

export type MobilityType = keyof MobilityMovementCosts;

/** Ground condition of the current Game Turn (17.0); DRY uses the normal TEC column. */
export type GroundCondition = 'DRY' | 'MUD' | 'SNOW';
export const GROUND_CONDITIONS: readonly GroundCondition[] = ['DRY', 'MUD', 'SNOW'];

/** TEC column used instead of the normal one under a bad ground condition (17.0a). */
export interface WeatherMovementCost {
  readonly condition: Exclude<GroundCondition, 'DRY'>;
  readonly costs: MobilityMovementCosts;
}

/** Hex cost for a terrain Definition or a printed Hex feature (for example a settlement). */
export interface TerrainMovementCost {
  readonly terrainDefinitionId: DefinitionId;
  readonly costs: MobilityMovementCosts;
  readonly weather: readonly WeatherMovementCost[];
}

/** Additive hexside cost (6.2b); `PROHIBITED` and `ALL` apply as for Hex terrain. */
export interface HexsideMovementCost {
  readonly featureDefinitionId: DefinitionId;
  readonly costs: MobilityMovementCosts;
  readonly weather: readonly WeatherMovementCost[];
}

/** Road-like hexside feature; crossing it pays this cost and ignores other terrain (6.2a). */
export interface RoadMovementCost {
  readonly featureDefinitionId: DefinitionId;
  readonly costs: MobilityMovementCosts;
  readonly weather: readonly WeatherMovementCost[];
}

/** Terrain Effects on Combat multiplier; `attackOnly` is the chart's bracketed "[x#]" (9.4d). */
export interface CombatMultiplier {
  readonly numerator: number;
  readonly denominator: number;
  readonly attackOnly: boolean;
}

/** Combat class of a unit (3.2a, 9.4). */
export type CombatClass = 'ARMOR' | 'MECH' | 'OTHER';

export interface ClassCombatMultipliers {
  readonly armor: CombatMultiplier;
  readonly mech: CombatMultiplier;
  readonly other: CombatMultiplier;
}

/** A Hex terrain row of the Terrain Effects on Combat chart. `line` null means "ot". */
export interface TerrainCombatEffect {
  readonly terrainDefinitionId: DefinitionId;
  readonly line: CombatLine | null;
  readonly multipliers: ClassCombatMultipliers;
}

/** A hexside row of the Terrain Effects on Combat chart; it can only modify attackers (9.4b). */
export interface HexsideCombatEffect {
  readonly featureDefinitionId: DefinitionId;
  readonly multipliers: ClassCombatMultipliers;
}

export interface ObjectiveDefinition {
  readonly hexId: HexId;
  readonly points: number;
}

/** One die range of a Weather Table row (17.0); 1-6 is "Auto". */
export interface WeatherGroundRange {
  readonly condition: GroundCondition;
  readonly minimum: number;
  readonly maximum: number;
}

/** A dated row of the game-specific Weather Table; days are inclusive. */
export interface WeatherTableRow {
  readonly month: number;
  readonly firstDay: number;
  readonly lastDay: number;
  readonly ground: readonly WeatherGroundRange[];
}

/**
 * Calendar and Weather Table (17.0). Game Turn N falls on the Nth date of `turnDays`, counted
 * from the start date and continuing into the following months.
 */
export interface WeatherConfiguration {
  readonly startMonth: number;
  readonly startDay: number;
  readonly turnDays: readonly number[];
  readonly table: readonly WeatherTableRow[];
}

/** One row of a Supply Table: SP by Supply Status column (index 0 is status 1). */
export interface SupplyTableRow {
  readonly minimum: number;
  readonly maximum: number;
  readonly points: readonly number[];
}

/** Supply Table rolled in each Reinforcement Phase (2.3), with the dump Definition that arrives. */
export interface SupplyArrivalConfiguration {
  readonly rows: readonly SupplyTableRow[];
  readonly players: readonly {
    readonly playerId: PlayerId;
    readonly status: number;
    readonly resourceDefinitionId: DefinitionId;
  }[];
}

export interface RuleConfiguration {
  readonly schemaVersion: SchemaVersion;
  readonly id: DefinitionId;
  readonly rulesVersion: string;
  readonly terrainMovementCosts: readonly TerrainMovementCost[];
  readonly hexsideMovementCosts: readonly HexsideMovementCost[];
  readonly roadMovementCosts: readonly RoadMovementCost[];
  readonly defaultTerrainCostTicks: number;
  readonly minimumMoveTicks: number;
  readonly terrainCombatEffects: readonly TerrainCombatEffect[];
  readonly hexsideCombatEffects: readonly HexsideCombatEffect[];
  readonly stackingLimitReTicks: number;
  /** Direct draw range (12.3a), in quarter-MP ticks of Truck movement: 5 MP. */
  readonly supplyDrawRangeTicks: number;
  /** Null when the game has no Weather Table: every turn is DRY. */
  readonly weather: WeatherConfiguration | null;
  /** Null when no SP arrive during play. */
  readonly supplyArrivals: SupplyArrivalConfiguration | null;
  /** Off-map Box holding each player's arriving SP and units returning from Breakout (12.8e, 13.6). */
  readonly reinforcementBoxes: readonly { readonly playerId: PlayerId; readonly boxId: MapBoxId }[];
  readonly turnLimit: number;
  readonly objectives: readonly ObjectiveDefinition[];
}

export interface RulesRngState {
  readonly state: number;
  readonly draws: number;
}

/** Per-phase ledger for one Piece. It is cleared whenever the phase changes (6.1b, 10.0e). */
export interface PieceUsageState {
  readonly pieceId: PieceId;
  readonly movementSpentTicks: number;
  readonly moved: boolean;
  /** Hex occupied when the phase began; overrunning units must share it (8.1). */
  readonly phaseStartHexId: HexId | null;
  readonly attacked: boolean;
  readonly barraged: boolean;
  readonly reserveReleased: boolean;
  /** Used to negate an enemy ZOC for another unit, so it may not spend MP this phase (4.5b). */
  readonly negationLocked: boolean;
  /** Paid on-map supply this Supply Phase ("eating off the map", 12.6c). */
  readonly supplyPaid: boolean;
  /** Fueled by the Single-Unit Method for this phase (12.5c C). */
  readonly fueled: boolean;
  /** Hex from which a fueled HQ throws fuel this phase (12.5e). */
  readonly fuelThrowHexId: HexId | null;
  /** Internal stocks recovery was paid this Supply Phase (12.10e). */
  readonly recovered: boolean;
  /** Attempted Breakout this segment (12.8e). */
  readonly breakoutAttempted: boolean;
  /** Dump blowing was attempted this phase (12.11a). */
  readonly blown: boolean;
  /** Tokens unloaded into this dump this phase, which cannot be loaded again (12.2a). */
  readonly unloadedTokens: number;
}

export interface ResourceReservation {
  readonly resourcePieceId: PieceId;
  readonly quantity: number;
  readonly unitDefinitionId: DefinitionId;
}

export type RuleTransactionKind = 'COMBAT' | 'OVERRUN' | 'BARRAGE' | 'AIR_MISSION';

/** Steps of 9.2 (combat) and 10.0 (barrage) that wait on a player. */
export type RuleTransactionStep =
  | 'ATTACKER_SUPPLY'
  | 'DEFENDER_SUPPLY'
  | 'DEFENDER_LEAD'
  | 'DEFENDER_TERRAIN'
  | 'BARRAGE_SUPPLY'
  | 'RESOLVING'
  /** An air mission runs its own sequence (14.2f); see `RuleTransaction.air`. */
  | 'AIR_MISSION';

export interface RulesDiceRoll {
  readonly dice: readonly [number, number];
  readonly total: number;
  readonly stateBefore: number;
  readonly stateAfter: number;
}

export type CombatSide = 'ATTACKER' | 'DEFENDER';

/** A consumer (one attacking unit, the defending Hex, or the barraging units) still to be paid for. */
export interface PaymentConsumer {
  readonly pieceIds: readonly PieceId[];
  readonly tokens: number;
}

/** Combat or barrage supply being paid consumer by consumer from dumps the owner picks (12.3a, 12.4). */
export interface PaymentProgress {
  readonly side: CombatSide;
  readonly queue: readonly PaymentConsumer[];
  /** Tokens already reserved for the first consumer in `queue`. */
  readonly paid: number;
}

/** Remaining work after the dice are rolled, processed in order (9.10–9.12, 10.0a). */
export type ResolutionStep =
  | { readonly kind: 'LOSS'; readonly side: CombatSide; readonly count: number; readonly distribution: 'COMBAT' | 'FREE'; readonly pieceIds: readonly PieceId[] }
  | { readonly kind: 'OPTION'; readonly side: CombatSide; readonly points: number }
  /** `pieceIds` are the units of this retreat still to move; retreats may split (9.12c). */
  | { readonly kind: 'RETREAT'; readonly side: CombatSide; readonly hexes: number; readonly pieceIds: readonly PieceId[] }
  | { readonly kind: 'EXPLOIT'; readonly rating: number }
  | { readonly kind: 'DEFENDER_DG' }
  | { readonly kind: 'ADVANCE' };

export interface LossLedgerEntry {
  readonly pieceId: PieceId;
  readonly steps: number;
}

/** Everything a combat or barrage needs between declaration and its final result. */
export interface RuleTransaction {
  readonly id: RuleTransactionId;
  readonly kind: RuleTransactionKind;
  readonly step: RuleTransactionStep;
  readonly ownerId: PlayerId;
  readonly defenderOwnerId: PlayerId;
  readonly originRevision: Revision;
  readonly attackerIds: readonly PieceId[];
  readonly defenderIds: readonly PieceId[];
  readonly targetHexId: HexId;
  readonly leadAttackerId: PieceId | null;
  readonly leadDefenderId: PieceId | null;
  readonly attackerPayments: readonly ResourceReservation[];
  readonly defenderPayments: readonly ResourceReservation[];
  /** Combat or barrage supply being paid now; null once every side has paid or withheld. */
  readonly payment: PaymentProgress | null;
  /** Attackers paying with internal stocks (12.10b). */
  readonly attackerInternalIds: readonly PieceId[];
  /** The defender paid on-map combat supply for the Hex (12.4). */
  readonly defenderSupplied: boolean;
  /** Defenders supplied from their own internal stocks (12.10). */
  readonly defenderInternalIds: readonly PieceId[];
  /** Hex terrain the defender chose for his stack, which also sets the Combat Table line (9.4c). */
  readonly defenderTerrainId: string | null;
  readonly surpriseRoll: RulesDiceRoll | null;
  readonly shiftDie: number | null;
  readonly roll: RulesDiceRoll | null;
  /** Table cell after all shifts: Combat Table "A/D" text, or a Barrage Table entry. */
  readonly result: string | null;
  readonly queue: readonly ResolutionStep[];
  readonly lossLedger: readonly LossLedgerEntry[];
  readonly attackerRetreated: boolean;
  /** Hexes that held enemy combat units when the combat began (9.12f). */
  readonly blockedHexIds: readonly HexId[];
  /** The air mission sequence (14.2f); null for ground combats and artillery barrages. */
  readonly air: AirMissionState | null;
}

/** 14.2e mission types implemented here; Air Transport and Air Drop (14.9, 14.10) are not. */
export type AirMissionKind = 'FIGHTER_SWEEP' | 'BARRAGE' | 'HIP_SHOOT' | 'TRAINBUSTING' | 'BASE_TRANSFER';

/** 10.0d: the general target announced for a barrage mission. */
export type AirBarrageTarget = 'COMBAT_UNITS' | 'AIR_BASE';

/** Where an air mission stands in the Air Mission Sequence (14.2f, steps C to G). */
export type AirMissionStage =
  | 'AIR_COMBAT'
  | 'INTERCEPTION'
  | 'FLAK'
  | 'RESOLVE'
  | 'TARGET_LOSS'
  | 'RETURN';

/** A mission aircraft and the Air Base it flew from (14.2d range, 14.7c short range). */
export interface MissionAircraft {
  readonly pieceId: PieceId;
  readonly baseHexId: HexId;
}

/** One Air Combat (14.3) in the mission hex, or an Interception (14.5). */
export interface AirCombatState {
  readonly context: 'MISSION_HEX' | 'INTERCEPTION';
  /** 14.3c: normally the player initiating the battle; roles switch when he has only parenthesized ratings. */
  readonly attackerId: PlayerId;
  /** Active aircraft of the mission player still fighting (mission aircraft and 14.4d non-mission aircraft). */
  readonly missionSideIds: readonly PieceId[];
  /** Active aircraft of the other player still fighting. */
  readonly opposingSideIds: readonly PieceId[];
  /** Players who still choose voluntary aborts before the first round (14.3d A). */
  readonly abortsPending: readonly PlayerId[];
  /** The attacker's aircraft for the current round, chosen before the defender picks (14.3e B). */
  readonly attackerPickId: PieceId | null;
  readonly round: number;
}

/** An aircraft that must return to a friendly Air Base after aborting or completing the mission (14.1c). */
export interface AirReturn {
  readonly pieceId: PieceId;
  /** Hex the aircraft returns from: the mission hex. */
  readonly fromHexId: HexId;
  /** 14.1c: aircraft aborting over a friendly Air Base must return to that base. */
  readonly requiredHexId: HexId | null;
  /** 14.11: a Fighter transferring within normal range stays Active. */
  readonly staysActive: boolean;
}

export interface AirMissionState {
  readonly mission: AirMissionKind;
  readonly target: AirBarrageTarget | null;
  readonly stage: AirMissionStage;
  /** Mission aircraft still on the mission, in mission-stack order (14.4f). */
  readonly aircraft: readonly MissionAircraft[];
  readonly combat: AirCombatState | null;
  /** The Fighter that intercepted this mission, if any (14.5). */
  readonly interceptorId: PieceId | null;
  readonly interceptionOffered: boolean;
  /** Modified Flak roll once rolled (14.4e). */
  readonly flakTotal: number | null;
  /** Barrage step losses still to be taken by the target's owner. */
  readonly targetLosses: number;
  readonly returns: readonly AirReturn[];
  /** Player-readable record of what happened, for the decision panel. */
  readonly log: readonly string[];
}

/** 14.8: a Trainbusting marker, removed in the next Clean Up Phase of its owner's enemy. */
export interface TrainbustingMarker {
  readonly hexId: HexId;
  readonly ownerId: PlayerId;
}

/** Air bookkeeping (14.0-15.0) that is not part of a Piece. The phase ledgers are cleared when the phase changes. */
export interface AirState {
  /** Aircraft that flew a mission this phase (14.2e: one mission per phase). */
  readonly missionFlownIds: readonly PieceId[];
  /** Air Bases that refit this phase (15.1A). */
  readonly refittedBaseIds: readonly PieceId[];
  /** Air Bases reduced this phase (15.4). */
  readonly reducedBaseIds: readonly PieceId[];
  readonly trainbusting: readonly TrainbustingMarker[];
}

export type PendingDecisionKind =
  | 'FIRST_PLAYER'
  | 'SUPPLY_SOURCE'
  | 'DEFENDER_LEAD'
  | 'DEFENDER_TERRAIN'
  | 'STEP_LOSS'
  | 'OPTION_SPLIT'
  | 'RETREAT_HEX'
  | 'ADVANCE_HEX'
  | 'DISPLACEMENT_HEX'
  | 'ATTRITION_LOSS'
  | 'OVERSTACK_ELIMINATION'
  | 'AIR_ABORT'
  | 'AIR_COMBAT_PICK'
  | 'INTERCEPTION'
  | 'MISSION_LOSS'
  | 'AIR_RETURN';

export const PENDING_DECISION_KINDS: readonly PendingDecisionKind[] = [
  'FIRST_PLAYER', 'SUPPLY_SOURCE', 'DEFENDER_LEAD', 'DEFENDER_TERRAIN', 'STEP_LOSS', 'OPTION_SPLIT',
  'RETREAT_HEX', 'ADVANCE_HEX', 'DISPLACEMENT_HEX', 'ATTRITION_LOSS', 'OVERSTACK_ELIMINATION',
  'AIR_ABORT', 'AIR_COMBAT_PICK', 'INTERCEPTION', 'MISSION_LOSS', 'AIR_RETURN',
];

/** Decisions that may exist outside a combat: sequence of play, attrition, and movement captures. */
export const SEQUENCE_DECISION_KINDS: readonly PendingDecisionKind[] = [
  'FIRST_PLAYER', 'OVERSTACK_ELIMINATION', 'ATTRITION_LOSS', 'DISPLACEMENT_HEX',
];

export interface PendingDecisionOption {
  readonly id: string;
  readonly label: string;
  /** Hex the option refers to, so it can also be chosen on the map. */
  readonly hexId: HexId | null;
}

export interface PendingDecision {
  readonly id: RuleDecisionId;
  readonly kind: PendingDecisionKind;
  readonly ownerId: PlayerId;
  /** Null for decisions that belong to the sequence of play rather than to a combat. */
  readonly transactionId: RuleTransactionId | null;
  readonly prompt: string;
  readonly options: readonly PendingDecisionOption[];
}

export interface VictoryState {
  readonly scores: readonly { readonly playerId: PlayerId; readonly points: number }[];
  readonly winnerId: PlayerId | null;
  readonly reason: 'TURN_LIMIT' | 'OBJECTIVES' | null;
}

/** Hexes already attacked in the current Combat Segment and barraged in the current phase. */
export interface SegmentLedger {
  readonly attackedHexIds: readonly HexId[];
  readonly barragedHexIds: readonly HexId[];
}

/** Current weather (17.0) and the calendar date of the Game Turn. */
export interface WeatherState {
  readonly groundCondition: GroundCondition;
  readonly month: number | null;
  readonly day: number | null;
  readonly roll: number | null;
}

/** Fuel paid by the Formation Method (12.5c A); it lasts until the owner's Clean Up. */
export interface FormationFuel {
  readonly playerId: PlayerId;
  readonly formationId: DefinitionId;
  /** Units that could draw from the common source when the fuel was paid. */
  readonly coveredPieceIds: readonly PieceId[];
}

export interface FuelState {
  readonly formations: readonly FormationFuel[];
  /** HQs fueled by the HQ Method (12.5c B), until the owner's Clean Up. */
  readonly hqIds: readonly PieceId[];
}

/** Work that interrupts play until its owner decides: attrition losses or truck displacement. */
export type RuleInterrupt =
  | { readonly kind: 'ATTRITION'; readonly ownerId: PlayerId; readonly hexId: HexId; readonly steps: number; readonly pieceIds: readonly PieceId[] }
  /**
   * Transport Points displaced by capture (9.14c, `range` Hexes) or an Extender collapsing to a Hex
   * in trace supply within its range (9.14d, `range` Truck MP ticks).
   */
  | { readonly kind: 'DISPLACEMENT'; readonly reason: 'CAPTURE' | 'EXTENDER_COLLAPSE'; readonly ownerId: PlayerId; readonly fromHexId: HexId; readonly pieceIds: readonly PieceId[]; readonly range: number }
  /** 9.14f: aircraft at a captured Air Base displace to a friendly Air Base within twice their range. */
  | { readonly kind: 'AIR_DISPLACEMENT'; readonly ownerId: PlayerId; readonly fromHexId: HexId; readonly pieceIds: readonly PieceId[] };

/** A multi-unit formation's common trace route for the current Supply Phase (12.6f, 13.7a). */
export interface FormationTraceChoice {
  readonly formationId: DefinitionId;
  readonly routeKey: string;
}

export interface GameState {
  readonly schemaVersion: SchemaVersion;
  readonly revision: Revision;
  readonly scenarioId: ScenarioId;
  readonly scenario: ScenarioDefinition;
  readonly configuration: RuleConfiguration;
  readonly sequence: TurnSequenceState;
  readonly mapState: MapState;
  readonly pieceState: PieceRuntimeState;
  readonly usage: readonly PieceUsageState[];
  readonly ledger: SegmentLedger;
  /** The unit (or overrunning stack leader) whose movement is in progress (6.1g). */
  readonly currentMoverId: PieceId | null;
  readonly rng: RulesRngState;
  readonly activeTransaction: RuleTransaction | null;
  readonly pendingDecision: PendingDecision | null;
  readonly weather: WeatherState;
  readonly fuel: FuelState;
  readonly interrupts: readonly RuleInterrupt[];
  readonly formationTraces: readonly FormationTraceChoice[];
  readonly victory: VictoryState;
  readonly air: AirState;
}

interface ActionEnvelope {
  readonly actionId: RuleActionId;
  readonly actorId: PlayerId;
  readonly expectedRevision: Revision;
}

export type GameAction =
  | (ActionEnvelope & { readonly kind: 'ADVANCE_SEQUENCE' })
  | (ActionEnvelope & { readonly kind: 'CHANGE_MODE'; readonly pieceId: PieceId; readonly mode: OcsMode })
  | (ActionEnvelope & { readonly kind: 'RELEASE_RESERVE'; readonly pieceId: PieceId })
  | (ActionEnvelope & { readonly kind: 'MOVE_PIECE'; readonly pieceId: PieceId; readonly path: readonly HexId[] })
  /** Declare the current mover finished (6.1g) without starting another unit; its unspent MP are lost for the phase. */
  | (ActionEnvelope & { readonly kind: 'END_MOVE'; readonly pieceId: PieceId })
  /** Detach the next numbered Breakdown ("1/101.Abn") from a multi-step unit as it begins to move (20.0, 20.0a). */
  | (ActionEnvelope & { readonly kind: 'CREATE_BREAKDOWN'; readonly pieceId: PieceId })
  | (ActionEnvelope & { readonly kind: 'CHECK_SUPPLY'; readonly pieceIds: readonly PieceId[]; readonly sourcePieceId: PieceId | null })
  | (ActionEnvelope & {
    readonly kind: 'DECLARE_COMBAT';
    readonly combatKind: 'REGULAR' | 'OVERRUN';
    readonly attackerIds: readonly PieceId[];
    /** Every enemy combat unit in the target Hex (9.1d). */
    readonly defenderIds: readonly PieceId[];
    readonly targetHexId: HexId;
    /** Attacking unit whose Action Rating leads the combat (9.6). */
    readonly leadAttackerId: PieceId;
  })
  | (ActionEnvelope & {
    readonly kind: 'DECLARE_BARRAGE';
    readonly firerIds: readonly PieceId[];
    readonly targetPieceIds: readonly PieceId[];
    readonly targetHexId: HexId;
  })
  | (ActionEnvelope & { readonly kind: 'RESPOND_DECISION'; readonly decisionId: RuleDecisionId; readonly choiceId: string })
  | (ActionEnvelope & { readonly kind: 'COMMIT_TRANSACTION'; readonly transactionId: RuleTransactionId })
  | (ActionEnvelope & { readonly kind: 'CANCEL_TRANSACTION'; readonly transactionId: RuleTransactionId })
  | (ActionEnvelope & { readonly kind: 'PLACE_REINFORCEMENT'; readonly pieceId: PieceId; readonly hexId: HexId })
  | (ActionEnvelope & { readonly kind: 'PAY_FUEL'; readonly method: FuelMethod; readonly pieceId: PieceId; readonly sourcePieceId: PieceId })
  | (ActionEnvelope & { readonly kind: 'RECOVER_INTERNALS'; readonly pieceId: PieceId; readonly sourcePieceIds: readonly PieceId[] })
  | (ActionEnvelope & { readonly kind: 'CHOOSE_FORMATION_TRACE'; readonly formationId: DefinitionId; readonly routeKey: string })
  | (ActionEnvelope & { readonly kind: 'ATTEMPT_BREAKOUT'; readonly pieceId: PieceId })
  | (ActionEnvelope & { readonly kind: 'BLOW_DUMP'; readonly dumpId: PieceId; readonly tokens: number })
  | (ActionEnvelope & { readonly kind: 'LOAD_SUPPLY'; readonly truckId: PieceId; readonly dumpId: PieceId; readonly tokens: number })
  | (ActionEnvelope & { readonly kind: 'UNLOAD_SUPPLY'; readonly truckId: PieceId; readonly tokens: number })
  | (ActionEnvelope & { readonly kind: 'COMBINE_TRANSPORT'; readonly truckIds: readonly PieceId[] })
  | (ActionEnvelope & { readonly kind: 'DIVIDE_TRANSPORT'; readonly truckId: PieceId; readonly points: number })
  | (ActionEnvelope & { readonly kind: 'FORM_EXTENDER'; readonly truckId: PieceId })
  | (ActionEnvelope & { readonly kind: 'DISSOLVE_EXTENDER'; readonly extenderId: PieceId })
  | (ActionEnvelope & { readonly kind: 'COLLAPSE_EXTENDER'; readonly extenderId: PieceId; readonly hexId: HexId })
  /** 15.1: refit Inactive aircraft at one Air Base for 1T drawn or thrown to the base. */
  | (ActionEnvelope & { readonly kind: 'REFIT_AIRCRAFT'; readonly baseId: PieceId; readonly aircraftIds: readonly PieceId[]; readonly sourcePieceId: PieceId })
  /** 14.2f A-B: declare a mission and fly up to four Active aircraft to the mission hex. */
  | (ActionEnvelope & {
    readonly kind: 'DECLARE_AIR_MISSION';
    readonly mission: AirMissionKind;
    readonly aircraftIds: readonly PieceId[];
    readonly targetHexId: HexId;
    /** 10.0d: required for BARRAGE and HIP_SHOOT, null otherwise. */
    readonly target: AirBarrageTarget | null;
  })
  /** 15.4: one RE of Combat Mode units that do not move reduces a friendly Air Base one Level. */
  | (ActionEnvelope & { readonly kind: 'REDUCE_AIR_BASE'; readonly baseId: PieceId; readonly pieceIds: readonly PieceId[] })
  /** 13.9-4: two reduced aircraft of the same type, values and status in one hex combine into one full-strength aircraft. */
  | (ActionEnvelope & { readonly kind: 'COMBINE_AIRCRAFT'; readonly aircraftIds: readonly PieceId[] });

/** 12.5c: Formation Method (1 SP), HQ Method (1 SP), or Single-Unit Method (1T). */
export type FuelMethod = 'FORMATION' | 'HQ' | 'SINGLE_UNIT';

/** Internal stocks marker under a unit (12.10); FULL means no marker. */
export type InternalStocksLevel = 'FULL' | 'LOW' | 'EXHAUSTED';

export type RuleEvent =
  | { readonly kind: 'SEQUENCE_ADVANCED'; readonly sequence: number; readonly from: TurnSequenceState; readonly to: TurnSequenceState }
  | { readonly kind: 'FIRST_PLAYER_ROLLED'; readonly sequence: number; readonly rolls: readonly { readonly playerId: PlayerId; readonly total: number }[]; readonly winnerId: PlayerId }
  | { readonly kind: 'MODE_CHANGED'; readonly sequence: number; readonly pieceId: PieceId; readonly from: OcsMode | null; readonly to: OcsMode }
  | { readonly kind: 'PIECE_MOVED'; readonly sequence: number; readonly pieceId: PieceId; readonly path: readonly HexId[]; readonly spentTicks: number }
  | { readonly kind: 'MOVE_ENDED'; readonly sequence: number; readonly pieceId: PieceId }
  | { readonly kind: 'BREAKDOWN_CREATED'; readonly sequence: number; readonly pieceId: PieceId; readonly breakdownId: PieceId; readonly name: string }
  /** 20.0d: `pieceId` absorbed the Breakdown at the end of a phase and regained a step. */
  | { readonly kind: 'BREAKDOWN_ABSORBED'; readonly sequence: number; readonly pieceId: PieceId; readonly breakdownId: PieceId; readonly name: string }
  | { readonly kind: 'SUPPLY_STATUS_CHANGED'; readonly sequence: number; readonly pieceId: PieceId; readonly inSupply: boolean }
  | { readonly kind: 'SUPPLY_SPENT'; readonly sequence: number; readonly resourcePieceId: PieceId; readonly quantity: number }
  | { readonly kind: 'SUPPLY_CAPTURED'; readonly sequence: number; readonly resourcePieceId: PieceId; readonly captured: number; readonly destroyed: number }
  | { readonly kind: 'TRANSACTION_DECLARED'; readonly sequence: number; readonly transactionId: RuleTransactionId; readonly transactionKind: RuleTransactionKind }
  | { readonly kind: 'DECISION_REQUESTED'; readonly sequence: number; readonly decision: PendingDecision }
  | { readonly kind: 'RESOURCE_RESERVED'; readonly sequence: number; readonly transactionId: RuleTransactionId; readonly reservation: ResourceReservation }
  | { readonly kind: 'RESOURCE_CONSUMED'; readonly sequence: number; readonly transactionId: RuleTransactionId; readonly reservation: ResourceReservation }
  | { readonly kind: 'DICE_ROLLED'; readonly sequence: number; readonly transactionId: RuleTransactionId; readonly purpose: string; readonly roll: RulesDiceRoll }
  | { readonly kind: 'TRANSACTION_RESOLVED'; readonly sequence: number; readonly transactionId: RuleTransactionId; readonly result: string }
  | { readonly kind: 'TRANSACTION_CANCELLED'; readonly sequence: number; readonly transactionId: RuleTransactionId }
  | { readonly kind: 'STEP_LOST'; readonly sequence: number; readonly pieceId: PieceId; readonly remainingSteps: number | null }
  | { readonly kind: 'PIECE_RETREATED'; readonly sequence: number; readonly pieceId: PieceId; readonly toHexId: HexId }
  | { readonly kind: 'PIECE_ADVANCED'; readonly sequence: number; readonly pieceId: PieceId; readonly toHexId: HexId }
  | { readonly kind: 'REINFORCEMENT_PLACED'; readonly sequence: number; readonly pieceId: PieceId; readonly hexId: HexId }
  | { readonly kind: 'CLEANUP_COMPLETED'; readonly sequence: number; readonly playerId: PlayerId }
  | { readonly kind: 'VICTORY_RECORDED'; readonly sequence: number; readonly winnerId: PlayerId | null; readonly reason: string }
  | { readonly kind: 'WEATHER_DETERMINED'; readonly sequence: number; readonly groundCondition: GroundCondition; readonly roll: number | null }
  | { readonly kind: 'FUEL_PAID'; readonly sequence: number; readonly method: FuelMethod; readonly pieceId: PieceId; readonly resourcePieceId: PieceId; readonly tokens: number }
  | { readonly kind: 'INTERNAL_STOCKS_CHANGED'; readonly sequence: number; readonly pieceId: PieceId; readonly level: InternalStocksLevel }
  | { readonly kind: 'ATTRITION_ROLLED'; readonly sequence: number; readonly hexId: HexId; readonly total: number; readonly steps: number }
  | { readonly kind: 'BREAKOUT_ROLLED'; readonly sequence: number; readonly pieceId: PieceId; readonly roll: number; readonly succeeded: boolean; readonly returnTurn: number | null }
  | { readonly kind: 'SUPPLY_ARRIVED'; readonly sequence: number; readonly playerId: PlayerId; readonly pieceId: PieceId; readonly tokens: number; readonly roll: number }
  | { readonly kind: 'DUMP_BLOWN'; readonly sequence: number; readonly resourcePieceId: PieceId; readonly destroyed: number }
  | { readonly kind: 'SUPPLY_TRANSFERRED'; readonly sequence: number; readonly truckId: PieceId; readonly tokens: number; readonly loaded: boolean }
  | { readonly kind: 'TRANSPORT_REORGANIZED'; readonly sequence: number; readonly pieceIds: readonly PieceId[] }
  | { readonly kind: 'PIECE_DISPLACED'; readonly sequence: number; readonly pieceId: PieceId; readonly toHexId: HexId | null }
  | { readonly kind: 'AIRCRAFT_STATUS_CHANGED'; readonly sequence: number; readonly pieceId: PieceId; readonly active: boolean; readonly hexId: HexId | null }
  | { readonly kind: 'AIR_COMBAT_ROUND'; readonly sequence: number; readonly attackerPieceId: PieceId; readonly defenderPieceId: PieceId; readonly modifiedRoll: number; readonly result: string; readonly lossDie: number }
  | { readonly kind: 'FLAK_ROLLED'; readonly sequence: number; readonly modifiedRoll: number; readonly hit: boolean }
  | { readonly kind: 'AIR_BASE_LEVEL_CHANGED'; readonly sequence: number; readonly pieceId: PieceId; readonly level: number }
  | { readonly kind: 'TRAINBUSTING_CHANGED'; readonly sequence: number; readonly hexId: HexId; readonly ownerId: PlayerId; readonly placed: boolean };

export interface RuleViolation {
  readonly code: string;
  readonly path: readonly (string | number)[];
  readonly message: string;
  readonly rule: string;
}

export interface ActionValidation {
  readonly allowed: boolean;
  readonly violations: readonly RuleViolation[];
}

export type TransitionResult =
  | { readonly ok: true; readonly state: GameState; readonly events: readonly RuleEvent[] }
  | { readonly ok: false; readonly state: GameState; readonly events: readonly []; readonly violations: readonly RuleViolation[] };

export interface GameStateValidation {
  readonly issues: readonly ValidationIssue[];
}
