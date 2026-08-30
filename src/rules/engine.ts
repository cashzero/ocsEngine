import { parseRuleActionId, type RuleActionId } from './kernel/ids.js';
import type { GameAction, GameState } from './kernel/model.js';
import { applyGameAction, validateGameAction } from './kernel/reducer.js';
import { queryReachableHexes } from './movement/movement.js';
import { querySupply } from './supply/supply.js';
import { projectRuleState } from './query/projection.js';
import type {
  ActionFamily,
  CandidateRequest,
  CandidateResult,
  RuleEngine,
  RuleExplanation,
} from './query/model.js';

const actionId = (value: string): RuleActionId => {
  const parsed = parseRuleActionId(value);
  if (!parsed.ok) throw new Error('Generated Rule Action ID is invalid.');
  return parsed.value;
};

const base = (state: GameState, actorId: GameAction['actorId'], scope: string) => ({
  actionId: actionId(`candidate:${scope}:${state.revision}`),
  actorId,
  expectedRevision: state.revision,
});

const candidates = (state: GameState, request: CandidateRequest): readonly GameAction[] => {
  const actions: GameAction[] = [];
  switch (request.kind) {
    case 'ADVANCE_SEQUENCE':
      actions.push({ ...base(state, request.actorId, 'advance'), kind: 'ADVANCE_SEQUENCE' });
      break;
    case 'CHANGE_MODE':
      for (const piece of state.pieceState.pieces.filter(({ ownerId }) => ownerId === request.actorId)) {
        for (const mode of ['COMBAT', 'MOVE', 'RESERVE', 'STRAT'] as const) {
          actions.push({ ...base(state, request.actorId, `mode:${piece.id}:${mode}`), kind: 'CHANGE_MODE', pieceId: piece.id, mode });
        }
      }
      break;
    case 'RELEASE_RESERVE':
      for (const piece of state.pieceState.pieces.filter(({ ownerId, mode }) => ownerId === request.actorId && mode === 'RESERVE')) {
        actions.push({ ...base(state, request.actorId, `release:${piece.id}`), kind: 'RELEASE_RESERVE', pieceId: piece.id });
      }
      break;
    case 'MOVE_PIECE':
      for (const pieceId of request.pieceId !== null
        ? [request.pieceId]
        : state.pieceState.pieces.filter(({ ownerId }) => ownerId === request.actorId).map(({ id }) => id)) {
        const reachable = queryReachableHexes(state, request.actorId, pieceId);
        for (const candidate of reachable.value ?? []) {
          actions.push({ ...base(state, request.actorId, `move:${pieceId}:${candidate.hexId}`), kind: 'MOVE_PIECE', pieceId, path: candidate.path });
        }
      }
      break;
    case 'CHECK_SUPPLY':
      for (const piece of state.pieceState.pieces.filter(({ ownerId, mode }) => ownerId === request.actorId && mode !== null)) {
        const supply = querySupply(state, request.actorId, piece.id, 'TRACE');
        if (supply.value?.requiresPayment) {
          for (const source of supply.value.resourceSources) {
            actions.push({ ...base(state, request.actorId, `supply:${piece.id}:${source.pieceId}`), kind: 'CHECK_SUPPLY', pieceIds: [piece.id], sourcePieceId: source.pieceId });
          }
        } else {
          actions.push({ ...base(state, request.actorId, `supply:${piece.id}:trace`), kind: 'CHECK_SUPPLY', pieceIds: [piece.id], sourcePieceId: null });
        }
      }
      break;
    case 'DECLARE_COMBAT': {
      const combatKind = state.sequence.phase === 'COMBAT' ? 'REGULAR' as const : 'OVERRUN' as const;
      const friendly = state.pieceState.pieces.filter(({ ownerId, location }) =>
        ownerId === request.actorId && location.kind === 'ON_MAP');
      const enemies = state.pieceState.pieces.filter(({ ownerId, location }) =>
        ownerId !== request.actorId && location.kind === 'ON_MAP');
      for (const attacker of friendly) {
        for (const defender of enemies) {
          if (defender.location.kind !== 'ON_MAP') continue;
          actions.push({
            ...base(state, request.actorId, `combat:${combatKind}:${attacker.id}:${defender.id}`),
            kind: 'DECLARE_COMBAT', combatKind,
            attackerIds: [attacker.id], defenderIds: [defender.id],
            targetHexId: defender.location.hexId,
          });
        }
      }
      break;
    }
    case 'DECLARE_BARRAGE': {
      const friendly = state.pieceState.pieces.filter(({ ownerId }) => ownerId === request.actorId);
      const enemies = state.pieceState.pieces.filter(({ ownerId, location }) =>
        ownerId !== request.actorId && location.kind === 'ON_MAP');
      for (const firer of friendly) {
        for (const target of enemies) {
          if (target.location.kind !== 'ON_MAP') continue;
          actions.push({
            ...base(state, request.actorId, `barrage:${firer.id}:${target.id}`),
            kind: 'DECLARE_BARRAGE', firerIds: [firer.id], targetPieceIds: [target.id],
            targetHexId: target.location.hexId,
          });
        }
      }
      break;
    }
    case 'RESPOND_DECISION':
      if (state.pendingDecision?.ownerId === request.actorId) {
        for (const option of state.pendingDecision.options) {
          actions.push({
            ...base(state, request.actorId, `decision:${state.pendingDecision.id}:${option.id}`),
            kind: 'RESPOND_DECISION', decisionId: state.pendingDecision.id, choiceId: option.id,
          });
        }
      }
      break;
    case 'COMMIT_TRANSACTION':
      if (state.activeTransaction?.ownerId === request.actorId) actions.push({
        ...base(state, request.actorId, `commit:${state.activeTransaction.id}`),
        kind: 'COMMIT_TRANSACTION', transactionId: state.activeTransaction.id,
      });
      break;
    case 'CANCEL_TRANSACTION':
      if (state.activeTransaction?.ownerId === request.actorId) actions.push({
        ...base(state, request.actorId, `cancel:${state.activeTransaction.id}`),
        kind: 'CANCEL_TRANSACTION', transactionId: state.activeTransaction.id,
      });
      break;
    case 'PLACE_REINFORCEMENT':
      for (const piece of state.pieceState.pieces.filter(({ ownerId }) => ownerId === request.actorId)) {
        for (const entry of state.scenario.entries) {
          actions.push({
            ...base(state, request.actorId, `reinforcement:${piece.id}:${entry.hexId}`),
            kind: 'PLACE_REINFORCEMENT', pieceId: piece.id, hexId: entry.hexId,
          });
        }
      }
      break;
    default:
      break;
  }
  return actions
    .filter((action) => validateGameAction(state, action).allowed)
    .sort((left, right) => String(left.actionId).localeCompare(String(right.actionId)));
};

const ALL_ACTION_KINDS: readonly GameAction['kind'][] = [
  'ADVANCE_SEQUENCE', 'CHANGE_MODE', 'RELEASE_RESERVE', 'MOVE_PIECE', 'CHECK_SUPPLY',
  'DECLARE_COMBAT', 'DECLARE_BARRAGE', 'RESPOND_DECISION', 'COMMIT_TRANSACTION',
  'CANCEL_TRANSACTION', 'PLACE_REINFORCEMENT',
];

const engine: RuleEngine = {
  getActionFamilies: (state: GameState, actorId: GameAction['actorId']): readonly ActionFamily[] => ALL_ACTION_KINDS.map((kind) => ({
    kind,
    enabled: candidates(state, { actorId, kind, pieceId: null, budget: 1 }).length > 0,
  })),
  getActionCandidates: (state: GameState, request: CandidateRequest): CandidateResult => {
    const all = candidates(state, request);
    const budget = Math.max(0, Math.floor(request.budget));
    return {
      actions: all.slice(0, budget),
      truncated: all.length > budget,
      reasons: all.length > 0
        ? [{ code: 'CANDIDATES_AVAILABLE', allowed: true, message: `${all.length} candidate(s).`, rule: 'engine' }]
        : [{ code: 'NO_LEGAL_CANDIDATES', allowed: false, message: 'No legal candidates.', rule: 'engine' }],
    };
  },
  validateAction: validateGameAction,
  applyAction: applyGameAction,
  explain: (state: GameState, action: GameAction): RuleExplanation => {
    const validation = validateGameAction(state, action);
    return {
      allowed: validation.allowed,
      actionKind: action.kind,
      reasons: validation.allowed
        ? [{ code: 'ACTION_LEGAL', allowed: true, message: 'Action satisfies current preconditions.', rule: 'engine' }]
        : validation.violations.map((entry) => ({ code: entry.code, allowed: false, message: entry.message, rule: entry.rule })),
      facts: [
        { key: 'state.revision', value: state.revision, visibility: 'PUBLIC', ownerId: null },
        { key: 'sequence.phase', value: state.sequence.phase, visibility: 'PUBLIC', ownerId: null },
      ],
      citations: [...new Set(validation.violations.map(({ rule }) => rule))],
    };
  },
  projectForViewer: projectRuleState,
};

export const ruleEngine: RuleEngine = Object.freeze(engine);
