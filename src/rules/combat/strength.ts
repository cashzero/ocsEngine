import type { HexId, PieceId, PlayerId } from '../../core/index.js';
import type { PieceState } from '../../domain/piece/index.js';
import type { CombatLine, GameState } from '../kernel/model.js';
import {
  actionRating,
  antiTankLevel,
  combatClass,
  definitionOf,
  hexOf,
  isArtillery,
  isHq,
  isOutOfSupply,
  opponentOf,
  pieceById,
  printedSteps,
  printedStrength,
} from '../pieces.js';
import {
  COMBAT_TABLE_COLUMNS,
  roundOcs,
  type OddsColumn,
} from '../tables/ocs-4.3.js';
import {
  hexCombatTerrains,
  hexsideCombatEffects,
  multiplierFor,
  multiplierValue,
} from '../terrain.js';
import type { CombatMultiplier } from '../kernel/model.js';
import { defendingHedgehogLevel } from '../hedgehog/hedgehog.js';

/** Printed or rules-assigned base strength: HQs 5/1 (13.1c), artillery 1 (13.4b). */
const baseStrength = (state: GameState, piece: PieceState): number => {
  const printed = printedStrength(state, piece);
  if (printed !== null) return printed;
  if (isHq(state, piece)) return piece.currentFaceId === 'combat' ? 5 : 1;
  if (isArtillery(state, piece)) return 1;
  return 0;
};

/** 9.11d: missing steps halve attack; missing half or more halves defense. */
const stepLossFactor = (state: GameState, piece: PieceState, attacking: boolean): number => {
  const printed = printedSteps(state, piece);
  const missing = printed - (piece.remainingSteps ?? printed);
  if (printed <= 1 || missing <= 0) return 1;
  if (attacking) return 0.5;
  return missing * 2 >= printed ? 0.5 : 1;
};

const modeFactor = (piece: PieceState, attacking: boolean): number => {
  if (piece.mode === 'STRAT') return 0;
  if (piece.mode === 'DG') return 0.5;
  if (piece.mode === 'RESERVE' && !attacking) return 0.5;
  return 1;
};

/** 9.5/9.5a: combat supply and Out of Supply status are cumulative. */
const supplyFactor = (piece: PieceState, hasCombatSupply: boolean): number => {
  if (hasCombatSupply) return isOutOfSupply(piece) ? 0.5 : 1;
  return isOutOfSupply(piece) ? 0.25 : 0.5;
};

/** 9.4e: a x2 terrain effect for attacking Armor or Mech becomes x1.5 against equal or better AT. */
const antiTankAdjusted = (
  state: GameState,
  piece: PieceState,
  multiplier: CombatMultiplier,
  defenderAntiTank: number,
): number => {
  const value = multiplierValue(multiplier);
  const unitClass = combatClass(state, piece);
  if (value === 2 && unitClass !== 'OTHER' && defenderAntiTank >= antiTankLevel(state, piece) && antiTankLevel(state, piece) > 0) return 1.5;
  return value;
};

export interface UnitStrength {
  readonly pieceId: PieceId;
  readonly base: number;
  readonly modified: number;
}

export interface AttackingStack {
  readonly hexId: HexId;
  readonly terrain: string;
  readonly units: readonly UnitStrength[];
  readonly total: number;
}

export interface CombatOdds {
  readonly attackerStrength: number;
  readonly defenderStrength: number;
  readonly line: CombatLine;
  readonly defenderTerrain: string;
  readonly stacks: readonly AttackingStack[];
  readonly defenders: readonly UnitStrength[];
  /** Rounded odds as displayed, e.g. "3:1" or "1:2". */
  readonly oddsText: string;
  readonly columnIndex: number;
  readonly columns: readonly OddsColumn[];
  /** 9.6: lead attacker AR minus lead defender AR, applied to both the Surprise and the combat roll. */
  readonly drm: number;
  /** 16.0d: Level of the defender's hedgehog (0 when none): -Level on the combat roll and -1 on the Surprise roll. */
  readonly hedgehogLevel: number;
  readonly leadAttackerRating: number;
  readonly leadDefenderRating: number;
}

const attackingStack = (
  state: GameState,
  attackers: readonly PieceState[],
  hexId: HexId,
  targetHexId: HexId,
  defenderAntiTank: number,
): AttackingStack => {
  // 9.4b: the defender picks one terrain in his Hex, or one hexside crossed, per attacking stack.
  const options = [
    ...hexCombatTerrains(state, targetHexId).map((terrain) => ({ name: terrain.terrainDefinitionId, multipliers: terrain.multipliers })),
    ...hexsideCombatEffects(state, hexId, targetHexId).map((effect) => ({ name: String(effect.featureDefinitionId), multipliers: effect.multipliers })),
  ];
  const evaluated = options.map((option) => {
    const units = attackers.map((piece) => {
      const base = baseStrength(state, piece);
      const terrain = antiTankAdjusted(state, piece, multiplierFor(option.multipliers, combatClass(state, piece)), defenderAntiTank);
      const modified = base * terrain * stepLossFactor(state, piece, true) * modeFactor(piece, true)
        * supplyFactor(piece, true);
      return { pieceId: piece.id, base, modified };
    });
    return { terrain: option.name, units, total: units.reduce((sum, unit) => sum + unit.modified, 0) };
  });
  const best = evaluated.reduce((low, next) => next.total < low.total ? next : low, evaluated[0]!);
  return { hexId, ...best };
};

const defendingUnits = (
  state: GameState,
  defenders: readonly PieceState[],
  multipliers: Parameters<typeof multiplierFor>[0],
  suppliedIds: readonly PieceId[],
): readonly UnitStrength[] => defenders.map((piece) => {
  const base = baseStrength(state, piece);
  const multiplier = multiplierFor(multipliers, combatClass(state, piece));
  // 9.4d: bracketed effects only modify attackers.
  const terrain = multiplier.attackOnly ? 1 : multiplierValue(multiplier);
  const modified = base * terrain * stepLossFactor(state, piece, false) * modeFactor(piece, false)
    * supplyFactor(piece, suppliedIds.includes(piece.id));
  return { pieceId: piece.id, base, modified };
});

/** 9.7: divide both by the smaller, round each (4.1), and use the highest column not above it. */
export const oddsColumnIndex = (attack: number, defense: number, columns: readonly OddsColumn[]): { index: number; text: string } => {
  // 9.14a: zero-strength attacks begin leftmost, attacks against zero strength rightmost.
  if (attack <= 0 && defense <= 0) {
    const even = columns.findIndex(({ attacker, defender }) => attacker === 1 && defender === 1);
    return { index: even >= 0 ? even : 0, text: '1:1' };
  }
  if (attack <= 0) return { index: 0, text: '0:1' };
  if (defense <= 0) return { index: columns.length - 1, text: '1:0' };
  const ratio = attack >= defense ? roundOcs(attack / defense) : 1 / roundOcs(defense / attack);
  const text = attack >= defense ? `${roundOcs(attack / defense)}:1` : `1:${roundOcs(defense / attack)}`;
  let index = 0;
  for (const [position, column] of columns.entries()) if (column.attacker / column.defender <= ratio + 1e-9) index = position;
  return { index, text };
};

/** 9.6a/13.1c: HQs rate 0, Strat Mode rates 0, DG subtracts 1. */
export const combatActionRating = (state: GameState, piece: PieceState | undefined): number =>
  !piece || isHq(state, piece) ? 0 : actionRating(state, piece);

/**
 * Odds for attackers against every combat unit in `targetHexId`.
 *
 * 9.4b: each attacking stack gets the Hex terrain or crossed hexside that weakens it most. That
 * choice only ever lowers the attacking total, so the defender's best pick is always this one.
 * 9.4c: the defending terrain is `defenderTerrainId` (the defender's announced choice); when it is
 * null (previews before he chooses) the terrain giving the lowest odds column is shown.
 * `suppliedDefenderIds` are the defenders with combat supply (on-map or internal stocks, 9.5).
 */
export const calculateCombatOdds = (
  state: GameState,
  attackerIds: readonly PieceId[],
  defenderIds: readonly PieceId[],
  targetHexId: HexId,
  suppliedDefenderIds: readonly PieceId[],
  leadAttackerId: PieceId | null,
  leadDefenderId: PieceId | null,
  defenderTerrainId: string | null = null,
): CombatOdds => {
  const attackers = attackerIds.flatMap((id) => pieceById(state, id) ?? []);
  const defenders = defenderIds.flatMap((id) => pieceById(state, id) ?? []);
  const hedgehogLevel = defenders[0] ? defendingHedgehogLevel(state, defenders[0].ownerId, targetHexId) : 0;
  // 16.0e: a hedgehog gives the combat units in its hex Heavy AT (9.4e).
  const defenderAntiTank = Math.max(hedgehogLevel > 0 ? 2 : 0, ...defenders.map((piece) => antiTankLevel(state, piece)));
  const byHex = new Map<HexId, PieceState[]>();
  for (const piece of attackers) {
    const hexId = hexOf(piece);
    if (hexId) byHex.set(hexId, [...(byHex.get(hexId) ?? []), piece]);
  }
  const stacks = [...byHex.entries()].sort(([left], [right]) => String(left).localeCompare(String(right)))
    .map(([hexId, pieces]) => attackingStack(state, pieces, hexId, targetHexId, defenderAntiTank));
  const attackerStrength = stacks.reduce((sum, stack) => sum + stack.total, 0);
  const defenseOptions = hexCombatTerrains(state, targetHexId).map((terrain) => {
    const units = defendingUnits(state, defenders, terrain.multipliers, suppliedDefenderIds);
    const defenderStrength = units.reduce((sum, unit) => sum + unit.modified, 0);
    const columns = COMBAT_TABLE_COLUMNS[terrain.line];
    const column = oddsColumnIndex(attackerStrength, defenderStrength, columns);
    return { terrain, units, defenderStrength, columns, column };
  });
  const announced = defenseOptions.find(({ terrain }) => terrain.terrainDefinitionId === defenderTerrainId);
  const chosen = announced ?? defenseOptions.reduce((low, next) => next.column.index < low.column.index ? next : low, defenseOptions[0]!);
  const leadAttackerRating = combatActionRating(state, leadAttackerId ? pieceById(state, leadAttackerId) : undefined);
  const leadDefenderRating = combatActionRating(state, leadDefenderId ? pieceById(state, leadDefenderId)
    : defenders.slice().sort((left, right) => combatActionRating(state, right) - combatActionRating(state, left))[0]);
  return {
    attackerStrength,
    defenderStrength: chosen.defenderStrength,
    line: chosen.terrain.line,
    defenderTerrain: chosen.terrain.terrainDefinitionId,
    stacks,
    defenders: chosen.units,
    oddsText: chosen.column.text,
    columnIndex: chosen.column.index,
    columns: chosen.columns,
    drm: leadAttackerRating - leadDefenderRating,
    hedgehogLevel,
    leadAttackerRating,
    leadDefenderRating,
  };
};

/**
 * 9.4c: the defending terrain choices that make a difference (distinct line or multipliers), each
 * with the odds it would give.
 */
export const defenseTerrainChoices = (
  state: GameState,
  attackerIds: readonly PieceId[],
  defenderIds: readonly PieceId[],
  targetHexId: HexId,
  suppliedDefenderIds: readonly PieceId[],
  leadAttackerId: PieceId | null,
  leadDefenderId: PieceId | null,
): readonly { readonly terrainId: string; readonly odds: CombatOdds }[] => {
  const seen = new Set<string>();
  return hexCombatTerrains(state, targetHexId).flatMap((terrain) => {
    const key = JSON.stringify([terrain.line, terrain.multipliers]);
    if (seen.has(key)) return [];
    seen.add(key);
    return [{
      terrainId: terrain.terrainDefinitionId,
      odds: calculateCombatOdds(state, attackerIds, defenderIds, targetHexId, suppliedDefenderIds, leadAttackerId, leadDefenderId, terrain.terrainDefinitionId),
    }];
  });
};

/** One terrain the defender may choose (9.4b) and what each planned attacker would count under it. */
export interface PlannedAttackOption {
  readonly terrainId: string;
  readonly line: CombatLine;
  readonly strengths: readonly { readonly pieceId: PieceId; readonly strength: number }[];
}

/** What a planned attack on a Hex would count on the attacking side, from the attacker's own units and public terrain. */
export interface PlannedAttack {
  /** 16.0d: Level of the hedgehog defending the Hex (a visible counter); 0 when none. */
  readonly hedgehogLevel: number;
  readonly options: readonly PlannedAttackOption[];
}

/** The unit's printed strength on its Combat side at its current step (the current side when it has no Combat side). */
const combatSideStrength = (state: GameState, piece: PieceState): number => {
  const combatFace = definitionOf(state, piece)?.faces.find(({ id }) => id === 'combat');
  const step = combatFace?.steps.find(({ remainingSteps }) => remainingSteps === piece.remainingSteps) ?? combatFace?.steps[0];
  return step?.combatStrength ?? baseStrength(state, piece);
};

/**
 * What `attackerIds` would count against `targetHexId` once beside it in Combat Mode with combat supply, under each terrain
 * the defender may pick there: Combat-side strength x terrain (9.4, with 9.4e against the Heavy AT a hedgehog gives, 16.0e)
 * x missing steps (9.11d). Hexsides depend on where each stack ends up and are left out. Nothing about the defenders is read
 * beyond the hedgehog counter, so a player may ask this before he can see them.
 */
export const plannedAttack = (state: GameState, actorId: PlayerId, attackerIds: readonly PieceId[], targetHexId: HexId): PlannedAttack => {
  const attackers = attackerIds.flatMap((id) => pieceById(state, id) ?? []).filter((piece) => piece.ownerId === actorId && hexOf(piece) !== null);
  const hedgehogLevel = defendingHedgehogLevel(state, opponentOf(state, actorId), targetHexId);
  const defenderAntiTank = hedgehogLevel > 0 ? 2 : 0;
  return {
    hedgehogLevel,
    options: hexCombatTerrains(state, targetHexId).map((terrain) => ({
      terrainId: terrain.terrainDefinitionId,
      line: terrain.line,
      strengths: attackers.map((piece) => ({
        pieceId: piece.id,
        strength: combatSideStrength(state, piece) * antiTankAdjusted(state, piece, multiplierFor(terrain.multipliers, combatClass(state, piece)), defenderAntiTank)
          * stepLossFactor(state, piece, true),
      })),
    })),
  };
};

/** Distinct Hexes the attackers occupy (attacking stacks, 9.13b). */
export const attackingHexes = (state: GameState, attackerIds: readonly PieceId[]): readonly HexId[] =>
  [...new Set(attackerIds.flatMap((id) => { const piece = pieceById(state, id); const hexId = piece ? hexOf(piece) : null; return hexId ? [hexId] : []; }))];

export { baseStrength };
