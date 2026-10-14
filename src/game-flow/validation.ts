import { validateScenarioDefinition } from '../domain/scenario/index.js';
import { createPieceDefinitionCatalogIndex } from '../domain/piece/index.js';
import { validateRuleConfiguration } from '../rules/index.js';
import { seaCapOf } from './configuration.js';
import { ENGAGEMENTS, NEW_GAME_SEAS, newGameSeaOf, type GameFlowFailure, type GeneratedScenarioPackage, type NewGameRequest } from './model.js';
import { BTR_CAMPAIGN_MONTHS, btrTurnDate } from './weather-supply-tables.js';

/** Rail Cap points a New Game may give a side each Movement Phase. */
export const MAXIMUM_RAIL_CAP = 30;
/** Sea Cap points a New Game may give a side each Movement Phase. */
export const MAXIMUM_SEA_CAP = 30;

const uint32 = (value: number): boolean => Number.isSafeInteger(value) && value >= 0 && value <= 0xffff_ffff;

export const validateNewGameRequest = (request: NewGameRequest): readonly GameFlowFailure[] => {
  const failures: GameFlowFailure[] = [];
  if (request.templateId !== 'GROUND_DUEL') failures.push({ stage: 'OPTIONS', code: 'UNKNOWN_TEMPLATE', message: 'Only GROUND_DUEL is currently supported.', path: ['templateId'] });
  if (request.engagement !== undefined && !ENGAGEMENTS.includes(request.engagement)) failures.push({ stage: 'OPTIONS', code: 'UNKNOWN_ENGAGEMENT', message: 'Engagement must be MEETING, ALLIED_ATTACKS or AXIS_ATTACKS.', path: ['engagement'] });
  if (request.map.sea !== undefined && !NEW_GAME_SEAS.includes(request.map.sea)) failures.push({ stage: 'OPTIONS', code: 'UNKNOWN_SEA', message: 'Sea must be NONE or FLANK.', path: ['map', 'sea'] });
  for (const [name, value] of Object.entries(request.seeds)) {
    if (!uint32(value)) failures.push({ stage: 'OPTIONS', code: 'INVALID_SEED', message: `${name} seed must be uint32.`, path: ['seeds', name] });
  }
  if (!Number.isSafeInteger(request.turnLimit) || request.turnLimit < 1 || request.turnLimit > 20) {
    failures.push({ stage: 'OPTIONS', code: 'INVALID_TURN_LIMIT', message: 'Turn limit must be an integer from 1 through 20.', path: ['turnLimit'] });
  }
  if (request.railCap !== undefined) {
    for (const side of ['allied', 'axis'] as const) {
      const points = request.railCap[side];
      if (!Number.isSafeInteger(points) || points < 0 || points > MAXIMUM_RAIL_CAP) {
        failures.push({ stage: 'OPTIONS', code: 'INVALID_RAIL_CAP', message: `Rail Cap must be a whole number of points from 0 through ${MAXIMUM_RAIL_CAP}.`, path: ['railCap', side] });
      }
    }
  }
  if (request.seaCap !== undefined) {
    for (const side of ['allied', 'axis'] as const) {
      const points = request.seaCap[side];
      if (!Number.isSafeInteger(points) || points < 0 || points > MAXIMUM_SEA_CAP) {
        failures.push({ stage: 'OPTIONS', code: 'INVALID_SEA_CAP', message: `Sea Cap must be a whole number of points from 0 through ${MAXIMUM_SEA_CAP}.`, path: ['seaCap', side] });
      }
    }
  }
  if (request.inlandEntry !== undefined) {
    for (const side of ['allied', 'axis'] as const) {
      const entry = request.inlandEntry[side];
      if (typeof entry !== 'boolean') {
        failures.push({ stage: 'OPTIONS', code: 'INVALID_INLAND_ENTRY', message: 'Inland entry must be yes or no.', path: ['inlandEntry', side] });
      } else if (!entry && newGameSeaOf(request) === 'NONE') {
        failures.push({ stage: 'OPTIONS', code: 'INLAND_ENTRY_REQUIRED', message: 'Without a sea every side needs inland entry hexes.', path: ['inlandEntry', side] });
      } else if (!entry && (seaCapOf(request)?.[side] ?? 0) < 1) {
        // A side that lands everything by ship cannot do without Sea Cap (19.0f).
        failures.push({ stage: 'OPTIONS', code: 'SEA_CAP_REQUIRED', message: 'A side without inland entry hexes needs at least 1 Sea Cap.', path: ['seaCap', side] });
      }
    }
  }
  if (!BTR_CAMPAIGN_MONTHS.includes(request.startMonth)) {
    failures.push({ stage: 'OPTIONS', code: 'INVALID_START_MONTH', message: 'The campaign starts in a month from September through April.', path: ['startMonth'] });
  } else if (Number.isSafeInteger(request.turnLimit) && btrTurnDate(request.startMonth, request.turnLimit) === null) {
    failures.push({ stage: 'OPTIONS', code: 'CALENDAR_EXCEEDS_WEATHER_TABLE', message: 'The last turn would fall after April, where the Weather Table ends; start earlier or play fewer turns.', path: ['startMonth'] });
  }
  return failures;
};

/**
 * Map sizes a player may choose for a New Game. The map generator itself accepts 8x8 and up so
 * rule tests can build small contact maps; operations smaller than this are not offered to players.
 */
export const NEW_GAME_MAP_LIMITS = { minWidth: 16, maxWidth: 256, minHeight: 12, maxHeight: 256 } as const;

export const validateNewGameMapSize = (request: NewGameRequest): readonly GameFlowFailure[] => {
  const { minWidth, maxWidth, minHeight, maxHeight } = NEW_GAME_MAP_LIMITS;
  const failures: GameFlowFailure[] = [];
  const { width, height } = request.map;
  if (!Number.isSafeInteger(width) || width < minWidth || width > maxWidth) {
    failures.push({ stage: 'OPTIONS', code: 'MAP_WIDTH_OUT_OF_RANGE', message: `Map width must be from ${minWidth} to ${maxWidth} hexes.`, path: ['map', 'width'] });
  }
  if (!Number.isSafeInteger(height) || height < minHeight || height > maxHeight) {
    failures.push({ stage: 'OPTIONS', code: 'MAP_HEIGHT_OUT_OF_RANGE', message: `Map height must be from ${minHeight} to ${maxHeight} hexes.`, path: ['map', 'height'] });
  }
  return failures;
};

export const validateGeneratedScenarioPackage = (
  generated: GeneratedScenarioPackage,
): readonly GameFlowFailure[] => {
  const scenarioIssues = validateScenarioDefinition(generated.scenario);
  const ruleIssues = validateRuleConfiguration(generated.configuration);
  const failures: GameFlowFailure[] = [];
  if (scenarioIssues.length > 0) failures.push({
    stage: 'SCENARIO', code: 'SCENARIO_INVALID', message: 'Composed Scenario failed Foundation validation.', path: ['scenario'], issues: scenarioIssues,
  });
  if (ruleIssues.length > 0) failures.push({
    stage: 'SCENARIO', code: 'RULE_CONFIGURATION_INVALID', message: 'Generated rules configuration is invalid.', path: ['configuration'], issues: ruleIssues,
  });

  const mapById = new Map(generated.scenario.mapDefinition.hexes.map((hex) => [hex.id, hex]));
  const definitions = createPieceDefinitionCatalogIndex(generated.scenario.pieceCatalog);
  const sideByPlayer = new Map(generated.scenario.players.map((player) => [player.id, player.sideDefinitionId]));
  const sideByHex = new Map<string, string>();
  const stacking = new Map<string, number>();
  for (const piece of generated.scenario.initialPieceState.pieces) {
    if (piece.location.kind !== 'ON_MAP') continue;
    const hex = mapById.get(piece.location.hexId);
    if (hex?.terrainDefinitionIds.includes('terrain:water' as never)) failures.push({
      stage: 'DEPLOYMENT', code: 'UNIT_ON_WATER', message: `Piece ${piece.id} is deployed on water.`, path: ['deployment', 'pieces', piece.id],
    });
    const side = String(sideByPlayer.get(piece.ownerId));
    const occupiedSide = sideByHex.get(piece.location.hexId);
    if (occupiedSide && occupiedSide !== side) failures.push({
      stage: 'DEPLOYMENT', code: 'OPPOSING_INITIAL_STACK', message: `Opposing units share initial Hex ${piece.location.hexId}.`, path: ['deployment', 'pieces'],
    });
    sideByHex.set(piece.location.hexId, side);
    const definition = definitions.get(piece.definitionId);
    const profile = definition?.faces.find(({ id }) => id === piece.currentFaceId)?.steps
      .find(({ remainingSteps }) => remainingSteps === piece.remainingSteps);
    stacking.set(piece.location.hexId, (stacking.get(piece.location.hexId) ?? 0) + Number(profile?.regimentalEquivalentTicks ?? 0));
  }
  for (const [hexId, used] of stacking) {
    if (used > generated.configuration.stackingLimitReTicks) failures.push({
      stage: 'DEPLOYMENT', code: 'INITIAL_OVERSTACK', message: `Initial stack ${hexId} uses ${used}/${generated.configuration.stackingLimitReTicks} RE ticks.`, path: ['deployment', 'stacking', hexId],
    });
  }
  for (const player of generated.scenario.players) {
    // A side without inland entry enters by ship through its ports instead (19.0f): it needs one at the start, and its
    // sources are ports, declared for its side or, when both sides use ports, for whoever holds them.
    const bySea = generated.configuration.seaArrivals?.includes(player.id) ?? false;
    if (!generated.scenario.sources.some(({ sideDefinitionId }) => sideDefinitionId === player.sideDefinitionId || (bySea && sideDefinitionId === null))) failures.push({
      stage: 'DEPLOYMENT', code: 'MISSING_SIDE_SOURCE', message: `${player.name} has no supply source.`, path: ['scenario', 'sources'],
    });
    if (!bySea && !generated.scenario.entries.some(({ sideDefinitionId }) => sideDefinitionId === player.sideDefinitionId)) failures.push({
      stage: 'DEPLOYMENT', code: 'MISSING_SIDE_ENTRY', message: `${player.name} has no entry region.`, path: ['scenario', 'entries'],
    });
    if (bySea && !generated.scenario.initialMapState.features.some(({ definitionId, controllerId }) => String(definitionId) === 'facility:port' && controllerId === player.id)) failures.push({
      stage: 'DEPLOYMENT', code: 'MISSING_SIDE_PORT', message: `${player.name} lands everything by sea but holds no port.`, path: ['scenario', 'initialMapState', 'features'],
    });
    if (!generated.scenario.initialPieceState.pieces.some(({ ownerId, mode }) => ownerId === player.id && mode !== null)) failures.push({
      stage: 'DEPLOYMENT', code: 'MISSING_MANEUVER_UNIT', message: `${player.name} has no maneuver unit.`, path: ['deployment', 'pieces'],
    });
  }
  return failures;
};
