import { stableSort, type HexId, type PieceId, type PlayerId } from '../../core/index.js';
import { setHexControl } from '../../domain/map/index.js';
import { upsertPieceState } from '../../domain/piece/index.js';
import { parseRuleDecisionId } from '../kernel/ids.js';
import type {
  GameAction,
  GameState,
  PendingDecision,
  RuleEvent,
  RuleViolation,
  TurnSequenceState,
  VictoryState,
} from '../kernel/model.js';
import { rollTwoDice } from '../kernel/rng.js';
import {
  RETURN_TURN_STATUS,
  adjacentHexIds,
  nextOrderAt,
  definitionOf,
  faceMode,
  hexDistanceBetween,
  hexOf,
  isCombatUnit,
  mobilityOf,
  pieceById,
  returnTurnOf,
  withStatus,
} from '../pieces.js';
import { clearFuel } from '../supply/fuel.js';
import { violation } from '../validation/violation.js';
import { nextStackOrder } from '../combat/combat.js';
import { movementCostModel } from '../terrain.js';
import { determineSupply } from './supply-phase.js';
import { determineWeather } from './weather.js';

export const calculateVictory = (state: GameState): VictoryState => {
  const scores = state.scenario.players.map(({ id }) => ({
    playerId: id,
    points: state.configuration.objectives.reduce((total, objective) => {
      const controller = state.mapState.hexControl.find(({ hexId }) => hexId === objective.hexId)?.controllerId ?? null;
      return total + (controller === id ? objective.points : 0);
    }, 0),
  }));
  const ordered = stableSort(scores, (left, right) => right.points - left.points
    || String(left.playerId).localeCompare(String(right.playerId)));
  const winnerId = ordered.length > 0 && ordered[0]!.points > (ordered[1]?.points ?? -1) ? ordered[0]!.playerId : null;
  return { scores, winnerId, reason: null };
};

/** 2.3 Clean Up: the phasing player removes his DG and Exploit markers. */
const cleanupPlayer = (state: GameState, playerId: PlayerId, events: RuleEvent[]): GameState => {
  let pieceState = state.pieceState;
  for (const piece of state.pieceState.pieces.filter(({ ownerId }) => ownerId === playerId)) {
    if (piece.mode === 'DG' || piece.mode === 'EXPLOITATION') {
      const mode = faceMode(piece);
      pieceState = upsertPieceState(pieceState, { ...piece, mode });
      events.push({ kind: 'MODE_CHANGED', sequence: events.length, pieceId: piece.id, from: piece.mode, to: mode });
    }
  }
  events.push({ kind: 'CLEANUP_COMPLETED', sequence: events.length, playerId });
  const next = { ...state, pieceState };
  return { ...next, victory: calculateVictory(next) };
};

/**
 * 2.3 Reinforcement Phase: the phasing player rolls on his Supply Table. The new SP wait in his
 * reinforcement Box and must be placed at an entry Hex this phase (13.6).
 */
const arriveSupply = (state: GameState, playerId: PlayerId, events: RuleEvent[]): GameState => {
  const table = state.configuration.supplyArrivals;
  const entry = table?.players.find((candidate) => candidate.playerId === playerId);
  const boxId = state.configuration.reinforcementBoxes.find((candidate) => candidate.playerId === playerId)?.boxId;
  if (!table || !entry || !boxId) return state;
  const roll = rollTwoDice(state.rng);
  const row = table.rows.find(({ minimum, maximum }) => roll.roll.total >= minimum && roll.roll.total <= maximum);
  const points = row?.points[entry.status - 1] ?? 0;
  let next: GameState = { ...state, rng: roll.rng };
  if (points <= 0) return next;
  const definition = state.scenario.pieceCatalog.definitions.find(({ id }) => id === entry.resourceDefinitionId);
  if (!definition?.resource) throw new Error('Supply Table arrivals need a resource Definition.');
  const tokens = points * 4;
  const pieceId = `supply-arrival:${playerId}:${state.sequence.gameTurn}` as PieceId;
  next = {
    ...next,
    pieceState: upsertPieceState(next.pieceState, {
      id: pieceId, definitionId: definition.id, ownerId: playerId,
      location: { kind: 'OFF_MAP_BOX', boxId }, currentFaceId: definition.faces[0]?.id ?? null,
      remainingSteps: null, mode: null, statuses: [], resourceQuantity: tokens,
      stackOrder: nextOrderAt(next.pieceState.pieces, { kind: 'OFF_MAP_BOX', boxId }, pieceId),
    }),
  };
  events.push({ kind: 'SUPPLY_ARRIVED', sequence: events.length, playerId, pieceId, tokens, roll: roll.roll.total });
  return next;
};

const firstPlayerDecision = (state: GameState, winnerId: PlayerId): PendingDecision => {
  const id = parseRuleDecisionId(`decision:first-player:${state.sequence.gameTurn}:${state.rng.draws}`);
  if (!id.ok) throw new Error('First player decision ID is invalid.');
  return {
    id: id.value, kind: 'FIRST_PLAYER', ownerId: winnerId, transactionId: null,
    prompt: `You won the First Player roll for turn ${state.sequence.gameTurn}. Take the first or the second Player Turn?`,
    options: [{ id: 'first', label: 'Go first', hexId: null }, { id: 'second', label: 'Go second', hexId: null }],
  };
};

/**
 * 2.3 First Player Determination: each player rolls two dice, ties re-rolled, and the higher
 * roller elects. Turn 1 follows the Scenario's stated first player.
 */
const determineFirstPlayer = (state: GameState, events: RuleEvent[]): GameState => {
  if (state.sequence.gameTurn <= state.scenario.turnStart.turn) return state;
  const players = state.scenario.players.map(({ id }) => id);
  let rng = state.rng;
  for (let attempt = 0; attempt < 100; attempt += 1) {
    const rolls = players.map((playerId) => {
      const roll = rollTwoDice(rng);
      rng = roll.rng;
      return { playerId, total: roll.roll.total };
    });
    if (rolls[0]!.total === rolls[1]!.total) continue;
    const winnerId = rolls[0]!.total > rolls[1]!.total ? rolls[0]!.playerId : rolls[1]!.playerId;
    events.push({ kind: 'FIRST_PLAYER_ROLLED', sequence: events.length, rolls, winnerId });
    const next = {
      ...state, rng,
      sequence: { ...state.sequence, phasingPlayerId: winnerId, actingPlayerId: winnerId },
    };
    const decision = firstPlayerDecision(next, winnerId);
    events.push({ kind: 'DECISION_REQUESTED', sequence: events.length, decision });
    return { ...next, pendingDecision: decision };
  }
  throw new Error('First player roll did not resolve.');
};

export const resolveFirstPlayerDecision = (state: GameState, choiceId: string): GameState => {
  const chooser = state.pendingDecision!.ownerId;
  const opponent = state.scenario.players.find(({ id }) => id !== chooser)!.id;
  const first = choiceId === 'first' ? chooser : opponent;
  return {
    ...state,
    pendingDecision: null,
    sequence: { ...state.sequence, firstPlayerId: first, phasingPlayerId: first, actingPlayerId: first },
  };
};

/** Apply the hooks attached to leaving `state.sequence` and entering `to`. */
export const applySequenceLifecycle = (
  state: GameState,
  to: TurnSequenceState,
): { readonly state: GameState; readonly events: readonly RuleEvent[] } => {
  const from = state.sequence;
  const events: RuleEvent[] = [{ kind: 'SEQUENCE_ADVANCED', sequence: 0, from, to }];
  let next: GameState = { ...state, sequence: to, currentMoverId: null };
  if (from.phase === 'WEATHER') next = determineWeather(next, events);
  if (from.phase === 'SUPPLY') next = determineSupply(next, from.phasingPlayerId, events);
  if (from.phase === 'CLEAN_UP') next = clearFuel(cleanupPlayer(next, from.phasingPlayerId, events), from.phasingPlayerId);
  if (to.phase === 'SUPPLY' && from.phase !== 'SUPPLY') next = { ...next, formationTraces: [] };
  if (to.phase === 'REINFORCEMENT' && from.phase !== 'REINFORCEMENT') next = arriveSupply(next, to.phasingPlayerId, events);
  if (from.phase !== to.phase || from.playerTurnIndex !== to.playerTurnIndex || from.gameTurn !== to.gameTurn) {
    // MA, attacks and barrages are all counted per phase (6.1b, 9.1c, 10.0e).
    next = { ...next, usage: [], ledger: { attackedHexIds: [], barragedHexIds: [] } };
  } else if (from.segment !== to.segment) {
    next = { ...next, ledger: { ...next.ledger, attackedHexIds: [] } };
  }
  if (to.phase === 'FIRST_PLAYER') next = determineFirstPlayer(next, events);
  if (to.phase === 'COMPLETE') {
    const victory: VictoryState = { ...calculateVictory(next), reason: 'TURN_LIMIT' };
    next = { ...next, victory };
    events.push({ kind: 'VICTORY_RECORDED', sequence: events.length, winnerId: victory.winnerId, reason: 'TURN_LIMIT' });
  }
  return { state: next, events };
};

const AWAITING_ENTRY = ['OFF_MAP_BOX', 'HOLDING_AREA', 'POOL', 'TURN_TRACK'];

/**
 * Units and SP of `playerId` due to enter this turn (13.6): Turn-track Pieces on their turn, units
 * returning from Breakout on their return turn (12.8e), and new SP (2.3).
 */
export const arrivingReinforcements = (state: GameState, playerId: PlayerId) =>
  state.pieceState.pieces.filter((piece) => piece.ownerId === playerId && AWAITING_ENTRY.includes(piece.location.kind)
    && (piece.location.kind !== 'TURN_TRACK' || piece.location.position <= state.sequence.gameTurn)
    && (returnTurnOf(piece) ?? 0) <= state.sequence.gameTurn
    && (isCombatUnit(state, piece) || definitionOf(state, piece)?.family === 'RESOURCE' || definitionOf(state, piece)?.family === 'GROUND'));

const blockedByEnemy = (state: GameState, playerId: PlayerId, hexId: HexId): boolean =>
  state.pieceState.pieces.some((other) => other.ownerId !== playerId && other.location.kind === 'ON_MAP' && other.location.hexId === hexId);

const isMapEdge = (state: GameState, hexId: HexId): boolean => {
  const onMap = new Set(state.scenario.mapDefinition.hexes.map(({ id }) => String(id)));
  return adjacentHexIds(hexId).filter((adjacent) => onMap.has(String(adjacent))).length < 6;
};

/**
 * 13.6b: an arrival goes to one of its side's entry Hexes; when an entry Hex is blocked by enemy
 * units, the nearest unblocked map-edge Hexes to it may be used instead. Hexes the unit could never
 * enter (prohibited terrain) are excluded.
 */
export const reinforcementHexes = (state: GameState, playerId: PlayerId, pieceId: PieceId | null = null): readonly HexId[] => {
  const piece = pieceId ? pieceById(state, pieceId) : undefined;
  const mobility = piece ? mobilityOf(state, piece) : null;
  const model = mobility ? movementCostModel(state, mobility, true, 'DRY') : null;
  const enterable = (hexId: HexId): boolean => model === null
    || adjacentHexIds(hexId).some((adjacent) => model.evaluate(adjacent, hexId).kind === 'COST');
  const entries = entryHexesFor(state, playerId).map(({ hexId }) => hexId);
  const open = entries.filter((hexId) => !blockedByEnemy(state, playerId, hexId));
  const blocked = entries.filter((hexId) => blockedByEnemy(state, playerId, hexId));
  const edge = state.scenario.mapDefinition.hexes.map(({ id }) => id)
    .filter((hexId) => isMapEdge(state, hexId) && !blockedByEnemy(state, playerId, hexId) && enterable(hexId));
  const substitutes = blocked.flatMap((hexId) => {
    const nearest = Math.min(...edge.map((candidate) => hexDistanceBetween(hexId, candidate)));
    return edge.filter((candidate) => hexDistanceBetween(hexId, candidate) === nearest);
  });
  return [...new Set([...open.filter(enterable), ...substitutes])].sort();
};

const entryHexesFor = (state: GameState, playerId: PlayerId) => {
  const side = state.scenario.players.find(({ id }) => id === playerId)?.sideDefinitionId ?? null;
  return state.scenario.entries.filter(({ sideDefinitionId }) => sideDefinitionId === null || sideDefinitionId === side);
};

export const validateReinforcementPlacement = (
  state: GameState,
  action: Extract<GameAction, { readonly kind: 'PLACE_REINFORCEMENT' }>,
): readonly RuleViolation[] => {
  const issues: RuleViolation[] = [];
  const piece = pieceById(state, action.pieceId);
  if (state.sequence.phase !== 'REINFORCEMENT' || action.actorId !== state.sequence.actingPlayerId) {
    issues.push(violation('INVALID_REINFORCEMENT_PHASE', ['sequence'], 'Reinforcements are placed in the friendly Reinforcement Phase.', '13.6'));
  }
  if (!piece || piece.ownerId !== action.actorId || !arrivingReinforcements(state, action.actorId).some(({ id }) => id === piece.id)) {
    issues.push(violation('PIECE_NOT_ARRIVING', ['pieceId'], 'This unit is not due to arrive now.', '13.6'));
  }
  if (!reinforcementHexes(state, action.actorId, action.pieceId).includes(action.hexId)) {
    issues.push(blockedByEnemy(state, action.actorId, action.hexId)
      ? violation('ENTRY_BLOCKED_BY_ENEMY', ['hexId'], 'An entry Hex holding enemy units is blocked; use the nearest unblocked map-edge Hex.', '13.6b')
      : violation('INVALID_REINFORCEMENT_ENTRY', ['hexId'], 'Hex is not an entry Hex for this side (or the nearest open map-edge Hex to a blocked one).', '13.6'));
  }
  // 4.8a/13.6a: stacking is not enforced in the Reinforcement Phase.
  return issues;
};

export const placeReinforcement = (
  state: GameState,
  action: Extract<GameAction, { readonly kind: 'PLACE_REINFORCEMENT' }>,
): { readonly state: GameState; readonly events: readonly RuleEvent[] } => {
  const piece = pieceById(state, action.pieceId)!;
  return {
    state: {
      ...state,
      pieceState: upsertPieceState(state.pieceState, {
        ...withStatus(piece, RETURN_TURN_STATUS, null),
        location: { kind: 'ON_MAP', hexId: action.hexId },
        stackOrder: nextStackOrder(state.pieceState.pieces, action.hexId, piece.id),
      }),
      mapState: setHexControl(state.mapState, action.hexId, action.actorId),
    },
    events: [{ kind: 'REINFORCEMENT_PLACED', sequence: 0, pieceId: action.pieceId, hexId: action.hexId }],
  };
};

/**
 * 4.8a: a Hex over 10 RE when a segment or phase ends (except the Reinforcement Phase) loses
 * units of its owner's choice. Returns the decision for the first such Hex, or null.
 */
export const overstackDecision = (state: GameState): PendingDecision | null => {
  if (state.sequence.phase === 'REINFORCEMENT') return null;
  // Either side can be overstacked (a defender's retreat, for example); the acting player goes first.
  const owners = [state.sequence.actingPlayerId, ...state.scenario.players.map(({ id }) => id).filter((id) => id !== state.sequence.actingPlayerId)];
  const owner = owners.find((playerId) => overstackedHexes(state, playerId).length > 0);
  if (!owner) return null;
  const [hexId] = overstackedHexes(state, owner);
  const units = state.pieceState.pieces.filter((piece) => piece.ownerId === owner && hexOf(piece) === hexId && isCombatUnit(state, piece));
  const id = parseRuleDecisionId(`decision:overstack:${state.revision}:${hexId}:${units.length}`);
  if (!id.ok) throw new Error('Overstack decision ID is invalid.');
  return {
    id: id.value, kind: 'OVERSTACK_ELIMINATION', ownerId: owner, transactionId: null,
    prompt: `Hex ${hexId} holds more than 10 RE as the step ends: choose a unit to eliminate.`,
    options: units.map((piece) => ({
      id: `eliminate:${piece.id}`,
      label: `Eliminate ${state.scenario.pieceCatalog.definitions.find(({ id: definitionId }) => definitionId === piece.definitionId)?.name ?? 'unit'}`,
      hexId: null,
    })),
  };
};

export const eliminateForOverstack = (state: GameState, choiceId: string): GameState => {
  const piece = pieceById(state, choiceId.slice('eliminate:'.length) as never);
  return piece
    ? { ...state, pendingDecision: null, pieceState: upsertPieceState(state.pieceState, { ...piece, location: { kind: 'ELIMINATED' } }) }
    : { ...state, pendingDecision: null };
};

/** Friendly Hexes over the stacking limit (4.8a), checked when a segment or phase ends. */
export const overstackedHexes = (state: GameState, playerId: PlayerId): readonly string[] => {
  const totals = new Map<string, number>();
  for (const piece of state.pieceState.pieces) {
    const hexId = hexOf(piece);
    if (piece.ownerId !== playerId || !hexId || !isCombatUnit(state, piece)) continue;
    const step = piece.remainingSteps;
    const definition = state.scenario.pieceCatalog.definitions.find(({ id }) => id === piece.definitionId);
    const ticks = Number(definition?.faces.find(({ id }) => id === piece.currentFaceId)?.steps
      .find(({ remainingSteps }) => remainingSteps === step)?.regimentalEquivalentTicks ?? 0);
    totals.set(hexId, (totals.get(hexId) ?? 0) + ticks);
  }
  return [...totals.entries()].filter(([, ticks]) => ticks > state.configuration.stackingLimitReTicks).map(([hexId]) => hexId).sort();
};
