import type { HexId, PieceId, PlayerId } from '../../core/index.js';
import type { PieceState } from '../../domain/piece/index.js';
import type { GameState } from '../kernel/model.js';
import type { RuleQueryResult } from '../query/model.js';
import {
  adjacentHexIds,
  enemyCombatUnitsAt,
  faceMode,
  friendlyCombatUnitsAt,
  isAttackCapable,
  isOutOfSupply,
} from '../pieces.js';

/**
 * What the enemy ZOC is being checked for (4.5a). Only Truck movement and supply paths can be
 * negated (4.5b); retreats (9.12e), Reserve/Strat mode changes (5.7c, 5.8a) and Strat movement never.
 */
export type ZocPurpose = 'TRUCK_MOVEMENT' | 'SUPPLY_PATH' | 'RETREAT' | 'MODE_CHANGE' | 'STRAT_MOVEMENT';

export interface ZocValue {
  readonly sourcePieceIds: readonly PieceId[];
  readonly negated: boolean;
  readonly negatorIds: readonly PieceId[];
  readonly purpose: ZocPurpose;
}

/**
 * 4.4b/4.5/5.9c: Attack-Capable units in Combat Mode that are not Out of Supply exert a ZOC. An
 * Exploit-marked unit keeps the ZOC it had, which follows its Combat-side orientation.
 */
export const exertsZoc = (state: GameState, piece: PieceState): boolean => {
  if (piece.location.kind !== 'ON_MAP' || isOutOfSupply(piece)) return false;
  const inCombatMode = piece.mode === 'COMBAT' || (piece.mode === 'EXPLOITATION' && faceMode(piece) === 'COMBAT');
  return inCombatMode && isAttackCapable(state, { ...piece, mode: 'COMBAT' });
};

export const zocSources = (state: GameState, friendlyPlayerId: PlayerId, hexId: HexId): readonly PieceState[] => {
  const adjacent = new Set(adjacentHexIds(hexId));
  return state.pieceState.pieces.filter((piece) => piece.ownerId !== friendlyPlayerId
    && piece.location.kind === 'ON_MAP' && adjacent.has(piece.location.hexId) && exertsZoc(state, piece));
};

const negatable = (purpose: ZocPurpose): boolean => purpose === 'TRUCK_MOVEMENT' || purpose === 'SUPPLY_PATH';

/**
 * Enemy ZOC in `hexId` for `friendlyPlayerId`. `excludedNegatorIds` removes units that cannot negate
 * (for instance the moving unit itself, or units that will still spend MP this phase).
 */
export const queryZoc = (
  state: GameState,
  friendlyPlayerId: PlayerId,
  hexId: HexId,
  purpose: ZocPurpose,
  excludedNegatorIds: ReadonlySet<PieceId> = new Set(),
): RuleQueryResult<ZocValue> => {
  const sources = zocSources(state, friendlyPlayerId, hexId);
  const negators = negatable(purpose)
    ? friendlyCombatUnitsAt(state, friendlyPlayerId, hexId).filter(({ id }) => !excludedNegatorIds.has(id))
    : [];
  const negated = sources.length > 0 && negators.length > 0;
  const effective = negated ? [] : sources;
  return {
    allowed: effective.length === 0,
    value: {
      sourcePieceIds: effective.map(({ id }) => id),
      negated,
      negatorIds: negated ? negators.map(({ id }) => id) : [],
      purpose,
    },
    reasons: [{
      code: effective.length === 0 ? (negated ? 'ENEMY_ZOC_NEGATED' : 'NO_ENEMY_ZOC') : 'ENEMY_ZOC_PRESENT',
      allowed: effective.length === 0,
      message: effective.length === 0 ? (negated ? 'Enemy ZOC is negated by a friendly combat unit.' : 'No enemy ZOC.') : `${effective.length} enemy unit(s) exert ZOC.`,
      rule: negated ? '4.5b' : '4.5',
    }],
    facts: [{ key: 'zoc.sourceCount', value: effective.length, visibility: 'PUBLIC', ownerId: null }],
    dependencies: [{ aggregate: 'PIECE', revision: state.pieceState.revision, key: `zoc:${purpose}:${hexId}` }],
  };
};

/** True when any enemy unit exerts a ZOC into the Hex, ignoring negation. */
export const inEnemyZoc = (state: GameState, friendlyPlayerId: PlayerId, hexId: HexId): boolean =>
  zocSources(state, friendlyPlayerId, hexId).length > 0;

/** Hexes holding an enemy combat unit block supply paths and movement (6.3, 12.3d). */
export const hasEnemyCombatUnit = (state: GameState, friendlyPlayerId: PlayerId, hexId: HexId): boolean =>
  enemyCombatUnitsAt(state, friendlyPlayerId, hexId).length > 0;
