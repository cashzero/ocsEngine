import type { HexId, PlayerId } from '../../core/index.js';
import type { PieceState } from '../../domain/piece/index.js';
import type { GameState, GroundCondition, MobilityType } from '../kernel/model.js';
import { hexOf, isEngineerCapable, usageOf } from '../pieces.js';
import { hexsideFeatureIds, movementCostModel, supplyPathCostModel, type MovementCostModel } from '../terrain.js';

/**
 * Bridging (13.8b). An Engineer-Capable unit downgrades the river hexsides of its own hex: a Major River costs what a
 * Minor River does and a Minor River costs nothing extra. Only friendly units moving into or out of its hex benefit,
 * there is no SP cost, and the bridge disappears the instant the unit is no longer Engineer-Capable (except that the
 * unit may still use it to leave the hex after changing mode, recorded as `ownBridgeHexId`).
 *
 * Project interpretations (docs/roadmap/16-bridging-wbs.md §1):
 * - bridges stand where the Engineer-Capable units stand when a move is checked: a moving Engineer-Capable unit bridges
 *   its first step out of its hex, not every river along its path;
 * - trace, draw and throw paths (12.3d) are "counted like movement", so they use friendly bridges too (the 12.3
 *   "Maximum Stretch of HQs" example speaks of an HQ-bridge for trace supply);
 * - retreats and breakout paths are movement and use friendly bridges; overruns never do (8.1c).
 */

/** Hexes holding the player's Engineer-Capable units, per piece state (a new piece state is a new game position). */
const bridgeCache = new WeakMap<GameState['pieceState'], Map<PlayerId, ReadonlySet<HexId>>>();

const EMPTY: ReadonlySet<HexId> = new Set();

/** Whether the game lets anyone bridge: generated games list their rivers, older saves and fixtures may not. */
export const bridgingEnabled = (state: Pick<GameState, 'configuration'>): boolean => {
  const rivers = state.configuration.rivers;
  return rivers !== undefined && rivers.minorFeatureDefinitionIds.length + rivers.majorFeatureDefinitionIds.length > 0;
};

/** Hexes where the player's Engineer-Capable units bridge rivers now (13.8b). */
export const bridgeHexes = (state: GameState, playerId: PlayerId): ReadonlySet<HexId> => {
  if (!bridgingEnabled(state)) return EMPTY;
  let perPlayer = bridgeCache.get(state.pieceState);
  if (!perPlayer) { perPlayer = new Map(); bridgeCache.set(state.pieceState, perPlayer); }
  let hexes = perPlayer.get(playerId);
  if (!hexes) {
    hexes = new Set(state.pieceState.pieces.flatMap((piece) =>
      piece.ownerId === playerId && isEngineerCapable(state, piece) ? [hexOf(piece)!] : []));
    perPlayer.set(playerId, hexes);
  }
  return hexes;
};

/** Whether the hexside between two adjacent hexes is a river Bridging can affect. */
export const isRiverHexside = (state: GameState, fromHexId: HexId, toHexId: HexId): boolean => {
  const rivers = state.configuration.rivers;
  if (!rivers) return false;
  const ids = new Set([...rivers.minorFeatureDefinitionIds, ...rivers.majorFeatureDefinitionIds].map(String));
  return hexsideFeatureIds(state, fromHexId, toHexId).some((id) => ids.has(id));
};

/** Whether a friendly unit stepping between the two hexes crosses a bridged river. */
export const isBridgedStep = (state: GameState, bridges: ReadonlySet<HexId>, fromHexId: HexId, toHexId: HexId): boolean =>
  (bridges.has(fromHexId) || bridges.has(toHexId)) && isRiverHexside(state, fromHexId, toHexId);

/** A cost model that uses `bridged` for steps into or out of a bridge hex and `normal` everywhere else. */
const combine = (normal: MovementCostModel, bridged: MovementCostModel, bridges: ReadonlySet<HexId>): MovementCostModel =>
  bridges.size === 0 ? normal : {
    evaluate: (fromHexId, toHexId) => bridges.has(fromHexId) || bridges.has(toHexId)
      ? bridged.evaluate(fromHexId, toHexId) : normal.evaluate(fromHexId, toHexId),
  };

/**
 * Movement costs for `mover`: friendly bridges where they stand, and the hex it may still leave by its own bridge
 * after a mode change (13.8b Exception).
 */
export const moverCostModel = (state: GameState, mover: PieceState, mobility: MobilityType, condition?: GroundCondition): MovementCostModel => {
  const normal = movementCostModel(state, mobility, true, condition);
  if (!bridgingEnabled(state)) return normal;
  const bridged = movementCostModel(state, mobility, true, condition, true);
  const friendly = bridgeHexes(state, mover.ownerId);
  const ownHex = usageOf(state, mover).ownBridgeHexId ?? null;
  const bridges = ownHex !== null && hexOf(mover) === ownHex ? new Set([...friendly, ownHex]) : friendly;
  return combine(normal, bridged, bridges);
};

/** Costs for paths that are not one unit's move (retreats, attacks, breakout paths): friendly bridges only. */
export const playerCostModel = (state: GameState, playerId: PlayerId, mobility: MobilityType): MovementCostModel => {
  const normal = movementCostModel(state, mobility);
  if (!bridgingEnabled(state)) return normal;
  return combine(normal, movementCostModel(state, mobility, true, state.weather.groundCondition, true), bridgeHexes(state, playerId));
};

/** Supply path costs (12.3d) with the player's bridges. */
export const playerSupplyPathCostModel = (state: GameState, playerId: PlayerId, mobility: MobilityType): MovementCostModel => {
  const normal = supplyPathCostModel(state, mobility);
  if (!bridgingEnabled(state)) return normal;
  return combine(normal, supplyPathCostModel(state, mobility, true), bridgeHexes(state, playerId));
};
