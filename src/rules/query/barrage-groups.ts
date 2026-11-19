import type { HexId, PlayerId } from '../../core/index.js';
import type { PieceState } from '../../domain/piece/index.js';
import { barrageFirerViolations, barrageTargetShifts } from '../combat/combat.js';
import type { GameState } from '../kernel/model.js';
import { barrageStrengthOf } from '../pieces.js';
import { availableTokens, isFriendlyDump, routesFromDump } from '../supply/supply.js';
import { BARRAGE_TABLE_COLUMNS, barrageColumnIndex, roundOcs } from '../tables/ocs-4.3.js';

interface SupplyGroup {
  tokens: number;
  readonly guns: Set<PieceState>;
}

/** A direct draw uses one dump. An HQ draws from several dumps and throws to the same guns from each of them. */
export const artillerySupplyGroups = (
  state: GameState, actorId: PlayerId, artillery: readonly PieceState[],
): readonly SupplyGroup[] => {
  const groups = new Map<string, SupplyGroup>();
  for (const dump of state.pieceState.pieces) {
    if (!isFriendlyDump(state, actorId, dump)) continue;
    const tokens = availableTokens(state, dump);
    if (tokens === 0) continue;
    const counted = new Set<string>();
    for (const gun of artillery) {
      for (const route of routesFromDump(state, dump, gun)) {
        const key = route.method === 'DRAW' ? `dump:${dump.id}` : `hq:${route.hqId}`;
        const group = groups.get(key) ?? { tokens: 0, guns: new Set<PieceState>() };
        if (!counted.has(key)) group.tokens += tokens;
        counted.add(key);
        group.guns.add(gun);
        groups.set(key, group);
      }
    }
  }
  return [...groups.values()];
};

/** Keep the strongest result column per price, using fewer guns on a tie. */
export const groundBarrageGroups = (
  state: GameState, actorId: PlayerId, targetHexId: HexId, inRange: readonly PieceState[],
  supplyGroups: readonly SupplyGroup[],
): readonly (readonly PieceState[])[] => {
  if (state.ledger.barragedHexIds.includes(targetHexId)) return [];
  const eligible = inRange.filter((gun) => barrageFirerViolations(state, actorId, targetHexId, gun).length === 0);
  if (eligible.length === 0) return [];
  const { shifts } = barrageTargetShifts(state, actorId, targetHexId);
  const shift = shifts.reduce((total, entry) => total + entry.shift, 0);
  const lastColumn = BARRAGE_TABLE_COLUMNS.length - 1;
  const maxStrength = BARRAGE_TABLE_COLUMNS[lastColumn]!.minimumStrength;
  const byPrice = new Map<number, { column: number; guns: readonly PieceState[] }>();
  for (const supply of supplyGroups) {
    // Build one shortest group per attainable strength. Beyond the top table column, all strengths are equivalent.
    const byStrength = new Map<number, readonly PieceState[]>([[0, []]]);
    for (const gun of eligible) {
      if (!supply.guns.has(gun)) continue;
      const strength = barrageStrengthOf(state, gun);
      if (strength <= 0) continue;
      for (const [previous, group] of [...byStrength]) {
        const combined = Math.min(maxStrength, previous + strength);
        const existing = byStrength.get(combined);
        if (!existing || group.length + 1 < existing.length) byStrength.set(combined, [...group, gun]);
      }
    }
    for (const [strength, guns] of byStrength) {
      if (roundOcs(strength) < 1) continue;
      const initial = barrageColumnIndex(roundOcs(strength));
      const price = BARRAGE_TABLE_COLUMNS[initial]!.supplyTokens;
      if (price > supply.tokens) continue;
      const column = Math.max(0, Math.min(lastColumn, initial + shift));
      const best = byPrice.get(price);
      if (!best || column > best.column || (column === best.column && guns.length < best.guns.length)) {
        byPrice.set(price, { column, guns });
      }
    }
  }
  return [...byPrice].sort(([left], [right]) => left - right).map(([, { guns }]) => guns);
};
