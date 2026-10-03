import type { DefinitionId, ValidationIssue } from '../../core/index.js';
import type { PieceDefinitionCatalog } from '../../domain/piece/index.js';

export const OOB_GENERATOR_VERSION = '0.2.0' as const;

export const OOB_SCALES = ['COMPACT', 'STANDARD', 'LARGE'] as const;
export type OobScale = (typeof OOB_SCALES)[number];
export type OobSide = 'ALLIED' | 'AXIS';
export type OobFormationArchetype = 'ARMORED' | 'INFANTRY' | 'MOBILE_INFANTRY' | 'AIRBORNE';
/**
 * Infantry and airborne divisions are one XX counter (the Rule Engine's Breakdown rule, 20.0, lets them detach
 * regiments in play); armored and mobile-infantry divisions are an HQ plus regiment-sized units.
 */
export const isSingleUnitDivision = (_side: OobSide, archetype: OobFormationArchetype): boolean =>
  archetype === 'INFANTRY' || archetype === 'AIRBORNE';
export type OobUnitRole =
  | 'FORMATION_COMMAND'
  | 'COMBAT'
  | 'ARTILLERY'
  | 'RECONNAISSANCE'
  | 'ENGINEER'
  | 'TRANSPORT'
  | 'SUPPLY'
  | 'AIRCRAFT'
  | 'AIR_BASE';

/** Air forces in a generated OOB: none (ground duel) or each side's aircraft and Air Bases (14.0, 15.0). */
export const AIR_FORCE_LEVELS = ['NONE', 'STANDARD'] as const;
export type AirForceLevel = (typeof AIR_FORCE_LEVELS)[number];

/** Divisions a side may field, and how many of them may be armored. */
export const OOB_DIVISION_LIMITS = { minDivisions: 1, maxDivisions: 20, maxArmored: 6 } as const;

export interface RandomOobOptions {
  readonly seed: number;
  readonly scale: OobScale;
  /** Every division a side fields: its armored divisions plus its foot (infantry and airborne) divisions. */
  readonly divisionsPerSide: number;
  /**
   * How many of `divisionsPerSide` are armored: an HQ plus regiment-sized units (Allied armored divisions;
   * Axis Panzer divisions, every second one a Panzergrenadier division). The rest are single-counter foot
   * divisions, about one in four of them airborne.
   */
  readonly armoredDivisionsPerSide: number;
  /** Absent means NONE, so ground-only requests generate exactly what they did before air power. */
  readonly air?: AirForceLevel;
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
