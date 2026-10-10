import type { HexId, PlayerId } from '../../core/index.js';
import type { MapFeatureState } from '../../domain/map/index.js';
import type { GameState, PortUse, SeaState } from '../kernel/model.js';
import { hasEnemyCombatUnit, inEnemyZoc } from '../zoc/zoc.js';

/**
 * Ports (19.0) as the rules see them. A port is printed on the map; its runtime record is a `FACILITY` map feature state
 * in the port Hex holding who controls it (9.14h), its printed capacity in Tokens (`level`, 19.0a) and its hits (`damage`,
 * 19.0b). One Token of capacity is a quarter point: it loads or unloads 1T of SP or a quarter RE (4.7a).
 */

export const PORT_FACILITY = 'facility:port';
/** 19.0b: a port never holds more than four hits. */
export const PORT_MAXIMUM_HITS = 4;
/** 19.0e: a port below 1 SP of capacity is no Supply Source. */
export const PORT_SOURCE_MINIMUM_TOKENS = 4;

const EMPTY_SEA: SeaState = { spent: [], portUse: [], work: [] };
export const seaOf = (state: GameState): SeaState => state.sea ?? EMPTY_SEA;

const portCache = new WeakMap<GameState['mapState'], ReadonlyMap<HexId, MapFeatureState>>();

const portsByHex = (state: GameState): ReadonlyMap<HexId, MapFeatureState> => {
  let ports = portCache.get(state.mapState);
  if (!ports) {
    ports = new Map(state.mapState.features
      .filter((feature) => feature.kind === 'FACILITY' && String(feature.definitionId) === PORT_FACILITY && feature.location.kind === 'HEX')
      .map((feature) => [(feature.location as { readonly hexId: HexId }).hexId, feature] as const));
    portCache.set(state.mapState, ports);
  }
  return ports;
};

export const allPorts = (state: GameState): readonly MapFeatureState[] => [...portsByHex(state).values()];

export const portAt = (state: GameState, hexId: HexId): MapFeatureState | undefined => portsByHex(state).get(hexId);

export const portHexOf = (port: MapFeatureState): HexId => (port.location as { readonly hexId: HexId }).hexId;

/**
 * 19.0b: each hit takes a quarter of the printed capacity, rounded to the nearest Token, so four hits close the port.
 * TODO(port-damage-chart): the generic hit effects are printed beside the Barrage vs Facility Table on chart page 4,
 * which is not transcribed in docs/rules/ocs-4.3-charts.md; this quarter-per-hit reading must be checked against it.
 */
export const portCapacityTokens = (port: MapFeatureState): number =>
  Math.round(port.level * (PORT_MAXIMUM_HITS - Math.min(PORT_MAXIMUM_HITS, port.damage)) / PORT_MAXIMUM_HITS);

/** A port is friendly to the player who controls it (9.14h). */
export const isFriendlyPort = (state: GameState, playerId: PlayerId, hexId: HexId): boolean => portAt(state, hexId)?.controllerId === playerId;

/**
 * 19.0a, 19.0f F: a port in an enemy ZOC (never negated for Sea Cap) or holding an enemy combat unit is shut down: its
 * capacity counts as zero for shipping.
 */
export const portShutForShipping = (state: GameState, playerId: PlayerId, hexId: HexId): boolean =>
  hasEnemyCombatUnit(state, playerId, hexId) || inEnemyZoc(state, playerId, hexId);

const samePhase = (state: GameState, use: PortUse): boolean => use.gameTurn === state.sequence.gameTurn
  && use.playerTurnIndex === state.sequence.playerTurnIndex && use.phase === state.sequence.phase;

/** Capacity the port has used this phase, and whether one oversized unit took all of it (19.0a). */
export const portUseThisPhase = (state: GameState, hexId: HexId): { readonly tokens: number; readonly oversized: boolean } => {
  const use = seaOf(state).portUse.find((entry) => entry.hexId === hexId && samePhase(state, entry));
  return { tokens: use?.tokens ?? 0, oversized: use?.oversized ?? false };
};

/** Tokens of capacity the port has left this phase for the player (0 when shut down or not friendly). */
export const portRemainingTokens = (state: GameState, playerId: PlayerId, hexId: HexId): number => {
  const port = portAt(state, hexId);
  if (!port || port.controllerId !== playerId || portShutForShipping(state, playerId, hexId)) return 0;
  const use = portUseThisPhase(state, hexId);
  return use.oversized ? 0 : Math.max(0, portCapacityTokens(port) - use.tokens);
};

/** Records `tokens` of capacity used at the port this phase. */
export const usePortCapacity = (state: GameState, hexId: HexId, tokens: number, oversized: boolean): GameState => {
  const sea = seaOf(state);
  const current = sea.portUse.filter((entry) => samePhase(state, entry));
  const existing = current.find((entry) => entry.hexId === hexId);
  const updated: PortUse = {
    hexId, gameTurn: state.sequence.gameTurn, playerTurnIndex: state.sequence.playerTurnIndex, phase: state.sequence.phase,
    tokens: (existing?.tokens ?? 0) + tokens, oversized: (existing?.oversized ?? false) || oversized,
  };
  return {
    ...state,
    sea: { ...sea, portUse: [...current.filter((entry) => entry !== existing), updated].sort((left, right) => String(left.hexId).localeCompare(String(right.hexId))) },
  };
};
