import {
  HEX_DIRECTIONS,
  formatHexId,
  neighbor,
  parseDefinitionId,
  parseHexCoordinateId,
  stableSort,
  type HexId,
  type PieceId,
  type PlayerId,
} from '../../core/index.js';
import { createMapDefinitionIndex } from '../../domain/map/index.js';
import { createPieceDefinitionCatalogIndex, type PieceState } from '../../domain/piece/index.js';
import type { GameState, RuleViolation } from '../kernel/model.js';
import type { RuleQueryResult } from '../query/model.js';
import { derivePieceReTicks } from '../stacking/stacking.js';
import { violation } from '../validation/violation.js';
import { queryZoc } from '../zoc/zoc.js';

export type SupplyPurpose = 'TRACE' | 'COMBAT' | 'BARRAGE' | 'FUEL';

export interface ResourceSourceCandidate {
  readonly pieceId: PieceId;
  readonly availableQuantity: number;
  readonly distance: number;
}

export interface SupplyValue {
  readonly method: 'SOURCE' | 'HQ' | 'DUMP' | 'NONE';
  readonly path: readonly HexId[];
  readonly resourceSources: readonly ResourceSourceCandidate[];
  readonly requiresPayment: boolean;
}

export const resolvedPieceHex = (
  state: GameState,
  piece: PieceState,
  visited: ReadonlySet<PieceId> = new Set(),
): HexId | null => {
  const location = piece.location;
  switch (location.kind) {
    case 'ON_MAP': return location.hexId;
    case 'OFF_MAP_BOX':
    case 'HOLDING_AREA': return state.scenario.boxes.find(({ id }) => id === location.boxId)?.linkedHexId ?? null;
    case 'CONTAINER': {
      if (visited.has(piece.id)) return null;
      const container = state.pieceState.pieces.find(({ id }) => id === location.containerId);
      return container
        ? resolvedPieceHex(state, container, new Set([...visited, piece.id]))
        : null;
    }
    case 'TURN_TRACK':
    case 'POOL':
    case 'ELIMINATED': return null;
  }
};

const availableResourceQuantity = (state: GameState, piece: PieceState): number => {
  const reserved = state.activeTransaction?.reservations
    .filter(({ resourcePieceId }) => resourcePieceId === piece.id)
    .reduce((total, reservation) => total + reservation.quantity, 0) ?? 0;
  return Math.max(0, (piece.resourceQuantity ?? 0) - reserved);
};

export const queryResourceSources = (
  state: GameState,
  actorId: PlayerId,
  targetHexId: HexId,
  requiredQuantity: number,
): readonly ResourceSourceCandidate[] => {
  const target = parseHexCoordinateId(targetHexId);
  if (!target.ok) return [];
  const catalog = createPieceDefinitionCatalogIndex(state.scenario.pieceCatalog);
  return stableSort(state.pieceState.pieces.flatMap((piece) => {
    if (piece.ownerId !== actorId || catalog.get(piece.definitionId)?.family !== 'RESOURCE') return [];
    const sourceHex = resolvedPieceHex(state, piece);
    const sourceCoordinate = sourceHex ? parseHexCoordinateId(sourceHex) : undefined;
    const available = availableResourceQuantity(state, piece);
    if (!sourceCoordinate?.ok || available < requiredQuantity) return [];
    const dq = sourceCoordinate.value.q - target.value.q;
    const dr = sourceCoordinate.value.r - target.value.r;
    const distance = (Math.abs(dq) + Math.abs(dr) + Math.abs(dq + dr)) / 2;
    return distance <= state.configuration.supplyTraceRange
      ? [{ pieceId: piece.id, availableQuantity: available, distance }]
      : [];
  }), (left, right) => left.distance - right.distance || String(left.pieceId).localeCompare(String(right.pieceId)));
};

const findSupplyPath = (
  state: GameState,
  actorId: PlayerId,
  origin: HexId,
  targets: ReadonlySet<HexId>,
): readonly HexId[] => {
  const map = createMapDefinitionIndex(state.scenario.mapDefinition);
  const queue: Array<readonly HexId[]> = [[origin]];
  const visited = new Set<HexId>();
  while (queue.length > 0) {
    const path = queue.shift()!;
    const current = path.at(-1)!;
    if (visited.has(current)) continue;
    visited.add(current);
    if (targets.has(current)) return path;
    if (path.length - 1 >= state.configuration.supplyTraceRange) continue;
    const coordinate = parseHexCoordinateId(current);
    if (!coordinate.ok) continue;
    for (const direction of HEX_DIRECTIONS) {
      const next = formatHexId(neighbor(coordinate.value, direction));
      if (visited.has(next) || !map.getHex(next)) continue;
      const enemyCombat = state.pieceState.pieces.some((piece) => piece.ownerId !== actorId
        && piece.location.kind === 'ON_MAP' && piece.location.hexId === next
        && createPieceDefinitionCatalogIndex(state.scenario.pieceCatalog).get(piece.definitionId)?.family === 'GROUND');
      if (enemyCombat || !queryZoc(state, actorId, next, 'SUPPLY').allowed) continue;
      queue.push([...path, next]);
    }
  }
  return [];
};

const hqPieces = (state: GameState, actorId: PlayerId): readonly PieceState[] => {
  const catalog = createPieceDefinitionCatalogIndex(state.scenario.pieceCatalog);
  return state.pieceState.pieces.filter((piece) => piece.ownerId === actorId
    && piece.mode !== 'STRAT'
    && catalog.get(piece.definitionId)?.capabilities.some(({ id }) => id === 'HQ'));
};

export const querySupply = (
  state: GameState,
  actorId: PlayerId,
  pieceId: PieceId,
  purpose: SupplyPurpose,
  requiredQuantity = 1,
): RuleQueryResult<SupplyValue> => {
  const piece = state.pieceState.pieces.find(({ id }) => id === pieceId);
  const origin = piece ? resolvedPieceHex(state, piece) : null;
  if (!piece || piece.ownerId !== actorId || origin === null) {
    return {
      allowed: false,
      value: { method: 'NONE', path: [], resourceSources: [], requiresPayment: false },
      reasons: [{ code: 'SUPPLY_CONSUMER_UNAVAILABLE', allowed: false, message: 'Consumer is absent, not owned, or has no supply location.', rule: '12.3' }],
      facts: [], dependencies: [],
    };
  }
  const sourceHexes = new Set(state.scenario.sources.map(({ hexId }) => hexId));
  const direct = findSupplyPath(state, actorId, origin, sourceHexes);
  if (direct.length > 0) {
    return {
      allowed: true,
      value: { method: 'SOURCE', path: direct, resourceSources: [], requiresPayment: false },
      reasons: [{ code: 'DIRECT_TRACE_SUPPLY', allowed: true, message: 'A direct trace path reaches a declared Source.', rule: '12.6a' }],
      facts: [{ key: 'supply.pathLength', value: direct.length - 1, visibility: 'OWNER_ONLY', ownerId: actorId }],
      dependencies: [{ aggregate: 'PIECE', revision: state.pieceState.revision, key: `supply:${purpose}:${pieceId}` }],
    };
  }
  for (const hq of hqPieces(state, actorId)) {
    const hqHex = resolvedPieceHex(state, hq);
    if (!hqHex) continue;
    const toHq = findSupplyPath(state, actorId, origin, new Set([hqHex]));
    const hqToSource = findSupplyPath(state, actorId, hqHex, sourceHexes);
    if (toHq.length > 0 && hqToSource.length > 0) {
      return {
        allowed: true,
        value: { method: 'HQ', path: [...toHq, ...hqToSource.slice(1)], resourceSources: [], requiresPayment: false },
        reasons: [{ code: 'HQ_TRACE_SUPPLY', allowed: true, message: `Supply is relayed through ${hq.id}.`, rule: '12.3b' }],
        facts: [{ key: 'supply.hq', value: hq.id, visibility: 'OWNER_ONLY', ownerId: actorId }],
        dependencies: [{ aggregate: 'PIECE', revision: state.pieceState.revision, key: `supply:${purpose}:${pieceId}` }],
      };
    }
  }
  const resources = queryResourceSources(state, actorId, origin, requiredQuantity);
  const available = resources.length > 0;
  return {
    allowed: available,
    value: { method: available ? 'DUMP' : 'NONE', path: [], resourceSources: resources, requiresPayment: available },
    reasons: [{
      code: available ? 'DUMP_SUPPLY_AVAILABLE' : 'NO_SUPPLY_PATH_OR_DUMP',
      allowed: available,
      message: available ? 'On-map supply can be spent.' : 'No trace path or eligible on-map supply.',
      rule: available ? '12.6c' : '12.6d',
    }],
    facts: [{ key: 'supply.resourceChoices', value: resources.length, visibility: 'OWNER_ONLY', ownerId: actorId }],
    dependencies: [{ aggregate: 'PIECE', revision: state.pieceState.revision, key: `supply:${purpose}:${pieceId}` }],
  };
};

export const supplyCheckCost = (state: GameState, pieceIds: readonly PieceId[]): number => {
  const ticks = state.pieceState.pieces
    .filter(({ id }) => pieceIds.includes(id))
    .reduce((total, piece) => total + derivePieceReTicks(state, piece), 0);
  return Math.max(1, Math.ceil(ticks / 8));
};

export const validateSupplyCheck = (
  state: GameState,
  actorId: PlayerId,
  pieceIds: readonly PieceId[],
  sourcePieceId: PieceId | null,
): readonly RuleViolation[] => {
  const issues: RuleViolation[] = [];
  if (state.sequence.phase !== 'SUPPLY' || actorId !== state.sequence.actingPlayerId) {
    issues.push(violation('INVALID_SUPPLY_PHASE_OR_ACTOR', ['sequence'], 'Supply checks require the friendly Supply Phase.', '12.6'));
  }
  if (pieceIds.length === 0 || new Set(pieceIds).size !== pieceIds.length) {
    issues.push(violation('INVALID_SUPPLY_CONSUMERS', ['pieceIds'], 'Supply consumers must be a non-empty unique list.', '12.6'));
  }
  const pieces = pieceIds.map((id) => state.pieceState.pieces.find((piece) => piece.id === id));
  if (pieces.some((piece) => !piece || piece.ownerId !== actorId)) {
    issues.push(violation('INVALID_SUPPLY_CONSUMER', ['pieceIds'], 'All consumers must exist and be owned by actor.', '12.6'));
  }
  const unsupplied = pieceIds.filter((id) => !querySupply(state, actorId, id, 'TRACE').allowed
    || querySupply(state, actorId, id, 'TRACE').value?.requiresPayment);
  if (unsupplied.length > 0) {
    if (sourcePieceId === null) issues.push(violation('SUPPLY_PAYMENT_REQUIRED', ['sourcePieceId'], 'On-map supply payment is required.', '12.6c'));
    else {
      const target = pieces.find((piece): piece is PieceState => piece !== undefined);
      const targetHex = target ? resolvedPieceHex(state, target) : null;
      const cost = supplyCheckCost(state, pieceIds);
      if (!targetHex || !queryResourceSources(state, actorId, targetHex, cost)
        .some(({ pieceId }) => pieceId === sourcePieceId)) {
        issues.push(violation('INVALID_SUPPLY_SOURCE', ['sourcePieceId'], 'Chosen supply source is unavailable.', '12.6c'));
      }
    }
  } else if (sourcePieceId !== null) {
    issues.push(violation('UNNEEDED_SUPPLY_PAYMENT', ['sourcePieceId'], 'Trace-supplied consumers do not spend on-map supply.', '12.6'));
  }
  return issues;
};

export const outOfSupplyStatusId = (() => {
  const parsed = parseDefinitionId('status:out-of-supply');
  if (!parsed.ok) throw new Error('Out-of-supply status ID is invalid.');
  return parsed.value;
})();
