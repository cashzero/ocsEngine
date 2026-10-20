import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { mkdirSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { gzipSync } from 'node:zlib';

const [mode = 'run', root = 'artifacts/ai-theater-supply-audit', selected] = process.argv.slice(2);
assert.ok(['register', 'run'].includes(mode));
const engine = 'artifacts/ai-progress-objective-goal-continuity/engine';
const sha = bytes => createHash('sha256').update(bytes).digest('hex');
const read = path => JSON.parse(readFileSync(path));
const canonical = state => m.serializeGameState(state).value;
const parse = value => { const parsed = m.parseGameStateJson(value); assert.ok(parsed.ok); return parsed.value; };
const tree = createHash('sha256');
for (const file of readdirSync(engine, { recursive: true }).filter(file => file.endsWith('.js')).sort())
  tree.update(file).update('\0').update(sha(readFileSync(`${engine}/${file}`))).update('\0');
const engineTreeSha256 = tree.digest('hex');
assert.equal(engineTreeSha256, '4a87376b26c41f60086cb3060f606afcc1e9b99bb3ba00339c904837d200bb2a');
const m = await import(pathToFileURL(resolve(engine, 'index.js')).href);
const pieces = await import(pathToFileURL(resolve(engine, 'rules/pieces.js')).href);
const diceRoot = 'artifacts/ai-progress-dice-reproducibility', combatRoot = 'artifacts/ai-progress-combat-opportunity';
mkdirSync(root, { recursive: true });
if (mode === 'register') {
  const files = new Set([`${root}/protocol.md`, `${root}/design.md`, 'scripts/ai-theater-supply-audit.mjs',
    `${diceRoot}/registration.json`, `${diceRoot}/check.json`, `${combatRoot}/registration.json`, `${combatRoot}/checks.json`]);
  for (const path of [`${diceRoot}/registration.json`, `${combatRoot}/registration.json`]) {
    for (const [file, digest] of Object.entries(read(path).files)) {
      assert.equal(sha(readFileSync(file)), digest, file); files.add(file);
    }
  }
  const cases = read(`${diceRoot}/registration.json`).cases.map(trial => {
    const oldPath = `${combatRoot}/pair-${trial.firstMatch}.json`, old = read(oldPath);
    files.add(oldPath); files.add(old.provenance.rawPath);
    const histories = [];
    for (const dice of ['original', 'resample']) for (const weight of [30, 15]) {
      const save = dice === 'original' ? weight === 30 ? trial.sourceSave : trial.counterSave
        : `${diceRoot}/resample/pair-${trial.firstMatch}/branch-${weight}.save.json`;
      files.add(save); histories.push({ dice, weight, save });
    }
    return { firstMatch: trial.firstMatch, target: old.originalTarget, forkAt: trial.forkAt, fork: old.fork,
      originalForkHash: trial.originalForkHash, originalForkRng: trial.originalForkRng, futureState: trial.futureState,
      sourceSave: trial.sourceSave, oldPath, histories };
  });
  const output = { sourceCommit: execFileSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8' }).trim(),
    createdAt: new Date().toISOString(), engineTreeSha256, cases,
    files: Object.fromEntries([...files].sort().map(file => [file, sha(readFileSync(file))])) };
  writeFileSync(`${root}/registration.json`, `${JSON.stringify(output, null, 2)}\n`);
  console.log(JSON.stringify({ registeredCases: cases.length, histories: cases.length * 4, files: files.size }));
  process.exit(0);
}
const registration = read(`${root}/registration.json`), scriptSha256 = sha(readFileSync(import.meta.filename));
assert.equal(engineTreeSha256, registration.engineTreeSha256);
for (const [file, digest] of Object.entries(registration.files)) assert.equal(sha(readFileSync(file)), digest, file);
const stock = state => new Map(state.pieceState.pieces.filter(piece => piece.resourceQuantity !== undefined)
  .map(piece => [piece.id, { ownerId: piece.ownerId, quantity: piece.resourceQuantity, location: piece.location }]));
const amount = (state, id) => state.pieceState.pieces.find(piece => piece.id === id)?.resourceQuantity ?? 0;
const sameTurn = (sequence, fork) => sequence.gameTurn === fork.gameTurn && sequence.playerTurnIndex === fork.playerTurnIndex
  && sequence.phasingPlayerId === fork.phasingPlayerId;
const rows = [];
for (const trial of registration.cases.filter(trial => !selected || trial.firstMatch === Number(selected))) {
  const original = read(trial.sourceSave), old = read(trial.oldPath);
  for (const history of trial.histories) {
    const saved = read(history.save), tail = history.dice === 'resample';
    const actions = tail ? [...original.acceptedActions.slice(0, trial.forkAt), ...saved.acceptedActions] : saved.acceptedActions;
    let state = parse(original.initialSnapshot), boundary = null, supplyExit = null;
    const payments = [], changes = [], eventsBeforeBoundary = [];
    let replayedActions = 0;
    for (let at = 0; at < actions.length; at++) {
      if (at === trial.forkAt) {
        assert.equal((await m.hashGameState(state)).value, trial.originalForkHash);
        assert.deepEqual(state.rng, trial.originalForkRng);
        if (tail) {
          const replacement = parse(saved.initialSnapshot);
          assert.equal(canonical({ ...replacement, rng: state.rng }), canonical(state));
          assert.deepEqual(replacement.rng, { ...state.rng, state: trial.futureState }); state = replacement;
        }
        const expectedSave = history.weight === 30 ? original : read(trial.histories.find(row => row.dice === 'original' && row.weight === 15).save);
        assert.deepEqual(actions[at], expectedSave.acceptedActions[at]);
      }
      const before = state, action = actions[at], applied = m.ruleEngine.applyAction(before, action);
      assert.ok(applied.ok, `${trial.firstMatch}:${history.dice}:${history.weight}:${at}`);
      state = applied.state; replayedActions++;
      if (sameTurn(before.sequence, trial.fork)) {
        const preStock = stock(before), postStock = stock(state), deltas = [];
        for (const id of new Set([...preStock.keys(), ...postStock.keys()])) {
          if (JSON.stringify(preStock.get(id)) !== JSON.stringify(postStock.get(id)))
            deltas.push({ id, before: preStock.get(id) ?? null, after: postStock.get(id) ?? null });
        }
        if (deltas.length) changes.push({ at, actionKind: action.kind, actorId: action.actorId, deltas });
        if (action.actorId === 'player:axis' && ['PAY_FUEL', 'RECOVER_INTERNALS', 'CHECK_SUPPLY'].includes(action.kind)) {
          let expected, extra = {};
          if (action.kind === 'PAY_FUEL') {
            const piece = before.pieceState.pieces.find(piece => piece.id === action.pieceId);
            const option = m.fuelOptions(before, piece).find(option => option.method === action.method); assert.ok(option);
            expected = [{ resourcePieceId: action.sourcePieceId, quantity: option.tokens }];
            const fuelEvents = applied.events.filter(event => event.kind === 'FUEL_PAID'); assert.equal(fuelEvents.length, 1);
            assert.equal(fuelEvents[0].tokens, option.tokens); assert.equal(fuelEvents[0].resourcePieceId, action.sourcePieceId);
            extra = { coveredPieceIds: option.coveredPieceIds, method: action.method };
          } else if (action.kind === 'RECOVER_INTERNALS') {
            const piece = before.pieceState.pieces.find(piece => piece.id === action.pieceId);
            const plan = m.internalRecoveryPayments(before, piece, action.sourcePieceIds); expected = plan.payments;
            assert.equal(pieces.internalStocksOf(state.pieceState.pieces.find(piece => piece.id === action.pieceId)), plan.level);
            extra = { recoveredLevel: plan.level };
          } else {
            const cost = m.eatOffMapCost(action.pieceIds.reduce((sum, id) => sum + pieces.reTicksOf(before, before.pieceState.pieces.find(piece => piece.id === id)), 0));
            expected = [{ resourcePieceId: action.sourcePieceId, quantity: cost }];
            for (const id of action.pieceIds) assert.ok(pieces.usageOf(state, state.pieceState.pieces.find(piece => piece.id === id)).supplyPaid);
          }
          const paid = expected.map(payment => ({ resourcePieceId: payment.resourcePieceId, quantity: payment.quantity,
            before: amount(before, payment.resourcePieceId), after: amount(state, payment.resourcePieceId) }));
          assert.equal(new Set(paid.map(row => row.resourcePieceId)).size, paid.length);
          for (const payment of paid) assert.equal(payment.before - payment.after, payment.quantity);
          assert.equal(deltas.reduce((sum, row) => sum + (row.before?.quantity ?? 0) - (row.after?.quantity ?? 0), 0), paid.reduce((sum, row) => sum + row.quantity, 0));
          if (action.kind !== 'PAY_FUEL') assert.deepEqual(applied.events.filter(event => event.kind === 'SUPPLY_SPENT')
            .map(event => ({ resourcePieceId: event.resourcePieceId, quantity: event.quantity })), paid.map(({ resourcePieceId, quantity }) => ({ resourcePieceId, quantity })));
          payments.push({ at, phase: before.sequence.phase, kind: action.kind, action, paid, ...extra,
            preHash: (await m.hashGameState(before)).value, postHash: (await m.hashGameState(state)).value, eventKinds: applied.events.map(event => event.kind) });
        }
      }
      const transitions = applied.events.filter(event => event.kind === 'SEQUENCE_ADVANCED');
      if (!transitions.some(event => event.from.phase === 'SUPPLY' && sameTurn(event.from, trial.fork)
        || event.to.phase === 'COMBAT' && event.to.segment === 'COMBAT' && sameTurn(event.to, trial.fork))) continue;
      assert.equal(action.kind, 'ADVANCE_SEQUENCE');
      let reconstructed = before, entry = null; const regenerated = [];
      for (const event of transitions) {
        assert.deepEqual(reconstructed.sequence, event.from); assert.deepEqual(m.nextSequence(reconstructed), event.to);
        if (event.from.phase === 'SUPPLY' && sameTurn(event.from, trial.fork))
          supplyExit = { at, sequence: event.from, preLifecycleHash: (await m.hashGameState(reconstructed)).value,
            eventIndex: event.sequence };
        const lifecycle = m.applySequenceLifecycle(reconstructed, event.to);
        reconstructed = lifecycle.state; regenerated.push(...lifecycle.events);
        if (event.to.phase === 'COMBAT' && event.to.segment === 'COMBAT' && sameTurn(event.to, trial.fork) && !entry)
          entry = { state: reconstructed, event };
      }
      assert.deepEqual(regenerated.map((event, sequence) => ({ ...event, sequence })), applied.events);
      assert.equal(canonical({ ...reconstructed, revision: state.revision }), canonical(state));
      if (!entry) continue;
      assert.ok(supplyExit, 'Current Supply exit precedes Combat');
      const measured = entry.state, snapshot = canonical(measured);
      assert.equal(measured.pendingDecision, null); assert.equal(measured.activeTransaction, null);
      const request = { actorId: 'player:axis', kind: 'DECLARE_COMBAT', pieceId: null, budget: 200 };
      const query = m.ruleEngine.getActionCandidates(measured, request);
      const targetActions = query.actions.filter(action => action.kind === 'DECLARE_COMBAT' && action.combatKind === 'REGULAR' && action.targetHexId === trial.target);
      const witnesses = targetActions.map(action => {
        assert.ok(m.ruleEngine.validateAction(measured, action).allowed);
        const settlement = m.settleDeclaredAttackerSupply(measured, action.actorId, action.attackerIds, action.attackerSupply);
        assert.deepEqual(settlement.violations, []);
        const explanation = m.ruleEngine.explain(measured, action); assert.ok(explanation.allowed);
        const attackerStrength = explanation.facts.find(fact => fact.key === 'combat.attackerStrength')?.value;
        assert.ok(typeof attackerStrength === 'number' && Number.isFinite(attackerStrength));
        for (const payment of settlement.payments) assert.ok(payment.quantity <= amount(measured, payment.resourcePieceId));
        const feeds = action.attackerIds.map(pieceId => ({ pieceId, sources: m.ruleEngine.queryFeedCoverage(measured, action.actorId, pieceId).value }));
        return { action, attackerStrength, externalPayments: settlement.payments, internalIds: settlement.internalIds, feeds };
      });
      assert.deepEqual(m.ruleEngine.getActionCandidates(measured, request), query, 'Auditing does not create another cost');
      assert.equal(canonical(measured), snapshot, 'Audit preserves full state and RNG');
      const stateHash = (await m.hashGameState(measured)).value, actionHash = sha(JSON.stringify(query.actions));
      let priorMatch = null;
      const pointScale = old.arms[0].pointScale, bestStrength = Math.max(0, ...witnesses.map(row => row.attackerStrength)) * pointScale;
      if (!tail) {
        const prior = old.arms[history.weight === 30 ? 0 : 1];
        assert.equal(stateHash, prior.stateHash); assert.equal(actionHash, prior.query.actionsSha256);
        assert.equal(bestStrength, prior.offeredAttackStrength);
        assert.deepEqual(witnesses.map(({ action, attackerStrength, externalPayments, internalIds }) => ({ action, attackerStrength, externalPayments, internalIds })),
          prior.witnesses.map(({ action, attackerStrength, externalPayments, internalIds }) => ({ action, attackerStrength, externalPayments, internalIds })));
        priorMatch = true;
      }
      boundary = { at, sequence: measured.sequence, stateHash, rng: measured.rng, internalRevision: measured.revision,
        containerPreHash: (await m.hashGameState(before)).value, containerPostHash: (await m.hashGameState(state)).value,
        eventIndex: entry.event.sequence, supplyExit, query: { budget: 200, actionHash, truncated: query.truncated,
          candidates: query.actions.length, status: witnesses.length ? 'PRESENT' : query.truncated ? 'UNKNOWN_TRUNCATED' : 'ABSENT_IN_OFFERED_SET' },
        bestStrength, witnessCount: witnesses.length, priorMatch };
      eventsBeforeBoundary.push({ at, action, containerBeforeSnapshot: canonical(before), allEvents: applied.events });
      const rawPath = `${root}/pair-${trial.firstMatch}-${history.dice}-${history.weight}.raw.json.gz`;
      writeFileSync(rawPath, gzipSync(JSON.stringify({ snapshot, payments, resourceChanges: changes, witnesses, query, eventsBeforeBoundary })));
      const paymentTotals = Object.fromEntries(['PAY_FUEL', 'RECOVER_INTERNALS', 'CHECK_SUPPLY'].map(kind => [kind,
        payments.filter(row => row.kind === kind).reduce((sum, row) => sum + row.paid.reduce((sum, payment) => sum + payment.quantity, 0), 0)]));
      rows.push({ firstMatch: trial.firstMatch, dice: history.dice, weight: history.weight, target: trial.target,
        sourceSave: history.save, sourceSha256: sha(readFileSync(history.save)), replayedActions, boundary,
        payments: paymentTotals, paymentActions: payments.length, preForkPaymentActions: payments.filter(row => row.at < trial.forkAt).length,
        rawPath, rawSha256: sha(readFileSync(rawPath)), requeryUnchanged: true, settledCurrentTurnCosts: true });
      break;
    }
    if (!boundary) rows.push({ firstMatch: trial.firstMatch, dice: history.dice, weight: history.weight, target: trial.target,
      sourceSave: history.save, replayedActions, status: 'NO_MATCHING_ENTRY', lastSequence: state.sequence });
  }
  console.log(JSON.stringify({ completedPair: trial.firstMatch, histories: rows.filter(row => row.firstMatch === trial.firstMatch).length }));
}
assert.equal(rows.length, selected ? 4 : 60); assert.equal(sha(readFileSync(import.meta.filename)), scriptSha256);
const output = { rows, summary: { histories: rows.length, boundaries: rows.filter(row => row.boundary).length,
  replayedActions: rows.reduce((sum, row) => sum + row.replayedActions, 0), priorMatches: rows.filter(row => row.boundary?.priorMatch).length,
  targetWitnesses: rows.reduce((sum, row) => sum + (row.boundary?.witnessCount ?? 0), 0),
  paymentTotals: Object.fromEntries(['PAY_FUEL', 'RECOVER_INTERNALS', 'CHECK_SUPPLY'].map(kind => [kind, rows.reduce((sum, row) => sum + (row.payments?.[kind] ?? 0), 0)])),
  paymentActions: rows.reduce((sum, row) => sum + (row.paymentActions ?? 0), 0),
  preForkPaymentActions: rows.reduce((sum, row) => sum + (row.preForkPaymentActions ?? 0), 0),
  unknownQueries: rows.filter(row => row.boundary?.query.status === 'UNKNOWN_TRUNCATED').length },
  provenance: { sourceCommit: registration.sourceCommit, engineTreeSha256, scriptSha256, registrationSha256: sha(readFileSync(`${root}/registration.json`)) } };
writeFileSync(`${root}/${selected ? `pilot-${selected}` : 'results'}.json`, `${JSON.stringify(output, null, 2)}\n`);
console.log(JSON.stringify(output.summary));
