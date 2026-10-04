import type { HexId, PlayerId } from '../../core/index.js';
import { parseHexsideId, type MapDefinition } from '../../domain/map/index.js';
import type { GameState, RailroadConfiguration } from '../kernel/model.js';
import { faceMode, isHq, piecesAt } from '../pieces.js';
import { mapIndexOf } from '../terrain.js';
import { hasEnemyCombatUnit, queryZoc } from '../zoc/zoc.js';

/**
 * Railroads for trace supply (12.6a, 13.3c, 13.3h, 13.8c). A railroad is a hexside feature named by
 * the rule configuration; the rail graph joins the two Hexes of every railroad hexside.
 */

export interface RailNetwork {
  readonly neighbors: ReadonlyMap<HexId, readonly HexId[]>;
  /** Hexside keys `first|second` of multi-track railroad hexsides (13.3a). */
  readonly multiTrack: ReadonlySet<string>;
}

const EMPTY: RailNetwork = { neighbors: new Map(), multiTrack: new Set() };
const networks = new WeakMap<MapDefinition, WeakMap<RailroadConfiguration, RailNetwork>>();

const pairKey = (left: HexId, right: HexId): string => String(left) < String(right) ? `${left}|${right}` : `${right}|${left}`;

/** The rail graph of the game's map; empty when the game has no railroads. */
export const railNetworkOf = (state: Pick<GameState, 'scenario' | 'configuration'>): RailNetwork => {
  const railroads = state.configuration.railroads;
  if (!railroads || railroads.lines.length === 0) return EMPTY;
  let perMap = networks.get(state.scenario.mapDefinition);
  if (!perMap) { perMap = new WeakMap(); networks.set(state.scenario.mapDefinition, perMap); }
  const cached = perMap.get(railroads);
  if (cached) return cached;
  const lines = new Map(railroads.lines.map(({ featureDefinitionId, multiTrack }) => [String(featureDefinitionId), multiTrack]));
  const neighbors = new Map<HexId, HexId[]>();
  const multiTrack = new Set<string>();
  for (const { hexsideId, featureDefinitionIds } of state.scenario.mapDefinition.hexsides) {
    const kinds = featureDefinitionIds.map(String).filter((id) => lines.has(id));
    if (kinds.length === 0) continue;
    const parsed = parseHexsideId(hexsideId);
    if (!parsed.ok) continue;
    const { firstHexId, secondHexId } = parsed.value;
    for (const [from, to] of [[firstHexId, secondHexId], [secondHexId, firstHexId]] as const) {
      const list = neighbors.get(from) ?? [];
      list.push(to);
      neighbors.set(from, list);
    }
    if (kinds.some((kind) => lines.get(kind))) multiTrack.add(pairKey(firstHexId, secondHexId));
  }
  const network: RailNetwork = { neighbors, multiTrack };
  perMap.set(railroads, network);
  return network;
};

export const isRailHex = (state: GameState, hexId: HexId): boolean => railNetworkOf(state).neighbors.has(hexId);

/** True when the hexside between two adjacent Hexes carries a railroad. */
export const isRailHexside = (state: GameState, fromHexId: HexId, toHexId: HexId): boolean =>
  railNetworkOf(state).neighbors.get(fromHexId)?.includes(toHexId) ?? false;

export const isMultiTrackHexside = (state: GameState, fromHexId: HexId, toHexId: HexId): boolean =>
  railNetworkOf(state).multiTrack.has(pairKey(fromHexId, toHexId));

/** A rail Hex with a village, city or port (13.3c, first requirement without an HQ): a "station". */
export const isRailStation = (state: GameState, hexId: HexId): boolean => {
  if (!isRailHex(state, hexId)) return false;
  const detrainable = new Set((state.configuration.railroads?.detrainableFeatureDefinitionIds ?? []).map(String));
  return mapIndexOf(state).getHex(hexId)?.features.some(({ definitionId }) => detrainable.has(String(definitionId))) ?? false;
};

/**
 * 13.8c: an Engineer-Capable HQ (Combat Mode, or DG oriented toward Combat Mode per 5.10e) makes
 * the railroad Hex it occupies detrainable, at no SP cost.
 */
export const hasDetrainableHq = (state: GameState, playerId: PlayerId, hexId: HexId): boolean =>
  isRailHex(state, hexId) && piecesAt(state, hexId).some((piece) => piece.ownerId === playerId && isHq(state, piece)
    && (piece.mode === 'COMBAT' || (piece.mode === 'DG' && faceMode(piece) === 'COMBAT')));

export const hexControllerOf = (state: GameState, hexId: HexId): PlayerId | null =>
  state.mapState.hexControl.find((entry) => entry.hexId === hexId)?.controllerId ?? null;

/** 13.3c: what makes a rail Hex detrainable for `playerId`, before the rail path is checked. */
export const detrainableCandidate = (state: GameState, playerId: PlayerId, hexId: HexId): boolean =>
  (isRailStation(state, hexId) || hasDetrainableHq(state, playerId, hexId)) && hexControllerOf(state, hexId) === playerId;

/**
 * Can a trace rail path enter `hexId`? Not through an enemy combat unit (13.3e, 4.8 D lets it pass
 * enemy non-combat units), not into an un-negated enemy ZOC (13.3c: negation is allowed when
 * connecting to a supply source), and only into or through stations the player controls (13.3h).
 */
export const railTracePassable = (state: GameState, playerId: PlayerId, hexId: HexId): boolean =>
  !hasEnemyCombatUnit(state, playerId, hexId)
  && queryZoc(state, playerId, hexId, 'SUPPLY_PATH').allowed
  && (!isRailStation(state, hexId) || hexControllerOf(state, hexId) === playerId);

/**
 * Detrainable Hexes (13.3c) reached along railroads from `seeds`, which are rail Hexes already
 * connected to a supply source. Each Hex the rail path enters must be passable for trace.
 */
export const detrainableHexesFrom = (state: GameState, playerId: PlayerId, seeds: Iterable<HexId>): readonly HexId[] => {
  const { neighbors } = railNetworkOf(state);
  if (neighbors.size === 0) return [];
  const seen = new Set<HexId>();
  const queue: HexId[] = [];
  for (const seed of seeds) {
    if (!neighbors.has(seed) || seen.has(seed)) continue;
    seen.add(seed);
    queue.push(seed);
  }
  const found: HexId[] = [];
  for (let head = 0; head < queue.length; head += 1) {
    const hexId = queue[head]!;
    if (detrainableCandidate(state, playerId, hexId)) found.push(hexId);
    for (const next of neighbors.get(hexId) ?? []) {
      if (seen.has(next)) continue;
      seen.add(next);
      if (!railTracePassable(state, playerId, next)) continue;
      queue.push(next);
    }
  }
  return found.sort();
};
