import {
  duplicateKeys,
  movementPointTicks,
  parseDefinitionId,
  regimentalEquivalentTicks,
  schemaVersion,
  type DefinitionId,
  type SourceReference,
  type ValidationIssue,
} from '../../../core/index.js';
import { parseCapabilityId, parseFaceId } from './ids.js';
import type {
  CapabilityDeclaration,
  CapabilityParameter,
  NormalizationEvidence,
  PieceDefinition,
  PieceDefinitionCatalog,
  PieceFaceDefinition,
  PieceStepProfile,
} from './model.js';

const error = (
  code: string,
  path: readonly (string | number)[],
  message: string,
): ValidationIssue => ({ code, path, severity: 'ERROR', message });

const hasText = (value: string): boolean => value.trim().length > 0;

const validSourceReference = (source: SourceReference): boolean =>
  hasText(source.document) && hasText(source.locator);

const validateDefinitionReference = (
  value: DefinitionId,
  path: readonly (string | number)[],
): readonly ValidationIssue[] => parseDefinitionId(value).ok
  ? []
  : [error('INVALID_DEFINITION_REFERENCE', path, `Invalid Definition ID: ${value}.`)];

const validateRating = (
  step: PieceStepProfile,
  stepPath: readonly (string | number)[],
): readonly ValidationIssue[] => {
  const issues: ValidationIssue[] = [];
  if (!Number.isSafeInteger(step.remainingSteps) || step.remainingSteps <= 0) {
    issues.push(error(
      'INVALID_REMAINING_STEPS',
      [...stepPath, 'remainingSteps'],
      `Remaining steps must be a positive safe integer: ${step.remainingSteps}.`,
    ));
  }
  if (step.combatStrength !== null
    && (!Number.isFinite(step.combatStrength) || step.combatStrength < 0)) {
    issues.push(error(
      'INVALID_PRINTED_RATING',
      [...stepPath, 'combatStrength'],
      `Combat strength must be a non-negative finite number: ${step.combatStrength}.`,
    ));
  }
  if (step.actionRating !== null
    && (!Number.isSafeInteger(step.actionRating) || step.actionRating < 0)) {
    issues.push(error(
      'INVALID_PRINTED_RATING',
      [...stepPath, 'actionRating'],
      `Action Rating must be a non-negative safe integer: ${step.actionRating}.`,
    ));
  }
  if (step.movementPointTicks !== null && !movementPointTicks(step.movementPointTicks).ok) {
    issues.push(error(
      'INVALID_PRINTED_RATING',
      [...stepPath, 'movementPointTicks'],
      `Movement ticks are invalid: ${step.movementPointTicks}.`,
    ));
  }
  if (step.regimentalEquivalentTicks !== null
    && !regimentalEquivalentTicks(step.regimentalEquivalentTicks).ok) {
    issues.push(error(
      'INVALID_PRINTED_RATING',
      [...stepPath, 'regimentalEquivalentTicks'],
      `RE ticks are invalid: ${step.regimentalEquivalentTicks}.`,
    ));
  }
  if (step.range !== null && (!Number.isSafeInteger(step.range) || step.range < 0)) {
    issues.push(error(
      'INVALID_PRINTED_RATING',
      [...stepPath, 'range'],
      `Range must be a non-negative safe integer: ${step.range}.`,
    ));
  }

  for (const duplicate of duplicateKeys(step.ratings, ({ ratingDefinitionId }) =>
    ratingDefinitionId)) {
    issues.push(error(
      'DUPLICATE_PRINTED_RATING',
      [...stepPath, 'ratings'],
      `Duplicate printed Rating Definition ${duplicate}.`,
    ));
  }
  step.ratings.forEach((rating, ratingIndex) => {
    issues.push(...validateDefinitionReference(
      rating.ratingDefinitionId,
      [...stepPath, 'ratings', ratingIndex, 'ratingDefinitionId'],
    ));
    if (typeof rating.value === 'number' && !Number.isFinite(rating.value)) {
      issues.push(error(
        'INVALID_PRINTED_RATING',
        [...stepPath, 'ratings', ratingIndex, 'value'],
        'Numeric printed ratings must be finite.',
      ));
    }
  });
  return issues;
};

const validateFace = (
  face: PieceFaceDefinition,
  faceIndex: number,
): readonly ValidationIssue[] => {
  const path = ['faces', faceIndex] as const;
  const issues: ValidationIssue[] = [];
  if (!parseFaceId(face.id).ok) {
    issues.push(error('INVALID_FACE_ID', [...path, 'id'], `Invalid Face ID: ${face.id}.`));
  }
  if (!hasText(face.name)) {
    issues.push(error('EMPTY_FACE_NAME', [...path, 'name'], 'Face name must not be empty.'));
  }
  if (face.mobilityClassDefinitionId !== null) {
    issues.push(...validateDefinitionReference(
      face.mobilityClassDefinitionId,
      [...path, 'mobilityClassDefinitionId'],
    ));
  }
  if (face.steps.length === 0) {
    issues.push(error(
      'EMPTY_STEP_PROFILE',
      [...path, 'steps'],
      `Face ${face.id} must define at least one step profile.`,
    ));
  }
  for (const duplicate of duplicateKeys(face.steps, ({ remainingSteps }) =>
    String(remainingSteps))) {
    issues.push(error(
      'DUPLICATE_STEP_PROFILE',
      [...path, 'steps'],
      `Face ${face.id} repeats remaining-step profile ${duplicate}.`,
    ));
  }
  const validSteps = face.steps
    .map(({ remainingSteps }) => remainingSteps)
    .filter((remainingSteps) => Number.isSafeInteger(remainingSteps) && remainingSteps > 0)
    .sort((left, right) => left - right);
  if (validSteps.length > 0
    && validSteps.some((remainingSteps, index) => remainingSteps !== index + 1)) {
    issues.push(error(
      'NON_CONTIGUOUS_STEP_PROFILE',
      [...path, 'steps'],
      `Face ${face.id} step profiles must cover every value from 1 through maximum steps.`,
    ));
  }
  face.steps.forEach((step, stepIndex) => {
    issues.push(...validateRating(step, [...path, 'steps', stepIndex]));
  });
  return issues;
};

const validateCapabilityParameter = (
  parameter: CapabilityParameter,
  path: readonly (string | number)[],
): readonly ValidationIssue[] => {
  const issues: ValidationIssue[] = [];
  if (!hasText(parameter.key)) {
    issues.push(error(
      'EMPTY_CAPABILITY_PARAMETER_KEY',
      [...path, 'key'],
      'Capability parameter key must not be empty.',
    ));
  }
  switch (parameter.kind) {
    case 'FLAG':
      break;
    case 'INTEGER':
      if (!Number.isSafeInteger(parameter.value)) {
        issues.push(error(
          'INVALID_CAPABILITY_PARAMETER',
          [...path, 'value'],
          `INTEGER capability value must be a safe integer: ${parameter.value}.`,
        ));
      }
      break;
    case 'TEXT':
      if (!hasText(parameter.value)) {
        issues.push(error(
          'INVALID_CAPABILITY_PARAMETER',
          [...path, 'value'],
          'TEXT capability value must not be empty.',
        ));
      }
      break;
    case 'DEFINITION_ID':
      issues.push(...validateDefinitionReference(parameter.value, [...path, 'value']));
      break;
    case 'EXACT_QUANTITY':
      if (!Number.isSafeInteger(parameter.value) || parameter.value < 0) {
        issues.push(error(
          'INVALID_CAPABILITY_PARAMETER',
          [...path, 'value'],
          `EXACT_QUANTITY value must be a non-negative safe integer: ${parameter.value}.`,
        ));
      }
      issues.push(...validateDefinitionReference(
        parameter.unitDefinitionId,
        [...path, 'unitDefinitionId'],
      ));
      break;
  }
  return issues;
};

const validateCapability = (
  capability: CapabilityDeclaration,
  capabilityIndex: number,
): readonly ValidationIssue[] => {
  const path = ['capabilities', capabilityIndex] as const;
  const issues: ValidationIssue[] = [];
  if (!parseCapabilityId(capability.id).ok) {
    issues.push(error(
      'INVALID_CAPABILITY_ID',
      [...path, 'id'],
      `Invalid Capability ID: ${capability.id}.`,
    ));
  }
  for (const duplicate of duplicateKeys(capability.parameters, ({ key }) => key)) {
    issues.push(error(
      'DUPLICATE_CAPABILITY_PARAMETER',
      [...path, 'parameters'],
      `Capability ${capability.id} repeats parameter ${duplicate}.`,
    ));
  }
  capability.parameters.forEach((parameter, parameterIndex) => {
    issues.push(...validateCapabilityParameter(
      parameter,
      [...path, 'parameters', parameterIndex],
    ));
  });
  return issues;
};

const validateEvidence = (
  evidence: NormalizationEvidence,
  evidenceIndex: number,
): readonly ValidationIssue[] => {
  const path = ['source', 'records', evidenceIndex] as const;
  const issues: ValidationIssue[] = [];
  if (!hasText(evidence.field)) {
    issues.push(error(
      'EMPTY_SOURCE_FIELD',
      [...path, 'field'],
      'Normalization evidence field must not be empty.',
    ));
  }
  if (!validSourceReference(evidence.source)) {
    issues.push(error(
      'INVALID_PIECE_SOURCE_REFERENCE',
      [...path, 'source'],
      'Evidence source requires non-empty document and locator values.',
    ));
  }
  return issues;
};

const validateFamilyProfile = (
  definition: PieceDefinition,
): readonly ValidationIssue[] => {
  const issues: ValidationIssue[] = [];
  const profileExpectations = [
    ['resource', definition.family === 'RESOURCE', definition.resource],
    ['facility', definition.family === 'FACILITY', definition.facility],
    ['marker', definition.family === 'MARKER', definition.marker],
  ] as const;
  for (const [field, expected, profile] of profileExpectations) {
    if (expected !== (profile !== null)) {
      issues.push(error(
        'PIECE_FAMILY_PROFILE_MISMATCH',
        [field],
        `Piece family ${definition.family} has an inconsistent ${field} profile.`,
      ));
    }
  }
  if (definition.family === 'DEFERRED') {
    if (definition.deferredClassification === null
      || !hasText(definition.deferredClassification)) {
      issues.push(error(
        'MISSING_DEFERRED_CLASSIFICATION',
        ['deferredClassification'],
        'DEFERRED Pieces require a non-empty raw classification.',
      ));
    }
  } else if (definition.deferredClassification !== null) {
    issues.push(error(
      'PIECE_FAMILY_PROFILE_MISMATCH',
      ['deferredClassification'],
      `Piece family ${definition.family} cannot carry a deferred classification.`,
    ));
  }

  if (definition.resource !== null) {
    issues.push(...validateDefinitionReference(
      definition.resource.resourceDefinitionId,
      ['resource', 'resourceDefinitionId'],
    ));
    issues.push(...validateDefinitionReference(
      definition.resource.unitDefinitionId,
      ['resource', 'unitDefinitionId'],
    ));
    for (const [field, value] of [
      ['printedQuantity', definition.resource.printedQuantity],
      ['capacity', definition.resource.capacity],
    ] as const) {
      if (!Number.isSafeInteger(value) || value < 0) {
        issues.push(error(
          'INVALID_RESOURCE_QUANTITY',
          ['resource', field],
          `${field} must be a non-negative safe integer: ${value}.`,
        ));
      }
    }
    if (definition.resource.printedQuantity > definition.resource.capacity) {
      issues.push(error(
        'RESOURCE_QUANTITY_EXCEEDS_CAPACITY',
        ['resource', 'printedQuantity'],
        'Printed resource quantity cannot exceed capacity.',
      ));
    }
  }
  if (definition.facility !== null) {
    issues.push(...validateDefinitionReference(
      definition.facility.facilityTypeDefinitionId,
      ['facility', 'facilityTypeDefinitionId'],
    ));
  }
  if (definition.marker !== null) {
    issues.push(...validateDefinitionReference(
      definition.marker.markerTypeDefinitionId,
      ['marker', 'markerTypeDefinitionId'],
    ));
  }
  return issues;
};

export const validatePieceDefinition = (
  definition: PieceDefinition,
): readonly ValidationIssue[] => {
  const issues: ValidationIssue[] = [];
  issues.push(...validateDefinitionReference(definition.id, ['id']));
  issues.push(...validateDefinitionReference(
    definition.categoryDefinitionId,
    ['categoryDefinitionId'],
  ));
  if (!hasText(definition.name)) {
    issues.push(error('EMPTY_PIECE_NAME', ['name'], 'Piece name must not be empty.'));
  }

  const ownershipReferences = [
    ['sideDefinitionId', definition.ownership.sideDefinitionId],
    ['factionDefinitionId', definition.ownership.factionDefinitionId],
    ['nationalityDefinitionId', definition.ownership.nationalityDefinitionId],
    ['formationDefinitionId', definition.ownership.formationDefinitionId],
    ['groupDefinitionId', definition.ownership.groupDefinitionId],
  ] as const;
  for (const [field, value] of ownershipReferences) {
    if (value !== null) {
      issues.push(...validateDefinitionReference(value, ['ownership', field]));
    }
  }
  if (['GROUND', 'AIR', 'NAVAL'].includes(definition.family)
    && definition.faces.length === 0) {
    issues.push(error(
      'MISSING_PIECE_FACE',
      ['faces'],
      `Piece family ${definition.family} requires at least one printed face.`,
    ));
  }
  for (const duplicate of duplicateKeys(definition.faces, ({ id }) => id)) {
    issues.push(error('DUPLICATE_FACE_ID', ['faces'], `Duplicate Face ID: ${duplicate}.`));
  }
  definition.faces.forEach((face, faceIndex) => {
    issues.push(...validateFace(face, faceIndex));
  });

  for (const duplicate of duplicateKeys(definition.capabilities, ({ id }) => id)) {
    issues.push(error(
      'DUPLICATE_CAPABILITY_ID',
      ['capabilities'],
      `Duplicate Capability ID: ${duplicate}.`,
    ));
  }
  definition.capabilities.forEach((capability, capabilityIndex) => {
    issues.push(...validateCapability(capability, capabilityIndex));
  });

  issues.push(...validateFamilyProfile(definition));
  if (definition.source.records.length === 0) {
    issues.push(error(
      'MISSING_PIECE_SOURCE',
      ['source', 'records'],
      'Piece Definition requires at least one source normalization record.',
    ));
  }
  definition.source.records.forEach((evidence, evidenceIndex) => {
    issues.push(...validateEvidence(evidence, evidenceIndex));
  });
  return issues;
};

export const validatePieceDefinitionCatalog = (
  catalog: PieceDefinitionCatalog,
): readonly ValidationIssue[] => {
  const issues: ValidationIssue[] = [];
  issues.push(...validateDefinitionReference(catalog.id, ['id']));
  if (!schemaVersion(catalog.schemaVersion).ok) {
    issues.push(error(
      'INVALID_CATALOG_SCHEMA_VERSION',
      ['schemaVersion'],
      'Piece catalog SchemaVersion must be a positive safe integer.',
    ));
  }
  if (catalog.definitions.length === 0) {
    issues.push(error(
      'EMPTY_PIECE_CATALOG',
      ['definitions'],
      'Piece Definition catalog must contain at least one definition.',
    ));
  }
  for (const duplicate of duplicateKeys(catalog.definitions, ({ id }) => id)) {
    issues.push(error(
      'DUPLICATE_PIECE_DEFINITION_ID',
      ['definitions'],
      `Duplicate Piece Definition ID: ${duplicate}.`,
    ));
  }
  catalog.definitions.forEach((definition, definitionIndex) => {
    for (const issue of validatePieceDefinition(definition)) {
      issues.push({ ...issue, path: ['definitions', definitionIndex, ...issue.path] });
    }
  });
  if (catalog.provenance.length === 0) {
    issues.push(error(
      'MISSING_CATALOG_PROVENANCE',
      ['provenance'],
      'Piece catalog requires at least one provenance reference.',
    ));
  }
  catalog.provenance.forEach((source, index) => {
    if (!validSourceReference(source)) {
      issues.push(error(
        'INVALID_CATALOG_PROVENANCE',
        ['provenance', index],
        'Catalog provenance requires non-empty document and locator values.',
      ));
    }
  });
  return issues;
};
