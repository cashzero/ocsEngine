import type { HexId, PlayerId } from '../core/index.js';
import type { ProjectedPiece, RuleProjection } from '../rules/index.js';
import { hexesBetween, knowledgeOf, type BotGameFacts, type UnitProfile } from './knowledge.js';

/** One of the seat's own pieces on the map with its printed values. */
export interface OwnUnit {
  readonly piece: ProjectedPiece;
  readonly hexId: HexId;
  readonly profile: UnitProfile | null;
}

/** An enemy-occupied hex as the seat sees it: the top counters plus a count of hidden ones. */
export interface EnemyStack {
  readonly hexId: HexId;
  readonly pieces: readonly ProjectedPiece[];
  readonly hidden: number;
  readonly hasCombatUnit: boolean;
  /** Estimated combat strength of everything in the hex (hidden counters at the average visible strength). */
  readonly strength: number;
}

export interface ObjectiveView {
  readonly hexId: HexId;
  readonly points: number;
  readonly controllerId: PlayerId | null;
}

/** The position from one seat's projection, with the distances and estimates the policy keeps asking for. */
export interface Situation {
  readonly playerId: PlayerId;
  readonly turnsLeft: number;
  readonly own: readonly OwnUnit[];
  readonly enemy: ReadonlyMap<HexId, EnemyStack>;
  readonly objectives: readonly ObjectiveView[];
  readonly friendlyAt: (hexId: HexId) => readonly OwnUnit[];
  readonly nearestEnemy: (hexId: HexId) => { readonly stack: EnemyStack | null; readonly distance: number };
  /** Enemy strength that could reach `hexId` in its next turn, weighted down by distance. */
  readonly threatAt: (hexId: HexId) => number;
  readonly isCombatUnit: (unit: OwnUnit) => boolean;
}

/** Hexes an enemy stack is assumed to be able to reach to attack next turn. */
const THREAT_RADIUS = 4;
const AVERAGE_ENEMY_STRENGTH = 4;

export const analyze = (projection: RuleProjection, playerId: PlayerId, facts: BotGameFacts): Situation => {
  const knowledge = knowledgeOf(facts);
  const own: OwnUnit[] = [];
  const enemyPieces = new Map<HexId, { pieces: ProjectedPiece[]; hidden: number }>();
  for (const stack of projection.stacks) {
    if (stack.location.kind !== 'ON_MAP') continue;
    const hexId = stack.location.hexId;
    for (const piece of stack.pieces) {
      if (piece.ownerId === playerId) own.push({ piece, hexId, profile: knowledge.profile(piece) });
      else {
        const entry = enemyPieces.get(hexId) ?? { pieces: [], hidden: 0 };
        entry.pieces.push(piece);
        enemyPieces.set(hexId, entry);
      }
    }
    if (stack.hiddenCount > 0) {
      const entry = enemyPieces.get(hexId) ?? { pieces: [], hidden: 0 };
      entry.hidden += stack.hiddenCount;
      enemyPieces.set(hexId, entry);
    }
  }
  const visibleStrengths = [...enemyPieces.values()].flatMap(({ pieces }) => pieces)
    .filter(({ role }) => role === 'COMBAT').map((piece) => knowledgeOf(facts).profile(piece)?.strength ?? 0).filter((value) => value > 0);
  const hiddenStrength = visibleStrengths.length > 0
    ? visibleStrengths.reduce((total, value) => total + value, 0) / visibleStrengths.length : AVERAGE_ENEMY_STRENGTH;
  const enemy = new Map<HexId, EnemyStack>();
  for (const [hexId, { pieces, hidden }] of enemyPieces) {
    const combatPieces = pieces.filter(({ role }) => role === 'COMBAT' || role === 'ARTILLERY' || role === 'HQ');
    const strength = combatPieces.reduce((total, piece) => total + (knowledge.profile(piece)?.strength ?? 0), 0) + hidden * hiddenStrength;
    enemy.set(hexId, { hexId, pieces, hidden, hasCombatUnit: combatPieces.length > 0 || hidden > 0, strength });
  }
  const byHex = new Map<HexId, OwnUnit[]>();
  for (const unit of own) byHex.set(unit.hexId, [...(byHex.get(unit.hexId) ?? []), unit]);
  const enemyStacks = [...enemy.values()].filter(({ hasCombatUnit }) => hasCombatUnit);
  const nearestCache = new Map<HexId, { stack: EnemyStack | null; distance: number }>();
  const threatCache = new Map<HexId, number>();
  return {
    playerId,
    turnsLeft: Math.max(0, facts.turnLimit - projection.sequence.gameTurn),
    own,
    enemy,
    objectives: projection.objectives.map(({ hexId, points, controllerId }) => ({ hexId, points, controllerId })),
    friendlyAt: (hexId) => byHex.get(hexId) ?? [],
    nearestEnemy: (hexId) => {
      let found = nearestCache.get(hexId);
      if (!found) {
        found = { stack: null, distance: Number.POSITIVE_INFINITY };
        for (const stack of enemyStacks) {
          const distance = hexesBetween(hexId, stack.hexId);
          if (distance < found.distance) found = { stack, distance };
        }
        nearestCache.set(hexId, found);
      }
      return found;
    },
    threatAt: (hexId) => {
      let threat = threatCache.get(hexId);
      if (threat === undefined) {
        threat = 0;
        for (const stack of enemyStacks) {
          const distance = hexesBetween(hexId, stack.hexId);
          if (distance <= THREAT_RADIUS) threat += stack.strength / Math.max(1, distance);
        }
        threatCache.set(hexId, threat);
      }
      return threat;
    },
    isCombatUnit: ({ piece, profile }) => piece.role === 'COMBAT' && (profile?.strength ?? 0) > 0,
  };
};
