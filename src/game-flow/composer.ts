import {
  FOUNDATION_SCHEMA_VERSION,
  parseDefinitionId,
  parsePlayerId,
  parseScenarioId,
  type DefinitionId,
  type PlayerId,
  type Result,
} from '../core/index.js';
import type { ScenarioDefinition } from '../domain/scenario/index.js';
import { parseSeatId, type SeatBinding } from '../gameplay/index.js';
import type { GeneratedMap } from '../generation/map/index.js';
import type { GeneratedOob, OobSide } from '../generation/oob/index.js';
import { createGeneratedRuleConfiguration } from './configuration.js';
import { GENERATED_REINFORCEMENT_BOXES } from './deployment.js';
import type {
  GameFlowFailure,
  GeneratedDeployment,
  GeneratedScenarioPackage,
  NewGameRequest,
} from './model.js';
import { GAME_FLOW_VERSION } from './model.js';

const must = <T, E>(result: Result<T, E>): T => {
  if (!result.ok) throw new Error('Static game-flow ID is invalid.');
  return result.value;
};
const definitionId = (value: string): DefinitionId => must(parseDefinitionId(value));

export const GENERATED_PLAYERS: Readonly<Record<OobSide, PlayerId>> = {
  ALLIED: must(parsePlayerId('player:allied')),
  AXIS: must(parsePlayerId('player:axis')),
};

export const GENERATED_BINDINGS: readonly SeatBinding[] = [
  { seatId: must(parseSeatId('seat:allied')), playerId: GENERATED_PLAYERS.ALLIED, label: 'Allied commander' },
  { seatId: must(parseSeatId('seat:axis')), playerId: GENERATED_PLAYERS.AXIS, label: 'Axis commander' },
];

const declarations = (
  prefix: 'entry' | 'source',
  hexIds: readonly string[],
  side: OobSide,
) => hexIds.map((hexId, index) => ({
  id: definitionId(`${prefix}:generated:${side.toLowerCase()}:${index + 1}`),
  hexId: hexId as never,
  sideDefinitionId: definitionId(`side:${side.toLowerCase()}`),
}));

export const composeGeneratedScenario = (
  request: NewGameRequest,
  generatedMap: GeneratedMap,
  generatedOob: GeneratedOob,
  deployment: GeneratedDeployment,
): Result<GeneratedScenarioPackage, readonly GameFlowFailure[]> => {
  const parsedScenarioId = parseScenarioId(
    `scenario:generated:${request.map.style.toLowerCase()}:${request.seeds.map}:${request.seeds.oob}:${request.seeds.deployment}`,
  );
  if (!parsedScenarioId.ok) return { ok: false, error: [{
    stage: 'SCENARIO', code: 'INVALID_SCENARIO_ID', message: 'Generated Scenario ID is invalid.', path: ['scenario', 'id'],
  }] };
  const scenario: ScenarioDefinition = {
    id: parsedScenarioId.value,
    schemaVersion: FOUNDATION_SCHEMA_VERSION,
    mapDefinition: generatedMap.mapDefinition,
    initialMapState: deployment.initialMapState,
    pieceCatalog: generatedOob.pieceDefinitionCatalog,
    initialPieceState: deployment.initialPieceState,
    players: [
      { id: GENERATED_PLAYERS.ALLIED, sideDefinitionId: definitionId('side:allied'), name: 'Allied' },
      { id: GENERATED_PLAYERS.AXIS, sideDefinitionId: definitionId('side:axis'), name: 'Axis' },
    ],
    turnStart: { turn: 1, firstPlayerId: GENERATED_PLAYERS.ALLIED },
    boxes: [
      {
        id: GENERATED_REINFORCEMENT_BOXES.ALLIED,
        kind: 'OFF_MAP',
        name: 'Allied reinforcements',
        linkedHexId: generatedMap.strategicRegions.firstEntryHexIds[0] ?? null,
      },
      {
        id: GENERATED_REINFORCEMENT_BOXES.AXIS,
        kind: 'OFF_MAP',
        name: 'Axis reinforcements',
        linkedHexId: generatedMap.strategicRegions.secondEntryHexIds[0] ?? null,
      },
    ], tracks: [], pools: [],
    entries: [
      ...declarations('entry', generatedMap.strategicRegions.firstEntryHexIds, 'ALLIED'),
      ...declarations('entry', generatedMap.strategicRegions.secondEntryHexIds, 'AXIS'),
    ],
    sources: [
      ...declarations('source', generatedMap.strategicRegions.firstSupplyHexIds, 'ALLIED'),
      ...declarations('source', generatedMap.strategicRegions.secondSupplyHexIds, 'AXIS'),
    ],
    configuration: {
      optionDefinitionIds: [definitionId('option:generated-ground-duel')],
      weatherDefinitionId: definitionId('weather:clear'),
      tableDefinitionIds: [],
    },
    externalTables: [],
    provenance: [
      ...generatedMap.mapDefinition.provenance,
      ...generatedOob.pieceDefinitionCatalog.provenance,
      { document: 'ocsEngine game flow', locator: `M8/${GAME_FLOW_VERSION}` },
    ],
    generatorMetadata: {
      generatorDefinitionId: definitionId('generator:ocs-new-game'),
      version: GAME_FLOW_VERSION,
      seeds: [
        { kind: 'map', value: String(request.seeds.map) },
        { kind: 'oob', value: String(request.seeds.oob) },
        { kind: 'deployment', value: String(request.seeds.deployment) },
        { kind: 'rules', value: String(request.seeds.rules) },
      ],
    },
  };
  return { ok: true, value: {
    request,
    generatedMap,
    generatedOob,
    deployment,
    scenario,
    configuration: createGeneratedRuleConfiguration(deployment, request.turnLimit),
    bindings: GENERATED_BINDINGS,
    summary: {
      mapSize: `${generatedMap.options.width}×${generatedMap.options.height}`,
      mapStyle: generatedMap.options.style,
      unitCount: generatedOob.metrics.unitCount,
      formationCount: generatedOob.metrics.formationCount,
      objectiveCount: deployment.objectiveHexIds.length,
      turnLimit: request.turnLimit,
    },
    warnings: [...generatedMap.warnings, ...generatedOob.warnings, ...deployment.warnings],
  } };
};
