import type { HexId, PieceId } from '../../core/index.js';
import type { FeedSource, GameAction } from '../../rules/index.js';
import { analyze, type OwnUnit, type Situation } from '../analysis.js';
import { respondToDecision } from '../decisions.js';
import { hexesBetween, knowledgeOf, type BotGameFacts } from '../knowledge.js';
import type { BotDecision, BotDecisionContext, BotPolicy, BotScoreTerm } from '../model.js';
import { forecastBarrage, forecastCombat } from '../odds.js';
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
}

/**
 * Replays showed that defended objectives were never taken: both sides only picked up empty ones. Each step the
 * policy picks the defended enemy objective that is worth most for its distance and where enough friendly strength is
 * near, and sends the nearest units against it with HQs and SP following.
 */
const chooseMainEffort = (situation: Situation, w: HeuristicWeights): MainEffort | null => chooseEfforts(situation, w, 1)[0] ?? null;

/**
 * heuristic@11: up to `count` efforts, each against a different defended enemy objective with units not already given
 * to an earlier one. Replays of turn 1: the side moving first attacked one garrisoned objective with everything at
 * 24:1 while the units sent to the others, uncoordinated, stopped short of them.
 */
const chooseEfforts = (situation: Situation, w: HeuristicWeights, count: number): MainEffort[] => {
  const efforts: MainEffort[] = [];
  const used = new Set<PieceId>();
  while (efforts.length < count) {
    const next = chooseEffort(situation, w, used, new Set(efforts.map(({ hexId }) => hexId)));
    if (!next) break;
    efforts.push(next);
    for (const unitId of next.unitIds) used.add(unitId);
  }
  return efforts;
};

const chooseEffort = (situation: Situation, w: HeuristicWeights, used: ReadonlySet<PieceId>, taken: ReadonlySet<HexId>): MainEffort | null => {
  const me = situation.playerId;
  const combat = situation.own.filter((unit) => situation.isCombatUnit(unit));
  const garrisons = new Set(situation.objectives.filter(({ controllerId }) => controllerId === me)
    .flatMap(({ hexId }) => situation.friendlyAt(hexId).filter((unit) => situation.isCombatUnit(unit)).slice(0, 1).map(({ piece }) => piece.id)));
  let best: { hexId: HexId; defenders: number; units: OwnUnit[]; value: number } | null = null;
  for (const objective of situation.objectives) {
    if (objective.controllerId === me || taken.has(objective.hexId)) continue;
    const enemy = situation.enemy.get(objective.hexId);
    if (!enemy?.hasCombatUnit || enemy.strength <= 0) continue;
    const available = combat.filter((unit) => !garrisons.has(unit.piece.id) && !used.has(unit.piece.id) && hexesBetween(unit.hexId, objective.hexId) <= w.assaultReach)
      .sort((left, right) => hexesBetween(left.hexId, objective.hexId) - hexesBetween(right.hexId, objective.hexId) || String(left.piece.id).localeCompare(String(right.piece.id)));
    const units: OwnUnit[] = [];
    let strength = 0;
    for (const unit of available) {
      if (strength >= enemy.strength * w.assaultRatio || units.length >= w.assaultMaxUnits) break;
      units.push(unit);
      strength += unit.profile?.strength ?? 0;
    }
    if (units.length === 0 || strength < enemy.strength * w.assaultRatio) continue;
    const distance = units.reduce((total, unit) => total + hexesBetween(unit.hexId, objective.hexId), 0) / units.length;
    const value = objective.points / (1 + distance / 4);
    if (!best || value > best.value) best = { hexId: objective.hexId, defenders: enemy.strength, units, value };
  }
  if (!best) return null;
  const lead = [...best.units].sort((left, right) => hexesBetween(left.hexId, best!.hexId) - hexesBetween(right.hexId, best!.hexId))[0]!.hexId;
  return { hexId: best.hexId, defenders: best.defenders, unitIds: new Set(best.units.map(({ piece }) => piece.id)), lead };
};

interface StepNotes {
  readonly done: Set<PieceId>;
  readonly modeSet: Set<PieceId>;
  readonly fueled: Set<PieceId>;
  readonly loaded: Set<PieceId>;
  /** Trucks that already moved this step: they may still unload, nothing else. */
  readonly truckMoved: Set<PieceId>;
  readonly incomingRe: Map<HexId, number>;
  /** Tokens still unpromised in each friendly dump or truck cargo, by its id: units ending out of trace eat from them (12.6c). */
  feedBudget: Map<string, number> | null;
  targets: Map<PieceId, Target> | null;
  effort?: MainEffort | null;
  /** Further efforts beyond the main one (heuristic@11): their units assault, HQs and SP still follow the main one. */
  secondary?: readonly MainEffort[];
  /** Cut-off groups that need a supply run this step, and the trucks already sent to each (heuristic@7). */
  relief?: { readonly hexIds: readonly HexId[]; readonly sent: Map<HexId, PieceId> };
  /** Nothing more is worth sending by rail this step (heuristic@12). */
  railDone?: boolean;
  /** Nothing more is worth shipping this step (19.0f). */
  seaDone?: boolean;
  /** Tokens of each rear dump already promised to an empty truck this step, and the dump each truck is heading for (heuristic@12). */
  claims?: { readonly tokens: Map<HexId, number>; readonly pickup: Map<PieceId, HexId> };
}

const notesOf = (context: BotDecisionContext): StepNotes => {
  let notes = context.memory.notes.get('heuristic') as StepNotes | undefined;
  if (!notes) {
    notes = { done: new Set(), modeSet: new Set(), fueled: new Set(), loaded: new Set(), truckMoved: new Set(), incomingRe: new Map(), feedBudget: null, targets: null };
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
  for (const effort of efforts) for (const unitId of effort.unitIds) targets.set(unitId, { hexId: effort.hexId, purpose: 'ASSAULT' });
  const combat = situation.own.filter((unit) => situation.isCombatUnit(unit));
  // Held objectives keep a garrison (an occupied hex cannot be entered without a fight); others are worth taking.
  const wanted: { readonly hexId: HexId; readonly value: number; readonly purpose: Target['purpose']; readonly limit: number }[] = situation.objectives.map((objective) => {
    const threat = situation.threatAt(objective.hexId);
    const mine = objective.controllerId === me;
    const garrisoned = situation.friendlyAt(objective.hexId).some((unit) => situation.isCombatUnit(unit));
    return {
      hexId: objective.hexId,
      // Holding is cheaper than retaking: an empty or threatened objective's garrison is worth more than a new capture.
      value: !mine ? objective.points
        : objective.points * (!garrisoned ? w.garrisonEmpty : threat > 0 || situation.turnsLeft <= 2 ? w.garrisonThreatened : w.garrisonCalm),
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
  // heuristic@11: the only garrison of a held objective stays on it. Replays of heuristic@10 games: 40 of 90 objectives
  // lost while empty had been left by their only garrison sent to hunt a weak enemy stack nearby.
  for (const objective of situation.objectives) {
    if (objective.controllerId !== me) continue;
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
  const pairs = combat.flatMap((unit) => wanted.map((entry) => ({
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
    add('capture', objective.points * w.capture * (kept ? 1 : w.passThroughShare));
  }
  // The only garrison of a held objective walking away hands it to the next enemy unit that passes.
  const origin = situation.objectives.find((entry) => entry.hexId === path[0] && entry.controllerId === me);
  if (origin && path.length > 1 && unit.piece.role === 'COMBAT' && (coverage === null || coverage.has(origin.hexId) || situation.turnsLeft <= 2)
    && !situation.friendlyAt(origin.hexId).some((other) => other.piece.id !== unit.piece.id && situation.isCombatUnit(other))) {
    add('abandon-objective', -origin.points * w.abandonObjective);
  }
  // Near the end a captured objective must stay occupied: the enemy moves after us and walks into empty ones.
  const endObjective = situation.objectives.find((entry) => entry.hexId === destination);
  if (endObjective && situation.turnsLeft <= 2 && unit.piece.role === 'COMBAT'
    && situation.friendlyAt(destination).every((other) => other.piece.id === unit.piece.id || !situation.isCombatUnit(other))) {
    add('hold-at-end', endObjective.points * w.holdAtEnd);
  }
  const incoming = (notes.incomingRe.get(destination) ?? 0) + situation.friendlyAt(destination).reduce((total, other) => total + reOf(other), 0);
  if (incoming + reOf(unit) > STACKING_LIMIT_RE && path.length > 1) add('overstack', -1000);
  if (unit.piece.role === 'COMBAT') {
    // Strat Mode units defend badly and lose their ZOC: keep them well away from the enemy (5.8).
    if (unit.piece.mode === 'STRAT' && situation.nearestEnemy(destination).distance <= w.stratSafeDistance) add('strat-near-enemy', -w.stratNearEnemy);
    // One stack per hex does the job; more units in the same hex only make a better barrage target.
    if (path.length > 1) add('crowding', -incoming * w.crowding);
    // The assault group gathers around the defended objective instead of shying away from it.
    const assaulting = target?.purpose === 'ASSAULT' && hexesBetween(destination, target.hexId) === 1;
    if (assaulting) add('assault-position', w.assaultPosition);
    if (target) {
      const progress = hexesBetween(path[0]!, target.hexId) - hexesBetween(destination, target.hexId);
      add('progress', progress * (target.purpose === 'FRONT' ? w.progressFront : w.progressTarget));
      // A hunter stops beside its quarry, ready to attack.
      if (target.purpose === 'HUNT' && hexesBetween(destination, target.hexId) === 1) add('hunt', w.huntAdjacent);
      if (target.purpose === 'GARRISON' && destination === target.hexId) add('garrison', w.garrisonStay);
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
    add('exposure', -threat * w.hqExposure);
  } else if (unit.piece.role === 'ARTILLERY') {
    const distance = situation.nearestEnemy(destination).distance;
    const range = Math.max(1, unit.profile?.range ?? 1);
    add('in-range', distance >= 2 && distance <= range ? w.artilleryInRange : -Math.max(0, distance - range) * w.artilleryBeyondRange);
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
const reliefTargets = (situation: Situation, coverage: ReadonlySet<string>, w: HeuristicWeights): readonly HexId[] => {
  const sp = situation.own.filter(({ piece }) => (piece.role === 'DUMP' && (piece.resourceQuantity ?? 0) > 0) || (piece.role === 'TRUCK' && (piece.carriedTokens ?? 0) > 0));
  const stranded = situation.own.filter((unit) => situation.isCombatUnit(unit) && !coverage.has(unit.hexId)
    && !sp.some(({ hexId }) => hexesBetween(hexId, unit.hexId) <= w.fedRadius));
  // A unit holding an objective alone is worth a run whatever its strength (heuristic@8): its VP first. So is a garrison
  // (MA 0, it can never walk back to supply) whose own stock is gone: the scenario gives each one 2T for a start.
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
 * Logistics: an empty truck heads for the fullest dump and loads, a loaded one heads for the forward HQ and unloads.
 * First, though, one loaded truck runs to each cut-off group and unloads beside it (heuristic@7).
 */
/** A truck load worth a trip: a full 5-point truck carries 20T; a pickup must offer at least this much. */
const PICKUP_MIN_TOKENS = 8;
/** A truck unloads where no enemy stands within two hexes. */
const DROP_SAFE_DISTANCE = 3;
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
 * Garrison stocks (the 2T under each garrison) are left alone.
 */
const pickupFor = (situation: Situation, notes: StepNotes, truck: OwnUnit, front: HexId | null): HexId | undefined => {
  notes.claims ??= { tokens: new Map(), pickup: new Map() };
  const claims = notes.claims;
  const already = claims.pickup.get(truck.piece.id);
  if (already !== undefined) return already;
  const objectives = new Set(situation.objectives.map(({ hexId }) => hexId));
  const left = (hexId: HexId, tokens: number): number => tokens - (claims.tokens.get(hexId) ?? 0);
  const dumps = situation.own.filter(({ piece, hexId }) => piece.role === 'DUMP' && (piece.resourceQuantity ?? 0) > 0
    && !String(piece.id).includes('-stock-') && !objectives.has(hexId)
    && (front === null || hexesBetween(hexId, front) > DELIVERED_RADIUS)
    // Only the rear: SP near the enemy feed the units beside them (a relief run's load, a cut-off group's stock).
    && situation.nearestEnemy(hexId).distance >= PICKUP_SAFE_DISTANCE);
  // Claims are counted per hex, so the stock is too (the rules merge a hex's dumps of one kind, but a truck's load is its own).
  const stock = new Map<HexId, number>();
  for (const dump of dumps) stock.set(dump.hexId, (stock.get(dump.hexId) ?? 0) + (dump.piece.resourceQuantity ?? 0));
  const scored = [...stock].map(([hexId, tokens]) => ({ hexId, tokens: left(hexId, tokens) })).map((dump) => ({
    hexId: dump.hexId,
    tokens: dump.tokens,
    // Hexes to drive empty plus hexes to drive loaded; a fuller load is worth a little more road.
    cost: hexesBetween(truck.hexId, dump.hexId) + (front === null ? 0 : hexesBetween(dump.hexId, front)),
  })).filter(({ tokens }) => tokens > 0);
  const worthwhile = scored.filter(({ tokens }) => tokens >= PICKUP_MIN_TOKENS);
  const best = (worthwhile.length > 0 ? worthwhile : scored)
    .sort((a, b) => a.cost - Math.min(a.tokens, 20) / 4 - (b.cost - Math.min(b.tokens, 20) / 4) || String(a.hexId).localeCompare(String(b.hexId)))[0];
  if (!best) { debug?.(`PICKUP none for ${truck.piece.id}: dumps ${JSON.stringify(situation.own.filter(({ piece }) => piece.role === 'DUMP').map(({ piece, hexId }) => [hexId, piece.resourceQuantity, String(piece.id).slice(0, 30), situation.nearestEnemy(hexId).distance]))} front ${front}`); return undefined; }
  claims.pickup.set(truck.piece.id, best.hexId);
  claims.tokens.set(best.hexId, (claims.tokens.get(best.hexId) ?? 0) + Math.min(best.tokens, 20));
  return best.hexId;
};

/**
 * heuristic@12: where a loaded truck delivers: the hex nearest `center` that holds a friendly combat unit or dump (13.2f:
 * the only hexes SP may be unloaded in) with no enemy within two hexes (a truck there is not left in reach of an overrun);
 * `center` itself when none does. Replays showed loaded trucks parked for turns short of a lead unit next to the enemy.
 */
const dropHexFor = (situation: Situation, center: HexId): HexId => {
  const candidates = [...new Set(situation.own.filter((unit) => situation.isCombatUnit(unit) || unit.piece.role === 'DUMP').map(({ hexId }) => hexId))]
    .filter((hexId) => situation.nearestEnemy(hexId).distance >= DROP_SAFE_DISTANCE)
    .sort((left, right) => hexesBetween(left, center) - hexesBetween(right, center) || situation.threatAt(left) - situation.threatAt(right) || String(left).localeCompare(String(right)));
  return candidates[0] ?? center;
};

const truckStep = (context: BotDecisionContext, situation: Situation, unit: OwnUnit, notes: StepNotes, w: HeuristicWeights, effort: MainEffort | null, coverage: ReadonlySet<string>): BotDecision | null => {
  const { actions } = context;
  const id = unit.piece.id;
  const carried = unit.piece.carriedTokens ?? 0;
  notes.relief ??= { hexIds: reliefTargets(situation, coverage, w), sent: new Map() };
  let relief = [...notes.relief.sent].find(([, truckId]) => truckId === id)?.[0];
  if (relief === undefined && carried > 0) {
    relief = notes.relief.hexIds.filter((hexId) => !notes.relief!.sent.has(hexId))
      .sort((left, right) => hexesBetween(unit.hexId, left) - hexesBetween(unit.hexId, right))[0];
    if (relief !== undefined) notes.relief.sent.set(relief, id);
  }
  if (relief !== undefined && carried > 0) {
    // Unload beside the cut-off units even with the enemy close: that SP is what lets them eat and fuel (12.6c, 12.5).
    if (hexesBetween(unit.hexId, relief) <= w.reliefRadius) {
      const unload = [...actions.candidates('UNLOAD_SUPPLY', id)].sort((left, right) =>
        (right.kind === 'UNLOAD_SUPPLY' ? right.tokens : 0) - (left.kind === 'UNLOAD_SUPPLY' ? left.tokens : 0))[0];
      notes.done.add(id);
      return unload ? decision(unload, `unload ${carried}T for the cut-off units at ${relief}`, [{ term: 'relief', value: carried }]) : null;
    }
    if (notes.truckMoved.has(id)) { notes.done.add(id); return null; }
    let best: { action: GameAction; terms: BotScoreTerm[] } | null = null;
    for (const move of actions.candidates('MOVE_PIECE', id, TRUCK_MOVE_BUDGET)) {
      const destination = destinationOf(move)!;
      const terms: BotScoreTerm[] = [{ term: 'toward-relief', value: (hexesBetween(unit.hexId, relief) - hexesBetween(destination, relief)) * w.truckTowardGoal }];
      // A truck in an enemy-adjacent hex is easy prey (8.0); the rest of the danger is the price of the run.
      if (situation.nearestEnemy(destination).distance <= 1) terms.push({ term: 'truck-exposed', value: -w.truckExposed });
      if (!best || sum(terms) > sum(best.terms)) best = { action: move, terms };
    }
    if (best && sum(best.terms) > 0) {
      notes.truckMoved.add(id);
      return decision(best.action, `truck to the cut-off units at ${relief}`, best.terms);
    }
    // Cannot get closer this step: deliver to the army as usual.
  }
  // SP is worth most where the army can draw it (12.3a): unload beside the army's centre, behind the front.
  // With a main effort SP goes to its lead units; otherwise to the army's centre.
  const center = effort?.lead ?? armyCenter(situation);
  const forwardHq = center === null ? undefined : { hexId: center };
  // heuristic@12: the drop point is a hex near that centre a truck may unload in (13.2f: a friendly combat unit or dump)
  // and out of enemy reach; replays showed loaded trucks parked short of a lead unit next to the enemy for turns.
  const drop = carried > 0 && center !== null ? dropHexFor(situation, center) : null;
  const atDrop = drop !== null && hexesBetween(unit.hexId, drop) <= 1;
  if (carried > 0 && forwardHq && (atDrop || hexesBetween(unit.hexId, forwardHq.hexId) <= DELIVERED_RADIUS) && situation.nearestEnemy(unit.hexId).distance >= 2) {
    const unload = [...actions.candidates('UNLOAD_SUPPLY', id)].sort((left, right) =>
      (right.kind === 'UNLOAD_SUPPLY' ? right.tokens : 0) - (left.kind === 'UNLOAD_SUPPLY' ? left.tokens : 0))[0];
    notes.done.add(id);
    if (unload) return decision(unload, `unload ${carried}T beside the army`, [{ term: 'deliver', value: carried }]);
    return null;
  }
  // heuristic@11: a truck that drove to a dump loads there with the MP it has left (13.2f) and sets off again, instead
  // of waiting a turn: replays showed a 3-turn round trip per 20T while SP piled up in the rear.
  if (carried === 0 && !notes.loaded.has(id)) {
    // heuristic@12: never a garrison's own stock, nor SP on an objective or already at the front.
    const onObjective = situation.objectives.some(({ hexId }) => hexId === unit.hexId)
      || situation.nearestEnemy(unit.hexId).distance < PICKUP_SAFE_DISTANCE;
    const load = [...actions.candidates('LOAD_SUPPLY', id)]
      .filter((action) => action.kind === 'LOAD_SUPPLY' && !String(action.dumpId).includes('-stock-') && !onObjective)
      .sort((left, right) => (right.kind === 'LOAD_SUPPLY' ? right.tokens : 0) - (left.kind === 'LOAD_SUPPLY' ? left.tokens : 0))[0];
    if (load && load.kind === 'LOAD_SUPPLY' && (!forwardHq || hexesBetween(unit.hexId, forwardHq.hexId) > DELIVERED_RADIUS)) {
      notes.loaded.add(id);
      // The load leaves the dump now: release this truck's claim so the Tokens are not counted off twice.
      const claimed = notes.claims?.pickup.get(id);
      if (claimed !== undefined && notes.claims) {
        notes.claims.tokens.set(claimed, Math.max(0, (notes.claims.tokens.get(claimed) ?? 0) - 20));
        notes.claims.pickup.delete(id);
      }
      notes.truckMoved.delete(id);
      return decision(load, `load ${load.tokens}T for the front`, [{ term: 'haul', value: load.tokens }]);
    }
  }
  // A truck that already moved this step may only unload (above) once it stands beside the army.
  if (notes.truckMoved.has(id)) { notes.done.add(id); return null; }
  const goal = carried > 0 || notes.loaded.has(id) ? (drop ?? (center !== null ? dropHexFor(situation, center) : null) ?? forwardHq?.hexId)
    : pickupFor(situation, notes, unit, forwardHq?.hexId ?? null);
  if (!goal) { debug?.(`TRUCK ${id} at ${unit.hexId} carried ${carried} no goal (claims ${JSON.stringify([...(notes.claims?.tokens ?? [])])})`); notes.done.add(id); return null; }
  const moves = actions.candidates('MOVE_PIECE', id, TRUCK_MOVE_BUDGET);
  let best: { action: GameAction; terms: BotScoreTerm[] } | null = null;
  for (const move of moves) {
    const destination = destinationOf(move)!;
    const terms: BotScoreTerm[] = [{ term: 'toward-goal', value: (hexesBetween(unit.hexId, goal) - hexesBetween(destination, goal)) * w.truckTowardGoal }];
    if (situation.nearestEnemy(destination).distance <= 2) terms.push({ term: 'truck-exposed', value: -w.truckExposed });
    terms.push({ term: 'exposure', value: -situation.threatAt(destination) * w.truckExposure });
    if (!best || sum(terms) > sum(best.terms)) best = { action: move, terms };
  }
  debug?.(`TRUCK ${id} at ${unit.hexId} carried ${carried} goal ${goal} center ${center} moves ${moves.length} best ${best ? `${sum(best.terms).toFixed(1)} to ${destinationOf(best.action)}` : '-'} enemy ${situation.nearestEnemy(unit.hexId).distance}`);
  if (!best || sum(best.terms) <= 0) {
    // Cannot get closer: rather than sit loaded, unload here when the army can draw from it.
    if (carried > 0 && center !== null && hexesBetween(unit.hexId, center) <= DELIVERED_RADIUS * 2 && situation.nearestEnemy(unit.hexId).distance >= 2) {
      const unload = actions.candidates('UNLOAD_SUPPLY', id)[0];
      if (unload) { notes.done.add(id); return decision(unload, `unload ${carried}T as near the army as it can get`, [{ term: 'deliver', value: carried }]); }
    }
    notes.done.add(id);
    return null;
  }
  notes.truckMoved.add(id);
  return decision(best.action, `truck toward ${goal}`, best.terms, moves);
};

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
    if (gain < RAIL_MIN_GAIN_HEXES) continue;
    const tokens = action.supply.reduce((total, { tokens: quantity }) => total + quantity, 0);
    // A garrison's own stock (and SP on an objective) stays where it is.
    if (action.supply.some(({ sourcePieceId }) => String(sourcePieceId).includes('-stock-'))
      || (tokens > 0 && situation.objectives.some(({ hexId }) => hexId === action.fromHexId))) continue;
    // Units ride only when the front is far: a unit near it walks (and keeps its MA for the fight).
    const units = action.unitIds.filter((id) => {
      const unit = situation.own.find(({ piece }) => piece.id === id);
      return unit !== undefined && unit.piece.role === 'COMBAT' && hexesBetween(unit.hexId, front) >= 10;
    }).length;
    if (action.unitIds.length > 0 && units === 0) continue;
    const value = gain * (tokens + units * 8);
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
    const efforts = chooseEfforts(situation, w, w.assaultMaxEfforts);
    notes.effort = efforts[0] ?? null;
    notes.secondary = efforts.slice(1);
  }
  const effort = notes.effort;
  if (effort) debug?.(`MAIN EFFORT ${effort.hexId} vs ${effort.defenders.toFixed(1)} with ${effort.unitIds.size} unit(s), lead ${effort.lead}`);
  notes.targets ??= planTargets(situation, coverage, unitCoverage, w, [...(effort ? [effort] : []), ...(notes.secondary ?? [])], fedHexes(sideFeeds));
  // HQs follow the main effort's lead (their own scores keep them in supply and away from the enemy), else the army.
  const front = effort?.lead ?? armyCenter(situation);
  if (context.view.projection?.sequence.phase === 'MOVEMENT') {
    const shipped = seaStep(context, situation, notes, front);
    if (shipped) return shipped;
    const railed = railStep(context, situation, notes, front);
    if (railed) return railed;
  }
  // HQs move first: their throw range decides where the rest is in trace supply (12.3b).
  const order = (unit: OwnUnit) => unit.piece.role === 'HQ' ? 0 : unit.piece.role === 'COMBAT' ? 1 : unit.piece.role === 'ARTILLERY' ? 2 : unit.piece.role === 'TRUCK' ? 3 : 9;
  const units = situation.own.filter((unit) => order(unit) < 9 && !notes.done.has(unit.piece.id))
    .sort((left, right) => order(left) - order(right) || String(left.piece.id).localeCompare(String(right.piece.id)));
  for (const unit of units) {
    const id = unit.piece.id;
    if (unit.piece.role === 'TRUCK') {
      const step = truckStep(context, situation, unit, notes, w, effort, coverage);
      if (step) return step;
      continue;
    }
    const target = notes.targets.get(id);
    const enemyDistance = situation.nearestEnemy(unit.hexId).distance;
    // Mode first (5.4): Combat Mode near the enemy for strength and ZOC, Strat Mode far behind the lines.
    if (!notes.modeSet.has(id)) {
      notes.modeSet.add(id);
      const assaultClose = target?.purpose === 'ASSAULT' && hexesBetween(unit.hexId, target.hexId) <= w.combatModeDistance + 1;
      const wanted = unit.piece.role === 'COMBAT' && (enemyDistance <= w.combatModeDistance || assaultClose) ? 'COMBAT'
        : unit.piece.role === 'COMBAT' && enemyDistance >= w.stratModeEnemyDistance && target && hexesBetween(unit.hexId, target.hexId) >= w.stratModeTargetDistance ? 'STRAT'
          // An HQ with the army stays in Combat Mode to rebuild units (13.5a); one far behind moves up in Move Mode.
          : unit.piece.role === 'HQ' ? (front !== null && hexesBetween(unit.hexId, front) <= w.hqCombatModeRadius ? 'COMBAT' : 'MOVE') : null;
      if (wanted !== null && unit.piece.mode !== wanted) {
        const change = actions.candidates('CHANGE_MODE', id).find((action) => action.kind === 'CHANGE_MODE' && action.mode === wanted);
        if (change) return decision(change, `${wanted} mode (${enemyDistance} hexes from the enemy)`, [{ term: 'mode', value: 1 }]);
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
      const fuel = [...actions.candidates('PAY_FUEL', id)].sort((left, right) => fuelRank(left) - fuelRank(right))[0];
      if (fuel && wantsToMove) return decision(fuel, `fuel to move (${fuel.kind === 'PAY_FUEL' ? fuel.method : ''})`, [{ term: 'fuel', value: 1 }]);
    }
    notes.done.add(id);
    moves = actions.candidates('MOVE_PIECE', id);
    if (moves.length === 0) {
      debug?.(`${unit.piece.role} ${id} at ${unit.hexId} mode ${unit.piece.mode} ${unitCoverage(unit).has(unit.hexId) ? 'in-trace' : 'OUT-OF-TRACE'} target ${target?.purpose ?? '-'} ${target?.hexId ?? ''} enemy ${enemyDistance}: no moves `
        + `(fuel offers ${actions.candidates('PAY_FUEL', id).length})`);
      continue;
    }
    // A combat unit's own trace applies 12.6f (the formation's common route) and 13.1d; others use the side's trace.
    // heuristic@11: HQs and artillery too: an HQ's own throw does not supply itself (12.3b), and an HQ only supplies its
    // own division (13.1d).
    const reach = unit.piece.role === 'COMBAT' || unit.piece.role === 'HQ' || unit.piece.role === 'ARTILLERY' ? unitCoverage(unit) : coverage;
    const feeds = unit.piece.role === 'COMBAT' || unit.piece.role === 'ARTILLERY' ? unitFeeds(unit) : sideFeeds;
    const stay = sum(scoreDestination(situation, unit, target, [unit.hexId], notes, reach, direct, front, w, feeds));
    let best: { action: GameAction; terms: BotScoreTerm[] } | null = null;
    for (const move of moves) {
      if (move.kind !== 'MOVE_PIECE') continue;
      const terms = scoreDestination(situation, unit, target, move.path, notes, reach, direct, front, w, feeds);
      if (!best || sum(terms) > sum(best.terms)) best = { action: move, terms };
    }
    debug?.(`${unit.piece.role} ${id} at ${unit.hexId} mode ${unit.piece.mode} ${reach.has(unit.hexId) ? 'in-trace' : 'OUT-OF-TRACE'} target ${target?.purpose ?? '-'} ${target?.hexId ?? ''} `
      + `enemy ${enemyDistance} moves ${moves.length} stay ${stay.toFixed(1)} best ${best ? `${sum(best.terms).toFixed(1)} to ${destinationOf(best.action)} ${JSON.stringify(best.terms)}` : '-'}`);
    if (best && sum(best.terms) > stay) {
      const destination = destinationOf(best.action)!;
      notes.incomingRe.set(destination, (notes.incomingRe.get(destination) ?? 0) + reOf(unit));
      // A unit ending out of trace counts on eating: promise it the SP it will need.
      if ((unit.piece.role === 'COMBAT' || unit.piece.role === 'ARTILLERY') && !reach.has(destination)) {
        const source = feedSourceFor(notes, feeds, unit, destination);
        if (source !== null) notes.feedBudget!.set(source, notes.feedBudget!.get(source)! - eatingCost(unit));
      }
      return decision(best.action, `${unit.piece.role.toLowerCase()} to ${destination}${target ? ` (${target.purpose.toLowerCase()} ${target.hexId})` : ''}`, best.terms, moves);
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
    const score = (objective ? 10 * objective.points : 0) + situation.threatAt(action.hexId) + (action.engineerId === null ? 1 : 0);
    if (!best || score > best.score) best = { action, score, hexId: action.hexId, wanted };
  }
  if (!best) return null;
  dug.add(best.hexId);
  return decision(best.action, `dig in at ${best.hexId} (hedgehog toward Level ${best.wanted})`, [{ term: 'hedgehog', value: best.score }]);
};

const fuelRank = (action: GameAction): number => action.kind !== 'PAY_FUEL' ? 9 : action.method === 'FORMATION' ? 0 : action.method === 'HQ' ? 1 : 2;

// ─── Combat and barrage ────────────────────────────────────────────────────────────────────────

/** The declared combat with the best expected value on the printed table, if any clears the threshold. */
const bestCombat = (context: BotDecisionContext, situation: Situation, facts: BotGameFacts, w: HeuristicWeights, candidates: readonly GameAction[], threshold: number, effort: MainEffort | null = null): BotDecision | null => {
  let best: { action: GameAction; terms: BotScoreTerm[]; odds: string } | null = null;
  for (const action of candidates) {
    if (action.kind !== 'DECLARE_COMBAT') continue;
    const explained = context.actions.explain(action);
    if (!explained.explanation.allowed) continue;
    const forecast = forecastCombat(explained.explanation.facts);
    if (!forecast) continue;
    const objective = situation.objectives.find(({ hexId }) => hexId === action.targetHexId);
    // Below 1:1 the attacker loses more than it gains; only a last-turn grab for an objective justifies it.
    const [oddsFor = 0, oddsAgainst = 1] = forecast.odds.split(':').map(Number);
    const lastGrab = situation.turnsLeft <= 0 && objective !== undefined && objective.controllerId !== situation.playerId;
    if (oddsFor / Math.max(1e-9, oddsAgainst) < w.minimumOdds && !lastGrab) continue;
    const enemy = situation.enemy.get(action.targetHexId);
    // Steps the defender can lose before the hex empties: printed steps of the visible counters, two per hidden one.
    const defenderSteps = Math.max(1, (enemy?.pieces ?? []).filter(({ role }) => role !== 'DUMP' && role !== 'TRUCK' && role !== 'HEDGEHOG')
      .reduce((total, piece) => total + (knowledgeOf(facts).profile(piece)?.steps ?? 1), 0) + (enemy?.hidden ?? 0) * 2);
    const vacate = Math.min(1, (forecast.defenderLosses + forecast.defenderOptions * w.vacateOptionShare) / defenderSteps);
    const terms: BotScoreTerm[] = [
      { term: 'defender-steps', value: forecast.defenderLosses * w.defenderLoss + forecast.defenderOptions * w.defenderOption },
      { term: 'attacker-steps', value: -(forecast.attackerLosses * w.attackerLoss + forecast.attackerOptions * w.attackerOption) },
      { term: 'supply', value: -forecast.supplyTokens * w.combatSupply },
    ];
    const effortTarget = effort?.hexId === action.targetHexId;
    if (objective && objective.controllerId !== situation.playerId) {
      terms.push({ term: 'objective', value: vacate * objective.points * w.objectiveTaken * (effortTarget ? w.assaultObjective : 1) });
    }
    // Enemy units behind the front cut trace supply and pick up empty objectives: clear them.
    const nearHeld = situation.objectives.some(({ hexId, controllerId }) => controllerId === situation.playerId && hexesBetween(hexId, action.targetHexId) <= 1);
    if (nearHeld) terms.push({ term: 'protect-objective', value: vacate * w.protectObjective });
    // A weak stack's ZOC cuts our supply paths: removing it is worth more than its steps.
    if (enemy !== undefined && enemy.strength <= w.clearStrength) terms.push({ term: 'clear-zoc', value: vacate * w.clearCombat });
    if (forecast.defenderDisorganized > 0) terms.push({ term: 'disorganize', value: forecast.defenderDisorganized * w.disorganize });
    if (!best || sum(terms) > sum(best.terms)) best = { action, terms, odds: forecast.odds };
  }
  if (best) debug?.(`combat best ${best.odds} on ${best.action.kind === 'DECLARE_COMBAT' ? best.action.targetHexId : ''} score ${sum(best.terms).toFixed(1)} ${JSON.stringify(best.terms)} of ${candidates.length}`);
  else debug?.(`combat: none of ${candidates.length} candidates could be forecast`);
  if (!best || sum(best.terms) < threshold) return null;
  const kind = best.action.kind === 'DECLARE_COMBAT' ? best.action.combatKind.toLowerCase() : 'combat';
  return decision(best.action, `${kind} at ${best.odds} on ${best.action.kind === 'DECLARE_COMBAT' ? best.action.targetHexId : ''}`, best.terms, candidates);
};

const bestBarrage = (context: BotDecisionContext, situation: Situation, w: HeuristicWeights, effort: MainEffort | null = null): BotDecision | null => {
  const candidates = context.actions.candidates('DECLARE_BARRAGE', null, 60);
  let best: { action: GameAction; terms: BotScoreTerm[] } | null = null;
  for (const action of candidates) {
    if (action.kind !== 'DECLARE_BARRAGE') continue;
    const forecast = forecastBarrage(context.actions.explain(action).explanation.facts);
    if (!forecast) continue;
    // Worth most against hexes our units are about to attack or that threaten an objective.
    const adjacentOwn = situation.own.some((unit) => situation.isCombatUnit(unit) && hexesBetween(unit.hexId, action.targetHexId) <= 1);
    const nearObjective = situation.objectives.some(({ hexId }) => hexesBetween(hexId, action.targetHexId) <= 1);
    const terms: BotScoreTerm[] = [
      { term: 'disrupt', value: forecast.disrupt * (adjacentOwn ? w.barrageDisruptBeforeAttack : w.barrageDisrupt) },
      { term: 'steps', value: forecast.expectedSteps * w.barrageSteps },
      { term: 'supply', value: -forecast.supplyTokens * w.barrageSupply },
    ];
    if (nearObjective) terms.push({ term: 'objective', value: w.barrageNearObjective });
    if (effort?.hexId === action.targetHexId) terms.push({ term: 'main-effort', value: w.barrageMainEffort });
    if (!best || sum(terms) > sum(best.terms)) best = { action, terms };
  }
  return best && sum(best.terms) >= w.barrageThreshold
    ? decision(best.action, `barrage ${best.action.kind === 'DECLARE_BARRAGE' ? best.action.targetHexId : ''}`, best.terms, candidates)
    : null;
};

/**
 * Air barrage (14.7, heuristic@6): before the ground barrages, the bombers and their fighter escort hit the stack the
 * main effort will attack, else a stack our units stand next to; an objective under it counts extra. A target that no
 * friendly unit is about to attack is not worth risking aircraft on. The mission flies as many aircraft as it can (4).
 */
const bestAirBarrage = (context: BotDecisionContext, situation: Situation, w: HeuristicWeights, effort: MainEffort | null): BotDecision | null => {
  const missions = context.actions.candidates('DECLARE_AIR_MISSION', null, 400)
    .filter((action) => action.kind === 'DECLARE_AIR_MISSION' && action.mission === 'BARRAGE' && action.target === 'COMBAT_UNITS');
  let best: { action: GameAction; terms: BotScoreTerm[] } | null = null;
  for (const action of missions) {
    if (action.kind !== 'DECLARE_AIR_MISSION') continue;
    const adjacentOwn = situation.own.some((unit) => situation.isCombatUnit(unit) && hexesBetween(unit.hexId, action.targetHexId) <= 1);
    const isEffort = effort?.hexId === action.targetHexId;
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

const reinforcementStep = (context: BotDecisionContext, situation: Situation): BotDecision | null => {
  const rebuild = [...context.actions.candidates('REBUILD_UNITS', null, 40)].sort((left, right) => rebuildSize(right) - rebuildSize(left))[0];
  if (rebuild) return decision(rebuild, `rebuild ${rebuildSize(rebuild)} step(s)`, [{ term: 'rebuild', value: rebuildSize(rebuild) }]);
  const placements = context.actions.candidates('PLACE_REINFORCEMENT', null, 400);
  if (placements.length === 0) return null;
  const goals = situation.objectives.filter(({ controllerId }) => controllerId !== situation.playerId).map(({ hexId }) => hexId);
  const front = frontHex(situation);
  const aim = goals.length > 0 ? goals : front ? [front] : [];
  const projection = context.view.projection!;
  const roleOf = new Map(projection.stacks.flatMap(({ pieces }) => pieces).map((piece) => [String(piece.id), piece.role]));
  const hqs = situation.own.filter(({ piece }) => piece.role === 'HQ').map(({ hexId }) => hexId);
  const scored = placements.map((action) => {
    const hexId = action.kind === 'PLACE_REINFORCEMENT' ? action.hexId : ('' as HexId);
    // Repls rebuild only near an HQ (13.5a); everything else arrives as close to the objectives as it may.
    const goalsFor = action.kind === 'PLACE_REINFORCEMENT' && roleOf.get(String(action.pieceId)) === 'REPLACEMENT' && hqs.length > 0 ? hqs : aim;
    const distance = goalsFor.length > 0 ? Math.min(...goalsFor.map((goal) => hexesBetween(hexId, goal))) : 0;
    return { action, score: -distance - situation.threatAt(hexId) };
  }).sort((left, right) => right.score - left.score);
  return decision(scored[0]!.action, 'place the arrival nearest the objectives', [{ term: 'placement', value: scored[0]!.score }]);
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
  if (context.view.pendingDecision !== null) return respondToDecision(context, situation);
  const { phase, segment } = projection.sequence;
  let chosen: BotDecision | null = null;
  if (phase === 'REINFORCEMENT') chosen = reinforcementStep(context, situation);
  else if (phase === 'AIRCRAFT_REFIT') chosen = refitStep(context);
  else if (phase === 'SUPPLY') chosen = supplyStep(context, situation);
  else if (segment === 'MOVEMENT' && (phase === 'MOVEMENT' || phase === 'EXPLOITATION')) {
    chosen = movementStep(context, situation, facts, w) ?? (phase === 'MOVEMENT' ? hedgehogStep(context, situation, w) : null);
  }
  else if (segment === 'BARRAGE') {
    const effort = chooseMainEffort(situation, w);
    // Aircraft first: they take the main effort's hex (one barrage per hex, 10.0e) and the guns the next one.
    chosen = (phase === 'MOVEMENT' ? bestAirBarrage(context, situation, w, effort) : null) ?? bestBarrage(context, situation, w, effort);
  }
  else if (segment === 'COMBAT') chosen = bestCombat(context, situation, facts, w, context.actions.candidates('DECLARE_COMBAT', null, 200), w.attackThreshold, chooseMainEffort(situation, w));
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
    version: options.label === undefined ? '12' : `12+${options.label}`,
    decide: (context) => {
      const sink = options.debug;
      debug = sink ? (line) => sink(`${context.memory.stepKey} ${String(context.playerId).split(':').at(-1)} ${line}`) : null;
      try { return choose(context); } finally { debug = null; }
    },
  };
};
