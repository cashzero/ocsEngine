import type { PieceFamily } from '../../domain/piece/index.js';
import type { OobFormationArchetype, OobSide, OobUnitRole } from './model.js';

export const BTR_BUILD_FILE_SHA256 = '686ECB3090F89AC3952E01C28B3E6446A2315424428652D22DCA3FB5F75212AD' as const;

export interface ReviewedOobArchetype {
  readonly id: string;
  readonly side: OobSide;
  readonly role: OobUnitRole;
  readonly formationArchetypes: readonly OobFormationArchetype[];
  readonly rawName: string;
  readonly gpid: number;
  readonly family: PieceFamily;
  readonly combatStrength: number | null;
  readonly actionRating: number | null;
  readonly movementPoints: number | null;
  readonly regimentalEquivalents: number | null;
  readonly range: number | null;
  readonly steps: number;
  readonly pointCost: number;
}

const ALL_FORMATIONS: readonly OobFormationArchetype[] = ['ARMORED', 'INFANTRY', 'MOBILE_INFANTRY'];

/**
 * Reviewed normalization set. BTR names and GPIDs are evidence locators; ratings are
 * generator design values documented in M7 normalization decisions, not decoded claims.
 */
export const REVIEWED_OOB_ARCHETYPES: readonly ReviewedOobArchetype[] = Object.freeze([
  { id: 'allied-command', side: 'ALLIED', role: 'FORMATION_COMMAND', formationArchetypes: ALL_FORMATIONS, rawName: 'US HQ 3rd Corps', gpid: 319, family: 'GROUND', combatStrength: 0, actionRating: 3, movementPoints: 4, regimentalEquivalents: 0.5, range: 0, steps: 1, pointCost: 2 },
  { id: 'allied-armored-combat', side: 'ALLIED', role: 'COMBAT', formationArchetypes: ['ARMORED'], rawName: 'US 2.A CCA', gpid: 160, family: 'GROUND', combatStrength: 10, actionRating: 4, movementPoints: 8, regimentalEquivalents: 1, range: 0, steps: 2, pointCost: 10 },
  { id: 'allied-infantry-combat', side: 'ALLIED', role: 'COMBAT', formationArchetypes: ['INFANTRY'], rawName: 'US 159 Inf Rgt', gpid: 408, family: 'GROUND', combatStrength: 4, actionRating: 3, movementPoints: 3, regimentalEquivalents: 1, range: 0, steps: 1, pointCost: 8 },
  { id: 'allied-mobile-combat', side: 'ALLIED', role: 'COMBAT', formationArchetypes: ['MOBILE_INFANTRY'], rawName: 'US 82.Abn 325 GIR', gpid: 385, family: 'GROUND', combatStrength: 9, actionRating: 4, movementPoints: 5, regimentalEquivalents: 1, range: 0, steps: 2, pointCost: 9 },
  { id: 'allied-artillery', side: 'ALLIED', role: 'ARTILLERY', formationArchetypes: ALL_FORMATIONS, rawName: 'US 2.A Arty', gpid: 164, family: 'GROUND', combatStrength: 4, actionRating: 3, movementPoints: 4, regimentalEquivalents: 0.5, range: 4, steps: 1, pointCost: 7 },
  { id: 'allied-recon', side: 'ALLIED', role: 'RECONNAISSANCE', formationArchetypes: ['ARMORED', 'MOBILE_INFANTRY'], rawName: "US 2.A 82 Arm'd Recon Bn", gpid: 163, family: 'GROUND', combatStrength: 3, actionRating: 4, movementPoints: 10, regimentalEquivalents: 0.5, range: 0, steps: 1, pointCost: 4 },
  { id: 'allied-engineer', side: 'ALLIED', role: 'ENGINEER', formationArchetypes: ALL_FORMATIONS, rawName: 'US Pontoon', gpid: 466, family: 'GROUND', combatStrength: 1, actionRating: 3, movementPoints: 4, regimentalEquivalents: 0.5, range: 0, steps: 1, pointCost: 3 },
  { id: 'allied-transport', side: 'ALLIED', role: 'TRANSPORT', formationArchetypes: ALL_FORMATIONS, rawName: 'US Truck', gpid: 77, family: 'GROUND', combatStrength: 0, actionRating: 2, movementPoints: 12, regimentalEquivalents: 0.5, range: 0, steps: 1, pointCost: 2 },
  { id: 'allied-supply', side: 'ALLIED', role: 'SUPPLY', formationArchetypes: ALL_FORMATIONS, rawName: 'Allied Supply Dump', gpid: 321, family: 'RESOURCE', combatStrength: null, actionRating: null, movementPoints: null, regimentalEquivalents: null, range: null, steps: 0, pointCost: 2 },
  { id: 'axis-command', side: 'AXIS', role: 'FORMATION_COMMAND', formationArchetypes: ALL_FORMATIONS, rawName: 'Ge HQ 39th Pz Corps', gpid: 1103, family: 'GROUND', combatStrength: 0, actionRating: 3, movementPoints: 4, regimentalEquivalents: 0.5, range: 0, steps: 1, pointCost: 2 },
  { id: 'axis-armored-combat', side: 'AXIS', role: 'COMBAT', formationArchetypes: ['ARMORED'], rawName: 'Ge 2.Pz 1-3 Pz Bn', gpid: 733, family: 'GROUND', combatStrength: 10, actionRating: 4, movementPoints: 8, regimentalEquivalents: 1, range: 0, steps: 2, pointCost: 10 },
  { id: 'axis-infantry-combat', side: 'AXIS', role: 'COMBAT', formationArchetypes: ['INFANTRY'], rawName: 'Ge 3.PG 8 Inf Rgt', gpid: 806, family: 'GROUND', combatStrength: 7, actionRating: 4, movementPoints: 3, regimentalEquivalents: 1, range: 0, steps: 1, pointCost: 8 },
  { id: 'axis-mobile-combat', side: 'AXIS', role: 'COMBAT', formationArchetypes: ['MOBILE_INFANTRY'], rawName: 'Ge 3.PG 8 Inf Rgt', gpid: 806, family: 'GROUND', combatStrength: 9, actionRating: 4, movementPoints: 5, regimentalEquivalents: 1, range: 0, steps: 2, pointCost: 9 },
  { id: 'axis-artillery', side: 'AXIS', role: 'ARTILLERY', formationArchetypes: ALL_FORMATIONS, rawName: 'Ge 2.Pz 74 Arty Rgt', gpid: 739, family: 'GROUND', combatStrength: 4, actionRating: 3, movementPoints: 4, regimentalEquivalents: 0.5, range: 4, steps: 1, pointCost: 7 },
  { id: 'axis-recon', side: 'AXIS', role: 'RECONNAISSANCE', formationArchetypes: ['ARMORED', 'MOBILE_INFANTRY'], rawName: 'Ge 2.Pz 2 Aufk Bn', gpid: 737, family: 'GROUND', combatStrength: 3, actionRating: 4, movementPoints: 10, regimentalEquivalents: 0.5, range: 0, steps: 1, pointCost: 4 },
  { id: 'axis-engineer', side: 'AXIS', role: 'ENGINEER', formationArchetypes: ALL_FORMATIONS, rawName: 'Ge Pontoon', gpid: 713, family: 'GROUND', combatStrength: 1, actionRating: 3, movementPoints: 4, regimentalEquivalents: 0.5, range: 0, steps: 1, pointCost: 3 },
  { id: 'axis-transport', side: 'AXIS', role: 'TRANSPORT', formationArchetypes: ALL_FORMATIONS, rawName: 'German Truck', gpid: 71, family: 'GROUND', combatStrength: 0, actionRating: 2, movementPoints: 12, regimentalEquivalents: 0.5, range: 0, steps: 1, pointCost: 2 },
  { id: 'axis-supply', side: 'AXIS', role: 'SUPPLY', formationArchetypes: ALL_FORMATIONS, rawName: 'Axis Supply Dump', gpid: 359, family: 'RESOURCE', combatStrength: null, actionRating: null, movementPoints: null, regimentalEquivalents: null, range: null, steps: 0, pointCost: 2 },
]);

export const findReviewedOobArchetype = (
  side: OobSide,
  role: OobUnitRole,
  formationArchetype?: OobFormationArchetype,
): ReviewedOobArchetype => {
  const result = REVIEWED_OOB_ARCHETYPES.find((candidate) => candidate.side === side
    && candidate.role === role
    && (formationArchetype === undefined || candidate.formationArchetypes.includes(formationArchetype)));
  if (!result) throw new Error(`Missing reviewed OOB archetype for ${side}/${role}/${formationArchetype ?? 'independent'}.`);
  return result;
};
