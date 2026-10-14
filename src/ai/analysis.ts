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
  readonly opponentTurnRemains: boolean;
  readonly attack: boolean;
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
    const combatPieces = pieces.filter(piece => piece.role === 'COMBAT' || piece.role === 'ARTILLERY' || piece.role === 'HQ'
      || (piece.role === 'REPLACEMENT' && knowledge.definition(piece)?.counter?.kind === 'COMBAT'));
    const strength = combatPieces.reduce((total, piece) => total + (knowledge.profile(piece)?.strength ?? 0), 0) + hidden * hiddenStrength;
    enemy.set(hexId, { hexId, pieces, hidden, hasCombatUnit: combatPieces.length > 0 || hidden > 0, strength });
  }
  const byHex = new Map<HexId, OwnUnit[]>();
  for (const unit of own) byHex.set(unit.hexId, [...(byHex.get(unit.hexId) ?? []), unit]);
  // A zero-strength replacement blocks entry, but cannot threaten a unit merely passing nearby.
  const enemyStacks = [...enemy.values()].filter(stack => stack.hasCombatUnit && (stack.strength > 0
    || stack.pieces.some(p => p.role === 'COMBAT' || p.role === 'ARTILLERY' || p.role === 'HQ')));
  const nearestCache = new Map<HexId, { stack: EnemyStack | null; distance: number }>();
  const threatCache = new Map<HexId, number>();
  const turnsLeft = Math.max(0, facts.turnLimit - projection.sequence.gameTurn);
  // Assess distant road raids against held VP without making every maneuver hex look exposed.
  // The final second player has no later opposing turn to defend against.
  const heldObjectives = new Set((turnsLeft > 0 || projection.sequence.playerTurnIndex === 0)
    ? projection.objectives.filter(o => o.controllerId === playerId).map(o => o.hexId) : []);
  return {
    playerId,
    turnsLeft,
    opponentTurnRemains: turnsLeft > 0 || projection.sequence.playerTurnIndex === 0,
    attack: projection.attackVictory !== undefined,
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
          let visibleStrength = 0;
          for (const piece of stack.pieces) {
            if (!['COMBAT', 'ARTILLERY', 'HQ'].includes(piece.role)) continue;
            const profile = knowledge.profile(piece);
            const strength = profile?.strength ?? 0;
            visibleStrength += strength;
            // A road costs as little as 0.5 MP per hex. Add one hex for an adjacent attack;
            // a fixed four-hex radius missed real road advances against distant VP garrisons.
            if (heldObjectives.has(hexId) && distance > THREAT_RADIUS && projection.objectiveRaidThreats) {
              threat += (projection.objectiveRaidThreats.find(r => r.pieceId === piece.id && r.hexId === hexId)?.strength ?? 0) / Math.max(1, distance);
            } else {
              const reach = heldObjectives.has(hexId) ? Math.max(THREAT_RADIUS, Math.ceil(2 * (profile?.movement ?? 0)) + 1) : THREAT_RADIUS;
              if (distance <= reach) threat += strength / Math.max(1, distance);
            }
          }
          if (distance <= THREAT_RADIUS) threat += Math.max(0, stack.strength - visibleStrength) / Math.max(1, distance);
        }
        threatCache.set(hexId, threat);
      }
      return threat;
    },
    isCombatUnit: ({ piece, profile }) => piece.role === 'COMBAT' && (profile?.strength ?? 0) > 0,
  };
};
