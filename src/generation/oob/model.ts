import type { DefinitionId, ValidationIssue } from '../../core/index.js';
import type { PieceDefinitionCatalog } from '../../domain/piece/index.js';

export const OOB_GENERATOR_VERSION = '0.4.0' as const;

export const OOB_SCALES = ['COMPACT', 'STANDARD', 'LARGE'] as const;
export type OobScale = (typeof OOB_SCALES)[number];
export type OobSide = 'ALLIED' | 'AXIS';
export type OobFormationArchetype = 'ARMORED' | 'INFANTRY' | 'MOBILE_INFANTRY' | 'AIRBORNE';
/**
 * Infantry and airborne divisions are one XX counter (the Rule Engine's Breakdown rule, 20.0, lets them detach
 * regiments in play); armored and mobile-infantry divisions are regiment-sized units. No division contains an HQ: an
 * HQ is an independent unit (3.2f) that belongs to no formation.
 */
export const isSingleUnitDivision = (_side: OobSide, archetype: OobFormationArchetype): boolean =>
  archetype === 'INFANTRY' || archetype === 'AIRBORNE';
export type OobUnitRole =
  | 'HQ'
  | 'COMBAT'
  | 'ARTILLERY'
  | 'RECONNAISSANCE'
  /** Independent armor (US tank battalions, German assault-gun battalions): a side's flexible tank support. */
  | 'TANK'
  /** Independent anti-tank units (US tank destroyers, German Panzerjäger): Heavy AT effects in defence (9.4e). */
  | 'ANTI_TANK'
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

/**
 * An attacking side fields this many times the divisions of the other, armored ones included, and the balancing aims
 * at this ratio of combat value (user, 2026-10-07: "進攻方兵力要比較多吧 至於是1.5倍還是2或3 看你";
 * docs/roadmap/13-engagement-scenarios-wbs.md §4). With equal forces the bot attacker won 10 of 40 games; at 1.5 it won 18.
 */
export const ATTACKER_FORCE_RATIO = 1.5;

/** Divisions `side` fields: the requested count, or ATTACKER_FORCE_RATIO times it (within the limits) for the attacker. */
export const sideDivisions = (
  options: Pick<RandomOobOptions, 'divisionsPerSide' | 'armoredDivisionsPerSide' | 'attacker'>,
  side: OobSide,
): { readonly divisionsPerSide: number; readonly armoredDivisionsPerSide: number } => {
  if (options.attacker !== side) return { divisionsPerSide: options.divisionsPerSide, armoredDivisionsPerSide: options.armoredDivisionsPerSide };
  const divisionsPerSide = Math.min(OOB_DIVISION_LIMITS.maxDivisions, Math.round(options.divisionsPerSide * ATTACKER_FORCE_RATIO));
  return {
    divisionsPerSide,
    armoredDivisionsPerSide: Math.min(OOB_DIVISION_LIMITS.maxArmored, divisionsPerSide, Math.round(options.armoredDivisionsPerSide * ATTACKER_FORCE_RATIO)),
  };
};

export interface RandomOobOptions {
  readonly seed: number;
  readonly scale: OobScale;
  /** Every division a side fields: its armored divisions plus its foot (infantry and airborne) divisions. */
  readonly divisionsPerSide: number;
  /**
   * How many of `divisionsPerSide` are armored: regiment-sized units (Allied armored divisions;
   * Axis Panzer divisions, every second one a Panzergrenadier division). The rest are single-counter foot
   * divisions, about one in four of them airborne.
   */
  readonly armoredDivisionsPerSide: number;
  /** The side that attacks (sideDivisions); absent in a meeting engagement, where both sides are equal. */
  readonly attacker?: OobSide;
  /** The side with an off-map airfield and its aircraft (docs/roadmap/13-engagement-scenarios-wbs.md §6), whatever `air` says. */
  readonly offMapAir?: OobSide;
  /** Absent means NONE, so ground-only requests generate exactly what they did before air power. */
  readonly air?: AirForceLevel;
  /** Absent means NONE. STANDARD adds transport aircraft (14.9) and a paratroop battalion per side for Air Drops (14.10). Needs `air`. */
  readonly airTransport?: AirForceLevel;
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
  /** Aircraft that reinforce: the Game Turn they arrive Active at a friendly Air Base (13.6). */
  readonly arrivalTurn?: number;
  /** Paratroops start in the hex of an Air Base, ready to be carried (14.9c). */
  /** AIR_BASE: waits at the first Air Base (paratroops, 14.9c). OFF_MAP_AIRFIELD: based at the side's off-map airfield. */
  readonly staging?: 'AIR_BASE' | 'OFF_MAP_AIRFIELD';
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
  /**
   * The side's objective garrison (a generator rule, not a BTR counter: 1-1-0, one step, it cannot move). Deployment
   * places one on every objective the side holds at the start, so no objective is taken by simply walking in.
   */
  readonly garrisonDefinitionId: DefinitionId;
}

export interface GeneratedOobMetrics {
  readonly unitCount: number;
  readonly formationCount: number;
  readonly unitsBySide: Readonly<Record<OobSide, number>>;
  readonly pointsBySide: Readonly<Record<OobSide, number>>;
  /** Combat value per side (printed Combat Mode strength weighed by AR; see combatValueOf). */
  readonly combatValueBySide: Readonly<Record<OobSide, number>>;
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
