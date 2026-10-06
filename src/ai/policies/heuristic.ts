import type { HexId, PieceId } from '../../core/index.js';
import type { GameAction } from '../../rules/index.js';
import { analyze, type OwnUnit, type Situation } from '../analysis.js';
import { respondToDecision } from '../decisions.js';
import { hexesBetween, knowledgeOf, type BotGameFacts } from '../knowledge.js';
import type { BotDecision, BotDecisionContext, BotPolicy, BotScoreTerm } from '../model.js';
import { forecastBarrage, forecastCombat } from '../odds.js';

/**
 * heuristic@1: reads the position and plays to win on objectives (M9.2).
 *
 * Every player turn it sends each combat unit toward the objective worth most for the distance, garrisons threatened
 * objectives it holds, follows with HQs and artillery, hauls SP to the forward HQ, attacks and barrages where the
 * printed tables give a good expected result, and answers pending decisions in its own favour. Only legal actions
 * offered by the session are dispatched.
 */

const STACKING_LIMIT_RE = 10;
const ATTACK_THRESHOLD = 4;
const BARRAGE_THRESHOLD = 2;

interface Target {
  readonly hexId: HexId;
  readonly purpose: 'CAPTURE' | 'GARRISON' | 'HUNT' | 'FRONT';
}

interface StepNotes {
  readonly done: Set<PieceId>;
  readonly modeSet: Set<PieceId>;
  readonly fueled: Set<PieceId>;
  readonly loaded: Set<PieceId>;
  /** Trucks that already moved this step: they may still unload, nothing else. */
  readonly truckMoved: Set<PieceId>;
  readonly incomingRe: Map<HexId, number>;
  targets: Map<PieceId, Target> | null;
}

const notesOf = (context: BotDecisionContext): StepNotes => {
  let notes = context.memory.notes.get('heuristic') as StepNotes | undefined;
  if (!notes) {
    notes = { done: new Set(), modeSet: new Set(), fueled: new Set(), loaded: new Set(), truckMoved: new Set(), incomingRe: new Map(), targets: null };
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

const planTargets = (situation: Situation, coverage: ReadonlySet<string>): Map<PieceId, Target> => {
  const me = situation.playerId;
  const targets = new Map<PieceId, Target>();
  const combat = situation.own.filter((unit) => situation.isCombatUnit(unit));
  // Held objectives keep a garrison (an occupied hex cannot be entered without a fight); others are worth taking.
  const wanted: { readonly hexId: HexId; readonly value: number; readonly purpose: Target['purpose']; readonly limit: number }[] = situation.objectives.map((objective) => {
    const threat = situation.threatAt(objective.hexId);
    const mine = objective.controllerId === me;
    return {
      hexId: objective.hexId,
      // Holding is cheaper than retaking: a threatened objective's garrison is worth more than a new capture.
      value: mine ? objective.points * (threat > 0 || situation.turnsLeft <= 2 ? 1.3 : 0.8) : objective.points,
      purpose: mine ? 'GARRISON' : 'CAPTURE',
      // A garrison is one unit, two under threat; an attack brings enough to beat what is there.
      limit: mine ? (threat > 6 ? 2 : 1) : 2 + Math.ceil((situation.enemy.get(objective.hexId)?.strength ?? 0) / 6),
    };
  });
  // Enemy stacks next to what we hold (objectives, HQs, dumps) cut supply and take empty objectives: hunt them.
  const anchors = [
    ...situation.objectives.filter(({ controllerId }) => controllerId === me).map(({ hexId }) => hexId),
    ...situation.own.filter(({ piece }) => piece.role === 'HQ' || piece.role === 'DUMP').map(({ hexId }) => hexId),
  ];
  for (const stack of situation.enemy.values()) {
    if (!stack.hasCombatUnit) continue;
    // Behind our lines: inside our trace supply area with our combat units close by.
    const infiltrated = coverage.has(stack.hexId) && combat.some((unit) => hexesBetween(unit.hexId, stack.hexId) <= 3);
    if (!infiltrated && !anchors.some((hexId) => hexesBetween(hexId, stack.hexId) <= 2)) continue;
    wanted.push({ hexId: stack.hexId, value: 3, purpose: 'HUNT', limit: 1 + Math.ceil(stack.strength / 5) });
  }
  const assigned = new Map<HexId, number>();
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
    if (objective && objective.controllerId !== me) add('capture', objective.points * 40);
  }
  // Near the end a captured objective must stay occupied: the enemy moves after us and walks into empty ones.
  const endObjective = situation.objectives.find((entry) => entry.hexId === destination);
  if (endObjective && situation.turnsLeft <= 2 && unit.piece.role === 'COMBAT'
    && situation.friendlyAt(destination).every((other) => other.piece.id === unit.piece.id || !situation.isCombatUnit(other))) {
    add('hold-at-end', endObjective.points * 15);
  }
  const incoming = (notes.incomingRe.get(destination) ?? 0) + situation.friendlyAt(destination).reduce((total, other) => total + reOf(other), 0);
  if (incoming + reOf(unit) > STACKING_LIMIT_RE && path.length > 1) add('overstack', -1000);
  if (unit.piece.role === 'COMBAT') {
    // Strat Mode units defend badly and lose their ZOC: keep them well away from the enemy (5.8).
    if (unit.piece.mode === 'STRAT' && situation.nearestEnemy(destination).distance <= 3) add('strat-near-enemy', -60);
    // One stack per hex does the job; more units in the same hex only make a better barrage target.
    if (path.length > 1) add('crowding', -incoming * 3);
    if (target) {
      const progress = hexesBetween(path[0]!, target.hexId) - hexesBetween(destination, target.hexId);
      add('progress', progress * (target.purpose === 'FRONT' ? 6 : 10));
      // A hunter stops beside its quarry, ready to attack.
      if (target.purpose === 'HUNT' && hexesBetween(destination, target.hexId) === 1) add('hunt', 15);
      if (target.purpose === 'GARRISON' && destination === target.hexId) add('garrison', 30);
    }
    if (adjacentEnemy) {
      const enemy = situation.nearestEnemy(destination).stack!;
      // Close in only where an attack has a chance; otherwise keep a hex away.
      add('contact', (strength + support) >= enemy.strength * 1.5 && unit.piece.mode === 'COMBAT' ? 6 : -8);
    }
    add('exposure', -Math.max(0, threat - (strength + support) * 1.5));
    // Out of trace supply a unit must eat SP or suffer attrition (12.8): stay inside, except to grab VP at the end.
    // Beyond trace a unit can still eat from SP close by (12.3a, a dump or a loaded truck): only bare ground is dangerous.
    if (coverage && !coverage.has(destination)) {
      const fed = situation.own.some(({ piece, hexId }) => ((piece.role === 'DUMP' && (piece.resourceQuantity ?? 0) > 0)
        || (piece.role === 'TRUCK' && (piece.carriedTokens ?? 0) > 0)) && hexesBetween(hexId, destination) <= 3);
      add('out-of-supply', situation.turnsLeft <= 1 || fed ? -10 : -60);
    }
    // Supply that depends on an HQ's throw is lost when the HQ moves or falls: prefer direct trace.
    else if (!direct.has(destination) && situation.turnsLeft > 1) add('hq-dependent-supply', -8);
  } else if (unit.piece.role === 'HQ') {
    if (front) add('with-army', -hexesBetween(destination, front) * 6);
    if (situation.nearestEnemy(destination).distance <= 2) add('hq-exposed', -60);
    if (coverage && !coverage.has(destination)) add('out-of-supply', -60);
    add('exposure', -threat * 2);
  } else if (unit.piece.role === 'ARTILLERY') {
    const distance = situation.nearestEnemy(destination).distance;
    const range = Math.max(1, unit.profile?.range ?? 1);
    add('in-range', distance >= 2 && distance <= range ? 20 : -Math.max(0, distance - range) * 4);
    // Fire where the army fights, not at whatever enemy is nearest somewhere else on the map.
    if (front) add('with-army', -Math.max(0, hexesBetween(destination, front) - range - 1) * 6);
    if (distance <= 1) add('artillery-exposed', -60);
    add('exposure', -threat * 1.5);
  } else {
    add('exposure', -threat * 4);
    if (adjacentEnemy) add('rear-exposed', -80);
  }
  return terms;
};

const sum = (terms: readonly BotScoreTerm[]) => terms.reduce((total, { value }) => total + value, 0);

/** Logistics: an empty truck heads for the fullest dump and loads, a loaded one heads for the forward HQ and unloads. */
const truckStep = (context: BotDecisionContext, situation: Situation, unit: OwnUnit, notes: StepNotes): BotDecision | null => {
  const { actions } = context;
  const id = unit.piece.id;
  const carried = unit.piece.carriedTokens ?? 0;
  // SP is worth most where the army can draw it (12.3a): unload beside the army's centre, behind the front.
  const center = armyCenter(situation);
  const forwardHq = center === null ? undefined : { hexId: center };
  if (carried > 0 && forwardHq && hexesBetween(unit.hexId, forwardHq.hexId) <= 2 && situation.nearestEnemy(unit.hexId).distance >= 2) {
    const unload = [...actions.candidates('UNLOAD_SUPPLY', id)].sort((left, right) =>
      (right.kind === 'UNLOAD_SUPPLY' ? right.tokens : 0) - (left.kind === 'UNLOAD_SUPPLY' ? left.tokens : 0))[0];
    notes.done.add(id);
    if (unload) return decision(unload, `unload ${carried}T beside the army`, [{ term: 'deliver', value: carried }]);
    return null;
  }
  // A truck that already moved this step may only unload (above) once it stands beside the army.
  if (notes.truckMoved.has(id)) { notes.done.add(id); return null; }
  if (carried === 0 && !notes.loaded.has(id)) {
    const load = [...actions.candidates('LOAD_SUPPLY', id)].sort((left, right) =>
      (right.kind === 'LOAD_SUPPLY' ? right.tokens : 0) - (left.kind === 'LOAD_SUPPLY' ? left.tokens : 0))[0];
    if (load && load.kind === 'LOAD_SUPPLY' && (!forwardHq || hexesBetween(unit.hexId, forwardHq.hexId) > 2)) {
      notes.loaded.add(id);
      return decision(load, `load ${load.tokens}T for the front`, [{ term: 'haul', value: load.tokens }]);
    }
  }
  const dumps = situation.own.filter(({ piece }) => piece.role === 'DUMP' && (piece.resourceQuantity ?? 0) > 0);
  const goal = carried > 0 || notes.loaded.has(id)
    ? forwardHq?.hexId
    : [...dumps].sort((left, right) => (right.piece.resourceQuantity ?? 0) - (left.piece.resourceQuantity ?? 0)
      || hexesBetween(unit.hexId, left.hexId) - hexesBetween(unit.hexId, right.hexId))[0]?.hexId;
  if (!goal) { notes.done.add(id); return null; }
  const moves = actions.candidates('MOVE_PIECE', id);
  let best: { action: GameAction; terms: BotScoreTerm[] } | null = null;
  for (const move of moves) {
    const destination = destinationOf(move)!;
    const terms: BotScoreTerm[] = [{ term: 'toward-goal', value: (hexesBetween(unit.hexId, goal) - hexesBetween(destination, goal)) * 5 }];
    if (situation.nearestEnemy(destination).distance <= 2) terms.push({ term: 'truck-exposed', value: -80 });
    terms.push({ term: 'exposure', value: -situation.threatAt(destination) * 4 });
    if (!best || sum(terms) > sum(best.terms)) best = { action: move, terms };
  }
  debug?.(`TRUCK ${id} at ${unit.hexId} carried ${carried} goal ${goal} center ${center} moves ${moves.length} best ${best ? `${sum(best.terms).toFixed(1)} to ${destinationOf(best.action)}` : '-'} enemy ${situation.nearestEnemy(unit.hexId).distance}`);
  if (!best || sum(best.terms) <= 0) { notes.done.add(id); return null; }
  notes.truckMoved.add(id);
  return decision(best.action, `truck toward ${goal}`, best.terms, moves);
};

let debug: ((line: string) => void) | null = null;

const movementStep = (context: BotDecisionContext, situation: Situation, facts: BotGameFacts): BotDecision | null => {
  const { actions } = context;
  const notes = notesOf(context);
  const traced = context.actions.traceCoverage();
  const coverage = new Set(traced.hexIds);
  const direct = new Set(traced.directHexIds);
  notes.targets ??= planTargets(situation, coverage);
  const front = armyCenter(situation);
  // HQs move first: their throw range decides where the rest is in trace supply (12.3b).
  const order = (unit: OwnUnit) => unit.piece.role === 'HQ' ? 0 : unit.piece.role === 'COMBAT' ? 1 : unit.piece.role === 'ARTILLERY' ? 2 : unit.piece.role === 'TRUCK' ? 3 : 9;
  const units = situation.own.filter((unit) => order(unit) < 9 && !notes.done.has(unit.piece.id))
    .sort((left, right) => order(left) - order(right) || String(left.piece.id).localeCompare(String(right.piece.id)));
  for (const unit of units) {
    const id = unit.piece.id;
    if (unit.piece.role === 'TRUCK') {
      const step = truckStep(context, situation, unit, notes);
      if (step) return step;
      continue;
    }
    const target = notes.targets.get(id);
    const enemyDistance = situation.nearestEnemy(unit.hexId).distance;
    // Mode first (5.4): Combat Mode near the enemy for strength and ZOC, Strat Mode far behind the lines.
    if (!notes.modeSet.has(id)) {
      notes.modeSet.add(id);
      const wanted = unit.piece.role === 'COMBAT' && enemyDistance <= 3 ? 'COMBAT'
        : unit.piece.role === 'COMBAT' && enemyDistance >= 10 && target && hexesBetween(unit.hexId, target.hexId) >= 8 ? 'STRAT'
          // An HQ with the army stays in Combat Mode to rebuild units (13.5a); one far behind moves up in Move Mode.
          : unit.piece.role === 'HQ' ? (front !== null && hexesBetween(unit.hexId, front) <= 3 ? 'COMBAT' : 'MOVE') : null;
      if (wanted !== null && unit.piece.mode !== wanted) {
        const change = actions.candidates('CHANGE_MODE', id).find((action) => action.kind === 'CHANGE_MODE' && action.mode === wanted);
        if (change) return decision(change, `${wanted} mode (${enemyDistance} hexes from the enemy)`, [{ term: 'mode', value: 1 }]);
      }
    }
    // Overrun what is in the way when the table promises a clear result (8.0).
    if (unit.piece.role === 'COMBAT') {
      const overrun = bestCombat(context, situation, facts, actions.candidates('DECLARE_COMBAT', id, 20), ATTACK_THRESHOLD * 2);
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
      debug?.(`${unit.piece.role} ${id} at ${unit.hexId} mode ${unit.piece.mode} target ${target?.purpose ?? '-'} ${target?.hexId ?? ''} enemy ${enemyDistance}: no moves `
        + `(fuel offers ${actions.candidates('PAY_FUEL', id).length})`);
      continue;
    }
    const stay = sum(scoreDestination(situation, unit, target, [unit.hexId], notes, coverage, direct, front));
    let best: { action: GameAction; terms: BotScoreTerm[] } | null = null;
    for (const move of moves) {
      if (move.kind !== 'MOVE_PIECE') continue;
      const terms = scoreDestination(situation, unit, target, move.path, notes, coverage, direct, front);
      if (!best || sum(terms) > sum(best.terms)) best = { action: move, terms };
    }
    debug?.(`${unit.piece.role} ${id} at ${unit.hexId} mode ${unit.piece.mode} target ${target?.purpose ?? '-'} ${target?.hexId ?? ''} `
      + `enemy ${enemyDistance} moves ${moves.length} stay ${stay.toFixed(1)} best ${best ? `${sum(best.terms).toFixed(1)} to ${destinationOf(best.action)} ${JSON.stringify(best.terms)}` : '-'}`);
    if (best && sum(best.terms) > stay) {
      const destination = destinationOf(best.action)!;
      notes.incomingRe.set(destination, (notes.incomingRe.get(destination) ?? 0) + reOf(unit));
      return decision(best.action, `${unit.piece.role.toLowerCase()} to ${destination}${target ? ` (${target.purpose.toLowerCase()} ${target.hexId})` : ''}`, best.terms, moves);
    }
  }
  return null;
};

const fuelRank = (action: GameAction): number => action.kind !== 'PAY_FUEL' ? 9 : action.method === 'FORMATION' ? 0 : action.method === 'HQ' ? 1 : 2;

// ─── Combat and barrage ────────────────────────────────────────────────────────────────────────

/** The declared combat with the best expected value on the printed table, if any clears the threshold. */
const bestCombat = (context: BotDecisionContext, situation: Situation, facts: BotGameFacts, candidates: readonly GameAction[], threshold: number): BotDecision | null => {
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
    if (oddsFor / Math.max(1e-9, oddsAgainst) < 1 && !lastGrab) continue;
    const enemy = situation.enemy.get(action.targetHexId);
    // Steps the defender can lose before the hex empties: printed steps of the visible counters, two per hidden one.
    const defenderSteps = Math.max(1, (enemy?.pieces ?? []).filter(({ role }) => role !== 'DUMP' && role !== 'TRUCK')
      .reduce((total, piece) => total + (knowledgeOf(facts).profile(piece)?.steps ?? 1), 0) + (enemy?.hidden ?? 0) * 2);
    const vacate = Math.min(1, (forecast.defenderLosses + forecast.defenderOptions * 0.7) / defenderSteps);
    const terms: BotScoreTerm[] = [
      { term: 'defender-steps', value: forecast.defenderLosses * 10 + forecast.defenderOptions * 5 },
      { term: 'attacker-steps', value: -(forecast.attackerLosses * 10 + forecast.attackerOptions * 3) },
      { term: 'supply', value: -forecast.supplyTokens * 1.5 },
    ];
    if (objective && objective.controllerId !== situation.playerId) terms.push({ term: 'objective', value: vacate * objective.points * 25 });
    // Enemy units behind the front cut trace supply and pick up empty objectives: clear them.
    const nearHeld = situation.objectives.some(({ hexId, controllerId }) => controllerId === situation.playerId && hexesBetween(hexId, action.targetHexId) <= 1);
    if (nearHeld) terms.push({ term: 'protect-objective', value: vacate * 8 });
    if (forecast.defenderDisorganized > 0) terms.push({ term: 'disorganize', value: forecast.defenderDisorganized * 4 });
    if (!best || sum(terms) > sum(best.terms)) best = { action, terms, odds: forecast.odds };
  }
  if (best) debug?.(`combat best ${best.odds} on ${best.action.kind === 'DECLARE_COMBAT' ? best.action.targetHexId : ''} score ${sum(best.terms).toFixed(1)} ${JSON.stringify(best.terms)} of ${candidates.length}`);
  else debug?.(`combat: none of ${candidates.length} candidates could be forecast`);
  if (!best || sum(best.terms) < threshold) return null;
  const kind = best.action.kind === 'DECLARE_COMBAT' ? best.action.combatKind.toLowerCase() : 'combat';
  return decision(best.action, `${kind} at ${best.odds} on ${best.action.kind === 'DECLARE_COMBAT' ? best.action.targetHexId : ''}`, best.terms, candidates);
};

const bestBarrage = (context: BotDecisionContext, situation: Situation): BotDecision | null => {
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
      { term: 'disrupt', value: forecast.disrupt * (adjacentOwn ? 10 : 4) },
      { term: 'steps', value: forecast.expectedSteps * 10 },
      { term: 'supply', value: -forecast.supplyTokens * 1.2 },
    ];
    if (nearObjective) terms.push({ term: 'objective', value: 2 });
    if (!best || sum(terms) > sum(best.terms)) best = { action, terms };
  }
  return best && sum(best.terms) >= BARRAGE_THRESHOLD
    ? decision(best.action, `barrage ${best.action.kind === 'DECLARE_BARRAGE' ? best.action.targetHexId : ''}`, best.terms, candidates)
    : null;
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

const supplyStep = (context: BotDecisionContext): BotDecision | null => {
  for (const kind of ['CHECK_SUPPLY', 'CHOOSE_FORMATION_TRACE', 'RECOVER_INTERNALS'] as const) {
    const [first] = context.actions.candidates(kind, null, 20);
    if (first) return decision(first, `supply: ${kind.toLowerCase().replaceAll('_', ' ')}`, [{ term: 'supply', value: 1 }]);
  }
  return null;
};

const refitStep = (context: BotDecisionContext): BotDecision | null => {
  const [refit] = context.actions.candidates('REFIT_AIRCRAFT', null, 20);
  return refit ? decision(refit, 'refit aircraft', [{ term: 'refit', value: 1 }]) : null;
};

const decide = (facts: BotGameFacts) => (context: BotDecisionContext): BotDecision | null => {
  const projection = context.view.projection;
  if (!projection) return null;
  const situation = analyze(projection, context.playerId, facts);
  if (context.view.pendingDecision !== null) return respondToDecision(context, situation);
  const { phase, segment } = projection.sequence;
  let chosen: BotDecision | null = null;
  if (phase === 'REINFORCEMENT') chosen = reinforcementStep(context, situation);
  else if (phase === 'AIRCRAFT_REFIT') chosen = refitStep(context);
  else if (phase === 'SUPPLY') chosen = supplyStep(context);
  else if (segment === 'MOVEMENT' && (phase === 'MOVEMENT' || phase === 'EXPLOITATION')) chosen = movementStep(context, situation, facts);
  else if (segment === 'BARRAGE') chosen = bestBarrage(context, situation);
  else if (segment === 'COMBAT') chosen = bestCombat(context, situation, facts, context.actions.candidates('DECLARE_COMBAT', null, 200), ATTACK_THRESHOLD);
  return chosen ?? advance(context, `nothing worth doing in ${phase.toLowerCase()} ${segment.toLowerCase()}`);
};

export interface HeuristicPolicyOptions {
  /** Receives one line per unit the movement planner weighs; for diagnosing behavior. */
  readonly debug?: (line: string) => void;
}

export const createHeuristicPolicy = (facts: BotGameFacts, options: HeuristicPolicyOptions = {}): BotPolicy => ({
  id: 'heuristic', version: '1',
  decide: (context) => {
    debug = options.debug ?? null;
    try { return decide(facts)(context); } finally { debug = null; }
  },
});
