import { compareText, stableSort, type DefinitionId } from '../../../core/index.js';
import type {
  PieceDefinition,
  PieceDefinitionCatalog,
  PieceFamily,
} from './model.js';

export interface PieceDefinitionCatalogIndex {
  readonly get: (definitionId: DefinitionId) => PieceDefinition | undefined;
  readonly ordered: () => readonly PieceDefinition[];
  readonly byFamily: (family: PieceFamily) => readonly PieceDefinition[];
}

export const createPieceDefinitionCatalogIndex = (
  catalog: PieceDefinitionCatalog,
): PieceDefinitionCatalogIndex => {
  const byId = new Map<DefinitionId, PieceDefinition>();
  for (const definition of catalog.definitions) {
    if (!byId.has(definition.id)) byId.set(definition.id, definition);
  }
  const ordered = Object.freeze(stableSort(
    catalog.definitions,
    (left, right) => compareText(left.id, right.id),
  ));
  const familyCache = new Map<PieceFamily, readonly PieceDefinition[]>();

  return Object.freeze({
    get: (definitionId: DefinitionId) => byId.get(definitionId),
    ordered: () => ordered,
    byFamily: (family: PieceFamily) => {
      const cached = familyCache.get(family);
      if (cached) return cached;
      const matches = Object.freeze(ordered.filter((definition) => definition.family === family));
      familyCache.set(family, matches);
      return matches;
    },
  });
};
