import type { PlayerId } from '../core/index.js';
import { previewBarrage, previewCombat } from './combat/combat.js';
import type { GameAction, GameState } from './kernel/model.js';
import { applyGameAction } from './kernel/reducer.js';
import { validateGameAction } from './kernel/validate.js';
import { queryMovementPath } from './movement/movement.js';
import { actionFamilies, candidateActions, kindMayBeLegal } from './query/candidates.js';
import { projectRuleState } from './query/projection.js';
import type {
  ActionFamily,
  CandidateRequest,
  CandidateResult,
  RuleEngine,
  RuleExplanation,
  RuleFact,
} from './query/model.js';

const publicFact = (key: string, value: string | number | boolean): RuleFact => ({ key, value, visibility: 'PUBLIC', ownerId: null });

/** Facts a player sees before confirming an action: odds, DRM, supply, barrage column (4.9b/c). */
const actionFacts = (state: GameState, action: GameAction): readonly RuleFact[] => {
  if (action.kind === 'MOVE_PIECE') return queryMovementPath(state, action.actorId, action.pieceId, action.path).facts;
  if (action.kind === 'DECLARE_COMBAT') {
    const preview = previewCombat(state, action.actorId, action.attackerIds, action.targetHexId, action.leadAttackerId);
    return [
      publicFact('combat.attackerStrength', preview.supplied.attackerStrength),
      publicFact('combat.defenderStrength', preview.supplied.defenderStrength),
      publicFact('combat.defenderStrengthUnsupplied', preview.unsupplied.defenderStrength),
      publicFact('combat.odds', preview.supplied.oddsText),
      publicFact('combat.oddsUnsupplied', preview.unsupplied.oddsText),
      publicFact('combat.line', preview.supplied.line),
      publicFact('combat.defenderTerrain', preview.supplied.defenderTerrain),
      publicFact('combat.column', preview.supplied.columns[preview.supplied.columnIndex]
        ? `${preview.supplied.columns[preview.supplied.columnIndex]!.attacker}:${preview.supplied.columns[preview.supplied.columnIndex]!.defender}` : ''),
      publicFact('combat.attackerActionRating', preview.supplied.leadAttackerRating),
      publicFact('combat.defenderActionRating', preview.supplied.leadDefenderRating),
      publicFact('combat.drm', preview.supplied.drm),
      publicFact('combat.attackerSupplyTokens', preview.attackerSupplyTokens),
      publicFact('combat.defenderSupplyTokens', preview.defenderSupplyTokens),
      publicFact('combat.defenderCanPay', preview.defenderCanPay),
    ];
  }
  if (action.kind === 'DECLARE_BARRAGE') {
    const preview = previewBarrage(state, action.actorId, action.firerIds, action.targetHexId);
    return [
      publicFact('barrage.strength', preview.strength),
      publicFact('barrage.initialColumn', preview.initialColumn),
      publicFact('barrage.finalColumn', preview.finalColumn),
      publicFact('barrage.supplyTokens', preview.supplyTokens),
      publicFact('barrage.spotter', preview.spotter),
      publicFact('barrage.shifts', preview.shifts.map(({ reason, shift }) => `${reason} ${shift > 0 ? '+' : ''}${shift}`).join(', ')),
    ];
  }
  return [];
};

const engine: RuleEngine = {
  getActionFamilies: (state: GameState, actorId: PlayerId): readonly ActionFamily[] => actionFamilies(state, actorId),
  getActionCandidates: (state: GameState, request: CandidateRequest): CandidateResult => {
    const budget = Math.max(0, Math.floor(request.budget));
    const scanned = kindMayBeLegal(state, request.actorId, request.kind) ? candidateActions(state, request, budget + 1) : [];
    const truncated = scanned.length > budget;
    const actions = scanned.slice(0, budget);
    return {
      actions,
      truncated,
      reasons: scanned.length > 0
        ? [{ code: 'CANDIDATES_AVAILABLE', allowed: true, message: truncated ? `More than ${budget} candidate(s); showing the first ${budget}.` : `${actions.length} candidate(s).`, rule: 'engine' }]
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
        publicFact('state.revision', state.revision),
        publicFact('sequence.phase', state.sequence.phase),
        ...actionFacts(state, action),
      ],
      citations: [...new Set(validation.violations.map(({ rule }) => rule))],
    };
  },
  projectForViewer: projectRuleState,
};

export const ruleEngine: RuleEngine = Object.freeze(engine);
