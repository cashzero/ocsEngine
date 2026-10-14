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
import { createGeneratedRuleConfiguration, shippingSides } from './configuration.js';
import { GENERATED_OFF_MAP_AIRFIELD_BOXES, GENERATED_REINFORCEMENT_BOXES } from './deployment.js';
import type {
  GameFlowFailure,
  GeneratedDeployment,
  GeneratedScenarioPackage,
  NewGameRequest,
} from './model.js';
import { GAME_FLOW_VERSION, newGameSeaOf, seaArrivalSidesOf, styleSeaOf } from './model.js';
import { allocateGarrisonSupply } from './garrison-supply.js';

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

/**
 * Ports as Supply Sources (19.0e, the generated game's game-specific rule): a port serves the sides with Sea Cap, each
 * wherever no enemy combat unit or un-negated enemy ZOC shuts it (12.6b, 19.0a). A side without Sea Cap cannot use
 * ports, so with one shipping side the declaration names it, and with none no port is a source.
 */
const portSources = (generatedMap: GeneratedMap, request: NewGameRequest) => {
  const sides = shippingSides(request);
  if (sides.length === 0) return [];
  // Either way a port serves only the side holding it (9.14h), which the rules check as play goes on.
  const side = sides.length === 1 ? definitionId(`side:${sides[0]!.toLowerCase()}`) : null;
  return generatedMap.strategicRegions.portHexIds.map((hexId, index) => ({
    id: definitionId(`source:generated:port:${index + 1}`), hexId, sideDefinitionId: side,
  }));
};

export const composeGeneratedScenario = (
  request: NewGameRequest,
  generatedMap: GeneratedMap,
  generatedOob: GeneratedOob,
  deployment: GeneratedDeployment,
): Result<GeneratedScenarioPackage, readonly GameFlowFailure[]> => {
  const parsedScenarioId = parseScenarioId(
    `scenario:generated:${request.map.style.toLowerCase()}:${request.seeds.map}:${request.seeds.oob}:${request.seeds.deployment}`
      // A meeting engagement keeps the ID it had before engagements existed.
      + (request.engagement === undefined || request.engagement === 'MEETING' ? '' : `:${request.engagement.toLowerCase().replace('_', '-')}`)
      // So does a map with its style's own sea.
      + (newGameSeaOf(request) === styleSeaOf(request.map.style) ? '' : `:sea-${newGameSeaOf(request).toLowerCase()}`)
      // A side without inland entry changes the map (a port near its edge) and the package.
      + seaArrivalSidesOf(request).map((side) => `:by-sea-${side.toLowerCase()}`).join(''),
  );
  if (!parsedScenarioId.ok) return { ok: false, error: [{
    stage: 'SCENARIO', code: 'INVALID_SCENARIO_ID', message: 'Generated Scenario ID is invalid.', path: ['scenario', 'id'],
  }] };
  let scenario: ScenarioDefinition = {
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
    // The attacker opens an attack; a meeting engagement keeps Allied first. Later turns roll for it (2.3).
    turnStart: { turn: 1, firstPlayerId: GENERATED_PLAYERS[deployment.attacker ?? 'ALLIED'] },
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
      // §6: the attacker's off-map airfield; its aircraft fly in over that side's entry hexes.
      ...(deployment.attacker === null ? [] : [{
        id: GENERATED_OFF_MAP_AIRFIELD_BOXES[deployment.attacker],
        kind: 'OFF_MAP' as const,
        name: `${deployment.attacker === 'ALLIED' ? 'Allied' : 'Axis'} off-map airfield`,
        linkedHexId: (deployment.attacker === 'ALLIED' ? generatedMap.strategicRegions.firstEntryHexIds : generatedMap.strategicRegions.secondEntryHexIds)[0] ?? null,
      }]),
    ], tracks: [], pools: [],
    // A side without inland entry has no land entry edge: what reaches it comes by ship, and its sources are its ports.
    entries: [
      ...seaArrivalSidesOf(request).includes('ALLIED') ? [] : declarations('entry', generatedMap.strategicRegions.firstEntryHexIds, 'ALLIED'),
      ...seaArrivalSidesOf(request).includes('AXIS') ? [] : declarations('entry', generatedMap.strategicRegions.secondEntryHexIds, 'AXIS'),
    ],
    sources: [
      ...seaArrivalSidesOf(request).includes('ALLIED') ? [] : declarations('source', generatedMap.strategicRegions.firstSupplyHexIds, 'ALLIED'),
      ...seaArrivalSidesOf(request).includes('AXIS') ? [] : declarations('source', generatedMap.strategicRegions.secondSupplyHexIds, 'AXIS'),
      ...portSources(generatedMap, request),
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
  const configuration = createGeneratedRuleConfiguration(deployment, request, generatedOob, GENERATED_PLAYERS);
  const allocated = allocateGarrisonSupply(scenario, configuration, deployment);
  if (!allocated.ok) return allocated;
  deployment = allocated.value;
  scenario = { ...scenario, initialPieceState: deployment.initialPieceState };
  return { ok: true, value: {
    request,
    generatedMap,
    generatedOob,
    deployment,
    scenario,
    configuration,
    bindings: GENERATED_BINDINGS,
    summary: {
      mapSize: `${generatedMap.options.width}×${generatedMap.options.height}`,
      mapStyle: generatedMap.options.style,
      engagement: request.engagement ?? 'MEETING',
      // Supply dumps are stockpiles, not units: they are not in the unit rosters, so they are not in the headline count.
      unitCount: generatedOob.metrics.unitCount - generatedOob.metrics.rolesBySide.ALLIED.SUPPLY - generatedOob.metrics.rolesBySide.AXIS.SUPPLY,
      formationCount: generatedOob.metrics.formationCount,
      objectiveCount: deployment.objectiveHexIds.length,
      turnLimit: request.turnLimit,
    },
    warnings: [...generatedMap.warnings, ...generatedOob.warnings, ...deployment.warnings],
  } };
};
