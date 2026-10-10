import { stableSort, type HexId, type PieceId, type PlayerId } from '../../core/index.js';
import type { PieceState } from '../../domain/piece/index.js';
import { parseRuleActionId, type RuleActionId } from '../kernel/ids.js';
import type { GameAction, GameState } from '../kernel/model.js';
import { validateGameAction } from '../kernel/validate.js';
import { arrivingReinforcements, reinforcementHexes } from '../lifecycle/lifecycle.js';
import { breakoutCandidates } from '../lifecycle/supply-phase.js';
import { breakdownProfile } from '../breakdown/breakdown.js';
import { fuelOptions } from '../supply/fuel.js';
import { capacityTokens, cargoOf, loadedTokens } from '../supply/transport.js';
import { queryReachableHexes } from '../movement/movement.js';
import { queryRailMoveOptions, railCapRemainingQuarters, railEntrainHexes, railMoveQuarters } from '../supply/rail-cap.js';
import { arrivesBySea, querySeaMoveOptions, seaCapRemainingQuarters } from '../supply/sea-cap.js';
import { allPorts, portHexOf, portRemainingTokens } from '../port/state.js';
import { portReduceOptions, portRepairOptions } from '../port/port.js';
import {
  adjacentHexIds,
  enemyCombatUnitsAt,
  hexDistanceBetween,
  hexOf,
  isArtillery,
  isAttackCapable,
  stepOf,
} from '../pieces.js';
import { defaultAttackerSupply } from '../combat/combat.js';
import { combatActionRating } from '../combat/strength.js';
import { combineCandidates, refitCandidates } from '../air/base.js';
import { constructionHexes, constructionOptions, isEngineerCapable, largestFirstPayments } from '../air/construction.js';
import { defaultRebuild, rebuildOptions } from '../air/replacement.js';
import { defaultUnitRebuild, unitRebuildOptions } from '../replacement/replacement.js';
import { hedgehogBuildOptions, hedgehogPayments, hedgehogReduceOptions } from '../hedgehog/hedgehog.js';
import { dropPlanCandidates, transportCandidates } from '../air/transport.js';
import { AIR_MISSION_KINDS, aircraftForTarget, airMissionTargets, missionSegment } from '../air/mission.js';
import { airBaseLevel, friendlyAirBases, isAirStrip } from '../air/aircraft.js';
import {
  dumpsReaching,
  eatOffMapCost,
  unitsNeedingRecovery,
  unitsNeedingSupply,
} from '../supply/supply.js';
import { definitionOf, locatedHexOf, pieceById, piecesAt, reTicksOf, usageOf } from '../pieces.js';
import type { ActionFamily, CandidateRequest } from './model.js';

const actionId = (value: string): RuleActionId => {
  const parsed = parseRuleActionId(value);
  if (!parsed.ok) throw new Error('Generated Rule Action ID is invalid.');
  return parsed.value;
};

const base = (state: GameState, actorId: PlayerId, scope: string) => ({
  actionId: actionId(`candidate:${scope}:${state.revision}`),
  actorId,
  expectedRevision: state.revision,
});

const byId = <T extends { readonly id: string }>(items: readonly T[]): readonly T[] =>
  [...items].sort((left, right) => String(left.id).localeCompare(String(right.id)));

const friendlyOnMap = (state: GameState, actorId: PlayerId): readonly PieceState[] =>
  byId(state.pieceState.pieces.filter((piece) => piece.ownerId === actorId && piece.location.kind === 'ON_MAP'));

const enemyHexesAdjacentTo = (state: GameState, actorId: PlayerId, hexId: HexId): readonly HexId[] =>
  adjacentHexIds(hexId).filter((adjacent) => enemyCombatUnitsAt(state, actorId, adjacent).length > 0);

const leadOf = (state: GameState, attackers: readonly PieceState[]): PieceId =>
  stableSort(attackers, (left, right) => combatActionRating(state, right) - combatActionRating(state, left)
    || String(left.id).localeCompare(String(right.id)))[0]!.id;

/** Largest legal attack on each target Hex, falling back to single attackers. */
export const combatCandidatesFor = (
  state: GameState,
  actorId: PlayerId,
  combatKind: 'REGULAR' | 'OVERRUN',
  pieceId: PieceId | null,
): readonly GameAction[] => {
  const actions: GameAction[] = [];
  const friendly = friendlyOnMap(state, actorId).filter((piece) => isAttackCapable(state, piece));
  const targets = [...new Set(friendly.flatMap((piece) => enemyHexesAdjacentTo(state, actorId, hexOf(piece)!)))].sort();
  for (const target of targets) {
    const defenderIds = enemyCombatUnitsAt(state, actorId, target).map(({ id }) => id).sort();
    const adjacent = friendly.filter((piece) => adjacentHexIds(target).includes(hexOf(piece)!));
    const groups: PieceState[][] = combatKind === 'OVERRUN'
      ? adjacent.map((piece) => [piece])
      : [adjacent, ...adjacent.map((piece) => [piece])];
    for (const group of groups) {
      if (pieceId !== null && !group.some(({ id }) => id === pieceId)) continue;
      // 9.5: the supply each attacker declares, Exhausted units first; a group some unit cannot supply is no candidate.
      const attackerSupply = defaultAttackerSupply(state, actorId, group.map(({ id }) => id));
      if (!attackerSupply) continue;
      const action: GameAction = {
        ...base(state, actorId, `combat:${combatKind}:${target}:${group.map(({ id }) => id).join('+')}`),
        kind: 'DECLARE_COMBAT', combatKind, attackerIds: group.map(({ id }) => id), defenderIds,
        targetHexId: target, leadAttackerId: leadOf(state, group), attackerSupply,
      };
      if (validateGameAction(state, action).allowed) {
        actions.push(action);
        if (combatKind === 'REGULAR' && group === adjacent) break;
      }
    }
  }
  return actions;
};

export const barrageCandidatesFor = (state: GameState, actorId: PlayerId, pieceId: PieceId | null): readonly GameAction[] => {
  const actions: GameAction[] = [];
  const artillery = friendlyOnMap(state, actorId).filter((piece) => isArtillery(state, piece));
  const enemyHexes = [...new Set(state.pieceState.pieces
    .filter((piece) => piece.ownerId !== actorId && hexOf(piece) !== null && enemyCombatUnitsAt(state, actorId, hexOf(piece)!).length > 0)
    .map((piece) => hexOf(piece)!))].sort();
  for (const target of enemyHexes) {
    const inRange = artillery.filter((piece) => hexDistanceBetween(hexOf(piece)!, target) <= (stepOf(state, piece)?.range ?? 0));
    if (inRange.length === 0) continue;
    const targetPieceIds = enemyCombatUnitsAt(state, actorId, target).map(({ id }) => id).sort();
    for (const group of [inRange, ...inRange.map((piece) => [piece])]) {
      if (pieceId !== null && !group.some(({ id }) => id === pieceId)) continue;
      const action: GameAction = {
        ...base(state, actorId, `barrage:${target}:${group.map(({ id }) => id).join('+')}`),
        kind: 'DECLARE_BARRAGE', firerIds: group.map(({ id }) => id), targetPieceIds, targetHexId: target,
      };
      if (validateGameAction(state, action).allowed) { actions.push(action); if (group === inRange) break; }
    }
  }
  return actions;
};

export const candidateActions = (
  state: GameState,
  request: CandidateRequest,
  legalLimit: number | null = null,
): readonly GameAction[] => {
  const actions: GameAction[] = [];
  const add = (action: GameAction): boolean => {
    if (validateGameAction(state, action).allowed) actions.push(action);
    return legalLimit !== null && actions.length >= legalLimit;
  };
  const owned = friendlyOnMap(state, request.actorId).filter(({ id }) => request.pieceId === null || id === request.pieceId);
  switch (request.kind) {
    case 'ADVANCE_SEQUENCE':
      add({ ...base(state, request.actorId, 'advance'), kind: 'ADVANCE_SEQUENCE' });
      break;
    case 'CHANGE_MODE':
      for (const piece of owned) {
        for (const mode of ['COMBAT', 'MOVE', 'RESERVE', 'STRAT'] as const) {
          if (add({ ...base(state, request.actorId, `mode:${piece.id}:${mode}`), kind: 'CHANGE_MODE', pieceId: piece.id, mode })) return actions;
        }
      }
      break;
    case 'RELEASE_RESERVE':
      for (const piece of owned.filter(({ mode }) => mode === 'RESERVE')) {
        if (add({ ...base(state, request.actorId, `release:${piece.id}`), kind: 'RELEASE_RESERVE', pieceId: piece.id })) return actions;
      }
      break;
    case 'MOVE_PIECE':
      for (const piece of owned) {
        const origin = hexOf(piece)!;
        if (legalLimit === 1) {
          for (const destination of adjacentHexIds(origin)) {
            if (add({ ...base(state, request.actorId, `move:${piece.id}:${destination}`), kind: 'MOVE_PIECE', pieceId: piece.id, path: [origin, destination] })) return actions;
          }
          continue;
        }
        for (const candidate of queryReachableHexes(state, request.actorId, piece.id).value ?? []) {
          actions.push({ ...base(state, request.actorId, `move:${piece.id}:${candidate.hexId}`), kind: 'MOVE_PIECE', pieceId: piece.id, path: candidate.path });
          if (legalLimit !== null && actions.length >= legalLimit) return actions;
        }
      }
      break;
    case 'END_MOVE':
      if (state.currentMoverId !== null && (request.pieceId === null || request.pieceId === state.currentMoverId)) {
        add({ ...base(state, request.actorId, `end-move:${state.currentMoverId}`), kind: 'END_MOVE', pieceId: state.currentMoverId });
      }
      break;
    case 'CREATE_BREAKDOWN':
      for (const piece of owned.filter((candidate) => breakdownProfile(state, candidate) !== null)) {
        if (add({ ...base(state, request.actorId, `breakdown:${piece.id}`), kind: 'CREATE_BREAKDOWN', pieceId: piece.id })) return actions;
      }
      break;
    case 'CHECK_SUPPLY':
      if (state.sequence.phase !== 'SUPPLY') break;
      for (const piece of byId(unitsNeedingSupply(state, request.actorId)).filter(({ id }) => request.pieceId === null || id === request.pieceId)) {
        const cost = eatOffMapCost(reTicksOf(state, piece));
        for (const dump of dumpsReaching(state, request.actorId, hexOf(piece)!).filter(({ availableQuantity }) => availableQuantity >= cost)) {
          if (add({ ...base(state, request.actorId, `supply:${piece.id}:${dump.pieceId}`), kind: 'CHECK_SUPPLY', pieceIds: [piece.id], sourcePieceId: dump.pieceId })) return actions;
        }
      }
      break;
    case 'DECLARE_COMBAT': {
      if (state.activeTransaction !== null || state.pendingDecision !== null) break;
      const kind = state.sequence.segment === 'COMBAT' ? 'REGULAR' as const : 'OVERRUN' as const;
      for (const action of combatCandidatesFor(state, request.actorId, kind, request.pieceId)) {
        actions.push(action);
        if (legalLimit !== null && actions.length >= legalLimit) return actions;
      }
      break;
    }
    case 'DECLARE_BARRAGE':
      if (state.activeTransaction !== null || state.pendingDecision !== null || state.sequence.segment !== 'BARRAGE') break;
      for (const action of barrageCandidatesFor(state, request.actorId, request.pieceId)) {
        actions.push(action);
        if (legalLimit !== null && actions.length >= legalLimit) return actions;
      }
      break;
    case 'RESPOND_DECISION':
      if (state.pendingDecision?.ownerId === request.actorId) {
        for (const option of state.pendingDecision.options) {
          if (add({ ...base(state, request.actorId, `decision:${state.pendingDecision.id}:${option.id}`), kind: 'RESPOND_DECISION', decisionId: state.pendingDecision.id, choiceId: option.id })) return actions;
        }
      }
      break;
    case 'COMMIT_TRANSACTION':
      break;
    case 'CANCEL_TRANSACTION':
      if (state.activeTransaction?.ownerId === request.actorId) add({ ...base(state, request.actorId, `cancel:${state.activeTransaction.id}`), kind: 'CANCEL_TRANSACTION', transactionId: state.activeTransaction.id });
      break;
    case 'PLACE_REINFORCEMENT':
      for (const piece of byId(arrivingReinforcements(state, request.actorId)).filter(({ id }) => request.pieceId === null || id === request.pieceId)) {
        for (const hexId of reinforcementHexes(state, request.actorId, piece.id)) {
          if (add({ ...base(state, request.actorId, `reinforcement:${piece.id}:${hexId}`), kind: 'PLACE_REINFORCEMENT', pieceId: piece.id, hexId })) return actions;
        }
      }
      break;
    case 'PAY_FUEL':
      for (const piece of owned) {
        for (const option of fuelOptions(state, piece)) {
          for (const source of option.sources) {
            if (add({ ...base(state, request.actorId, `fuel:${option.method}:${piece.id}:${source.pieceId}`), kind: 'PAY_FUEL', method: option.method, pieceId: piece.id, sourcePieceId: source.pieceId })) return actions;
          }
        }
      }
      break;
    case 'RECOVER_INTERNALS':
      for (const piece of byId(unitsNeedingRecovery(state, request.actorId)).filter(({ id }) => request.pieceId === null || id === request.pieceId)) {
        const sourcePieceIds = dumpsReaching(state, request.actorId, locatedHexOf(state, piece)!, piece).map(({ pieceId: id }) => id);
        if (add({ ...base(state, request.actorId, `recover:${piece.id}`), kind: 'RECOVER_INTERNALS', pieceId: piece.id, sourcePieceIds })) return actions;
      }
      break;
    case 'CHOOSE_FORMATION_TRACE':
      // 12.6f: a unit either makes its trace or does not; the engine picks the common route covering most of a formation, so there is nothing to offer.
      break;
    case 'ATTEMPT_BREAKOUT':
      for (const piece of breakoutCandidates(state, request.actorId).filter(({ id }) => request.pieceId === null || id === request.pieceId)) {
        if (add({ ...base(state, request.actorId, `breakout:${piece.id}`), kind: 'ATTEMPT_BREAKOUT', pieceId: piece.id })) return actions;
      }
      break;
    case 'BLOW_DUMP':
      // Offered only for dumps an enemy combat unit could soon reach; any dump may still be blown.
      for (const dump of byId(state.pieceState.pieces.filter((piece) => piece.ownerId === request.actorId
        && definitionOf(state, piece)?.family === 'RESOURCE' && locatedHexOf(state, piece) !== null && !usageOf(state, piece).blown
        && (request.pieceId === null || piece.id === request.pieceId)
        && state.pieceState.pieces.some((enemy) => enemy.ownerId !== request.actorId && hexOf(enemy) !== null
          && isAttackCapable(state, enemy) && hexDistanceBetween(hexOf(enemy)!, locatedHexOf(state, piece)!) <= DUMP_THREAT_HEXES)))) {
        if (add({ ...base(state, request.actorId, `blow:${dump.id}`), kind: 'BLOW_DUMP', dumpId: dump.id, tokens: dump.resourceQuantity ?? 0 })) return actions;
      }
      break;
    case 'LOAD_SUPPLY':
      for (const truck of owned) {
        for (const dump of friendlyOnMap(state, request.actorId).filter((piece) => definitionOf(state, piece)?.family === 'RESOURCE' && hexOf(piece) === hexOf(truck))) {
          const tokens = Math.min(dump.resourceQuantity ?? 0, Math.max(0, capacityTokens(state, truck) - loadedTokens(state, truck)));
          if (tokens > 0 && add({ ...base(state, request.actorId, `load:${truck.id}:${dump.id}`), kind: 'LOAD_SUPPLY', truckId: truck.id, dumpId: dump.id, tokens })) return actions;
        }
      }
      break;
    case 'RAIL_MOVE': {
      // One candidate per cargo and destination: each dump's loadable SP (as much as the Rail Cap left pays for), and each unit alone.
      const left = railCapRemainingQuarters(state, request.actorId);
      if (left <= 0) break;
      for (const fromHexId of railEntrainHexes(state, request.actorId)) {
        const options = queryRailMoveOptions(state, request.actorId, fromHexId).value!;
        if (options.entrainProblem !== null) continue;
        for (const { hexId } of options.destinations) {
          for (const dump of options.dumps) {
            if (request.pieceId !== null && dump.pieceId !== request.pieceId) continue;
            const perToken = railMoveQuarters(state, request.actorId, fromHexId, hexId, [], 4) ?? 4;
            const tokens = Math.min(dump.loadableTokens, Math.floor(left * 4 / Math.max(1, perToken)));
            if (tokens > 0 && add({ ...base(state, request.actorId, `rail:${dump.pieceId}:${hexId}`), kind: 'RAIL_MOVE', fromHexId, toHexId: hexId, unitIds: [], supply: [{ sourcePieceId: dump.pieceId, tokens }] })) return actions;
          }
          for (const unit of options.units) {
            if (unit.problem !== null || (request.pieceId !== null && unit.pieceId !== request.pieceId)) continue;
            if (add({ ...base(state, request.actorId, `rail:${unit.pieceId}:${hexId}`), kind: 'RAIL_MOVE', fromHexId, toHexId: hexId, unitIds: [unit.pieceId], supply: [] })) return actions;
          }
        }
      }
      break;
    }
    case 'UNLOAD_SUPPLY':
      for (const truck of owned.filter((piece) => cargoOf(state, piece).length > 0)) {
        if (add({ ...base(state, request.actorId, `unload:${truck.id}`), kind: 'UNLOAD_SUPPLY', truckId: truck.id, tokens: loadedTokens(state, truck) })) return actions;
      }
      break;
    case 'COMBINE_TRANSPORT': {
      // Group among every friendly piece: a selected truck needs its partners, which `owned` has already filtered out.
      const byHex = new Map<string, PieceState[]>();
      for (const truck of friendlyOnMap(state, request.actorId)) byHex.set(`${hexOf(truck)}|${truck.definitionId}`, [...(byHex.get(`${hexOf(truck)}|${truck.definitionId}`) ?? []), truck]);
      for (const group of byHex.values()) {
        if (request.pieceId !== null && !group.some(({ id }) => id === request.pieceId)) continue;
        if (group.length > 1 && add({ ...base(state, request.actorId, `combine:${group.map(({ id }) => id).join('+')}`), kind: 'COMBINE_TRANSPORT', truckIds: group.map(({ id }) => id) })) return actions;
      }
      break;
    }
    case 'DIVIDE_TRANSPORT':
      for (const truck of owned) {
        if (add({ ...base(state, request.actorId, `divide:${truck.id}`), kind: 'DIVIDE_TRANSPORT', truckId: truck.id, points: 1 })) return actions;
      }
      break;
    case 'FORM_EXTENDER':
      for (const truck of owned) {
        if (add({ ...base(state, request.actorId, `extend:${truck.id}`), kind: 'FORM_EXTENDER', truckId: truck.id })) return actions;
      }
      break;
    case 'DISSOLVE_EXTENDER':
      for (const extender of owned) {
        if (add({ ...base(state, request.actorId, `dissolve:${extender.id}`), kind: 'DISSOLVE_EXTENDER', extenderId: extender.id })) return actions;
      }
      break;
    case 'COLLAPSE_EXTENDER':
      break;
    case 'REFIT_AIRCRAFT':
      for (const candidate of refitCandidates(state, request.actorId)) {
        if (request.pieceId !== null && candidate.base.id !== request.pieceId && !candidate.aircraftIds.includes(request.pieceId)) continue;
        for (const sourcePieceId of candidate.sourceIds) {
          if (add({ ...base(state, request.actorId, `refit:${candidate.base.id}:${sourcePieceId}`), kind: 'REFIT_AIRCRAFT', baseId: candidate.base.id, aircraftIds: candidate.aircraftIds, sourcePieceId })) return actions;
        }
      }
      break;
    case 'DECLARE_AIR_MISSION': {
      if (state.activeTransaction !== null || state.pendingDecision !== null) break;
      for (const mission of AIR_MISSION_KINDS.filter((kind) => missionSegment(kind) === state.sequence.segment)) {
        if (mission === 'AIR_TRANSPORT' || mission === 'AIR_DROP') {
          // The load is part of the order, so these missions are built from the cargo that is at each base.
          for (const body of transportCandidates(state, request.actorId, mission, 40)) {
            if (request.pieceId !== null && !body.aircraftIds.includes(request.pieceId)) continue;
            if (add({ ...base(state, request.actorId, `air:${mission}:${body.targetHexId}:${body.aircraftIds.join('+')}`), ...body })) return actions;
          }
          continue;
        }
        for (const { hexId, target } of airMissionTargets(state, request.actorId, mission)) {
          const eligible = aircraftForTarget(state, request.actorId, mission, hexId).filter(({ id }) => request.pieceId === null || id === request.pieceId);
          if (eligible.length === 0) continue;
          // One aircraft per sweep (14.6 play note), transfer and hip shoot; up to four for barrages.
          const groups = request.pieceId !== null || (mission !== 'BARRAGE' && mission !== 'TRAINBUSTING')
            ? eligible.map((piece) => [piece])
            : mission === 'BARRAGE' && eligible.length > 1 ? [eligible.slice(0, 4), ...eligible.slice(0, 4).map((piece) => [piece])] : [eligible.slice(0, 4)];
          for (const group of groups) {
            if (add({ ...base(state, request.actorId, `air:${mission}:${hexId}:${target ?? 'hex'}:${group.map(({ id }) => id).join('+')}`), kind: 'DECLARE_AIR_MISSION', mission, aircraftIds: group.map(({ id }) => id), targetHexId: hexId, target })) return actions;
          }
        }
      }
      break;
    }
    case 'REDUCE_AIR_BASE':
      for (const airBase of friendlyAirBases(state, request.actorId).filter((piece) => !isAirStrip(state, piece) && airBaseLevel(state, piece) > 1)) {
        const units = owned.filter((piece) => hexOf(piece) === hexOf(airBase) && piece.mode === 'COMBAT' && !usageOf(state, piece).moved);
        if (units.length === 0) continue;
        if (add({ ...base(state, request.actorId, `reduce:${airBase.id}`), kind: 'REDUCE_AIR_BASE', baseId: airBase.id, pieceIds: units.map(({ id }) => id) })) return actions;
      }
      // 15.4, 13.8d: an Engineer-Capable unit within its 2-hex radius can also do the work.
      for (const engineer of owned.filter((piece) => (request.pieceId === null || piece.id === request.pieceId) && isEngineerCapable(state, piece))) {
        for (const airBase of friendlyAirBases(state, request.actorId).filter((piece) => !isAirStrip(state, piece) && airBaseLevel(state, piece) > 1 && constructionHexes(state, engineer).includes(hexOf(piece)!))) {
          if (add({ ...base(state, request.actorId, `reduce:${airBase.id}:by:${engineer.id}`), kind: 'REDUCE_AIR_BASE', baseId: airBase.id, pieceIds: [], engineerId: engineer.id })) return actions;
        }
      }
      break;
    case 'PLAN_AIR_DROP':
      for (const body of dropPlanCandidates(state, request.actorId)) {
        if (request.pieceId !== null && !body.unitIds.includes(request.pieceId)) continue;
        if (add({ ...base(state, request.actorId, `plan-drop:${body.unitIds.join('+')}:${body.hexId}`), ...body })) return actions;
      }
      break;
    case 'UPDATE_AIR_DROP_PLAN':
      for (const plan of state.air.dropPlans.filter((entry) => entry.ownerId === request.actorId && entry.turn <= state.sequence.gameTurn + 1)) {
        if (request.pieceId !== null && !plan.unitIds.includes(request.pieceId)) continue;
        if (add({ ...base(state, request.actorId, `delay-drop:${plan.id}`), kind: 'UPDATE_AIR_DROP_PLAN', planId: plan.id, unitIds: [...plan.unitIds], change: 'DELAY' })) return actions;
      }
      break;
    case 'REBUILD_AIRCRAFT':
      for (const option of rebuildOptions(state, request.actorId)) {
        if (request.pieceId !== null && option.eq.id !== request.pieceId && option.hq.id !== request.pieceId && !option.aircraftIds.includes(request.pieceId)) continue;
        const aircraftIds = defaultRebuild(state, option);
        if (aircraftIds.length === 0) continue;
        const arriving = aircraftIds.some((id) => pieceById(state, id)?.location.kind === 'ELIMINATED');
        for (const baseId of arriving ? option.baseIds : [null]) {
          if (add({ ...base(state, request.actorId, `rebuild:${option.eq.id}:${baseId ?? 'here'}`), kind: 'REBUILD_AIRCRAFT', eqPieceId: option.eq.id, hqId: option.hq.id, aircraftIds: [...aircraftIds], baseId })) return actions;
        }
      }
      break;
    case 'REBUILD_UNITS':
      for (const option of unitRebuildOptions(state, request.actorId)) {
        if (request.pieceId !== null && option.hq.id !== request.pieceId && !option.units.some(({ piece }) => piece.id === request.pieceId)) continue;
        const { units, truckPoints } = defaultUnitRebuild(option);
        if (units.length === 0 && truckPoints === 0) continue;
        if (add({ ...base(state, request.actorId, `rebuild-units:${option.hexId}`), kind: 'REBUILD_UNITS', hexId: option.hexId, hqId: option.hq.id, units: [...units], truckPoints })) return actions;
      }
      break;
    case 'BUILD_AIR_BASE':
      for (const engineer of owned.filter((piece) => request.pieceId === null || piece.id === request.pieceId)) {
        for (const { hexId, plan } of constructionOptions(state, engineer)) {
          const payments = largestFirstPayments(state, request.actorId, hexId, plan.cost);
          if (payments === null) continue;
          if (add({ ...base(state, request.actorId, `build:${engineer.id}:${hexId}:${plan.facility}`), kind: 'BUILD_AIR_BASE', engineerId: engineer.id, hexId, facility: plan.facility, payments })) return actions;
        }
      }
      break;
    case 'BUILD_HEDGEHOG':
      for (const { hexId, pieceIds, engineerId } of hedgehogBuildOptions(state, request.actorId, request.pieceId)) {
        const payments = hedgehogPayments(state, request.actorId, hexId);
        if (payments === null) continue;
        if (add({ ...base(state, request.actorId, `hedgehog:${hexId}:${engineerId ?? 'crew'}`), kind: 'BUILD_HEDGEHOG', hexId, pieceIds: [...pieceIds], engineerId, payments })) return actions;
      }
      break;
    case 'REDUCE_HEDGEHOG':
      for (const { hedgehogId, pieceIds, engineerId } of hedgehogReduceOptions(state, request.actorId, request.pieceId)) {
        if (add({ ...base(state, request.actorId, `reduce-hedgehog:${hedgehogId}:${engineerId ?? 'crew'}`), kind: 'REDUCE_HEDGEHOG', hedgehogId, pieceIds: [...pieceIds], engineerId })) return actions;
      }
      break;
    case 'SEA_MOVE': {
      // One candidate per origin, cargo and port: each unit alone, and each dump's SP as far as Sea Cap and both ports take.
      const left = seaCapRemainingQuarters(state, request.actorId);
      if (left <= 0) break;
      const origins: (HexId | null)[] = [...(arrivesBySea(state, request.actorId) ? [null] : []),
        ...allPorts(state).map(portHexOf).filter((hexId) => piecesAt(state, hexId).some((piece) => piece.ownerId === request.actorId))];
      for (const fromHexId of origins) {
        const options = querySeaMoveOptions(state, request.actorId, fromHexId).value!;
        if (options.problem !== null) continue;
        const fromLeft = fromHexId === null ? Number.POSITIVE_INFINITY : portRemainingTokens(state, request.actorId, fromHexId);
        for (const { hexId, remainingTokens } of options.destinations) {
          for (const unit of options.units) {
            if (unit.problem !== null || (request.pieceId !== null && unit.pieceId !== request.pieceId)) continue;
            if (add({ ...base(state, request.actorId, `sea:${unit.pieceId}:${hexId}`), kind: 'SEA_MOVE', fromHexId, toHexId: hexId, unitIds: [unit.pieceId], supply: [] })) return actions;
          }
          for (const dump of options.dumps) {
            if (request.pieceId !== null && dump.pieceId !== request.pieceId) continue;
            const tokens = Math.min(dump.loadableTokens, left, remainingTokens, fromLeft);
            if (tokens > 0 && add({ ...base(state, request.actorId, `sea:${dump.pieceId}:${hexId}`), kind: 'SEA_MOVE', fromHexId, toHexId: hexId, unitIds: [], supply: [{ sourcePieceId: dump.pieceId, tokens }] })) return actions;
          }
        }
      }
      break;
    }
    case 'REDUCE_PORT':
      for (const { hexId, pieceIds, engineerId } of portReduceOptions(state, request.actorId, request.pieceId)) {
        if (add({ ...base(state, request.actorId, `reduce-port:${hexId}:${engineerId ?? 'crew'}`), kind: 'REDUCE_PORT', hexId, pieceIds: [...pieceIds], engineerId })) return actions;
      }
      break;
    case 'REPAIR_PORT':
      for (const { hexId, engineerId, payments } of portRepairOptions(state, request.actorId, request.pieceId)) {
        if (add({ ...base(state, request.actorId, `repair-port:${hexId}:${engineerId}`), kind: 'REPAIR_PORT', hexId, engineerId, payments: [...payments] })) return actions;
      }
      break;
    case 'COMBINE_AIRCRAFT':
      for (const pair of combineCandidates(state, request.actorId).filter((ids) => request.pieceId === null || ids.includes(request.pieceId))) {
        if (add({ ...base(state, request.actorId, `combine-air:${pair.join('+')}`), kind: 'COMBINE_AIRCRAFT', aircraftIds: [...pair] })) return actions;
      }
      break;
  }
  return actions;
};

/**
 * Dumps with an enemy Attack-Capable unit adjacent (able to enter and capture them next, 9.14b)
 * are offered for blowing, so an otherwise empty step stops for that choice (12.11a). Any dump may
 * still be blown in a step that stops for other reasons.
 */
const DUMP_THREAT_HEXES = 1;

export const ALL_ACTION_KINDS: readonly GameAction['kind'][] = [
  'ADVANCE_SEQUENCE', 'CHANGE_MODE', 'RELEASE_RESERVE', 'MOVE_PIECE', 'END_MOVE', 'CREATE_BREAKDOWN', 'CHECK_SUPPLY',
  'DECLARE_COMBAT', 'DECLARE_BARRAGE', 'RESPOND_DECISION', 'COMMIT_TRANSACTION',
  'CANCEL_TRANSACTION', 'PLACE_REINFORCEMENT', 'PAY_FUEL', 'RECOVER_INTERNALS', 'CHOOSE_FORMATION_TRACE',
  'ATTEMPT_BREAKOUT', 'BLOW_DUMP', 'LOAD_SUPPLY', 'UNLOAD_SUPPLY', 'COMBINE_TRANSPORT', 'DIVIDE_TRANSPORT',
  'FORM_EXTENDER', 'DISSOLVE_EXTENDER', 'COLLAPSE_EXTENDER',
  'REFIT_AIRCRAFT', 'DECLARE_AIR_MISSION', 'REDUCE_AIR_BASE', 'BUILD_AIR_BASE', 'BUILD_HEDGEHOG', 'REDUCE_HEDGEHOG', 'REBUILD_AIRCRAFT', 'REBUILD_UNITS', 'PLAN_AIR_DROP', 'UPDATE_AIR_DROP_PLAN', 'COMBINE_AIRCRAFT',
  'RAIL_MOVE', 'SEA_MOVE', 'REDUCE_PORT', 'REPAIR_PORT',
];

/**
 * Bookkeeping that is legal in any step but never a reason to stop the sequence on its own: two
 * reduced aircraft may combine (13.9-4) in any step where play stops for something else, and the
 * current mover may be declared finished (6.1g).
 */
const NON_STOPPING_KINDS: readonly GameAction['kind'][] = ['COMBINE_AIRCRAFT', 'END_MOVE'];

/** Whether the actor has at least one legal action of a kind; asked repeatedly of one state (families, auto-pass). */
const candidateExists = new WeakMap<GameState, Map<string, boolean>>();
const hasCandidate = (state: GameState, actorId: PlayerId, kind: GameAction['kind']): boolean => {
  let cache = candidateExists.get(state);
  if (!cache) { cache = new Map(); candidateExists.set(state, cache); }
  const key = `${actorId}|${kind}`;
  let exists = cache.get(key);
  if (exists === undefined) {
    exists = candidateActions(state, { actorId, kind, pieceId: null, budget: 1 }, 1).length > 0;
    cache.set(key, exists);
  }
  return exists;
};

/** Cheap phase/actor filter before generating candidates. */
export const kindMayBeLegal = (state: GameState, actorId: PlayerId, kind: GameAction['kind']): boolean => {
  if (state.sequence.phase === 'COMPLETE') return false;
  if (state.pendingDecision !== null) {
    return kind === 'RESPOND_DECISION' ? state.pendingDecision.ownerId === actorId
      : kind === 'CANCEL_TRANSACTION' && state.activeTransaction?.ownerId === actorId
        && (state.activeTransaction.step === 'ATTACKER_SUPPLY' || state.activeTransaction.step === 'BARRAGE_SUPPLY');
  }
  if (state.activeTransaction !== null) return false;
  if (actorId !== state.sequence.actingPlayerId) return false;
  const { phase, segment } = state.sequence;
  switch (kind) {
    case 'ADVANCE_SEQUENCE': return true;
    case 'CHANGE_MODE': return phase === 'MOVEMENT' && segment === 'MOVEMENT';
    case 'RELEASE_RESERVE': return phase === 'REACTION' || phase === 'EXPLOITATION';
    case 'MOVE_PIECE':
    case 'END_MOVE':
    case 'CREATE_BREAKDOWN': return segment === 'MOVEMENT' && ['MOVEMENT', 'REACTION', 'EXPLOITATION'].includes(phase);
    case 'CHECK_SUPPLY': return phase === 'SUPPLY';
    case 'DECLARE_COMBAT': return (segment === 'COMBAT' && (phase === 'COMBAT' || phase === 'EXPLOITATION'))
      || (segment === 'MOVEMENT' && ['MOVEMENT', 'REACTION', 'EXPLOITATION'].includes(phase));
    case 'DECLARE_BARRAGE': return segment === 'BARRAGE' && ['REACTION', 'COMBAT', 'EXPLOITATION'].includes(phase);
    case 'PLACE_REINFORCEMENT': return phase === 'REINFORCEMENT';
    case 'PAY_FUEL':
    case 'BLOW_DUMP': return segment === 'MOVEMENT' && ['MOVEMENT', 'REACTION', 'EXPLOITATION'].includes(phase);
    case 'RECOVER_INTERNALS':
    case 'CHOOSE_FORMATION_TRACE': return phase === 'SUPPLY';
    case 'ATTEMPT_BREAKOUT': return phase === 'MOVEMENT' && segment === 'BREAKOUT';
    case 'LOAD_SUPPLY':
    case 'UNLOAD_SUPPLY':
    case 'COMBINE_TRANSPORT':
    case 'DIVIDE_TRANSPORT':
    case 'FORM_EXTENDER':
    case 'DISSOLVE_EXTENDER':
    case 'COLLAPSE_EXTENDER':
    case 'RAIL_MOVE':
    case 'SEA_MOVE':
    case 'REDUCE_PORT':
    case 'REPAIR_PORT': return phase === 'MOVEMENT' && segment === 'MOVEMENT';
    case 'REFIT_AIRCRAFT': return phase === 'AIRCRAFT_REFIT';
    case 'DECLARE_AIR_MISSION': return (segment === 'MOVEMENT' || segment === 'BARRAGE') && ['MOVEMENT', 'REACTION', 'EXPLOITATION'].includes(phase);
    case 'REDUCE_AIR_BASE':
    case 'BUILD_AIR_BASE':
    case 'BUILD_HEDGEHOG':
    case 'REDUCE_HEDGEHOG': return phase === 'MOVEMENT' && segment === 'MOVEMENT';
    case 'REBUILD_AIRCRAFT':
    case 'REBUILD_UNITS': return phase === 'REINFORCEMENT';
    case 'PLAN_AIR_DROP':
    case 'UPDATE_AIR_DROP_PLAN': return phase === 'AIRCRAFT_REFIT';
    case 'COMBINE_AIRCRAFT': return true;
    case 'RESPOND_DECISION':
    case 'COMMIT_TRANSACTION':
    case 'CANCEL_TRANSACTION': return false;
  }
};

export const actionFamilies = (state: GameState, actorId: PlayerId): readonly ActionFamily[] =>
  ALL_ACTION_KINDS.map((kind) => ({ kind, enabled: kindMayBeLegal(state, actorId, kind) && hasCandidate(state, actorId, kind) }));

/** True when the acting player has any legal choice other than ending the step. */
export const hasOptionalActions = (state: GameState): boolean => {
  if (state.pendingDecision !== null || state.activeTransaction !== null) return true;
  const actorId = state.sequence.actingPlayerId;
  return ALL_ACTION_KINDS.some((kind) => kind !== 'ADVANCE_SEQUENCE' && !NON_STOPPING_KINDS.includes(kind) && kindMayBeLegal(state, actorId, kind)
    && hasCandidate(state, actorId, kind));
};
