import type { DefinitionId, PlayerId } from '../../core/index.js';
import type { PieceState } from '../../domain/piece/index.js';
import type { GameState, LostTruckRecord } from '../kernel/model.js';
import { definitionOf, isTransportPoint } from '../pieces.js';

/** 13.5e: only trucks (Organic or regular), not wagons or mules, can be rebuilt. */
export const isTruck = (state: GameState, piece: PieceState): boolean =>
  isTransportPoint(state, piece) && definitionOf(state, piece)?.counter?.symbol === 'TRUCK';

/** 13.5e: record trucks a player lost to enemy action; Eq may rebuild that many points, never more. */
export const recordTrucksLost = (state: GameState, ownerId: PlayerId, definitionId: DefinitionId, points: number): GameState => {
  if (points <= 0) return state;
  const existing = state.replacements.lostTrucks.find((record) => record.ownerId === ownerId && record.definitionId === definitionId);
  const lostTrucks: LostTruckRecord[] = existing
    ? state.replacements.lostTrucks.map((record) => record === existing ? { ...record, points: record.points + points } : record)
    : [...state.replacements.lostTrucks, { ownerId, definitionId, points }];
  return { ...state, replacements: { ...state.replacements, lostTrucks } };
};

/** Truck points the player may rebuild (13.5e). */
export const lostTruckPoints = (state: GameState, playerId: PlayerId): number =>
  state.replacements.lostTrucks.filter(({ ownerId }) => ownerId === playerId).reduce((total, { points }) => total + points, 0);
