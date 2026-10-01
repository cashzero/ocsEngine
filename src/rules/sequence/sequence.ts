import type { PlayerId } from '../../core/index.js';
import type { GameState, RulePhase, RuleSegment, TurnSequenceState } from '../kernel/model.js';

/** Segments of each phase in outline order (2.2). */
export const PHASE_SEGMENTS: Readonly<Partial<Record<RulePhase, readonly RuleSegment[]>>> = {
  // 2.2: the Breakout Segment opens the Movement Phase (12.8e).
  MOVEMENT: ['BREAKOUT', 'MOVEMENT', 'BARRAGE'],
  REACTION: ['MOVEMENT', 'BARRAGE'],
  COMBAT: ['BARRAGE', 'COMBAT'],
  EXPLOITATION: ['MOVEMENT', 'BARRAGE', 'COMBAT'],
};

const nextPlayerPhase: Readonly<Record<string, RulePhase>> = {
  AIRCRAFT_REFIT: 'REINFORCEMENT',
  REINFORCEMENT: 'MOVEMENT',
  MOVEMENT: 'SUPPLY',
  SUPPLY: 'REACTION',
  REACTION: 'COMBAT',
  COMBAT: 'EXPLOITATION',
  EXPLOITATION: 'CLEAN_UP',
};

const firstSegment = (phase: RulePhase): RuleSegment => PHASE_SEGMENTS[phase]?.[0] ?? 'NONE';

const other = (players: readonly PlayerId[], playerId: PlayerId): PlayerId =>
  players.find((id) => id !== playerId) ?? playerId;

export const createInitialSequence = (
  _players: readonly PlayerId[],
  firstPlayerId: PlayerId,
): TurnSequenceState => ({
  gameTurn: 1,
  playerTurnIndex: 0,
  phase: 'WEATHER',
  segment: 'NONE',
  firstPlayerId,
  phasingPlayerId: firstPlayerId,
  actingPlayerId: firstPlayerId,
});

/** The next step of the Sequence of Play (2.2). First Player Determination is applied by lifecycle. */
export const nextSequence = (state: GameState): TurnSequenceState => {
  const current = state.sequence;
  const players = state.scenario.players.map(({ id }) => id);
  if (current.phase === 'COMPLETE') return current;
  if (current.phase === 'WEATHER') return { ...current, phase: 'FIRST_PLAYER', segment: 'NONE' };
  if (current.phase === 'FIRST_PLAYER') {
    return {
      ...current, phase: 'AIRCRAFT_REFIT', segment: 'NONE', playerTurnIndex: 0,
      phasingPlayerId: current.firstPlayerId, actingPlayerId: current.firstPlayerId,
    };
  }
  const segments = PHASE_SEGMENTS[current.phase];
  if (segments) {
    const index = segments.indexOf(current.segment);
    if (index >= 0 && index < segments.length - 1) return { ...current, segment: segments[index + 1]! };
  }
  const following = nextPlayerPhase[current.phase];
  if (following) {
    // 7.0: the non-phasing player acts in the Reaction Phase.
    const acting = following === 'REACTION' ? other(players, current.phasingPlayerId) : current.phasingPlayerId;
    return { ...current, phase: following, segment: firstSegment(following), actingPlayerId: acting };
  }
  if (current.phase === 'CLEAN_UP') {
    if (current.playerTurnIndex === 0) {
      const second = other(players, current.phasingPlayerId);
      return { ...current, playerTurnIndex: 1, phase: 'AIRCRAFT_REFIT', segment: 'NONE', phasingPlayerId: second, actingPlayerId: second };
    }
    return { ...current, phase: 'TURN_END', segment: 'NONE', actingPlayerId: current.phasingPlayerId };
  }
  if (current.phase === 'TURN_END') {
    if (current.gameTurn >= state.configuration.turnLimit) return { ...current, phase: 'COMPLETE', segment: 'NONE' };
    return {
      gameTurn: current.gameTurn + 1,
      playerTurnIndex: 0,
      phase: 'WEATHER',
      segment: 'NONE',
      firstPlayerId: current.firstPlayerId,
      phasingPlayerId: current.firstPlayerId,
      actingPlayerId: current.firstPlayerId,
    };
  }
  return current;
};
