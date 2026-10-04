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
  END_MOVE: 'Finish move',
  CREATE_BREAKDOWN: 'Detach Breakdown',
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
  BUILD_AIR_BASE: 'Build Air Base',
  REBUILD_AIRCRAFT: 'Rebuild aircraft',
  REBUILD_UNITS: 'Rebuild units',
  PLAN_AIR_DROP: 'Plan Air Drop',
  UPDATE_AIR_DROP_PLAN: 'Change Drop Plan',
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

/** The hex a printed number names ("0507"), or null when it is not a number of this map. */
export const hexFromPrintedLabel = (text: string): string | null => {
  const match = /^\s*(\d{2})(\d{2})\s*$/u.exec(text);
  if (!match) return null;
  const column = Number(match[1]) - 1;
  const r = Number(match[2]) - 1;
  const q = column - Math.floor(r / 2);
  return Number.isSafeInteger(q) && r >= 0 && column >= 0 ? `${q},${r}` : null;
};

export const actionSummary = (action: GameAction): string => {
  switch (action.kind) {
    case 'ADVANCE_SEQUENCE': return 'End the current step';
    case 'CHANGE_MODE': return `Change to ${action.mode.toLowerCase()} mode`;
    case 'RELEASE_RESERVE': return 'Release from reserve';
    case 'MOVE_PIECE': return `Move to ${printedHexLabel(action.path.at(-1) ?? '')}`;
    case 'END_MOVE': return 'Finish this unit\'s move';
    case 'CREATE_BREAKDOWN': return 'Detach a Breakdown';
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
    case 'PLAN_AIR_DROP': return `Plan a drop of ${action.unitIds.length} unit${action.unitIds.length === 1 ? '' : 's'} at ${printedHexLabel(action.hexId)} on turn ${action.turn}`;
    case 'UPDATE_AIR_DROP_PLAN': return action.change === 'DELAY' ? 'Delay the drop one turn' : 'Cancel the drop';
    case 'REBUILD_AIRCRAFT': return `Rebuild ${action.aircraftIds.length} aircraft with Eq`;
    case 'REBUILD_UNITS': return `Rebuild ${action.units.length} unit${action.units.length === 1 ? '' : 's'}${action.truckPoints > 0 ? ` and ${action.truckPoints} truck point${action.truckPoints === 1 ? '' : 's'}` : ''} at ${printedHexLabel(action.hexId)}`;
    case 'BUILD_AIR_BASE': return `${action.facility === 'AIR_STRIP' ? 'Build an Air Strip' : 'Build or improve an Air Base'} at ${printedHexLabel(action.hexId)}`;
    case 'COMBINE_AIRCRAFT': return 'Combine two reduced aircraft';
  }
};

export const pieceDefinition = (
  scenario: ScenarioDefinition,
  piece: Pick<ProjectedPiece, 'definitionId'>,
): PieceDefinition | null => scenario.pieceCatalog.definitions.find(({ id }) => id === piece.definitionId) ?? null;

/** The Piece's own name (a Breakdown's "1/101.Abn", 20.0) when it has one; null when its Definition names it. */
export const pieceOwnName = (piece: { readonly statusValues?: ProjectedPiece['statusValues'] }): string | null => {
  const value = piece.statusValues?.find(({ statusDefinitionId }) => statusDefinitionId === 'status:unit-name')?.value;
  return typeof value === 'string' && value.length > 0 ? value : null;
};

export const unitLabel = (scenario: ScenarioDefinition, piece: Pick<ProjectedPiece, 'definitionId'> & { readonly statusValues?: ProjectedPiece['statusValues'] }): string => {
  const definition = pieceDefinition(scenario, piece);
  // A supply dump and a truck have no name on the board-game counter, whatever an older save or package called them.
  if (definition?.family === 'RESOURCE') return 'Supply dump';
  if (definition?.counter?.kind === 'TRANSPORT') return 'Truck';
  return pieceOwnName(piece) ?? definition?.name ?? 'Unit';
};

/** 4.8: ten RE in a Hex, in quarter-RE ticks (the limit every generated game is configured with). */
export const STACKING_LIMIT_RE_TICKS = 40;

/**
 * Quarter-RE ticks a counter adds to its Hex under 4.8a. Counted exactly as the rules do (isCombatUnit): ground units
 * only, so a Truck, an Extender, a supply dump and an aircraft never count towards the limit.
 */
export const stackingReTicks = (scenario: ScenarioDefinition, piece: ProjectedPiece): number => {
  if (piece.role === 'TRUCK' || piece.role === 'EXTENDER' || piece.remainingSteps === null) return 0;
  const definition = pieceDefinition(scenario, piece);
  if (definition?.family !== 'GROUND') return 0;
  return Number(definition.faces.find(({ id }) => id === piece.currentFaceId)?.steps
    .find(({ remainingSteps }) => remainingSteps === piece.remainingSteps)?.regimentalEquivalentTicks ?? 0);
};

/** A friendly Hex over the stacking limit and how much it holds (RE ticks). */
export interface OverstackedHex {
  readonly hexId: string;
  readonly reTicks: number;
}

/** The player's own Hexes over 10 RE right now, in Hex order: what 4.8a would make them eliminate when the step ends. */
export const ownOverstackedHexes = (
  scenario: ScenarioDefinition,
  pieces: readonly ProjectedPiece[],
  playerId: string,
): readonly OverstackedHex[] => {
  const totals = new Map<string, number>();
  for (const piece of pieces) {
    if (String(piece.ownerId) !== playerId || piece.location.kind !== 'ON_MAP') continue;
    totals.set(piece.location.hexId, (totals.get(piece.location.hexId) ?? 0) + stackingReTicks(scenario, piece));
  }
  return [...totals.entries()].filter(([, reTicks]) => reTicks > STACKING_LIMIT_RE_TICKS)
    .map(([hexId, reTicks]) => ({ hexId, reTicks })).sort((left, right) => left.hexId.localeCompare(right.hexId));
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
