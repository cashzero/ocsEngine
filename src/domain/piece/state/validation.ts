import {
  duplicateKeys,
  parseDefinitionId,
  parsePieceId,
  parsePlayerId,
  revision,
  schemaVersion,
  stableKey,
  type DefinitionId,
  type PieceId,
  type ValidationIssue,
} from '../../../core/index.js';
import {
  pieceLocationKey,
  validatePieceLocation,
} from '../../map/index.js';
import {
  createPieceDefinitionCatalogIndex,
  isGroundUnitDefinition,
  type PieceDefinition,
  type PieceDefinitionCatalog,
  type PieceDefinitionCatalogIndex,
} from '../definition/index.js';
import type {
  PieceRelation,
  PieceRuntimeState,
  PieceState,
  PieceStatusState,
} from './model.js';
import { pieceRelationKey } from './relations.js';

const error = (
  code: string,
  path: readonly (string | number)[],
  message: string,
): ValidationIssue => ({ code, path, severity: 'ERROR', message });

const validateDefinitionReference = (
  value: DefinitionId,
  path: readonly (string | number)[],
): readonly ValidationIssue[] => parseDefinitionId(value).ok
  ? []
  : [error('INVALID_DEFINITION_REFERENCE', path, `Invalid Definition ID: ${value}.`)];

const validateStatus = (
  status: PieceStatusState,
  statusIndex: number,
): readonly ValidationIssue[] => {
  const path = ['statuses', statusIndex] as const;
  const issues = [...validateDefinitionReference(
    status.statusDefinitionId,
    [...path, 'statusDefinitionId'],
  )];
  switch (status.value.kind) {
    case 'FLAG':
      break;
    case 'INTEGER':
      if (!Number.isSafeInteger(status.value.value)) {
        issues.push(error(
          'INVALID_STATUS_VALUE',
          [...path, 'value', 'value'],
          `INTEGER status value must be a safe integer: ${status.value.value}.`,
        ));
      }
      break;
    case 'TEXT':
      if (status.value.value.trim().length === 0) {
        issues.push(error(
          'INVALID_STATUS_VALUE',
          [...path, 'value', 'value'],
          'TEXT status value must not be empty.',
        ));
      }
      break;
    case 'DEFINITION_ID':
      issues.push(...validateDefinitionReference(
        status.value.value,
        [...path, 'value', 'value'],
      ));
      break;
    case 'EXACT_QUANTITY':
      if (!Number.isSafeInteger(status.value.value) || status.value.value < 0) {
        issues.push(error(
          'INVALID_STATUS_VALUE',
          [...path, 'value', 'value'],
          `EXACT_QUANTITY status must be a non-negative safe integer: ${status.value.value}.`,
        ));
      }
      issues.push(...validateDefinitionReference(
        status.value.unitDefinitionId,
        [...path, 'value', 'unitDefinitionId'],
      ));
      break;
  }
  return issues;
};

const validateFaceState = (
  piece: PieceState,
  definition: PieceDefinition,
): readonly ValidationIssue[] => {
  const issues: ValidationIssue[] = [];
  if (definition.faces.length === 0) {
    if (piece.currentFaceId !== null || piece.remainingSteps !== null) {
      issues.push(error(
        'FACE_STATE_NOT_APPLICABLE',
        ['currentFaceId'],
        `Piece Definition ${definition.id} has no printed faces.`,
      ));
    }
    return issues;
  }
  if (piece.currentFaceId === null || piece.remainingSteps === null) {
    issues.push(error(
      'MISSING_FACE_STATE',
      ['currentFaceId'],
      `Piece Definition ${definition.id} requires current face and remaining steps.`,
    ));
    return issues;
  }
  const face = definition.faces.find(({ id }) => id === piece.currentFaceId);
  if (!face) {
    issues.push(error(
      'UNKNOWN_FACE_REFERENCE',
      ['currentFaceId'],
      `Face ${piece.currentFaceId} does not belong to Definition ${definition.id}.`,
    ));
  } else if (!face.steps.some(({ remainingSteps }) => remainingSteps === piece.remainingSteps)) {
    issues.push(error(
      'UNKNOWN_STEP_PROFILE',
      ['remainingSteps'],
      `Face ${face.id} has no remaining-step profile ${piece.remainingSteps}.`,
    ));
  }
  return issues;
};

const validateResourceState = (
  piece: PieceState,
  definition: PieceDefinition,
): readonly ValidationIssue[] => {
  // An Eq replacement counter (13.5) holds a count of Eq; it is not a supply resource and has no capacity.
  if (definition.family === 'REPLACEMENT') {
    return piece.resourceQuantity !== null && Number.isSafeInteger(piece.resourceQuantity) && piece.resourceQuantity >= 0 ? []
      : [error('INVALID_RESOURCE_STATE', ['resourceQuantity'], 'Replacement counter quantity must be a non-negative safe integer.')];
  }
  if (definition.resource === null) {
    return piece.resourceQuantity === null
      ? []
      : [error(
        'RESOURCE_STATE_NOT_APPLICABLE',
        ['resourceQuantity'],
        `Piece Definition ${definition.id} has no resource profile.`,
      )];
  }
  if (piece.resourceQuantity === null
    || !Number.isSafeInteger(piece.resourceQuantity)
    || piece.resourceQuantity < 0) {
    return [error(
      'INVALID_RESOURCE_STATE',
      ['resourceQuantity'],
      'Resource Piece quantity must be a non-negative safe integer.',
    )];
  }
  return piece.resourceQuantity <= definition.resource.capacity
    ? []
    : [error(
      'RESOURCE_STATE_EXCEEDS_CAPACITY',
      ['resourceQuantity'],
      `Resource quantity ${piece.resourceQuantity} exceeds capacity ${definition.resource.capacity}.`,
    )];
};

const validatePiece = (
  piece: PieceState,
  pieceIndex: number,
  catalog: PieceDefinitionCatalogIndex,
): readonly ValidationIssue[] => {
  const path = ['pieces', pieceIndex] as const;
  const issues: ValidationIssue[] = [];
  if (!parsePieceId(piece.id).ok) {
    issues.push(error('INVALID_PIECE_ID', [...path, 'id'], `Invalid Piece ID: ${piece.id}.`));
  }
  if (!parsePlayerId(piece.ownerId).ok) {
    issues.push(error(
      'INVALID_PLAYER_REFERENCE',
      [...path, 'ownerId'],
      `Invalid Player ID: ${piece.ownerId}.`,
    ));
  }
  issues.push(...validatePieceLocation(piece.location, piece.id).map((issue) => ({
    ...issue,
    path: [...path, 'location', ...issue.path],
  })));
  if (!Number.isSafeInteger(piece.stackOrder) || piece.stackOrder < 0) {
    issues.push(error(
      'INVALID_STACK_ORDER',
      [...path, 'stackOrder'],
      `Stack order must be a non-negative safe integer: ${piece.stackOrder}.`,
    ));
  }

  const definition = catalog.get(piece.definitionId);
  if (!parseDefinitionId(piece.definitionId).ok || !definition) {
    issues.push(error(
      'UNKNOWN_PIECE_DEFINITION',
      [...path, 'definitionId'],
      `Piece references absent Definition ${piece.definitionId}.`,
    ));
  } else {
    for (const issue of validateFaceState(piece, definition)) {
      issues.push({ ...issue, path: [...path, ...issue.path] });
    }
    for (const issue of validateResourceState(piece, definition)) {
      issues.push({ ...issue, path: [...path, ...issue.path] });
    }
    if (isGroundUnitDefinition(definition) !== (piece.mode !== null)) {
      issues.push(error(
        'MODE_STATE_FAMILY_MISMATCH',
        [...path, 'mode'],
        `Piece family ${definition.family} has inconsistent OCS mode state.`,
      ));
    }
    if (definition.family === 'REPLACEMENT' && definition.faces.length > 0) {
      if (piece.mode === 'COMBAT') issues.push(error('REPLACEMENT_COMBAT_MODE', [...path, 'mode'], 'Replacements cannot enter Combat Mode (13.5).'));
      if (piece.resourceQuantity !== 1 && !(piece.location.kind === 'ELIMINATED' && piece.resourceQuantity === 0)) issues.push(error('INVALID_REPLACEMENT_QUANTITY', [...path, 'resourceQuantity'], 'Each replacement unit holds one Repl; spent units hold zero and are eliminated.'));
    }
  }

  for (const duplicate of duplicateKeys(piece.statuses, ({ statusDefinitionId }) =>
    statusDefinitionId)) {
    issues.push(error(
      'DUPLICATE_PIECE_STATUS',
      [...path, 'statuses'],
      `Piece ${piece.id} repeats status Definition ${duplicate}.`,
    ));
  }
  piece.statuses.forEach((status, statusIndex) => {
    for (const issue of validateStatus(status, statusIndex)) {
      issues.push({ ...issue, path: [...path, ...issue.path] });
    }
  });
  return issues;
};

interface DirectedEdge {
  readonly from: PieceId;
  readonly to: PieceId;
}

const hasDirectedCycle = (edges: readonly DirectedEdge[]): boolean => {
  const adjacency = new Map<PieceId, PieceId[]>();
  for (const edge of edges) {
    const targets = adjacency.get(edge.from) ?? [];
    targets.push(edge.to);
    adjacency.set(edge.from, targets);
  }
  const visiting = new Set<PieceId>();
  const visited = new Set<PieceId>();

  const visit = (pieceId: PieceId): boolean => {
    if (visiting.has(pieceId)) return true;
    if (visited.has(pieceId)) return false;
    visiting.add(pieceId);
    for (const target of adjacency.get(pieceId) ?? []) {
      if (visit(target)) return true;
    }
    visiting.delete(pieceId);
    visited.add(pieceId);
    return false;
  };

  return [...adjacency.keys()].some(visit);
};

const relationSourceId = (relation: PieceRelation): PieceId => {
  switch (relation.kind) {
    case 'CARGO': return relation.cargoId;
    case 'ATTACHMENT':
    case 'PARENT': return relation.childId;
    case 'GROUP_MEMBERSHIP':
    case 'FORMATION_MEMBERSHIP': return relation.memberId;
  }
};

const validateRelationReferences = (
  relation: PieceRelation,
  relationIndex: number,
  pieceIds: ReadonlySet<PieceId>,
): readonly ValidationIssue[] => {
  const path = ['relations', relationIndex] as const;
  const issues: ValidationIssue[] = [];
  const sourceId = relationSourceId(relation);
  if (!parsePieceId(sourceId).ok || !pieceIds.has(sourceId)) {
    issues.push(error(
      'UNKNOWN_RELATION_PIECE',
      [...path, 'source'],
      `Relation source references absent Piece ${sourceId}.`,
    ));
  }

  if (relation.kind === 'GROUP_MEMBERSHIP') {
    issues.push(...validateDefinitionReference(
      relation.groupDefinitionId,
      [...path, 'groupDefinitionId'],
    ));
    return issues;
  }
  if (relation.kind === 'FORMATION_MEMBERSHIP') {
    issues.push(...validateDefinitionReference(
      relation.formationDefinitionId,
      [...path, 'formationDefinitionId'],
    ));
    return issues;
  }

  const targetId = relation.kind === 'CARGO' ? relation.containerId : relation.parentId;
  if (!parsePieceId(targetId).ok || !pieceIds.has(targetId)) {
    issues.push(error(
      'UNKNOWN_RELATION_PIECE',
      [...path, 'target'],
      `Relation target references absent Piece ${targetId}.`,
    ));
  }
  if (sourceId === targetId) {
    issues.push(error(
      'SELF_PIECE_RELATION',
      path,
      `Piece ${sourceId} cannot relate to itself as ${relation.kind}.`,
    ));
  }
  if (relation.kind === 'CARGO') {
    if (!Number.isSafeInteger(relation.loadQuantity) || relation.loadQuantity <= 0) {
      issues.push(error(
        'INVALID_CARGO_LOAD_QUANTITY',
        [...path, 'loadQuantity'],
        `Cargo load must be a positive safe integer: ${relation.loadQuantity}.`,
      ));
    }
    issues.push(...validateDefinitionReference(
      relation.unitDefinitionId,
      [...path, 'unitDefinitionId'],
    ));
  }
  return issues;
};

const validateCargoConsistency = (
  state: PieceRuntimeState,
  catalog: PieceDefinitionCatalogIndex,
): readonly ValidationIssue[] => {
  const issues: ValidationIssue[] = [];
  const pieceById = new Map(state.pieces.map((piece) => [piece.id, piece]));
  const cargoEntries = state.relations.flatMap((relation, relationIndex) =>
    relation.kind === 'CARGO' ? [{ relation, relationIndex }] : []);

  cargoEntries.forEach(({ relation, relationIndex }) => {
    const cargo = pieceById.get(relation.cargoId);
    if (cargo && (cargo.location.kind !== 'CONTAINER'
      || cargo.location.containerId !== relation.containerId)) {
      issues.push(error(
        'CARGO_LOCATION_MISMATCH',
        ['relations', relationIndex],
        `Cargo ${relation.cargoId} location does not match container ${relation.containerId}.`,
      ));
    }
  });

  state.pieces.forEach((piece, pieceIndex) => {
    if (piece.location.kind !== 'CONTAINER') return;
    const containerId = piece.location.containerId;
    if (!cargoEntries.some(({ relation }) => relation.cargoId === piece.id
      && relation.containerId === containerId)) {
      issues.push(error(
        'MISSING_CARGO_RELATION',
        ['pieces', pieceIndex, 'location'],
        `Contained Piece ${piece.id} has no matching cargo relation.`,
      ));
    }
  });

  const loadGroups = new Map<string, {
    readonly containerId: PieceId;
    readonly unitDefinitionId: DefinitionId;
    total: number;
  }>();
  for (const { relation } of cargoEntries) {
    if (!Number.isSafeInteger(relation.loadQuantity) || relation.loadQuantity <= 0) continue;
    const key = stableKey([relation.containerId, relation.unitDefinitionId]);
    const group = loadGroups.get(key) ?? {
      containerId: relation.containerId,
      unitDefinitionId: relation.unitDefinitionId,
      total: 0,
    };
    group.total += relation.loadQuantity;
    loadGroups.set(key, group);
  }

  for (const group of loadGroups.values()) {
    const container = pieceById.get(group.containerId);
    const definition = container ? catalog.get(container.definitionId) : undefined;
    const capacity = definition?.capabilities
      .find(({ id }) => id === 'TRANSPORT_CAPACITY')
      ?.parameters.find((parameter) => parameter.kind === 'EXACT_QUANTITY'
        && parameter.key === 'capacity'
        && parameter.unitDefinitionId === group.unitDefinitionId);
    if (!capacity || capacity.kind !== 'EXACT_QUANTITY') {
      issues.push(error(
        'MISSING_CONTAINER_CAPACITY',
        ['relations'],
        `Container ${group.containerId} has no matching structural capacity declaration.`,
      ));
    } else if (!Number.isSafeInteger(group.total) || group.total > capacity.value) {
      issues.push(error(
        'CARGO_CAPACITY_EXCEEDED',
        ['relations'],
        `Container ${group.containerId} load ${group.total} exceeds capacity ${capacity.value}.`,
      ));
    }
  }
  return issues;
};

export const validatePieceRuntimeState = (
  definitions: PieceDefinitionCatalog,
  state: PieceRuntimeState,
): readonly ValidationIssue[] => {
  const issues: ValidationIssue[] = [];
  const catalog = createPieceDefinitionCatalogIndex(definitions);
  if (!schemaVersion(state.schemaVersion).ok) {
    issues.push(error(
      'INVALID_PIECE_STATE_SCHEMA_VERSION',
      ['schemaVersion'],
      'Piece runtime SchemaVersion must be a positive safe integer.',
    ));
  }
  if (!revision(state.revision).ok) {
    issues.push(error(
      'INVALID_PIECE_STATE_REVISION',
      ['revision'],
      'Piece runtime Revision must be a non-negative safe integer.',
    ));
  }
  for (const duplicate of duplicateKeys(state.pieces, ({ id }) => id)) {
    issues.push(error('DUPLICATE_PIECE_ID', ['pieces'], `Duplicate Piece ID: ${duplicate}.`));
  }
  state.pieces.forEach((piece, pieceIndex) => {
    issues.push(...validatePiece(piece, pieceIndex, catalog));
  });
  for (const duplicate of duplicateKeys(
    state.pieces.filter(({ location }) => location.kind !== 'ELIMINATED'),
    (piece) => stableKey([pieceLocationKey(piece.location), String(piece.stackOrder)]),
  )) {
    issues.push(error(
      'DUPLICATE_STACK_ORDER',
      ['pieces'],
      `Two Pieces share a location/stack-order key: ${duplicate}.`,
    ));
  }

  for (const duplicate of duplicateKeys(state.relations, pieceRelationKey)) {
    issues.push(error(
      'DUPLICATE_PIECE_RELATION',
      ['relations'],
      `Duplicate semantic Piece relation: ${duplicate}.`,
    ));
  }
  const pieceIds = new Set(state.pieces.map(({ id }) => id));
  state.relations.forEach((relation, relationIndex) => {
    issues.push(...validateRelationReferences(relation, relationIndex, pieceIds));
  });
  issues.push(...validateCargoConsistency(state, catalog));

  const containerEdges: DirectedEdge[] = state.pieces.flatMap((piece) =>
    piece.location.kind === 'CONTAINER'
      ? [{ from: piece.id, to: piece.location.containerId }]
      : []);
  if (hasDirectedCycle(containerEdges)) {
    issues.push(error(
      'CONTAINER_RELATION_CYCLE',
      ['pieces'],
      'Piece container locations contain a directed cycle.',
    ));
  }
  const hierarchyEdges: DirectedEdge[] = state.relations.flatMap((relation) =>
    relation.kind === 'ATTACHMENT' || relation.kind === 'PARENT'
      ? [{ from: relation.childId, to: relation.parentId }]
      : []);
  if (hasDirectedCycle(hierarchyEdges)) {
    issues.push(error(
      'HIERARCHY_RELATION_CYCLE',
      ['relations'],
      'Piece attachment/parent relations contain a directed cycle.',
    ));
  }
  return issues;
};
