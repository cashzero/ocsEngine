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
  /** Combat supply of each eligible attacker, ticked ones in the order they pay (9.5, 12.10a); empty for a barrage. */
  readonly supply: readonly AttackerSupplyRow[];
  readonly action: GameAction | null;
  readonly explanation: RuleExplanation | null;
}

/**
 * Where one eligible attacker would get its combat supply: a ticked unit's options after the units ticked before it,
 * an unticked unit's after every ticked one. A unit with no option cannot join (12.10c).
 */
export interface AttackerSupplyRow {
  readonly pieceId: PieceId;
  readonly need: number;
  readonly options: readonly { readonly id: string; readonly label: string; readonly hexIds: readonly string[]; readonly wastedTokens: number }[];
  /** The declared source of a ticked unit. */
  readonly chosenId: string | null;
  readonly reason: string | null;
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
  readonly target: 'COMBAT_UNITS' | 'AIR_BASE' | 'PORT' | null;
  /** Barrage targets available in the chosen hex (10.0d). */
  readonly targetOptions: readonly ('COMBAT_UNITS' | 'AIR_BASE' | 'PORT')[];
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
  /** The side's off-map airfield: refits every aircraft without SP and has no Active limit. */
  readonly offMap: boolean;
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

/** One unit a hex of Repls could rebuild (13.5a-b): a reduced unit stacked with them, or one from the Dead Pile. */
export interface GroundRebuildUnit {
  readonly id: PieceId;
  readonly label: string;
  /** Rebuild Table row and price: per step, or per pair of units on a `pairs` row (13.5d). */
  readonly price: { readonly row: string; readonly label: string; readonly pax: number; readonly eq: number; readonly pairs: boolean };
  readonly missing: number;
  readonly deadPile: boolean;
  readonly selected: boolean;
  /** Steps chosen to regain (13.5b: any number up to those missing). */
  readonly steps: number;
  /** The voluntary mode a Dead Pile unit is placed in; null for a reduced unit, which keeps its mode. */
  readonly mode: OcsMode | null;
  readonly modes: readonly OcsMode[];
}

/** One hex of the player's Pax and Eq near an HQ that can rebuild ground units and trucks in the Reinforcement Phase (13.5a-e). */
export interface GroundRebuild {
  readonly hexId: string;
  readonly pax: number;
  readonly eq: number;
  readonly units: readonly GroundRebuildUnit[];
  /** 13.5e: truck points lost to the enemy that these Eq could rebuild, and how many are chosen. */
  readonly truckMax: number;
  readonly truckPoints: number;
  /** Pax and Eq the current selection costs. */
  readonly cost: { readonly pax: number; readonly eq: number };
  readonly action: GameAction | null;
  readonly explanation: RuleExplanation | null;
}

/** One Unit Consolidation (13.9): combine two reduced units in a hex, or exchange a unit for one of another division. */
export interface Consolidation {
  readonly key: string;
  readonly consolidation: 'MERGE' | 'SWAP';
  readonly hexId: string;
  /** MERGE: the unit keeping the steps. SWAP: the unit on the map leaving for the Dead Pile. */
  readonly label: string;
  /** MERGE: the unit giving its steps. SWAP: the Dead Pile unit taking the place. */
  readonly withLabel: string;
  readonly steps: number;
  readonly action: GameAction;
  readonly explanation: RuleExplanation;
}

/** One way an Engineer-Capable unit can build or improve in the chosen hex (13.8d, 15.2, 15.3, 16.0b). */
export interface BuildOption {
  readonly facility: 'AIR_STRIP' | 'AIR_BASE' | 'HEDGEHOG';
  readonly label: string;
  /** Tokens of supply it costs. */
  readonly cost: number;
  readonly action: GameAction;
  readonly explanation: RuleExplanation;
}

/** Construction by the selected Engineer-Capable unit (Air Bases, Air Strips, hedgehogs): where it can build, and the hex being planned. */
export interface ConstructionOverview {
  readonly engineerId: PieceId;
  /** What the unit can build somewhere now, for the button that starts planning. */
  readonly facilities: readonly ('AIR' | 'HEDGEHOG')[];
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
  readonly group: 'FUEL' | 'SUPPLY' | 'BREAKOUT' | 'BREAKDOWN' | 'TRANSPORT' | 'DUMP' | 'TRACE' | 'AIR' | 'HEDGEHOG' | 'PORT' | 'EXCHANGE';
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
/** A unit sharing the selected unit's Hex that may move off with it as one stack (6.1f). */
export interface StackMate {
  readonly piece: ProjectedPiece;
  /** Ticked to move with the selected unit. */
  readonly together: boolean;
  /** Why it cannot move with the selected unit now; null when it can. */
  readonly blocker: string | null;
}

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

/** The kinds of counter the map's unit filter can show or hide. */
export type UnitFilterKind = 'HQ' | 'COMBAT' | 'LOGISTICS' | 'AIR';

/** How fast the computer's actions are played: the pause between one action and the next. */
export type PlaybackSpeed = 'SLOW' | 'NORMAL' | 'FAST' | 'INSTANT';

/** The last action a computer seat played, as the viewer may read it. */
export interface ComputerAction {
  readonly seatId: SeatId;
  readonly seatLabel: string;
  /** What happened, written for the viewer (an enemy's hidden units are not named). */
  readonly text: string;
  /** Why the computer did it; only given when no person plays, since it can mention what the computer knows. */
  readonly intent: string | null;
  /** A hex the action touched that the viewer may look at, to bring into view. */
  readonly hexId: string | null;
  readonly revision: number;
}

/** A computer seat that cannot go on: nothing is skipped on its behalf; the player takes the seat over or retries. */
export interface ComputerStuck {
  readonly seatId: SeatId;
  readonly seatLabel: string;
  readonly code: string;
  readonly message: string;
  readonly detail: string;
}

/** Computer players of the game: present when at least one seat is played by a computer. */
export interface AutomationInfo {
  readonly seats: readonly { readonly seatId: SeatId; readonly label: string; readonly computer: boolean }[];
  /** No person plays: the computers play each other and the screen only watches. */
  readonly spectating: boolean;
  /** The computer plays on by itself; false while paused (Step plays one action). */
  readonly playing: boolean;
  readonly speed: PlaybackSpeed;
  /** The map follows each computer action into view. */
  readonly followActions: boolean;
  /** The computer seat the game waits for now; null when a person is to act or the game is over. */
  readonly computerToAct: { readonly seatId: SeatId; readonly label: string } | null;
  /** Actions the computers have played since this game was opened. */
  readonly played: number;
  readonly last: ComputerAction | null;
  readonly stuck: ComputerStuck | null;
  /** The seat whose view the screen shows. */
  readonly viewSeatId: SeatId;
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
  /** The seat's Supply Sources marked by the same overlay (12.6a); empty while it is off. */
  readonly supplySources: readonly { readonly hexId: string; readonly kind: 'MAP_EDGE' | 'PORT' | 'DETRAINABLE' | 'EXTENDER' }[];
  /** Control of each rail Hex from the seat's side (13.3h), marked by the same overlay; empty while it is off. */
  readonly railControl: readonly { readonly hexId: string; readonly control: 'OWN' | 'ENEMY' }[];
  /** The selected unit the overlay is drawn for; null when it shows where any friendly unit would trace. */
  readonly traceCoverageFor: string | null;
  readonly showTraceCoverage: boolean;
  /** Counters are left off the map so the overlays underneath can be read whole; hex clicks still work. */
  readonly hideUnits: boolean;
  /** Unit kinds the player filtered off the map (the Hide units filter); empty shows every kind. */
  readonly hiddenUnitKinds: readonly UnitFilterKind[];
  /**
   * Why the selected own unit cannot begin or continue moving now (e.g. 12.5a fuel), so the deck can say so
   * instead of a bare "cannot move"; empty when it may move or no Movement Segment is open.
   */
  readonly moveBlockers: readonly MoveBlocker[];
  /**
   * Other own units in the selected unit's Hex during a Movement Segment, and whether each moves with it as one stack
   * (6.1f). Empty when there is no one to move with.
   */
  readonly stackMates: readonly StackMate[];
  /** Units of the stack now moving that the previewed move leaves behind; they cannot move again this phase (6.1f). */
  readonly droppedOffIds: readonly string[];
  /** MP the selected unit has left this phase, in quarter-MP ticks; null when it cannot move. */
  readonly remainingTicks: number | null;
  readonly movePreview: MovePreview | null;
  /** How the selected own unit is fueled now (12.5); null when none is selected or it needs fuel and has none. */
  readonly selectedFuel: import('../rules/index.js').FuelCoverage;
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
  /** Rail transport from the selected unit's or dump's hex (13.3); null when nothing can entrain there now. */
  readonly rail: RailPanel | null;
  /** Rail transport is possible for the selected piece but the player has not opened it: what it would carry. */
  readonly railOffer: 'UNITS' | 'SUPPLY' | null;
  /** Why the Rail button is shown disabled for the selected piece (e.g. not in Move Mode); null when it is available or hidden. */
  readonly railBlocked: string | null;
  readonly sea: SeaPanel | null;
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
  /** Hexes of the player's Repls that can rebuild ground units or trucks now (13.5a-e). */
  readonly groundRebuilds: readonly GroundRebuild[];
  /** The player's Rebuild Table (13.5a) and Variable Replacement Table (13.5); empty in a game saved before they existed. */
  readonly rebuildTable: readonly { readonly label: string; readonly pax: number; readonly eq: number; readonly pairs: boolean }[];
  readonly replacementTable: readonly { readonly minimum: number; readonly maximum: number; readonly pax: number; readonly eq: number }[];
  /** Unit Consolidations the player could make now (13.9-1 to 3). */
  readonly consolidations: readonly Consolidation[];
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
  /** The computer players, or null in a game with people on both seats. */
  readonly automation: AutomationInfo | null;
}

/** A rail move being put together in one entraining hex (13.3): the cargo ticked, the destination, its cost. */
export interface RailPanel {
  readonly hexId: string;
  readonly capacityPoints: number;
  readonly remainingQuarters: number;
  /** 13.6b: Tokens that arrived here this turn and may entrain off-map; null when the hex is detrainable anyway. */
  readonly arrivalTokens: number | null;
  readonly units: readonly { readonly pieceId: string; readonly label: string; readonly quarters: number; readonly problem: string | null; readonly selected: boolean }[];
  readonly dumps: readonly { readonly pieceId: string; readonly holds: number; readonly loadableTokens: number; readonly tokens: number }[];
  readonly destinations: readonly { readonly hexId: string; readonly halves: 1 | 2 | 4; readonly hexes: number }[];
  readonly toHexId: string | null;
  /** Rail Cap the move costs in quarters; null until there is cargo and a destination. */
  readonly costQuarters: number | null;
  readonly allowed: boolean;
  readonly blockers: readonly string[];
}

/** A shipment being put together (19.0f): from a friendly port, or from the reinforcement Box when `fromHexId` is null. */
export interface SeaPanel {
  readonly fromHexId: string | null;
  readonly capacityPoints: number;
  readonly remainingQuarters: number;
  /** Capacity the loading port has left this phase, in Tokens; null for the Box. */
  readonly fromRemainingTokens: number | null;
  readonly units: readonly { readonly pieceId: string; readonly label: string; readonly quarters: number; readonly problem: string | null; readonly selected: boolean }[];
  readonly dumps: readonly { readonly pieceId: string; readonly holds: number; readonly loadableTokens: number; readonly tokens: number }[];
  readonly destinations: readonly { readonly hexId: string; readonly remainingTokens: number }[];
  readonly toHexId: string | null;
  /** Sea Cap (and port capacity) the shipment takes, in quarters; null until there is cargo and a port. */
  readonly costQuarters: number | null;
  readonly allowed: boolean;
  readonly blockers: readonly string[];
}

export type UiListener = (snapshot: UiSnapshot) => void;

export type { HexId };
