import type { HexId, PieceId } from '../../core/index.js';
import type { OcsMode } from '../../domain/piece/index.js';
import type { FeedSource, GameAction, PlannedAttack, RuleExplanation } from '../../rules/index.js';
import { COMBAT_TABLE_COLUMNS } from '../../rules/tables/ocs-4.3.js';
import { analyze, type ObjectiveView, type OwnUnit, type Situation } from '../analysis.js';
import { respondToDecision } from '../decisions.js';
import { hexesBetween, knowledgeOf, type BotGameFacts } from '../knowledge.js';
import type { BotDecision, BotDecisionContext, BotPolicy, BotScoreTerm } from '../model.js';
import { forecastBarrage, forecastColumn, forecastCombat, forecastFacilityBarrage, plannedOddsColumn, type CombatForecast, type PublicFacilityTarget } from '../odds.js';
import { DEFAULT_HEURISTIC_WEIGHTS, type HeuristicWeights } from './heuristic-weights.js';

/**
 * heuristic@1: reads the position and plays to win on objectives (M9.2).
 *
 * Every player turn it sends each combat unit toward the objective worth most for the distance, garrisons threatened
 * objectives it holds, follows with HQs and artillery, hauls SP to the forward HQ, attacks and barrages where the
 * printed tables give a good expected result, and answers pending decisions in its own favour. Only legal actions
 * offered by the session are dispatched.
 */

const STACKING_LIMIT_RE = 10;

let debug: ((line: string) => void) | null = null;

interface Target {
  readonly hexId: HexId;
  readonly purpose: 'CAPTURE' | 'GARRISON' | 'HUNT' | 'FRONT' | 'RESUPPLY' | 'ASSAULT';
}

/** The main effort: one defended enemy objective, the group sent against it and where its support should stand. */
interface MainEffort {
  readonly hexId: HexId;
  readonly defenders: number;
  readonly unitIds: ReadonlySet<PieceId>;
  /** The group member nearest the objective: HQs and trucks follow it so supply keeps up (12.3b). */
  readonly lead: HexId;
  /** heuristic@81: guns that move up to barrage the objective before the group attacks (10.0). */
  readonly gunIds: ReadonlySet<PieceId>;
  /** heuristic@81: printed strength of the group's combat units. */
  readonly strength: number;
}

/** Taking enemy VP changes both scores; taking neutral VP changes only ours.
 * A held point has the same two-score exposure if the opponent takes it. */
const contestedVp = (objective: ObjectiveView): number => objective.points * (objective.controllerId === null ? 1 : 2);

/** The effort this step sends against `hexId`, if any. */
const effortAt = (notes: StepNotes, hexId: HexId): MainEffort | undefined =>
  [...(notes.effort ? [notes.effort] : []), ...(notes.secondary ?? [])].find((effort) => effort.hexId === hexId);

/**
 * Replays showed that defended objectives were never taken: both sides only picked up empty ones. Each step the
 * policy picks the defended enemy objective that is worth most for its distance and where enough friendly strength is
 * near, and sends the nearest units against it with HQs and SP following.
 *
 * heuristic@11: up to `count` efforts, each against a different defended enemy objective with units not already given
 * to an earlier one. Replays of turn 1: the side moving first attacked one garrisoned objective with everything at
 * 24:1 while the units sent to the others, uncoordinated, stopped short of them.
 */
const chooseEfforts = (context: BotDecisionContext, situation: Situation, facts: BotGameFacts, w: HeuristicWeights, count: number): MainEffort[] => {
  const efforts: MainEffort[] = [];
  const used = new Set<PieceId>();
  const limit = situation.posture === 'DEFENDER' ? Math.min(count, w.defenderMaxEfforts) : count;
  while (efforts.length < limit) {
    const next = chooseEffort(context, situation, facts, w, used, new Set(efforts.map(({ hexId }) => hexId)));
    if (!next) break;
    efforts.push(next);
    for (const unitId of [...next.unitIds, ...next.gunIds]) used.add(unitId);
  }
  return efforts;
};

/** heuristic@81: the Combat Table column `members` would get against `defenders` strength, the defender picking the terrain worst for them (9.4b). */
const plannedColumn = (plan: PlannedAttack, members: ReadonlySet<PieceId>, defenders: number): number => {
  const columns = plan.options.map(({ line, strengths }) => {
    const attack = strengths.reduce((total, { pieceId, strength }) => total + (members.has(pieceId) ? strength : 0), 0);
    return plannedOddsColumn(attack, defenders, COMBAT_TABLE_COLUMNS[line]);
  });
  return columns.length > 0 ? Math.min(...columns) : -1;
};

/**
 * The group sent against one defended enemy objective, with up to `assaultMaxGuns` guns to barrage it first.
 *
 * The attacker of an attack engagement and both sides of a meeting engagement keep the heuristic@11-79 group: the nearest
 * units within `assaultReach` until they hold 2.5 times the defenders' printed strength, with no guns. heuristic@82: the
 * attacker plays heuristic@79 exactly (no guns, `crowding` and SP at full price); with guns, stacked groups and SP pricing
 * the v81 attacker lost 7.0 ± 3.4 VP of attacker margin against v79 self-play on the development seeds. heuristic@83: so do
 * both sides of a meeting engagement, where the plan below lost 34 VP in the heuristic@82 independent run. heuristic@81 development tried sizing it to a Combat Table column under the
 * objective's terrain (Open 3:1, the column the Combat Segment would accept, or one emptying the hex half the time), with
 * and without gathering out of reach until the group could close in together; against the v79 self-play baseline every
 * variant lost attacker margin (-3 to -11 VP over 10 games), mostly by attacking defended objectives more often at lower
 * odds and leaving empty ones untaken.
 *
 * heuristic@81: the defender of an attack engagement (heuristic@83: only the defender) sizes the group, from units that
 * can be beside the objective within about two turns, to the column at which the Combat Segment would attack it
 * (`requiredColumn`), counting what the rules give the group under the objective's terrain (9.4b), against half the
 * defenders when a gun of its own can barrage them this step.
 */
const chooseEffort = (context: BotDecisionContext, situation: Situation, facts: BotGameFacts, w: HeuristicWeights, used: ReadonlySet<PieceId>, taken: ReadonlySet<HexId>): MainEffort | null => {
  const me = situation.playerId;
  const combat = situation.own.filter((unit) => situation.isCombatUnit(unit));
  const artillery = situation.own.filter((unit) => unit.piece.role === 'ARTILLERY' && !used.has(unit.piece.id));
  const garrisons = new Set(heldDefenders(situation, w).map(({ unit }) => unit.piece.id));
  let best: { hexId: HexId; defenders: number; units: OwnUnit[]; guns: OwnUnit[]; value: number } | null = null;
  for (const objective of situation.objectives) {
    if (objective.controllerId === me || taken.has(objective.hexId)) continue;
    const enemy = situation.enemy.get(objective.hexId);
    if (!enemy?.hasCombatUnit || enemy.strength <= 0) continue;
    if (situation.posture !== 'DEFENDER') {
      const near = combat.filter((unit) => !garrisons.has(unit.piece.id) && !used.has(unit.piece.id) && hexesBetween(unit.hexId, objective.hexId) <= w.assaultReach)
        .sort((left, right) => hexesBetween(left.hexId, objective.hexId) - hexesBetween(right.hexId, objective.hexId) || String(left.piece.id).localeCompare(String(right.piece.id)));
      const group: OwnUnit[] = [];
      let raw = 0;
      for (const unit of near) {
        if (raw >= enemy.strength * w.assaultRatio || group.length >= w.assaultRatioUnits) break;
        group.push(unit);
        raw += unit.profile?.strength ?? 0;
      }
      if (group.length === 0 || raw < enemy.strength * w.assaultRatio) continue;
      const distance = group.reduce((total, unit) => total + hexesBetween(unit.hexId, objective.hexId), 0) / group.length;
      const value = contestedVp(objective) / (1 + distance / 4);
      if (!best || value > best.value) best = { hexId: objective.hexId, defenders: enemy.strength, units: group, guns: [], value };
      continue;
    }
    // heuristic@81: only units that can be beside the objective within about two turns (a hex costs up to 2 MP off road):
    // groups drawn from 12 hexes gathered for turns while empty objectives went untaken.
    const available = combat.filter((unit) => !garrisons.has(unit.piece.id) && !used.has(unit.piece.id) && hexesBetween(unit.hexId, objective.hexId) <= w.assaultReach
      && hexesBetween(unit.hexId, objective.hexId) - 1 <= (unit.profile?.movement ?? 0))
      .sort((left, right) => hexesBetween(left.hexId, objective.hexId) - hexesBetween(right.hexId, objective.hexId) || String(left.piece.id).localeCompare(String(right.piece.id)));
    const plan = context.actions.attackStrength(available.map(({ piece }) => piece.id), objective.hexId);
    const needed = plan ? requiredColumn(situation, facts, w, objective.hexId, plan.hedgehogLevel) : null;
    if (!plan || needed === null) continue;
    const guns = artillery.filter((gun) => hexesBetween(gun.hexId, objective.hexId) <= w.assaultReach)
      .sort((left, right) => hexesBetween(left.hexId, objective.hexId) - hexesBetween(right.hexId, objective.hexId) || String(left.piece.id).localeCompare(String(right.piece.id)))
      .slice(0, w.assaultMaxGuns);
    // A gun within its range + 1 now fires this step from its Combat side; a DG result halves the defenders' strength.
    const firing = guns.some((gun) => hexesBetween(gun.hexId, objective.hexId) <= Math.max(1, gun.profile?.range ?? 1) + 1);
    const sized = enemy.strength * (firing ? w.barrageDefenseShare : 1);
    const members = new Set<PieceId>();
    const units: OwnUnit[] = [];
    for (const unit of available) {
      if (plannedColumn(plan, members, sized) >= needed || units.length >= w.assaultMaxUnits) break;
      units.push(unit);
      members.add(unit.piece.id);
    }
    if (units.length === 0 || plannedColumn(plan, members, sized) < needed) continue;
    const distance = units.reduce((total, unit) => total + hexesBetween(unit.hexId, objective.hexId), 0) / units.length;
    const value = contestedVp(objective) / (1 + distance / 4);
    if (!best || value > best.value) best = { hexId: objective.hexId, defenders: enemy.strength, units, guns, value };
  }
  if (!best) return null;
  const target = best.hexId;
  const lead = [...best.units].sort((left, right) => hexesBetween(left.hexId, target) - hexesBetween(right.hexId, target))[0]!.hexId;
  return {
    hexId: target, defenders: best.defenders, unitIds: new Set(best.units.map(({ piece }) => piece.id)), lead,
    gunIds: new Set(best.guns.map(({ piece }) => piece.id)),
    strength: best.units.reduce((total, unit) => total + (unit.profile?.strength ?? 0), 0),
  };
};

interface StepNotes {
  readonly done: Set<PieceId>;
  readonly modeSet: Set<PieceId>;
  readonly fueled: Set<PieceId>;
  /** Each truck's leg this step; a truck with none plans one at its next decision. */
  readonly trucks: Map<PieceId, TruckLeg>;
  /** Tokens of each rear dump promised to a truck heading for it, and hexes where SP were unloaded this step (12.2a: not loadable again). */
  readonly claims: { readonly tokens: Map<HexId, number>; readonly unloaded: Set<HexId> };
  readonly incomingRe: Map<HexId, number>;
  /** Tokens still unpromised in each friendly dump or truck cargo, by its id: units ending out of trace eat from them (12.6c). */
  feedBudget: Map<string, number> | null;
  targets: Map<PieceId, Target> | null;
  effort?: MainEffort | null;
  /** Further efforts beyond the main one (heuristic@11): their units assault, HQs and SP still follow the main one. */
  secondary?: readonly MainEffort[];
  /** Cut-off groups that need a supply run this step, and the trucks already sent to each (heuristic@7). */
  relief?: { readonly hexIds: readonly HexId[]; readonly sent: Map<HexId, PieceId>; readonly delivered: Set<HexId> };
  /** Nothing more is worth sending by rail this step (heuristic@12). */
  railDone?: boolean;
  /**
   * heuristic@79: combat units that want to move and need fuel (12.5a) but have no way to pay it: no dump draws to them and
   * no HQ backed by a dump throws to them. Trucks, which move last, unload beside them.
   */
  readonly stranded: Map<PieceId, HexId>;
  /** heuristic@79: hexes within draw range (12.3a) of a station SP can be railed to this step. */
  railDraw?: ReadonlySet<string>;
  /** heuristic@79: HQs no dump reaches when the trucks move, by hex, with the front strength each would throw to. */
  dryHqs?: Map<HexId, number>;
  /** heuristic@79: units an HQ that has already moved this step will throw to (12.3b); the next HQ covers others. */
  readonly hqCovered: Set<PieceId>;
  /** Nothing more is worth shipping this step (19.0f). */
  seaDone?: boolean;
}

/** What a truck is doing this Movement Segment (heuristic@78). Its actions run back to back (6.1g), leg after leg. */
type TruckLeg =
  /** Drive to a rear dump and fill up there; `claimed` Tokens of it are promised to this truck. */
  | { readonly kind: 'FETCH'; readonly pickup: HexId; readonly claimed: number }
  /** Loaded: drive to a drop it can reach with the MP to unload (`drop`, once chosen), and unload everything there. */
  | { readonly kind: 'DELIVER'; readonly drop: HexId | null }
  /** Loaded for a cut-off group (heuristic@7): drive beside it once, then unload or stop. */
  | { readonly kind: 'RELIEF'; readonly hexId: HexId; readonly driven: boolean }
  | { readonly kind: 'DONE' };

const notesOf = (context: BotDecisionContext): StepNotes => {
  let notes = context.memory.notes.get('heuristic') as StepNotes | undefined;
  if (!notes) {
    notes = { done: new Set(), modeSet: new Set(), fueled: new Set(), trucks: new Map(), claims: { tokens: new Map(), unloaded: new Set() }, incomingRe: new Map(), feedBudget: null, targets: null, stranded: new Map(), hqCovered: new Set() };
    context.memory.notes.set('heuristic', notes);
  }
  return notes;
};

const decision = (action: GameAction, intent: string, breakdown: readonly BotScoreTerm[] = [], alternatives: readonly GameAction[] = []): BotDecision => ({
  action, intent, score: breakdown.reduce((total, { value }) => total + value, 0), breakdown,
  alternatives: alternatives.filter((other) => other !== action).slice(0, 3),
});

const advance = (context: BotDecisionContext, why: string): BotDecision | null => {
  const [end] = context.actions.candidates('ADVANCE_SEQUENCE');
  return end ? decision(end, `end step: ${why}`) : null;
};

const reOf = (unit: OwnUnit): number => unit.profile?.re ?? 1;

// ─── Operational plan: where each unit goes this step ──────────────────────────────────────────

const planTargets = (situation: Situation, coverage: ReadonlySet<string>, unitCoverage: (unit: OwnUnit) => ReadonlySet<string>, w: HeuristicWeights, efforts: readonly MainEffort[], fedAt: ReadonlySet<string>): Map<PieceId, Target> => {
  const me = situation.playerId;
  const targets = new Map<PieceId, Target>();
  for (const { unit, hexId } of heldDefenders(situation, w)) targets.set(unit.piece.id, { hexId, purpose: 'GARRISON' });
  for (const effort of efforts) for (const unitId of [...effort.unitIds, ...effort.gunIds]) targets.set(unitId, { hexId: effort.hexId, purpose: 'ASSAULT' });
  const combat = situation.own.filter((unit) => situation.isCombatUnit(unit));
  // Held objectives keep a garrison (an occupied hex cannot be entered without a fight); others are worth taking.
  const wanted: { readonly hexId: HexId; readonly value: number; readonly purpose: Target['purpose']; readonly limit: number }[] = situation.objectives.map((objective) => {
    const threat = situation.threatAt(objective.hexId);
    const mine = objective.controllerId === me;
    const garrisoned = situation.friendlyAt(objective.hexId).some((unit) => situation.isCombatUnit(unit));
    return {
      hexId: objective.hexId,
      // Holding is cheaper than retaking: an empty or threatened objective's garrison is worth more than a new capture.
      value: !mine ? contestedVp(objective)
        : contestedVp(objective) * (!garrisoned ? w.garrisonEmpty : threat > 0 || situation.turnsLeft <= 2 ? w.garrisonThreatened : w.garrisonCalm),
      purpose: mine ? 'GARRISON' : 'CAPTURE',
      // A garrison is one unit, two under threat; an attack brings enough to beat what is there.
      limit: mine ? holdLimit(situation, objective.hexId, threat, w) : w.captureBaseUnits + Math.ceil((situation.enemy.get(objective.hexId)?.strength ?? 0) / w.captureStrengthPerUnit),
    };
  });
  // Enemy stacks next to what we hold (objectives, HQs, dumps) cut supply and take empty objectives: hunt them.
  const anchors = [
    ...situation.objectives.filter(({ controllerId }) => controllerId === me).map(({ hexId }) => hexId),
    ...situation.own.filter(({ piece }) => piece.role === 'HQ' || piece.role === 'DUMP').map(({ hexId }) => hexId),
  ];
  for (const stack of situation.enemy.values()) {
    if (!stack.hasCombatUnit) continue;
    if (stack.strength === 0 && stack.pieces.some(p => p.role === 'REPLACEMENT')) continue;
    // A weak stack near our units (an objective garrison) blocks our trace with its ZOC: clear it first.
    if (stack.strength <= w.clearStrength && combat.some((unit) => hexesBetween(unit.hexId, stack.hexId) <= w.clearRadius)) {
      wanted.push({ hexId: stack.hexId, value: w.clearValue, purpose: 'HUNT', limit: 1 });
      continue;
    }
    // Behind our lines: inside our trace supply area with our combat units close by.
    const infiltrated = coverage.has(stack.hexId) && combat.some((unit) => hexesBetween(unit.hexId, stack.hexId) <= w.huntInfiltrationRadius);
    if (!infiltrated && !anchors.some((hexId) => hexesBetween(hexId, stack.hexId) <= w.huntAnchorRadius)) continue;
    wanted.push({ hexId: stack.hexId, value: w.huntValue, purpose: 'HUNT', limit: 1 + Math.ceil(stack.strength / w.huntStrengthPerUnit) });
  }
  const assigned = new Map<HexId, number>();
  for (const target of targets.values()) if (target.purpose === 'GARRISON') assigned.set(target.hexId, (assigned.get(target.hexId) ?? 0) + 1);
  // heuristic@11: the only garrison of a held objective stays on it. Replays of heuristic@10 games: 40 of 90 objectives
  // lost while empty had been left by their only garrison sent to hunt a weak enemy stack nearby.
  for (const objective of situation.objectives) {
    if (objective.controllerId !== me) continue;
    if (assigned.has(objective.hexId)) continue;
    const garrison = situation.friendlyAt(objective.hexId).filter((unit) => situation.isCombatUnit(unit) && !targets.has(unit.piece.id))
      .sort((left, right) => (left.profile?.strength ?? 0) - (right.profile?.strength ?? 0) || String(left.piece.id).localeCompare(String(right.piece.id)))[0];
    if (!garrison) continue;
    targets.set(garrison.piece.id, { hexId: objective.hexId, purpose: 'GARRISON' });
    assigned.set(objective.hexId, 1);
  }
  // A unit out of trace supply with no SP close by goes back to supply first (12.8 attrition), unless it holds an objective.
  const fed = (hexId: HexId) => fedAt.has(hexId);
  // Out of supply at the Supply Phase means an Attrition roll every turn (12.8b): only the last turns justify starving
  // on an objective; earlier even a garrison goes back to supply.
  if (situation.turnsLeft > 2) {
    for (const unit of combat) {
      const own = unitCoverage(unit);
      if (own.size === 0 || own.has(unit.hexId) || fed(unit.hexId)) continue;
      // The only unit on an objective we hold waits for a supply run rather than leave the objective empty (heuristic@8).
      if (holdsAlone(situation, unit) && situation.own.some(({ piece, hexId }) => piece.role === 'TRUCK' && (piece.carriedTokens ?? 0) > 0
        && hexesBetween(hexId, unit.hexId) <= w.holdTruckReach)) continue;
      // The assault group stays forward while an HQ is close enough to throw supply to it (12.3b).
      if (efforts.some(({ unitIds }) => unitIds.has(unit.piece.id)) && situation.own.some(({ piece, hexId }) => piece.role === 'HQ' && hexesBetween(hexId, unit.hexId) <= 3)) continue;
      let back: HexId | null = null;
      let best = Number.POSITIVE_INFINITY;
      for (const hexId of own) {
        const distance = hexesBetween(unit.hexId, hexId);
        if (distance < best) { best = distance; back = hexId as HexId; }
      }
      if (back !== null) targets.set(unit.piece.id, { hexId: back, purpose: 'RESUPPLY' });
    }
  }
  // heuristic@75: a unit that cannot move (MA 0: garrisons, some engineers) only fills a slot in its own hex. Replays: an
  // MA 0 engineer took the one garrison slot of an empty 4 VP objective three hexes away, no mobile unit was sent, and
  // the enemy walked in.
  const reachable = (unit: OwnUnit, hexId: HexId) => (unit.profile?.movement ?? 1) > 0 || unit.hexId === hexId;
  const pairs = combat.flatMap((unit) => wanted.filter((entry) => reachable(unit, entry.hexId)).map((entry) => ({
    unit, entry, score: entry.value / (1 + hexesBetween(unit.hexId, entry.hexId) / Math.max(2, unit.profile?.movement ?? 4)),
  }))).sort((left, right) => right.score - left.score || String(left.unit.piece.id).localeCompare(String(right.unit.piece.id)));
  for (const { unit, entry } of pairs) {
    if (targets.has(unit.piece.id)) continue;
    const count = assigned.get(entry.hexId) ?? 0;
    if (count >= entry.limit) continue;
    targets.set(unit.piece.id, { hexId: entry.hexId, purpose: entry.purpose });
    assigned.set(entry.hexId, count + 1);
  }
  // In the last turn every spare unit goes for the nearest objective still to take, then the nearest held one.
  if (situation.turnsLeft <= 1) {
    for (const unit of combat) {
      if (targets.has(unit.piece.id)) continue;
      const nearest = [...situation.objectives].sort((left, right) =>
        Number(left.controllerId === me) - Number(right.controllerId === me) || hexesBetween(unit.hexId, left.hexId) - hexesBetween(unit.hexId, right.hexId))[0];
      if (nearest) targets.set(unit.piece.id, { hexId: nearest.hexId, purpose: nearest.controllerId === me ? 'GARRISON' : 'CAPTURE' });
    }
  }
  // Units with nothing to take or hold close with the nearest enemy.
  for (const unit of combat) {
    if (targets.has(unit.piece.id)) continue;
    const { stack } = situation.nearestEnemy(unit.hexId);
    if (stack) targets.set(unit.piece.id, { hexId: stack.hexId, purpose: 'FRONT' });
  }
  return targets;
};

/**
 * Units a held objective should have (heuristic@11): one, plus enough to bring the strength in the hex up to
 * `holdRatio` of the enemy strength that can reach it, at most `holdMaxExtra` more. Replays: the side's most attacked
 * stacks were the scenario's lone objective garrisons (MA 0, strength 1-2), attacked at high odds and the objective lost.
 */
const holdLimit = (situation: Situation, hexId: HexId, threat: number, w: HeuristicWeights): number => {
  const held = situation.friendlyAt(hexId).filter((unit) => situation.isCombatUnit(unit)).reduce((total, unit) => total + (unit.profile?.strength ?? 0), 0);
  const extra = Math.ceil(Math.max(0, threat * w.holdRatio - held) / w.holdStrengthPerUnit);
  return Math.max(threat > w.garrisonSecondUnitThreat ? 2 : 1, 1 + Math.min(w.holdMaxExtra, extra));
};

/** Reserve existing defenders before forming assaults, rather than sending them away and
 * asking distant units to replace them. Spare strength remains available for captures. */
const heldDefenders = (situation: Situation, w: HeuristicWeights): { readonly unit: OwnUnit; readonly hexId: HexId }[] => {
  const reserved: { unit: OwnUnit; hexId: HexId }[] = [];
  const enemyAnswer = situation.opponentTurnRemains;
  const empty: ObjectiveView[] = [];
  for (const objective of situation.objectives) {
    if (objective.controllerId !== situation.playerId) continue;
    const present = situation.friendlyAt(objective.hexId).filter(unit => situation.isCombatUnit(unit))
      .sort((a, b) => (a.profile?.strength ?? 0) - (b.profile?.strength ?? 0) || String(a.piece.id).localeCompare(String(b.piece.id)));
    const anchor = present.shift();
    if (!anchor) { empty.push(objective); continue; }
    reserved.push({ unit: anchor, hexId: objective.hexId });
    let strength = anchor.profile?.strength ?? 0;
    const required = enemyAnswer ? situation.threatAt(objective.hexId) * w.holdRatio : 0;
    for (const unit of present.reverse()) {
      if (strength >= required) break;
      reserved.push({ unit, hexId: objective.hexId });
      strength += unit.profile?.strength ?? 0;
    }
  }
  // heuristic@75: a held objective with nobody on it is taken by the first enemy unit that passes. Before efforts take
  // their units, the weakest mobile unit that can reach it this turn goes back. Replays: two divisions beside an empty
  // held 2 VP objective left for an assault, and the enemy walked in.
  if (enemyAnswer) {
    const taken = new Set(reserved.map(({ unit }) => unit.piece.id));
    for (const objective of empty.sort((a, b) => b.points - a.points || String(a.hexId).localeCompare(String(b.hexId)))) {
      if (situation.threatAt(objective.hexId) <= 0) continue;
      const unit = situation.own.filter(u => situation.isCombatUnit(u) && !taken.has(u.piece.id) && (u.profile?.movement ?? 0) > 0
        && hexesBetween(u.hexId, objective.hexId) <= u.profile!.movement)
        .sort((a, b) => (a.profile?.strength ?? 0) - (b.profile?.strength ?? 0) || hexesBetween(a.hexId, objective.hexId) - hexesBetween(b.hexId, objective.hexId)
          || String(a.piece.id).localeCompare(String(b.piece.id)))[0];
      if (!unit) continue;
      taken.add(unit.piece.id);
      reserved.push({ unit, hexId: objective.hexId });
    }
  }
  return reserved;
};

/**
 * Where the army is: the own combat unit with the most friendly combat strength within 3 hexes. HQs, dumps and
 * trucks head for it; their own scores keep them inside trace supply and away from the enemy, so an HQ that
 * follows a group that ran ahead of supply stops at the edge of trace and throws supply forward to it (12.3b).
 */
const armyCenter = (situation: Situation): HexId | null => {
  const combat = situation.own.filter((unit) => situation.isCombatUnit(unit));
  const scored = combat.map((unit) => ({
    unit,
    mass: combat.filter((other) => hexesBetween(other.hexId, unit.hexId) <= 3).reduce((total, other) => total + (other.profile?.strength ?? 0), 0),
  })).sort((left, right) => right.mass - left.mass || String(left.unit.piece.id).localeCompare(String(right.unit.piece.id)));
  return scored[0]?.unit.hexId ?? null;
};

/** Hex the front is at: the own combat unit nearest the enemy, near the main effort. */
const frontHex = (situation: Situation): HexId | null => {
  const combat = situation.own.filter((unit) => situation.isCombatUnit(unit));
  const sorted = [...combat].sort((left, right) => situation.nearestEnemy(left.hexId).distance - situation.nearestEnemy(right.hexId).distance
    || String(left.piece.id).localeCompare(String(right.piece.id)));
  return sorted[0]?.hexId ?? null;
};

/**
 * heuristic@81: a gun given to an effort barrages from its Combat side, about twice its Move side's Barrage Strength. A mode
 * is set as a unit begins to move (5.4), so a gun within its range + `artilleryCombatModeReach` of the objective turns to
 * Combat Mode and moves the rest of the way on that side; one farther than range + `artilleryMoveModeDistance` travels in
 * Move Mode. Replays of v79 attack games: 363 of 375 guns at the Combat Phase were in Move Mode.
 */
const artilleryMode = (unit: OwnUnit, distance: number, w: HeuristicWeights): OcsMode | null => {
  const range = Math.max(1, unit.profile?.range ?? 1);
  if (distance <= range + w.artilleryCombatModeReach) return 'COMBAT';
  if (distance > range + w.artilleryMoveModeDistance) return 'MOVE';
  return null;
};

// ─── Movement Segment ──────────────────────────────────────────────────────────────────────────

const destinationOf = (action: GameAction): HexId | null => action.kind === 'MOVE_PIECE' ? action.path.at(-1)! : null;

const scoreDestination = (
  situation: Situation,
  unit: OwnUnit,
  target: Target | undefined,
  path: readonly HexId[],
  notes: StepNotes,
  coverage: ReadonlySet<string> | null,
  direct: ReadonlySet<string>,
  front: HexId | null,
  w: HeuristicWeights,
  feeds: readonly FeedSource[],
  opponentTurnRemains: boolean,
): BotScoreTerm[] => {
  const me = situation.playerId;
  const destination = path.at(-1)!;
  const terms: BotScoreTerm[] = [];
  const add = (term: string, value: number) => { if (value !== 0) terms.push({ term, value }); };
  const strength = Math.max(1, unit.profile?.strength ?? 1);
  const threat = situation.threatAt(destination);
  const support = situation.friendlyAt(destination).filter((other) => other.piece.id !== unit.piece.id)
    .reduce((total, other) => total + (other.profile?.strength ?? 0), 0);
  const adjacentEnemy = situation.nearestEnemy(destination).distance <= 1;
  // Passing through or stopping on an objective takes its control.
  for (const hexId of path.slice(1)) {
    const objective = situation.objectives.find((entry) => entry.hexId === hexId);
    if (!objective || objective.controllerId === me) continue;
    // A capture only lasts if someone stays: passing through leaves it empty for the enemy to take back. Staying
    // out of supply is no better (attrition every turn, 12.8b) until the last turns, when only the final owner counts.
    const supplied = coverage === null || coverage.has(hexId) || situation.turnsLeft <= 2;
    const kept = (hexId === destination && supplied) || (notes.incomingRe.get(hexId) ?? 0) > 0
      || situation.friendlyAt(hexId).some((other) => other.piece.id !== unit.piece.id && situation.isCombatUnit(other));
    add('capture', contestedVp(objective) * w.capture * (kept || !opponentTurnRemains ? 1 : w.passThroughShare));
  }
  // The only garrison of a held objective walking away hands it to the next enemy unit that passes.
  const origin = situation.objectives.find((entry) => entry.hexId === path[0] && entry.controllerId === me);
  if (origin && path.length > 1 && unit.piece.role === 'COMBAT' && opponentTurnRemains && (coverage === null || coverage.has(origin.hexId) || situation.turnsLeft <= 2)
    && !situation.friendlyAt(origin.hexId).some((other) => other.piece.id !== unit.piece.id && situation.isCombatUnit(other))) {
    add('abandon-objective', -contestedVp(origin) * w.abandonObjective);
  }
  // A token garrison does not replace the departing main defender. Charge only the added
  // defence shortfall, so spare troops remain free and the final second player can still attack.
  if (origin && path.length > 1 && unit.piece.role === 'COMBAT' && opponentTurnRemains) {
    const others = situation.friendlyAt(origin.hexId).filter(u => u.piece.id !== unit.piece.id && situation.isCombatUnit(u));
    if (others.length > 0) {
      const remaining = others.reduce((total, u) => total + (u.profile?.strength ?? 0), 0);
      const required = Math.max(1, situation.threatAt(origin.hexId) * w.holdRatio);
      const addedRisk = Math.max(0, required - remaining) - Math.max(0, required - remaining - strength);
      add('weaken-objective', -contestedVp(origin) * w.abandonObjective * Math.min(1, addedRisk / required));
    }
  }
  // Near the end a captured objective must stay occupied: the enemy moves after us and walks into empty ones.
  const endObjective = situation.objectives.find((entry) => entry.hexId === destination);
  if (endObjective && situation.turnsLeft <= 2 && opponentTurnRemains && unit.piece.role === 'COMBAT'
    && situation.friendlyAt(destination).every((other) => other.piece.id === unit.piece.id || !situation.isCombatUnit(other))) {
    add('hold-at-end', contestedVp(endObjective) * w.holdAtEnd);
  }
  const incoming = (notes.incomingRe.get(destination) ?? 0) + situation.friendlyAt(destination).reduce((total, other) => total + reOf(other), 0);
  if (incoming + reOf(unit) > STACKING_LIMIT_RE && path.length > 1) add('overstack', -1000);
  if (unit.piece.role === 'COMBAT') {
    // Strat Mode units defend badly and lose their ZOC: keep them well away from the enemy (5.8).
    if (unit.piece.mode === 'STRAT' && situation.nearestEnemy(destination).distance <= w.stratSafeDistance) add('strat-near-enemy', -w.stratNearEnemy);
    // The assault group gathers around the defended objective instead of shying away from it.
    const effort = target?.purpose === 'ASSAULT' ? effortAt(notes, target.hexId) : undefined;
    // One stack per hex does the job; more units in the same hex only make a better barrage target. heuristic@81: an assault
    // group's members stack together: the defender attacks one stack at a time, and a group spread over several hexes was
    // attacked 2.8 times a game (v79: 0.8) when its exposure was judged by the whole group's strength. Only the defender's
    // (heuristic@83).
    if (path.length > 1 && (effort === undefined || situation.posture !== 'DEFENDER')) add('crowding', -incoming * w.crowding);
    const assaulting = target?.purpose === 'ASSAULT' && hexesBetween(destination, target.hexId) === 1;
    if (assaulting) add('assault-position', w.assaultPosition);
    if (target) {
      const progress = hexesBetween(path[0]!, target.hexId) - hexesBetween(destination, target.hexId);
      const progressWeight = target.purpose === 'FRONT' ? w.progressFront
        : ['CAPTURE', 'GARRISON', 'ASSAULT'].includes(target.purpose) ? w.progressObjective : w.progressTarget;
      // Allocation knows a target's VP, but distance progress must value it too: one
      // hex toward a major objective is worth more than one toward a minor point.
      // Normalize by the public map mean, preserving the base scale on uniform maps.
      const objective = target.purpose === 'CAPTURE' || target.purpose === 'ASSAULT'
        ? situation.objectives.find(o => o.hexId === target.hexId) : undefined;
      const meanPoints = situation.objectives.reduce((total, o) => total + o.points, 0) / Math.max(1, situation.objectives.length);
      const valueScale = objective && meanPoints > 0 ? objective.points / meanPoints : 1;
      add('progress', progress * progressWeight * valueScale);
      // A hunter stops beside its quarry, ready to attack.
      if (target.purpose === 'HUNT' && hexesBetween(destination, target.hexId) === 1) add('hunt', w.huntAdjacent);
      if (target.purpose === 'GARRISON' && destination === target.hexId && opponentTurnRemains) add('garrison', w.garrisonStay);
    }
    if (adjacentEnemy && !assaulting) {
      const enemy = situation.nearestEnemy(destination).stack!;
      // Close in only where an attack has a chance; otherwise keep a hex away.
      add('contact', (strength + support) >= enemy.strength * w.contactRatio && unit.piece.mode === 'COMBAT' ? w.contactGood : -w.contactBad);
    }
    add('exposure', -Math.max(0, threat - (strength + support) * w.exposureSupport));
    // Out of trace supply a unit must eat SP or suffer attrition (12.8): stay inside, except to grab VP at the end.
    // Beyond trace a unit can still eat from SP close by (12.3a, a dump or a loaded truck), if that SP is not already
    // promised to other units ending out of trace this step: only unfed ground is dangerous.
    if (coverage && !coverage.has(destination)) {
      const fed = feedSourceFor(notes, feeds, unit, destination) !== null;
      // heuristic@11: only the last turn (not the last two) excuses starving: a unit out of supply on turn 7 rolls
      // Attrition on turns 7 and 8 (12.8b).
      add('out-of-supply', situation.turnsLeft <= 0 || fed ? -w.outOfSupplyFed : -w.outOfSupply);
    }
    // Supply that depends on an HQ's throw is lost when the HQ moves or falls: prefer direct trace.
    else if (!direct.has(destination) && situation.turnsLeft > 1) add('hq-dependent-supply', -w.hqDependentSupply);
  } else if (unit.piece.role === 'HQ') {
    if (front) add('with-army', -hexesBetween(destination, front) * w.hqWithArmy);
    if (situation.nearestEnemy(destination).distance <= 2) add('hq-exposed', -w.hqExposed);
    if (coverage && !coverage.has(destination)) add('out-of-supply', -w.hqOutOfSupply);
    // heuristic@79: an HQ exists to throw supply (12.3b). It stays where SP can reach it this turn: a dump already in its draw
    // range, or a station within draw range that Rail Cap fills after the HQs move (13.3c); beyond that it throws nothing.
    const supplied = feeds.some(({ tokens, hexIds }) => tokens > 0 && hexIds.includes(destination))
      || (notes.railDraw?.has(String(destination)) ?? false);
    if (!supplied) add('off-rail-draw', -w.hqOffRail);
    // heuristic@79: each HQ throws to a part of the front the HQs before it do not reach, instead of all following one point;
    // half as much where no SP can reach the HQ.
    add('cover', uncoveredFrontStrength(situation, notes, unit, destination) * w.hqCover * (supplied ? 1 : 0.5));
    add('exposure', -threat * w.hqExposure);
  } else if (unit.piece.role === 'ARTILLERY') {
    const distance = situation.nearestEnemy(destination).distance;
    const range = Math.max(1, unit.profile?.range ?? 1);
    // heuristic@81: a gun given to an effort ranges on its objective; others on the nearest enemy.
    const aim = target?.purpose === 'ASSAULT' ? hexesBetween(destination, target.hexId) : distance;
    add('in-range', aim >= 2 && aim <= range ? w.artilleryInRange : -Math.max(0, aim - range) * w.artilleryBeyondRange);
    // Fire where the army fights, not at whatever enemy is nearest somewhere else on the map.
    if (front) add('with-army', -Math.max(0, hexesBetween(destination, front) - range - 1) * w.artilleryWithArmy);
    if (distance <= 1) add('artillery-exposed', -w.artilleryExposed);
    // Artillery defends poorly: near the enemy it stands with combat units, never alone in front of them.
    const escorted = situation.friendlyAt(destination).some((other) => other.piece.id !== unit.piece.id && situation.isCombatUnit(other));
    if (!escorted && distance <= w.artilleryEscortDistance) add('artillery-unescorted', -w.artilleryUnescorted);
    add('exposure', -threat * w.artilleryExposure);
    // heuristic@11: artillery is a combat unit for Attrition too (12.8); replays showed it the most starved role.
    if (coverage && !coverage.has(destination)) add('out-of-supply', feedSourceFor(notes, feeds, unit, destination) !== null ? -w.outOfSupplyFed : -w.outOfSupply);
  } else {
    add('exposure', -threat * w.rearExposure);
    if (adjacentEnemy) add('rear-exposed', -w.rearExposed);
  }
  return terms;
};

const sum = (terms: readonly BotScoreTerm[]) => terms.reduce((total, { value }) => total + value, 0);

/** Tokens a unit eats off the map out of trace (12.6c): 1T per 2 RE, at least 1T. */
const eatingCost = (unit: OwnUnit): number => Math.max(1, Math.ceil((unit.profile?.re ?? 1) / 2));

/**
 * The friendly dump (or truck cargo) whose SP reaches `destination` for `unit` and still has Tokens for it this step,
 * or null. heuristic@11: the reach is the Rule Engine's draw and throw routes (12.3, 12.6c), not "SP within 2 hexes",
 * which sent units to starve beside dumps they could not draw from (replays: attrition was the largest step loss).
 */
const feedSourceFor = (notes: StepNotes, feeds: readonly FeedSource[], unit: OwnUnit, destination: HexId): string | null => {
  notes.feedBudget ??= new Map();
  const cost = eatingCost(unit);
  for (const { dumpId, tokens, hexIds } of feeds) {
    if (!notes.feedBudget.has(dumpId)) notes.feedBudget.set(dumpId, tokens);
    if (notes.feedBudget.get(dumpId)! >= cost && hexIds.includes(destination)) return dumpId;
  }
  return null;
};

/** Hexes where some friendly SP can be eaten (12.6c), for any unit. */
const fedHexes = (feeds: readonly FeedSource[]): ReadonlySet<string> => new Set(feeds.filter(({ tokens }) => tokens > 0).flatMap(({ hexIds }) => hexIds));

/** `unit` is the only friendly combat unit on an objective we hold. */
const holdsAlone = (situation: Situation, unit: OwnUnit): boolean =>
  situation.objectives.some(({ hexId, controllerId }) => hexId === unit.hexId && controllerId === situation.playerId)
  && situation.friendlyAt(unit.hexId).filter((other) => situation.isCombatUnit(other)).length === 1;

/**
 * Cut-off groups (heuristic@7): friendly combat units outside the side's trace with no SP close enough to eat or fuel
 * from (12.6c, 12.5), as the hex of the strongest such group, strongest first, when it is worth a supply run.
 */
const reliefTargets = (context: BotDecisionContext, situation: Situation, w: HeuristicWeights): readonly HexId[] => {
  const unfunded = new Set(context.view.projection?.unfundedRationPieceIds ?? []);
  const stranded = situation.own.filter((unit) => {
    if (!situation.isCombatUnit(unit) || context.actions.traceCoverage(unit.piece.id).hexIds.includes(unit.hexId)) return false;
    const feeds = context.actions.feedCoverage(unit.piece.id).filter(({ hexIds }) => hexIds.includes(unit.hexId));
    const cost = eatingCost(unit);
    // A nearby dump across prohibited terrain or a blocked road cannot feed this unit. Static
    // garrisons need relief before their one-use emergency stock is eaten, not a turn afterwards.
    return (unit.profile?.movement ?? 1) === 0
      ? unfunded.has(unit.piece.id)
        || !feeds.some(({ dumpId, tokens }) => !String(dumpId).includes('-stock-') && tokens >= 2 * cost)
      : !feeds.some(({ tokens }) => tokens >= cost);
  });
  // A unit holding an objective alone is worth a run whatever its strength (heuristic@8): its VP first. So is a garrison
  // (MA 0, it can never walk back to supply) with only its initial 1T emergency stock left.
  const objectivePoints = (hexId: HexId) => situation.objectives.find((entry) => entry.hexId === hexId && entry.controllerId === situation.playerId)?.points ?? 0;
  const groups = stranded.map((unit) => ({
    hexId: unit.hexId,
    points: holdsAlone(situation, unit) ? objectivePoints(unit.hexId) : (unit.profile?.movement ?? 1) === 0 ? 1 : 0,
    strength: stranded.filter((other) => hexesBetween(other.hexId, unit.hexId) <= w.reliefRadius).reduce((total, other) => total + (other.profile?.strength ?? 0), 0),
  })).filter(({ strength, points }) => points > 0 || strength >= w.reliefMinStrength)
    .sort((left, right) => right.points - left.points || right.strength - left.strength || String(left.hexId).localeCompare(String(right.hexId)));
  const chosen: HexId[] = [];
  for (const { hexId } of groups) if (!chosen.some((other) => hexesBetween(other, hexId) <= 2 * w.reliefRadius)) chosen.push(hexId);
  return chosen;
};

/**
 * Logistics (heuristic@78): each truck shuttles. It fills up at a rear dump, drives the SP to a drop it can reach with
 * the MP to unload, unloads, and spends what MP it has left driving back to the next pickup, so the next step starts at
 * the dump. Replays of heuristic@75 showed 84 of 130 loaded truck-turns ending without unloading and the entry dump
 * growing every turn: a truck loaded one dump, left, and stopped after any move. First, though, one loaded truck runs
 * to each cut-off group and unloads beside it (heuristic@7).
 */
/** A truck load worth a trip: a full 5-point truck carries 20T; a pickup must offer at least this much. */
const PICKUP_MIN_TOKENS = 8;
/** What a full truck carries: a pickup claims this much of a dump for a truck heading there. */
const TRUCK_LOAD_TOKENS = 20;
/** A truck unloads where no enemy stands within two hexes. */
const DROP_SAFE_DISTANCE = 3;
/** A truck that cannot reach the best drop unloads short of it only this many hexes nearer the front than it stands. */
const RELAY_MIN_GAIN = 4;
/** A 45 MP truck reaches more hexes than the default candidate budget; its long runs must not be cut off. */
const TRUCK_MOVE_BUDGET = 3000;
/** Trucks fetch only from dumps at least this far from the enemy. */
const PICKUP_SAFE_DISTANCE = 5;
/** SP within this many hexes of the delivery point are delivered already; trucks do not fetch them. */
const DELIVERED_RADIUS = 3;

/**
 * heuristic@12, relay: an empty truck fetches from the rear dump that makes the shortest trip to the front and back,
 * counting only the Tokens other trucks have not already claimed this step. Rail lands SP at the railhead (the station
 * nearest the front, railStep), so trucks shuttle railhead → front instead of driving to the map edge where new SP
 * arrive; replays of heuristic@11 with Rail Cap showed every empty truck heading for the fullest dump at the map edge.
 * Emergency garrison stocks (1T at isolated objectives) are left alone, and so are SP unloaded this step (12.2a).
 */
const pickupFor = (situation: Situation, notes: StepNotes, truck: OwnUnit, front: HexId | null, reliefRun: boolean, deliverable: (hexId: HexId) => boolean): TruckLeg => {
  const { claims } = notes;
  const objectives = new Set(situation.objectives.map(({ hexId }) => hexId));
  const left = (hexId: HexId, tokens: number): number => tokens - (claims.tokens.get(hexId) ?? 0);
  const dumps = situation.own.filter(({ piece, hexId }) => piece.role === 'DUMP' && (piece.resourceQuantity ?? 0) > 0
    && !String(piece.id).includes('-stock-') && !objectives.has(hexId) && !claims.unloaded.has(hexId) && (reliefRun || deliverable(hexId))
    && (reliefRun || front === null || hexesBetween(hexId, front) > DELIVERED_RADIUS)
    // Only the rear: SP near the enemy feed the units beside them (a relief run's load, a cut-off group's stock).
    && situation.nearestEnemy(hexId).distance >= (reliefRun ? 2 : PICKUP_SAFE_DISTANCE));
  // Claims are counted per hex, so the stock is too (the rules merge a hex's dumps of one kind, but a truck's load is its own).
  const stock = new Map<HexId, number>();
  for (const dump of dumps) stock.set(dump.hexId, (stock.get(dump.hexId) ?? 0) + (dump.piece.resourceQuantity ?? 0));
  const scored = [...stock].map(([hexId, tokens]) => ({ hexId, tokens: left(hexId, tokens) })).map((dump) => ({
    hexId: dump.hexId,
    tokens: dump.tokens,
    // Hexes to drive empty plus hexes to drive loaded; a fuller load is worth a little more road.
    cost: hexesBetween(truck.hexId, dump.hexId) + (front === null ? 0 : hexesBetween(dump.hexId, front)),
  })).filter(({ tokens }) => tokens > 0);
  const worthwhile = scored.filter(({ tokens }) => tokens >= (reliefRun ? 1 : PICKUP_MIN_TOKENS));
  const best = (worthwhile.length > 0 ? worthwhile : scored)
    .sort((a, b) => a.cost - Math.min(a.tokens, TRUCK_LOAD_TOKENS) / 4 - (b.cost - Math.min(b.tokens, TRUCK_LOAD_TOKENS) / 4) || String(a.hexId).localeCompare(String(b.hexId)))[0];
  if (!best) { debug?.(`PICKUP none for ${truck.piece.id}: dumps ${JSON.stringify(situation.own.filter(({ piece }) => piece.role === 'DUMP').map(({ piece, hexId }) => [hexId, piece.resourceQuantity, String(piece.id).slice(0, 30), situation.nearestEnemy(hexId).distance]))} front ${front}`); return { kind: 'DONE' }; }
  const claimed = Math.min(best.tokens, TRUCK_LOAD_TOKENS - (truck.piece.carriedTokens ?? 0));
  claims.tokens.set(best.hexId, (claims.tokens.get(best.hexId) ?? 0) + claimed);
  return { kind: 'FETCH', pickup: best.hexId, claimed };
};

/**
 * Hexes a loaded truck may deliver to, best first: a friendly combat unit or dump (13.2f: the only hexes SP may be
 * unloaded in) with no enemy within two hexes (a truck there is not left in reach of an overrun) and inside the side's
 * trace (a truck that runs ahead of supply is cut off with its load), nearest `center` first.
 */
const dropHexes = (context: BotDecisionContext, situation: Situation, center: HexId): HexId[] => {
  const traced = new Set(context.actions.traceCoverage().hexIds);
  return [...new Set(situation.own.filter((unit) => situation.isCombatUnit(unit) || unit.piece.role === 'DUMP').map(({ hexId }) => hexId))]
    .filter((hexId) => traced.has(hexId) && situation.nearestEnemy(hexId).distance >= DROP_SAFE_DISTANCE)
    .sort((left, right) => hexesBetween(left, center) - hexesBetween(right, center) || situation.threatAt(left) - situation.threatAt(right) || String(left).localeCompare(String(right)));
};

/** A drop this close to stranded units puts them in a dump's draw range (12.3a: 5 Truck MP) on most ground. */
const STRANDED_DROP_RADIUS = 3;

/** Units this close to the enemy fight and fuel at the front, so an HQ's throw (12.3b) should reach them. */
const HQ_COVER_FRONT_HEXES = 6;

/** Hexes an HQ's throw reaches on ordinary ground: three quarters of its printed range in Truck MP (12.3b), at least 3. */
const hqThrowHexes = (hq: OwnUnit): number => Math.max(3, Math.floor((hq.profile?.range ?? 0) * 0.75));

/** Strength of front units within `hq`'s throw from `hexId` that no HQ which already moved this step reaches. */
const uncoveredFrontStrength = (situation: Situation, notes: StepNotes, hq: OwnUnit, hexId: HexId): number =>
  frontUnitsInThrow(situation, notes, hq, hexId).reduce((total, unit) => total + Math.max(1, unit.profile?.strength ?? 0), 0);

const frontUnitsInThrow = (situation: Situation, notes: StepNotes, hq: OwnUnit, hexId: HexId): OwnUnit[] =>
  situation.own.filter((unit) => situation.isCombatUnit(unit) && unit.piece.role !== 'HQ' && !notes.hqCovered.has(unit.piece.id)
    && situation.nearestEnemy(unit.hexId).distance <= HQ_COVER_FRONT_HEXES && hexesBetween(unit.hexId, hexId) <= hqThrowHexes(hq));

/** Marks the front units `hq` throws to from `hexId` as covered for the HQs that move after it. */
const markCovered = (situation: Situation, notes: StepNotes, hq: OwnUnit, hexId: HexId): void => {
  for (const unit of frontUnitsInThrow(situation, notes, hq, hexId)) notes.hqCovered.add(unit.piece.id);
};

/**
 * Hexes SP can detrain at this turn, as far as the bot can see: railroad villages, towns and cities, and railroad hexes
 * holding an own HQ in Combat Mode (13.3c, 13.8c), clear of the enemy and inside trace (a rough stand-in for a rail path to a
 * source free of enemy ZOC).
 */
const railStations = (situation: Situation, coverage: ReadonlySet<string> | null): HexId[] => {
  const hqStations = situation.own.filter((unit) => unit.piece.role === 'HQ' && unit.piece.mode === 'COMBAT' && situation.railHexes.has(String(unit.hexId)))
    .map(({ hexId }) => String(hexId));
  return [...new Set([...situation.stationHexes, ...hqStations])]
    .filter((hexId) => situation.nearestEnemy(hexId as HexId).distance >= RAIL_SAFE_DISTANCE && (!coverage || coverage.has(hexId))) as HexId[];
};

/** A railroad hex clear of the enemy's ZOC and first move, where an HQ in Combat Mode would make a station (13.8c, 13.3e). */
const railheadHex = (situation: Situation, hexId: HexId): boolean =>
  situation.railHexes.has(String(hexId)) && situation.nearestEnemy(hexId).distance >= RAIL_SAFE_DISTANCE;

/** 12.5a: combat units moving with Truck or Tracked MP need fuel; Leg units walk. */
const needsFuel = (facts: BotGameFacts, unit: OwnUnit): boolean => {
  const definition = knowledgeOf(facts).definition(unit.piece);
  const face = definition?.faces.find(({ id }) => id === unit.piece.currentFaceId) ?? definition?.faces[0];
  return ['mobility:truck', 'mobility:tracked'].includes(String(face?.mobilityClassDefinitionId));
};

/**
 * heuristic@79: the stranded units (StepNotes.stranded) a load should go to: the hex with the most stranded strength within
 * STRANDED_DROP_RADIUS that has a legal, safe drop that close. Replays of heuristic@78 attacks had a third of the units needing
 * fuel unable to pay it from Turn 3 on, 7 or more hexes from any dump while 30-40 SP stood in the rear.
 */
const strandedCenter = (context: BotDecisionContext, situation: Situation, notes: StepNotes): { hexId: HexId; drops: HexId[] } | null => {
  const stranded = (hexId: HexId) => situation.own.filter((unit) => notes.stranded.has(unit.piece.id) && hexesBetween(unit.hexId, hexId) <= STRANDED_DROP_RADIUS)
    .reduce((total, unit) => total + Math.max(1, unit.profile?.strength ?? 0), 0);
  // A dry HQ (no dump reaches it, 12.3b) is worth the front strength it would throw to once a load arrives beside it.
  notes.dryHqs ??= new Map(situation.own.filter((unit) => unit.piece.role === 'HQ'
    && !context.actions.feedCoverage(unit.piece.id).some(({ tokens, hexIds }) => tokens > 0 && hexIds.includes(unit.hexId)))
    .map((hq) => [hq.hexId, frontUnitsInThrow(situation, { ...notes, hqCovered: new Set() }, hq, hq.hexId)
      .reduce((total, unit) => total + Math.max(1, unit.profile?.strength ?? 0), 0)]));
  const worth = (hexId: HexId) => stranded(hexId) + (notes.dryHqs!.get(hexId) ?? 0);
  const hexes = [...new Set([...notes.stranded.values(), ...[...notes.dryHqs.entries()].filter(([, value]) => value > 0).map(([hexId]) => hexId)])];
  for (const hexId of hexes.sort((left, right) => worth(right) - worth(left) || String(left).localeCompare(String(right)))) {
    const drops = dropHexes(context, situation, hexId);
    if (drops[0] !== undefined && hexesBetween(drops[0], hexId) <= STRANDED_DROP_RADIUS) return { hexId, drops };
  }
  return null;
};

/** 13.2f: loading or unloading costs 10% of the printed MA, rounded normally (45 MA pays 5 MP). */
const loadTicksOf = (truck: OwnUnit): number => Math.round((truck.profile?.movement ?? 45) / 10) * 4;

const truckStep = (context: BotDecisionContext, situation: Situation, unit: OwnUnit, notes: StepNotes, w: HeuristicWeights, effort: MainEffort | null): BotDecision | null => {
  const { actions } = context;
  const id = unit.piece.id;
  const carried = unit.piece.carriedTokens ?? 0;
  const relief = notes.relief ??= { hexIds: reliefTargets(context, situation, w), sent: new Map(), delivered: new Set() };
  const unsentRelief = () => relief.hexIds.filter((hexId) => !relief.sent.has(hexId));
  // SP is worth most where units cannot move for want of fuel (heuristic@79), then where the army can draw it (12.3a):
  // with a main effort at its lead units, otherwise the army's centre.
  const stranded = strandedCenter(context, situation, notes);
  const center = stranded?.hexId ?? effort?.lead ?? armyCenter(situation);
  const loadTicks = loadTicksOf(unit);
  const drops = stranded?.drops ?? (center === null ? [] : dropHexes(context, situation, center));
  /** SP here can go somewhere nearer the army: otherwise a load would only be unloaded where it was taken. */
  const deliverable = (hexId: HexId) => center !== null && drops.some((drop) => hexesBetween(drop, center) < hexesBetween(hexId, center));
  const moves = () => new Map(actions.candidates('MOVE_PIECE', id, TRUCK_MOVE_BUDGET).map((move) => [destinationOf(move)!, move]));

  /** The fullest legal load from the dumps in this hex, if this hex is a place to load (heuristic@12). */
  const loadHere = (rescue: boolean): GameAction | undefined => {
    if (situation.objectives.some(({ hexId }) => hexId === unit.hexId) || notes.claims.unloaded.has(unit.hexId)
      || situation.nearestEnemy(unit.hexId).distance < (rescue ? 2 : PICKUP_SAFE_DISTANCE)
      || (!rescue && (center === null || !deliverable(unit.hexId) || hexesBetween(unit.hexId, center) <= DELIVERED_RADIUS))) return undefined;
    const fullest = [...actions.candidates('LOAD_SUPPLY', id)]
      .filter((action) => action.kind === 'LOAD_SUPPLY' && !String(action.dumpId).includes('-stock-'))
      .sort((left, right) => (right.kind === 'LOAD_SUPPLY' ? right.tokens : 0) - (left.kind === 'LOAD_SUPPLY' ? left.tokens : 0))[0];
    // Relief is worth a small run. Leave most of a shared forward dump feeding the army.
    return rescue && fullest?.kind === 'LOAD_SUPPLY' ? { ...fullest, tokens: Math.min(fullest.tokens, 2) } : fullest;
  };

  const plan = (): TruckLeg => {
    const unsent = unsentRelief();
    if (carried > 0 && unsent.length > 0) {
      const target = [...unsent].sort((left, right) => hexesBetween(unit.hexId, left) - hexesBetween(unit.hexId, right))[0]!;
      relief.sent.set(target, id);
      return { kind: 'RELIEF', hexId: target, driven: false };
    }
    if (loadHere(unsent.length > 0)) return { kind: 'FETCH', pickup: unit.hexId, claimed: 0 };
    if (carried > 0) return { kind: 'DELIVER', drop: null };
    return pickupFor(situation, notes, unit, unsent[0] ?? center, unsent.length > 0, deliverable);
  };

  /** The legal move that best closes on `goal` while staying out of enemy reach, if any gets nearer. */
  const driveToward = (goal: HexId): { action: GameAction; terms: BotScoreTerm[] } | undefined => {
    const scored = [...moves()].map(([destination, action]) => {
      const terms: BotScoreTerm[] = [{ term: 'toward-goal', value: (hexesBetween(unit.hexId, goal) - hexesBetween(destination, goal)) * w.truckTowardGoal }];
      if (situation.nearestEnemy(destination).distance <= 2) terms.push({ term: 'truck-exposed', value: -w.truckExposed });
      terms.push({ term: 'exposure', value: -situation.threatAt(destination) * w.truckExposure });
      return { action, terms };
    });
    return scored.sort((a, b) => sum(b.terms) - sum(a.terms)).find((candidate) => sum(candidate.terms) > 0 && preservesFriendlySupply(context, candidate.action));
  };

  const range = new Map(actions.movementRange(id).map(({ hexId, costTicks }) => [hexId, costTicks]));
  let remainingTicks: number | undefined;
  /** A move onto `hexId` that keeps friendly supply and leaves the MP to load or unload there (13.2f). */
  const driveTo = (hexId: HexId, all = moves()): GameAction | undefined => {
    const move = all.get(hexId);
    if (!move || (remainingTicks !== undefined && (range.get(hexId) ?? Infinity) + loadTicks > remainingTicks)) return undefined;
    const { explanation } = actions.explain(move);
    const fact = (key: string) => Number(explanation.facts.find((entry) => entry.key === key)?.value ?? 0);
    remainingTicks ??= fact('movement.remainingTicks') + fact('movement.totalTicks');
    return keepsFriendlySupply(explanation) && fact('movement.remainingTicks') >= loadTicks ? move : undefined;
  };

  const unloadAll = (why: string): { next: TruckLeg | null; decision?: BotDecision } => {
    const unload = actions.candidates('UNLOAD_SUPPLY', id)[0];
    if (!unload) return { next: { kind: 'DONE' } };
    notes.claims.unloaded.add(unit.hexId);
    for (const [strandedId, hexId] of notes.stranded) if (hexesBetween(hexId, unit.hexId) <= STRANDED_DROP_RADIUS) notes.stranded.delete(strandedId);
    const reach = actions.drawReach(unit.hexId);
    for (const hexId of notes.dryHqs?.keys() ?? []) if (reach.has(String(hexId))) notes.dryHqs!.delete(hexId);
    return { next: null, decision: decision(unload, `unload ${carried}T ${why}`, [{ term: 'deliver', value: carried }]) };
  };

  const release = (leg: Extract<TruckLeg, { kind: 'FETCH' }>) =>
    notes.claims.tokens.set(leg.pickup, Math.max(0, (notes.claims.tokens.get(leg.pickup) ?? 0) - leg.claimed));

  /** One leg's next action and the leg after it; `null` plans afresh at the truck's next decision. */
  const step = (leg: TruckLeg): { next: TruckLeg | null; decision?: BotDecision } => {
    switch (leg.kind) {
      case 'DONE': return { next: leg };
      case 'FETCH': {
        if (unit.hexId !== leg.pickup) {
          const exact = driveTo(leg.pickup);
          if (exact) return { next: leg, decision: decision(exact, `truck to the dump at ${leg.pickup}`, [{ term: 'fetch', value: leg.claimed }]) };
          // It will not load this step: leave the Tokens to a truck that can.
          release(leg);
          const toward = driveToward(leg.pickup);
          if (!toward) debug?.(`TRUCK ${id} at ${unit.hexId} cannot drive toward ${leg.pickup}: ${moves().size} moves`);
          return toward ? { next: { kind: 'DONE' }, decision: decision(toward.action, `truck toward ${leg.pickup}`, toward.terms) } : { next: { kind: 'DONE' } };
        }
        const rescue = unsentRelief().length > 0;
        const load = loadHere(rescue);
        if (load?.kind !== 'LOAD_SUPPLY') return { next: carried > 0 ? { kind: 'DELIVER', drop: null } : { kind: 'DONE' } };
        // The load leaves the dump now: release this truck's claim so the Tokens are not counted off twice.
        release(leg);
        return { next: rescue ? null : { ...leg, claimed: 0 }, decision: decision(load, `load ${load.tokens}T for the front`, [{ term: 'haul', value: load.tokens }]) };
      }
      case 'DELIVER': {
        if (leg.drop === unit.hexId) return unloadAll(`at ${leg.drop}`);
        if (center === null) return { next: { kind: 'DONE' } };
        const best = drops[0];
        if (best !== undefined) {
          const all = moves();
          const here = hexesBetween(unit.hexId, center);
          for (const hexId of drops) {
            // Short of the best drop, unload only where it moves the SP well forward: a relay the next truck carries on.
            if (hexesBetween(hexId, center) > hexesBetween(best, center) && here - hexesBetween(hexId, center) < RELAY_MIN_GAIN) break;
            if (hexId === unit.hexId) return unloadAll(hexId === best ? 'beside the army' : 'as a relay toward the army');
            const move = driveTo(hexId, all);
            if (move) return { next: { kind: 'DELIVER', drop: hexId }, decision: decision(move, `truck ${carried}T to ${hexId}`, [{ term: 'deliver', value: carried }]) };
          }
        }
        const toward = driveToward(best ?? center);
        return toward ? { next: { kind: 'DONE' }, decision: decision(toward.action, `truck toward ${best ?? center}`, toward.terms) } : { next: { kind: 'DONE' } };
      }
      case 'RELIEF': {
        // Unload beside the cut-off units even with the enemy close: that SP is what lets them eat and fuel (12.6c, 12.5).
        if (hexesBetween(unit.hexId, leg.hexId) <= w.reliefRadius) {
          const unload = [...actions.candidates('UNLOAD_SUPPLY', id)].sort((left, right) =>
            (right.kind === 'UNLOAD_SUPPLY' ? right.tokens : 0) - (left.kind === 'UNLOAD_SUPPLY' ? left.tokens : 0))[0];
          if (unload) {
            const stationary = situation.friendlyAt(leg.hexId).some((other) => situation.isCombatUnit(other) && other.profile?.movement === 0);
            const tokens = stationary && unsentRelief().length > 0 ? Math.min(carried, 1) : carried;
            relief.delivered.add(leg.hexId);
            notes.claims.unloaded.add(unit.hexId);
            const delivery = unload.kind === 'UNLOAD_SUPPLY' ? { ...unload, tokens } : unload;
            return { next: tokens < carried ? null : { kind: 'DONE' }, decision: decision(delivery, `unload ${tokens}T for the cut-off units at ${leg.hexId}`, [{ term: 'relief', value: tokens }]) };
          }
          // Being close does not make an empty hex a legal unloading site (13.2f). Keep
          // looking for a move onto the stranded stack instead of declaring this run finished.
        }
        if (leg.driven) return { next: { kind: 'DONE' } };
        const scored = [...moves()].map(([destination, action]) => {
          const terms: BotScoreTerm[] = [{ term: 'toward-relief', value: (hexesBetween(unit.hexId, leg.hexId) - hexesBetween(destination, leg.hexId)) * w.truckTowardGoal }];
          // A truck in an enemy-adjacent hex is easy prey (8.0); the rest of the danger is the price of the run.
          if (situation.nearestEnemy(destination).distance <= 1) terms.push({ term: 'truck-exposed', value: -w.truckExposed });
          return { action, terms };
        });
        const best = scored.sort((a, b) => sum(b.terms) - sum(a.terms))
          .find((candidate) => sum(candidate.terms) > 0 && preservesFriendlySupply(context, candidate.action));
        if (best) return { next: { ...leg, driven: true }, decision: decision(best.action, `truck to the cut-off units at ${leg.hexId}`, best.terms) };
        // Cannot get closer this step: deliver to the army as usual.
        return { next: { kind: 'DELIVER', drop: null } };
      }
    }
  };

  let leg = notes.trucks.get(id) ?? plan();
  // A leg that cannot act hands over to the next one at once (load → deliver, relief → deliver); each hand-over is final.
  for (let handovers = 0; handovers < 3; handovers++) {
    const { next, decision: chosen } = step(leg);
    if (next === null) notes.trucks.delete(id);
    else notes.trucks.set(id, next);
    if (chosen) return chosen;
    if (next === null || next.kind === 'DONE' || next === leg) return null;
    leg = next;
  }
  debug?.(`TRUCK ${id} at ${unit.hexId} carried ${carried} gave up in leg ${leg.kind}`);
  notes.trucks.set(id, { kind: 'DONE' });
  return null;
};

/** Worth of each Token railed to an HQ, in hexes of progress toward the front. */
const RAIL_HQ_VALUE = 10;
/** Rail moves shorter than this many hexes toward the front are not worth the Rail Cap. */
const RAIL_MIN_GAIN_HEXES = 3;
/** SP detrain at a station at least this far from the enemy (13.3e keeps them out of enemy ZOC; this keeps them off the line). */
const RAIL_SAFE_DISTANCE = 3;

/**
 * heuristic@12, rail (13.3): before trucks move, Rail Cap ships SP and far-off units from stations in the rear to the
 * station nearest the front that is safe from the enemy, the largest gain toward the front first. Trucks then carry the
 * SP on from that railhead (they cannot load SP detrained this phase, 12.2a, so the haul continues next turn).
 */
const railStep = (context: BotDecisionContext, situation: Situation, notes: StepNotes, front: HexId | null): BotDecision | null => {
  if (notes.railDone || front === null) return null;
  let best: { action: GameAction; value: number; gain: number } | null = null;
  for (const action of context.actions.candidates('RAIL_MOVE', null, 400)) {
    if (action.kind !== 'RAIL_MOVE') continue;
    if (situation.nearestEnemy(action.toHexId).distance < RAIL_SAFE_DISTANCE) continue;
    const gain = hexesBetween(action.fromHexId, front) - hexesBetween(action.toHexId, front);
    const tokens = action.supply.reduce((total, { tokens: quantity }) => total + quantity, 0);
    // heuristic@79: SP detrained where an HQ can draw it (12.3b) is thrown on to the units as fuel and trace.
    const feedsHq = tokens > 0 && situation.own.some((unit) => unit.piece.role === 'HQ'
      && context.actions.drawReach(action.toHexId).has(String(unit.hexId)) && !context.actions.drawReach(action.fromHexId).has(String(unit.hexId)));
    if (gain < (feedsHq ? 1 : RAIL_MIN_GAIN_HEXES)) continue;
    // A garrison's own stock (and SP on an objective) stays where it is.
    if (action.supply.some(({ sourcePieceId }) => String(sourcePieceId).includes('-stock-'))
      || (tokens > 0 && situation.objectives.some(({ hexId }) => hexId === action.fromHexId))) continue;
    // Units ride only when the front is far: a unit near it walks (and keeps its MA for the fight).
    const units = action.unitIds.filter((id) => {
      const unit = situation.own.find(({ piece }) => piece.id === id);
      return unit !== undefined && unit.piece.role === 'COMBAT' && hexesBetween(unit.hexId, front) >= 10;
    }).length;
    if (action.unitIds.length > 0 && units === 0) continue;
    const value = gain * (tokens + units * 8) + (feedsHq ? tokens * RAIL_HQ_VALUE : 0);
    if (value > 0 && (!best || value > best.value)) best = { action, value, gain };
  }
  if (!best) { notes.railDone = true; return null; }
  return decision(best.action, `rail ${best.gain} hexes toward the front`, [{ term: 'rail', value: best.value }]);
};

/** Ships land no closer than this to the enemy when a safer port is open. */
const SEA_SAFE_DISTANCE = 3;

/**
 * Shipping (19.0f): what waits in the reinforcement Box is landed first, combat units before SP (an SP shipment fills a port
 * to the last Token, which would leave the units waiting for ever), then SP, then Repls and trucks, at the open port nearest
 * the front that is safe from the enemy; then cargo in a port far behind the front moves by sea to a port nearer it, as rail
 * does. Sea Cap and port capacity decide how much lands each turn.
 */
const seaStep = (context: BotDecisionContext, situation: Situation, notes: StepNotes, front: HexId | null): BotDecision | null => {
  if (notes.seaDone || front === null) return null;
  const roleOf = new Map((context.view.projection?.stacks ?? []).flatMap(({ pieces }) => pieces).map((piece) => [String(piece.id), piece.role]));
  let best: { action: GameAction; value: number; why: string } | null = null;
  for (const action of context.actions.candidates('SEA_MOVE', null, 400)) {
    if (action.kind !== 'SEA_MOVE') continue;
    const tokens = action.supply.reduce((total, { tokens: quantity }) => total + quantity, 0);
    const safe = situation.nearestEnemy(action.toHexId).distance >= SEA_SAFE_DISTANCE;
    const closeness = 40 - hexesBetween(action.toHexId, front);
    let value: number;
    if (action.fromHexId === null) {
      const role = action.unitIds.length > 0 ? roleOf.get(String(action.unitIds[0])) : undefined;
      const combat = role === 'COMBAT' || role === 'ARTILLERY' || role === 'HQ';
      value = 1000 + (combat ? 400 : tokens > 0 ? 200 + tokens : 100) + closeness + (safe ? 50 : 0);
    } else {
      const gain = hexesBetween(action.fromHexId, front) - hexesBetween(action.toHexId, front);
      if (gain < RAIL_MIN_GAIN_HEXES || !safe || action.supply.some(({ sourcePieceId }) => String(sourcePieceId).includes('-stock-'))) continue;
      value = gain * (tokens + action.unitIds.length * 8);
    }
    if (!best || value > best.value) best = { action, value, why: action.fromHexId === null ? `land ${tokens > 0 ? `${tokens}T` : 'a unit'} from the reinforcement Box at ${action.toHexId}` : `ship toward the front to ${action.toHexId}` };
  }
  if (!best) { notes.seaDone = true; return null; }
  return decision(best.action, best.why, [{ term: 'sea', value: best.value }]);
};

/** Keep ordinary movement inside supply; funded combat advances have their own guard. */
const preservesFriendlySupply = (context: BotDecisionContext, action: GameAction): boolean => keepsFriendlySupply(context.actions.explain(action).explanation);

const keepsFriendlySupply = (explanation: RuleExplanation): boolean => {
  const lost = explanation.facts.find(({ key }) => key === 'supply.relocationTraceLost')?.value;
  const feedLost = explanation.facts.find(({ key }) => key === 'supply.relocationFeedLost')?.value;
  const otherLost = explanation.facts.find(f => f.key === 'supply.relocationOtherTraceLost')?.value;
  const safe = explanation.allowed && otherLost === 0 && feedLost === 0 && lost === 0;
  if (!safe) debug?.(`keep friendly supply: ${explanation.actionKind} lacks preserved trace or allocated rations`);
  return safe;
};

const preservesRations = (context: BotDecisionContext, action: GameAction): boolean => {
  const { explanation } = context.actions.explain(action);
  return explanation.allowed && explanation.facts.some(f => f.key === 'supply.rationCommitmentsPreserved' && f.value === true);
};

const movementStep = (context: BotDecisionContext, situation: Situation, facts: BotGameFacts, w: HeuristicWeights): BotDecision | null => {
  const { actions } = context;
  const notes = notesOf(context);
  const traced = context.actions.traceCoverage();
  const coverage = new Set(traced.hexIds);
  const direct = new Set(traced.directHexIds);
  const unitCoverage = (unit: OwnUnit): ReadonlySet<string> => new Set(context.actions.traceCoverage(unit.piece.id).hexIds);
  const unitFeeds = (unit: OwnUnit): readonly FeedSource[] => context.actions.feedCoverage(unit.piece.id);
  const sideFeeds = context.actions.feedCoverage();
  if (notes.effort === undefined) {
    // heuristic@82: HQs and trucks follow the effort chosen first, the one the Combat Segment counts double. Following the
    // strongest one (heuristic@81) moved the drops from turn to turn: 8.4 drop hexes a game against 5.4.
    const efforts = chooseEfforts(context, situation, facts, w, w.assaultMaxEfforts);
    notes.effort = efforts[0] ?? null;
    notes.secondary = efforts.slice(1);
  }
  const effort = notes.effort;
  for (const each of [...(effort ? [effort] : []), ...(notes.secondary ?? [])]) {
    debug?.(`EFFORT ${each.hexId} vs ${each.defenders.toFixed(1)} with ${each.unitIds.size} unit(s) and ${each.gunIds.size} gun(s), lead ${each.lead}`);
  }
  notes.targets ??= planTargets(situation, coverage, unitCoverage, w, [...(effort ? [effort] : []), ...(notes.secondary ?? [])], fedHexes(sideFeeds));
  // heuristic@79: where an HQ can stand and draw SP that Rail Cap brings to a station this step (12.3a, 13.3c).
  notes.railDraw ??= new Set(railStations(situation, coverage).flatMap((station) => [...context.actions.drawReach(station)]));
  // HQs follow the main effort's lead (their own scores keep them in supply and away from the enemy), else the army.
  const front = effort?.lead ?? armyCenter(situation);
  // HQs move first: their throw range decides where the rest is in trace supply (12.3b).
  notes.relief ??= { hexIds: reliefTargets(context, situation, w), sent: new Map(), delivered: new Set() };
  // Deliver an urgent ration before field units move away from the route's ZOC-negating
  // hexes. Otherwise a legal rescue available at the start of the phase can disappear.
  const order = (unit: OwnUnit) => unit.piece.role === 'TRUCK' && notes.relief!.hexIds.length > 0 ? -1
    : unit.piece.role === 'HQ' ? 0 : unit.piece.role === 'COMBAT' ? 1 : unit.piece.role === 'ARTILLERY' ? 2 : unit.piece.role === 'TRUCK' ? 3 : 9;
  const units = situation.own.filter((unit) => order(unit) < 9 && !notes.done.has(unit.piece.id))
    .sort((left, right) => order(left) - order(right) || String(left.piece.id).localeCompare(String(right.piece.id)));
  // heuristic@79: rail and sea wait for the HQs. An HQ in Combat Mode on a railroad hex makes it a station (13.8c), and SP
  // railed to it or beside it is what the HQ throws to the units as fuel and trace (12.3b, 12.5c), before they move.
  if (context.view.projection?.sequence.phase === 'MOVEMENT' && !units.some((unit) => unit.piece.role === 'HQ')) {
    const shipped = seaStep(context, situation, notes, front);
    if (shipped) return shipped;
    const railed = railStep(context, situation, notes, front);
    if (railed) return railed;
  }
  for (const unit of units) {
    const id = unit.piece.id;
    if (unit.piece.role === 'TRUCK') {
      const step = truckStep(context, situation, unit, notes, w, effort);
      if (step) return step;
      continue;
    }
    const target = notes.targets.get(id);
    const enemyDistance = situation.nearestEnemy(unit.hexId).distance;
    // Mode first (5.4): Combat Mode near the enemy for strength and ZOC, Strat Mode far behind the lines.
    if (!notes.modeSet.has(id)) {
      notes.modeSet.add(id);
      const assaultClose = target?.purpose === 'ASSAULT' && hexesBetween(unit.hexId, target.hexId) <= w.combatModeDistance + 1;
      const blockedCapture = target?.purpose === 'CAPTURE' && situation.enemy.get(target.hexId)?.hasCombatUnit
        && hexesBetween(unit.hexId, target.hexId) <= w.combatModeDistance;
      const wanted = unit.piece.role === 'COMBAT' && (enemyDistance <= w.combatModeDistance || assaultClose || blockedCapture) ? 'COMBAT'
        : unit.piece.role === 'COMBAT' && (unit.profile?.movement ?? 0) > 0 && enemyDistance >= w.stratModeEnemyDistance && target && hexesBetween(unit.hexId, target.hexId) >= w.stratModeTargetDistance ? 'STRAT'
          // An HQ with the army stays in Combat Mode to rebuild units (13.5a); one far behind moves up in Move Mode.
          : unit.piece.role === 'HQ' ? (front !== null && (hexesBetween(unit.hexId, front) <= w.hqCombatModeRadius
            // heuristic@79: on a railroad hex an HQ in Combat Mode is a station (13.8c); it stays there while the army is near.
            || (railheadHex(situation, unit.hexId) && hexesBetween(unit.hexId, front) <= w.hqRailheadReach)) ? 'COMBAT' : 'MOVE')
            : unit.piece.role === 'ARTILLERY' && target?.purpose === 'ASSAULT' ? artilleryMode(unit, hexesBetween(unit.hexId, target.hexId), w) : null;
      if (wanted !== null && unit.piece.mode !== wanted) {
        const change = actions.candidates('CHANGE_MODE', id).find((action) => action.kind === 'CHANGE_MODE' && action.mode === wanted);
        if (change && preservesFriendlySupply(context, change)) {
          return decision(change, `${wanted} mode (${enemyDistance} hexes from the enemy)`, [{ term: 'mode', value: 1 }]);
        }
      }
    }
    // Overrun what is in the way when the table promises a clear result (8.0).
    if (unit.piece.role === 'COMBAT') {
      const overrun = bestCombat(context, situation, facts, w, actions.candidates('DECLARE_COMBAT', id, 20), w.attackThreshold * w.overrunThresholdFactor);
      if (overrun) return overrun;
    }
    let moves = actions.candidates('MOVE_PIECE', id);
    if (moves.length === 0 && !notes.fueled.has(id)) {
      notes.fueled.add(id);
      // Combat units fuel to reach their target; HQs and artillery always fuel to keep up with the front.
      const wantsToMove = unit.piece.role !== 'COMBAT' || (target !== undefined && hexesBetween(unit.hexId, target.hexId) > 0);
      const fuel = wantsToMove ? [...actions.candidates('PAY_FUEL', id)].sort((left, right) => fuelRank(left) - fuelRank(right))
        .find(action => preservesRations(context, action)) : undefined;
      if (fuel && wantsToMove) return decision(fuel, `fuel to move (${fuel.kind === 'PAY_FUEL' ? fuel.method : ''})`, [{ term: 'fuel', value: 1 }]);
    }
    notes.done.add(id);
    moves = actions.candidates('MOVE_PIECE', id);
    if (moves.length === 0) {
      if (unit.piece.role === 'COMBAT' && target !== undefined && hexesBetween(unit.hexId, target.hexId) > 0 && needsFuel(facts, unit)
        && actions.candidates('PAY_FUEL', id).length === 0) notes.stranded.set(id, unit.hexId);
      if (unit.piece.role === 'HQ') markCovered(situation, notes, unit, unit.hexId);
      debug?.(`${unit.piece.role} ${id} at ${unit.hexId} mode ${unit.piece.mode} ${unitCoverage(unit).has(unit.hexId) ? 'in-trace' : 'OUT-OF-TRACE'} target ${target?.purpose ?? '-'} ${target?.hexId ?? ''} enemy ${enemyDistance}: no moves `
        + `(fuel offers ${actions.candidates('PAY_FUEL', id).length})`);
      continue;
    }
    // A combat unit's own trace applies 12.6f (the formation's common route) and 13.1d; others use the side's trace.
    // heuristic@11: HQs and artillery too: an HQ's own throw does not supply itself (12.3b), and an HQ only supplies its
    // own division (13.1d).
    const reach = unit.piece.role === 'COMBAT' || unit.piece.role === 'HQ' || unit.piece.role === 'ARTILLERY' ? unitCoverage(unit) : coverage;
    // An HQ's own throw does not feed itself (12.3b): it needs a dump that reaches it directly.
    const feeds = unit.piece.role === 'COMBAT' || unit.piece.role === 'ARTILLERY' ? unitFeeds(unit) : unit.piece.role === 'HQ' ? context.actions.feedCoverage(id) : sideFeeds;
    const opponentTurnRemains = situation.turnsLeft > 0 || context.view.projection!.sequence.playerTurnIndex === 0;
    const stay = sum(scoreDestination(situation, unit, target, [unit.hexId], notes, reach, direct, front, w, feeds, opponentTurnRemains));
    let best: { action: GameAction; terms: BotScoreTerm[] } | null = null;
    const scored: { action: GameAction; terms: BotScoreTerm[] }[] = [];
    for (const move of moves) {
      if (move.kind !== 'MOVE_PIECE') continue;
      const terms = scoreDestination(situation, unit, target, move.path, notes, reach, direct, front, w, feeds, opponentTurnRemains);
      scored.push({ action: move, terms });
    }
    // A profitable, supplied capture beats merely approaching a hunt/assault target (VP > Kill > Loss).
    // While an opposing turn remains, prefer captures ending on a VP. In the final second
    // turn, control from passing through counts too; retaining an army there has no later-turn benefit.
    const captureSwing = (action: GameAction): number => {
      if (unit.piece.role !== 'COMBAT' || action.kind !== 'MOVE_PIECE'
        || opponentTurnRemains && !situation.objectives.some(o => o.controllerId !== situation.playerId && o.hexId === action.path.at(-1))) return 0;
      return situation.objectives.filter(o => o.controllerId !== situation.playerId && action.path.slice(1).includes(o.hexId))
        .reduce((total, o) => total + contestedVp(o), 0);
    };
    // A move can negate enemy ZOC or open a captured rail/port route. Pre-move coverage then
    // understates supply at the destination. Check promising moves against the real relocation preview.
    const actuallyTraced = new Set<GameAction>();
    const corrections = scored.filter(c => c.terms.some(t => t.term === 'out-of-supply')
      && (unit.piece.role === 'COMBAT' || unit.piece.role === 'ARTILLERY' || unit.piece.role === 'HQ')
      && sum(c.terms.filter(t => t.term !== 'out-of-supply')) > stay)
      .sort((a, b) => captureSwing(b.action) - captureSwing(a.action)
        || sum(b.terms.filter(t => t.term !== 'out-of-supply')) - sum(a.terms.filter(t => t.term !== 'out-of-supply'))).slice(0, 12);
    for (const candidate of corrections) {
      const { explanation } = actions.explain(candidate.action);
      const value = (key: string) => explanation.facts.find(f => f.key === key)?.value;
      if (!explanation.allowed || value('supply.relocationMoverHasTrace') !== true
        || value('supply.relocationTraceLost') !== 0 || value('supply.relocationFeedLost') !== 0) continue;
      actuallyTraced.add(candidate.action);
      candidate.terms = candidate.terms.filter(t => t.term !== 'out-of-supply');
      if (unit.piece.role === 'COMBAT' && situation.turnsLeft > 1 && !direct.has(destinationOf(candidate.action)!)) {
        candidate.terms.push({ term: 'hq-dependent-supply', value: -w.hqDependentSupply });
      }
    }
    const improving = scored.filter(candidate => sum(candidate.terms) > stay)
      .sort((left, right) => captureSwing(right.action) - captureSwing(left.action) || sum(right.terms) - sum(left.terms));
    for (const candidate of improving) {
      if (!preservesFriendlySupply(context, candidate.action)) continue;
      best = candidate;
      break;
    }
    debug?.(`${unit.piece.role} ${id} at ${unit.hexId} mode ${unit.piece.mode} ${reach.has(unit.hexId) ? 'in-trace' : 'OUT-OF-TRACE'} target ${target?.purpose ?? '-'} ${target?.hexId ?? ''} `
      + `enemy ${enemyDistance} moves ${moves.length} stay ${stay.toFixed(1)} best ${best ? `${sum(best.terms).toFixed(1)} to ${destinationOf(best.action)} ${JSON.stringify(best.terms)}` : '-'}`);
    if (best && sum(best.terms) > stay) {
      const destination = destinationOf(best.action)!;
      if (unit.piece.role === 'HQ') markCovered(situation, notes, unit, destination);
      notes.incomingRe.set(destination, (notes.incomingRe.get(destination) ?? 0) + reOf(unit));
      // A unit ending out of trace counts on eating: promise it the SP it will need.
      if ((unit.piece.role === 'COMBAT' || unit.piece.role === 'ARTILLERY') && !reach.has(destination) && !actuallyTraced.has(best.action)) {
        const source = feedSourceFor(notes, feeds, unit, destination);
        if (source !== null) notes.feedBudget!.set(source, notes.feedBudget!.get(source)! - eatingCost(unit));
      }
      const gain = captureSwing(best.action);
      return decision(best.action, gain > 0 ? `take VP along this route (+${gain} score margin), preserving friendly supply`
        : `${unit.piece.role.toLowerCase()} to ${destination}${target ? ` (${target.purpose.toLowerCase()} ${target.hexId})` : ''}`, best.terms);
    }
    if (unit.piece.role === 'HQ') markCovered(situation, notes, unit, unit.hexId);
  }
  // An HQ that could not advance must not spend the following Reinforcement phase in Move Mode
  // beside unused replacements. Restore its rebuild role after movement, without breaking trace.
  // Rear-area rebuilds need time to reach the front. Late activation regressed a recorded VP position.
  if (situation.turnsLeft > 3) {
    const knowledge = knowledgeOf(facts);
    const ownPieces = context.view.projection!.stacks.flatMap(s => s.pieces).filter(p => p.ownerId === situation.playerId);
    const mobileDead = ownPieces.some(p => p.location.kind === 'ELIMINATED' && ['COMBAT', 'ARTILLERY'].includes(p.role)
      && knowledge.definition(p)?.counter?.rebuildable
      && knowledge.definition(p)?.faces.some(f => f.steps.some(s => Number(s.movementPointTicks ?? 0) > 0)));
    for (const hq of situation.own.filter(u => u.piece.role === 'HQ' && u.piece.mode === 'MOVE')) {
      const replacements = situation.own.filter(u => u.piece.role === 'REPLACEMENT' && (u.piece.resourceQuantity ?? 0) > 0 && hexesBetween(u.hexId, hq.hexId) <= 2);
      const reduced = replacements.some(r => situation.friendlyAt(r.hexId).some(u => ['COMBAT', 'ARTILLERY'].includes(u.piece.role)
        && knowledge.definition(u.piece)?.counter?.rebuildable
        && knowledge.definition(u.piece)!.faces.some(f => f.steps.some(s => s.remainingSteps > (u.piece.remainingSteps ?? 0)))));
      if (!replacements.length || (!mobileDead && !reduced)) continue;
      const change = actions.candidates('CHANGE_MODE', hq.piece.id).find(a => a.kind === 'CHANGE_MODE' && a.mode === 'COMBAT');
      if (change && preservesFriendlySupply(context, change)) return decision(change, 'HQ Combat Mode to use nearby replacements next turn', [{ term: 'rebuild-readiness', value: 1 }]);
    }
  }
  return null;
};

/** Hexes already dug in (or refused) this step, so each is considered once. */
const DUG_HEXES = 'heuristic.hedgehogs';
const HEDGEHOG_LEVEL_TOKENS = 8;

/**
 * heuristic@10: once every unit has moved, the ones that stayed dig in where the enemy is close (16.0b): held objectives
 * first, then other hexes next to the enemy, a crew in the hex before an engineer, while the dumps keep a reserve.
 */
const hedgehogStep = (context: BotDecisionContext, situation: Situation, w: HeuristicWeights): BotDecision | null => {
  if (!context.actions.families().includes('BUILD_HEDGEHOG')) return null;
  const dug = (context.memory.notes.get(DUG_HEXES) as Set<HexId> | undefined) ?? new Set<HexId>();
  context.memory.notes.set(DUG_HEXES, dug);
  const tokens = situation.own.reduce((total, { piece }) => total + (piece.role === 'DUMP' ? piece.resourceQuantity ?? 0 : 0), 0);
  if (tokens - HEDGEHOG_LEVEL_TOKENS < w.hedgehogSupplyReserve) return null;
  const levelAt = (hexId: HexId): number => {
    const value = situation.friendlyAt(hexId).find(({ piece }) => piece.role === 'HEDGEHOG')?.piece.statusValues
      .find(({ statusDefinitionId }) => statusDefinitionId === 'status:hedgehog-level')?.value;
    return typeof value === 'number' ? value : situation.friendlyAt(hexId).some(({ piece }) => piece.role === 'HEDGEHOG') ? 1 : 0;
  };
  let best: { action: GameAction; score: number; hexId: HexId; wanted: number } | null = null;
  for (const action of context.actions.candidates('BUILD_HEDGEHOG', null, 200)) {
    if (action.kind !== 'BUILD_HEDGEHOG' || dug.has(action.hexId)) continue;
    const distance = situation.nearestEnemy(action.hexId).distance;
    if (distance > w.hedgehogThreatRadius) continue;
    const objective = situation.objectives.find(({ hexId, controllerId }) => hexId === action.hexId && controllerId === situation.playerId);
    const wanted = objective ? w.hedgehogObjectiveLevel : distance <= 1 ? w.hedgehogFrontLevel : 0;
    if (levelAt(action.hexId) >= wanted) continue;
    if (!preservesRations(context, action)) continue;
    const score = (objective ? 10 * objective.points : 0) + situation.threatAt(action.hexId) + (action.engineerId === null ? 1 : 0);
    if (!best || score > best.score) best = { action, score, hexId: action.hexId, wanted };
  }
  if (!best) return null;
  dug.add(best.hexId);
  return decision(best.action, `dig in at ${best.hexId} (hedgehog toward Level ${best.wanted})`, [{ term: 'hedgehog', value: best.score }]);
};

const fuelRank = (action: GameAction): number => action.kind !== 'PAY_FUEL' ? 9 : action.method === 'FORMATION' ? 0 : action.method === 'HQ' ? 1 : 2;

// ─── Combat and barrage ────────────────────────────────────────────────────────────────────────

/**
 * heuristic@81: the price of a Token spent on combat or barrage, relative to the full weight. SP the side holds near the units
 * paying is what attacks are for; the price falls as the Tokens in dumps that reach them (12.3, 12.6c) exceed
 * `supplyReserveTokens`, and stays whole below it. Replays of v79 attack games: 50 of 61 Combat Segments ended with the best
 * attack under the threshold, its supply term (-9.8) outweighing the steps it would take, 19 of them only because of it.
 * heuristic@83: only the defender of an attack engagement prices it; the attacker and meeting sides pay full price.
 */
const supplyPrice = (context: BotDecisionContext, situation: Situation, pieceIds: readonly PieceId[], w: HeuristicWeights): number => {
  if (situation.posture !== 'DEFENDER') return 1;
  const ids = new Set(pieceIds.map(String));
  const hexes = new Set(situation.own.filter(({ piece }) => ids.has(String(piece.id))).map(({ hexId }) => String(hexId)));
  const local = context.actions.feedCoverage().filter(({ hexIds }) => hexIds.some((hexId) => hexes.has(String(hexId))))
    .reduce((total, { tokens }) => total + tokens, 0);
  return Math.min(1, w.supplyReserveTokens / Math.max(1, local));
};

/**
 * What an attack on `targetHexId` with these expected results is worth in steps and VP, with the chance it empties the hex.
 * The Combat Segment adds supply and situational terms; heuristic@81 sizes assault groups with the same terms.
 */
const assaultTerms = (situation: Situation, facts: BotGameFacts, w: HeuristicWeights, forecast: Omit<CombatForecast, 'odds' | 'supplyTokens'>,
  targetHexId: HexId, effortTarget: boolean): { terms: BotScoreTerm[]; vacate: number } => {
  const enemy = situation.enemy.get(targetHexId);
  // Steps the defender can lose before the hex empties: printed steps of the visible counters, two per hidden one.
  const defenderSteps = Math.max(1, (enemy?.pieces ?? []).filter(({ role }) => role !== 'DUMP' && role !== 'TRUCK' && role !== 'HEDGEHOG')
    .reduce((total, piece) => total + (knowledgeOf(facts).profile(piece)?.steps ?? 1), 0) + (enemy?.hidden ?? 0) * 2);
  const vacate = Math.min(1, (forecast.defenderLosses + forecast.defenderOptions * w.vacateOptionShare) / defenderSteps);
  const terms: BotScoreTerm[] = [
    { term: 'defender-steps', value: forecast.defenderLosses * w.defenderLoss + forecast.defenderOptions * w.defenderOption },
    { term: 'attacker-steps', value: -(forecast.attackerLosses * w.attackerLoss + forecast.attackerOptions * w.attackerOption) },
  ];
  const objective = situation.objectives.find(({ hexId }) => hexId === targetHexId);
  if (objective && objective.controllerId !== situation.playerId) {
    terms.push({ term: 'objective', value: vacate * contestedVp(objective) * w.objectiveTaken * (effortTarget ? w.assaultObjective : 1) });
  }
  return { terms, vacate };
};

/**
 * heuristic@81: the lowest Combat Table column at which the Combat Segment would attack the objective as an effort's target
 * (steps, VP and the hedgehog's roll modifier, 16.0d; supply aside), or null when no column would do.
 */
const requiredColumn = (situation: Situation, facts: BotGameFacts, w: HeuristicWeights, targetHexId: HexId, hedgehogLevel: number): number | null => {
  for (let column = 0; column < COMBAT_TABLE_COLUMNS.OPEN.length; column++) {
    if (sum(assaultTerms(situation, facts, w, forecastColumn(column, -hedgehogLevel), targetHexId, true).terms) >= w.attackThreshold) return column;
  }
  return null;
};

/** The declared combat with the best expected value on the printed table, if any clears the threshold. */
const bestCombat = (context: BotDecisionContext, situation: Situation, facts: BotGameFacts, w: HeuristicWeights, candidates: readonly GameAction[], threshold: number, effortHexes: ReadonlySet<HexId> = new Set()): BotDecision | null => {
  let best: { action: GameAction; terms: BotScoreTerm[]; odds: string } | null = null;
  for (const action of candidates) {
    if (action.kind !== 'DECLARE_COMBAT') continue;
    const explained = context.actions.explain(action);
    if (!explained.explanation.allowed) continue;
    const noRationRemains = situation.turnsLeft <= 0 && context.view.projection?.sequence.phase === 'EXPLOITATION';
    if (action.combatKind === 'OVERRUN' && ((!noRationRemains && explained.explanation.facts.find(f => f.key === 'supply.overrunAdvanceFunded')?.value !== true)
      || explained.explanation.facts.find(f => f.key === 'supply.overrunOtherTraceLost')?.value !== 0)) continue;
    const forecast = forecastCombat(explained.explanation.facts);
    if (!forecast) continue;
    const objective = situation.objectives.find(({ hexId }) => hexId === action.targetHexId);
    // Below 1:1 the attacker loses more than it gains; only a last-turn grab for an objective justifies it.
    const [oddsFor = 0, oddsAgainst = 1] = forecast.odds.split(':').map(Number);
    const lastGrab = situation.turnsLeft <= 0 && objective !== undefined && objective.controllerId !== situation.playerId;
    if (oddsFor / Math.max(1e-9, oddsAgainst) < w.minimumOdds && !lastGrab) continue;
    const enemy = situation.enemy.get(action.targetHexId);
    const { terms, vacate } = assaultTerms(situation, facts, w, forecast, action.targetHexId, effortHexes.has(action.targetHexId));
    terms.push({ term: 'supply', value: -forecast.supplyTokens * w.combatSupply * supplyPrice(context, situation, action.attackerIds, w) });
    // Enemy units behind the front cut trace supply and pick up empty objectives: clear them.
    const nearHeld = situation.objectives.some(({ hexId, controllerId }) => controllerId === situation.playerId && hexesBetween(hexId, action.targetHexId) <= 1);
    if (nearHeld) terms.push({ term: 'protect-objective', value: vacate * w.protectObjective });
    // A weak stack's ZOC cuts our supply paths: removing it is worth more than its steps.
    if (enemy !== undefined && enemy.strength <= w.clearStrength) terms.push({ term: 'clear-zoc', value: vacate * w.clearCombat });
    if (forecast.defenderDisorganized > 0) terms.push({ term: 'disorganize', value: forecast.defenderDisorganized * w.disorganize });
    // heuristic@75: attackers that stand on an objective we hold and carry its defence weaken it whenever they lose a step,
    // and the enemy moves next. A recorded final turn: an attack out of a held 4 VP point cost its 1-step unit and the
    // point fell on the enemy's last move.
    if (situation.opponentTurnRemains) {
      const attackerIds = new Set(action.attackerIds.map(String));
      const risk = Math.min(1, forecast.attackerLosses + forecast.attackerOptions);
      for (const held of situation.objectives) {
        if (held.controllerId !== situation.playerId) continue;
        const here = situation.friendlyAt(held.hexId).filter(u => situation.isCombatUnit(u));
        const attacking = here.filter(u => attackerIds.has(String(u.piece.id))).reduce((total, u) => total + (u.profile?.strength ?? 0), 0);
        if (attacking === 0) continue;
        const staying = here.filter(u => !attackerIds.has(String(u.piece.id))).reduce((total, u) => total + (u.profile?.strength ?? 0), 0);
        if (staying >= situation.threatAt(held.hexId) * w.holdRatio) continue;
        terms.push({ term: 'objective-at-risk', value: -risk * contestedVp(held) * w.objectiveTaken * 0.25 * attacking / (attacking + staying) });
      }
    }
    if (!best || sum(terms) > sum(best.terms)) best = { action, terms, odds: forecast.odds };
  }
  if (best) debug?.(`combat best ${best.odds} on ${best.action.kind === 'DECLARE_COMBAT' ? best.action.targetHexId : ''} score ${sum(best.terms).toFixed(1)} ${JSON.stringify(best.terms)} of ${candidates.length}`);
  else debug?.(`combat: none of ${candidates.length} candidates could be forecast`);
  if (!best || sum(best.terms) < threshold) return null;
  const kind = best.action.kind === 'DECLARE_COMBAT' ? best.action.combatKind.toLowerCase() : 'combat';
  return decision(best.action, `${kind} at ${best.odds} on ${best.action.kind === 'DECLARE_COMBAT' ? best.action.targetHexId : ''}`, best.terms, candidates);
};

const publicFacilityTarget = (context: BotDecisionContext, facts: BotGameFacts, action: Extract<GameAction, { readonly kind: 'DECLARE_BARRAGE' }>): PublicFacilityTarget | null => {
  if (action.target === 'PORT') {
    const port = context.view.projection?.ports?.find(({ hexId }) => hexId === action.targetHexId);
    return port && port.controllerId !== null && port.controllerId !== context.playerId
      ? { kind: 'PORT', printedTokens: port.printedTokens, hits: port.hits } : null;
  }
  if (action.target !== 'AIR_BASE') return null;
  const pieces = context.view.projection?.stacks.find(({ location }) => location.kind === 'ON_MAP' && location.hexId === action.targetHexId)?.pieces ?? [];
  const base = pieces.find(({ role, ownerId }) => role === 'AIR_BASE' && ownerId !== context.playerId);
  if (!base) return null;
  const strip = knowledgeOf(facts).definition(base)?.facility?.facilityTypeDefinitionId === 'facility:air-strip';
  const level = base.statusValues.find(({ statusDefinitionId }) => statusDefinitionId === 'status:air-base-level')?.value;
  return { kind: 'AIR_BASE', strip, level: strip ? 0 : typeof level === 'number' ? level : 1,
    visibleAircraft: pieces.filter(({ role, ownerId }) => role === 'AIRCRAFT' && ownerId !== context.playerId).length };
};

const projectionEnemyTurnRemains = (context: BotDecisionContext): boolean => {
  const sequence = context.view.projection!.sequence;
  return sequence.phase !== 'REACTION' && sequence.playerTurnIndex === 0;
};

const bestBarrage = (context: BotDecisionContext, situation: Situation, facts: BotGameFacts, w: HeuristicWeights, effortHexes: ReadonlySet<HexId> = new Set()): BotDecision | null => {
  const candidates = context.actions.candidates('DECLARE_BARRAGE', null, 60);
  let best: { action: Extract<GameAction, { readonly kind: 'DECLARE_BARRAGE' }>; terms: BotScoreTerm[] } | null = null;
  for (const action of candidates) {
    if (action.kind !== 'DECLARE_BARRAGE') continue;
    const { explanation } = context.actions.explain(action);
    if (!explanation.allowed) continue;
    if ((action.target ?? 'COMBAT_UNITS') !== 'COMBAT_UNITS') {
      if (!explanation.facts.some(({ key, value }) => key === 'supply.rationCommitmentsPreserved' && value === true)) continue;
      const target = publicFacilityTarget(context, facts, action);
      const forecast = target ? forecastFacilityBarrage(explanation.facts, target) : null;
      if (!forecast) continue;
      const enemyTurns = situation.turnsLeft + Number(projectionEnemyTurnRemains(context));
      const portOwner = context.view.projection?.ports?.find(({ hexId }) => hexId === action.targetHexId)?.controllerId;
      const portSide = facts.scenario.players.find(({ id }) => id === portOwner)?.sideDefinitionId;
      const portIsSource = facts.scenario.sources.some(({ hexId, sideDefinitionId }) => hexId === action.targetHexId
        && (sideDefinitionId === null || sideDefinitionId === portSide));
      const terms: BotScoreTerm[] = [
        { term: 'port-capacity', value: forecast.expectedPortCapacityTokensLost * enemyTurns * w.barrageSupply },
        { term: 'port-supply-source', value: portIsSource && enemyTurns > 0 ? forecast.expectedPortSourceLoss * w.barrageDisruptBeforeAttack : 0 },
        { term: 'base-refit-capacity', value: enemyTurns > 0 ? forecast.expectedBaseLevelsLost * 2 * w.barrageDisrupt : 0 },
        { term: 'visible-aircraft-steps', value: forecast.expectedAircraftSteps * w.barrageSteps },
        { term: 'supply', value: -forecast.supplyTokens * w.barrageSupply },
      ];
      if (!best || sum(terms) > sum(best.terms)) best = { action, terms };
      continue;
    }
    const forecast = forecastBarrage(explanation.facts);
    if (!forecast) continue;
    // Worth most against hexes our units are about to attack or that threaten an objective.
    const adjacentOwn = situation.own.some((unit) => situation.isCombatUnit(unit) && hexesBetween(unit.hexId, action.targetHexId) <= 1);
    const nearObjective = situation.objectives.some(({ hexId }) => hexesBetween(hexId, action.targetHexId) <= 1);
    const terms: BotScoreTerm[] = [
      { term: 'disrupt', value: forecast.disrupt * (adjacentOwn ? w.barrageDisruptBeforeAttack : w.barrageDisrupt) },
      { term: 'steps', value: forecast.expectedSteps * w.barrageSteps },
      { term: 'supply', value: -forecast.supplyTokens * w.barrageSupply * supplyPrice(context, situation, action.firerIds, w) },
    ];
    if (nearObjective) terms.push({ term: 'objective', value: w.barrageNearObjective });
    if (effortHexes.has(action.targetHexId)) terms.push({ term: 'main-effort', value: w.barrageMainEffort });
    if (!best || sum(terms) > sum(best.terms)) best = { action, terms };
  }
  if (!best || sum(best.terms) < w.barrageThreshold) return null;
  const target = best.action.target ?? 'COMBAT_UNITS';
  const subject = target === 'COMBAT_UNITS' ? best.action.targetHexId : `${target} at ${best.action.targetHexId}`;
  const alternatives = target === 'COMBAT_UNITS'
    ? candidates.filter(action => action.kind === 'DECLARE_BARRAGE' && (action.target ?? 'COMBAT_UNITS') === 'COMBAT_UNITS') : [];
  return decision(best.action, `barrage ${subject}`, best.terms, alternatives);
};

/**
 * Air barrage (14.7, heuristic@6): before the ground barrages, the bombers and their fighter escort hit the stack the
 * main effort will attack, else a stack our units stand next to; an objective under it counts extra. A target that no
 * friendly unit is about to attack is not worth risking aircraft on. The mission flies as many aircraft as it can (4).
 */
const bestAirBarrage = (context: BotDecisionContext, situation: Situation, w: HeuristicWeights, effortHexes: ReadonlySet<HexId>): BotDecision | null => {
  const missions = context.actions.candidates('DECLARE_AIR_MISSION', null, 400)
    .filter((action) => action.kind === 'DECLARE_AIR_MISSION' && action.mission === 'BARRAGE' && action.target === 'COMBAT_UNITS');
  let best: { action: GameAction; terms: BotScoreTerm[] } | null = null;
  for (const action of missions) {
    if (action.kind !== 'DECLARE_AIR_MISSION') continue;
    const adjacentOwn = situation.own.some((unit) => situation.isCombatUnit(unit) && hexesBetween(unit.hexId, action.targetHexId) <= 1);
    const isEffort = effortHexes.has(action.targetHexId);
    if (!adjacentOwn && !isEffort) continue;
    const terms: BotScoreTerm[] = [
      { term: 'before-attack', value: w.barrageDisruptBeforeAttack },
      { term: 'aircraft', value: action.aircraftIds.length },
      { term: 'strength', value: (situation.enemy.get(action.targetHexId)?.strength ?? 0) / 4 },
    ];
    if (isEffort) terms.push({ term: 'main-effort', value: w.barrageMainEffort * 2 });
    if (situation.objectives.some(({ hexId }) => hexesBetween(hexId, action.targetHexId) <= 1)) terms.push({ term: 'objective', value: w.barrageNearObjective });
    if (!best || sum(terms) > sum(best.terms)) best = { action, terms };
  }
  return best ? decision(best.action, `air barrage ${best.action.kind === 'DECLARE_AIR_MISSION' ? best.action.targetHexId : ''}`, best.terms, missions) : null;
};

// ─── Other steps ───────────────────────────────────────────────────────────────────────────────

interface RebuildOptions {
  readonly pax: number; readonly eq: number; readonly truckPoints: number;
  readonly units: readonly { readonly pieceId: PieceId; readonly price: { readonly row: string; readonly pax: number; readonly eq: number; readonly pairs: boolean }; readonly missing: number;
    readonly modes: readonly OcsMode[]; readonly eliminated: boolean; readonly fixed: boolean; readonly originalHexId: HexId | null }[];
}

/** Spend replacements on defenders of VP and troops able to return to the front, using actual printed strength. */
const chooseRebuild = (context: BotDecisionContext, situation: Situation, facts: BotGameFacts): BotDecision | null => {
  const pieces = new Map(context.view.projection!.stacks.flatMap(s => s.pieces).filter(p => p.ownerId === situation.playerId).map(p => [p.id, p]));
  let best: { action: GameAction; vp: number; strength: number } | null = null;
  for (const candidate of context.actions.candidates('REBUILD_UNITS', null, 40)) {
    if (candidate.kind !== 'REBUILD_UNITS') continue;
    const encoded = context.actions.explain(candidate).explanation.facts.find(f => f.key === 'replacement.rebuildOptions')?.value;
    if (typeof encoded !== 'string') continue;
    const options = JSON.parse(encoded) as RebuildOptions;
    const objective = situation.objectives.find(o => o.hexId === candidate.hexId && o.controllerId === situation.playerId);
    const defenders = situation.friendlyAt(candidate.hexId).filter(u => situation.isCombatUnit(u)).reduce((sum, u) => sum + (u.profile?.strength ?? 0), 0);
    const defenceVp = objective && defenders < Math.max(1, situation.threatAt(candidate.hexId)) ? objective.points : 0;
    const left = { PAX: options.pax, EQ: options.eq };
    const selected = new Map<PieceId, { steps: number; mode: OcsMode | null }>();
    // 13.5d: a pairs row whose last unit was paid for rebuilds one more unit free.
    const openPair = new Set<string>();
    const usable = options.units.filter(u => !u.fixed || !u.eliminated || objective !== undefined || u.originalHexId === candidate.hexId);
    for (;;) {
      const choices = usable.flatMap(u => {
        const allocated = selected.get(u.pieceId)?.steps ?? 0;
        const free = u.price.pairs && openPair.has(u.price.row);
        if (allocated >= u.missing || (!free && (left.PAX < u.price.pax || left.EQ < u.price.eq))) return [];
        const piece = pieces.get(u.pieceId);
        if (!piece) return [];
        const definition = knowledgeOf(facts).definition(piece);
        const mode = u.eliminated ? (u.modes.includes('COMBAT') ? 'COMBAT' : u.modes[0]!) : null;
        const face = definition?.faces.find(f => f.id === (mode?.toLowerCase() ?? piece.currentFaceId)) ?? definition?.faces[0];
        const before = (u.eliminated ? 0 : piece.remainingSteps ?? 0) + allocated;
        const oldStrength = before === 0 ? 0 : face?.steps.find(s => s.remainingSteps === before)?.combatStrength ?? 0;
        const newStrength = face?.steps.find(s => s.remainingSteps === before + 1)?.combatStrength ?? oldStrength;
        return [{ u, mode, gain: newStrength - oldStrength, vp: piece.role === 'COMBAT' ? defenceVp : 0,
          hq: Number(piece.role === 'HQ' && !situation.own.some(other => other.piece.role === 'HQ'
            && knowledgeOf(facts).definition(other.piece)?.ownership.formationDefinitionId === definition?.ownership.formationDefinitionId)), mobile: Number(!u.fixed) }];
      }).sort((a, b) => b.vp - a.vp || b.hq - a.hq || b.mobile - a.mobile || b.gain - a.gain || a.u.pieceId.localeCompare(b.u.pieceId));
      const next = choices[0];
      if (!next) break;
      if (next.u.price.pairs && openPair.has(next.u.price.row)) openPair.delete(next.u.price.row);
      else {
        left.PAX -= next.u.price.pax;
        left.EQ -= next.u.price.eq;
        if (next.u.price.pairs) openPair.add(next.u.price.row);
      }
      selected.set(next.u.pieceId, { steps: (selected.get(next.u.pieceId)?.steps ?? 0) + 1, mode: next.mode });
    }
    let action: Extract<GameAction, { kind: 'REBUILD_UNITS' }> = { ...candidate,
      units: [...selected].map(([pieceId, u]) => ({ pieceId, ...u })), truckPoints: Math.min(options.truckPoints, left.EQ) };
    if (!action.units.length && !action.truckPoints) continue;
    // A fixed unit cannot move to supply after rebuilding: remove it if mandatory recovery and joint rations cannot pay.
    const preview = context.actions.explain(action).explanation;
    if (!preview.allowed) continue;
    const unsupported = preview.facts.find(f => f.key === 'replacement.unsupportedFixedIds')?.value;
    const unfed = new Set(typeof unsupported === 'string' ? JSON.parse(unsupported) as PieceId[] : []);
    action = { ...action, units: action.units.filter(u => !unfed.has(u.pieceId)) };
    if (!action.units.length && !action.truckPoints) continue;
    const final = context.actions.explain(action).explanation;
    if (!final.allowed) continue;
    const strength = Number(final.facts.find(f => f.key === 'replacement.addedCombatStrength')?.value ?? 0);
    const vp = defenceVp && action.units.some(u => pieces.get(u.pieceId)?.role === 'COMBAT') ? defenceVp : 0;
    if (!best || vp > best.vp || (vp === best.vp && strength > best.strength)) best = { action, vp, strength };
  }
  return best ? decision(best.action, `rebuild for ${best.vp > 0 ? 'VP defence' : 'usable combat strength'} (${rebuildSize(best.action)} step(s))`,
    [{ term: 'rebuild-vp', value: best.vp }, { term: 'rebuild-strength', value: best.strength }]) : null;
};

const reinforcementStep = (context: BotDecisionContext, situation: Situation, facts: BotGameFacts): BotDecision | null => {
  const rebuild = chooseRebuild(context, situation, facts);
  if (rebuild) return rebuild;
  const placements = context.actions.candidates('PLACE_REINFORCEMENT', null, 400);
  if (placements.length === 0) return null;
  const goals = situation.objectives.filter(({ controllerId }) => controllerId !== situation.playerId).map(({ hexId }) => hexId);
  const front = frontHex(situation);
  const aim = goals.length > 0 ? goals : front ? [front] : [];
  const projection = context.view.projection!;
  const roleOf = new Map(projection.stacks.flatMap(({ pieces }) => pieces).map((piece) => [String(piece.id), piece.role]));
  const hqs = situation.own.filter(({ piece }) => piece.role === 'HQ').map(({ hexId }) => hexId);
  const traces = new Map<PieceId, ReadonlySet<string>>();
  const scored = placements.map((action) => {
    const hexId = action.kind === 'PLACE_REINFORCEMENT' ? action.hexId : ('' as HexId);
    // Repls rebuild only near an HQ (13.5a); everything else arrives as close to the objectives as it may.
    const goalsFor = action.kind === 'PLACE_REINFORCEMENT' && roleOf.get(String(action.pieceId)) === 'REPLACEMENT' && hqs.length > 0 ? hqs : aim;
    const distance = goalsFor.length > 0 ? Math.min(...goalsFor.map((goal) => hexesBetween(hexId, goal))) : 0;
    let traced = 0;
    if (action.kind === 'PLACE_REINFORCEMENT' && ['COMBAT', 'HQ', 'ARTILLERY', 'REPLACEMENT'].includes(roleOf.get(String(action.pieceId)) ?? '')
      && (roleOf.get(String(action.pieceId)) !== 'REPLACEMENT' || distance <= 2)) {
      if (!traces.has(action.pieceId)) traces.set(action.pieceId, new Set(context.actions.traceCoverage(action.pieceId).hexIds));
      traced = Number(traces.get(action.pieceId)!.has(hexId));
    }
    // heuristic@79: arriving SP on a railroad entry hex can entrain this turn (13.6b) and ride Rail Cap to the station nearest
    // the front; anywhere else trucks must haul it from the map edge. Replays of heuristic@78 attacks left 25 of 32 SP on the
    // map where rail could not take it.
    const rail = action.kind === 'PLACE_REINFORCEMENT' && roleOf.get(String(action.pieceId)) === 'DUMP' && knowledgeOf(facts).railHexes.has(String(hexId)) ? 1 : 0;
    return { action, traced, rail, score: -distance - situation.threatAt(hexId) };
  }).sort((left, right) => right.traced - left.traced || right.rail - left.rail || right.score - left.score);
  return decision(scored[0]!.action, scored[0]!.traced ? 'place a supplied arrival toward its mission' : scored[0]!.rail ? 'place arriving SP on the railroad' : 'place the arrival nearest its mission',
    [{ term: 'placement-trace', value: scored[0]!.traced }, { term: 'placement-rail', value: scored[0]!.rail }, { term: 'placement', value: scored[0]!.score }]);
};

const rebuildSize = (action: GameAction): number => action.kind !== 'REBUILD_UNITS' ? 0
  : action.units.reduce((total, { steps }) => total + steps, 0) + action.truckPoints;

/** Worth feeding first when SP run short (12.6c): HQs, then the units with most combat strength left. */
const feedValue = (situation: Situation, pieceId: PieceId): number => {
  const unit = situation.own.find(({ piece }) => piece.id === pieceId);
  if (!unit) return 0;
  const strength = (unit.profile?.strength ?? 0) * Math.max(1, unit.profile?.steps ?? 1);
  return unit.piece.role === 'HQ' ? 1000 + strength : unit.piece.role === 'COMBAT' ? 100 + strength : strength;
};

const supplyStep = (context: BotDecisionContext, situation: Situation): BotDecision | null => {
  const checks = [...context.actions.candidates('CHECK_SUPPLY', null, 200)].sort((left, right) =>
    (right.kind === 'CHECK_SUPPLY' ? feedValue(situation, right.pieceIds[0]!) : 0) - (left.kind === 'CHECK_SUPPLY' ? feedValue(situation, left.pieceIds[0]!) : 0));
  if (checks[0]?.kind === 'CHECK_SUPPLY') {
    const { explanation } = context.actions.explain(checks[0]);
    const encoded = explanation.facts.find(f => f.key === 'supply.rationGroups')?.value;
    if (typeof encoded === 'string') {
      const groups = JSON.parse(encoded) as readonly { sourcePieceId: PieceId; pieceIds: readonly PieceId[]; tokens: number }[];
      const first = groups[0];
      if (first) {
        const action: GameAction = { ...checks[0], sourcePieceId: first.sourcePieceId, pieceIds: first.pieceIds };
        if (context.actions.explain(action).explanation.allowed) {
          return decision(action, `supply: feed ${first.pieceIds.length} unit(s) together for ${first.tokens}T, preserving shared commitments`, [{ term: 'feed', value: first.pieceIds.length }]);
        }
      }
    }
    return decision(checks[0], 'supply: feed the most valuable unit out of trace', [{ term: 'feed', value: feedValue(situation, checks[0].pieceIds[0]!) }]);
  }
  for (const kind of ['CHOOSE_FORMATION_TRACE', 'RECOVER_INTERNALS'] as const) {
    const [first] = context.actions.candidates(kind, null, 20);
    if (first) return decision(first, `supply: ${kind.toLowerCase().replaceAll('_', ' ')}`, [{ term: 'supply', value: 1 }]);
  }
  return null;
};

const refitStep = (context: BotDecisionContext): BotDecision | null => {
  const [refit] = context.actions.candidates('REFIT_AIRCRAFT', null, 20);
  return refit ? decision(refit, 'refit aircraft', [{ term: 'refit', value: 1 }]) : null;
};

const decide = (facts: BotGameFacts, w: HeuristicWeights) => (context: BotDecisionContext): BotDecision | null => {
  const projection = context.view.projection;
  if (!projection) return null;
  const situation = analyze(projection, context.playerId, facts);
  if (context.view.pendingDecision !== null) return respondToDecision(context, situation, w.holdRatio);
  const { phase, segment } = projection.sequence;
  let chosen: BotDecision | null = null;
  if (phase === 'REINFORCEMENT') chosen = reinforcementStep(context, situation, facts);
  else if (phase === 'AIRCRAFT_REFIT') chosen = refitStep(context);
  else if (phase === 'SUPPLY') chosen = supplyStep(context, situation);
  else if (segment === 'MOVEMENT' && (phase === 'MOVEMENT' || phase === 'EXPLOITATION')) {
    chosen = movementStep(context, situation, facts, w) ?? (phase === 'MOVEMENT' ? hedgehogStep(context, situation, w) : null);
  }
  else if (segment === 'BARRAGE') {
    // Only the main effort's objective counts double (heuristic@11-79): doubling every effort's objective made the attacker
    // attack objectives twice as often as v79 at lower odds (column 5.4 against 6.9).
    const effortHexes = new Set(chooseEfforts(context, situation, facts, w, 1).map(({ hexId }) => hexId));
    // Aircraft first: they take the main effort's hex (one barrage per hex, 10.0e) and the guns the next one.
    chosen = (phase === 'MOVEMENT' ? bestAirBarrage(context, situation, w, effortHexes) : null) ?? bestBarrage(context, situation, facts, w, effortHexes);
  }
  else if (segment === 'COMBAT') chosen = bestCombat(context, situation, facts, w, context.actions.candidates('DECLARE_COMBAT', null, 200), w.attackThreshold, new Set(chooseEfforts(context, situation, facts, w, 1).map(({ hexId }) => hexId)));
  return chosen ?? advance(context, `nothing worth doing in ${phase.toLowerCase()} ${segment.toLowerCase()}`);
};

export interface HeuristicPolicyOptions {
  /** Receives one line per unit the movement planner weighs; for diagnosing behavior. */
  readonly debug?: (line: string) => void;
  /** Tuned weights (self-play training); the defaults are heuristic@1. */
  readonly weights?: HeuristicWeights;
  /** Names the weights in traces and results, e.g. a training generation. */
  readonly label?: string;
}

export const createHeuristicPolicy = (facts: BotGameFacts, options: HeuristicPolicyOptions = {}): BotPolicy => {
  const choose = decide(facts, options.weights ?? DEFAULT_HEURISTIC_WEIGHTS);
  return {
    id: 'heuristic',
    version: options.label === undefined ? '83' : `83+${options.label}`,
    decide: (context) => {
      const sink = options.debug;
      debug = sink ? (line) => sink(`${context.memory.stepKey} ${String(context.playerId).split(':').at(-1)} ${line}`) : null;
      try { return choose(context); } finally { debug = null; }
    },
  };
};
