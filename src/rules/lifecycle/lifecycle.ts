import { parseDefinitionId, stableSort, type PlayerId } from '../../core/index.js';
import { setHexControl } from '../../domain/map/index.js';
import { upsertPieceState, type PieceState } from '../../domain/piece/index.js';
import type {
  GameAction,
  GameState,
  RuleEvent,
  RuleViolation,
  TurnSequenceState,
  VictoryState,
} from '../kernel/model.js';
import { nextStackOrderAtHex, queryStacking } from '../stacking/stacking.js';
import { violation } from '../validation/violation.js';

const priorModeStatus = (() => {
  const parsed = parseDefinitionId('status:mode-before-involuntary');
  if (!parsed.ok) throw new Error('Prior-mode status ID is invalid.');
  return parsed.value;
})();

const restoredMode = (piece: PieceState): PieceState['mode'] => {
  const status = piece.statuses.find(({ statusDefinitionId }) => statusDefinitionId === priorModeStatus);
  return status?.value.kind === 'TEXT' && ['COMBAT', 'MOVE'].includes(status.value.value)
    ? status.value.value as 'COMBAT' | 'MOVE'
    : 'MOVE';
};

export const calculateVictory = (state: GameState): VictoryState => {
  const scores = state.scenario.players.map(({ id }) => ({
    playerId: id,
    points: state.configuration.objectives.reduce((total, objective) => {
      const controller = state.mapState.hexControl.find(({ hexId }) => hexId === objective.hexId)
        ?.controllerId ?? null;
      return total + (controller === id ? objective.points : 0);
    }, 0),
  }));
  const ordered = stableSort(scores, (left, right) => right.points - left.points
    || String(left.playerId).localeCompare(String(right.playerId)));
  const winnerId = ordered.length > 0 && ordered[0]!.points > (ordered[1]?.points ?? -1)
    ? ordered[0]!.playerId
    : null;
  return { scores, winnerId, reason: null };
};

const cleanupPlayer = (
  state: GameState,
  playerId: PlayerId,
): { readonly state: GameState; readonly event: RuleEvent } => {
  let pieceState = state.pieceState;
  for (const piece of state.pieceState.pieces.filter(({ ownerId }) => ownerId === playerId)) {
    if (piece.mode === 'DG' || piece.mode === 'EXPLOITATION') {
      pieceState = upsertPieceState(pieceState, {
        ...piece,
        mode: restoredMode(piece),
        statuses: piece.statuses.filter(({ statusDefinitionId }) => statusDefinitionId !== priorModeStatus),
      });
    }
  }
  return {
    state: {
      ...state,
      pieceState,
      usage: state.usage.filter((usage) => {
        const piece = pieceState.pieces.find(({ id }) => id === usage.pieceId);
        return piece?.ownerId !== playerId;
      }),
      victory: calculateVictory({ ...state, pieceState }),
    },
    event: { kind: 'CLEANUP_COMPLETED', sequence: 1, playerId },
  };
};

export const applySequenceLifecycle = (
  state: GameState,
  to: TurnSequenceState,
): { readonly state: GameState; readonly events: readonly RuleEvent[] } => {
  let next = { ...state, sequence: to };
  const events: RuleEvent[] = [{ kind: 'SEQUENCE_ADVANCED', sequence: 0, from: state.sequence, to }];
  if (state.sequence.phase === 'CLEAN_UP') {
    const cleaned = cleanupPlayer(next, state.sequence.phasingPlayerId);
    next = cleaned.state;
    events.push(cleaned.event);
  }
  if (to.phase === 'COMPLETE') {
    const scored = calculateVictory(next);
    const victory: VictoryState = { ...scored, reason: 'TURN_LIMIT' };
    next = { ...next, victory };
    events.push({
      kind: 'VICTORY_RECORDED', sequence: events.length,
      winnerId: victory.winnerId, reason: 'TURN_LIMIT',
    });
  }
  return { state: next, events };
};

export const validateReinforcementPlacement = (
  state: GameState,
  action: Extract<GameAction, { readonly kind: 'PLACE_REINFORCEMENT' }>,
): readonly RuleViolation[] => {
  const issues: RuleViolation[] = [];
  const piece = state.pieceState.pieces.find(({ id }) => id === action.pieceId);
  const player = state.scenario.players.find(({ id }) => id === action.actorId);
  if (state.sequence.phase !== 'REINFORCEMENT' || action.actorId !== state.sequence.actingPlayerId) {
    issues.push(violation('INVALID_REINFORCEMENT_PHASE', ['sequence'], 'Placement requires the friendly Reinforcement Phase.', '13.6'));
  }
  if (!piece || piece.ownerId !== action.actorId) {
    issues.push(violation('INVALID_REINFORCEMENT_PIECE', ['pieceId'], 'Reinforcement must exist and be owned.', '13.6'));
  } else if (!['OFF_MAP_BOX', 'HOLDING_AREA', 'POOL', 'TURN_TRACK'].includes(piece.location.kind)) {
    issues.push(violation('PIECE_NOT_AWAITING_ENTRY', ['pieceId'], 'Piece is not in an eligible reinforcement location.', '13.6'));
  }
  const entry = state.scenario.entries.find(({ hexId, sideDefinitionId }) => hexId === action.hexId
    && (sideDefinitionId === null || sideDefinitionId === player?.sideDefinitionId));
  if (!entry) issues.push(violation('INVALID_REINFORCEMENT_ENTRY', ['hexId'], 'Hex is not an Entry for actor Side.', '13.6'));
  if (piece && !queryStacking(state, action.hexId, piece.id).allowed) {
    issues.push(violation('STACKING_LIMIT_EXCEEDED', ['hexId'], 'Entry placement exceeds stacking.', '4.8'));
  }
  return issues;
};

export const placeReinforcement = (
  state: GameState,
  action: Extract<GameAction, { readonly kind: 'PLACE_REINFORCEMENT' }>,
): { readonly state: GameState; readonly events: readonly RuleEvent[] } => {
  const piece = state.pieceState.pieces.find(({ id }) => id === action.pieceId)!;
  return {
    state: {
      ...state,
      pieceState: upsertPieceState(state.pieceState, {
        ...piece,
        location: { kind: 'ON_MAP', hexId: action.hexId },
        stackOrder: nextStackOrderAtHex(state.pieceState, action.hexId, piece.id),
      }),
      mapState: setHexControl(state.mapState, action.hexId, action.actorId),
    },
    events: [{
      kind: 'REINFORCEMENT_PLACED', sequence: 0,
      pieceId: action.pieceId, hexId: action.hexId,
    }],
  };
};
