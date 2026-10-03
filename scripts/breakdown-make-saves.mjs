import { mkdir, writeFile } from 'node:fs/promises';
import {
  DEFAULT_NEW_GAME_REQUEST, applyRuleAction, createGameplayEngine, createMemoryGameplayPorts, createNewGameOrchestrator,
  declareTestCombat, hashGameState, hashScenarioDefinition, parseGameStateJson, serializeGameState,
} from '../dist/index.js';

// Test positions for scripts/breakdown-positions-gate.mjs (run after `npm run build`): the New Game the UI makes with
// 5 formations per side, with a few units placed. Writes tmp/breakdown-ui/save-A.json (Allied Movement Phase) and
// save-B.json (Allied Combat Segment; the dice seed is searched so the defender retreats and the attackers may advance).
await mkdir('tmp/breakdown-ui', { recursive: true });
const request = { ...DEFAULT_NEW_GAME_REQUEST, oob: { ...DEFAULT_NEW_GAME_REQUEST.oob, formationsPerSide: 5 } };
const engine = createGameplayEngine(createMemoryGameplayPorts());
const created = await createNewGameOrchestrator(engine).create(request);
if (!created.ok) throw new Error('game');
const base = JSON.parse(created.value.session.serializeSave());
const start = parseGameStateJson(base.currentSnapshot);
if (!start.ok) throw new Error('snapshot');
const defs = new Map(start.value.scenario.pieceCatalog.definitions.map((d) => [d.id, d]));
const byName = (name) => start.value.pieceState.pieces.find((p) => defs.get(p.definitionId)?.name === name && p.location.kind === 'ON_MAP');
const ALLIED = 'player:allied'; const AXIS = 'player:axis';
const P = { abn: byName('101.Abn'), inf: byName('90.Inf'), abn13: byName('13.Abn'), vg: byName('246.VG') };
const dump = (owner) => start.value.pieceState.pieces.find((p) => p.ownerId === owner && defs.get(p.definitionId)?.family === 'RESOURCE' && p.location.kind === 'ON_MAP');
P.alliedDump = dump(ALLIED); P.axisDump = dump(AXIS);
console.log(Object.fromEntries(Object.entries(P).map(([k, v]) => [k, v?.id])));

// H1 holds 90.Inf and 13.Abn; 101.Abn is in H2 (next to H1 and H3); the enemy 246.VG is in H3.
const H1 = '10,11', H2 = '11,10', H3 = '11,11';
const place = (state, sequence, steps = {}) => {
  const order = new Map();
  const at = { [P.inf.id]: H1, [P.abn13.id]: H1, [P.alliedDump.id]: H1, [P.abn.id]: H2, [P.vg.id]: H3, [P.axisDump.id]: '12,11' };
  return {
    ...state,
    sequence: { ...state.sequence, ...sequence },
    pieceState: { ...state.pieceState, pieces: state.pieceState.pieces.map((p) => {
      if (!at[p.id]) return p;
      const hexId = at[p.id]; const n = (order.get(hexId) ?? 100) + 1; order.set(hexId, n);
      const unit = p.remainingSteps !== null && defs.get(p.definitionId)?.family === 'GROUND';
      return { ...p, location: { kind: 'ON_MAP', hexId }, stackOrder: n, ...(unit ? { mode: 'COMBAT', currentFaceId: 'combat' } : {}), ...(steps[p.id] ? { remainingSteps: steps[p.id] } : {}), ...(p.resourceQuantity !== null ? { resourceQuantity: 40 } : {}) };
    }) },
  };
};
const write = async (name, state) => {
  const text = serializeGameState(state);
  if (!text.ok) throw new Error(`${name}: ${JSON.stringify(text.error).slice(0, 400)}`);
  const reparsed = parseGameStateJson(text.value);
  if (!reparsed.ok) throw new Error(`${name} invalid: ${JSON.stringify(reparsed.error).slice(0, 600)}`);
  const hash = await hashGameState(reparsed.value);
  const scenarioHash = await hashScenarioDefinition(reparsed.value.scenario);
  const save = { ...base, label: `Breakdown test position ${name}`, initialSnapshot: text.value, currentSnapshot: text.value,
    initialStateHash: hash.value, finalStateHash: hash.value, scenarioHash: scenarioHash.value, acceptedActions: [], acceptedActionMetadata: [], checkpoints: [] };
  await writeFile(`tmp/breakdown-ui/save-${name}.json`, JSON.stringify(save));
  console.log('wrote', name, 'revision', reparsed.value.revision, reparsed.value.sequence.phase, reparsed.value.sequence.segment);
};

const turn1 = { gameTurn: 1, playerTurnIndex: 0, phasingPlayerId: ALLIED, actingPlayerId: ALLIED, firstPlayerId: ALLIED };
await write('A', place(start.value, { ...turn1, phase: 'MOVEMENT', segment: 'MOVEMENT' }));

// Save B: Allied Combat Segment against a reduced 246.VG; pick the dice so the defender retreats and the attackers may advance.
const combatBase = place(start.value, { ...turn1, phase: 'COMBAT', segment: 'COMBAT' }, { [P.vg.id]: 2 });
const attackers = [P.inf.id, P.abn13.id, P.abn.id];
const pick = (decision) => {
  const ids = decision.options.map(({ id }) => id);
  if (decision.kind === 'OPTION_SPLIT') return ids.find((id) => /^option:0:\d+$/u.test(id)) ?? ids[0];
  if (decision.kind === 'RETREAT_HEX') return ids.find((id) => id.startsWith('hex:')) ?? ids[0];
  return ids[0];
};
for (let seed = 1; seed < 400; seed += 1) {
  let state = { ...combatBase, rng: { state: seed, draws: 0 } };
  const declared = declareTestCombat(state, ALLIED, 'REGULAR', attackers, H3, P.inf.id);
  if (!declared.ok) { console.log('declare failed', declared.violations.map(({ code }) => code)); break; }
  state = declared.state;
  let retreatBreakdown = false; let advanceBreakdown = false; let result = '';
  for (let guard = 0; state.pendingDecision && guard < 30; guard += 1) {
    const decision = state.pendingDecision;
    if (decision.kind === 'RETREAT_HEX' && decision.ownerId === AXIS && decision.options.some(({ id }) => id.startsWith('breakdown:'))) retreatBreakdown = true;
    if (decision.kind === 'ADVANCE_HEX' && decision.options.some(({ id }) => id.startsWith('advance-breakdown:'))) advanceBreakdown = true;
    const next = applyRuleAction(state, decision.ownerId, { kind: 'RESPOND_DECISION', decisionId: decision.id, choiceId: pick(decision) });
    if (!next.ok) { console.log('reject', decision.kind, next.violations.map(({ code }) => code)); break; }
    state = next.state;
    result = state.activeTransaction?.result ?? result;
  }
  if (retreatBreakdown && advanceBreakdown) {
    console.log('seed', seed, 'result', result);
    await write('B', { ...combatBase, rng: { state: seed, draws: 0 } });
    break;
  }
}
