import type { HexId, PieceId, PlayerId } from '../../core/index.js';
import { parseMapFeatureStateId, upsertMapFeatureState, type MapFeatureState } from '../../domain/map/index.js';
import { constructionHexes, hasConstructed, isEngineerCapable, largestFirstPayments } from '../air/construction.js';
import { hedgehogCrew, markWorkers, movedThisPhase, workerIssues } from '../hedgehog/hedgehog.js';
import type { GameAction, GameState, PortWork, RuleEvent, RuleViolation } from '../kernel/model.js';
import { definitionOf, pieceById } from '../pieces.js';
import { dumpsReaching, spendReservations } from '../supply/supply.js';
import { violation } from '../validation/violation.js';
import { PORT_FACILITY, allPorts, portAt, portHexOf, seaOf } from './state.js';
import { PORT_MAXIMUM_HITS } from '../tables/ocs-4.3.js';

/**
 * Port capture (9.14h), damage (19.0b), voluntary reduction (19.0c) and repair (19.0d). Ports are printed on the map; what
 * changes in play (who holds a port and its hits) lives in its map feature state (see ./state.ts).
 */

type Transition = { readonly state: GameState; readonly events: readonly RuleEvent[] };
type ReduceAction = Extract<GameAction, { readonly kind: 'REDUCE_PORT' }>;
type RepairAction = Extract<GameAction, { readonly kind: 'REPAIR_PORT' }>;

/** 19.0d: each hit costs 1 SP to repair. */
export const PORT_REPAIR_TOKENS = 4;

/** The runtime record of a printed port: who holds it at the start, its printed capacity in Tokens, no hits. */
export const portFeatureState = (hexId: HexId, capacityTokens: number, controllerId: PlayerId | null): MapFeatureState => {
  const id = parseMapFeatureStateId(`port:${hexId}`);
  if (!id.ok) throw new Error(`Port Hex ${hexId} gives an invalid feature ID.`);
  return {
    id: id.value, kind: 'FACILITY', definitionId: PORT_FACILITY as MapFeatureState['definitionId'], location: { kind: 'HEX', hexId },
    statusDefinitionIds: [], controllerId, level: capacityTokens, damage: 0,
  };
};

const withPort = (state: GameState, port: MapFeatureState): GameState => ({ ...state, mapState: upsertMapFeatureState(state.mapState, port) });

/**
 * 9.14h: an Attack-Capable unit entering a Hex with an enemy port captures it; the port serves its new owner at once for
 * shipping and, where the game makes it one, as a Supply Source. Damage stays (19.0b). Only Attack-Capable units may enter
 * the Hex at all (4.4c: movement, retreats and advances check that), so whoever enters captures.
 */
export const capturePort = (state: GameState, capturerId: PlayerId, hexId: HexId, events: RuleEvent[]): GameState => {
  const port = portAt(state, hexId);
  if (!port || port.controllerId === capturerId) return state;
  events.push({ kind: 'PORT_CAPTURED', sequence: events.length, hexId, capturerId });
  return withPort(state, { ...port, controllerId: capturerId });
};

/** 19.0b: add hits to a port, never more than four. */
export const damagePort = (state: GameState, hexId: HexId, hits: number, cause: 'BARRAGE' | 'REDUCTION', events: RuleEvent[]): GameState => {
  const port = portAt(state, hexId);
  if (!port || hits <= 0) return state;
  const damage = Math.min(PORT_MAXIMUM_HITS, port.damage + hits);
  if (damage === port.damage) return state;
  events.push({ kind: 'PORT_DAMAGED', sequence: events.length, hexId, hits: damage, cause });
  return withPort(state, { ...port, damage });
};

const workedThisTurn = (state: GameState, hexId: HexId, kind: PortWork['kind']): boolean =>
  seaOf(state).work.some((entry) => entry.hexId === hexId && entry.kind === kind && entry.gameTurn === state.sequence.gameTurn);

const recordWork = (state: GameState, hexId: HexId, kind: PortWork['kind']): GameState => {
  const sea = seaOf(state);
  return { ...state, sea: { ...sea, work: [...sea.work.filter(({ gameTurn }) => gameTurn === state.sequence.gameTurn), { hexId, gameTurn: state.sequence.gameTurn, kind }] } };
};

const workPhase = (state: GameState, actorId: PlayerId, rule: string): RuleViolation[] => {
  const { phase, segment, phasingPlayerId } = state.sequence;
  return phase !== 'MOVEMENT' || segment !== 'MOVEMENT' || actorId !== phasingPlayerId
    ? [violation('INVALID_PORT_WORK_PHASE', ['sequence'], 'Ports are reduced and repaired only in your own Movement Phase.', rule)]
    : [];
};

const friendlyPort = (state: GameState, actorId: PlayerId, hexId: HexId, rule: string): RuleViolation | null => {
  const port = portAt(state, hexId);
  if (!port) return violation('NO_PORT', ['hexId'], 'There is no port in that Hex.', '19.0');
  return port.controllerId === actorId ? null : violation('PORT_NOT_FRIENDLY', ['hexId'], 'Only a port you hold can be worked on.', rule);
};

/** Why a hit cannot be inflicted on the friendly port in `hexId` now (crew aside), or null. */
export const portReductionProblem = (state: GameState, actorId: PlayerId, hexId: HexId): RuleViolation | null => {
  const problem = friendlyPort(state, actorId, hexId, '19.0c');
  if (problem) return problem;
  if (portAt(state, hexId)!.damage >= PORT_MAXIMUM_HITS) return violation('PORT_FULLY_DAMAGED', ['hexId'], `A port can never hold more than ${PORT_MAXIMUM_HITS} hits.`, '19.0b');
  if (workedThisTurn(state, hexId, 'REDUCE')) return violation('PORT_REDUCED_THIS_TURN', ['hexId'], 'No more than 1 hit per turn can be inflicted on a port by its own side.', '19.0c');
  return null;
};

export const validateReducePort = (state: GameState, action: ReduceAction): readonly RuleViolation[] => {
  const issues = workPhase(state, action.actorId, '19.0c');
  const problem = portReductionProblem(state, action.actorId, action.hexId);
  if (problem) return [...issues, problem];
  return [...issues, ...workerIssues(state, action.actorId, action.hexId, action.pieceIds, action.engineerId, '19.0c')];
};

export const applyReducePort = (state: GameState, action: ReduceAction): Transition => {
  const events: RuleEvent[] = [];
  const damaged = damagePort(state, action.hexId, 1, 'REDUCTION', events);
  return { state: recordWork(markWorkers(damaged, action.pieceIds, action.engineerId), action.hexId, 'REDUCE'), events };
};

/** Why the friendly port in `hexId` cannot be repaired now (engineer and payment aside), or null. */
export const portRepairProblem = (state: GameState, actorId: PlayerId, hexId: HexId): RuleViolation | null => {
  const problem = friendlyPort(state, actorId, hexId, '19.0d');
  if (problem) return problem;
  if (portAt(state, hexId)!.damage <= 0) return violation('PORT_NOT_DAMAGED', ['hexId'], 'The port has no hits to repair.', '19.0d');
  if (workedThisTurn(state, hexId, 'REPAIR')) return violation('PORT_REPAIRED_THIS_TURN', ['hexId'], 'Only one hit per port can be repaired in a given turn.', '19.0d');
  return null;
};

/** Dumps that can pay a port repair (12.3 Direct Draw or HQ Throw to the port Hex). */
export const portRepairSources = (state: GameState, playerId: PlayerId, hexId: HexId) => dumpsReaching(state, playerId, hexId);

export const validateRepairPort = (state: GameState, action: RepairAction): readonly RuleViolation[] => {
  const issues = workPhase(state, action.actorId, '19.0d');
  const problem = portRepairProblem(state, action.actorId, action.hexId);
  if (problem) return [...issues, problem];
  issues.push(...workerIssues(state, action.actorId, action.hexId, [], action.engineerId, '19.0d'));
  const sources = portRepairSources(state, action.actorId, action.hexId);
  let total = 0;
  const used = new Set<PieceId>();
  for (const [index, payment] of action.payments.entries()) {
    const source = sources.find(({ pieceId }) => pieceId === payment.sourcePieceId);
    if (!source || used.has(payment.sourcePieceId) || !Number.isInteger(payment.tokens) || payment.tokens <= 0 || payment.tokens > source.availableQuantity) {
      issues.push(violation('CONSTRUCTION_SUPPLY_UNAVAILABLE', ['payments', index], 'Pay from distinct dumps whose supply can be drawn or thrown to the port.', '12.9'));
    } else {
      used.add(payment.sourcePieceId);
      total += payment.tokens;
    }
  }
  if (total !== PORT_REPAIR_TOKENS) issues.push(violation('CONSTRUCTION_COST', ['payments'], `Repairing a port hit costs exactly ${PORT_REPAIR_TOKENS}T (1 SP) of supply (${total}T offered).`, '19.0d'));
  return issues;
};

export const applyRepairPort = (state: GameState, action: RepairAction): Transition => {
  const events: RuleEvent[] = [];
  let pieceState = state.pieceState;
  for (const payment of action.payments) {
    const dump = pieceById(state, payment.sourcePieceId)!;
    const unit = definitionOf(state, dump)!.resource!.unitDefinitionId;
    pieceState = spendReservations({ ...state, pieceState }, [{ resourcePieceId: dump.id, quantity: payment.tokens, unitDefinitionId: unit }]);
    events.push({ kind: 'SUPPLY_SPENT', sequence: events.length, resourcePieceId: dump.id, quantity: payment.tokens });
  }
  const port = portAt(state, action.hexId)!;
  const repaired = { ...port, damage: port.damage - 1 };
  events.push({ kind: 'PORT_REPAIRED', sequence: events.length, hexId: action.hexId, hits: repaired.damage });
  const next = withPort({ ...state, pieceState }, repaired);
  return { state: recordWork(markWorkers(next, [], action.engineerId), action.hexId, 'REPAIR'), events };
};

export interface PortWorkOption {
  readonly hexId: HexId;
  readonly pieceIds: readonly PieceId[];
  readonly engineerId: PieceId | null;
}

const readyEngineers = (state: GameState, playerId: PlayerId, pieceId: PieceId | null) => state.pieceState.pieces.filter((piece) =>
  piece.ownerId === playerId && (pieceId === null || piece.id === pieceId) && isEngineerCapable(state, piece) && !hasConstructed(state, piece.id) && !movedThisPhase(state, piece));

/** Friendly ports that could take a voluntary hit now (19.0c) and who would do it, crews in the port before engineers. */
export const portReduceOptions = (state: GameState, playerId: PlayerId, pieceId: PieceId | null): readonly PortWorkOption[] => {
  const ports = allPorts(state).map(portHexOf).filter((hexId) => portReductionProblem(state, playerId, hexId) === null);
  const options: PortWorkOption[] = [];
  for (const hexId of ports) {
    const crew = hedgehogCrew(state, playerId, hexId);
    if (crew && (pieceId === null || crew.includes(pieceId))) options.push({ hexId, pieceIds: crew, engineerId: null });
  }
  for (const engineer of readyEngineers(state, playerId, pieceId)) {
    const reach = new Set(constructionHexes(state, engineer));
    for (const hexId of ports.filter((candidate) => reach.has(candidate))) options.push({ hexId, pieceIds: [], engineerId: engineer.id });
  }
  return options;
};

/** Damaged friendly ports an engineer could repair now (19.0d), with a 1 SP payment from dumps that reach the port. */
export const portRepairOptions = (state: GameState, playerId: PlayerId, pieceId: PieceId | null): readonly (PortWorkOption & { readonly engineerId: PieceId; readonly payments: readonly { readonly sourcePieceId: PieceId; readonly tokens: number }[] })[] => {
  const ports = allPorts(state).map(portHexOf).filter((hexId) => portRepairProblem(state, playerId, hexId) === null);
  if (ports.length === 0) return [];
  const options: (PortWorkOption & { engineerId: PieceId; payments: readonly { sourcePieceId: PieceId; tokens: number }[] })[] = [];
  for (const engineer of readyEngineers(state, playerId, pieceId)) {
    const reach = new Set(constructionHexes(state, engineer));
    for (const hexId of ports.filter((candidate) => reach.has(candidate))) {
      const payments = largestFirstPayments(state, playerId, hexId, PORT_REPAIR_TOKENS);
      if (payments) options.push({ hexId, pieceIds: [], engineerId: engineer.id, payments });
    }
  }
  return options;
};
