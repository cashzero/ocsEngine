import type {
  GeneratedOob,
  OobFormationArchetype,
  OobSide,
  OobUnitRole,
} from '../generation/index.js';

export interface GeneratedOobUnitPreview {
  readonly id: string;
  readonly name: string;
  readonly role: OobUnitRole;
  readonly combatStrength: number | null;
  readonly actionRating: number | null;
  readonly movementPoints: number | null;
  readonly range: number | null;
}

export interface GeneratedOobFormationPreview {
  readonly id: string;
  readonly name: string;
  readonly archetype: OobFormationArchetype;
  readonly units: readonly GeneratedOobUnitPreview[];
}

export interface GeneratedOobSidePreview {
  readonly side: OobSide;
  readonly formations: readonly GeneratedOobFormationPreview[];
  readonly independentUnits: readonly GeneratedOobUnitPreview[];
}

export interface GeneratedOobPreview {
  readonly sides: readonly GeneratedOobSidePreview[];
}

export const buildGeneratedOobPreview = (generated: GeneratedOob): GeneratedOobPreview => {
  const definitions = new Map(generated.pieceDefinitionCatalog.definitions.map((definition) => [definition.id, definition]));
  const previewUnit = (unit: GeneratedOob['sides'][number]['independentUnits'][number]): GeneratedOobUnitPreview => {
    const definition = definitions.get(unit.definitionId);
    const step = definition?.faces[0]?.steps.at(-1);
    return {
      id: unit.id,
      name: definition?.name ?? unit.id,
      role: unit.role,
      combatStrength: step?.combatStrength ?? null,
      actionRating: step?.actionRating ?? null,
      movementPoints: step?.movementPointTicks === null || step?.movementPointTicks === undefined
        ? null : step.movementPointTicks / 4,
      range: step?.range ?? null,
    };
  };
  return {
    sides: generated.sides.map((side) => ({
      side: side.side,
      formations: side.formations.map((formation) => ({
        id: formation.id,
        name: formation.name,
        archetype: formation.archetype,
        units: formation.units.map(previewUnit),
      })),
      independentUnits: side.independentUnits.map(previewUnit),
    })),
  };
};
