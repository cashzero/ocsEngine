import { parseHexCoordinateId, type HexId } from '../core/index.js';
import { AIR_MISSION_LABELS } from '../rules/air/mission.js';
import type { PieceDefinition } from '../domain/piece/index.js';
import type { MapDefinition } from '../domain/map/index.js';
import type { ScenarioDefinition } from '../domain/scenario/index.js';
import type { GameAction, ProjectedPiece, RulePhase, RuleSegment } from '../rules/index.js';

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
  ADVANCE_SEQUENCE: 'End step',
  CHANGE_MODE: 'Change mode',
  RELEASE_RESERVE: 'Release reserve',
  MOVE_PIECE: 'Move',
  CHECK_SUPPLY: 'Eat off the map',
  DECLARE_COMBAT: 'Attack',
  DECLARE_BARRAGE: 'Barrage',
  RESPOND_DECISION: 'Decision',
  COMMIT_TRANSACTION: 'Resolve',
  CANCEL_TRANSACTION: 'Withdraw attack',
  PLACE_REINFORCEMENT: 'Place reinforcement',
  PAY_FUEL: 'Pay fuel',
  RECOVER_INTERNALS: 'Recover internal stocks',
  CHOOSE_FORMATION_TRACE: 'Choose formation trace',
  ATTEMPT_BREAKOUT: 'Attempt breakout',
  BLOW_DUMP: 'Blow dump',
  LOAD_SUPPLY: 'Load supply',
  UNLOAD_SUPPLY: 'Unload supply',
  COMBINE_TRANSPORT: 'Combine trucks',
  DIVIDE_TRANSPORT: 'Divide trucks',
  FORM_EXTENDER: 'Form Extender',
  DISSOLVE_EXTENDER: 'Flip Extender back',
  COLLAPSE_EXTENDER: 'Collapse Extender',
  REFIT_AIRCRAFT: 'Refit aircraft',
  DECLARE_AIR_MISSION: 'Air mission',
  REDUCE_AIR_BASE: 'Reduce Air Base',
  COMBINE_AIRCRAFT: 'Combine aircraft',
};

export const actionKindLabel = (kind: GameAction['kind']): string => ACTION_LABELS[kind];

const PHASE_LABELS: Readonly<Record<RulePhase, string>> = {
  WEATHER: 'Weather', FIRST_PLAYER: 'First Player', AIRCRAFT_REFIT: 'Aircraft Refit',
  REINFORCEMENT: 'Reinforcement', MOVEMENT: 'Movement', SUPPLY: 'Supply', REACTION: 'Reaction',
  COMBAT: 'Combat', EXPLOITATION: 'Exploitation', CLEAN_UP: 'Clean Up', TURN_END: 'Turn End', COMPLETE: 'Game over',
};

export const phaseLabel = (phase: RulePhase, segment: RuleSegment): string =>
  segment === 'NONE' ? `${PHASE_LABELS[phase]} Phase`
    : `${PHASE_LABELS[phase]} · ${segment === 'MOVEMENT' ? 'Movement' : segment === 'BARRAGE' ? 'Barrage' : segment === 'BREAKOUT' ? 'Breakout' : 'Combat'} Segment`;

/** Printed-map style Hex number: column and row, 1-based, e.g. "0507". */
export const printedHexLabel = (hexId: string): string => {
  const parsed = parseHexCoordinateId(hexId);
  if (!parsed.ok) return hexId;
  const { q, r } = parsed.value;
  const column = q + Math.floor(r / 2) + 1;
  return `${String(column).padStart(2, '0')}${String(r + 1).padStart(2, '0')}`;
};

export const actionSummary = (action: GameAction): string => {
  switch (action.kind) {
    case 'ADVANCE_SEQUENCE': return 'End the current step';
    case 'CHANGE_MODE': return `Change to ${action.mode.toLowerCase()} mode`;
    case 'RELEASE_RESERVE': return 'Release from reserve';
    case 'MOVE_PIECE': return `Move to ${printedHexLabel(action.path.at(-1) ?? '')}`;
    case 'CHECK_SUPPLY': return 'Draw supply from a dump';
    case 'DECLARE_COMBAT': return `${action.combatKind === 'OVERRUN' ? 'Overrun' : 'Attack'} ${printedHexLabel(action.targetHexId)}`;
    case 'DECLARE_BARRAGE': return `Barrage ${printedHexLabel(action.targetHexId)}`;
    case 'RESPOND_DECISION': return 'Decision';
    case 'COMMIT_TRANSACTION': return 'Resolve';
    case 'CANCEL_TRANSACTION': return 'Withdraw attack';
    case 'PLACE_REINFORCEMENT': return `Place at ${printedHexLabel(action.hexId)}`;
    case 'PAY_FUEL': return action.method === 'SINGLE_UNIT' ? 'Fuel this unit (1T)' : action.method === 'FORMATION' ? 'Fuel the formation (1 SP)' : 'Fuel the HQ (1 SP)';
    case 'RECOVER_INTERNALS': return 'Recover internal stocks';
    case 'CHOOSE_FORMATION_TRACE': return 'Change the formation trace route';
    case 'ATTEMPT_BREAKOUT': return 'Attempt breakout';
    case 'BLOW_DUMP': return `Blow ${action.tokens}T`;
    case 'LOAD_SUPPLY': return `Load ${action.tokens}T`;
    case 'UNLOAD_SUPPLY': return `Unload ${action.tokens}T`;
    case 'COMBINE_TRANSPORT': return 'Combine trucks';
    case 'DIVIDE_TRANSPORT': return `Split off ${action.points} point${action.points === 1 ? '' : 's'}`;
    case 'FORM_EXTENDER': return 'Form Extender';
    case 'DISSOLVE_EXTENDER': return 'Flip Extender back to trucks';
    case 'COLLAPSE_EXTENDER': return `Collapse to ${printedHexLabel(action.hexId)}`;
    case 'REFIT_AIRCRAFT': return `Refit ${action.aircraftIds.length} aircraft (1T)`;
    case 'DECLARE_AIR_MISSION': return `${AIR_MISSION_LABELS[action.mission]} ${printedHexLabel(action.targetHexId)} with ${action.aircraftIds.length} aircraft`;
    case 'REDUCE_AIR_BASE': return 'Reduce the Air Base one Level';
    case 'COMBINE_AIRCRAFT': return 'Combine two reduced aircraft';
  }
};

export const pieceDefinition = (
  scenario: ScenarioDefinition,
  piece: Pick<ProjectedPiece, 'definitionId'>,
): PieceDefinition | null => scenario.pieceCatalog.definitions.find(({ id }) => id === piece.definitionId) ?? null;

export const unitLabel = (scenario: ScenarioDefinition, piece: Pick<ProjectedPiece, 'definitionId'>): string => {
  const definition = pieceDefinition(scenario, piece);
  // A supply dump has no name on the board-game counter, whatever an older save or package called it.
  return definition?.family === 'RESOURCE' ? 'Supply dump' : definition?.name ?? 'Unit';
};

/** Label for a counter as the viewer is allowed to see it. */
export const pieceLabel = (scenario: ScenarioDefinition, piece: ProjectedPiece): string => unitLabel(scenario, piece);

const hexPoints = (centerX: number, centerY: number, size: number): string =>
  Array.from({ length: 6 }, (_, index) => {
    const radians = Math.PI / 180 * (60 * index - 30);
    return `${(centerX + size * Math.cos(radians)).toFixed(2)},${(centerY + size * Math.sin(radians)).toFixed(2)}`;
  }).join(' ');

export const layoutMapDefinition = (map: MapDefinition, hexSize = 54): HexMapLayout => {
  const raw = map.hexes.map((hex) => {
    const parsed = parseHexCoordinateId(hex.id);
    if (!parsed.ok) throw new Error(`Invalid map Hex ID: ${hex.id}`);
    const { q, r } = parsed.value;
    return {
      id: hex.id,
      x: hexSize * Math.sqrt(3) * (q + r / 2),
      y: hexSize * 1.5 * r,
      terrain: hex.terrainDefinitionIds.map((id) => String(id).split(':').at(-1)).join(', ') || 'clear',
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

export const layoutHexMap = (scenario: ScenarioDefinition, hexSize = 54): HexMapLayout =>
  layoutMapDefinition(scenario.mapDefinition, hexSize);

export const safeDomId = (value: string): string => `ocs-${value.replace(/[^a-z0-9_-]/giu, '-')}`;
