import type { HexId, Result } from '../core/index.js';
import type { ScenarioDefinition } from '../domain/scenario/index.js';
import { createInitialGameState, hexDistanceBetween, pieceHasTrace, derivePieceReTicks, type RuleConfiguration } from '../rules/index.js';
import { GENERATED_STACKING_LIMIT_RE_TICKS } from './configuration.js';
import type { GeneratedDeployment, GameFlowFailure } from './model.js';

/** Apply the same trace rules used in play, after rail control, HQs, sources and enemy ZOCs are composed. */
export const allocateGarrisonSupply = (
  scenario: ScenarioDefinition,
  configuration: RuleConfiguration,
  deployment: GeneratedDeployment,
): Result<GeneratedDeployment, readonly GameFlowFailure[]> => {
  const initial = createInitialGameState(scenario, configuration, 0);
  const fail = (message: string): Result<GeneratedDeployment, readonly GameFlowFailure[]> => ({ ok: false, error: [{
    stage: 'SCENARIO', code: 'GARRISON_SUPPLY_ALLOCATION_FAILED', message, path: ['deployment'],
  }] });
  if (!initial.ok) return fail('Cannot evaluate initial garrison supply on an invalid scenario.');
  let pieces = [...scenario.initialPieceState.pieces];
  const warnings = [...deployment.warnings];
  let cachedPieces = pieces;
  let cachedState = { ...initial.value, pieceState: { ...initial.value.pieceState, pieces } };
  const state = () => {
    if (cachedPieces !== pieces) {
      cachedPieces = pieces;
      cachedState = { ...initial.value, pieceState: { ...initial.value.pieceState, pieces } };
    }
    return cachedState;
  };
  const hexOf = (piece: (typeof pieces)[number]): HexId | null => piece.location.kind === 'ON_MAP' ? piece.location.hexId : null;
  const isGarrison = (piece: (typeof pieces)[number]): boolean => /:garrison:/.test(String(piece.id));
  const roadDegree = new Map<HexId, number>();
  const railHexes = new Set<string>();
  for (const edge of scenario.mapDefinition.hexsides) {
    const ends = String(edge.hexsideId).split('|');
    if (edge.featureDefinitionIds.some((id) => String(id).startsWith('edge:rail'))) ends.forEach((hex) => railHexes.add(hex));
    if (edge.featureDefinitionIds.some((id) => String(id).startsWith('edge:road'))) {
      ends.forEach((hex) => roadDegree.set(hex as HexId, (roadDegree.get(hex as HexId) ?? 0) + 1));
    }
  }
  // Keep security units at meaningful friendly nodes with trace supply. Relocate a disconnected junction
  // to the nearest eligible node; omit it with a warning if the map has no such node left.
  for (const original of pieces.filter((piece) => isGarrison(piece) && String(piece.id).includes(':key-point-'))) {
    if (pieceHasTrace(state(), original)) continue;
    const from = hexOf(original)!;
    const occupied = pieces.filter(isGarrison).filter((piece) => piece.id !== original.id).map(hexOf).filter((hex): hex is HexId => hex !== null);
    const candidates = scenario.mapDefinition.hexes.filter((hex) =>
      scenario.initialMapState.hexControl.some((entry) => entry.hexId === hex.id && entry.controllerId === original.ownerId)
      && !scenario.sources.some((source) => source.hexId === hex.id)
      && !pieces.some((piece) => piece.ownerId !== original.ownerId && hexOf(piece) === hex.id)
      && pieces.filter((piece) => hexOf(piece) === hex.id).reduce((sum, piece) => sum + derivePieceReTicks(state(), piece), 0)
        + derivePieceReTicks(state(), original) <= GENERATED_STACKING_LIMIT_RE_TICKS
      && ((roadDegree.get(hex.id) ?? 0) >= 3 || (railHexes.has(hex.id) && hex.features.some(({ definitionId }) =>
        ['settlement:village', 'settlement:town', 'settlement:city'].includes(String(definitionId)))))
      && occupied.every((other) => hexDistanceBetween(other, hex.id) >= 3))
      .sort((a, b) => hexDistanceBetween(from, a.id) - hexDistanceBetween(from, b.id) || String(a.id).localeCompare(String(b.id)));
    let destination: HexId | null = null;
    for (const hex of candidates) {
      const moved = { ...original, location: { kind: 'ON_MAP' as const, hexId: hex.id } };
      const trial = { ...state(), pieceState: { ...initial.value.pieceState, pieces: pieces.map((piece) => piece.id === original.id ? moved : piece) } };
      if (pieceHasTrace(trial, moved)) { destination = hex.id; break; }
    }
    const suffix = String(original.id).split(':key-point-')[1]!;
    const attached = (piece: (typeof pieces)[number]) => piece.id === original.id || String(piece.id).endsWith(`:key-point-hog-${suffix}`);
    if (destination === null) {
      pieces = pieces.filter((piece) => !attached(piece));
      warnings.push(`Omitted disconnected key-point garrison at ${from}: no spaced, friendly supply-connected node is available.`);
    } else {
      const target = destination;
      let order = Math.max(-1, ...pieces.filter((piece) => hexOf(piece) === target).map(({ stackOrder }) => stackOrder)) + 1;
      pieces = pieces.map((piece) => attached(piece) ? { ...piece, location: { kind: 'ON_MAP', hexId: target }, stackOrder: order++ } : piece);
    }
  }
  if (pieces.some((piece) => isGarrison(piece) && String(piece.id).includes(':key-point-') && !pieceHasTrace(state(), piece))) {
    return fail('A key-point garrison lost trace supply after the final deployment adjustment.');
  }
  const isolated = pieces.filter((piece) => isGarrison(piece) && String(piece.id).includes(':objective-') && !pieceHasTrace(state(), piece));
  const keepStocks = new Set(isolated.map((piece) => `${piece.ownerId}|${hexOf(piece)}`));
  pieces = pieces.filter((piece) => !String(piece.id).includes('-stock-')
    || (String(piece.id).includes(':objective-stock-') && keepStocks.has(`${piece.ownerId}|${hexOf(piece)}`)));
  // Reserve from on-map OOB dumps only; off-map aircraft cargo and future arrivals retain their own budgets.
  for (const owner of scenario.players.map(({ id }) => id)) {
    let owed = isolated.filter(({ ownerId }) => ownerId === owner).length;
    const dumpIds = pieces.filter((piece) => piece.ownerId === owner && piece.location.kind === 'ON_MAP'
      && !String(piece.id).includes('-stock-') && scenario.pieceCatalog.definitions.find(({ id }) => id === piece.definitionId)?.resource?.resourceDefinitionId === 'resource:supply')
      .sort((a, b) => (b.resourceQuantity ?? 0) - (a.resourceQuantity ?? 0) || String(a.id).localeCompare(String(b.id)))
      .map(({ id }) => id);
    for (const id of dumpIds) {
      if (owed === 0) break;
      pieces = pieces.map((piece) => {
        if (piece.id !== id) return piece;
        const taken = Math.min(owed, piece.resourceQuantity ?? 0);
        owed -= taken;
        return { ...piece, resourceQuantity: (piece.resourceQuantity ?? 0) - taken };
      });
    }
    if (owed > 0) return fail(`Existing on-map supply cannot fund ${owner}'s isolated VP emergency stocks.`);
  }
  const stackRe = new Map<HexId, number>();
  for (const piece of pieces) {
    const hex = hexOf(piece);
    if (hex !== null) stackRe.set(hex, (stackRe.get(hex) ?? 0) + derivePieceReTicks(state(), piece));
  }
  return { ok: true, value: { ...deployment, warnings,
    initialPieceState: { ...deployment.initialPieceState, pieces },
    metrics: { ...deployment.metrics, pieces: pieces.length,
      maximumStackReTicks: Math.max(0, ...stackRe.values()),
      occupiedHexes: new Set(pieces.map(hexOf).filter((hex) => hex !== null)).size,
      alliedPieces: pieces.filter(({ ownerId }) => String(ownerId) === 'player:allied').length,
      axisPieces: pieces.filter(({ ownerId }) => String(ownerId) === 'player:axis').length,
    },
  } };
};
