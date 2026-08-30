import { describe, expect, it } from 'vitest';
import {
  HEX_DIRECTIONS,
  canonicalizeHexside,
  comparePieceLocations,
  directedHexside,
  formatHexId,
  hex,
  hexRange,
  parseDefinitionId,
  parseHexsideId,
  parseMapBoxId,
  parseMapNodeId,
  parseMapRegionId,
  parseMapTrackId,
  parsePieceId,
  parsePiecePoolId,
  reciprocalHexside,
  stableSort,
  validatePieceLocation,
  type HexId,
  type HexsideFeatureCollection,
  type MapTrackId,
  type PieceLocation,
  type Result,
} from '../../src/index.js';

const must = <T, E>(result: Result<T, E>): T => {
  if (!result.ok) throw new Error('Expected a successful test fixture result.');
  return result.value;
};

describe('canonical Hexside identity', () => {
  it('normalizes every local directed edge and its reciprocal to one ID', () => {
    for (const coordinate of hexRange(hex(0, 0), 3)) {
      for (const direction of HEX_DIRECTIONS) {
        const reference = directedHexside(coordinate, direction);
        const reciprocal = must(reciprocalHexside(reference));
        const canonical = must(canonicalizeHexside(reference));

        expect(must(canonicalizeHexside(reciprocal))).toEqual(canonical);
        expect(must(reciprocalHexside(reciprocal))).toEqual(reference);
        expect(must(parseHexsideId(canonical.id))).toEqual(canonical);
      }
    }
  });

  it('rejects malformed, non-adjacent, and reversed canonical IDs', () => {
    const canonical = must(canonicalizeHexside(directedHexside(hex(0, 0), 'E')));
    expect(parseHexsideId('0,0')).toMatchObject({
      ok: false,
      error: { reason: 'MALFORMED' },
    });
    expect(parseHexsideId('0,0|2,0')).toMatchObject({
      ok: false,
      error: { reason: 'HEXES_NOT_ADJACENT' },
    });
    expect(parseHexsideId(`${canonical.secondHexId}|${canonical.firstHexId}`)).toMatchObject({
      ok: false,
      error: { reason: 'NOT_CANONICAL' },
    });
  });

  it('stores rule-neutral immutable feature references', () => {
    const edge = must(canonicalizeHexside(directedHexside(hex(2, -1), 'SE')));
    const featureDefinitionId = must(parseDefinitionId('terrain:major-river'));
    const features: HexsideFeatureCollection = {
      hexsideId: edge.id,
      featureDefinitionIds: Object.freeze([featureDefinitionId]),
    };

    expect(features).toEqual({
      hexsideId: edge.id,
      featureDefinitionIds: ['terrain:major-river'],
    });
  });
});

describe('map place identities', () => {
  it('keeps node, region, track, box, and pool identities distinct and exact', () => {
    expect(parseMapNodeId('node:odessa')).toMatchObject({ ok: true });
    expect(parseMapRegionId('region:north')).toMatchObject({ ok: true });
    expect(parseMapTrackId('track:turn')).toMatchObject({ ok: true });
    expect(parseMapBoxId('box:reinforcements')).toMatchObject({ ok: true });
    expect(parsePiecePoolId('pool:available')).toMatchObject({ ok: true });
    expect(parseMapBoxId(' box:reinforcements')).toMatchObject({
      ok: false,
      error: { reason: 'SURROUNDING_WHITESPACE' },
    });
  });
});

describe('PieceLocation', () => {
  const boxId = must(parseMapBoxId('box:reinforcements'));
  const holdingId = must(parseMapBoxId('box:holding-east'));
  const trackId = must(parseMapTrackId('track:turn'));
  const poolId = must(parsePiecePoolId('pool:available'));
  const containerId = must(parsePieceId('piece:truck-1'));

  const locations: readonly PieceLocation[] = [
    { kind: 'ELIMINATED' },
    { kind: 'TURN_TRACK', trackId, position: 10 },
    { kind: 'POOL', poolId },
    { kind: 'ON_MAP', hexId: formatHexId(hex(-2, 3)) },
    { kind: 'CONTAINER', containerId },
    { kind: 'HOLDING_AREA', boxId: holdingId },
    { kind: 'OFF_MAP_BOX', boxId },
    { kind: 'TURN_TRACK', trackId, position: 2 },
  ];

  it('accepts every explicit location variant', () => {
    for (const location of locations) {
      expect(validatePieceLocation(location)).toEqual([]);
    }
  });

  it('orders tags, axial coordinates, IDs, and track positions deterministically', () => {
    const sorted = stableSort(locations, comparePieceLocations);
    expect(sorted.map((location) => location.kind)).toEqual([
      'ON_MAP',
      'OFF_MAP_BOX',
      'HOLDING_AREA',
      'TURN_TRACK',
      'TURN_TRACK',
      'POOL',
      'CONTAINER',
      'ELIMINATED',
    ]);
    expect(sorted.filter((location) => location.kind === 'TURN_TRACK'))
      .toEqual([
        { kind: 'TURN_TRACK', trackId, position: 2 },
        { kind: 'TURN_TRACK', trackId, position: 10 },
      ]);
    expect(locations[0]).toEqual({ kind: 'ELIMINATED' });
  });

  it('reports invalid references, positions, and direct self-containment', () => {
    const malformedTrack: PieceLocation = {
      kind: 'TURN_TRACK',
      trackId: ' bad-track' as MapTrackId,
      position: 1.5,
    };
    const malformedHex: PieceLocation = { kind: 'ON_MAP', hexId: '00,0' as HexId };
    const self = must(parsePieceId('piece:self'));

    expect(validatePieceLocation(malformedTrack).map(({ code }) => code)).toEqual([
      'INVALID_LOCATION_REFERENCE',
      'INVALID_TURN_TRACK_POSITION',
    ]);
    expect(validatePieceLocation(malformedHex)).toMatchObject([
      { code: 'INVALID_LOCATION_REFERENCE', path: ['hexId'] },
    ]);
    expect(validatePieceLocation({ kind: 'CONTAINER', containerId: self }, self)).toMatchObject([
      { code: 'SELF_CONTAINER_LOCATION', path: ['containerId'] },
    ]);
  });
});
