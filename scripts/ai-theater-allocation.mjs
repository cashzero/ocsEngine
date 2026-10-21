// Theater supply allocation search (docs/ai/theater-supply-plan.md), measurement side only: nothing here is read by the bot.
//
//   const problem = allocationProblem(engine, state, playerId, model, { move })
//   const best = allocate(problem)            -> { value, assignment: Map(unitId -> objective hexId), objectives }
//   exhaustive(problem, unitIds)              -> the same, optimal over those units (the others unassigned)
//
// engine = loadAllocationEngine(dist). model = the frozen capture model of plan P11.3 (key `frozen` of its model.json).
// The state is projected to the player's Movement segment: nothing moved, this phase's fuel cleared. With `move` false
// (an actual configuration, e.g. at Combat entry) units cannot move and need no fuel.
import { join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

const LINES = ['CLOSE', 'OPEN', 'VERY_OPEN', 'EXTREMELY_OPEN'];
const FUEL = { SINGLE_UNIT: 1, FORMATION: 4, HQ: 4 };
const byId = (left, right) => String(left).localeCompare(String(right));

export const loadAllocationEngine = async (dist) => {
  const load = (file) => import(pathToFileURL(resolve(join(dist, file))).href);
  return { m: await load('index.js'), pieces: await load('rules/pieces.js'), fuel: await load('rules/supply/fuel.js'), strength: await load('rules/combat/strength.js') };
};

/** Probability the attacker holds the objective at turn end, from the frozen logistic (mirrors ai-theater-capture-model.py). */
export const captureProbability = (model, facts) => {
  const x = [facts.column, facts.drm, facts.defenderCanPay ? 1 : 0, facts.hedgehogLevel, ...LINES.map((line) => (facts.line === line ? 1 : 0))];
  const z = [1, ...x.map((value, index) => (value - model.mean[index]) / model.scale[index])];
  const logit = z.reduce((sum, value, index) => sum + value * model.beta[index], 0);
  return Math.min(1 - 1e-6, Math.max(1e-6, 1 / (1 + Math.exp(-Math.max(-35, Math.min(35, logit))))));
};

const project = ({ m, pieces, fuel }, state, playerId) => {
  const own = state.pieceState.pieces.filter((piece) => piece.ownerId === playerId && piece.location.kind === 'ON_MAP');
  const cleared = fuel.clearFuel(state, playerId);
  return {
    ...cleared, activeTransaction: null, pendingDecision: null, currentMoverId: null,
    sequence: { ...state.sequence, phase: 'MOVEMENT', segment: 'MOVEMENT', phasingPlayerId: playerId, actingPlayerId: playerId },
    usage: own.map((piece) => ({ ...pieces.usageOf(state, piece), movementSpentTicks: 0, moved: false, fueled: false, negationLocked: false, phaseStartHexId: piece.location.hexId })),
    air: { ...state.air, builderIds: [] },
  };
};

export const allocationProblem = (engine, state, playerId, model, { move = true } = {}) => {
  const { m, pieces } = engine;
  const base = move ? project(engine, state, playerId) : state;
  const control = new Map(base.mapState.hexControl.map(({ hexId, controllerId }) => [String(hexId), controllerId]));
  const combat = base.pieceState.pieces.filter((piece) => piece.location.kind === 'ON_MAP' && m.isOnMapCombatUnit(base, piece));
  const enemyHexes = new Set(combat.filter((piece) => piece.ownerId !== playerId).map((piece) => String(piece.location.hexId)));
  const ownObjectives = new Set(base.configuration.objectives.filter(({ hexId }) => control.get(String(hexId)) === playerId).map(({ hexId }) => String(hexId)));
  const objectives = base.configuration.objectives.filter(({ hexId }) => control.get(String(hexId)) !== playerId).map(({ hexId, points }) => {
    const hexId_ = String(hexId);
    return { hexId: hexId_, points, defenderIds: combat.filter((piece) => piece.ownerId !== playerId && String(piece.location.hexId) === hexId_).map(({ id }) => id).sort(byId),
      adjacent: new Set(m.adjacentHexIds(hexId_).map(String).filter((hex) => !enemyHexes.has(hex))) };
  });
  const hqCover = new Map();
  if (move) {
    for (const piece of base.pieceState.pieces.filter((p) => p.ownerId === playerId && p.location.kind === 'ON_MAP')) {
      for (const option of m.fuelOptions(base, piece)) if (option.method !== 'SINGLE_UNIT') hqCover.set(`${option.method}:${piece.id}`, option);
    }
  }
  const units = combat.filter((piece) => piece.ownerId === playerId && piece.mode !== 'STRAT' && !ownObjectives.has(String(piece.location.hexId))
    && (pieces.stepOf(base, piece)?.combatStrength ?? 0) > 0).sort((a, b) => byId(a.id, b.id)).map((piece) => {
    const here = String(piece.location.hexId);
    let fuelStatus = 'NOT_NEEDED', options = [];
    if (move && pieces.needsFuel(base, piece)) {
      options = m.fuelOptions(base, piece);
      const covered = [...hqCover.values()].filter((option) => option.fueledPieceIds.includes(piece.id));
      options = [...options.filter(({ method }) => method === 'SINGLE_UNIT'), ...covered];
      fuelStatus = options.length > 0 ? 'PAYABLE' : 'STRANDED';
    }
    const canMove = move && fuelStatus !== 'STRANDED';
    const fueled = { ...base, usage: pieces.withUsage(base, { ...pieces.usageOf(base, piece), fueled: true }) };
    const reach = new Set([here, ...(canMove ? (m.ruleEngine.queryMovementRange(fueled, playerId, piece.id).value ?? []).map(({ hexId }) => String(hexId)) : [])]);
    return { id: piece.id, here, steps: piece.remainingSteps ?? 1, fuelStatus, options, reach, needsFuel: fuelStatus === 'PAYABLE' };
  });
  return { engine, base, playerId, model, move, objectives, units, cache: new Map(), hexCache: new Map() };
};

/** The hex adjacent to the objective, within reach, from which the unit attacks with the most strength. */
const attackHex = (problem, unit, objective) => {
  const key = `${unit.id}>${objective.hexId}`;
  if (problem.hexCache.has(key)) return problem.hexCache.get(key);
  const { m } = problem.engine;
  let best = null;
  if (objective.defenderIds.length > 0) {
    for (const hexId of [...objective.adjacent].filter((hex) => unit.reach.has(hex)).sort(byId)) {
      const strength = m.calculateCombatOdds(placed(problem.base, [[unit.id, hexId]]), [unit.id], objective.defenderIds, objective.hexId, objective.defenderIds, null, null).attackerStrength ?? 0;
      if (best === null || strength > best.strength) best = { hexId, strength };
    }
  }
  problem.hexCache.set(key, best?.hexId ?? null);
  return best?.hexId ?? null;
};

const placed = (state, moves) => {
  const where = new Map(moves);
  return { ...state, pieceState: { ...state.pieceState, pieces: state.pieceState.pieces.map((piece) => (where.has(piece.id)
    ? { ...piece, currentFaceId: 'combat', location: { ...piece.location, hexId: where.get(piece.id) } } : piece)) } };
};

/**
 * Whether this unit can take part against the objective: enter it when empty, or attack from an adjacent hex where
 * its combat supply can be paid on its own. Joint payment of a whole group is checked once on the final allocation:
 * at Combat entry in the P7 games, units payable alone never had to be dropped when attacking together (plan P11.1).
 */
export const canUse = (problem, unit, objective) => {
  if (objective.defenderIds.length === 0) return unit.reach.has(objective.hexId);
  const hexId = attackHex(problem, unit, objective);
  if (hexId === null) return false;
  const key = `${unit.id}$${objective.hexId}`;
  if (!problem.hexCache.has(key)) problem.hexCache.set(key, problem.engine.m.defaultAttackerSupply(placed(problem.base, [[unit.id, hexId]]), problem.playerId, [unit.id]) !== null);
  return problem.hexCache.get(key);
};

/** Whether the objective's defenders can pay their combat supply (does not depend on the attackers). */
const defenderCanPay = (problem, objective, anyAttackerId) => {
  if (!('canPay' in objective)) objective.canPay = problem.engine.m.previewCombat(problem.base, problem.playerId, [anyAttackerId], objective.hexId, anyAttackerId, []).defenderCanPay;
  return objective.canPay;
};

/** Expected VP from sending these units against one objective, with the attack facts behind it. */
export const objectiveValue = (problem, objective, unitIds) => {
  if (unitIds.length === 0) return { value: 0, probability: 0 };
  const key = `${objective.hexId}|${[...unitIds].sort(byId).join('+')}`;
  if (problem.cache.has(key)) return problem.cache.get(key);
  const { m } = problem.engine;
  let result;
  if (objective.defenderIds.length === 0) {
    result = { value: objective.points, probability: 1 };
  } else {
    const units = unitIds.map((id) => problem.units.find((unit) => unit.id === id));
    const state = placed(problem.base, units.map((unit) => [unit.id, attackHex(problem, unit, objective)]));
    {
      const rating = (id) => problem.engine.strength.combatActionRating(state, state.pieceState.pieces.find((piece) => piece.id === id));
      const lead = [...unitIds].sort((a, b) => rating(b) - rating(a) || byId(a, b))[0];
      const odds = m.calculateCombatOdds(state, unitIds, objective.defenderIds, objective.hexId, objective.defenderIds, lead, null);
      const facts = { column: odds.columnIndex, drm: odds.drm, defenderCanPay: defenderCanPay(problem, objective, unitIds[0]), hedgehogLevel: odds.hedgehogLevel, line: odds.line };
      const probability = captureProbability(problem.model, facts);
      result = { value: objective.points * probability, probability, facts };
    }
  }
  problem.cache.set(key, result);
  return result;
};

/**
 * Whether the movers that need fuel can all be fueled from the dumps' Tokens at once: options covering several movers
 * (HQ, formation) first, then one Token per remaining mover, each from one dump that still holds enough.
 */
export const fuelFeasible = (problem, unitIds) => {
  const movers = unitIds.map((id) => problem.units.find((unit) => unit.id === id)).filter((unit) => unit.needsFuel);
  if (movers.length === 0) return true;
  const left = new Map();
  const tokensOf = (source) => left.get(source.pieceId) ?? source.availableQuantity;
  const pay = (option) => {
    const source = option.sources.find((candidate) => tokensOf(candidate) >= FUEL[option.method]);
    if (!source) return false;
    left.set(source.pieceId, tokensOf(source) - FUEL[option.method]);
    return true;
  };
  const unfueled = new Set(movers.map(({ id }) => id));
  const shared = [...new Map(movers.flatMap((unit) => unit.options.filter(({ method }) => method !== 'SINGLE_UNIT').map((option) => [`${option.method}:${option.pieceId}`, option]))).values()]
    .sort((a, b) => b.fueledPieceIds.filter((id) => unfueled.has(id)).length - a.fueledPieceIds.filter((id) => unfueled.has(id)).length || byId(a.pieceId, b.pieceId));
  for (const option of shared) {
    const covers = option.fueledPieceIds.filter((id) => unfueled.has(id));
    if (covers.length >= 2 && pay(option)) for (const id of covers) unfueled.delete(id);
  }
  for (const unit of movers.filter(({ id }) => unfueled.has(id))) {
    const option = unit.options.find(({ method }) => method === 'SINGLE_UNIT') ?? unit.options[0];
    if (!option || !pay(option)) return false;
  }
  return true;
};

const movesFor = (problem, unitId, objective) => {
  const unit = problem.units.find(({ id }) => id === unitId);
  const target = objective.defenderIds.length === 0 ? objective.hexId : attackHex(problem, unit, objective);
  return target !== unit.here;
};

const total = (problem, groups) => problem.objectives.reduce((sum, objective) => sum + objectiveValue(problem, objective, groups.get(objective.hexId) ?? []).value, 0);

const feasible = (problem, groups) => fuelFeasible(problem, [...groups].flatMap(([hexId, ids]) => {
  const objective = problem.objectives.find((candidate) => candidate.hexId === hexId);
  return ids.filter((id) => movesFor(problem, id, objective));
}));

/** The allocation's objectives, each defended one's group settled jointly; a group that cannot pay together is worth 0. */
const result = (problem, groups) => {
  const objectives = problem.objectives.map((objective) => {
    const unitIds = groups.get(objective.hexId) ?? [];
    const valued = objectiveValue(problem, objective, unitIds);
    const units = unitIds.map((id) => problem.units.find((unit) => unit.id === id));
    const jointlyPayable = objective.defenderIds.length === 0 || unitIds.length === 0
      || problem.engine.m.defaultAttackerSupply(placed(problem.base, units.map((unit) => [unit.id, attackHex(problem, unit, objective)])), problem.playerId, unitIds) !== null;
    return { hexId: objective.hexId, points: objective.points, defended: objective.defenderIds.length > 0, unitIds, ...valued,
      jointlyPayable, ...(jointlyPayable ? {} : { value: 0, probability: 0 }) };
  });
  return {
    value: objectives.reduce((sum, { value }) => sum + value, 0),
    assignment: new Map([...groups].flatMap(([hexId, ids]) => ids.map((id) => [id, hexId]))),
    objectives,
  };
};

/** Greedy assignment by marginal expected VP, then moves of unit pairs, single moves and removals until none improves. */
export const allocate = (problem, unitIds = problem.units.map(({ id }) => id)) => {
  const usable = new Map(unitIds.map((id) => [id, problem.objectives.filter((objective) => canUse(problem, problem.units.find((unit) => unit.id === id), objective))]));
  const objectiveOf = new Map(problem.objectives.map((objective) => [objective.hexId, objective]));
  const groups = new Map();
  const valueOf = (hexId, members) => objectiveValue(problem, objectiveOf.get(hexId), members).value;
  // The groups after moving `ids` to `target` (null: unassigned), and the change in total expected VP.
  const proposal = (ids, target) => {
    const affected = new Set([...ids.map((id) => [...groups].find(([, members]) => members.includes(id))?.[0]).filter(Boolean), ...(target ? [target] : [])]);
    const next = new Map(groups);
    let gain = 0;
    for (const hexId of affected) {
      const before = groups.get(hexId) ?? [];
      const after = [...before.filter((id) => !ids.includes(id)), ...(hexId === target ? ids : [])];
      next.set(hexId, after);
      gain += valueOf(hexId, after) - valueOf(hexId, before);
    }
    return { next, gain };
  };
  const apply = (next) => { for (const [hexId, members] of next) groups.set(hexId, members); };
  const free = new Set(unitIds.filter((id) => usable.get(id).length > 0));
  for (;;) {
    let best = null;
    for (const id of [...free].sort(byId)) {
      for (const objective of usable.get(id)) {
        const { next, gain } = proposal([id], objective.hexId);
        if (gain > 1e-9 && (best === null || gain > best.gain) && feasible(problem, next)) best = { id, gain, next };
      }
    }
    if (!best) break;
    apply(best.next);
    free.delete(best.id);
  }
  const ids = [...usable.keys()].filter((id) => usable.get(id).length > 0).sort(byId);
  for (let pass = 0, improved = true; improved && pass < 20; pass++) {
    improved = false;
    // Pairs first: a defended objective often needs two more units before its column moves.
    for (let i = 0; i < ids.length; i++) {
      for (let j = i + 1; j < ids.length; j++) {
        for (const objective of usable.get(ids[i]).filter((candidate) => candidate.defenderIds.length > 0 && usable.get(ids[j]).includes(candidate))) {
          const members = groups.get(objective.hexId) ?? [];
          if (members.includes(ids[i]) && members.includes(ids[j])) continue;
          const { next, gain } = proposal([ids[i], ids[j]], objective.hexId);
          if (gain > 1e-9 && feasible(problem, next)) { apply(next); improved = true; break; }
        }
      }
    }
    for (const id of ids) {
      const from = [...groups].find(([, members]) => members.includes(id))?.[0] ?? null;
      for (const target of [null, ...usable.get(id).map(({ hexId }) => hexId)]) {
        if (target === from) continue;
        const { next, gain } = proposal([id], target);
        if (gain > 1e-9 && feasible(problem, next)) { apply(next); improved = true; break; }
      }
    }
  }
  return result(problem, new Map([...groups].filter(([, members]) => members.length > 0)));
};

/** The best assignment of these units by full enumeration (each to one usable objective or none). */
export const exhaustive = (problem, unitIds) => {
  const choices = unitIds.map((id) => [null, ...problem.objectives.filter((objective) => canUse(problem, problem.units.find((unit) => unit.id === id), objective)).map(({ hexId }) => hexId)]);
  let best = null;
  const pick = new Array(unitIds.length).fill(0);
  for (;;) {
    const groups = new Map();
    pick.forEach((choice, index) => { const hexId = choices[index][choice]; if (hexId) groups.set(hexId, [...(groups.get(hexId) ?? []), unitIds[index]]); });
    const value = total(problem, groups);
    if ((best === null || value > best.value + 1e-9) && feasible(problem, groups)) best = { value, groups };
    let index = 0;
    while (index < pick.length && ++pick[index] === choices[index].length) { pick[index] = 0; index += 1; }
    if (index === pick.length) break;
  }
  return result(problem, best.groups);
};
