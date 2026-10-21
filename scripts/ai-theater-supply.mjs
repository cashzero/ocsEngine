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

/**
 * The state at the first `phase`/`segment` entry inside a recorded action, or null. When the action stops at the entry
 * the state after it is the entry; an ADVANCE_SEQUENCE that passes through it is rebuilt from its lifecycle transitions,
 * which must regenerate the recorded events and final state. Any other pass-through adds one to `counts.unavailable`.
 */
export const segmentEntry = (m, before, action, applied, phase, segment, counts) => {
  const advances = applied.events.filter(({ kind }) => kind === 'SEQUENCE_ADVANCED');
  const entry = advances.find((event) => event.to.phase === phase && event.to.segment === segment);
  if (!entry) return null;
  if (entry === advances.at(-1)) {
    if (JSON.stringify(applied.state.sequence) !== JSON.stringify(entry.to)) throw new Error('entry sequence differs from the state after the action');
    return applied.state;
  }
  if (action.kind !== 'ADVANCE_SEQUENCE') { counts.unavailable += 1; return null; }
  let rebuilt = before, measured = null;
  const regenerated = [];
  for (const event of advances) {
    if (JSON.stringify(m.nextSequence(rebuilt)) !== JSON.stringify(event.to)) throw new Error('lifecycle sequence differs from the recorded one');
    const lifecycle = m.applySequenceLifecycle(rebuilt, event.to);
    rebuilt = lifecycle.state;
    regenerated.push(...lifecycle.events);
    if (event.sequence === entry.sequence) measured = rebuilt;
  }
  const canonical = (value) => JSON.stringify(value);
  if (canonical(regenerated.map((event, sequence) => ({ ...event, sequence }))) !== canonical(applied.events)) throw new Error('lifecycle events differ from the recorded ones');
  if (canonical({ ...rebuilt, revision: applied.state.revision }) !== canonical(applied.state)) throw new Error('lifecycle state differs from the recorded one');
  return measured;
};

export const ZONE_HEXES = 3;

/**
 * Each theater's front zone: hexes within ZONE_HEXES of one of its objectives, a hex near several objectives going to
 * the nearest one (ties to the lower objective id). -> Map(hexId -> theater)
 */
export const theaterZones = (m, state, partition) => {
  const zones = new Map();
  for (const { id } of state.scenario.mapDefinition.hexes) {
    let best = null;
    for (const objective of partition.objectives) {
      const distance = m.hexDistanceBetween(id, objective.hexId);
      if (distance <= ZONE_HEXES && (best === null || distance < best.distance)) best = { distance, theater: objective.theater };
    }
    if (best) zones.set(String(id), best.theater);
  }
  return zones;
};

const isResource = (state, piece) => state.scenario.pieceCatalog.definitions.find(({ id }) => id === piece.definitionId)?.family === 'RESOURCE';

/** Where each of the player's Tokens are: dumps on the map, and truck cargo at its truck's hex. -> [{ pieceId, hexId, tokens, cargoOf }] */
export const tokenHolders = (state, playerId) => {
  const byId = new Map(state.pieceState.pieces.map((piece) => [piece.id, piece]));
  return state.pieceState.pieces.filter((piece) => piece.ownerId === playerId && isResource(state, piece) && (piece.resourceQuantity ?? 0) > 0).flatMap((piece) => {
    if (piece.location.kind === 'ON_MAP') return [{ pieceId: piece.id, hexId: String(piece.location.hexId), tokens: piece.resourceQuantity, cargoOf: null }];
    const truck = piece.location.kind === 'CONTAINER' ? byId.get(piece.location.containerId) : null;
    return truck?.location.kind === 'ON_MAP' ? [{ pieceId: piece.id, hexId: String(truck.location.hexId), tokens: piece.resourceQuantity, cargoOf: truck.id }] : [];
  });
};

/** The player's Tokens in each theater's zone and in total. -> { total, byTheater: { theater: tokens } } */
export const zoneTokens = (state, playerId, zones) => {
  const byTheater = {};
  let total = 0;
  for (const { hexId, tokens } of tokenHolders(state, playerId)) {
    total += tokens;
    const theater = zones.get(hexId);
    if (theater) byTheater[theater] = (byTheater[theater] ?? 0) + tokens;
  }
  return { total, byTheater };
};

/**
 * An upper bound, at the player's Movement segment entry, on the Tokens transport can bring into each theater's zone
 * before Combat: no more than the Tokens outside the zone, and no more than what the Rail Cap left can move (one quarter
 * per Token, 13.3b, halved on all-multi-track routes, so two Tokens per quarter at most) plus what the trucks whose movement range touches the zone can carry: their cargo plus a full load per
 * load-and-unload pair their MA pays for (13.2f; unbounded when loading is free).
 *   -> { [theater]: { outside, rail, trucks, bound } }
 */
export const inflowBound = (m, modules, state, playerId, zones) => {
  const { pieces, transport, railCap } = modules;
  const holders = tokenHolders(state, playerId);
  const rail = 2 * railCap.railCapRemainingQuarters(state, playerId);
  const trucks = state.pieceState.pieces.filter((piece) => piece.ownerId === playerId && piece.location.kind === 'ON_MAP'
    && pieces.isTransportPoint(state, piece) && !pieces.isExtender(state, piece)).map((truck) => {
    const loadTicks = transport.loadCostTicks(state, truck);
    const allowance = pieces.movementAllowanceTicks(state, truck);
    const trips = loadTicks > 0 ? Math.floor(allowance / (2 * loadTicks)) : Infinity;
    const reach = new Set([String(truck.location.hexId), ...(m.ruleEngine.queryMovementRange(state, playerId, truck.id).value ?? []).map(({ hexId }) => String(hexId))]);
    return { reach, carry: transport.loadedTokens(state, truck) + trips * transport.capacityTokens(state, truck) };
  });
  const result = {};
  for (const theater of new Set(zones.values())) {
    const outside = holders.filter(({ hexId }) => zones.get(hexId) !== theater).reduce((sum, { tokens }) => sum + tokens, 0);
    const truckCarry = trucks.filter(({ reach }) => [...reach].some((hexId) => zones.get(hexId) === theater)).reduce((sum, { carry }) => sum + carry, 0);
    result[theater] = { outside, rail, trucks: truckCarry, bound: Math.min(outside, rail + truckCarry) };
  }
  return result;
};
