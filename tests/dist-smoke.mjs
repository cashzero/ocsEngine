import assert from 'node:assert/strict';
import {
  canonicalizeHexside,
  createAxialBounds,
  createFoundationScenarioFixture,
  createGameplayEngine,
  createMemoryGameplayPorts,
  createRuleConfigurationFixture,
  createRuleGameStateFixture,
  directedHexside,
  formatHexId,
  hex,
  parseFaceId,
  parseSeatId,
  pieceLocationKey,
  hashScenarioDefinition,
  hashGameState,
  generateRandomMap,
  generateRandomOob,
  prepareNewGame,
  DEFAULT_NEW_GAME_REQUEST,
  sweepGameFlowSeedOrthogonality,
  layoutHexMap,
  parseGameStateJson,
  parseScenarioJson,
  serializeScenarioDefinition,
  serializeGameState,
  ALL_ACTION_KINDS,
  ruleEngine,
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

const ruleFixture = createRuleGameStateFixture();
const ruleSnapshot = serializeGameState(ruleFixture);
assert.equal(ruleSnapshot.ok, true);
assert.equal(parseGameStateJson(ruleSnapshot.value).ok, true);
const ruleHash = await hashGameState(ruleFixture);
assert.equal(ruleHash.ok, true);
assert.match(ruleHash.value, /^sha256:[a-f0-9]{64}$/);
assert.equal(
  ruleEngine.getActionFamilies(ruleFixture, ruleFixture.sequence.actingPlayerId).length,
  ALL_ACTION_KINDS.length,
);

const gameplayPorts = createMemoryGameplayPorts([ruleFixture.scenario]);
const gameplay = createGameplayEngine(gameplayPorts);
const seatOne = parseSeatId('seat:dist-one').value;
const seatTwo = parseSeatId('seat:dist-two').value;
const gameplaySession = await gameplay.createSession({
  scenario: ruleFixture.scenario,
  configuration: createRuleConfigurationFixture(),
  rulesSeed: 6,
  bindings: [
    { seatId: seatOne, playerId: ruleFixture.scenario.players[0].id, label: 'One' },
    { seatId: seatTwo, playerId: ruleFixture.scenario.players[1].id, label: 'Two' },
  ],
  label: 'dist smoke',
});
assert.equal(gameplaySession.start().ok, true);
assert.equal(gameplaySession.getView(seatOne).projection.stateRevision, 0);
const gameplaySave = gameplaySession.serializeSave();
const loadedGameplay = await gameplay.loadSession(gameplaySave);
assert.equal(loadedGameplay.getMetadata().stateHash, gameplaySession.getMetadata().stateHash);
assert.equal(layoutHexMap(ruleFixture.scenario).cells.length, 25);
const generatedMap = generateRandomMap({ width: 18, height: 12, seed: 1943, style: 'WESTERN_EUROPE' });
assert.equal(generatedMap.ok, true);
assert.equal(generatedMap.value.metrics.connectedRoadComponents, 1);
const generatedOob = generateRandomOob({ seed: 1944, scale: 'STANDARD', divisionsPerSide: 3, armoredDivisionsPerSide: 1 });
assert.equal(generatedOob.ok, true);
// OOB 0.4.0: balance is the ratio of combat values, kept at 90% or better.
assert.ok(generatedOob.value.metrics.balanceRatio >= 0.9);
assert.equal(generatedOob.value.sides.length, 2);
const generatedGame = prepareNewGame(DEFAULT_NEW_GAME_REQUEST);
assert.equal(generatedGame.ok, true);
// Every OOB unit, objective garrisons, and trace-dependent emergency stocks.
assert.equal(generatedGame.value.scenario.initialPieceState.pieces.length,
  generatedGame.value.generatedOob.metrics.unitCount + generatedGame.value.deployment.objectives.length
  + generatedGame.value.scenario.initialPieceState.pieces.filter(({ id }) => String(id).includes('-stock-')).length);
assert.equal(sweepGameFlowSeedOrthogonality(DEFAULT_NEW_GAME_REQUEST).passed, true);
