import { describe, expect, it } from 'vitest';
import {
  DEFAULT_NEW_GAME_REQUEST,
  arrivingReinforcements,
  createGameplayEngine,
  createMemoryGameplayPorts,
  createNewGameOrchestrator,
  hexDistanceBetween,
  parseGameStateJson,
  reinforcementHexes,
  ruleEngine,
  type GameState,
  type PieceState,
} from '../../src/index.js';
import { definitionOf, isHq } from '../../src/rules/pieces.js';

/**
 * Reinforcement entry Hexes are found once per state (PERF-5), and Pax/Eq Hexes near an HQ (13.5a) by stepping
 * out from each HQ. This checks them against the earlier per-Hex distance scan, with HQs and enemy units moved
 * so that HQ neighbourhoods overlap, run off the map edge and contain enemy units.
 */
const opening = async (seed: number): Promise<GameState> => {
  const created = await createNewGameOrchestrator(createGameplayEngine(createMemoryGameplayPorts())).create({
    ...DEFAULT_NEW_GAME_REQUEST, map: { ...DEFAULT_NEW_GAME_REQUEST.map, width: 20, height: 16 },
    seeds: { map: seed, oob: seed + 1, deployment: seed + 2, rules: seed + 3 },
  });
  if (!created.ok) throw new Error(created.error.map(({ code }) => code).join(','));
  const parsed = parseGameStateJson(JSON.parse(created.value.session.serializeSave()).currentSnapshot);
  if (!parsed.ok) throw new Error('snapshot');
  // Pax and Eq first arrive in a Reinforcement Phase from Game Turn 2 on (13.6): end steps until one has them waiting.
  let state = parsed.value;
  for (let guard = 0; guard < 400; guard += 1) {
    const actor = state.pendingDecision?.ownerId ?? state.sequence.actingPlayerId;
    if (state.sequence.phase === 'REINFORCEMENT' && arrivingReinforcements(state, actor).some((piece) => definitionOf(state, piece)?.family === 'REPLACEMENT')) return state;
    const kind = state.pendingDecision ? 'RESPOND_DECISION' as const : 'ADVANCE_SEQUENCE' as const;
    const [action] = ruleEngine.getActionCandidates(state, { actorId: actor, kind, pieceId: null, budget: 1 }).actions;
    if (!action) throw new Error(`no ${kind} in ${state.sequence.phase}`);
    const next = ruleEngine.applyAction(state, action);
    if (!next.ok) throw new Error(`${kind} rejected`);
    state = next.state;
  }
  throw new Error('no Reinforcement Phase with Pax or Eq waiting');
};

/** The earlier rule: an entry Hex, or any map Hex within 2 of a friendly HQ that holds no enemy unit. */
const referenceReplacementHexes = (state: GameState, piece: PieceState): string[] => {
  const hqHexes = state.pieceState.pieces.filter((candidate) => candidate.ownerId === piece.ownerId && candidate.location.kind === 'ON_MAP' && isHq(state, candidate))
    .map((hq) => (hq.location as { hexId: string }).hexId);
  const enemyAt = (hexId: string) => state.pieceState.pieces.some((other) => other.ownerId !== piece.ownerId && other.location.kind === 'ON_MAP' && other.location.hexId === hexId);
  const nearHq = state.scenario.mapDefinition.hexes.map(({ id }) => id)
    .filter((hexId) => hqHexes.some((hq) => hexDistanceBetween(hq as never, hexId) <= 2) && !enemyAt(hexId));
  return [...new Set([...reinforcementHexes(state, piece.ownerId, null), ...nearHq])].sort();
};

/** HQs moved next to each other and to the map edge; enemy units dropped beside them. */
const crowded = (state: GameState, owner: string, step: number): GameState => {
  const hexes = state.scenario.mapDefinition.hexes;
  let hq = 0;
  let enemy = 0;
  return {
    ...state,
    pieceState: {
      ...state.pieceState,
      pieces: state.pieceState.pieces.map((piece) => {
        if (piece.location.kind !== 'ON_MAP') return piece;
        if (piece.ownerId === owner && isHq(state, piece)) return { ...piece, location: { kind: 'ON_MAP', hexId: hexes[(hq++ * step) % hexes.length]!.id } };
        if (piece.ownerId !== owner && enemy < 6) return { ...piece, location: { kind: 'ON_MAP', hexId: hexes[(enemy++ * step + 1) % hexes.length]!.id } };
        return piece;
      }),
    },
  };
};

describe('reinforcement entry Hexes found once per state (PERF-5)', () => {
  it('match the per-Hex distance scan for Pax and Eq, and placement candidates follow them', async () => {
    let checked = 0;
    for (const seed of [101, 202]) {
      const base = await opening(seed);
      const actor = base.sequence.actingPlayerId;
      for (const state of [base, crowded(base, actor, 1), crowded(base, actor, 3), crowded(base, actor, 17)]) {
        const arriving = arrivingReinforcements(state, actor);
        for (const piece of arriving) {
          if (definitionOf(state, piece)?.family !== 'REPLACEMENT') continue;
          expect(reinforcementHexes(state, actor, piece.id), `${piece.id}`).toEqual(referenceReplacementHexes(state, piece));
          checked += 1;
        }
        const candidates = ruleEngine.getActionCandidates(state, { actorId: actor, kind: 'PLACE_REINFORCEMENT', pieceId: null, budget: 100_000 }).actions;
        const expected = arriving.flatMap((piece) => reinforcementHexes(state, actor, piece.id).map((hexId) => `${piece.id}@${hexId}`)).sort();
        expect(candidates.map((action) => (action.kind === 'PLACE_REINFORCEMENT' ? `${action.pieceId}@${action.hexId}` : '')).sort()).toEqual(expected);
      }
    }
    expect(checked).toBeGreaterThan(0);
  }, 120_000);
});
