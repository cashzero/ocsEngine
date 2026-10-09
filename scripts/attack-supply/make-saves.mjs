import { mkdir, writeFile } from 'node:fs/promises';
import {
  DEFAULT_NEW_GAME_REQUEST, applyRuleAction, createGameplayEngine, createMemoryGameplayPorts, createNewGameOrchestrator,
  hashGameState, hashScenarioDefinition, parseGameStateJson, serializeGameState,
} from '../../dist/index.js';

// Test positions for scripts/attack-supply/acceptance.mjs (run after `npm run build`): the default New Game with two
// one-step Allied units and an Allied dump in one hex, next to an Axis unit, in the Allied Combat Segment.
//   short:     the dump holds 1T and every other Allied dump is empty, enough for one attacker only (9.5, 12.10a).
//   exhausted: the same, and the second attacker's internal stocks are Exhausted (12.10c).
await mkdir('tmp/attack-supply', { recursive: true });
const engine = createGameplayEngine(createMemoryGameplayPorts());
const created = await createNewGameOrchestrator(engine).create(DEFAULT_NEW_GAME_REQUEST);
if (!created.ok) throw new Error('game');
const base = JSON.parse(created.value.session.serializeSave());
const start = parseGameStateJson(base.currentSnapshot);
if (!start.ok) throw new Error('snapshot');
const defs = new Map(start.value.scenario.pieceCatalog.definitions.map((d) => [d.id, d]));
const ALLIED = 'player:allied'; const AXIS = 'player:axis';
const oneStep = (owner) => start.value.pieceState.pieces.filter((p) => p.ownerId === owner && p.location.kind === 'ON_MAP'
  && defs.get(p.definitionId)?.family === 'GROUND' && defs.get(p.definitionId)?.counter?.kind === 'COMBAT' && !defs.get(p.definitionId)?.counter?.defensiveOnly
  && p.remainingSteps === 1 && defs.get(p.definitionId)?.faces[0]?.steps.length === 1);
const dump = (owner) => start.value.pieceState.pieces.find((p) => p.ownerId === owner && defs.get(p.definitionId)?.family === 'RESOURCE' && p.location.kind === 'ON_MAP');
const H1 = '10,11', H3 = '11,11';
const turn = { gameTurn: 1, playerTurnIndex: 0, phasingPlayerId: ALLIED, actingPlayerId: ALLIED, firstPlayerId: ALLIED, phase: 'COMBAT', segment: 'COMBAT' };

const position = (attackers, defender, alliedDump, axisDump, exhausted) => {
  const at = { [attackers[0].id]: H1, [attackers[1].id]: H1, [alliedDump.id]: H1, [defender.id]: H3, [axisDump.id]: '12,11' };
  const order = new Map();
  return {
    ...start.value,
    sequence: { ...start.value.sequence, ...turn },
    pieceState: { ...start.value.pieceState, pieces: start.value.pieceState.pieces.map((p) => {
      // No other Allied SP anywhere, so the 1T beside the attackers is all they can reach.
      if (!at[p.id]) return p.ownerId === ALLIED && defs.get(p.definitionId)?.family === 'RESOURCE' && p.location.kind === 'ON_MAP' ? { ...p, resourceQuantity: 0 } : p;
      const hexId = at[p.id]; const n = (order.get(hexId) ?? 100) + 1; order.set(hexId, n);
      const unit = p.remainingSteps !== null && defs.get(p.definitionId)?.family === 'GROUND';
      const quantity = p.id === alliedDump.id ? 1 : p.id === axisDump.id ? 20 : null;
      return {
        ...p, location: { kind: 'ON_MAP', hexId }, stackOrder: n,
        ...(unit ? { mode: 'COMBAT', currentFaceId: 'combat' } : {}),
        ...(quantity !== null ? { resourceQuantity: quantity } : {}),
        ...(exhausted && p.id === attackers[1].id ? { statuses: [...p.statuses, { statusDefinitionId: 'status:internal-stocks', value: { kind: 'TEXT', value: 'EXHAUSTED' } }] } : {}),
      };
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
  const save = { ...base, label: `Attack supply test position ${name}`, initialSnapshot: text.value, currentSnapshot: text.value,
    initialStateHash: hash.value, finalStateHash: hash.value, scenarioHash: scenarioHash.value, acceptedActions: [], acceptedActionMetadata: [], checkpoints: [] };
  await writeFile(`tmp/attack-supply/save-${name}.json`, JSON.stringify(save));
};

// Pick the first pair of Allied one-step units and Axis unit for which the position makes a legal attack with 1T for one.
const allied = oneStep(ALLIED); const axis = oneStep(AXIS);
const alliedDump = dump(ALLIED); const axisDump = dump(AXIS);
let chosen = null;
search: for (let i = 0; i < allied.length; i += 1) for (let j = i + 1; j < allied.length; j += 1) for (const defender of axis) {
  const attackers = [allied[i], allied[j]];
  const state = position(attackers, defender, alliedDump, axisDump, false);
  const defenderIds = state.pieceState.pieces.filter((p) => p.ownerId === AXIS && p.location.kind === 'ON_MAP' && p.location.hexId === H3 && p.remainingSteps !== null && defs.get(p.definitionId)?.family === 'GROUND').map(({ id }) => id);
  const result = applyRuleAction(state, ALLIED, {
    kind: 'DECLARE_COMBAT', combatKind: 'REGULAR', attackerIds: attackers.map(({ id }) => id), defenderIds, targetHexId: H3, leadAttackerId: attackers[0].id,
    attackerSupply: [{ pieceId: attackers[0].id, method: 'DUMPS', dumpIds: [alliedDump.id] }, { pieceId: attackers[1].id, method: 'INTERNAL' }],
  });
  if (result.ok) { chosen = { attackers, defender }; break search; }
  if (process.env.DEBUG && i === 0 && j === 1) console.log(defs.get(defender.definitionId).name, result.violations.map(({ code, message }) => `${code}: ${message}`));
}
if (!chosen) throw new Error(`No legal pair among ${allied.length} Allied and ${axis.length} Axis one-step units.`);
const names = { first: defs.get(chosen.attackers[0].definitionId).name, second: defs.get(chosen.attackers[1].definitionId).name, defender: defs.get(chosen.defender.definitionId).name };
// The dice: a seed where both attackers survive, so the Low marker can be seen afterwards. The acceptance run ends with the
// second unit on the dump and the first on internal stocks, answering every decision with its first option, as here.
const surviving = (exhausted) => {
  const base = position(chosen.attackers, chosen.defender, alliedDump, axisDump, exhausted);
  const [first, second] = chosen.attackers.map(({ id }) => id);
  const defenderIds = base.pieceState.pieces.filter((p) => p.ownerId === AXIS && p.location.kind === 'ON_MAP' && p.location.hexId === H3 && p.remainingSteps !== null && defs.get(p.definitionId)?.family === 'GROUND').map(({ id }) => id);
  for (let seed = 1; seed < 500; seed += 1) {
    const seeded = { ...base, rng: { state: seed, draws: 0 } };
    let result = applyRuleAction(seeded, ALLIED, {
      kind: 'DECLARE_COMBAT', combatKind: 'REGULAR', attackerIds: [second, first], defenderIds, targetHexId: H3, leadAttackerId: second,
      attackerSupply: [{ pieceId: second, method: 'DUMPS', dumpIds: [alliedDump.id] }, { pieceId: first, method: 'INTERNAL' }],
    });
    for (let guard = 0; result.ok && result.state.pendingDecision && guard < 30; guard += 1) {
      const decision = result.state.pendingDecision;
      result = applyRuleAction(result.state, decision.ownerId, { kind: 'RESPOND_DECISION', decisionId: decision.id, choiceId: decision.options[0].id });
    }
    const alive = (id) => result.ok && result.state.pieceState.pieces.find((p) => p.id === id)?.location.kind === 'ON_MAP';
    if (alive(first) && alive(second)) return seeded;
  }
  throw new Error('No seed keeps both attackers alive.');
};
await write('short', surviving(false));
await write('exhausted', surviving(true));
await writeFile('tmp/attack-supply/units.json', JSON.stringify(names));
console.log('wrote short and exhausted:', names);
