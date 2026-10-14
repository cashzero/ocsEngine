// Training position for scripts/replacement-acceptance/run-tables.mjs (run after `npm run build`), in the manner of
// make-movement-position.mjs: the default New Game (Air forces None, the seeds below) with a few Allied units arranged,
// set to the Allied Aircraft Refit Phase of Game Turn 2 so the next step is the Reinforcement Phase and its Variable
// Replacement Table roll. Only the opening state is changed; the save goes through the same hash and replay checks as any
// other, and every later step of the run is a click in the UI.
//
// Placed, in a hex H with no Axis unit within 5 hexes:
// - the Allied HQ in Combat Mode, two identical infantry divisions reduced to 2 and 1 steps (13.9-1 Combine),
//   1 Pax and 1 Eq in Move Mode, and a local trace source so nothing there runs out of supply while the turn is played;
// - beside it, an armored-division unit in Combat Mode whose identical twin of the other armored division is put in the
//   Dead Pile (13.9-2 Exchange);
// - in the Dead Pile also: the other Allied HQ (1 Pax + 1 Eq) and two garrisons (13.5d: two for 1 Pax).
import { mkdir, writeFile } from 'node:fs/promises';
import {
  DEFAULT_NEW_GAME_REQUEST, createGameplayEngine, createMemoryGameplayPorts, createNewGameOrchestrator,
  hashGameState, hashScenarioDefinition, identicalCounters, parseGameStateJson, serializeGameState,
} from '../../dist/index.js';

const out = process.argv[2] ?? 'tmp/replacement-tables-position';
await mkdir(out, { recursive: true });
export const SEEDS = { map: 7101, oob: 7102, deployment: 7103, rules: 7104 };
const request = { ...DEFAULT_NEW_GAME_REQUEST, seeds: SEEDS };
const created = await createNewGameOrchestrator(createGameplayEngine(createMemoryGameplayPorts())).create(request);
if (!created.ok) throw new Error(`New Game failed: ${JSON.stringify(created.error).slice(0, 300)}`);
const base = JSON.parse(created.value.session.serializeSave());
const start = parseGameStateJson(base.currentSnapshot);
if (!start.ok) throw new Error('snapshot');
const s0 = start.value;
const ALLIED = 'player:allied';
const AXIS = 'player:axis';
const defs = new Map(s0.scenario.pieceCatalog.definitions.map((d) => [d.id, d]));
const def = (p) => defs.get(p.definitionId);
const fullSteps = (p) => Math.max(0, ...(def(p).faces[0]?.steps.map((step) => step.remainingSteps) ?? [0]));
const allied = s0.pieceState.pieces.filter((p) => p.ownerId === ALLIED);
const onMap = (p) => p.location.kind === 'ON_MAP';

const parse = (id) => id.split(',').map(Number);
const distance = (a, b) => { const [aq, ar] = parse(a); const [bq, br] = parse(b); return (Math.abs(aq - bq) + Math.abs(aq + ar - bq - br) + Math.abs(ar - br)) / 2; };
const hexes = s0.scenario.mapDefinition.hexes.map(({ id }) => id);
const axisHexes = s0.pieceState.pieces.filter((p) => p.ownerId === AXIS && onMap(p)).map((p) => p.location.hexId);
const clear = hexes.filter((id) => axisHexes.every((other) => distance(id, other) >= 6));
const hqs = allied.filter((p) => def(p).counter?.kind === 'HQ');
const [hq, deadHq] = hqs;
const H = clear.sort((a, b) => distance(a, hq.location.hexId) - distance(b, hq.location.hexId) || a.localeCompare(b))[0];
const beside = clear.filter((id) => distance(id, H) === 1).sort()[0];
if (!hq || !deadHq || !H || !beside) throw new Error('No HQs or clear hexes');

const divisions = allied.filter((p) => def(p).counter?.symbol === 'INFANTRY' && fullSteps(p) >= 3);
const pair = divisions.flatMap((a, i) => divisions.slice(i + 1).filter((b) => identicalCounters(s0, a, b)).map((b) => [a, b]))[0];
if (!pair) throw new Error('No two identical infantry divisions');
const formationOf = (p) => def(p).ownership.formationDefinitionId;
// A unit of a multi-unit formation (13.9-2), or else an independent unit (13.9-3), with an identical twin in another multi-unit formation.
const formationSize = (id) => s0.scenario.pieceCatalog.definitions.filter((d) => d.family === 'GROUND' && d.ownership.formationDefinitionId === id).length;
const combatUnits = allied.filter((p) => ['COMBAT', 'ARTILLERY'].includes(def(p).counter?.kind) && !String(p.id).includes('garrison') && !pair.includes(p));
const swaps = combatUnits.flatMap((a) => combatUnits.filter((b) => b !== a && formationOf(b) && formationSize(formationOf(b)) > 1
  && formationOf(b) !== formationOf(a) && identicalCounters(s0, a, b)).map((b) => [a, b]));
const swap = swaps.find(([a]) => formationOf(a) && formationSize(formationOf(a)) > 1) ?? swaps[0];
if (!swap) throw new Error('No unit with an identical twin in another division');
const garrisons = allied.filter((p) => String(p.id).includes('garrison'));
if (garrisons.length < 2) throw new Error('Fewer than two Allied garrisons');
const replDef = (kind) => s0.scenario.pieceCatalog.definitions.find((d) => String(d.id).endsWith(`:allied:${kind}`));

const at = { [hq.id]: H, [pair[0].id]: H, [pair[1].id]: H, [swap[0].id]: beside };
const dead = new Set([deadHq.id, swap[1].id, garrisons[0].id, garrisons[1].id]);
let order = 300;
const pieces = s0.pieceState.pieces.map((p) => {
  if (dead.has(p.id)) return { ...p, location: { kind: 'ELIMINATED' }, stackOrder: 0 };
  const hexId = at[p.id];
  if (!hexId) return p;
  const combat = p.id === hq.id || p.id === swap[0].id;
  return {
    ...p, location: { kind: 'ON_MAP', hexId }, stackOrder: order += 1,
    ...(combat ? { mode: 'COMBAT', currentFaceId: 'combat' } : { mode: 'MOVE', currentFaceId: 'move' }),
    ...(p.id === pair[0].id ? { remainingSteps: 2 } : p.id === pair[1].id ? { remainingSteps: 1 } : {}),
  };
});
const repl = (kind, index) => ({
  id: `repl:position:${kind}:${index}`, definitionId: replDef(kind === 'pax' ? 'personnel' : 'equipment').id, ownerId: ALLIED,
  location: { kind: 'ON_MAP', hexId: H }, currentFaceId: 'move', remainingSteps: 1, mode: 'MOVE', statuses: [], resourceQuantity: 1, stackOrder: order += 1,
});
const state = {
  ...s0,
  scenario: { ...s0.scenario, sources: [...s0.scenario.sources, { id: 'source:test:allied-training', sideDefinitionId: 'side:allied', hexId: H }] },
  sequence: { ...s0.sequence, gameTurn: 2, playerTurnIndex: 0, firstPlayerId: ALLIED, phasingPlayerId: ALLIED, actingPlayerId: ALLIED, phase: 'AIRCRAFT_REFIT', segment: 'NONE' },
  pieceState: { ...s0.pieceState, pieces: [...pieces, repl('pax', 1), repl('eq', 1)] },
};
const text = serializeGameState(state);
if (!text.ok) throw new Error(`invalid: ${JSON.stringify(text.error).slice(0, 400)}`);
const reparsed = parseGameStateJson(text.value);
if (!reparsed.ok) throw new Error(`invalid: ${JSON.stringify(reparsed.error).slice(0, 600)}`);
const hash = await hashGameState(reparsed.value);
const scenarioHash = await hashScenarioDefinition(reparsed.value.scenario);
const save = { ...base, label: 'Replacement tables training position', initialSnapshot: text.value, currentSnapshot: text.value,
  initialStateHash: hash.value, finalStateHash: hash.value, scenarioHash: scenarioHash.value, acceptedActions: [], acceptedActionMetadata: [], checkpoints: [] };
await writeFile(`${out}/position.json`, JSON.stringify(save));
const label = (id) => { const [q, r] = parse(id); return `${String(q + Math.floor(r / 2) + 1).padStart(2, '0')}${String(r + 1).padStart(2, '0')}`; };
const unit = (p) => ({ id: p.id, name: def(p).name });
const facts = {
  seeds: SEEDS, hex: { id: H, label: label(H) }, beside: { id: beside, label: label(beside) },
  hq: unit(hq), keep: unit(pair[0]), give: unit(pair[1]), onMap: unit(swap[0]), twin: unit(swap[1]),
  deadHq: unit(deadHq), garrisons: garrisons.slice(0, 2).map(unit),
};
await writeFile(`${out}/position-facts.json`, JSON.stringify(facts, null, 2));
console.log(JSON.stringify(facts, null, 2));
