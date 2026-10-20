import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { gunzipSync } from 'node:zlib';

const root = process.argv[2] ?? 'artifacts/ai-theater-supply-audit';
const engine = 'artifacts/ai-progress-objective-goal-continuity/engine';
const sha = bytes => createHash('sha256').update(bytes).digest('hex');
const read = path => JSON.parse(readFileSync(path));
const registration = read(`${root}/registration.json`), results = read(`${root}/results.json`);
for (const [file, digest] of Object.entries(registration.files)) assert.equal(sha(readFileSync(file)), digest, file);
assert.equal(results.provenance.scriptSha256, registration.files['scripts/ai-theater-supply-audit.mjs']);
assert.equal(results.provenance.registrationSha256, sha(readFileSync(`${root}/registration.json`)));
let priorTerminalSaveBindings = 0;
for (const proof of read('artifacts/ai-progress-dice-reproducibility/check.json').rows) {
  assert.equal(sha(readFileSync(proof.path)), proof.sha256, 'Prior full-replay result binding');
  const result = read(proof.path);
  for (const branch of result.branches) {
    const saved = branch.files['save.json'];
    assert.equal(sha(readFileSync(saved.path)), saved.sha256, 'Previously replayed terminal save');
    assert.equal(registration.files[saved.path], saved.sha256, 'Current registration uses the proven save');
    priorTerminalSaveBindings++;
  }
}
assert.equal(priorTerminalSaveBindings, 30);
const tree = createHash('sha256');
for (const file of readdirSync(engine, { recursive: true }).filter(file => file.endsWith('.js')).sort())
  tree.update(file).update('\0').update(sha(readFileSync(`${engine}/${file}`))).update('\0');
assert.equal(tree.digest('hex'), registration.engineTreeSha256);
const m = await import(pathToFileURL(resolve(engine, 'index.js')).href);
const pieces = await import(pathToFileURL(resolve(engine, 'rules/pieces.js')).href);
const parse = snapshot => { const parsed = m.parseGameStateJson(snapshot); assert.ok(parsed.ok); return parsed.value; };
const canonical = state => m.serializeGameState(state).value;
const amount = (state, id) => state.pieceState.pieces.find(piece => piece.id === id)?.resourceQuantity ?? 0;
const sameTurn = (sequence, fork) => ['gameTurn', 'playerTurnIndex', 'phasingPlayerId'].every(key => sequence[key] === fork[key]);
const stock = state => new Map(state.pieceState.pieces.filter(piece => piece.resourceQuantity !== undefined)
  .map(piece => [piece.id, { ownerId: piece.ownerId, quantity: piece.resourceQuantity, location: piece.location }]));
function uniquePayments(receipts) {
  assert.equal(new Set(receipts.map(row => row.at)).size, receipts.length, 'Settled payment charged twice');
}
async function verifyReceipt(receipt, before, after, action, events, at) {
  assert.equal(receipt.at, at); assert.deepEqual(receipt.action, action); assert.equal(receipt.kind, action.kind);
  assert.equal(receipt.phase, before.sequence.phase);
  assert.equal(receipt.preHash, (await m.hashGameState(before)).value); assert.equal(receipt.postHash, (await m.hashGameState(after)).value);
  assert.deepEqual(receipt.eventKinds, events.map(event => event.kind));
  const spent = action.kind === 'PAY_FUEL' ? events.filter(event => event.kind === 'FUEL_PAID')
    .map(event => ({ resourcePieceId: event.resourcePieceId, quantity: event.tokens }))
    : events.filter(event => event.kind === 'SUPPLY_SPENT').map(event => ({ resourcePieceId: event.resourcePieceId, quantity: event.quantity }));
  assert.equal(receipt.paid.length, spent.length);
  for (const [index, paid] of receipt.paid.entries()) {
    assert.deepEqual({ resourcePieceId: paid.resourcePieceId, quantity: paid.quantity }, spent[index]);
    assert.equal(paid.before, amount(before, paid.resourcePieceId), 'Ledger physical stock before');
    assert.equal(paid.after, amount(after, paid.resourcePieceId), 'Ledger physical stock after');
    assert.equal(paid.before - paid.after, paid.quantity, 'Ledger debit');
  }
  if (action.kind === 'PAY_FUEL') {
    const option = m.fuelOptions(before, before.pieceState.pieces.find(piece => piece.id === action.pieceId)).find(option => option.method === action.method);
    assert.deepEqual(receipt.coveredPieceIds, option.coveredPieceIds); assert.equal(receipt.method, action.method);
  } else if (action.kind === 'RECOVER_INTERNALS')
    assert.equal(receipt.recoveredLevel, pieces.internalStocksOf(after.pieceState.pieces.find(piece => piece.id === action.pieceId)));
}
function verifyBoundary(record, state, snapshot) {
  assert.deepEqual(record.sequence, state.sequence, 'Boundary sequence');
  assert.equal(snapshot, canonical(state), 'Complete boundary snapshot');
  assert.equal(record.internalRevision, state.revision); assert.deepEqual(record.rng, state.rng);
}
const verified = [], totals = { PAY_FUEL: 0, RECOVER_INTERNALS: 0, CHECK_SUPPLY: 0 };
let totalActions = 0, totalPayments = 0, preForkPayments = 0, witnessesChecked = 0, priorMatches = 0;
let exampleReceipt = null, exampleBoundary = null;
assert.equal(results.rows.length, 60); const seen = new Set();
for (const row of results.rows) {
  const trial = registration.cases.find(trial => trial.firstMatch === row.firstMatch); assert.ok(trial);
  const ref = trial.histories.find(ref => ref.dice === row.dice && ref.weight === row.weight); assert.ok(ref);
  const key = `${row.firstMatch}:${row.dice}:${row.weight}`; assert.ok(!seen.has(key)); seen.add(key);
  assert.equal(row.sourceSave, ref.save); assert.equal(row.target, trial.target); assert.ok(row.boundary, 'Missing entry is not a complete cohort');
  assert.equal(row.sourceSha256, sha(readFileSync(ref.save)));
  assert.equal(row.rawSha256, sha(readFileSync(row.rawPath)));
  const raw = JSON.parse(gunzipSync(readFileSync(row.rawPath))), original = read(trial.sourceSave), saved = read(ref.save);
  if (row.dice === 'original') assert.equal(canonical(parse(saved.initialSnapshot)), canonical(parse(original.initialSnapshot)));
  uniquePayments(raw.payments);
  const actions = row.dice === 'original' ? saved.acceptedActions : [...original.acceptedActions.slice(0, trial.forkAt), ...saved.acceptedActions];
  let state = parse(original.initialSnapshot), measured = null, foundSupply = null;
  const receipts = [], changes = []; let replayed = 0;
  for (let at = 0; at < actions.length; at++) {
    if (at === trial.forkAt) {
      assert.equal((await m.hashGameState(state)).value, trial.originalForkHash); assert.deepEqual(state.rng, trial.originalForkRng);
      if (row.dice === 'resample') {
        const replacement = parse(saved.initialSnapshot);
        assert.equal(canonical({ ...replacement, rng: state.rng }), canonical(state));
        assert.deepEqual(replacement.rng, { ...state.rng, state: trial.futureState }); state = replacement;
      }
      const oldSave = row.weight === 30 ? original : read(trial.histories.find(ref => ref.dice === 'original' && ref.weight === 15).save);
      assert.deepEqual(actions[at], oldSave.acceptedActions[at]);
    }
    const before = state, action = actions[at], applied = m.ruleEngine.applyAction(before, action); assert.ok(applied.ok);
    state = applied.state; replayed++;
    if (sameTurn(before.sequence, trial.fork)) {
      const a = stock(before), b = stock(state), deltas = [...new Set([...a.keys(), ...b.keys()])].filter(id => JSON.stringify(a.get(id)) !== JSON.stringify(b.get(id)))
        .map(id => ({ id, before: a.get(id) ?? null, after: b.get(id) ?? null }));
      if (deltas.length) changes.push({ at, actionKind: action.kind, actorId: action.actorId, deltas });
      if (action.actorId === 'player:axis' && Object.hasOwn(totals, action.kind)) {
        const receipt = raw.payments.find(receipt => receipt.at === at); assert.ok(receipt, 'Missing actual payment');
        await verifyReceipt(receipt, before, state, action, applied.events, at); receipts.push(receipt);
        totals[action.kind] += receipt.paid.reduce((sum, payment) => sum + payment.quantity, 0);
        totalPayments++; if (at < trial.forkAt) preForkPayments++;
        if (!exampleReceipt && receipt.paid.length) exampleReceipt = { receipt, before, after: state, action, events: applied.events, at };
      }
    }
    const transitions = applied.events.filter(event => event.kind === 'SEQUENCE_ADVANCED');
    if (!transitions.some(event => event.from.phase === 'SUPPLY' && sameTurn(event.from, trial.fork)
      || event.to.phase === 'COMBAT' && event.to.segment === 'COMBAT' && sameTurn(event.to, trial.fork))) continue;
    let rebuilt = before, first = null; const regenerated = [];
    for (const event of transitions) {
      assert.deepEqual(event.from, rebuilt.sequence); assert.deepEqual(event.to, m.nextSequence(rebuilt));
      if (event.from.phase === 'SUPPLY' && sameTurn(event.from, trial.fork))
        foundSupply = { at, sequence: event.from, preLifecycleHash: (await m.hashGameState(rebuilt)).value, eventIndex: event.sequence };
      const step = m.applySequenceLifecycle(rebuilt, event.to); rebuilt = step.state; regenerated.push(...step.events);
      if (!first && event.to.phase === 'COMBAT' && event.to.segment === 'COMBAT' && sameTurn(event.to, trial.fork)) first = { state: rebuilt, event };
    }
    assert.deepEqual(regenerated.map((event, sequence) => ({ ...event, sequence })), applied.events);
    assert.equal(canonical({ ...rebuilt, revision: state.revision }), canonical(state));
    if (!first) continue;
    measured = first.state; assert.equal(at, row.boundary.at, 'First Combat entry'); assert.ok(foundSupply);
    assert.deepEqual(row.boundary.supplyExit, foundSupply); assert.equal(row.boundary.eventIndex, first.event.sequence);
    assert.equal(row.boundary.containerPreHash, (await m.hashGameState(before)).value);
    assert.equal(row.boundary.containerPostHash, (await m.hashGameState(state)).value);
    assert.deepEqual(raw.eventsBeforeBoundary, [{ at, action, containerBeforeSnapshot: canonical(before), allEvents: applied.events }]);
    verifyBoundary(row.boundary, measured, raw.snapshot);
    assert.equal(row.boundary.stateHash, (await m.hashGameState(measured)).value);
    break;
  }
  assert.ok(measured); assert.deepEqual(receipts, raw.payments); assert.deepEqual(changes, raw.resourceChanges);
  assert.equal(replayed, row.replayedActions); totalActions += replayed;
  assert.equal(row.paymentActions, receipts.length); assert.equal(row.preForkPaymentActions, receipts.filter(receipt => receipt.at < trial.forkAt).length);
  for (const kind of Object.keys(totals)) assert.equal(row.payments[kind], receipts.filter(receipt => receipt.kind === kind).reduce((sum, receipt) => sum + receipt.paid.reduce((sum, paid) => sum + paid.quantity, 0), 0));
  const snapshot = canonical(measured), query = m.ruleEngine.getActionCandidates(measured, { actorId: 'player:axis', kind: 'DECLARE_COMBAT', pieceId: null, budget: 200 });
  assert.deepEqual(query, raw.query); assert.equal(sha(JSON.stringify(query.actions)), row.boundary.query.actionHash);
  assert.equal(row.boundary.query.truncated, query.truncated); assert.equal(row.boundary.query.candidates, query.actions.length);
  const target = query.actions.filter(action => action.kind === 'DECLARE_COMBAT' && action.combatKind === 'REGULAR' && action.targetHexId === trial.target);
  assert.deepEqual(raw.witnesses.map(witness => witness.action), target);
  for (const witness of raw.witnesses) {
    assert.ok(m.ruleEngine.validateAction(measured, witness.action).allowed);
    const payment = m.settleDeclaredAttackerSupply(measured, 'player:axis', witness.action.attackerIds, witness.action.attackerSupply);
    assert.deepEqual(payment.violations, []); assert.deepEqual(payment.payments, witness.externalPayments); assert.deepEqual(payment.internalIds, witness.internalIds);
    assert.deepEqual(witness.feeds, witness.action.attackerIds.map(pieceId => ({ pieceId, sources: m.ruleEngine.queryFeedCoverage(measured, 'player:axis', pieceId).value })));
    assert.equal(witness.attackerStrength, m.ruleEngine.explain(measured, witness.action).facts.find(fact => fact.key === 'combat.attackerStrength').value);
  }
  const old = read(trial.oldPath), pointScale = old.arms[0].pointScale;
  assert.equal(row.boundary.bestStrength, Math.max(0, ...raw.witnesses.map(witness => witness.attackerStrength)) * pointScale);
  assert.equal(row.boundary.witnessCount, target.length); witnessesChecked += target.length;
  assert.equal(row.boundary.query.status, target.length ? 'PRESENT' : query.truncated ? 'UNKNOWN_TRUNCATED' : 'ABSENT_IN_OFFERED_SET');
  if (row.dice === 'original') {
    const prior = old.arms[row.weight === 30 ? 0 : 1];
    assert.equal(prior.stateHash, row.boundary.stateHash); assert.equal(prior.query.actionsSha256, row.boundary.query.actionHash);
    assert.equal(prior.offeredAttackStrength, row.boundary.bestStrength); assert.equal(row.boundary.priorMatch, true); priorMatches++;
  }
  assert.equal(canonical(measured), snapshot); assert.ok(row.requeryUnchanged && row.settledCurrentTurnCosts);
  if (!exampleBoundary) exampleBoundary = { record: row.boundary, state: measured, snapshot };
  verified.push({ key, stateHash: row.boundary.stateHash, paymentActions: receipts.length, witnesses: target.length });
  console.log(JSON.stringify({ checked: key, totalActions }));
}
const controls = [];
const duplicate = [exampleReceipt.receipt, exampleReceipt.receipt];
assert.throws(() => uniquePayments(duplicate), /Settled payment charged twice/); controls.push('doubleChargedSettledPayment');
const invented = structuredClone(exampleReceipt.receipt); invented.paid[0].before++; invented.paid[0].after++;
await assert.rejects(verifyReceipt(invented, exampleReceipt.before, exampleReceipt.after, exampleReceipt.action, exampleReceipt.events, exampleReceipt.at), /Ledger physical stock before/);
controls.push('fabricatedConsistentLedgerStock');
const wrong = structuredClone(exampleBoundary.record); wrong.sequence.segment = 'BARRAGE';
assert.throws(() => verifyBoundary(wrong, exampleBoundary.state, exampleBoundary.snapshot), /Boundary sequence/); controls.push('wrongInternalBoundary');
const shared = read('artifacts/ai-progress-combat-opportunity/checks.json').paymentControl, sharedSave = read(shared.sourcePath);
let state = parse(sharedSave.initialSnapshot);
for (const action of sharedSave.acceptedActions.slice(0, shared.at)) { const applied = m.ruleEngine.applyAction(state, action); assert.ok(applied.ok); state = applied.state; }
assert.equal((await m.hashGameState(state)).value, shared.stateHash);
const action = m.ruleEngine.getActionCandidates(state, { actorId: 'player:axis', kind: 'DECLARE_COMBAT', pieceId: null, budget: 200 }).actions
  .find(action => action.targetHexId === '17,7' && action.attackerIds.length === 3); assert.ok(action);
assert.ok(m.ruleEngine.validateAction(state, action).allowed);
const short = { ...state, pieceState: { ...state.pieceState, pieces: state.pieceState.pieces.map(piece => piece.id === shared.resourceId ? { ...piece, resourceQuantity: 2 } : piece) } };
for (const id of action.attackerIds) assert.ok(m.ruleEngine.validateAction(short, { ...action, attackerIds: [id], leadAttackerId: id, attackerSupply: action.attackerSupply.filter(choice => choice.pieceId === id) }).allowed);
const settlement = m.settleDeclaredAttackerSupply(short, 'player:axis', action.attackerIds, action.attackerSupply);
assert.ok(settlement.violations.length > 0 && settlement.violations.every(violation => violation.path[0] === 'attackerSupply'));
controls.push('sharedSourceOverspending');
const declared = m.ruleEngine.applyAction(state, action); assert.ok(declared.ok && declared.state.activeTransaction);
assert.equal(amount(declared.state, shared.resourceId), amount(state, shared.resourceId), 'Declaration is not physical consumption');
assert.equal(m.availableTokens(declared.state, declared.state.pieceState.pieces.find(piece => piece.id === shared.resourceId)),
  amount(state, shared.resourceId) - 3, 'Active attacker reservation counted once');
const recoveryAt = sharedSave.acceptedActions.findIndex(action => action.kind === 'RECOVER_INTERNALS'); assert.ok(recoveryAt >= 0);
let recoveryState = parse(sharedSave.initialSnapshot);
for (const action of sharedSave.acceptedActions.slice(0, recoveryAt)) { const applied = m.ruleEngine.applyAction(recoveryState, action); assert.ok(applied.ok); recoveryState = applied.state; }
const recoveryAction = sharedSave.acceptedActions[recoveryAt], recovered = m.ruleEngine.applyAction(recoveryState, recoveryAction); assert.ok(recovered.ok);
const plan = m.internalRecoveryPayments(recoveryState, recoveryState.pieceState.pieces.find(piece => piece.id === recoveryAction.pieceId), recoveryAction.sourcePieceIds);
assert.ok(plan.payments.reduce((sum, row) => sum + row.quantity, 0) > 0);
for (const paid of plan.payments) assert.equal(amount(recoveryState, paid.resourcePieceId) - amount(recovered.state, paid.resourcePieceId), paid.quantity);
const summary = results.summary;
assert.equal(summary.histories, 60); assert.equal(summary.boundaries, 60); assert.equal(summary.replayedActions, totalActions);
assert.equal(summary.priorMatches, priorMatches); assert.equal(summary.targetWitnesses, witnessesChecked); assert.deepEqual(summary.paymentTotals, totals);
assert.equal(summary.paymentActions, totalPayments); assert.equal(summary.preForkPaymentActions, preForkPayments);
assert.equal(summary.unknownQueries, results.rows.filter(row => row.boundary.query.status === 'UNKNOWN_TRUNCATED').length);
const crossDiceUnchangedStrength = registration.cases.flatMap(trial => [30, 15].map(weight => {
  const a = results.rows.find(row => row.firstMatch === trial.firstMatch && row.weight === weight && row.dice === 'original');
  const b = results.rows.find(row => row.firstMatch === trial.firstMatch && row.weight === weight && row.dice === 'resample');
  return a.boundary.bestStrength === b.boundary.bestStrength;
})).filter(Boolean).length;
const output = { histories: seen.size, replayedActions: totalActions, verified, paymentActions: totalPayments, paymentTotals: totals,
  crossDiceUnchangedStrength, priorTerminalSaveBindings,
  semanticControls: controls, reservationControl: { at: shared.at, resourceId: shared.resourceId, physicalConsumptionAtDeclaration: 0, reservedTokens: 3 },
  recoveryControl: { sourcePath: shared.sourcePath, at: recoveryAt, actorId: recoveryAction.actorId, payments: plan.payments },
  checkerSha256: sha(readFileSync(import.meta.filename)), resultsSha256: sha(readFileSync(`${root}/results.json`)),
  registrationSha256: sha(readFileSync(`${root}/registration.json`)) };
writeFileSync(`${root}/checks.json`, `${JSON.stringify(output, null, 2)}\n`);
console.log(JSON.stringify({ histories: seen.size, replayedActions: totalActions, semanticControls: controls }));
