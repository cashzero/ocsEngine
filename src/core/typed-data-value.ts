import type { DefinitionId } from './identity.js';

export type TypedDataValue =
  | { readonly kind: 'FLAG'; readonly value: boolean }
  | { readonly kind: 'INTEGER'; readonly value: number }
  | { readonly kind: 'TEXT'; readonly value: string }
  | { readonly kind: 'DEFINITION_ID'; readonly value: DefinitionId }
  | {
    readonly kind: 'EXACT_QUANTITY';
    readonly value: number;
    readonly unitDefinitionId: DefinitionId;
  };
