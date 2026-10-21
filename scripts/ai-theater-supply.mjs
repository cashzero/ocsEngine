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
