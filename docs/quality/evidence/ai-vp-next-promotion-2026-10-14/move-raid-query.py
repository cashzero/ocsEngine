from pathlib import Path
p=Path('src/ai/analysis.ts');s=p.read_text();s=s.replace("import { adjacentHexIds, movementCostModel, type MobilityType } from '../rules/index.js';\n",'');start=s.index('// Geometry only:');end=s.index('export const analyze',start);s=s[:start]+s[end:];start=s.index('            const definition = knowledge.definition(piece);');end=s.index('\n          }\n          if (distance',start)
s=s[:start]+'''            if (heldObjectives.has(hexId) && distance > THREAT_RADIUS && projection.objectiveRaidThreats) {
              threat += (projection.objectiveRaidThreats.find(r => r.pieceId === piece.id && r.hexId === hexId)?.strength ?? 0) / Math.max(1, distance);
            } else {
              const reach = heldObjectives.has(hexId) ? Math.max(THREAT_RADIUS, Math.ceil(2 * (profile?.movement ?? 0)) + 1) : THREAT_RADIUS;
              if (distance <= reach) threat += strength / Math.max(1, distance);
            }'''+s[end:];p.write_text(s)
p=Path('src/rules/query/projection.ts');s=p.read_text().replace("type PlayerId }", "type PlayerId, type HexId }").replace("import type { GameState }", "import type { GameState, MobilityType }").replace("import { hexsideFeatureIds }", "import { hexsideFeatureIds, movementCostModel }").replace('adjacentHexIds }','adjacentHexIds, hexDistanceBetween }');a=s.index('const publicTec =');b=s.index('/** 4.9a:',a)
s=s[:a]+'''/** Printed geometry only, never hidden enemy fuel, movement usage or stack contents. */
const raidRoutes = new WeakMap<GameState['configuration'], Map<string, ReadonlySet<HexId>>>();
const raidReach = (state: GameState, origin: HexId, mobility: MobilityType, allowance: number, turns: number): ReadonlySet<HexId> => {
  let cache = raidRoutes.get(state.configuration);
  if (!cache) { cache = new Map(); raidRoutes.set(state.configuration, cache); }
  const key = `${state.scenario.mapDefinition.id}:${origin}:${mobility}:${allowance}:${turns}:${state.weather.groundCondition}`;
  const cached = cache.get(key); if (cached) return cached;
  const model = movementCostModel(state, mobility, true, state.weather.groundCondition, true);
  const costs = new Map<HexId, number>([[origin, 0]]), pending: HexId[] = [origin];
  const budget = allowance * turns;
  for (let i = 0; i < pending.length; i++) {
    const from = pending[i]!, spent = costs.get(from)!;
    for (const to of adjacentHexIds(from)) {
      const step = model.evaluate(from, to); if (step.kind !== 'COST') continue;
      const next = step.all ? Math.floor(spent / allowance + 1) * allowance : spent + step.cost.totalTicks;
      if (spent >= budget || next > budget || next >= (costs.get(to) ?? Infinity)) continue;
      costs.set(to, next); pending.push(to);
    }
  }
  const result = new Set(costs.keys()); cache.set(key, result); return result;
};
const projectRaidThreats = (state: GameState, viewerId: PlayerId, stacks: readonly ProjectedStack[]): NonNullable<RuleProjection['objectiveRaidThreats']> => {
  const objectives = state.configuration.objectives.filter(o => state.mapState.hexControl.some(c => c.hexId === o.hexId && c.controllerId === viewerId));
  // When we move first, the enemy may move second now and first next turn before we can reposition.
  const turns = state.sequence.phasingPlayerId === viewerId && state.sequence.playerTurnIndex === 0 && state.sequence.gameTurn < state.configuration.turnLimit ? 2 : 1;
  const types: Readonly<Record<string, MobilityType>> = { 'mobility:leg': 'leg', 'mobility:truck': 'truck', 'mobility:tracked': 'tracked' };
  return stacks.flatMap(stack => stack.location.kind !== 'ON_MAP' ? [] : stack.pieces.flatMap(piece => {
    if (piece.ownerId === viewerId || !['COMBAT', 'ARTILLERY', 'HQ'].includes(piece.role)) return [];
    const origin = stack.location.kind === 'ON_MAP' ? stack.location.hexId : null;
    if (!origin) return [];
    const definition = state.scenario.pieceCatalog.definitions.find(d => d.id === piece.definitionId);
    return objectives.filter(o => hexDistanceBetween(origin, o.hexId) > 4).flatMap(objective => {
      const strength = Math.max(0, ...(definition?.faces ?? []).map(face => {
        const step = face.steps.find(s => s.remainingSteps === piece.remainingSteps) ?? [...face.steps].sort((a,b) => b.remainingSteps-a.remainingSteps)[0];
        const allowance = Number(step?.movementPointTicks ?? 0), mobility = types[String(face.mobilityClassDefinitionId)];
        if (!mobility || allowance <= 0) return 0;
        if (hexDistanceBetween(origin, objective.hexId) > allowance * turns / 2 + 1) return 0;
        const reached = raidReach(state, origin, mobility, allowance, turns);
        return reached.has(objective.hexId) || adjacentHexIds(objective.hexId).some(id => reached.has(id)) ? Number(step?.combatStrength ?? 0) : 0;
      }));
      return strength > 0 ? [{ pieceId: piece.id, hexId: objective.hexId, strength }] : [];
    });
  }));
};

'''+s[b:];s=s.replace('    movementCosts: movementCosts(state.configuration),','    objectiveRaidThreats: projectRaidThreats(state, viewerId, stacks),');p.write_text(s)
p=Path('src/rules/query/model.ts');s=p.read_text();a=s.index('  /** Public TEC columns');b=s.index('  /**\n',a);s=s[:a]+'''  /** Potential distant raids from visible printed counters and public terrain, with unknown future fuel/bridging treated optimistically. */
  readonly objectiveRaidThreats?: readonly { readonly pieceId: PieceId; readonly hexId: HexId; readonly strength: number }[];
'''+s[b:];p.write_text(s)
p=Path('tests/ai/vp-threat.test.ts');s=p.read_text();a=s.index('    const attacker = projection.stacks');b=s.index('\n    expect(analyze(blocked',a);s=s[:a]+'''    const blockedState = { ...state, configuration: { ...state.configuration, roadMovementCosts: [], hexsideMovementCosts: [],
      terrainMovementCosts: state.configuration.terrainMovementCosts.map(c => ({ ...c,
        costs: { leg: { kind: 'ALL' as const }, truck: { kind: 'ALL' as const }, tracked: { kind: 'ALL' as const } } })) } };
    const blocked = { ...projection, objectiveRaidThreats: ruleEngine.projectForViewer(blockedState, stored.actor).objectiveRaidThreats };
'''+s[b:];p.write_text(s)
p=Path('src/ai/policies/heuristic.ts');s=p.read_text().replace("'54' : `54+", "'55' : `55+");p.write_text(s)
