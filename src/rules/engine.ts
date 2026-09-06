import {
  HEX_DIRECTIONS,
  formatHexId,
  hexDistance,
  neighbor,
  parseHexCoordinateId,
  type HexId,
} from '../core/index.js';
import { createPieceDefinitionCatalogIndex, type PieceState } from '../domain/piece/index.js';
import { parseRuleActionId, type RuleActionId } from './kernel/ids.js';
import type { GameAction, GameState } from './kernel/model.js';
import { applyGameAction, validateGameAction } from './kernel/reducer.js';
import { queryReachableHexes, queryMovementPath } from './movement/movement.js';
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

const onMapHex = (piece: PieceState): HexId | null =>
  piece.location.kind === 'ON_MAP' ? piece.location.hexId : null;

const adjacent = (left: string, right: string): boolean => {
  const from = parseHexCoordinateId(left);
  const to = parseHexCoordinateId(right);
  return from.ok && to.ok && hexDistance(from.value, to.value) === 1;
};

const barrageRange = (state: GameState, piece: PieceState): number => {
  if (piece.currentFaceId === null || piece.remainingSteps === null) return 0;
  const definition = createPieceDefinitionCatalogIndex(state.scenario.pieceCatalog).get(piece.definitionId);
  if (!definition?.capabilities.some(({ id }) => id === 'ARTILLERY')) return 0;
  return definition.faces.find(({ id }) => id === piece.currentFaceId)?.steps
    .find(({ remainingSteps }) => remainingSteps === piece.remainingSteps)?.range ?? 0;
};

const candidates = (
  state: GameState,
  request: CandidateRequest,
  legalLimit: number | null = null,
): readonly GameAction[] => {
  const actions: GameAction[] = [];
  const add = (action: GameAction): boolean => {
    if (request.pieceId !== null) {
      if ('pieceId' in action && action.pieceId !== request.pieceId) return false;
      if (action.kind === 'CHECK_SUPPLY' && !action.pieceIds.includes(request.pieceId)) return false;
      if (action.kind === 'DECLARE_COMBAT' && !action.attackerIds.includes(request.pieceId)) return false;
      if (action.kind === 'DECLARE_BARRAGE' && !action.firerIds.includes(request.pieceId)) return false;
    }
    if (validateGameAction(state, action).allowed) actions.push(action);
    return legalLimit !== null && actions.length >= legalLimit;
  };
  const byId = <T extends { readonly id: string }>(items: readonly T[]): readonly T[] =>
    [...items].sort((left, right) => String(left.id).localeCompare(String(right.id)));
  switch (request.kind) {
    case 'ADVANCE_SEQUENCE':
      add({ ...base(state, request.actorId, 'advance'), kind: 'ADVANCE_SEQUENCE' });
      break;
    case 'CHANGE_MODE':
      for (const piece of byId(state.pieceState.pieces.filter(({ ownerId }) => ownerId === request.actorId))) {
        for (const mode of ['COMBAT', 'MOVE', 'RESERVE', 'STRAT'] as const) {
          if (add({ ...base(state, request.actorId, `mode:${piece.id}:${mode}`), kind: 'CHANGE_MODE', pieceId: piece.id, mode })) return actions;
        }
      }
      break;
    case 'RELEASE_RESERVE':
      for (const piece of byId(state.pieceState.pieces.filter(({ ownerId, mode }) => ownerId === request.actorId && mode === 'RESERVE'))) {
        if (add({ ...base(state, request.actorId, `release:${piece.id}`), kind: 'RELEASE_RESERVE', pieceId: piece.id })) return actions;
      }
      break;
    case 'MOVE_PIECE':
      for (const pieceId of request.pieceId !== null
        ? [request.pieceId]
        : byId(state.pieceState.pieces.filter(({ ownerId }) => ownerId === request.actorId)).map(({ id }) => id)) {
        if (legalLimit === 1) {
          const piece = state.pieceState.pieces.find(({ id }) => id === pieceId);
          const origin = piece && onMapHex(piece);
          const coordinate = origin ? parseHexCoordinateId(origin) : null;
          if (!origin || !coordinate?.ok) continue;
          for (const direction of HEX_DIRECTIONS) {
            const destination = formatHexId(neighbor(coordinate.value, direction));
            if (add({
              ...base(state, request.actorId, `move:${pieceId}:${destination}`),
              kind: 'MOVE_PIECE', pieceId, path: [origin, destination],
            })) return actions;
          }
          continue;
        }
        const reachable = queryReachableHexes(state, request.actorId, pieceId);
        for (const candidate of [...(reachable.value ?? [])].sort((left, right) => String(left.hexId).localeCompare(String(right.hexId)))) {
          if (add({ ...base(state, request.actorId, `move:${pieceId}:${candidate.hexId}`), kind: 'MOVE_PIECE', pieceId, path: candidate.path })) return actions;
        }
      }
      break;
    case 'CHECK_SUPPLY':
      for (const piece of byId(state.pieceState.pieces.filter(({ ownerId, mode }) => ownerId === request.actorId && mode !== null))) {
        const supply = querySupply(state, request.actorId, piece.id, 'TRACE');
        if (supply.value?.requiresPayment) {
          for (const source of [...supply.value.resourceSources]
            .sort((left, right) => String(left.pieceId).localeCompare(String(right.pieceId)))) {
            if (add({ ...base(state, request.actorId, `supply:${piece.id}:${source.pieceId}`), kind: 'CHECK_SUPPLY', pieceIds: [piece.id], sourcePieceId: source.pieceId })) return actions;
          }
        } else {
          if (add({ ...base(state, request.actorId, `supply:${piece.id}:trace`), kind: 'CHECK_SUPPLY', pieceIds: [piece.id], sourcePieceId: null })) return actions;
        }
      }
      break;
    case 'DECLARE_COMBAT': {
      const combatKind = state.sequence.phase === 'COMBAT' ? 'REGULAR' as const : 'OVERRUN' as const;
      const friendly = byId(state.pieceState.pieces.filter(({ ownerId, location }) =>
        ownerId === request.actorId && location.kind === 'ON_MAP'))
        .filter((piece) => !['RESERVE', 'STRAT'].includes(piece.mode ?? '')
          && !state.usage.some((usage) => usage.pieceId === piece.id && usage.attacked));
      const enemies = byId(state.pieceState.pieces.filter(({ ownerId, location }) =>
        ownerId !== request.actorId && location.kind === 'ON_MAP'));
      for (const attacker of friendly) {
        for (const defender of enemies) {
          if (defender.location.kind !== 'ON_MAP') continue;
          if (!adjacent(attacker.location.kind === 'ON_MAP' ? attacker.location.hexId : '', defender.location.hexId)) continue;
          if (add({
            ...base(state, request.actorId, `combat:${combatKind}:${attacker.id}:${defender.id}`),
            kind: 'DECLARE_COMBAT', combatKind,
            attackerIds: [attacker.id], defenderIds: [defender.id],
            targetHexId: defender.location.hexId,
          })) return actions;
        }
      }
      break;
    }
    case 'DECLARE_BARRAGE': {
      const friendly = byId(state.pieceState.pieces.filter(({ ownerId, location }) =>
        ownerId === request.actorId && location.kind === 'ON_MAP'))
        .map((piece) => ({ piece, range: barrageRange(state, piece) }))
        .filter(({ piece, range }) => range > 0
          && !state.usage.some((usage) => usage.pieceId === piece.id && usage.barraged));
      const enemies = byId(state.pieceState.pieces.filter(({ ownerId, location }) =>
        ownerId !== request.actorId && location.kind === 'ON_MAP'));
      for (const { piece: firer, range } of friendly) {
        for (const target of enemies) {
          if (target.location.kind !== 'ON_MAP') continue;
          const sourceHex = firer.location.kind === 'ON_MAP' ? firer.location.hexId : '';
          const source = parseHexCoordinateId(sourceHex);
          const destination = parseHexCoordinateId(target.location.hexId);
          if (!source.ok || !destination.ok || hexDistance(source.value, destination.value) > range) continue;
          if (add({
            ...base(state, request.actorId, `barrage:${firer.id}:${target.id}`),
            kind: 'DECLARE_BARRAGE', firerIds: [firer.id], targetPieceIds: [target.id],
            targetHexId: target.location.hexId,
          })) return actions;
        }
      }
      break;
    }
    case 'RESPOND_DECISION':
      if (state.pendingDecision?.ownerId === request.actorId) {
        for (const option of byId(state.pendingDecision.options)) {
          if (add({
            ...base(state, request.actorId, `decision:${state.pendingDecision.id}:${option.id}`),
            kind: 'RESPOND_DECISION', decisionId: state.pendingDecision.id, choiceId: option.id,
          })) return actions;
        }
      }
      break;
    case 'COMMIT_TRANSACTION':
      if (state.activeTransaction?.ownerId === request.actorId) add({
        ...base(state, request.actorId, `commit:${state.activeTransaction.id}`),
        kind: 'COMMIT_TRANSACTION', transactionId: state.activeTransaction.id,
      });
      break;
    case 'CANCEL_TRANSACTION':
      if (state.activeTransaction?.ownerId === request.actorId) add({
        ...base(state, request.actorId, `cancel:${state.activeTransaction.id}`),
        kind: 'CANCEL_TRANSACTION', transactionId: state.activeTransaction.id,
      });
      break;
    case 'PLACE_REINFORCEMENT':
      for (const piece of byId(state.pieceState.pieces.filter(({ ownerId, location }) =>
        ownerId === request.actorId && ['OFF_MAP_BOX', 'HOLDING_AREA', 'POOL', 'TURN_TRACK'].includes(location.kind)))) {
        for (const entry of [...state.scenario.entries].sort((left, right) => String(left.hexId).localeCompare(String(right.hexId)))) {
          if (add({
            ...base(state, request.actorId, `reinforcement:${piece.id}:${entry.hexId}`),
            kind: 'PLACE_REINFORCEMENT', pieceId: piece.id, hexId: entry.hexId,
          })) return actions;
        }
      }
      break;
    default:
      break;
  }
  return actions;
};

const kindMayBeLegal = (state: GameState, request: CandidateRequest): boolean => {
  if (state.sequence.phase === 'COMPLETE') return false;
  if (state.pendingDecision !== null) {
    return request.kind === 'RESPOND_DECISION'
      ? state.pendingDecision.ownerId === request.actorId
      : request.kind === 'CANCEL_TRANSACTION' && state.activeTransaction?.ownerId === request.actorId;
  }
  if (state.activeTransaction !== null) {
    return ['COMMIT_TRANSACTION', 'CANCEL_TRANSACTION'].includes(request.kind)
      && state.activeTransaction.ownerId === request.actorId;
  }
  if (request.actorId !== state.sequence.actingPlayerId) return false;
  const { phase, segment } = state.sequence;
  switch (request.kind) {
    case 'ADVANCE_SEQUENCE': return true;
    case 'CHANGE_MODE': return phase === 'MOVEMENT' && segment === 'MOVEMENT';
    case 'RELEASE_RESERVE': return phase === 'REACTION' || phase === 'EXPLOITATION';
    case 'MOVE_PIECE': return segment === 'MOVEMENT'
      && ['MOVEMENT', 'REACTION', 'EXPLOITATION'].includes(phase);
    case 'CHECK_SUPPLY': return phase === 'SUPPLY';
    case 'DECLARE_COMBAT': return (phase === 'COMBAT' && segment === 'COMBAT')
      || (segment === 'MOVEMENT' && ['MOVEMENT', 'REACTION', 'EXPLOITATION'].includes(phase));
    case 'DECLARE_BARRAGE': return segment === 'BARRAGE'
      && ['MOVEMENT', 'REACTION', 'COMBAT', 'EXPLOITATION'].includes(phase);
    case 'PLACE_REINFORCEMENT': return phase === 'REINFORCEMENT';
    case 'RESPOND_DECISION':
    case 'COMMIT_TRANSACTION':
    case 'CANCEL_TRANSACTION': return false;
  }
};

const ALL_ACTION_KINDS: readonly GameAction['kind'][] = [
  'ADVANCE_SEQUENCE', 'CHANGE_MODE', 'RELEASE_RESERVE', 'MOVE_PIECE', 'CHECK_SUPPLY',
  'DECLARE_COMBAT', 'DECLARE_BARRAGE', 'RESPOND_DECISION', 'COMMIT_TRANSACTION',
  'CANCEL_TRANSACTION', 'PLACE_REINFORCEMENT',
];

const engine: RuleEngine = {
  getActionFamilies: (state: GameState, actorId: GameAction['actorId']): readonly ActionFamily[] => ALL_ACTION_KINDS.map((kind) => {
    const request = { actorId, kind, pieceId: null, budget: 1 };
    return { kind, enabled: kindMayBeLegal(state, request) && candidates(state, request, 1).length > 0 };
  }),
  getActionCandidates: (state: GameState, request: CandidateRequest): CandidateResult => {
    const budget = Math.max(0, Math.floor(request.budget));
    const scanned = kindMayBeLegal(state, request) ? candidates(state, request, budget + 1) : [];
    const truncated = scanned.length > budget;
    const actions = scanned.slice(0, budget);
    return {
      actions,
      truncated,
      reasons: scanned.length > 0
        ? [{
          code: 'CANDIDATES_AVAILABLE',
          allowed: true,
          message: truncated ? `More than ${budget} candidate(s); showing the first ${budget}.` : `${actions.length} candidate(s).`,
          rule: 'engine',
        }]
        : [{ code: 'NO_LEGAL_CANDIDATES', allowed: false, message: 'No legal candidates.', rule: 'engine' }],
    };
  },
  validateAction: validateGameAction,
  applyAction: applyGameAction,
  explain: (state: GameState, action: GameAction): RuleExplanation => {
    const validation = validateGameAction(state, action);
    const movement = action.kind === 'MOVE_PIECE' ? queryMovementPath(state, action.actorId, action.pieceId, action.path) : null;
    return {
      allowed: validation.allowed,
      actionKind: action.kind,
      reasons: validation.allowed
        ? [{ code: 'ACTION_LEGAL', allowed: true, message: 'Action satisfies current preconditions.', rule: 'engine' }]
        : validation.violations.map((entry) => ({ code: entry.code, allowed: false, message: entry.message, rule: entry.rule })),
      facts: [
        { key: 'state.revision', value: state.revision, visibility: 'PUBLIC', ownerId: null },
        { key: 'sequence.phase', value: state.sequence.phase, visibility: 'PUBLIC', ownerId: null },
        ...(movement?.facts ?? []),
        ...(movement?.value && action.kind === 'MOVE_PIECE' ? [{ key: 'movement.remainingTicks', value: Math.max(0, movement.value.allowanceTicks - (state.usage.find(u => u.pieceId === action.pieceId)?.movementSpentTicks ?? 0) - movement.value.totalTicks), visibility: 'OWNER_ONLY' as const, ownerId: action.actorId }] : []),
      ],
      citations: [...new Set(validation.violations.map(({ rule }) => rule))],
    };
  },
  projectForViewer: projectRuleState,
};

export const ruleEngine: RuleEngine = Object.freeze(engine);
