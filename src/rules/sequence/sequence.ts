import type { PlayerId } from '../../core/index.js';
import type { GameState, RulePhase, RuleSegment, TurnSequenceState } from '../kernel/model.js';

const segments: Readonly<Partial<Record<RulePhase, readonly RuleSegment[]>>> = {
  MOVEMENT: ['MOVEMENT', 'BARRAGE'],
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

const firstSegment = (phase: RulePhase): RuleSegment => segments[phase]?.[0] ?? 'NONE';

const actingPlayer = (
  phase: RulePhase,
  phasingPlayerId: PlayerId,
  players: readonly PlayerId[],
): PlayerId => phase === 'REACTION'
  ? players.find((id) => id !== phasingPlayerId) ?? phasingPlayerId
  : phasingPlayerId;

export const createInitialSequence = (
  players: readonly PlayerId[],
  firstPlayerId: PlayerId,
): TurnSequenceState => ({
  gameTurn: 1,
  playerTurnIndex: 0,
  phase: 'WEATHER',
  segment: 'NONE',
  phasingPlayerId: firstPlayerId,
  actingPlayerId: firstPlayerId,
});

export const nextSequence = (state: GameState): TurnSequenceState => {
  const current = state.sequence;
  const players = state.scenario.players.map(({ id }) => id);
  if (current.phase === 'COMPLETE') return current;
  if (current.phase === 'WEATHER') return { ...current, phase: 'FIRST_PLAYER' };
  if (current.phase === 'FIRST_PLAYER') {
    return { ...current, phase: 'AIRCRAFT_REFIT', segment: 'NONE' };
  }
  const phaseSegments = segments[current.phase];
  if (phaseSegments) {
    const index = phaseSegments.indexOf(current.segment);
    if (index >= 0 && index < phaseSegments.length - 1) {
      return { ...current, segment: phaseSegments[index + 1]! };
    }
  }
  const following = nextPlayerPhase[current.phase];
  if (following) {
    return {
      ...current,
      phase: following,
      segment: firstSegment(following),
      actingPlayerId: actingPlayer(following, current.phasingPlayerId, players),
    };
  }
  if (current.phase === 'CLEAN_UP') {
    if (current.playerTurnIndex === 0) {
      const second = players.find((id) => id !== current.phasingPlayerId) ?? current.phasingPlayerId;
      return {
        ...current,
        playerTurnIndex: 1,
        phase: 'AIRCRAFT_REFIT',
        segment: 'NONE',
        phasingPlayerId: second,
        actingPlayerId: second,
      };
    }
    return { ...current, phase: 'TURN_END', segment: 'NONE', actingPlayerId: current.phasingPlayerId };
  }
  if (current.phase === 'TURN_END') {
    if (current.gameTurn >= state.configuration.turnLimit) {
      return { ...current, phase: 'COMPLETE', segment: 'NONE' };
    }
    const first = state.scenario.turnStart.firstPlayerId;
    return {
      gameTurn: current.gameTurn + 1,
      playerTurnIndex: 0,
      phase: 'WEATHER',
      segment: 'NONE',
      phasingPlayerId: first,
      actingPlayerId: first,
    };
  }
  return current;
};
