import { parseDefinitionId, type DefinitionId } from '../core/index.js';
import type {
  ClassCombatMultipliers,
  CombatLine,
  CombatMultiplier,
  HexsideCombatEffect,
  TerrainCombatEffect,
} from '../rules/index.js';

/**
 * Terrain Effects on Combat for generated games, transcribed from the Beyond the Rhine TEC image in
 * the BTR VASSAL module 1.27.0 (`images/BTR TEC.jpg`, SHA-256
 * 70ca1a8564a6527db668fd5c347d423ec81384d45a7a7628162286b1b513a770). The generated terrain mapping
 * matches `movement-tec.ts`; see docs/rules/ocs-4.3-charts.md.
 *
 * "[x#]" entries only modify attackers (9.4d). "*" (road only) entries are enforced by 9.1f through
 * the movement rules rather than here.
 */

const id = (value: string): DefinitionId => {
  const parsed = parseDefinitionId(value);
  if (!parsed.ok) throw new Error(`Combat TEC Definition ID ${value} is invalid.`);
  return parsed.value;
};

const x = (numerator: number, denominator = 1): CombatMultiplier => ({ numerator, denominator, attackOnly: false });
const bracket = (numerator: number, denominator = 1): CombatMultiplier => ({ numerator, denominator, attackOnly: true });
/** Column order on the printed chart: Armor, Mech, Other. */
const classes = (armor: CombatMultiplier, mech: CombatMultiplier, other: CombatMultiplier): ClassCombatMultipliers => ({ armor, mech, other });

const terrain = (definitionId: string, line: CombatLine | null, multipliers: ClassCombatMultipliers): TerrainCombatEffect =>
  ({ terrainDefinitionId: id(definitionId), line, multipliers });

export const GENERATED_TERRAIN_COMBAT_EFFECTS: readonly TerrainCombatEffect[] = [
  terrain('terrain:clear', 'OPEN', classes(bracket(2), bracket(2), x(1))), // Open
  terrain('terrain:rough', 'CLOSE', classes(x(1), x(1), x(1))), // Hills
  terrain('terrain:woods', 'CLOSE', classes(x(1), x(1), x(1))), // Woods
  terrain('terrain:marsh', 'VERY_CLOSE', classes(x(1, 2), x(1, 2), x(1))), // Polder or Swamp
  terrain('terrain:mountain', 'EXTREMELY_CLOSE', classes(x(1, 3), bracket(1, 2), x(1))), // Mountain
  terrain('settlement:village', 'CLOSE', classes(x(1), x(1), x(1))), // Village
  terrain('settlement:town', 'VERY_CLOSE', classes(x(1, 2), bracket(1, 2), x(1))), // Minor City
  terrain('settlement:city', 'EXTREMELY_CLOSE', classes(x(1, 3), bracket(1, 2), x(1))), // Major City
];

export const GENERATED_HEXSIDE_COMBAT_EFFECTS: readonly HexsideCombatEffect[] = [
  { featureDefinitionId: id('edge:river'), multipliers: classes(bracket(1, 2), bracket(1, 2), bracket(1, 2)) }, // Minor River (Dry)
  { featureDefinitionId: id('edge:major-river'), multipliers: classes(bracket(1, 4), bracket(1, 3), bracket(1, 2)) }, // Major River
];
