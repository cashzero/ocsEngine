import type {
  DefinitionId,
  HexId,
  PlayerId,
  ScenarioId,
  SchemaVersion,
  SourceReference,
} from '../../core/index.js';
import type {
  MapBoxId,
  MapDefinition,
  MapState,
  MapTrackId,
  PiecePoolId,
} from '../map/index.js';
import type {
  PieceDefinitionCatalog,
  PieceRuntimeState,
} from '../piece/index.js';

export interface ScenarioPlayer {
  readonly id: PlayerId;
  readonly sideDefinitionId: DefinitionId;
  readonly name: string;
}

export interface ScenarioTurnStart {
  readonly turn: number;
  readonly firstPlayerId: PlayerId;
}

export interface ScenarioBoxDefinition {
  readonly id: MapBoxId;
  readonly kind: 'OFF_MAP' | 'HOLDING';
  readonly name: string;
  readonly linkedHexId: HexId | null;
}

export interface ScenarioTrackDefinition {
  readonly id: MapTrackId;
  readonly name: string;
  readonly minimumPosition: number;
  readonly maximumPosition: number;
}

export interface ScenarioPoolDefinition {
  readonly id: PiecePoolId;
  readonly name: string;
}

export interface ScenarioEntryDeclaration {
  readonly id: DefinitionId;
  readonly hexId: HexId;
  readonly sideDefinitionId: DefinitionId | null;
}

export interface ScenarioSourceDeclaration {
  readonly id: DefinitionId;
  readonly hexId: HexId;
  readonly sideDefinitionId: DefinitionId | null;
}

export interface ScenarioConfiguration {
  readonly optionDefinitionIds: readonly DefinitionId[];
  readonly weatherDefinitionId: DefinitionId;
  readonly tableDefinitionIds: readonly DefinitionId[];
}

export interface ScenarioExternalTableReference {
  readonly definitionId: DefinitionId;
  readonly source: SourceReference;
}

export interface ScenarioGeneratorSeed {
  readonly kind: string;
  readonly value: string;
}

/** Descriptive metadata only; Foundation never calls or imports a generator. */
export interface ScenarioGeneratorMetadata {
  readonly generatorDefinitionId: DefinitionId;
  readonly version: string;
  readonly seeds: readonly ScenarioGeneratorSeed[];
}

/**
 * Complete, immutable input envelope shared by fixed and future generated
 * scenarios. It contains no Rule or Gameplay Engine behavior.
 */
export interface ScenarioDefinition {
  readonly id: ScenarioId;
  readonly schemaVersion: SchemaVersion;
  readonly mapDefinition: MapDefinition;
  readonly initialMapState: MapState;
  readonly pieceCatalog: PieceDefinitionCatalog;
  readonly initialPieceState: PieceRuntimeState;
  readonly players: readonly ScenarioPlayer[];
  readonly turnStart: ScenarioTurnStart;
  readonly boxes: readonly ScenarioBoxDefinition[];
  readonly tracks: readonly ScenarioTrackDefinition[];
  readonly pools: readonly ScenarioPoolDefinition[];
  readonly entries: readonly ScenarioEntryDeclaration[];
  readonly sources: readonly ScenarioSourceDeclaration[];
  readonly configuration: ScenarioConfiguration;
  readonly externalTables: readonly ScenarioExternalTableReference[];
  readonly provenance: readonly SourceReference[];
  readonly generatorMetadata: ScenarioGeneratorMetadata | null;
}
