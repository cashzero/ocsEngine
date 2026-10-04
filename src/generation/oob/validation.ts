import type { ValidationIssue } from '../../core/index.js';
import { validatePieceDefinitionCatalog } from '../../domain/piece/index.js';
import { isSingleUnitDivision } from './model.js';
import type {
  GeneratedOob,
  GeneratedOobMetrics,
  GeneratedOobValidation,
  OobSide,
  OobUnitRole,
} from './model.js';

const SIDES: readonly OobSide[] = ['ALLIED', 'AXIS'];
const ROLES: readonly OobUnitRole[] = [
  'HQ', 'COMBAT', 'ARTILLERY', 'RECONNAISSANCE',
  'ENGINEER', 'TRANSPORT', 'SUPPLY', 'AIRCRAFT', 'AIR_BASE',
];

const issue = (code: string, message: string, path: readonly (string | number)[] = []): ValidationIssue => ({
  code, message, path, severity: 'ERROR',
});

const emptyRoleCounts = (): Record<OobUnitRole, number> => ({
  HQ: 0, COMBAT: 0, ARTILLERY: 0, RECONNAISSANCE: 0,
  ENGINEER: 0, TRANSPORT: 0, SUPPLY: 0, AIRCRAFT: 0, AIR_BASE: 0,
});

export const measureGeneratedOob = (
  generated: Pick<GeneratedOob, 'sides'>,
): GeneratedOobMetrics => {
  const unitsBySide: Record<OobSide, number> = { ALLIED: 0, AXIS: 0 };
  const pointsBySide: Record<OobSide, number> = { ALLIED: 0, AXIS: 0 };
  const rolesBySide: Record<OobSide, Record<OobUnitRole, number>> = {
    ALLIED: emptyRoleCounts(), AXIS: emptyRoleCounts(),
  };
  let formationCount = 0;
  for (const side of generated.sides) {
    formationCount += side.formations.length;
    const units = [...side.formations.flatMap(({ units }) => units), ...side.independentUnits];
    unitsBySide[side.side] += units.length;
    pointsBySide[side.side] += units.reduce((sum, unit) => sum + unit.pointCost, 0);
    for (const unit of units) rolesBySide[side.side][unit.role] += 1;
  }
  const lowest = Math.min(pointsBySide.ALLIED, pointsBySide.AXIS);
  const highest = Math.max(pointsBySide.ALLIED, pointsBySide.AXIS);
  return {
    unitCount: unitsBySide.ALLIED + unitsBySide.AXIS,
    formationCount, unitsBySide, pointsBySide,
    balanceRatio: highest === 0 ? 1 : lowest / highest,
    rolesBySide,
  };
};

export const validateGeneratedOob = (
  generated: Omit<GeneratedOob, 'metrics'> | GeneratedOob,
): GeneratedOobValidation => {
  const issues: ValidationIssue[] = [...validatePieceDefinitionCatalog(generated.pieceDefinitionCatalog)];
  const metrics = measureGeneratedOob(generated);
  if (generated.sides.length !== 2 || SIDES.some((side) => !generated.sides.some((entry) => entry.side === side))) {
    issues.push(issue('MISSING_OOB_SIDE', 'Generated OOB must contain exactly one Allied and one Axis side.', ['sides']));
  }
  const allUnits = generated.sides.flatMap((side) => [
    ...side.formations.flatMap(({ units }) => units), ...side.independentUnits,
  ]);
  const duplicateIds = (values: readonly string[]) => values.filter((value, index) => values.indexOf(value) !== index);
  if (duplicateIds(allUnits.map(({ id }) => id)).length > 0) {
    issues.push(issue('DUPLICATE_GENERATED_UNIT_ID', 'Generated unit IDs must be unique.', ['sides']));
  }
  if (duplicateIds(allUnits.map(({ definitionId }) => definitionId)).length > 0) {
    issues.push(issue('DUPLICATE_GENERATED_DEFINITION_REFERENCE', 'Every generated unit requires its own Piece Definition.', ['pieceDefinitionCatalog']));
  }
  // Breakdown Definitions (20.0) have no starting unit: they are only created in play by the divisions that name them.
  const breakdownIds = new Set(generated.pieceDefinitionCatalog.definitions.flatMap(({ capabilities }) => capabilities
    .filter(({ id }) => id === 'BREAKDOWN').flatMap(({ parameters }) => parameters
      .flatMap((parameter) => parameter.key === 'definitionId' && parameter.kind === 'TEXT' ? [parameter.value] : []))));
  // The Air Base and Air Strip templates (15.2, 15.3) likewise have no starting unit: engineers make Air Bases from them in play.
  const templateIds = new Set(generated.pieceDefinitionCatalog.definitions.filter(({ family, capabilities }) => family === 'REPLACEMENT' || capabilities.some(({ id }) => id === 'AIR_FACILITY_TEMPLATE')).map(({ id }) => id));
  const definitionIds = new Set(generated.pieceDefinitionCatalog.definitions.map(({ id }) => id).filter((id) => !breakdownIds.has(id) && !templateIds.has(id)));
  if (allUnits.some(({ definitionId }) => !definitionIds.has(definitionId))
    || definitionIds.size !== allUnits.length
    || [...breakdownIds].some((id) => !generated.pieceDefinitionCatalog.definitions.some((definition) => definition.id === id))) {
    issues.push(issue('OOB_CATALOG_UNIT_MISMATCH', 'Generated units and Piece Definitions must form an exact one-to-one set, plus the Breakdown Definitions the divisions name.'));
  }
  for (const [sideIndex, side] of generated.sides.entries()) {
    if (side.formations.length !== generated.options.divisionsPerSide) {
      issues.push(issue('FORMATION_COUNT_MISMATCH', 'Each side must contain the requested division count.', ['sides', sideIndex, 'formations']));
    }
    for (const [formationIndex, formation] of side.formations.entries()) {
      const basePath = ['sides', sideIndex, 'formations', formationIndex] as const;
      // A single-unit division's counter belongs to no formation; the entry only names the division slot.
      const memberOf = isSingleUnitDivision(formation.side, formation.archetype) ? null : formation.id;
      if (formation.side !== side.side || formation.units.some((unit) => unit.side !== side.side
        || unit.formationId !== memberOf)) {
        issues.push(issue('FORMATION_OWNERSHIP_MISMATCH', 'Formation units must belong to their containing side and formation.', basePath));
      }
      const count = (wanted: OobUnitRole) => formation.units.filter(({ role }) => role === wanted).length;
      if (isSingleUnitDivision(formation.side, formation.archetype)) {
        // Infantry and airborne divisions are one XX counter.
        if (formation.units.length !== 1 || count('COMBAT') !== 1) {
          issues.push(issue('FORMATION_COMBAT_INVARIANT', 'A single-unit division is exactly one combat unit.', [...basePath, 'units']));
        }
        continue;
      }
      // HQs are independent of every formation (3.2f): a formation never contains one.
      if (count('HQ') !== 0) {
        issues.push(issue('FORMATION_HQ_INVARIANT', 'A formation never contains an HQ; HQs are independent units.', [...basePath, 'units']));
      }
      if (count('COMBAT') < 2) {
        issues.push(issue('FORMATION_COMBAT_INVARIANT', 'Each multi-unit formation requires at least two combat elements.', [...basePath, 'units']));
      }
      if (count('ARTILLERY') === 0) {
        issues.push(issue('FORMATION_SUPPORT_INVARIANT', 'Each multi-unit formation requires an artillery element.', [...basePath, 'units']));
      }
    }
    if (side.independentUnits.some((unit) => unit.side !== side.side || unit.formationId !== null)) {
      issues.push(issue('INDEPENDENT_UNIT_OWNERSHIP', 'Independent units must belong to the side and have no formation.', ['sides', sideIndex, 'independentUnits']));
    }
    for (const required of ['HQ', 'ARTILLERY', 'ENGINEER', 'TRANSPORT', 'SUPPLY'] as const) {
      if (!side.independentUnits.some(({ role }) => role === required)) {
        issues.push(issue('MISSING_INDEPENDENT_PACKAGE', `Side ${side.side} requires independent ${required}.`, ['sides', sideIndex, 'independentUnits']));
      }
    }
  }
  if (metrics.balanceRatio < 0.9) {
    issues.push(issue('OOB_FORCE_IMBALANCE', 'Opposing point totals must remain within a 90% balance ratio.', ['metrics', 'balanceRatio']));
  }
  if (allUnits.some(({ pointCost }) => !Number.isSafeInteger(pointCost) || pointCost < 1)) {
    issues.push(issue('INVALID_OOB_POINT_COST', 'Every generated unit requires a positive integer point cost.'));
  }
  if (ROLES.some((role) => !Number.isSafeInteger(metrics.rolesBySide.ALLIED[role]))) {
    issues.push(issue('INVALID_OOB_METRICS', 'Role metrics must be complete.'));
  }
  return { valid: issues.length === 0, issues, metrics };
};
