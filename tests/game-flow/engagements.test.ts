import { describe, expect, it } from 'vitest';
import {
  GENERATED_HEDGEHOG_LEVELS,
  hedgehogAt,
  hedgehogLevel,
  isHedgehog,
  DEFAULT_NEW_GAME_REQUEST,
  GENERATED_KEY_POINT_GARRISON_SHARE,
  OFF_MAP_AIR_MIX,
  isActiveAircraft,
  isOffMapAirfield,
  atOffMapAirfield,
  calculateVictory,
  parseGameStateJson,
  serializeGameState,
  ATTACKER_FORCE_RATIO,
  createInitialGameState,
  hexDistanceBetween,
  prepareNewGame,
  ruleEngine,
  validateNewGameRequest,
  mapSeaPlacementOf,
  type Engagement,
  type GameState,
  type GeneratedScenarioPackage,
  type NewGameRequest,
} from '../../src/index.js';

/** Engagements 0.5.0 (docs/roadmap/13-engagement-scenarios-wbs.md): a closer meeting engagement and attacks. */

const requestFor = (engagement: Engagement | undefined, index: number): NewGameRequest => {
  const base = 0x0a1b0000 + index * 97;
  return {
    ...DEFAULT_NEW_GAME_REQUEST,
    ...(engagement === undefined ? {} : { engagement }),
    seeds: { map: base + 1, oob: base + 2, deployment: base + 3, rules: base + 4 },
  };
};

const started = (request: NewGameRequest): { readonly prepared: GeneratedScenarioPackage; readonly state: GameState } => {
  const prepared = prepareNewGame(request);
  if (!prepared.ok) throw new Error(JSON.stringify(prepared.error));
  const created = createInitialGameState(prepared.value.scenario, prepared.value.configuration, 1);
  if (!created.ok) throw new Error('generated game did not start');
  return { prepared: prepared.value, state: created.value };
};

/** Ground units with steps on the map, objective garrisons aside (they stand where the objectives are). */
const army = ({ prepared, state }: ReturnType<typeof started>, side: 'allied' | 'axis') => {
  const garrisons = new Set(prepared.generatedOob.sides.map(({ garrisonDefinitionId }) => garrisonDefinitionId));
  const families = new Map(state.scenario.pieceCatalog.definitions.map(({ id, family }) => [id, family]));
  return state.pieceState.pieces.filter((piece) => String(piece.ownerId) === `player:${side}` && piece.location.kind === 'ON_MAP'
    && piece.remainingSteps !== null && families.get(piece.definitionId) === 'GROUND' && !garrisons.has(piece.definitionId));
};

const hexOf = (piece: GameState['pieceState']['pieces'][number]) => piece.location.kind === 'ON_MAP' ? piece.location.hexId : null!;

const gaps = (game: ReturnType<typeof started>): number[] => {
  const allied = army(game, 'allied');
  const axis = army(game, 'axis');
  const nearest = (piece: (typeof allied)[number], others: typeof allied) => Math.min(...others.map((other) => hexDistanceBetween(hexOf(piece), hexOf(other))));
  return [...allied.map((piece) => nearest(piece, axis)), ...axis.map((piece) => nearest(piece, allied))].sort((left, right) => left - right);
};

/** Share of the side's units standing where the side traces supply (per-unit HQ limits are left to the seed scan). */
const tracedShare = (game: ReturnType<typeof started>, side: 'allied' | 'axis'): number => {
  const units = army(game, side);
  const covered = new Set(ruleEngine.queryTraceCoverage(game.state, units[0]!.ownerId, null).value?.hexIds ?? []);
  return units.filter((piece) => covered.has(hexOf(piece))).length / units.length;
};

const SEEDS = [0, 1, 2, 3, 4];

describe('meeting engagement (SCN-R1, SCN-R3)', () => {
  it('starts the armies about ten hexes apart, none adjacent, every unit in trace supply', () => {
    for (const index of SEEDS) {
      const game = started(requestFor(undefined, index));
      const distances = gaps(game);
      expect(distances[0]).toBeGreaterThanOrEqual(3);
      // Before 0.5.0 the median was 23-27 hexes for these seeds.
      expect(distances[Math.floor(distances.length / 2)]).toBeLessThanOrEqual(12);
      expect(tracedShare(game, 'allied')).toBeGreaterThanOrEqual(0.95);
      expect(tracedShare(game, 'axis')).toBeGreaterThanOrEqual(0.95);
      expect(game.state.scenario.turnStart.firstPlayerId).toBe('player:allied');
    }
  }, 120_000);

  it('is what a request without an engagement means, under the same Scenario ID', () => {
    const plain = prepareNewGame(requestFor(undefined, 0));
    const meeting = prepareNewGame(requestFor('MEETING', 0));
    if (!plain.ok || !meeting.ok) throw new Error('meeting engagement did not prepare');
    expect(meeting.value.scenario).toEqual(plain.value.scenario);
    expect(String(plain.value.scenario.id)).not.toContain('attacks');
    expect(plain.value.summary.engagement).toBe('MEETING');
  });
});

describe('attack (SCN-R3, SCN-R4)', () => {
  for (const [engagement, attacker, defender] of [['ALLIED_ATTACKS', 'allied', 'axis'], ['AXIS_ATTACKS', 'axis', 'allied']] as const) {
    it(`${engagement}: the defender holds and garrisons every objective, its line in Combat Mode; the attacker moves first`, () => {
      for (const index of SEEDS.slice(0, 3)) {
        const game = started(requestFor(engagement, index));
        const { prepared, state } = game;
        const meeting = prepareNewGame(requestFor('MEETING', index));
        if (!meeting.ok) throw new Error('meeting engagement did not prepare');
        const controller = (hexId: string) => state.mapState.hexControl.find((entry) => entry.hexId === hexId)?.controllerId;
        const garrisons = new Set(prepared.generatedOob.sides.map(({ garrisonDefinitionId }) => garrisonDefinitionId));

        expect(prepared.deployment.attacker).toBe(attacker.toUpperCase());
        expect(state.scenario.turnStart.firstPlayerId).toBe(`player:${attacker}`);
        expect(String(state.scenario.id)).toContain(engagement.toLowerCase().replace('_', '-'));
        for (const { hexId } of prepared.deployment.objectives) {
          expect(controller(hexId)).toBe(`player:${defender}`);
          expect(state.pieceState.pieces.some((piece) => garrisons.has(piece.definitionId) && hexOf(piece) === hexId
            && String(piece.ownerId) === `player:${defender}`)).toBe(true);
        }
        const points = (objectives: readonly { readonly points: number }[]) => objectives.reduce((total, { points: value }) => total + value, 0);
        expect(points(prepared.deployment.objectives)).toBe(points(meeting.value.deployment.objectives));

        const line = army(game, defender).filter((piece) => state.scenario.pieceCatalog.definitions
          .find(({ id }) => id === piece.definitionId)?.faces.some(({ id }) => String(id) === 'combat'));
        expect(line.filter((piece) => piece.mode === 'COMBAT').length).toBeGreaterThanOrEqual(line.length / 2);
        // The attacker's front units stand in Combat Mode too (user, 2026-10-09); the rest of its army is in Move Mode.
        const attackerModes = new Set(army(game, attacker).map(({ mode }) => mode));
        expect(attackerModes.has('COMBAT')).toBe(true);
        expect(attackerModes.has('MOVE')).toBe(true);

        // The attacker fields ATTACKER_FORCE_RATIO times the divisions and about that much combat value; the defender holds
        // most of the land.
        const formations = (side: string) => prepared.generatedOob.sides.find((entry) => entry.side === side.toUpperCase())!.formations.length;
        expect(formations(attacker)).toBe(Math.round(prepared.request.oob.divisionsPerSide * ATTACKER_FORCE_RATIO));
        expect(formations(defender)).toBe(prepared.request.oob.divisionsPerSide);
        const value = prepared.generatedOob.metrics.combatValueBySide;
        expect(value[attacker.toUpperCase() as 'ALLIED'] / value[defender.toUpperCase() as 'AXIS']).toBeGreaterThanOrEqual(ATTACKER_FORCE_RATIO * 0.9);
        const zones = prepared.deployment.metrics.zoneHexes!;
        expect(zones[defender] / (zones.allied + zones.axis)).toBeGreaterThanOrEqual(0.65);

        expect(gaps(game)[0]).toBeGreaterThanOrEqual(3);
        expect(tracedShare(game, 'allied')).toBeGreaterThanOrEqual(0.95);
        expect(tracedShare(game, 'axis')).toBeGreaterThanOrEqual(0.95);
      }
    }, 120_000);
  }

  it('rejects an unknown engagement', () => {
    const failures = validateNewGameRequest({ ...DEFAULT_NEW_GAME_REQUEST, engagement: 'AMBUSH' as never });
    expect(failures.map(({ code }) => code)).toContain('UNKNOWN_ENGAGEMENT');
  });
});

describe('attack victory (SCN-R4)', () => {
  const { prepared, state } = started(requestFor('AXIS_ATTACKS', 0));
  const objectives = prepared.deployment.objectives;
  const total = objectives.reduce((sum, { points }) => sum + points, 0);
  /** The state with the attacker holding the given objectives and the defender the rest. */
  const holding = (taken: readonly { readonly hexId: string }[]): GameState => ({
    ...state,
    mapState: { ...state.mapState, hexControl: state.mapState.hexControl.map((entry) => objectives.some(({ hexId }) => hexId === entry.hexId)
      ? { ...entry, controllerId: (taken.some(({ hexId }) => hexId === entry.hexId) ? 'player:axis' : 'player:allied') as never } : entry) },
  });
  /** The fewest objectives, largest first, whose VP reach `points`. */
  const worth = (points: number) => {
    const chosen: (typeof objectives)[number][] = [];
    for (const objective of [...objectives].sort((left, right) => right.points - left.points)) {
      if (chosen.reduce((sum, { points: value }) => sum + value, 0) >= points) break;
      chosen.push(objective);
    }
    return chosen;
  };

  it('needs half the VP, rounded up, and has no draw', () => {
    expect(state.configuration.attackVictory).toEqual({ attackerId: 'player:axis', attackerPoints: Math.ceil(total / 2) });
    expect(calculateVictory(state).winnerId).toBe('player:allied');
    const half = worth(Math.ceil(total / 2));
    expect(calculateVictory(holding(half)).winnerId).toBe('player:axis');
    expect(calculateVictory(holding(half.slice(1))).winnerId).toBe('player:allied');
  });

  it('survives a save and keeps a meeting engagement on the most-VP rule', () => {
    const serialized = serializeGameState(state);
    if (!serialized.ok) throw new Error('state did not serialize');
    const parsed = parseGameStateJson(serialized.value);
    expect(parsed.ok && parsed.value.configuration.attackVictory).toEqual(state.configuration.attackVictory);
    expect(started(requestFor('MEETING', 0)).state.configuration.attackVictory).toBeUndefined();
  });
});

describe('off-map air (AIR-OM1)', () => {
  it('gives only an attacker an off-map airfield with its Fighters and Tactical Bombers, all Active, in an off-map box', () => {
    for (const engagement of ['MEETING', 'ALLIED_ATTACKS', 'AXIS_ATTACKS'] as const) {
      const { prepared, state } = started(requestFor(engagement, 1));
      const fields = state.pieceState.pieces.filter((piece) => isOffMapAirfield(state, piece));
      const attacker = prepared.deployment.attacker;
      if (attacker === null) { expect(fields).toEqual([]); continue; }
      expect(fields.map(({ ownerId }) => String(ownerId))).toEqual([`player:${attacker.toLowerCase()}`]);
      const field = fields[0]!;
      // Off the map: in its own declared box, not on any hex.
      expect(field.location.kind).toBe('OFF_MAP_BOX');
      expect(state.scenario.boxes.some(({ id }) => field.location.kind === 'OFF_MAP_BOX' && id === field.location.boxId)).toBe(true);
      const planes = state.pieceState.pieces.filter((piece) => atOffMapAirfield(state, piece));
      const mix = OFF_MAP_AIR_MIX[prepared.request.oob.scale];
      expect(planes).toHaveLength(mix.fighters + mix.bombers);
      expect(planes.every((plane) => plane.ownerId === field.ownerId && isActiveAircraft(plane))).toBe(true);
    }
  });
});

describe('garrisons in an attack (user, 2026-10-07)', () => {
  it('gives the attacker none and the defender one per objective plus single garrisons on key points', () => {
    for (const index of [0, 1, 2]) {
      const { prepared, state } = started(requestFor('AXIS_ATTACKS', index));
      const garrisons = new Set(prepared.generatedOob.sides.map(({ garrisonDefinitionId }) => garrisonDefinitionId));
      const placed = state.pieceState.pieces.filter((piece) => garrisons.has(piece.definitionId));
      expect(placed.filter(({ ownerId }) => String(ownerId) === 'player:axis')).toEqual([]);
      const hexes = placed.map(hexOf);
      // Never two garrisons in one hex.
      expect(new Set(hexes).size).toBe(hexes.length);
      const objectiveHexes = new Set(prepared.deployment.objectives.map(({ hexId }) => String(hexId)));
      const keyPoints = placed.filter(({ id }) => String(id).includes(':key-point-'));
      expect(keyPoints.length).toBeGreaterThan(0);
      expect(keyPoints.length).toBeLessThanOrEqual(Math.ceil(prepared.deployment.objectives.length * GENERATED_KEY_POINT_GARRISON_SHARE));
      expect(keyPoints.every((piece) => !objectiveHexes.has(String(hexOf(piece))))).toBe(true);
      expect(placed.length).toBe(prepared.deployment.objectives.length + keyPoints.length);
    }
  });
});

describe('hedgehogs in an attack (16.0)', () => {
  it('digs in every defender garrison: Level 2 on objectives, Level 1 on key points; the attacker and a meeting engagement have none', () => {
    for (const engagement of ['AXIS_ATTACKS', 'ALLIED_ATTACKS'] as const) {
      const { prepared, state } = started(requestFor(engagement, 0));
      const defender = engagement === 'AXIS_ATTACKS' ? 'player:allied' : 'player:axis';
      const garrisons = new Set(prepared.generatedOob.sides.map(({ garrisonDefinitionId }) => garrisonDefinitionId));
      const hogs = state.pieceState.pieces.filter((piece) => piece.location.kind === 'ON_MAP' && isHedgehog(state, piece));
      expect(hogs.every(({ ownerId }) => String(ownerId) === defender)).toBe(true);
      const garrisoned = state.pieceState.pieces.filter((piece) => garrisons.has(piece.definitionId) && piece.location.kind === 'ON_MAP');
      expect(hogs.length).toBe(garrisoned.length);
      const objectiveHexes = new Set(prepared.deployment.objectives.map(({ hexId }) => String(hexId)));
      for (const garrison of garrisoned) {
        const hog = hedgehogAt(state, hexOf(garrison) as never)!;
        expect(hedgehogLevel(hog)).toBe(objectiveHexes.has(String(hexOf(garrison))) ? GENERATED_HEDGEHOG_LEVELS.OBJECTIVE : GENERATED_HEDGEHOG_LEVELS.KEY_POINT);
      }
    }
    const meeting = started(requestFor('MEETING', 0)).state;
    expect(meeting.pieceState.pieces.some((piece) => isHedgehog(meeting, piece))).toBe(false);
  });
});

describe('New Game sea', () => {
  it.each([
    ['NONE', 'ALLIED_ATTACKS', 'NONE'], ['FLANK', 'MEETING', 'NORTH'], ['FLANK', 'AXIS_ATTACKS', 'NORTH'],
    ['ATTACKER', 'ALLIED_ATTACKS', 'WEST'], ['ATTACKER', 'AXIS_ATTACKS', 'EAST'], ['ATTACKER', 'MEETING', 'WEST'],
  ] as const)('puts a %s sea in a %s on the %s map edge', (sea, engagement, edge) => {
    const request: NewGameRequest = { ...requestFor(engagement, 40), map: { ...DEFAULT_NEW_GAME_REQUEST.map, sea } };
    expect(mapSeaPlacementOf(request)).toBe(edge);
    const prepared = prepareNewGame(request);
    expect(prepared.ok).toBe(true);
    if (!prepared.ok) return;
    expect(prepared.value.generatedMap.options.sea).toBe(edge);
    expect(String(prepared.value.scenario.id).endsWith(sea === 'NONE' ? '' : `:sea-${sea.toLowerCase()}`)).toBe(true);
  });

  it('keeps the style\'s own sea when the request names none, and rejects an unknown sea', () => {
    expect(mapSeaPlacementOf(DEFAULT_NEW_GAME_REQUEST)).toBe('NONE');
    expect(mapSeaPlacementOf({ ...DEFAULT_NEW_GAME_REQUEST, map: { ...DEFAULT_NEW_GAME_REQUEST.map, style: 'MEDITERRANEAN_COAST' } })).toBe('WEST');
    expect(validateNewGameRequest({ ...DEFAULT_NEW_GAME_REQUEST, map: { ...DEFAULT_NEW_GAME_REQUEST.map, sea: 'SOUTH' as never } })
      .map(({ code }) => code)).toEqual(['UNKNOWN_SEA']);
  });
});
