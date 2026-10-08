import type { PlayerId } from '../core/index.js';
import { previewBarrage, previewCombat } from './combat/combat.js';
import { inPatrolZoneOf } from './air/aircraft.js';
import { AIR_MISSION_LABELS, flakModifiers, missionBarrageStrength, previewAirBarrage } from './air/mission.js';
import { cargoCapacity, cargoWeight, countedUnloadTokens, dropMethod, halfTokenText, landingFailureMaximum, unloadLimitTokens, unloadedAt } from './air/transport.js';
import { friendlyAirBaseAt } from './air/aircraft.js';
import { hexOf, opponentOf, pieceById } from './pieces.js';
import { BARRAGE_TABLE_COLUMNS, FACILITY_TABLE_COLUMNS, facilityColumnIndex } from './tables/ocs-4.3.js';
import type { GameAction, GameState } from './kernel/model.js';
import { applyGameAction } from './kernel/reducer.js';
import { validateGameAction } from './kernel/validate.js';
import { queryMovementPath, queryReachableHexes } from './movement/movement.js';
import { queryFeedCoverage, querySupplySources, queryTraceCoverage } from './supply/supply.js';
import { queryFuelCoverage, queryFuelPreview } from './supply/fuel.js';
import { queryTransportOptions } from './supply/transport.js';
import { queryRailControl } from './supply/rail.js';
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
      // 16.0d: the defender's hedgehog (always visible, 4.9a): -Level on the combat roll, -1 on Surprise.
      publicFact('combat.hedgehogLevel', preview.supplied.hedgehogLevel),
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
  if (action.kind === 'DECLARE_AIR_MISSION') {
    const enemy = opponentOf(state, action.actorId);
    const flakSubject = ['BARRAGE', 'HIP_SHOOT', 'TRAINBUSTING'].includes(action.mission)
      || (['BASE_TRANSFER', 'AIR_TRANSPORT', 'AIR_DROP'].includes(action.mission) && inPatrolZoneOf(state, enemy, action.targetHexId));
    const modifiers = flakSubject ? flakModifiers(state, action.aircraftIds, action.mission, action.targetHexId, action.actorId) : [];
    const strength = missionBarrageStrength(state, action.aircraftIds);
    const facts: RuleFact[] = [
      publicFact('air.mission', AIR_MISSION_LABELS[action.mission]),
      publicFact('air.flakSubject', flakSubject),
      publicFact('air.flakModifier', modifiers.reduce((sum, { value }) => sum + value, 0)),
      publicFact('air.flakReasons', modifiers.map(({ reason, value }) => `${reason} +${value}`).join(', ')),
      publicFact('air.enemyPatrolZone', inPatrolZoneOf(state, enemy, action.targetHexId)),
      publicFact('air.strength', strength),
    ];
    if (action.target === 'COMBAT_UNITS') {
      const aircraft = action.aircraftIds.flatMap((id) => { const piece = pieceById(state, id); return piece && hexOf(piece) ? [{ pieceId: id, baseHexId: hexOf(piece)! }] : []; });
      const preview = previewAirBarrage(state, action.actorId, aircraft, action.targetHexId);
      facts.push(
        publicFact('air.initialColumn', BARRAGE_TABLE_COLUMNS[preview.initialColumn]!.label),
        publicFact('air.finalColumn', BARRAGE_TABLE_COLUMNS[preview.finalColumn]!.label),
        publicFact('air.shifts', preview.shifts.map(({ reason, shift }) => `${reason} ${shift > 0 ? '+' : ''}${shift}`).join(', ')),
      );
    } else if (action.target === 'AIR_BASE' || action.mission === 'TRAINBUSTING') {
      facts.push(publicFact('air.finalColumn', FACILITY_TABLE_COLUMNS[facilityColumnIndex(strength)]!.label));
    }
    if ((action.mission === 'AIR_TRANSPORT' || action.mission === 'AIR_DROP') && action.cargo) {
      const ids = action.aircraftIds;
      const destination = friendlyAirBaseAt(state, action.actorId, action.targetHexId);
      facts.push(
        publicFact('air.cargoLoad', halfTokenText(cargoWeight(state, action.cargo))),
        publicFact('air.cargoCapacity', halfTokenText(cargoCapacity(state, action.cargo, ids))),
      );
      if (action.mission === 'AIR_TRANSPORT' && destination) {
        facts.push(
          publicFact('air.unloadCounted', countedUnloadTokens(state, action.cargo, ids)),
          publicFact('air.unloadLimit', unloadLimitTokens(state, destination) - unloadedAt(state, action.targetHexId)),
        );
      }
      if (action.mission === 'AIR_DROP') {
        const method = dropMethod(state, action.cargo, ids);
        facts.push(
          publicFact('air.dropMethod', method === 'GLIDER' ? 'Glider' : method === 'PARACHUTE' ? 'Parachute' : 'Mixed'),
          // The table number as the result reports it; a glider landing adds +1 to the roll instead (14.10d).
          publicFact('air.landingFailsOn', landingFailureMaximum(state, action.actorId, action.targetHexId)),
          publicFact('air.landingDrm', method === 'GLIDER' ? 1 : 0),
        );
      }
    }
    return facts;
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
  queryMovementRange: (state, actorId, pieceId) => (kindMayBeLegal(state, actorId, 'MOVE_PIECE')
    ? queryReachableHexes(state, actorId, pieceId)
    : { allowed: false, value: [], reasons: [{ code: 'MOVEMENT_NOT_ALLOWED', allowed: false, message: 'No movement in this step.', rule: '6.1' }], facts: [], dependencies: [] }),
  queryTransportOptions,
  queryTraceCoverage,
  queryFeedCoverage,
  querySupplySources,
  queryRailControl,
  queryFuelCoverage,
  queryFuelPreview,
};

export const ruleEngine: RuleEngine = Object.freeze(engine);
