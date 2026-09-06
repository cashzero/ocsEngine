import { stableSort, stableKey, type PlayerId } from '../../core/index.js';
import { pieceLocationKey, type PieceLocation } from '../../domain/map/index.js';
import type { PieceState } from '../../domain/piece/index.js';
import type { GameState } from '../kernel/model.js';
import type { ProjectedPiece, ProjectedStack, RuleProjection } from './model.js';

const projectPiece = (piece: PieceState, redacted: boolean): ProjectedPiece => ({
  currentFaceId: redacted ? null : piece.currentFaceId,
  resourceQuantity: redacted ? null : piece.resourceQuantity,
  id: piece.id,
  ownerId: piece.ownerId,
  definitionId: piece.definitionId,
  location: { ...piece.location },
  mode: piece.mode,
  remainingSteps: redacted ? null : piece.remainingSteps,
  statuses: redacted ? [] : piece.statuses.map(({ statusDefinitionId }) => statusDefinitionId),
  redacted,
});

export const projectRuleState = (state: GameState, viewerId: PlayerId): RuleProjection => {
  const groups = new Map<string, { location: PieceLocation; pieces: PieceState[] }>();
  for (const piece of state.pieceState.pieces) {
    const key = pieceLocationKey(piece.location);
    const group = groups.get(key) ?? { location: piece.location, pieces: [] };
    group.pieces.push(piece);
    groups.set(key, group);
  }
  const stacks: ProjectedStack[] = [];
  for (const group of groups.values()) {
    const ordered = stableSort(group.pieces, (left, right) => left.stackOrder - right.stackOrder);
    const friendly = ordered.filter(({ ownerId }) => ownerId === viewerId);
    const enemy = ordered.filter(({ ownerId }) => ownerId !== viewerId);
    const visibleEnemy = enemy.length === 0 ? [] : [enemy[0]!];
    stacks.push({
      location: { ...group.location },
      pieces: [
        ...friendly.map((piece) => projectPiece(piece, false)),
        ...visibleEnemy.map((piece) => projectPiece(piece, true)),
      ],
      hiddenCount: Math.max(0, enemy.length - visibleEnemy.length),
    });
  }
  return {
    stateRevision: state.revision,
    viewerId,
    sequence: { ...state.sequence },
    stacks: stableSort(stacks, (left, right) => {
      const leftKey = stableKey([pieceLocationKey(left.location)]);
      const rightKey = stableKey([pieceLocationKey(right.location)]);
      return leftKey < rightKey ? -1 : leftKey > rightKey ? 1 : 0;
    }),
    pendingDecision: state.pendingDecision?.ownerId === viewerId ? state.pendingDecision : null,
    victory: state.victory,
  };
};

export const ruleQueryCacheKey = (
  state: GameState,
  actorId: PlayerId,
  purpose: string,
): string => stableKey([
  String(state.revision),
  String(state.mapState.revision),
  String(state.pieceState.revision),
  actorId,
  purpose,
  state.configuration.id,
]);

export interface RuleQueryCache {
  readonly getOrCompute: <T>(key: string, compute: () => T) => T;
  readonly size: () => number;
}

export const createRuleQueryCache = (enabled: boolean): RuleQueryCache => {
  const values = new Map<string, unknown>();
  return Object.freeze({
    getOrCompute: <T>(key: string, compute: () => T): T => {
      if (!enabled) return compute();
      if (values.has(key)) return values.get(key) as T;
      const value = compute();
      values.set(key, value);
      return value;
    },
    size: () => values.size,
  });
};
