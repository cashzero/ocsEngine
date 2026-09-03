import type { DefinitionId, ValidationIssue } from '../../core/index.js';
import type { PieceDefinitionCatalog } from '../../domain/piece/index.js';

export const OOB_GENERATOR_VERSION = '0.1.0' as const;

export const OOB_SCALES = ['COMPACT', 'STANDARD', 'LARGE'] as const;
export type OobScale = (typeof OOB_SCALES)[number];
export type OobSide = 'ALLIED' | 'AXIS';
export type OobFormationArchetype = 'ARMORED' | 'INFANTRY' | 'MOBILE_INFANTRY';
export type OobUnitRole =
  | 'FORMATION_COMMAND'
  | 'COMBAT'
  | 'ARTILLERY'
  | 'RECONNAISSANCE'
  | 'ENGINEER'
  | 'TRANSPORT'
  | 'SUPPLY';

export interface RandomOobOptions {
  readonly seed: number;
  readonly scale: OobScale;
  readonly formationsPerSide: number;
}

export interface NormalizedRandomOobOptions extends RandomOobOptions {}

export interface GeneratedOobUnit {
  readonly id: string;
  readonly definitionId: DefinitionId;
  readonly side: OobSide;
  readonly formationId: DefinitionId | null;
  readonly role: OobUnitRole;
  readonly sourceArchetypeId: string;
  readonly pointCost: number;
}

export interface GeneratedOobFormation {
  readonly id: DefinitionId;
  readonly side: OobSide;
  readonly name: string;
  readonly archetype: OobFormationArchetype;
  readonly units: readonly GeneratedOobUnit[];
}

export interface GeneratedOobSide {
  readonly side: OobSide;
  readonly formations: readonly GeneratedOobFormation[];
  readonly independentUnits: readonly GeneratedOobUnit[];
}

export interface GeneratedOobMetrics {
  readonly unitCount: number;
  readonly formationCount: number;
  readonly unitsBySide: Readonly<Record<OobSide, number>>;
  readonly pointsBySide: Readonly<Record<OobSide, number>>;
  readonly balanceRatio: number;
  readonly rolesBySide: Readonly<Record<OobSide, Readonly<Record<OobUnitRole, number>>>>;
}

export interface GeneratedOob {
  readonly schemaVersion: 1;
  readonly generatorVersion: typeof OOB_GENERATOR_VERSION;
  readonly options: NormalizedRandomOobOptions;
  readonly sides: readonly GeneratedOobSide[];
  readonly pieceDefinitionCatalog: PieceDefinitionCatalog;
  readonly metrics: GeneratedOobMetrics;
  readonly warnings: readonly string[];
}

export interface OobGenerationError {
  readonly code: 'INVALID_OPTIONS' | 'GENERATION_INVALID';
  readonly message: string;
  readonly path: readonly (string | number)[];
  readonly issues?: readonly ValidationIssue[];
}

export interface GeneratedOobValidation {
  readonly valid: boolean;
  readonly issues: readonly ValidationIssue[];
  readonly metrics: GeneratedOobMetrics;
}

export interface OobSeedSweepReport {
  readonly requested: number;
  readonly generated: number;
  readonly invalid: number;
  readonly exceptions: number;
  readonly minimumBalanceRatio: number;
  readonly minimumUnitsPerSide: number;
  readonly maximumUnitsPerSide: number;
  readonly archetypeCounts: Readonly<Record<OobFormationArchetype, number>>;
  readonly failures: readonly { readonly seed: number; readonly codes: readonly string[] }[];
}
