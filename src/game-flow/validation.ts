import { validateScenarioDefinition } from '../domain/scenario/index.js';
import { createPieceDefinitionCatalogIndex } from '../domain/piece/index.js';
import { validateRuleConfiguration } from '../rules/index.js';
import type { GameFlowFailure, GeneratedScenarioPackage, NewGameRequest } from './model.js';

const uint32 = (value: number): boolean => Number.isSafeInteger(value) && value >= 0 && value <= 0xffff_ffff;

export const validateNewGameRequest = (request: NewGameRequest): readonly GameFlowFailure[] => {
  const failures: GameFlowFailure[] = [];
  if (request.templateId !== 'GROUND_DUEL') failures.push({ stage: 'OPTIONS', code: 'UNKNOWN_TEMPLATE', message: 'Only GROUND_DUEL is currently supported.', path: ['templateId'] });
  for (const [name, value] of Object.entries(request.seeds)) {
    if (!uint32(value)) failures.push({ stage: 'OPTIONS', code: 'INVALID_SEED', message: `${name} seed must be uint32.`, path: ['seeds', name] });
  }
  if (!Number.isSafeInteger(request.turnLimit) || request.turnLimit < 1 || request.turnLimit > 20) {
    failures.push({ stage: 'OPTIONS', code: 'INVALID_TURN_LIMIT', message: 'Turn limit must be an integer from 1 through 20.', path: ['turnLimit'] });
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
    if (!generated.scenario.sources.some(({ sideDefinitionId }) => sideDefinitionId === player.sideDefinitionId)) failures.push({
      stage: 'DEPLOYMENT', code: 'MISSING_SIDE_SOURCE', message: `${player.name} has no supply source.`, path: ['scenario', 'sources'],
    });
    if (!generated.scenario.entries.some(({ sideDefinitionId }) => sideDefinitionId === player.sideDefinitionId)) failures.push({
      stage: 'DEPLOYMENT', code: 'MISSING_SIDE_ENTRY', message: `${player.name} has no entry region.`, path: ['scenario', 'entries'],
    });
    if (!generated.scenario.initialPieceState.pieces.some(({ ownerId, mode }) => ownerId === player.id && mode !== null)) failures.push({
      stage: 'DEPLOYMENT', code: 'MISSING_MANEUVER_UNIT', message: `${player.name} has no maneuver unit.`, path: ['deployment', 'pieces'],
    });
  }
  return failures;
};
