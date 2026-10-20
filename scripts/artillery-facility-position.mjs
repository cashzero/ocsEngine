import { mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import {
  DEFAULT_NEW_GAME_REQUEST, createGameplayEngine, createMemoryGameplayPorts, createNewGameOrchestrator,
  createRulesRng, hashGameState, hashScenarioDefinition, parseGameStateJson, serializeGameState,
} from '../dist/index.js';
import { usageOf } from '../dist/rules/pieces.js';

const directory = process.argv[2] ?? 'artifacts/artillery-facility/positions';
await mkdir(directory, { recursive: true });
const request = {
  ...DEFAULT_NEW_GAME_REQUEST,
  map: { width: 18, height: 12, style: 'WESTERN_EUROPE', sea: 'FLANK' },
  oob: { scale: 'STANDARD', divisionsPerSide: 3, armoredDivisionsPerSide: 1, air: 'STANDARD' },
  seeds: { map: 5101, oob: 5102, deployment: 5103, rules: 5104 }, turnLimit: 3,
};
const made = await createNewGameOrchestrator(createGameplayEngine(createMemoryGameplayPorts())).create(request);
if (!made.ok) throw new Error(JSON.stringify(made.error));
const envelope = JSON.parse(made.value.session.serializeSave());
const parsed = parseGameStateJson(envelope.currentSnapshot);
if (!parsed.ok) throw new Error(JSON.stringify(parsed.error));
const initial = parsed.value;
const allied = 'player:allied';
const axis = 'player:axis';
const definitions = new Map(initial.scenario.pieceCatalog.definitions.map((definition) => [definition.id, definition]));
const definition = (piece) => definitions.get(piece.definitionId);
const guns = initial.pieceState.pieces.filter((piece) => piece.ownerId === allied && definition(piece)?.counter?.kind === 'ARTILLERY');
const dump = initial.pieceState.pieces.find((piece) => piece.ownerId === allied && definition(piece)?.family === 'RESOURCE');
const base = initial.pieceState.pieces.find((piece) => piece.ownerId === axis && definition(piece)?.facility?.facilityTypeDefinitionId === 'facility:air-base');
const planes = initial.pieceState.pieces.filter((piece) => piece.ownerId === axis && definition(piece)?.family === 'AIR'
  && piece.location.kind === 'ON_MAP' && piece.location.hexId === base?.location.hexId);
const defender = initial.pieceState.pieces.find((piece) => piece.ownerId === axis && definition(piece)?.counter?.kind === 'COMBAT');
const port = initial.mapState.features.find((feature) => feature.definitionId === 'facility:port');
if (!guns.length || !dump || !base || planes.length < 2 || !defender || !port) throw new Error('Missing generated fixture pieces.');
const target = port.location.hexId;
const [q, r] = target.split(',').map(Number);
const origin = `${q},${r + 1}`;
const alternateTarget = `${q},${r + 2}`;
const printed = (hex) => { const [x, y] = hex.split(',').map(Number); return `${String(x + Math.floor(y / 2) + 1).padStart(2, '0')}${String(y + 1).padStart(2, '0')}`; };
const moved = new Set([...guns, dump, base, ...planes, defender].map(({ id }) => id));
const facts = {
  request, target, targetLabel: printed(target), origin, originLabel: printed(origin), alternateTarget, alternateTargetLabel: printed(alternateTarget),
  guns: guns.map(({ id }) => id), dump: dump.id, base: base.id, defender: defender.id, planes: planes.map(({ id }) => id),
};

for (const kind of ['port-only', 'base-only', 'mixed', 'movement', 'out-of-range', 'no-supply', 'hex-used', 'unit-used', 'other-gun-ready', 'other-target-ready']) {
  const pieces = initial.pieceState.pieces.map((piece, index) => {
    const isGun = guns.some(({ id }) => id === piece.id);
    let hex = isGun || piece.id === dump.id ? origin
      : piece.id === base.id || planes.some(({ id }) => id === piece.id) ? (kind === 'port-only' ? '13,8' : target)
        : piece.id === defender.id ? (kind === 'other-target-ready' ? alternateTarget : kind !== 'port-only' && kind !== 'base-only' ? target : '13,8') : null;
    if (!moved.has(piece.id) && piece.location.kind === 'ON_MAP' && [target, origin, ...(kind === 'other-target-ready' ? [alternateTarget] : [])].includes(piece.location.hexId)) hex = piece.ownerId === allied ? '1,7' : '13,8';
    return {
      ...piece, ...(hex ? { location: { kind: 'ON_MAP', hexId: hex }, stackOrder: index + 1 } : {}),
      ...(isGun ? { mode: 'COMBAT', currentFaceId: 'combat' } : {}),
      ...(piece.id === dump.id ? { resourceQuantity: 40 } : {}),
      ...(piece.id === base.id ? { statuses: [{ statusDefinitionId: 'status:air-base-level', value: { kind: 'INTEGER', value: 3 } }] } : {}),
      ...(piece.id === planes[1].id ? { statuses: [{ statusDefinitionId: 'status:air-inactive', value: { kind: 'FLAG', value: true } }] } : {}),
    };
  });
  let state = {
    ...initial, rng: createRulesRng(48),
    sequence: { ...initial.sequence, gameTurn: 1, playerTurnIndex: 0, firstPlayerId: allied, phasingPlayerId: allied, actingPlayerId: allied, phase: 'COMBAT', segment: 'BARRAGE' },
    pieceState: { ...initial.pieceState, pieces },
    mapState: { ...initial.mapState, features: initial.mapState.features.flatMap((feature) => feature.id !== port.id ? [feature]
      : kind === 'base-only' ? [] : [{ ...feature, controllerId: axis, damage: 0 }]) },
  };
  if (kind === 'movement') state = { ...state, sequence: { ...state.sequence, phase: 'MOVEMENT', segment: 'MOVEMENT' } };
  if (kind === 'out-of-range') state = { ...state, pieceState: { ...state.pieceState, pieces: state.pieceState.pieces.map((piece) =>
    guns.some(({ id }) => id === piece.id) ? { ...piece, location: { kind: 'ON_MAP', hexId: '3,10' } } : piece) } };
  if (kind === 'no-supply') state = { ...state, pieceState: { ...state.pieceState, pieces: state.pieceState.pieces.map((piece) =>
    piece.ownerId === allied && definition(piece)?.family === 'RESOURCE' ? { ...piece, resourceQuantity: 0 } : piece) } };
  if (kind === 'hex-used') state = { ...state, ledger: { ...state.ledger, barragedHexIds: [target] } };
  if (kind === 'unit-used') state = { ...state, usage: guns.map((gun) => ({ ...usageOf(state, state.pieceState.pieces.find(({ id }) => id === gun.id)), barraged: true })) };
  if (kind === 'other-gun-ready') state = { ...state, usage: [{ ...usageOf(state, state.pieceState.pieces.find(({ id }) => id === guns[0].id)), barraged: true }] };
  if (kind === 'other-target-ready') state = { ...state, ledger: { ...state.ledger, barragedHexIds: [target] } };
  const serialized = serializeGameState(state);
  if (!serialized.ok) throw new Error(JSON.stringify(serialized.error));
  const restored = parseGameStateJson(serialized.value);
  if (!restored.ok) throw new Error(JSON.stringify(restored.error));
  const hash = await hashGameState(restored.value);
  const scenarioHash = await hashScenarioDefinition(restored.value.scenario);
  if (!hash.ok || !scenarioHash.ok) throw new Error('Fixture hashing failed.');
  await writeFile(join(directory, `${kind}.json`), JSON.stringify({
    ...envelope, label: `Artillery facility training position ${kind}`, initialSnapshot: serialized.value, currentSnapshot: serialized.value,
    initialStateHash: hash.value, finalStateHash: hash.value, scenarioHash: scenarioHash.value,
    acceptedActions: [], acceptedActionMetadata: [], checkpoints: [],
  }));
  if (kind === 'port-only' || kind === 'base-only') {
    const computerState = kind === 'port-only' ? { ...restored.value, mapState: { ...restored.value.mapState,
      features: restored.value.mapState.features.map((feature) => feature.id === port.id ? { ...feature, damage: 2 } : feature),
    } } : restored.value;
    const computerSnapshot = serializeGameState(computerState);
    const computerHash = await hashGameState(computerState);
    if (!computerSnapshot.ok || !computerHash.ok) throw new Error('Computer training position is invalid.');
    await writeFile(join(directory, `${kind}-computer.json`), JSON.stringify({
      ...envelope, label: `Computer artillery training position ${kind}`, lifecycle: 'PAUSED',
      bindings: envelope.bindings.map((binding, index) => ({ ...binding,
        label: `${index === 0 ? 'Allied' : 'Axis'} computer`, controller: { kind: 'BOT', policyId: 'heuristic', seed: 5104 + index },
      })), initialSnapshot: computerSnapshot.value, currentSnapshot: computerSnapshot.value,
      initialStateHash: computerHash.value, finalStateHash: computerHash.value, scenarioHash: scenarioHash.value,
      acceptedActions: [], acceptedActionMetadata: [], checkpoints: [],
    }));
  }
}
await writeFile(join(directory, 'facts.json'), JSON.stringify(facts, null, 2));
console.log(JSON.stringify(facts));
