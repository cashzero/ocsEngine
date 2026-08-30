import {
  compareHexIds,
  compareText,
  FOUNDATION_SCHEMA_VERSION,
  revision,
  stableSort,
  type HexId,
  type PlayerId,
  type Revision,
} from '../../core/index.js';
import type { HexControlState, MapFeatureState, MapState } from './model.js';

const nextRevision = (current: Revision): Revision => {
  const next = revision(current + 1);
  if (!next.ok) throw new RangeError('MapState revision cannot exceed the safe integer range.');
  return next.value;
};

export const createEmptyMapState = (initialRevision: Revision): MapState => ({
  schemaVersion: FOUNDATION_SCHEMA_VERSION,
  revision: initialRevision,
  hexControl: [],
  features: [],
});

export const setHexControl = (
  state: MapState,
  hexId: HexId,
  controllerId: PlayerId | null,
): MapState => {
  const replacement: HexControlState = { hexId, controllerId };
  const found = state.hexControl.some((entry) => entry.hexId === hexId);
  const entries = found
    ? state.hexControl.map((entry) => entry.hexId === hexId ? replacement : entry)
    : [...state.hexControl, replacement];
  return {
    ...state,
    revision: nextRevision(state.revision),
    hexControl: stableSort(entries, (left, right) => compareHexIds(left.hexId, right.hexId)),
  };
};

export const upsertMapFeatureState = (
  state: MapState,
  feature: MapFeatureState,
): MapState => {
  const found = state.features.some(({ id }) => id === feature.id);
  const features = found
    ? state.features.map((entry) => entry.id === feature.id ? feature : entry)
    : [...state.features, feature];
  return {
    ...state,
    revision: nextRevision(state.revision),
    features: stableSort(features, (left, right) => compareText(left.id, right.id)),
  };
};
