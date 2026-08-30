import { parseHexCoordinateId, type HexId } from '../core/index.js';
import type { PieceDefinition } from '../domain/piece/index.js';
import type { ScenarioDefinition } from '../domain/scenario/index.js';
import type { GameAction, ProjectedPiece } from '../rules/index.js';

export interface HexLayoutCell {
  readonly id: HexId;
  readonly x: number;
  readonly y: number;
  readonly points: string;
  readonly terrain: string;
}

export interface HexMapLayout {
  readonly width: number;
  readonly height: number;
  readonly hexSize: number;
  readonly cells: readonly HexLayoutCell[];
}

const ACTION_LABELS: Readonly<Record<GameAction['kind'], string>> = {
  ADVANCE_SEQUENCE: 'Advance sequence',
  CHANGE_MODE: 'Change mode',
  RELEASE_RESERVE: 'Release reserve',
  MOVE_PIECE: 'Move unit',
  CHECK_SUPPLY: 'Check supply',
  DECLARE_COMBAT: 'Declare combat',
  DECLARE_BARRAGE: 'Declare barrage',
  RESPOND_DECISION: 'Respond to decision',
  COMMIT_TRANSACTION: 'Commit transaction',
  CANCEL_TRANSACTION: 'Cancel transaction',
  PLACE_REINFORCEMENT: 'Place reinforcement',
};

export const actionKindLabel = (kind: GameAction['kind']): string => ACTION_LABELS[kind];

const suffix = (value: string): string => value.split(':').at(-1) ?? value;

export const actionSummary = (action: GameAction): string => {
  switch (action.kind) {
    case 'ADVANCE_SEQUENCE': return 'Continue to the next segment';
    case 'CHANGE_MODE': return `${suffix(action.pieceId)} → ${action.mode}`;
    case 'RELEASE_RESERVE': return `Release ${suffix(action.pieceId)}`;
    case 'MOVE_PIECE': return `${suffix(action.pieceId)} → ${action.path.at(-1) ?? 'current hex'}`;
    case 'CHECK_SUPPLY': return `${action.pieceIds.map(suffix).join(', ')} supply trace`;
    case 'DECLARE_COMBAT': return `${action.combatKind}: ${action.attackerIds.map(suffix).join(', ')} → ${action.targetHexId}`;
    case 'DECLARE_BARRAGE': return `${action.firerIds.map(suffix).join(', ')} → ${action.targetHexId}`;
    case 'RESPOND_DECISION': return action.choiceId;
    case 'COMMIT_TRANSACTION': return `Resolve ${suffix(action.transactionId)}`;
    case 'CANCEL_TRANSACTION': return `Cancel ${suffix(action.transactionId)}`;
    case 'PLACE_REINFORCEMENT': return `${suffix(action.pieceId)} → ${action.hexId}`;
  }
};

export const pieceDefinition = (
  scenario: ScenarioDefinition,
  piece: ProjectedPiece,
): PieceDefinition | null => scenario.pieceCatalog.definitions.find(({ id }) => id === piece.definitionId) ?? null;

export const pieceLabel = (scenario: ScenarioDefinition, piece: ProjectedPiece): string =>
  piece.redacted ? 'Enemy unit' : pieceDefinition(scenario, piece)?.name ?? suffix(piece.id);

const hexPoints = (centerX: number, centerY: number, size: number): string =>
  Array.from({ length: 6 }, (_, index) => {
    const radians = Math.PI / 180 * (60 * index - 30);
    return `${(centerX + size * Math.cos(radians)).toFixed(2)},${(centerY + size * Math.sin(radians)).toFixed(2)}`;
  }).join(' ');

export const layoutHexMap = (scenario: ScenarioDefinition, hexSize = 54): HexMapLayout => {
  const raw = scenario.mapDefinition.hexes.map((hex) => {
    const parsed = parseHexCoordinateId(hex.id);
    if (!parsed.ok) throw new Error(`Invalid map Hex ID: ${hex.id}`);
    const { q, r } = parsed.value;
    return {
      id: hex.id,
      x: hexSize * Math.sqrt(3) * (q + r / 2),
      y: hexSize * 1.5 * r,
      terrain: hex.terrainDefinitionIds.map(suffix).join(', ') || 'clear',
    };
  });
  const minX = Math.min(...raw.map(({ x }) => x)) - hexSize - 8;
  const minY = Math.min(...raw.map(({ y }) => y)) - hexSize - 8;
  const maxX = Math.max(...raw.map(({ x }) => x)) + hexSize + 8;
  const maxY = Math.max(...raw.map(({ y }) => y)) + hexSize + 8;
  const cells = raw.map((cell) => {
    const x = cell.x - minX;
    const y = cell.y - minY;
    return { ...cell, x, y, points: hexPoints(x, y, hexSize) };
  });
  return { width: maxX - minX, height: maxY - minY, hexSize, cells };
};

export const safeDomId = (value: string): string => `ocs-${value.replace(/[^a-z0-9_-]/giu, '-')}`;
