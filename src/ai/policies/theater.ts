import type { HexId, PieceId } from '../../core/index.js';
import type { OcsMode } from '../../domain/piece/index.js';
import type { ProjectedPiece } from '../../rules/index.js';
import { COMBAT_TABLE_COLUMNS, roundOcs, type CombatLine, type OddsColumn } from '../../rules/tables/ocs-4.3.js';
import type { OwnUnit, Situation } from '../analysis.js';
import { hexesBetween } from '../knowledge.js';
import type { BotActionAccess } from '../model.js';

/**
 * Theater allocation for the attacker (docs/ai/theater-supply-plan.md, plan P11.8): which units to send against which
 * objectives it does not hold, this Movement segment or the next, to maximize points times the probability of holding
 * each once the group attacks, discounted when that is next turn. Used only when the `theaterAllocation` weight is on.
 */

/**
 * The frozen capture model of plan P11.3 (docs/quality/evidence/ai-theater-capture-model-2026-10-21/model.json):
 * logistic on column, DRM, defender can pay, hedgehog level and CLOSE / OPEN line indicators (VERY_CLOSE and
 * EXTREMELY_CLOSE share the base), standardized with the training mean and scale.
 */
const CAPTURE_MODEL = {
  mean: [5.925490196078432, 2.112418300653595, 0.984313725490196, 0.7843137254901961, 0.23137254901960785, 0.1437908496732026],
  scale: [2.952511491275357, 1.804979324250634, 0.12425866288435185, 0.867278641179176, 0.4217099626280804, 0.350877530234498],
  beta: [-0.9792049913905589, 1.930442050391208, 1.2066198131506205, -0.20819908418629102, -0.5634588774966104, -0.4195389971385345, -0.4137596124040933],
} as const;

export interface AttackFacts {
  readonly column: number;
  readonly drm: number;
  readonly defenderCanPay: boolean;
  readonly hedgehogLevel: number;
  readonly line: CombatLine;
}

export const captureProbability = (facts: AttackFacts): number => {
  const x = [facts.column, facts.drm, facts.defenderCanPay ? 1 : 0, facts.hedgehogLevel, facts.line === 'CLOSE' ? 1 : 0, facts.line === 'OPEN' ? 1 : 0];
  const logit = x.reduce((sum, value, index) => sum + CAPTURE_MODEL.beta[index + 1]! * (value - CAPTURE_MODEL.mean[index]!) / CAPTURE_MODEL.scale[index]!, CAPTURE_MODEL.beta[0]);
  return 1 / (1 + Math.exp(-Math.max(-35, Math.min(35, logit))));
};

/** 9.14a: the column of an attack at these strengths (mirrors the rules' odds rounding). */
const columnIndex = (attack: number, defense: number, columns: readonly OddsColumn[]): number => {
  if (attack <= 0) return 0;
  if (defense <= 0) return columns.length - 1;
  const ratio = attack >= defense ? roundOcs(attack / defense) : 1 / roundOcs(defense / attack);
  let index = 0;
  for (const [position, column] of columns.entries()) if (column.attacker / column.defender <= ratio + 1e-9) index = position;
  return index;
};

/**
 * The share of defended objectives the attacker did not hold whose enemy strength, as the attacker sees it, had not
 * risen by its next Movement segment, by Game Turn (P5 Western Europe Axis-attack games, scripts/ai-theater-delay.mjs;
 * docs/quality/evidence/ai-theater-delay-2026-10-22). A group that can attack only next turn is worth this share.
 */
const NEXT_TURN_DISCOUNT = [0.4367, 0.7865, 0.8428, 0.8994, 0.9057, 0.9412, 0.9442] as const;

export const nextTurnDiscount = (gameTurn: number, turnsLeft: number): number =>
  turnsLeft <= 0 ? 0 : NEXT_TURN_DISCOUNT[Math.min(Math.max(gameTurn, 1), NEXT_TURN_DISCOUNT.length) - 1]!;

export interface TheaterGroup {
  readonly hexId: HexId;
  readonly defended: boolean;
  /** 1: every member is in place this step; 2: some member gets there next step. */
  readonly turn: 1 | 2;
  readonly unitIds: readonly PieceId[];
  /** Capture probability once the group attacks, from the frozen model. */
  readonly probability: number;
  /** The probability, times the next-turn discount for a turn 2 group. */
  readonly chance: number;
  /** Combat Table column the members would attack at (the defender's best terrain line), or null for an empty objective. */
  readonly column: { readonly line: CombatLine; readonly index: number } | null;
  readonly value: number;
}

/** An HQ sent to throw trace supply to a group's attack positions on the step the group attacks (12.3b). */
export interface HqPlacement {
  readonly hqId: PieceId;
  readonly objective: HexId;
  readonly turn: 1 | 2;
  /** Where it throws from on the group's step. */
  readonly hexId: HexId;
  /** Where it moves this step: `hexId` for a this-step group, a hex of this step's reach from which it gets there next step otherwise. */
  readonly moveTo: HexId;
}

/**
 * A truck sent to unload SP this step where a group's members can eat and draw combat supply at their attack positions
 * on the group's step (12.6c, 12.4). SP are unloaded only with a friendly combat unit (13.2f): `stagerId` stops at
 * `drop` this step, a member of a next-step group or a unit no group uses. The drop may lie outside trace.
 */
export interface TruckPlacement {
  readonly truckId: PieceId;
  readonly objective: HexId;
  readonly drop: HexId;
  readonly stagerId: PieceId;
  /**
   * Tokens the members it serves need: eating (1T per 2 RE, at least 1T) and combat supply (1T per step); on the
   * group's first truck also what the stager eats at the drop this step when nothing else feeds it there.
   */
  readonly tokens: number;
  /** The rear dump hex the plan counted an empty truck's load from (the move step picks the dump again when the truck moves); null for a truck that carries its load. */
  readonly pickup: HexId | null;
}

/**
 * An HQ no group uses, sent where it draws SP that no front unit can draw now and throws to the front (12.3a-b): the
 * bridge from SP rail left behind the army to the units ahead of it.
 */
export interface HqBridge {
  readonly hqId: PieceId;
  readonly hexId: HexId;
  /** Tokens of the piles it bridges. */
  readonly tokens: number;
}

/**
 * An HQ no group or bridge uses, sent to a safe, fed hex (keeping its current trace dependents) whose throw brings
 * uncovered open objectives with nearby combat units into trace (12.3b, bot-hq-logistics-plan, S15).
 */
export interface HqTraceAdvance {
  readonly hqId: PieceId;
  readonly hexId: HexId;
  /** Total VP of newly trace-covered open objectives within 1 hex of its throw from `hexId`. */
  readonly vp: number;
}

export interface TheaterPlan {
  readonly groups: readonly TheaterGroup[];
  readonly hqs: readonly HqPlacement[];
  readonly trucks: readonly TruckPlacement[];
  readonly bridges: readonly HqBridge[];
  readonly traceAdvances: readonly HqTraceAdvance[];
}

/** A bridge is worth an HQ's move when it brings this many Tokens (1 SP) or more within the front's reach. */
const BRIDGE_MIN_TOKENS = 4;
/** Open objectives need a friendly non-HQ combat unit within this many hexes for an idle HQ to advance trace to them. */
const TRACE_ADVANCE_TROOP_RADIUS = 6;

/** An HQ is placed this many hexes or more from enemy units (closer, the move step scores it exposed). */
const HQ_SAFE_DISTANCE = 3;
/** HQ positions farther than this from an objective are not tried for it (a throw is a few hexes). */
const HQ_OBJECTIVE_RADIUS = 10;
/** Rounds of allocation, HQ and truck assignment and dropping the unit/objective pairs nothing free can supply. */
const SUPPLY_ROUNDS = 8;
/** SP are unloaded in a hex a combat unit stops in, at least this far from the enemy (the move step's drop rule) ... */
const DROP_SAFE_DISTANCE = 3;
/** ... and within this many hexes of the objective. */
const DROP_OBJECTIVE_RADIUS = 10;
/** A truck counts for a drop when it carries this many Tokens or rear dumps hold them. */
const TRUCK_MIN_TOKENS = 2;
/** Rear dumps trucks load from stand at least this far from the enemy (the move step's pickup rule). */
const PICKUP_SAFE_DISTANCE = 5;
/** A truck does not load SP this close to where it would unload them (the move step's rule). */
const DELIVERED_RADIUS = 3;

interface TruckDrop {
  readonly hexId: HexId;
  readonly covers: ReadonlySet<string>;
}

interface TruckOption {
  readonly truck: OwnUnit;
  /** Tokens it carries, or 0 when it loads in the rear first. */
  readonly carried: number;
  /** Drops it reaches with the MP to unload, most attack positions covered first. */
  readonly drops: readonly TruckDrop[];
}

interface HqOption {
  readonly hqId: PieceId;
  readonly hexId: HexId;
  readonly moveTo: HexId;
  readonly covers: ReadonlySet<string>;
  readonly servable: ReadonlySet<PieceId>;
}

/**
 * Units (not `exclude`d, with a combat strength) go to objectives the player does not hold: an empty one they can
 * enter, or a defended one beside which they can stop, this step or the next, where supply reaches them on that step.
 * Reach is in the mode `modeFor` says the unit takes as it begins to move (5.4): this step from where the unit stands,
 * the next step also from the hex of this step's reach nearest the objective. A unit that cannot move now and has no
 * fuel to pay (12.5a) stays where it is this step.
 *
 * Supply on a step is one of four:
 * - the unit's trace now;
 * - SP a dump already holds that the unit can eat there (12.6c), while the dump's Tokens last;
 * - the throw of an HQ placed for that step. The HQ moves this step (HQs move first) to a hex 3+ from the enemy where a
 *   Supply Source still feeds it and its throw still covers the units only it supplies now; for a next-step group it
 *   may move once more from the hex of that reach nearest the objective;
 * - SP trucks unload this step at a drop 3+ from the enemy whose draw (12.3a) reaches the attack positions. A combat
 *   unit must stop there first (13.2f), the stager: a member of a next-step group that still reaches an attack position
 *   from the drop next step, or a unit no group uses. The drop need not be in trace: there the stager eats this step
 *   from the first truck's load. The stager moves after the HQs, then the trucks, then the other units.
 *
 * SP count by Tokens and transport by capacity and MP: each dump feeds only the members whose eating and combat supply
 * it still holds; a truck (not `exclude`d) brings its cargo, or what it can carry (`truckTokens`, 4T a Transport
 * Point) from one rear dump it can drive to, load at, drive on from and unload within its MA (13.2f). A group may take
 * several trucks at one drop. Each HQ and each truck serves one group and each stager one drop; a unit/objective pair
 * nothing free can supply is dropped and the allocation repeated.
 *
 * A defended objective's capture probability comes from the rules' planned strengths under the defender's best
 * terrain, the estimated enemy strength, the best ratings on each side (an unseen defender rating counts 2) and the
 * defender assumed supplied; a group with a member that gets there only next step is worth that times `discount`.
 * Greedy by marginal value, then pairs and single units moved while the total improves.
 *
 * With `bridge`, the HQs no group uses are then sent to bridge SP left behind the front (`bridgesFor`).
 *
 * Without `logistics` this step's trucks and HQs stay where they are (the Exploitation Phase: only Exploit Mode units and
 * released Reserves move, 11.0a): no truck run and so no stager, and an HQ throws from its hex. A group is then supplied
 * only by the trace, the throws and the SP already in place.
 */
export const allocateTheater = (situation: Situation, access: BotActionAccess, exclude: ReadonlySet<PieceId>,
  rating: (piece: ProjectedPiece) => number, discount: number,
  modeFor: (unit: OwnUnit, objective: HexId, defended: boolean) => OcsMode | null,
  truckTokens: (truck: OwnUnit) => number, bridge = false, logistics = true, advanceTraceMinVp = 0, minProbability = 0): TheaterPlan => {
  const me = situation.playerId;
  const objectives = situation.objectives.filter((objective) => objective.controllerId !== me);
  if (objectives.length === 0) return { groups: [], hqs: [], trucks: [], bridges: [], traceAdvances: [] };
  const blocked = (hexId: string) => situation.enemy.get(hexId as HexId)?.hasCombatUnit ?? false;
  const occupied = (hexId: string) => situation.enemy.has(hexId as HexId);
  /** Where a unit attacks the objective from: a free hex beside a defended one, or the empty objective itself. */
  const attackHexes = (reach: ReadonlySet<string>, hexId: HexId): Set<string> => new Set(blocked(hexId)
    ? [...reach].filter((hex) => hexesBetween(hex, hexId) === 1 && !blocked(hex))
    : reach.has(String(hexId)) ? [String(hexId)] : []);
  const reachFrom = (pieceId: PieceId, hexId: HexId, mode: OcsMode | null) =>
    new Set([String(hexId), ...access.projectedReach(pieceId, hexId, mode ?? undefined).map(({ hexId: hex }) => String(hex))]);
  const units = situation.own.filter((unit) => situation.isCombatUnit(unit) && !exclude.has(unit.piece.id) && (unit.profile?.strength ?? 0) > 0)
    .sort((left, right) => String(left.piece.id).localeCompare(String(right.piece.id)));
  const byId = new Map(units.map((unit) => [unit.piece.id, unit]));
  const traced = new Map(units.map((unit) => [unit.piece.id, new Set(access.traceCoverage(unit.piece.id).hexIds.map(String))]));
  // Out of trace a unit eats from a dump whose SP reach it (12.6c: 1T per 2 RE, at least 1T) and draws its combat
  // supply there too (12.4: 1T per step).
  const eating = (unitId: PieceId) => Math.max(1, Math.ceil((byId.get(unitId)?.profile?.re ?? 1) / 2));
  const need = new Map(units.map((unit) => [unit.piece.id, eating(unit.piece.id) + (unit.piece.remainingSteps ?? unit.profile?.steps ?? 1)]));
  const feeds = new Map(units.map((unit) => [unit.piece.id, access.feedCoverage(unit.piece.id)
    .map(({ dumpId, tokens, hexIds }) => ({ dumpId, tokens, hexIds: new Set(hexIds.map(String)) }))]));
  const mobile = new Map(units.map((unit) => [unit.piece.id,
    access.movementRange(unit.piece.id).length > 0 || access.candidates('PAY_FUEL', unit.piece.id).length > 0]));
  const stagingReach = new Map<HexId, Set<string>>();
  // This step's reach of each unit toward each objective, in the mode it moves in there.
  const nowReach = new Map<string, ReadonlySet<string>>();
  const modeOf = new Map<string, OcsMode | null>();
  // Attack hexes each unit reaches by each step (the next step's include this step's).
  const positions = new Map(units.map((unit) => {
    const byObjective = new Map<HexId, { 1: Set<string>; 2: Set<string> }>();
    for (const objective of objectives) {
      const mode = modeFor(unit, objective.hexId, blocked(objective.hexId));
      // 12.5a: a unit that needs fuel and has no way to pay it stays where it is this step.
      const now = mobile.get(unit.piece.id) ? reachFrom(unit.piece.id, unit.hexId, mode) : new Set([String(unit.hexId)]);
      nowReach.set(`${unit.piece.id}|${objective.hexId}`, now);
      modeOf.set(`${unit.piece.id}|${objective.hexId}`, mode);
      if (!stagingReach.has(objective.hexId)) stagingReach.set(objective.hexId, new Set());
      for (const hex of now) stagingReach.get(objective.hexId)!.add(hex);
      const first = attackHexes(now, objective.hexId);
      const second = new Set(first);
      const stride = Math.max(...[...now].map((hex) => hexesBetween(unit.hexId, hex)));
      if (discount > 0 && !mobile.get(unit.piece.id)) {
        for (const hex of attackHexes(reachFrom(unit.piece.id, unit.hexId, mode), objective.hexId)) second.add(hex);
      } else if (discount > 0 && hexesBetween(unit.hexId, objective.hexId) <= 2 * stride + 1) {
        const staging = [...now].filter((hex) => hex !== String(objective.hexId) && !blocked(hex))
          .sort((left, right) => hexesBetween(left, objective.hexId) - hexesBetween(right, objective.hexId) || left.localeCompare(right))[0];
        if (staging !== undefined) for (const hex of attackHexes(reachFrom(unit.piece.id, staging as HexId, mode), objective.hexId)) second.add(hex);
      }
      if (second.size > 0) byObjective.set(objective.hexId, { 1: first, 2: second });
    }
    return [unit.piece.id, byObjective] as const;
  }));

  // HQ options: per objective and step, each HQ's best position (most attack hexes covered, then SP already in reach).
  const sideDirect = new Set(access.traceCoverage().directHexIds.map(String));
  const hqUnits = situation.own.filter((unit) => unit.piece.role === 'HQ').sort((left, right) => String(left.piece.id).localeCompare(String(right.piece.id)));
  const currentThrow = new Map(hqUnits.map((hq) => [hq.piece.id, access.hqThrow(hq.piece.id, hq.hexId)]));
  const options = new Map<string, HqOption[]>();
  /** Where each HQ may stand this step: 3+ from the enemy, fed, still throwing to the units only it supplies now. */
  const firstSteps = new Map<PieceId, readonly string[]>();
  const hqFedById = new Map<PieceId, ReadonlySet<string>>();
  for (const hq of hqUnits) {
    const id = hq.piece.id;
    const now = currentThrow.get(id)!;
    if (!now.fed && now.hexIds.length === 0 && now.servableIds.length === 0) continue;
    // Units only this HQ's throw supplies now must keep it where it goes this step (the move step refuses otherwise).
    const nowCovers = new Set(now.hexIds.map(String));
    const dependents = situation.own.filter((unit) => unit.piece.id !== id && nowCovers.has(String(unit.hexId)) && !sideDirect.has(String(unit.hexId))
      && now.servableIds.includes(unit.piece.id)
      && !hqUnits.some((other) => other.piece.id !== id && currentThrow.get(other.piece.id)!.hexIds.map(String).includes(String(unit.hexId))));
    const hqFed = new Set(access.feedCoverage(id).filter(({ tokens }) => tokens > 0).flatMap(({ hexIds }) => hexIds.map(String)));
    hqFedById.set(id, hqFed);
    const safe = (hexId: string) => hexId === String(hq.hexId) || (!occupied(hexId) && situation.nearestEnemy(hexId as HexId).distance >= HQ_SAFE_DISTANCE);
    const throwFrom = (hexId: string) => access.hqThrow(id, hexId as HexId);
    const keepsDependents = (hexId: string) => {
      const covers = new Set(throwFrom(hexId).hexIds.map(String));
      return dependents.every((unit) => covers.has(String(unit.hexId)));
    };
    const firstStep = (logistics ? [...reachFrom(id, hq.hexId, 'MOVE')] : [String(hq.hexId)]).filter(safe).filter((hexId) => throwFrom(hexId).fed && keepsDependents(hexId));
    firstSteps.set(id, firstStep);
    const servable = new Set(now.servableIds);
    for (const objective of objectives) {
      const targets = new Set([...positions.values()].flatMap((byObjective) => [...(byObjective.get(objective.hexId)?.[2] ?? [])]));
      if (targets.size === 0) continue;
      const best = (candidates: readonly { hexId: string; moveTo: string }[]): HqOption | null => {
        let chosen: { hexId: string; moveTo: string; count: number; fed: boolean } | null = null;
        for (const candidate of candidates) {
          if (hexesBetween(candidate.hexId, objective.hexId) > HQ_OBJECTIVE_RADIUS) continue;
          const reached = throwFrom(candidate.hexId);
          if (!reached.fed) continue;
          const count = reached.hexIds.filter((hexId) => targets.has(String(hexId))).length;
          if (count === 0) continue;
          const fedHere = hqFed.has(candidate.hexId);
          if (chosen === null || count > chosen.count || (count === chosen.count && fedHere && !chosen.fed)
            || (count === chosen.count && fedHere === chosen.fed && hexesBetween(candidate.moveTo, hq.hexId) < hexesBetween(chosen.moveTo, hq.hexId))) {
            chosen = { ...candidate, count, fed: fedHere };
          }
        }
        return chosen === null ? null : { hqId: id, hexId: chosen.hexId as HexId, moveTo: chosen.moveTo as HexId, covers: new Set(throwFrom(chosen.hexId).hexIds.map(String)), servable };
      };
      const first = best(firstStep.map((hexId) => ({ hexId, moveTo: hexId })));
      if (first) options.set(`${objective.hexId}|1`, [...(options.get(`${objective.hexId}|1`) ?? []), first]);
      if (discount <= 0) continue;
      const staging = [...firstStep].sort((left, right) => hexesBetween(left, objective.hexId) - hexesBetween(right, objective.hexId) || left.localeCompare(right))[0];
      const second = best([
        ...firstStep.map((hexId) => ({ hexId, moveTo: hexId })),
        ...(staging === undefined ? [] : [...reachFrom(id, staging as HexId, 'MOVE')].filter(safe).map((hexId) => ({ hexId, moveTo: staging }))),
      ]);
      if (second) options.set(`${objective.hexId}|2`, [...(options.get(`${objective.hexId}|2`) ?? []), second]);
    }
  }

  // Truck options: SP unloaded this step where a combat unit can stop now, whose draw (12.3a) reaches attack
  // positions; each truck's drops per objective, most positions covered first, then a traced drop.
  const sideTraced = new Set(access.traceCoverage().hexIds.map(String));
  // Rear dumps empty trucks load from, by hex, as the move step picks them: away from the enemy, off the objectives,
  // not an isolated garrison's emergency stock.
  const objectiveHexes = new Set(situation.objectives.map(({ hexId }) => String(hexId)));
  const pickups = new Map<string, number>();
  for (const dump of situation.own) {
    if (dump.piece.role !== 'DUMP' || String(dump.piece.id).includes('-stock-') || objectiveHexes.has(String(dump.hexId))
      || situation.nearestEnemy(dump.hexId).distance < PICKUP_SAFE_DISTANCE) continue;
    pickups.set(String(dump.hexId), (pickups.get(String(dump.hexId)) ?? 0) + (dump.piece.resourceQuantity ?? 0));
  }
  const trucks = !logistics ? [] : situation.own.filter((unit) => unit.piece.role === 'TRUCK' && !exclude.has(unit.piece.id)
    && ((unit.piece.carriedTokens ?? 0) >= TRUCK_MIN_TOKENS || ((unit.piece.carriedTokens ?? 0) === 0 && [...pickups.values()].some((tokens) => tokens >= TRUCK_MIN_TOKENS))))
    .sort((left, right) => String(left.piece.id).localeCompare(String(right.piece.id)));
  // 13.2f: loading or unloading costs 10% of the printed MA; costs are in quarter MP.
  const truckMa = (truck: OwnUnit) => (truck.profile?.movement ?? 45) * 4;
  const loadTicks = (truck: OwnUnit) => Math.round((truck.profile?.movement ?? 45) / 10) * 4;
  const costCache = new Map<string, Map<string, number>>();
  /** MP (in ticks) for the truck to drive from `hexId` to each hex it reaches from there. */
  const truckCosts = (truck: OwnUnit, hexId: string): Map<string, number> => {
    const key = `${truck.piece.id}|${hexId}`;
    let costs = costCache.get(key);
    if (!costs) {
      costs = new Map([[hexId, 0], ...access.projectedReach(truck.piece.id, hexId as HexId).map(({ hexId: hex, costTicks }) => [String(hex), costTicks] as const)]);
      costCache.set(key, costs);
    }
    return costs;
  };
  const truckOptions = new Map<HexId, TruckOption[]>();
  for (const objective of objectives) {
    const targets = new Set([...positions.values()].flatMap((byObjective) => [...(byObjective.get(objective.hexId)?.[2] ?? [])]));
    if (targets.size === 0) continue;
    const drops = [...(stagingReach.get(objective.hexId) ?? [])].filter((hexId) => !occupied(hexId)
      && hexesBetween(hexId, objective.hexId) <= DROP_OBJECTIVE_RADIUS && situation.nearestEnemy(hexId as HexId).distance >= DROP_SAFE_DISTANCE)
      .map((hexId) => ({ hexId, covers: access.drawReach(hexId as HexId) }))
      .map(({ hexId, covers }) => ({ hexId, covers, count: [...targets].filter((hex) => covers.has(hex)).length }))
      .filter(({ count }) => count > 0)
      .sort((left, right) => right.count - left.count || Number(sideTraced.has(right.hexId)) - Number(sideTraced.has(left.hexId))
        || hexesBetween(left.hexId, objective.hexId) - hexesBetween(right.hexId, objective.hexId) || left.hexId.localeCompare(right.hexId));
    const list = trucks.flatMap((truck): TruckOption[] => {
      const costs = truckCosts(truck, String(truck.hexId));
      const reached = drops.filter(({ hexId }) => (costs.get(hexId) ?? Infinity) + loadTicks(truck) <= truckMa(truck)).map(({ hexId, covers }) => ({ hexId: hexId as HexId, covers }));
      return reached.length > 0 ? [{ truck, carried: truck.piece.carriedTokens ?? 0, drops: reached }] : [];
    });
    if (list.length > 0) truckOptions.set(objective.hexId, list);
  }

  const denied = new Set<string>();
  const taken = new Set<string>();
  const optionsFor = (hexId: HexId, step: 1 | 2) => (options.get(`${hexId}|${step}`) ?? []).filter(({ hqId }) => !taken.has(`${hqId}|${hexId}|${step}`));
  const truckOptionsFor = (hexId: HexId) => (truckOptions.get(hexId) ?? []).filter(({ truck }) => !taken.has(`${truck.piece.id}|${hexId}`));
  const tracedAt = (unitId: PieceId, hexes: ReadonlySet<string>) => [...hexes].some((hex) => traced.get(unitId)!.has(hex));
  /** A dump that reaches the unit at one of these hexes and still holds what it needs there, from `left` when given. */
  const feedFor = (unitId: PieceId, hexes: ReadonlySet<string>, left?: ReadonlyMap<string, number>) => feeds.get(unitId)!
    .find(({ dumpId, tokens, hexIds }) => (left?.get(dumpId) ?? tokens) >= need.get(unitId)! && [...hexes].some((hex) => hexIds.has(hex)));
  /** Whether trace now or SP a dump already holds supply the unit at one of these hexes. */
  const selfSupplied = (unitId: PieceId, hexes: ReadonlySet<string>) => tracedAt(unitId, hexes) || feedFor(unitId, hexes) !== undefined;
  /** Attack hexes the unit reaches by `step` that its trace, a dump, or an HQ or truck still allowed for that step supplies. */
  const supplied = (unitId: PieceId, hexId: HexId, step: 1 | 2): boolean => {
    const hexes = positions.get(unitId)!.get(hexId)?.[step];
    if (!hexes || hexes.size === 0) return false;
    if (selfSupplied(unitId, hexes)) return true;
    if (optionsFor(hexId, step).some(({ covers, servable }) => servable.has(unitId) && [...hexes].some((hex) => covers.has(hex)))) return true;
    return truckOptionsFor(hexId).some(({ drops }) => drops.some(({ covers }) => [...hexes].some((hex) => covers.has(hex))));
  };
  const points = new Map(objectives.map(({ hexId, points: vp }) => [hexId, vp]));
  const cache = new Map<string, number>();
  const columns = new Map<string, { line: CombatLine; index: number }>();
  const probability = (hexId: HexId, unitIds: readonly PieceId[]): number => {
    if (unitIds.length === 0) return 0;
    const stack = situation.enemy.get(hexId);
    if (!stack?.hasCombatUnit) return 1;
    const key = `${hexId}|${[...unitIds].sort().join('+')}`;
    const cached = cache.get(key);
    if (cached !== undefined) return cached;
    const planned = access.attackStrength(unitIds, hexId);
    const options = planned.options.length > 0 ? planned.options : [{ line: 'OPEN' as CombatLine, strengths: [] }];
    const chosen = options.map((option) => ({ line: option.line, column: columnIndex(option.strengths.reduce((sum, { strength }) => sum + strength, 0), stack.strength, COMBAT_TABLE_COLUMNS[option.line]) }))
      .reduce((low, next) => (next.column < low.column ? next : low));
    columns.set(key, { line: chosen.line, index: chosen.column });
    const ownRating = Math.max(...unitIds.map((id) => byId.get(id)?.profile?.actionRating ?? 0));
    const seen = stack.pieces.filter((piece) => piece.role === 'COMBAT').map(rating);
    const value = captureProbability({ column: chosen.column, drm: ownRating - (seen.length > 0 ? Math.max(...seen) : 2), defenderCanPay: true, hedgehogLevel: planned.hedgehogLevel, line: chosen.line });
    cache.set(key, value);
    return value;
  };

  const allocate = () => {
    // The step on which each unit can be at each objective, in place and supplied.
    const arrival = new Map(units.map((unit) => {
      const steps = new Map<HexId, 1 | 2>();
      for (const objective of objectives) {
        if (denied.has(`${unit.piece.id}|${objective.hexId}`)) continue;
        if (supplied(unit.piece.id, objective.hexId, 1)) steps.set(objective.hexId, 1);
        else if (discount > 0 && supplied(unit.piece.id, objective.hexId, 2)) steps.set(objective.hexId, 2);
      }
      return [unit.piece.id, steps] as const;
    }));
    const usable = new Map(units.map(({ piece }) => [piece.id, objectives.filter(({ hexId }) => arrival.get(piece.id)!.has(hexId))]));
    const turnOf = (hexId: HexId, members: readonly PieceId[]): 1 | 2 => (members.some((id) => arrival.get(id)!.get(hexId) === 2) ? 2 : 1);
    const chanceOf = (hexId: HexId, members: readonly PieceId[]) => probability(hexId, members) * (turnOf(hexId, members) === 2 ? discount : 1);
    const groups = new Map<HexId, PieceId[]>();
    const valueOf = (hexId: HexId, members: readonly PieceId[]) => points.get(hexId)! * chanceOf(hexId, members);
    const proposal = (ids: readonly PieceId[], target: HexId | null) => {
      const affected = new Set<HexId>([...ids.map((id) => [...groups].find(([, members]) => members.includes(id))?.[0]).filter((hexId): hexId is HexId => hexId !== undefined), ...(target ? [target] : [])]);
      const next = new Map<HexId, PieceId[]>();
      let gain = 0;
      for (const hexId of affected) {
        const before = groups.get(hexId) ?? [];
        const after = [...before.filter((id) => !ids.includes(id)), ...(hexId === target ? ids : [])];
        next.set(hexId, after);
        gain += valueOf(hexId, after) - valueOf(hexId, before);
      }
      return { next, gain };
    };
    const apply = (next: ReadonlyMap<HexId, PieceId[]>) => { for (const [hexId, members] of next) groups.set(hexId, members); };
    const ids = units.map(({ piece }) => piece.id).filter((id) => usable.get(id)!.length > 0);
    const free = new Set(ids);
    for (;;) {
      let best: { id: PieceId; gain: number; next: Map<HexId, PieceId[]> } | null = null;
      for (const id of free) {
        for (const objective of usable.get(id)!) {
          const { next, gain } = proposal([id], objective.hexId);
          if (gain > 1e-9 && (best === null || gain > best.gain)) best = { id, gain, next };
        }
      }
      if (!best) break;
      apply(best.next);
      free.delete(best.id);
    }
    for (let pass = 0, improved = true; improved && pass < 20; pass++) {
      improved = false;
      for (let i = 0; i < ids.length; i++) {
        for (let j = i + 1; j < ids.length; j++) {
          for (const objective of usable.get(ids[i]!)!.filter((candidate) => blocked(candidate.hexId) && usable.get(ids[j]!)!.includes(candidate))) {
            const members = groups.get(objective.hexId) ?? [];
            if (members.includes(ids[i]!) && members.includes(ids[j]!)) continue;
            const { next, gain } = proposal([ids[i]!, ids[j]!], objective.hexId);
            if (gain > 1e-9) { apply(next); improved = true; break; }
          }
        }
      }
      for (const id of ids) {
        const from = [...groups].find(([, members]) => members.includes(id))?.[0] ?? null;
        for (const target of [null, ...usable.get(id)!.map(({ hexId }) => hexId)]) {
          if (target === from) continue;
          const { next, gain } = proposal([id], target);
          if (gain > 1e-9) { apply(next); improved = true; break; }
        }
      }
    }
    return [...groups].filter(([, members]) => members.length > 0).map(([hexId, unitIds]) => ({
      hexId, defended: blocked(hexId), turn: turnOf(hexId, unitIds), unitIds,
      probability: probability(hexId, unitIds), chance: chanceOf(hexId, unitIds), value: valueOf(hexId, unitIds),
      column: columns.get(`${hexId}|${[...unitIds].sort().join('+')}`) ?? null,
    })).sort((left, right) => right.value - left.value || String(left.hexId).localeCompare(String(right.hexId)));
  };

  /**
   * The combat unit that stops at `drop` this step so the group's trucks may unload there (13.2f), with the Tokens it
   * eats there this step (12.6c) when the drop is outside its trace and no dump feeds it. A member of a next-step group
   * that still reaches an attack position from the drop next step, or a unit no group uses (`idle`); the one that eats
   * least, a member first.
   */
  const stagerFor = (group: TheaterGroup, drop: HexId, idle: ReadonlySet<PieceId>): { id: PieceId; eats: number; member: boolean } | undefined =>
    [...(group.turn === 2 ? group.unitIds : []), ...idle].flatMap((id) => {
      const member = group.unitIds.includes(id);
      if (!nowReach.get(`${id}|${group.hexId}`)?.has(String(drop))) return [];
      if (member && attackHexes(reachFrom(id, drop, modeOf.get(`${id}|${group.hexId}`) ?? null), group.hexId).size === 0) return [];
      return [{ id, eats: selfSupplied(id, new Set([String(drop)])) ? 0 : eating(id), member }];
    }).sort((left, right) => left.eats - right.eats || Number(right.member) - Number(left.member) || String(left.id).localeCompare(String(right.id)))[0];

  /**
   * What the truck brings to `drop` this step within its MA (13.2f): its cargo, or what it can carry (`truckTokens`) of
   * the rear dump that gives the most Tokens (then the shortest run) when it drives there, loads, drives on and unloads.
   */
  const truckLoad = (option: TruckOption, drop: HexId, left: ReadonlyMap<string, number>): { capacity: number; pickup: HexId | null } | null => {
    const { truck } = option;
    const from = truckCosts(truck, String(truck.hexId));
    if (option.carried > 0) return (from.get(String(drop)) ?? Infinity) + loadTicks(truck) <= truckMa(truck) ? { capacity: option.carried, pickup: null } : null;
    let best: { capacity: number; pickup: HexId; cost: number } | null = null;
    for (const [hexId, tokens] of left) {
      if (tokens < TRUCK_MIN_TOKENS || hexesBetween(hexId, drop) <= DELIVERED_RADIUS) continue;
      const cost = (from.get(hexId) ?? Infinity) + loadTicks(truck) + (truckCosts(truck, hexId).get(String(drop)) ?? Infinity) + loadTicks(truck);
      if (cost > truckMa(truck)) continue;
      const capacity = Math.min(tokens, truckTokens(truck));
      if (capacity < TRUCK_MIN_TOKENS) continue;
      if (best === null || capacity > best.capacity || (capacity === best.capacity && (cost < best.cost || (cost === best.cost && hexId < String(best.pickup))))) best = { capacity, pickup: hexId as HexId, cost };
    }
    return best;
  };

  // Groups in order of value take supply: members out of trace eat and draw combat supply from dumps while their
  // Tokens last; then one HQ at most, and trucks, cover the rest. A truck brings what `truckLoad` says and serves only
  // the members whose needs fit; a group's trucks unload at one drop, where its stager stops (13.2f). Members nothing
  // free covers lose that objective, an HQ or truck already given to a group is not offered to another, and the
  // allocation runs again.
  /**
   * With `bridge`, HQs no group uses go, best bridge first, where they draw the most SP of piles no front unit can draw
   * now (a combat unit other than an HQ within 4 hexes of the enemy, or a group's attack position) and throw to the
   * front; each pile is bridged once, and an HQ that bridges a pile where it stands stays. The HQ must be able to move
   * now (or pay fuel, 12.5a), and its throw from the bridge must still cover every unit it covers now without direct trace.
   */
  // Other HQs may move first this step, so a bridge or trace advance keeps every unit the HQ's throw covers now that has no direct trace.
  const keepsThrow = (hq: OwnUnit, hexId: string) => {
    const now = currentThrow.get(hq.piece.id)!;
    const covered = new Set(now.hexIds.map(String));
    const from = new Set(access.hqThrow(hq.piece.id, hexId as HexId).hexIds.map(String));
    return situation.own.every((unit) => unit.piece.id === hq.piece.id || !situation.isCombatUnit(unit) || !now.servableIds.includes(unit.piece.id)
      || !covered.has(String(unit.hexId)) || sideDirect.has(String(unit.hexId)) || from.has(String(unit.hexId)));
  };
  const bridgesFor = (groups: readonly TheaterGroup[], used: ReadonlySet<PieceId>): HqBridge[] => {
    if (!bridge) return [];
    const front = new Set([
      ...situation.own.filter((unit) => situation.isCombatUnit(unit) && unit.piece.role !== 'HQ' && situation.nearestEnemy(unit.hexId).distance <= 4).map(({ hexId }) => String(hexId)),
      ...groups.flatMap((group) => group.unitIds.flatMap((id) => [...(positions.get(id)?.get(group.hexId)?.[group.turn] ?? [])])),
    ]);
    const throwsToFront = (hqId: PieceId, hexId: string) => access.hqThrow(hqId, hexId as HexId).hexIds.some((hex) => front.has(String(hex)));
    const piles = access.feedCoverage().filter(({ dumpId }) => !String(dumpId).includes('-stock-'))
      .map(({ dumpId, tokens, hexIds }) => ({ dumpId, tokens, drawn: hexIds.some((hex) => front.has(String(hex))), unit: situation.own.find(({ piece }) => piece.id === dumpId) }))
      .filter((pile) => pile.unit !== undefined && pile.unit.piece.role === 'DUMP' && pile.tokens > 0)
      .map((pile) => ({ ...pile, hexId: String(pile.unit!.hexId), reach: access.drawReach(pile.unit!.hexId) }));
    const left = piles.filter(({ drawn }) => !drawn);
    // 12.5a: an HQ that cannot move now and has no fuel to pay stays where it is.
    const free = hqUnits.filter((hq) => logistics && !used.has(hq.piece.id) && !exclude.has(hq.piece.id) && firstSteps.has(hq.piece.id)
      && (access.movementRange(hq.piece.id).length > 0 || access.candidates('PAY_FUEL', hq.piece.id).length > 0))
      // An HQ that already carries a pile's SP to the front where it stands keeps doing it.
      .filter((hq) => !(throwsToFront(hq.piece.id, String(hq.hexId)) && piles.some((pile) => pile.drawn && pile.reach.has(String(hq.hexId)))));
    const bridges: HqBridge[] = [];
    for (;;) {
      let best: { hq: OwnUnit; hexId: string; tokens: number } | null = null;
      for (const hq of free.filter((candidate) => !bridges.some(({ hqId }) => hqId === candidate.piece.id))) {
        for (const hexId of firstSteps.get(hq.piece.id)!) {
          const tokens = left.filter((pile) => pile.reach.has(hexId)).reduce((sum, pile) => sum + pile.tokens, 0);
          if (tokens < BRIDGE_MIN_TOKENS || (best !== null && (tokens < best.tokens || (tokens === best.tokens
            && hexesBetween(hexId, hq.hexId) >= hexesBetween(best.hexId, best.hq.hexId))))) continue;
          if (!throwsToFront(hq.piece.id, hexId) || !keepsThrow(hq, hexId)) continue;
          best = { hq, hexId, tokens };
        }
      }
      if (!best) return bridges;
      bridges.push({ hqId: best.hq.piece.id, hexId: best.hexId as HexId, tokens: best.tokens });
      for (const pile of left.filter(({ reach }) => reach.has(best!.hexId))) left.splice(left.indexOf(pile), 1);
    }
  };

  /**
   * With `advanceTraceMinVp > 0`, HQs no group or bridge uses advance to a safe, fed hex (keeping current trace
   * dependents) whose throw covers uncovered open objectives with nearby friendly combat units (S15).
   */
  const traceAdvancesFor = (keptGroups: readonly TheaterGroup[], hqs: readonly HqPlacement[], bridges: readonly HqBridge[]): HqTraceAdvance[] => {
    if (advanceTraceMinVp <= 0 || !logistics) return [];
    const activeGroups = keptGroups.filter(({ chance }) => chance >= minProbability);
    const activeHqs = hqs.filter(({ objective }) => activeGroups.some(({ hexId }) => hexId === objective));
    const activeUsed = new Set(activeHqs.map(({ hqId }) => hqId));
    const bridgedIds = new Set(bridges.filter(({ hqId }) => !activeUsed.has(hqId)).map(({ hqId }) => hqId));
    const free = hqUnits.filter((hq) => !activeUsed.has(hq.piece.id) && !bridgedIds.has(hq.piece.id) && !exclude.has(hq.piece.id)
      && firstSteps.has(hq.piece.id)
      && (access.movementRange(hq.piece.id).length > 0 || access.candidates('PAY_FUEL', hq.piece.id).length > 0));
    if (free.length === 0) return [];
    const freeIds = new Set(free.map(({ piece }) => piece.id));
    const covered = new Set<string>(sideDirect);
    for (const p of activeHqs) for (const h of access.hqThrow(p.hqId, p.moveTo).hexIds) covered.add(String(h));
    for (const b of bridges) if (bridgedIds.has(b.hqId)) for (const h of access.hqThrow(b.hqId, b.hexId).hexIds) covered.add(String(h));
    for (const hq of hqUnits) {
      if (activeUsed.has(hq.piece.id) || bridgedIds.has(hq.piece.id) || freeIds.has(hq.piece.id)) continue;
      const now = currentThrow.get(hq.piece.id);
      if (now?.fed) for (const h of now.hexIds) covered.add(String(h));
    }
    const ownCombat = situation.own.filter((unit) => situation.isCombatUnit(unit) && unit.piece.role !== 'HQ');
    let remaining = objectives.filter((obj) => ![...covered].some((h) => hexesBetween(h, obj.hexId) <= 1)
      && ownCombat.some((u) => hexesBetween(u.hexId, obj.hexId) <= TRACE_ADVANCE_TROOP_RADIUS));
    const advances: HqTraceAdvance[] = [];
    const chosenHqs = new Set<PieceId>();
    for (;;) {
      if (remaining.length === 0) return advances;
      let best: { hq: OwnUnit; hexId: string; vp: number; hasDump: boolean; dist: number; reached: readonly typeof remaining[number][] } | null = null;
      for (const hq of free) {
        if (chosenHqs.has(hq.piece.id)) continue;
        const hqFed = hqFedById.get(hq.piece.id);
        for (const hexId of firstSteps.get(hq.piece.id)!) {
          if (!remaining.some((obj) => hexesBetween(hexId, obj.hexId) <= HQ_OBJECTIVE_RADIUS)) continue;
          const thrown = access.hqThrow(hq.piece.id, hexId as HexId);
          if (!thrown.fed) continue;
          const reached = remaining.filter((obj) => thrown.hexIds.some((h) => hexesBetween(h, obj.hexId) <= 1));
          const vp = reached.reduce((total, obj) => total + obj.points, 0);
          if (vp < advanceTraceMinVp) continue;
          const hasDump = hqFed?.has(hexId) ?? false;
          const dist = hexesBetween(hexId, hq.hexId);
          if (best !== null && (vp < best.vp
            || (vp === best.vp && Number(hasDump) < Number(best.hasDump))
            || (vp === best.vp && hasDump === best.hasDump && dist > best.dist)
            || (vp === best.vp && hasDump === best.hasDump && dist === best.dist && hexId.localeCompare(best.hexId) >= 0))) continue;
          if (!keepsThrow(hq, hexId)) continue;
          best = { hq, hexId, vp, hasDump, dist, reached };
        }
      }
      if (!best) return advances;
      advances.push({ hqId: best.hq.piece.id, hexId: best.hexId as HexId, vp: best.vp });
      chosenHqs.add(best.hq.piece.id);
      const reachedHexes = new Set(best.reached.map((obj) => String(obj.hexId)));
      remaining = remaining.filter((obj) => !reachedHexes.has(String(obj.hexId)));
    }
  };

  for (let round = 0; ; round++) {
    const groups = allocate();
    const activeGroups = minProbability > 0 ? groups.filter(({ chance }) => chance >= minProbability) : groups;
    const used = new Set<PieceId>();
    const hqs: HqPlacement[] = [];
    const sent: TruckPlacement[] = [];
    const kept: TheaterGroup[] = [];
    const dumpLeft = new Map<string, number>();
    for (const list of feeds.values()) for (const { dumpId, tokens } of list) dumpLeft.set(dumpId, tokens);
    const pickupLeft = new Map(pickups);
    // Units no active group uses this round may stand at a drop; each stands at one.
    const idle = new Set(units.map(({ piece }) => piece.id).filter((id) => !activeGroups.some(({ unitIds }) => unitIds.includes(id))));
    let changed = false;
    for (const group of activeGroups) {
      const step = group.turn;
      const hexesOf = (id: PieceId) => positions.get(id)!.get(group.hexId)![step];
      const drawn = new Map<string, number>();
      const needing = group.unitIds.filter((id) => {
        if (tracedAt(id, hexesOf(id))) return false;
        const left = new Map([...dumpLeft].map(([dumpId, tokens]) => [dumpId, tokens - (drawn.get(dumpId) ?? 0)]));
        const source = feedFor(id, hexesOf(id), left);
        if (!source) return true;
        drawn.set(source.dumpId, (drawn.get(source.dumpId) ?? 0) + need.get(id)!);
        return false;
      });
      const draw = () => { for (const [dumpId, tokens] of drawn) dumpLeft.set(dumpId, dumpLeft.get(dumpId)! - tokens); };
      if (needing.length === 0) { draw(); kept.push(group); continue; }
      for (const option of optionsFor(group.hexId, step).filter(({ hqId }) => used.has(hqId))) taken.add(`${option.hqId}|${group.hexId}|${step}`);
      for (const option of truckOptionsFor(group.hexId).filter(({ truck }) => used.has(truck.piece.id))) taken.add(`${option.truck.piece.id}|${group.hexId}`);
      const hq = optionsFor(group.hexId, step)
        .map((option) => ({ option, served: needing.filter((id) => option.servable.has(id) && [...hexesOf(id)].some((hex) => option.covers.has(hex))) }))
        .sort((left, right) => right.served.length - left.served.length || String(left.option.hqId).localeCompare(String(right.option.hqId)))[0];
      const afterHq = needing.filter((id) => !(hq?.served.includes(id) ?? false));
      // Trucks for the group unload at one drop, where one member stops: the drop whose trucks feed the most members.
      type Run = { option: TruckOption; tokens: number; load: { capacity: number; pickup: HexId | null } };
      let trucksFor: { drop: HexId; stagerId: PieceId; runs: Run[]; served: PieceId[] } | null = null;
      // The stager's meal at an untraced drop rides on the first truck.
      if (afterHq.length > 0) {
        const available = truckOptionsFor(group.hexId).filter(({ truck }) => !used.has(truck.piece.id));
        const tried = new Set<string>();
        for (const drop of available.flatMap(({ drops }) => drops)) {
          if (tried.has(drop.hexId)) continue;
          tried.add(drop.hexId);
          const stager = stagerFor(group, drop.hexId, idle);
          let remaining = afterHq.filter((id) => [...hexesOf(id)].some((hex) => drop.covers.has(hex)));
          if (stager === undefined || remaining.length <= (trucksFor?.served.length ?? 0)) continue;
          let meal = stager.eats;
          const left = new Map(pickupLeft);
          const runs: Run[] = [];
          const served: PieceId[] = [];
          for (const option of available.filter(({ drops }) => drops.some(({ hexId }) => hexId === drop.hexId))) {
            if (remaining.length === 0) break;
            const load = truckLoad(option, drop.hexId, left);
            if (load === null) continue;
            let tokens = meal;
            const mine = remaining.filter((id) => {
              if (tokens + need.get(id)! > load.capacity) return false;
              tokens += need.get(id)!;
              return true;
            });
            if (mine.length === 0) continue;
            meal = 0;
            if (load.pickup !== null) left.set(String(load.pickup), left.get(String(load.pickup))! - load.capacity);
            runs.push({ option, tokens, load });
            served.push(...mine);
            remaining = remaining.filter((id) => !mine.includes(id));
          }
          if (served.length > (trucksFor?.served.length ?? 0)) trucksFor = { drop: drop.hexId, stagerId: stager.id, runs, served };
        }
      }
      const unserved = afterHq.filter((id) => !(trucksFor?.served.includes(id) ?? false));
      if (unserved.length > 0) {
        for (const id of unserved) denied.add(`${id}|${group.hexId}`);
        changed = true;
        continue;
      }
      draw();
      if (hq && hq.served.length > 0) {
        used.add(hq.option.hqId);
        hqs.push({ hqId: hq.option.hqId, objective: group.hexId, turn: step, hexId: hq.option.hexId, moveTo: hq.option.moveTo });
      }
      if (trucksFor) idle.delete(trucksFor.stagerId);
      for (const { option, tokens, load } of trucksFor?.runs ?? []) {
        used.add(option.truck.piece.id);
        // The truck takes all it can carry from the dump, not only what the group needs.
        if (load.pickup !== null) pickupLeft.set(String(load.pickup), pickupLeft.get(String(load.pickup))! - load.capacity);
        sent.push({ truckId: option.truck.piece.id, objective: group.hexId, drop: trucksFor!.drop, stagerId: trucksFor!.stagerId, tokens, pickup: load.pickup });
      }
      kept.push(group);
    }
    // After the last round, groups still short of supply are left out.
    if (!changed || round + 1 >= SUPPLY_ROUNDS) {
      const bridges = bridgesFor(kept, used);
      return { groups: kept, hqs, trucks: sent, bridges, traceAdvances: traceAdvancesFor(kept, hqs, bridges) };
    }
  }
};
