import type { HexId, PieceId } from '../../core/index.js';
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

/**
 * Units (not `exclude`d, with a combat strength) go to objectives the player does not hold: an empty one they can
 * enter, or a defended one beside which they can stop, this step or the next. Reach assumes fuel paid (12.5a): this
 * step from where the unit stands, the next from the hex of this step's reach nearest the objective. A defended
 * objective's capture probability comes from the rules' planned strengths under the defender's best terrain, the
 * estimated enemy strength, the best ratings on each side (an unseen defender rating counts 2) and the defender assumed
 * supplied; a group with a member that gets there only next step is worth that times `discount`. Greedy by marginal
 * value, then pairs and single units moved while the total improves.
 */
export const allocateTheater = (situation: Situation, access: BotActionAccess, exclude: ReadonlySet<PieceId>,
  rating: (piece: ProjectedPiece) => number, discount: number): readonly TheaterGroup[] => {
  const me = situation.playerId;
  const objectives = situation.objectives.filter((objective) => objective.controllerId !== me);
  if (objectives.length === 0) return [];
  const blocked = (hexId: string) => situation.enemy.get(hexId as HexId)?.hasCombatUnit ?? false;
  const arrives = (reach: ReadonlySet<string>, hexId: HexId) => (blocked(hexId)
    ? [...reach].some((hex) => hexesBetween(hex, hexId) === 1 && !blocked(hex))
    : reach.has(String(hexId)));
  const reachFrom = (unit: OwnUnit, hexId: HexId) => new Set([String(hexId), ...access.projectedReach(unit.piece.id, hexId).map(({ hexId: hex }) => String(hex))]);
  const units = situation.own.filter((unit) => situation.isCombatUnit(unit) && !exclude.has(unit.piece.id) && (unit.profile?.strength ?? 0) > 0)
    .sort((left, right) => String(left.piece.id).localeCompare(String(right.piece.id)));
  const byId = new Map(units.map((unit) => [unit.piece.id, unit]));
  // The step on which each unit can be at each objective it can reach within two steps.
  const arrival = new Map(units.map((unit) => {
    const now = reachFrom(unit, unit.hexId);
    const stride = Math.max(...[...now].map((hex) => hexesBetween(unit.hexId, hex)));
    const steps = new Map<HexId, 1 | 2>();
    for (const objective of objectives) {
      if (arrives(now, objective.hexId)) { steps.set(objective.hexId, 1); continue; }
      if (discount <= 0 || hexesBetween(unit.hexId, objective.hexId) > 2 * stride + 1) continue;
      const staging = [...now].filter((hex) => hex !== String(objective.hexId) && !blocked(hex))
        .sort((left, right) => hexesBetween(left, objective.hexId) - hexesBetween(right, objective.hexId) || left.localeCompare(right))[0];
      if (staging !== undefined && arrives(reachFrom(unit, staging as HexId), objective.hexId)) steps.set(objective.hexId, 2);
    }
    return [unit.piece.id, steps] as const;
  }));
  const usable = new Map(units.map(({ piece }) => [piece.id, objectives.filter(({ hexId }) => arrival.get(piece.id)!.has(hexId))]));
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
  const turnOf = (hexId: HexId, members: readonly PieceId[]): 1 | 2 => (members.some((id) => arrival.get(id)!.get(hexId) === 2) ? 2 : 1);
  const chanceOf = (hexId: HexId, members: readonly PieceId[]) => probability(hexId, members) * (turnOf(hexId, members) === 2 ? discount : 1);
  const points = new Map(objectives.map(({ hexId, points: vp }) => [hexId, vp]));
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
