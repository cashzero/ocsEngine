// Theater supply allocation (docs/ai/theater-supply-plan.md), measurement side only: nothing here is read by the bot.
//
//   theaters(m, state, playerId, { splitRailHexes }) -> { roots, objectives: [{ hexId, points, heldBy, railHexId, railDepth, theater }], theaters }
//
// A theater groups the configured objectives whose rail routes from the player's map-edge entry split fewer than
// `splitRailHexes` (default SPLIT_RAIL_HEXES) rail hexes before the nearer of the two objectives (single linkage).

export const SPLIT_RAIL_HEXES = 6;

const byId = (left, right) => String(left).localeCompare(String(right));

/** Breadth-first rail tree from `roots`, neighbors in hex-id order so ties resolve the same way every time. */
const railTree = (neighbors, roots) => {
  const parent = new Map(roots.map((hexId) => [hexId, null]));
  const depth = new Map(roots.map((hexId) => [hexId, 0]));
  const queue = [...roots];
  while (queue.length > 0) {
    const hexId = queue.shift();
    for (const next of [...(neighbors.get(hexId) ?? [])].sort(byId)) {
      if (depth.has(next)) continue;
      parent.set(next, hexId);
      depth.set(next, depth.get(hexId) + 1);
      queue.push(next);
    }
  }
  return { parent, depth };
};

const pathTo = (parent, hexId) => {
  const path = [];
  for (let at = hexId; at !== null && at !== undefined; at = parent.get(at)) path.unshift(at);
  return path;
};

export const theaters = (m, state, playerId, { splitRailHexes = SPLIT_RAIL_HEXES } = {}) => {
  const neighbors = m.railNetworkOf(state).neighbors;
  const railHexes = [...neighbors.keys()].sort(byId);
  const edges = m.friendlySupplySources(state, playerId).filter(({ kind }) => kind === 'MAP_EDGE').map(({ hexId }) => hexId);
  const nearest = (hexId, among) => among.reduce((best, other) => {
    const distance = m.hexDistanceBetween(hexId, other);
    return distance < best.distance ? { hexId: other, distance } : best;
  }, { hexId: null, distance: Infinity });
  let roots = railHexes.filter((hexId) => edges.some((edge) => m.hexDistanceBetween(edge, hexId) <= 1));
  if (roots.length === 0 && railHexes.length > 0 && edges.length > 0) {
    const closest = edges.map((edge) => nearest(edge, railHexes)).sort((a, b) => a.distance - b.distance || byId(a.hexId, b.hexId))[0];
    roots = [closest.hexId];
  }
  const { parent, depth } = railTree(neighbors, roots);
  const control = new Map(state.mapState.hexControl.map(({ hexId, controllerId }) => [String(hexId), controllerId]));
  const objectives = [...state.configuration.objectives].sort((a, b) => byId(a.hexId, b.hexId)).map(({ hexId, points }) => {
    const anchor = nearest(hexId, railHexes);
    return {
      hexId: String(hexId), points, heldBy: control.get(String(hexId)) ?? null,
      railHexId: anchor.hexId, railDistance: anchor.distance, railDepth: depth.get(anchor.hexId) ?? null,
    };
  });
  const group = objectives.map((_, index) => index);
  const find = (index) => (group[index] === index ? index : (group[index] = find(group[index])));
  for (let i = 0; i < objectives.length; i++) {
    for (let j = i + 1; j < objectives.length; j++) {
      const left = objectives[i], right = objectives[j];
      if (left.railDepth === null || right.railDepth === null) continue;
      const a = pathTo(parent, left.railHexId), b = pathTo(parent, right.railHexId);
      let shared = 0;
      while (shared < a.length && shared < b.length && a[shared] === b[shared]) shared++;
      if (Math.min(a.length - shared, b.length - shared) < splitRailHexes) group[find(i)] = find(j);
    }
  }
  const members = new Map();
  objectives.forEach((objective, index) => members.set(find(index), [...(members.get(find(index)) ?? []), objective.hexId]));
  const theaterOf = new Map([...members.values()].flatMap((hexIds) => hexIds.map((hexId) => [hexId, hexIds.join('+')])));
  return {
    roots,
    objectives: objectives.map((objective) => ({ ...objective, theater: theaterOf.get(objective.hexId) })),
    theaters: [...members.values()].map((hexIds) => hexIds.join('+')).sort(byId),
  };
};

export const CANDIDATE_LIMIT = 10;

/**
 * The attack on `targetHexId` with the highest odds column that the actor's combat supply can pay now, in a Combat
 * segment state: the rules accept the declaration (`validateAction`, which settles every attacker's declared supply
 * together) with the supply choices of `defaultAttackerSupply`. Ties go to fewer Tokens, then fewer attackers.
 * Candidates are the adjacent own units that the rules accept attacking alone. When all of them together are payable
 * they reach the best column, and the weakest not needed for it are dropped; otherwise subsets are searched, above
 * CANDIDATE_LIMIT only among the strongest. Odds assume every defender pays its combat supply. Null when no candidate can attack.
 * `ineligible` counts adjacent own units the rules reject attacking alone; `reasons` counts why (violation codes, or
 * NO_SUPPLY_CHOICE when no supply declaration exists). `unboundColumn` is the best column of the candidates with supply and every other check ignored.
 *   -> { attackerIds, defenderIds, attackerSupply, leadAttackerId, column, unboundColumn, tokens, candidates, ineligible, reasons, validations, dropped }
 */
export const bestPayableAttack = (m, state, actorId, targetHexId) => {
  const target = String(targetHexId);
  const onMap = state.pieceState.pieces.filter((piece) => piece.location.kind === 'ON_MAP' && m.isOnMapCombatUnit(state, piece));
  const defenderIds = onMap.filter((piece) => piece.ownerId !== actorId && String(piece.location.hexId) === target).map(({ id }) => id).sort(byId);
  if (defenderIds.length === 0) return null;
  const adjacent = new Set(m.adjacentHexIds(target).map(String));
  const declaration = (attackerIds, attackerSupply) => ({
    kind: 'DECLARE_COMBAT', actionId: `theater-supply:${target}:${attackerIds.join('+')}`, actorId, expectedRevision: state.revision,
    combatKind: 'REGULAR', attackerIds, defenderIds, targetHexId: target, leadAttackerId: attackerIds[0], attackerSupply,
  });
  let validations = 0;
  const reasons = {};
  const legal = (attackerIds, why = null) => {
    const attackerSupply = m.defaultAttackerSupply(state, actorId, attackerIds);
    if (!attackerSupply) {
      if (why) why.NO_SUPPLY_CHOICE = (why.NO_SUPPLY_CHOICE ?? 0) + 1;
      return null;
    }
    validations += 1;
    const validation = m.ruleEngine.validateAction(state, declaration(attackerIds, attackerSupply));
    if (!validation.allowed && why) for (const { code } of validation.violations) why[code] = (why[code] ?? 0) + 1;
    return validation.allowed ? attackerSupply : null;
  };
  const column = (attackerIds) => m.calculateCombatOdds(state, attackerIds, defenderIds, target, defenderIds, null, null).columnIndex;
  const steps = (id) => state.pieceState.pieces.find((piece) => piece.id === id)?.remainingSteps ?? 1;
  const adjacentIds = onMap.filter((piece) => piece.ownerId === actorId && adjacent.has(String(piece.location.hexId))).map(({ id }) => id).sort(byId);
  const eligible = adjacentIds.filter((id) => legal([id], reasons) !== null);
  const ineligible = adjacentIds.length - eligible.length;
  if (eligible.length === 0) return { attackerIds: [], defenderIds, column: null, unboundColumn: null, tokens: 0, candidates: 0, ineligible, reasons, validations, dropped: 0 };
  const strength = (id) => m.calculateCombatOdds(state, [id], defenderIds, target, defenderIds, null, null).attackerStrength ?? 0;
  const fullSupply = legal(eligible);
  if (fullSupply) {
    // Adding an attacker never lowers the column, so all of them reach the best one; drop the weakest that are not needed.
    const best = column(eligible);
    let chosen = eligible, attackerSupply = fullSupply;
    for (const id of [...eligible].sort((a, b) => strength(a) - strength(b) || byId(a, b))) {
      const without = chosen.filter((other) => other !== id);
      if (without.length === 0 || column(without) < best) continue;
      const supply = legal(without);
      if (supply) { chosen = without; attackerSupply = supply; }
    }
    return {
      attackerIds: chosen, defenderIds, attackerSupply, leadAttackerId: chosen[0], column: best, unboundColumn: best,
      tokens: chosen.reduce((sum, id) => sum + steps(id), 0), candidates: eligible.length, ineligible, reasons, validations, dropped: 0,
    };
  }
  const candidates = eligible.length <= CANDIDATE_LIMIT ? eligible
    : [...eligible].sort((a, b) => strength(b) - strength(a) || byId(a, b)).slice(0, CANDIDATE_LIMIT).sort(byId);
  const subsets = [];
  for (let mask = 1; mask < 1 << candidates.length; mask++) {
    const attackerIds = candidates.filter((_, index) => mask & (1 << index));
    subsets.push({ attackerIds, column: column(attackerIds), tokens: attackerIds.reduce((sum, id) => sum + steps(id), 0) });
  }
  subsets.sort((a, b) => b.column - a.column || a.tokens - b.tokens || a.attackerIds.length - b.attackerIds.length || byId(a.attackerIds.join(), b.attackerIds.join()));
  for (const subset of subsets) {
    const attackerSupply = legal(subset.attackerIds);
    if (attackerSupply) {
      return { ...subset, defenderIds, attackerSupply, leadAttackerId: subset.attackerIds[0], unboundColumn: subsets[0].column, candidates: candidates.length, ineligible, reasons, validations, dropped: eligible.length - candidates.length };
    }
  }
  return { attackerIds: [], defenderIds, column: null, unboundColumn: subsets[0].column, tokens: 0, candidates: candidates.length, ineligible, reasons, validations, dropped: eligible.length - candidates.length };
};
