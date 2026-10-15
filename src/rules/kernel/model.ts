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

/**
 * A game-specific victory condition for an attack: the attacker wins by holding at least `attackerPoints` objective VP
 * when the game ends; otherwise the other player wins. There is no draw.
 */
export interface AttackVictoryCondition {
  readonly attackerId: PlayerId;
  readonly attackerPoints: number;
}

/** One die range of a Weather Table row (17.0); 1-6 is "Auto". */
export interface WeatherGroundRange {
  readonly condition: GroundCondition;
  readonly minimum: number;
  readonly maximum: number;
}

/**
 * Flight Conditions of a Game Turn (14.1f, game-specific Weather Table). Normal allows air missions in
 * every phase; Limited only in the flying player's Regular Movement Phase; None allows no mission.
 */
export type FlightCondition = 'NORMAL' | 'LIMITED' | 'NONE';

/** One 2d6 range of a Weather Table row's Flight Conditions. */
export interface WeatherFlightRange {
  readonly condition: FlightCondition;
  readonly minimum: number;
  readonly maximum: number;
}

/**
 * A dated row of the game-specific Weather Table; days are inclusive. A row without `flight` rolls no
 * Flight Conditions and the turn is Normal (tables, and saves, made before Flight Conditions).
 */
export interface WeatherTableRow {
  readonly month: number;
  readonly firstDay: number;
  readonly lastDay: number;
  readonly ground: readonly WeatherGroundRange[];
  readonly flight?: readonly WeatherFlightRange[] | undefined;
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

/** 13.5: one row of a Variable Replacement Table: the Pax and Eq a 2d6 total brings. */
export interface ReplacementTableRow {
  readonly minimum: number;
  readonly maximum: number;
  readonly pax: number;
  readonly eq: number;
}

/** 13.5: each player's Variable Replacement Table, rolled in every friendly Reinforcement Phase. */
export interface ReplacementArrivalConfiguration {
  readonly players: readonly { readonly playerId: PlayerId; readonly rows: readonly ReplacementTableRow[] }[];
}

/**
 * 13.5a, 13.5d: one row of a Rebuild Table. A row prices each step of the units it lists in Pax and Eq; a `pairs` row lists
 * very small one-step units that are rebuilt two for the row's cost (one unit alone still pays it in full).
 */
export interface RebuildTableRow {
  readonly id: string;
  readonly label: string;
  readonly pax: number;
  readonly eq: number;
  readonly pairs: boolean;
  readonly definitionIds: readonly DefinitionId[];
}

/** 13.5a: each player's Rebuild Table. A unit no row lists cannot be rebuilt. */
export interface RebuildTableConfiguration {
  readonly players: readonly { readonly playerId: PlayerId; readonly rows: readonly RebuildTableRow[] }[];
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

/** One railroad hexside feature (13.3); multi-track lines halve Rail Cap costs (13.3a). */
export interface RailLineDefinition {
  readonly featureDefinitionId: DefinitionId;
  readonly multiTrack: boolean;
}

/**
 * The game's railroads (13.3). Railroad hexsides are also roads for movement (6.2a), so their MP
 * cost belongs in `roadMovementCosts`; this block gives them their rail meaning for trace supply.
 */
export interface RailroadConfiguration {
  readonly lines: readonly RailLineDefinition[];
  /** Hex features that make a rail hex detrainable (13.3c): villages, cities of any size, ports. */
  readonly detrainableFeatureDefinitionIds: readonly DefinitionId[];
}

/**
 * The game's river hexside features, for Bridging (13.8b). Their MP costs stay in `hexsideMovementCosts`; this block
 * says which are Minor and which are Major so an Engineer-Capable unit can downgrade them.
 */
export interface RiverConfiguration {
  /** Minor Rivers (and canals): bridged, they cost no additional MP. */
  readonly minorFeatureDefinitionIds: readonly DefinitionId[];
  /** Major Rivers: bridged, they cost what the first Minor River costs. */
  readonly majorFeatureDefinitionIds: readonly DefinitionId[];
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
  /** Absent: the player holding the most objective VP wins and equal VP is a draw (and in saves made before attacks existed). */
  readonly attackVictory?: AttackVictoryCondition | undefined;
  /** Absent when the game has no railroads (and in saves made before railroads existed). */
  readonly railroads?: RailroadConfiguration | undefined;
  /** 13.3b: Rail Cap points each player gets in every friendly Movement Phase. Absent: nobody moves cargo by rail. */
  readonly railCapacity?: readonly RailCapacity[] | undefined;
  /** Absent when nobody can bridge (and in saves made before Bridging existed, 13.8b). */
  readonly rivers?: RiverConfiguration | undefined;
  /** 19.0f: Sea Cap (Shipping Allowance) points each player gets in every friendly Movement Phase. Absent: nobody ships. */
  readonly seaCapacity?: readonly RailCapacity[] | undefined;
  /**
   * Players whose reinforcements, SP, Repls and returning units reach the map only by sea (game-specific rule of a map
   * on which they have no inland entry Hexes): they wait in the reinforcement Box until shipped to a friendly port (19.0f).
   */
  readonly seaArrivals?: readonly PlayerId[] | undefined;
  /**
   * 13.5: Variable Replacement Tables. Absent (games saved before the table existed): each side receives the fixed
   * allotment its replacement Definitions state.
   */
  readonly replacementArrivals?: ReplacementArrivalConfiguration | undefined;
  /**
   * 13.5a: Rebuild Tables. Absent (games saved before the table existed): each step of an Armor, Mech or artillery unit
   * costs 1 Eq and each step of any other rebuildable unit 1 Pax.
   */
  readonly rebuildTables?: RebuildTableConfiguration | undefined;
}

export interface RailCapacity {
  readonly playerId: PlayerId;
  readonly points: number;
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
  /** Carried by air this phase: the unit may spend no more than half its MA in all (4.7d, 14.9d). */
  readonly airCarried?: boolean | undefined;
  /** Moved by rail this phase: the unit may not move again or use another transport (13.3e, 4.7d). */
  readonly railCarried?: boolean | undefined;
  /**
   * Hex an Engineer-Capable unit stopped being Engineer-Capable in by changing mode this phase: it may still use its
   * own bridge to leave that hex (13.8b Exception).
   */
  readonly ownBridgeHexId?: HexId | undefined;
  /** Shipped this phase: no movement before or after, and no other transport (19.0f C, 4.7d). */
  readonly seaCarried?: boolean | undefined;
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
export type AirMissionKind = 'FIGHTER_SWEEP' | 'BARRAGE' | 'HIP_SHOOT' | 'TRAINBUSTING' | 'BASE_TRANSFER' | 'AIR_TRANSPORT' | 'AIR_DROP';

/**
 * 14.9e: how a Transport flies, treating each plane separately. DOUBLE flies at twice its range and ends Inactive at the
 * destination Air Base; NORMAL at its range, returning to any base within it; HALF at half its range with doubled capacity,
 * returning within half its range. NORMAL and HALF may also end Inactive at the destination (14.9f: "Transports in excess of
 * the unloading limit become Inactive in the destination hex").
 */
export type AirRoute = 'DOUBLE' | 'NORMAL' | 'NORMAL_STAY' | 'HALF' | 'HALF_STAY';
export const AIR_ROUTES: readonly AirRoute[] = ['DOUBLE', 'NORMAL', 'NORMAL_STAY', 'HALF', 'HALF_STAY'];

/** What an Air Transport or Air Drop carries and how each carrying plane flies (14.9, 14.10). */
export interface AirCargoDeclaration {
  /** The Air Base the cargo is loaded at; the carrying planes are the mission aircraft based there. */
  readonly baseHexId: HexId;
  readonly unitIds: readonly PieceId[];
  /** Tokens loaded from dumps in the base hex. */
  readonly supply: readonly { readonly sourcePieceId: PieceId; readonly tokens: number }[];
  readonly routes: readonly { readonly pieceId: PieceId; readonly route: AirRoute }[];
}

export interface AirCargoState extends AirCargoDeclaration {
  /** How an Air Drop lands: by parachute, or by glider when every carrier has an integral glider (14.10e, 14.10f). Null for an Air Transport. */
  readonly drop: 'PARACHUTE' | 'GLIDER' | null;
}

/** 10.0d: the general target announced for a barrage mission. */
export type AirBarrageTarget = 'COMBAT_UNITS' | 'AIR_BASE' | 'PORT';

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
  /** The Air Base the aircraft took off from; the return choice lists it first and says so. Absent in saves from before it was kept. */
  readonly originHexId?: HexId | undefined;
  /** Farthest base it may return to, in hexes, when that is not its whole range (a Transport flying at half range, 14.9e C). */
  readonly rangeHexes?: number | undefined;
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
  /** The cargo of an Air Transport or Air Drop (14.9, 14.10); absent in other missions. */
  readonly cargo?: AirCargoState | null | undefined;
}

/** 14.8: a Trainbusting marker, removed in the next Clean Up Phase of its owner's enemy. */
export interface TrainbustingMarker {
  readonly hexId: HexId;
  readonly ownerId: PlayerId;
}

/** 13.5e: Transport Points of one Definition that a player lost to enemy action (eliminated or captured). */
export interface LostTruckRecord {
  readonly ownerId: PlayerId;
  readonly definitionId: DefinitionId;
  readonly points: number;
}

/** Replacement bookkeeping (13.5) that is not part of a Piece. */
export interface ReplacementState {
  /** 13.5e: trucks lost to enemy action, which Eq may rebuild; a player never gets back more than this. */
  readonly lostTrucks: readonly LostTruckRecord[];
}

/** 13.5a-b: steps one ground unit regains; a Dead Pile unit is placed in a voluntary mode, a reduced unit keeps its own (null). */
export interface UnitRebuild {
  readonly pieceId: PieceId;
  readonly steps: number;
  readonly mode: OcsMode | null;
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
  /** Hexes where an Air Base or Air Strip was built or improved this phase: a Level rises by one per turn (15.3). */
  readonly builtHexIds: readonly HexId[];
  /** Engineer-Capable units that already performed construction this phase (13.8d: one hex, one task). */
  readonly builderIds: readonly PieceId[];
  /** 14.10b: planned Air Drops of combat units, kept until they are flown, delayed or cancelled. */
  readonly dropPlans: readonly DropPlan[];
  /** 14.9f: cargo already unloaded at each Air Base in this Movement Segment, in tokens. */
  readonly unloaded: readonly AirUnloadRecord[];
  /** Units that made a planned Air Drop this player turn: they need no trace supply on the turn they drop (12.6h). */
  readonly droppedIds: readonly PieceId[];
}

/** 14.10b: a written record of the hex where each combat unit will drop and the Game Turn of the mission. */
export interface DropPlan {
  /** Stable key: the player and the units on the plan. */
  readonly id: string;
  readonly ownerId: PlayerId;
  readonly unitIds: readonly PieceId[];
  readonly hexId: HexId;
  /** Game Turn of the scheduled drop. */
  readonly turn: number;
}

export interface AirUnloadRecord {
  readonly hexId: HexId;
  readonly tokens: number;
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
  | 'AIR_RETURN'
  /** 14.4g: Flak cut a Transport's capacity; the owner picks cargo to destroy. */
  | 'CARGO_LOSS'
  /** 20.0d/20.0g: the owner picks which of several eligible units absorbs a Breakdown as the phase ends. */
  | 'BREAKDOWN_ABSORPTION';

export const PENDING_DECISION_KINDS: readonly PendingDecisionKind[] = [
  'FIRST_PLAYER', 'SUPPLY_SOURCE', 'DEFENDER_LEAD', 'DEFENDER_TERRAIN', 'STEP_LOSS', 'OPTION_SPLIT',
  'RETREAT_HEX', 'ADVANCE_HEX', 'DISPLACEMENT_HEX', 'ATTRITION_LOSS', 'OVERSTACK_ELIMINATION',
  'AIR_ABORT', 'AIR_COMBAT_PICK', 'INTERCEPTION', 'MISSION_LOSS', 'AIR_RETURN', 'CARGO_LOSS', 'BREAKDOWN_ABSORPTION',
];

/** Decisions that may exist outside a combat: sequence of play, attrition, and movement captures. */
export const SEQUENCE_DECISION_KINDS: readonly PendingDecisionKind[] = [
  'FIRST_PLAYER', 'OVERSTACK_ELIMINATION', 'BREAKDOWN_ABSORPTION', 'ATTRITION_LOSS', 'DISPLACEMENT_HEX',
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
  /** Flight Conditions of the Game Turn (14.1f); Normal when the table rolls none. */
  readonly flight: FlightCondition;
  /** The 2d6 total of the Flight Conditions roll, or null when none was rolled. */
  readonly flightRoll: number | null;
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

/** Rail Cap spent in one Movement Phase, in quarter points (13.3b: it is never saved for later). */
export interface RailCapSpent {
  readonly playerId: PlayerId;
  readonly gameTurn: number;
  readonly playerTurnIndex: 0 | 1;
  readonly quarters: number;
}

/** 13.6b: reinforcements and new SP placed at a rail entry Hex this Game Turn, which may entrain there "off-map". */
export interface RailArrival {
  readonly playerId: PlayerId;
  readonly gameTurn: number;
  readonly hexId: HexId;
  readonly tokens: number;
  readonly pieceIds: readonly PieceId[];
}

/** Port capacity used in one phase, in Tokens (= quarter points): loading and unloading both count (19.0a). */
export interface PortUse {
  readonly hexId: HexId;
  readonly gameTurn: number;
  readonly playerTurnIndex: 0 | 1;
  readonly phase: string;
  readonly tokens: number;
  /** A single oversized combat unit used the whole capacity (19.0a). */
  readonly oversized: boolean;
}

/** Port work done this Game Turn: one voluntary hit (19.0c) and one repaired hit (19.0d) per port per turn. */
export interface PortWork {
  readonly hexId: HexId;
  readonly gameTurn: number;
  readonly kind: 'REDUCE' | 'REPAIR';
}

/** Shipping bookkeeping (19.0). */
export interface SeaState {
  readonly spent: readonly RailCapSpent[];
  readonly portUse: readonly PortUse[];
  readonly work: readonly PortWork[];
}

/** Rail transport bookkeeping (13.3). */
export interface RailState {
  readonly spent: readonly RailCapSpent[];
  readonly arrivals: readonly RailArrival[];
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
  /** The unit (or moving stack leader) whose movement is in progress (6.1g). */
  readonly currentMoverId: PieceId | null;
  /**
   * Every unit of the stack moving together with `currentMoverId`, leader first (6.1f, 8.1d). Absent when one unit
   * moves alone; a unit dropped off the stack leaves this list and may not move again this phase.
   */
  readonly movingStackIds?: readonly PieceId[] | undefined;
  readonly rng: RulesRngState;
  readonly activeTransaction: RuleTransaction | null;
  readonly pendingDecision: PendingDecision | null;
  readonly weather: WeatherState;
  readonly fuel: FuelState;
  readonly interrupts: readonly RuleInterrupt[];
  readonly formationTraces: readonly FormationTraceChoice[];
  readonly victory: VictoryState;
  readonly air: AirState;
  readonly replacements: ReplacementState;
  /** Absent until the first rail move or rail arrival (and in saves made before Rail Cap existed). */
  readonly rail?: RailState | undefined;
  /** Absent until the first shipment or port work (and in saves made before Sea Cap existed). */
  readonly sea?: SeaState | undefined;
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
  | (ActionEnvelope & {
    readonly kind: 'MOVE_PIECE';
    readonly pieceId: PieceId;
    readonly path: readonly HexId[];
    /**
     * Other units moving along the same path as one stack with `pieceId` (6.1f). Units of the stack now moving that
     * are left out are dropped off and finish their move.
     */
    readonly companionIds?: readonly PieceId[] | undefined;
  })
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
    /** Each attacker's combat supply, declared with the attack and paid in this order (9.5, 12.4, 12.10). */
    readonly attackerSupply: readonly AttackerSupplyChoice[];
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
    /** The load of an Air Transport or Air Drop; null for every other mission. */
    readonly cargo?: AirCargoDeclaration | null;
  })
  /** 15.4: one RE of Combat Mode units that do not move reduces a friendly Air Base one Level. */
  | (ActionEnvelope & {
    readonly kind: 'REDUCE_AIR_BASE';
    readonly baseId: PieceId;
    readonly pieceIds: readonly PieceId[];
    /** 15.4, 13.8d: an Engineer-Capable unit within 2 hexes can do the work instead of 1 RE of units in the hex. */
    readonly engineerId?: PieceId | null;
  })
  /** 13.8d, 15.2, 15.3: an Engineer-Capable unit builds or improves an Air Base or Air Strip, paying the exact cost in Tokens. */
  | (ActionEnvelope & {
    readonly kind: 'BUILD_AIR_BASE';
    readonly engineerId: PieceId;
    readonly hexId: HexId;
    readonly facility: 'AIR_STRIP' | 'AIR_BASE';
    readonly payments: readonly { readonly sourcePieceId: PieceId; readonly tokens: number }[];
  })
  /**
   * 16.0b: one RE of Combat Mode units in the hex that do not move (`pieceIds`), or an Engineer-Capable unit within
   * 2 hexes (`engineerId`, 13.8d), builds or improves a hedgehog one Level for exactly 2 SP.
   */
  | (ActionEnvelope & {
    readonly kind: 'BUILD_HEDGEHOG';
    readonly hexId: HexId;
    readonly pieceIds: readonly PieceId[];
    readonly engineerId: PieceId | null;
    readonly payments: readonly { readonly sourcePieceId: PieceId; readonly tokens: number }[];
  })
  /** 16.0c: the same work reduces a friendly hedgehog one Level for free; below Level 1 it is removed. */
  | (ActionEnvelope & {
    readonly kind: 'REDUCE_HEDGEHOG';
    readonly hedgehogId: PieceId;
    readonly pieceIds: readonly PieceId[];
    readonly engineerId: PieceId | null;
  })
  /** 13.5f: Eq expended at an HQ rebuild aircraft: Dead Pile aircraft arrive Active at a friendly Air Base, reduced ones stacked with the Eq are made whole. */
  | (ActionEnvelope & {
    readonly kind: 'REBUILD_AIRCRAFT';
    readonly eqPieceId: PieceId;
    readonly hqId: PieceId;
    readonly aircraftIds: readonly PieceId[];
    /** Air Base the Dead Pile aircraft arrive at; null when only reduced aircraft are rebuilt in place. */
    readonly baseId: PieceId | null;
  })
  /**
   * 13.5a-e: the Pax and Eq in one hex, at or within 2 hexes of an HQ that can rebuild, are spent by the Rebuild Table: Dead Pile
   * units are placed in that hex, reduced units stacked there regain steps, and Eq rebuild trucks lost to the enemy (13.5e).
   */
  | (ActionEnvelope & {
    readonly kind: 'REBUILD_UNITS';
    readonly hexId: HexId;
    readonly hqId: PieceId;
    readonly units: readonly UnitRebuild[];
    readonly truckPoints: number;
  })
  /** 14.10b: plan the Air Drop of combat units: where and on which Game Turn. Made in the Aircraft Refit Phase. */
  | (ActionEnvelope & { readonly kind: 'PLAN_AIR_DROP'; readonly unitIds: readonly PieceId[]; readonly hexId: HexId; readonly turn: number })
  /** 14.10c: delay (one turn later) or cancel all or part of a Drop Plan, in an Aircraft Refit Phase. */
  | (ActionEnvelope & { readonly kind: 'UPDATE_AIR_DROP_PLAN'; readonly planId: string; readonly unitIds: readonly PieceId[]; readonly change: 'DELAY' | 'CANCEL' })
  /**
   * 13.3a, 13.3e: entrain units (trucks with their loads) and SP from ground dumps in `fromHexId`, move them by rail and detrain
   * them in `toHexId`, paying Rail Cap. The engine picks the cheapest legal rail path (13.3a multi-track halving, 14.8c doubling).
   */
  | (ActionEnvelope & {
    readonly kind: 'RAIL_MOVE';
    readonly fromHexId: HexId;
    readonly toHexId: HexId;
    readonly unitIds: readonly PieceId[];
    readonly supply: readonly { readonly sourcePieceId: PieceId; readonly tokens: number }[];
  })
  /**
   * 19.0f: ship units (Move Mode combat units, Transport Points with their loads, Repls) and SP from `fromHexId`, a friendly port,
   * or from the reinforcement Box when it is null, to the friendly port `toHexId`, paying Sea Cap and port capacity.
   */
  | (ActionEnvelope & {
    readonly kind: 'SEA_MOVE';
    readonly fromHexId: HexId | null;
    readonly toHexId: HexId;
    readonly unitIds: readonly PieceId[];
    readonly supply: readonly { readonly sourcePieceId: PieceId; readonly tokens: number }[];
  })
  /** 19.0c: one RE of Combat Mode units in the port that do not move (or an Engineer-Capable unit, 13.8d) inflicts one hit on a friendly port. */
  | (ActionEnvelope & { readonly kind: 'REDUCE_PORT'; readonly hexId: HexId; readonly pieceIds: readonly PieceId[]; readonly engineerId: PieceId | null })
  /** 19.0d: an Engineer-Capable unit repairs one hit of a friendly port for 1 SP. */
  | (ActionEnvelope & {
    readonly kind: 'REPAIR_PORT';
    readonly hexId: HexId;
    readonly engineerId: PieceId;
    readonly payments: readonly { readonly sourcePieceId: PieceId; readonly tokens: number }[];
  })
  /** 13.9-4: two reduced aircraft of the same type, values and status in one hex combine into one full-strength aircraft. */
  | (ActionEnvelope & { readonly kind: 'COMBINE_AIRCRAFT'; readonly aircraftIds: readonly PieceId[] })
  /**
   * 13.9-1 to 13.9-3, in the friendly Reinforcement Phase. MERGE: `withId`, a multi-step unit identical to `pieceId` and in
   * its hex, gives it its steps and goes to the Dead Pile. SWAP: `withId`, an identical unit of another formation in the
   * Dead Pile, takes the place, mode, markers and steps of `pieceId`, which goes to the Dead Pile.
   */
  | (ActionEnvelope & { readonly kind: 'CONSOLIDATE_UNITS'; readonly consolidation: ConsolidationKind; readonly pieceId: PieceId; readonly withId: PieceId });

/** 13.9: combine two multi-step units in one hex, or exchange a unit for an identical one of another formation. */
export type ConsolidationKind = 'MERGE' | 'SWAP';

/** 12.5c: Formation Method (1 SP), HQ Method (1 SP), or Single-Unit Method (1T). */
export type FuelMethod = 'FORMATION' | 'HQ' | 'SINGLE_UNIT';

/**
 * One attacker's combat supply: drawn from these dumps, in order, or from its own internal stocks, which it
 * may use only when the dumps in reach cannot cover it after the attackers declared before it (12.10a).
 */
export type AttackerSupplyChoice =
  | { readonly pieceId: PieceId; readonly method: 'DUMPS'; readonly dumpIds: readonly PieceId[] }
  | { readonly pieceId: PieceId; readonly method: 'INTERNAL' };

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
  | { readonly kind: 'WEATHER_DETERMINED'; readonly sequence: number; readonly groundCondition: GroundCondition; readonly roll: number | null; readonly flight: FlightCondition; readonly flightRoll: number | null }
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
  | { readonly kind: 'REPLACEMENTS_ARRIVED'; readonly sequence: number; readonly playerId: PlayerId; readonly pieceId: PieceId; readonly replacement: 'PAX' | 'EQ'; readonly quantity: number }
  /** 13.5: the Variable Replacement Table roll of one Reinforcement Phase. */
  | { readonly kind: 'REPLACEMENT_TABLE_ROLLED'; readonly sequence: number; readonly playerId: PlayerId; readonly roll: number; readonly pax: number; readonly eq: number }
  | { readonly kind: 'UNITS_CONSOLIDATED'; readonly sequence: number; readonly consolidation: ConsolidationKind; readonly pieceId: PieceId; readonly withId: PieceId; readonly hexId: HexId; readonly steps: number }
  | { readonly kind: 'UNIT_REBUILT'; readonly sequence: number; readonly pieceId: PieceId; readonly hexId: HexId; readonly steps: number; readonly fromDeadPile: boolean }
  /** 9.14c: Transport Points (or wagons) in a hex an enemy entered: the die, the points there, and how many changed hands. */
  | { readonly kind: 'TRANSPORT_CAPTURED'; readonly sequence: number; readonly hexId: HexId; readonly ownerId: PlayerId; readonly capturerId: PlayerId; readonly roll: number; readonly points: number; readonly captured: number }
  | { readonly kind: 'TRUCKS_REBUILT'; readonly sequence: number; readonly pieceIds: readonly PieceId[]; readonly hexId: HexId; readonly points: number }
  | { readonly kind: 'AIRCRAFT_REBUILT'; readonly sequence: number; readonly pieceId: PieceId; readonly hexId: HexId | null }
  | { readonly kind: 'AIR_CARGO_DELIVERED'; readonly sequence: number; readonly hexId: HexId; readonly unitIds: readonly PieceId[]; readonly tokens: number; readonly drop: boolean }
  | { readonly kind: 'AIR_CARGO_LOST'; readonly sequence: number; readonly unitIds: readonly PieceId[]; readonly tokens: number; readonly reason: 'FLAK' | 'LANDING' }
  | { readonly kind: 'DROP_PLAN_CHANGED'; readonly sequence: number; readonly planId: string; readonly change: 'PLANNED' | 'DELAYED' | 'CANCELLED' | 'FLOWN'; readonly turn: number }
  /** 9.14f: an Air Base taken by the enemy; each aircraft there rolled on the Air Base Capture Table (step lost on `stepLossMaximum` or less). */
  | { readonly kind: 'AIR_BASE_CAPTURED'; readonly sequence: number; readonly hexId: HexId; readonly capturerId: PlayerId; readonly baseCaptured: boolean; readonly stepLossMaximum: number; readonly rolls: readonly { readonly pieceId: PieceId; readonly roll: number; readonly total: number; readonly stepLost: boolean; readonly eliminated: boolean }[] }
  | { readonly kind: 'AIR_BASE_BUILT'; readonly sequence: number; readonly pieceId: PieceId; readonly hexId: HexId; readonly level: number; readonly strip: boolean }
  /** 16.0b-c: a hedgehog's new Level; 0 means it was reduced below Level 1 and removed. */
  | { readonly kind: 'HEDGEHOG_LEVEL_CHANGED'; readonly sequence: number; readonly pieceId: PieceId; readonly hexId: HexId; readonly level: number }
  /** 9.14e: an enemy Attack-Capable unit entered the hex and took the hedgehog. */
  | { readonly kind: 'HEDGEHOG_CAPTURED'; readonly sequence: number; readonly pieceId: PieceId; readonly hexId: HexId; readonly capturerId: PlayerId; readonly level: number }
  | { readonly kind: 'RAIL_MOVED'; readonly sequence: number; readonly playerId: PlayerId; readonly path: readonly HexId[]; readonly unitIds: readonly PieceId[]; readonly tokens: number; readonly quarters: number }
  /** 13.3h: a station changed hands because it now lies clearly on one side's side of the front. */
  | { readonly kind: 'SEA_MOVED'; readonly sequence: number; readonly playerId: PlayerId; readonly fromHexId: HexId | null; readonly toHexId: HexId; readonly unitIds: readonly PieceId[]; readonly tokens: number; readonly quarters: number }
  | { readonly kind: 'PORT_CAPTURED'; readonly sequence: number; readonly hexId: HexId; readonly capturerId: PlayerId }
  | { readonly kind: 'PORT_DAMAGED'; readonly sequence: number; readonly hexId: HexId; readonly hits: number; readonly cause: 'BARRAGE' | 'REDUCTION' }
  | { readonly kind: 'PORT_REPAIRED'; readonly sequence: number; readonly hexId: HexId; readonly hits: number }
  | { readonly kind: 'RAIL_CONTROL_CHANGED'; readonly sequence: number; readonly hexId: HexId; readonly controllerId: PlayerId }
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
