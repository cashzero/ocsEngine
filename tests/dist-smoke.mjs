import assert from 'node:assert/strict';
import {
  canonicalizeHexside,
  createAxialBounds,
  createFoundationScenarioFixture,
  directedHexside,
  formatHexId,
  hex,
  parseFaceId,
  pieceLocationKey,
  hashScenarioDefinition,
  parseScenarioJson,
  serializeScenarioDefinition,
} from '../dist/index.js';

assert.equal(formatHexId(hex(2, -1)), '2,-1');
assert.equal(
  canonicalizeHexside(directedHexside(hex(0, 0), 'E')).value.id,
  '0,0|1,0',
);
assert.deepEqual(
  createAxialBounds({ minQ: 0, maxQ: 1, minR: -1, maxR: 1 }),
  { ok: true, value: { minQ: 0, maxQ: 1, minR: -1, maxR: 1 } },
);
assert.deepEqual(parseFaceId('combat'), { ok: true, value: 'combat' });
assert.equal(pieceLocationKey({ kind: 'ELIMINATED' }), '10:ELIMINATED');

const fixture = createFoundationScenarioFixture();
const serialized = serializeScenarioDefinition(fixture);
assert.equal(serialized.ok, true);
assert.equal(parseScenarioJson(serialized.value).ok, true);
const fixtureHash = await hashScenarioDefinition(fixture);
assert.equal(fixtureHash.ok, true);
assert.match(fixtureHash.value, /^sha256:[a-f0-9]{64}$/);
