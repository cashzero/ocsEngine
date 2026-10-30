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

/** A truck sent to unload SP this step where a next-step group's members can eat at their attack positions next step (12.6c). */
export interface TruckPlacement {
  readonly truckId: PieceId;
  readonly objective: HexId;
  readonly drop: HexId;
}

export interface TheaterPlan {
  readonly groups: readonly TheaterGroup[];
  readonly hqs: readonly HqPlacement[];
  readonly trucks: readonly TruckPlacement[];
}

/** An HQ is placed this many hexes or more from enemy units (closer, the move step scores it exposed). */
const HQ_SAFE_DISTANCE = 3;
/** HQ positions farther than this from an objective are not tried for it (a throw is a few hexes). */
const HQ_OBJECTIVE_RADIUS = 10;
/** Rounds of allocation, HQ and truck assignment and dropping the unit/objective pairs nothing free can supply. */
const SUPPLY_ROUNDS = 8;
/** SP are unloaded in a friendly-held, traced hex at least this far from the enemy (the move step's drop rule) ... */
const DROP_SAFE_DISTANCE = 3;
/** ... and within this many hexes of the objective. */
const DROP_OBJECTIVE_RADIUS = 6;
/** A truck counts for a drop when it carries this many Tokens or a rear dump holds them. */
const TRUCK_MIN_TOKENS = 2;
/** Rear dumps trucks load from stand at least this far from the enemy (the move step's pickup rule). */
const PICKUP_SAFE_DISTANCE = 5;

interface TruckOption {
  readonly truckId: PieceId;
  readonly drop: HexId;
  readonly covers: ReadonlySet<string>;
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
 * enter, or a defended one beside which they can stop, this step or the next, where trace supply reaches them on that
 * step, since the move step refuses a move out of trace. Reach assumes fuel paid (12.5a) and the mode `modeFor` says
 * the unit takes as it begins to move (5.4): this step from where the unit stands, the next step also from the hex of
 * this step's reach nearest the objective. Supply on a step is the unit's trace now, SP a dump already holds that
 * it can eat there (12.6c), the throw of an HQ placed for that step, or, for a next-step group, SP a truck unloads
 * this step: an HQ moves this step (it moves before the combat units) to a hex 3+ from the enemy where a Supply Source
 * still feeds it and its throw still covers the units only it supplies now, or, for a next-step group, also once more
 * from the hex of that reach nearest the objective; a truck (it moves after the combat units) unloads in a traced hex
 * 3+ from the enemy that a member can reach this step, whose draw (12.3a) reaches the attack positions. Each HQ and
 * each truck serves one group; a unit/objective pair nothing free can supply is dropped and the allocation repeated. A defended objective's capture probability comes from the rules'
 * planned strengths under the defender's best terrain, the estimated enemy strength, the best ratings on each side (an
 * unseen defender rating counts 2) and the defender assumed supplied; a group with a member that gets there only next
 * step is worth that times `discount`. Greedy by marginal value, then pairs and single units moved while the total
 * improves.
 */
export const allocateTheater = (situation: Situation, access: BotActionAccess, exclude: ReadonlySet<PieceId>,
  rating: (piece: ProjectedPiece) => number, discount: number,
  modeFor: (unit: OwnUnit, objective: HexId, defended: boolean) => OcsMode | null): TheaterPlan => {
  const me = situation.playerId;
  const objectives = situation.objectives.filter((objective) => objective.controllerId !== me);
  if (objectives.length === 0) return { groups: [], hqs: [], trucks: [] };
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
  // Out of trace a unit may eat from a dump whose SP reach it (12.6c): 1T per 2 RE, at least 1T.
  const fed = new Map(units.map((unit) => {
    const cost = Math.max(1, Math.ceil((unit.profile?.re ?? 1) / 2));
    return [unit.piece.id, new Set(access.feedCoverage(unit.piece.id).filter(({ tokens }) => tokens >= cost).flatMap(({ hexIds }) => hexIds.map(String)))];
  }));
  const stagingReach = new Map<HexId, Set<string>>();
  // Attack hexes each unit reaches by each step (the next step's include this step's).
  const positions = new Map(units.map((unit) => {
    const byObjective = new Map<HexId, { 1: Set<string>; 2: Set<string> }>();
    for (const objective of objectives) {
      const mode = modeFor(unit, objective.hexId, blocked(objective.hexId));
      const now = reachFrom(unit.piece.id, unit.hexId, mode);
      if (!stagingReach.has(objective.hexId)) stagingReach.set(objective.hexId, new Set());
      for (const hex of now) stagingReach.get(objective.hexId)!.add(hex);
      const first = attackHexes(now, objective.hexId);
      const second = new Set(first);
      const stride = Math.max(...[...now].map((hex) => hexesBetween(unit.hexId, hex)));
      if (discount > 0 && hexesBetween(unit.hexId, objective.hexId) <= 2 * stride + 1) {
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
    const safe = (hexId: string) => hexId === String(hq.hexId) || (!occupied(hexId) && situation.nearestEnemy(hexId as HexId).distance >= HQ_SAFE_DISTANCE);
    const throwFrom = (hexId: string) => access.hqThrow(id, hexId as HexId);
    const keepsDependents = (hexId: string) => {
      const covers = new Set(throwFrom(hexId).hexIds.map(String));
      return dependents.every((unit) => covers.has(String(unit.hexId)));
    };
    const firstStep = [...reachFrom(id, hq.hexId, 'MOVE')].filter(safe).filter((hexId) => throwFrom(hexId).fed && keepsDependents(hexId));
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

  // Truck options for next-step groups: SP unloaded this step where a member can stand now, whose draw (12.3a) reaches
  // attack positions; each truck's best drop per objective.
  const sideTraced = new Set(access.traceCoverage().hexIds.map(String));
  const rearStock = situation.own.some((unit) => unit.piece.role === 'DUMP' && (unit.piece.resourceQuantity ?? 0) >= TRUCK_MIN_TOKENS
    && situation.nearestEnemy(unit.hexId).distance >= PICKUP_SAFE_DISTANCE);
  const trucks = situation.own.filter((unit) => unit.piece.role === 'TRUCK' && (rearStock || (unit.piece.carriedTokens ?? 0) >= TRUCK_MIN_TOKENS))
    .sort((left, right) => String(left.piece.id).localeCompare(String(right.piece.id)));
  const truckReach = new Map(trucks.map((truck) => [truck.piece.id, reachFrom(truck.piece.id, truck.hexId, null)]));
  const truckOptions = new Map<HexId, TruckOption[]>();
  if (discount > 0) {
    for (const objective of objectives) {
      const targets = new Set([...positions.values()].flatMap((byObjective) => [...(byObjective.get(objective.hexId)?.[2] ?? [])]));
      if (targets.size === 0) continue;
      const drops = [...(stagingReach.get(objective.hexId) ?? [])].filter((hexId) => !occupied(hexId) && sideTraced.has(hexId)
        && hexesBetween(hexId, objective.hexId) <= DROP_OBJECTIVE_RADIUS && situation.nearestEnemy(hexId as HexId).distance >= DROP_SAFE_DISTANCE)
        .map((hexId) => ({ hexId, covers: access.drawReach(hexId as HexId) }))
        .map(({ hexId, covers }) => ({ hexId, covers, count: [...targets].filter((hex) => covers.has(hex)).length }))
        .filter(({ count }) => count > 0)
        .sort((left, right) => right.count - left.count || hexesBetween(left.hexId, objective.hexId) - hexesBetween(right.hexId, objective.hexId) || left.hexId.localeCompare(right.hexId));
      const list = trucks.flatMap((truck) => {
        const drop = drops.find(({ hexId }) => truckReach.get(truck.piece.id)!.has(hexId));
        return drop ? [{ truckId: truck.piece.id, drop: drop.hexId as HexId, covers: drop.covers }] : [];
      });
      if (list.length > 0) truckOptions.set(objective.hexId, list);
    }
  }

  const denied = new Set<string>();
  const taken = new Set<string>();
  const optionsFor = (hexId: HexId, step: 1 | 2) => (options.get(`${hexId}|${step}`) ?? []).filter(({ hqId }) => !taken.has(`${hqId}|${hexId}|${step}`));
  const truckOptionsFor = (hexId: HexId) => (truckOptions.get(hexId) ?? []).filter(({ truckId }) => !taken.has(`${truckId}|${hexId}`));
  /** Whether trace now or SP a dump already holds supply the unit at one of these hexes. */
  const selfSupplied = (unitId: PieceId, hexes: ReadonlySet<string>) => [...hexes].some((hex) => traced.get(unitId)!.has(hex) || fed.get(unitId)!.has(hex));
  /** Attack hexes the unit reaches by `step` that its trace, a dump, or an HQ or truck still allowed for that step supplies. */
  const supplied = (unitId: PieceId, hexId: HexId, step: 1 | 2): boolean => {
    const hexes = positions.get(unitId)!.get(hexId)?.[step];
    if (!hexes || hexes.size === 0) return false;
    if (selfSupplied(unitId, hexes)) return true;
    if (optionsFor(hexId, step).some(({ covers, servable }) => servable.has(unitId) && [...hexes].some((hex) => covers.has(hex)))) return true;
    return step === 2 && truckOptionsFor(hexId).some(({ covers }) => [...hexes].some((hex) => covers.has(hex)));
  };
  const points = new Map(objectives.map(({ hexId, points: vp }) => [hexId, vp]));
  const cache = new Map<string, number>();
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
    })).sort((left, right) => right.value - left.value || String(left.hexId).localeCompare(String(right.hexId)));
  };

  // HQs, then trucks, go to groups in order of value: one HQ and one truck per group at most, covering every member
  // that neither its trace nor a dump supplies on the group's step. Members nothing free covers lose that objective,
  // an HQ or truck already given to a group is not offered to another, and the allocation runs again.
  for (let round = 0; ; round++) {
    const groups = allocate();
    const used = new Set<PieceId>();
    const hqs: HqPlacement[] = [];
    const sent: TruckPlacement[] = [];
    const kept: TheaterGroup[] = [];
    let changed = false;
    for (const group of groups) {
      const step = group.turn;
      const hexesOf = (id: PieceId) => positions.get(id)!.get(group.hexId)![step];
      const needing = group.unitIds.filter((id) => !selfSupplied(id, hexesOf(id)));
      if (needing.length === 0) { kept.push(group); continue; }
      for (const option of optionsFor(group.hexId, step).filter(({ hqId }) => used.has(hqId))) taken.add(`${option.hqId}|${group.hexId}|${step}`);
      for (const option of truckOptionsFor(group.hexId).filter(({ truckId }) => used.has(truckId))) taken.add(`${option.truckId}|${group.hexId}`);
      const hq = optionsFor(group.hexId, step)
        .map((option) => ({ option, served: needing.filter((id) => option.servable.has(id) && [...hexesOf(id)].some((hex) => option.covers.has(hex))) }))
        .sort((left, right) => right.served.length - left.served.length || String(left.option.hqId).localeCompare(String(right.option.hqId)))[0];
      const afterHq = needing.filter((id) => !(hq?.served.includes(id) ?? false));
      const truck = step === 2 && afterHq.length > 0 ? truckOptionsFor(group.hexId)
        .map((option) => ({ option, served: afterHq.filter((id) => [...hexesOf(id)].some((hex) => option.covers.has(hex))) }))
        .sort((left, right) => right.served.length - left.served.length || String(left.option.truckId).localeCompare(String(right.option.truckId)))[0] : undefined;
      const unserved = afterHq.filter((id) => !(truck?.served.includes(id) ?? false));
      if (unserved.length > 0) {
        for (const id of unserved) denied.add(`${id}|${group.hexId}`);
        changed = true;
        continue;
      }
      if (hq && hq.served.length > 0) {
        used.add(hq.option.hqId);
        hqs.push({ hqId: hq.option.hqId, objective: group.hexId, turn: step, hexId: hq.option.hexId, moveTo: hq.option.moveTo });
      }
      if (truck && truck.served.length > 0) {
        used.add(truck.option.truckId);
        sent.push({ truckId: truck.option.truckId, objective: group.hexId, drop: truck.option.drop });
      }
      kept.push(group);
    }
    // After the last round, groups still short of supply are left out.
    if (!changed || round + 1 >= SUPPLY_ROUNDS) return { groups: kept, hqs, trucks: sent };
  }
};
