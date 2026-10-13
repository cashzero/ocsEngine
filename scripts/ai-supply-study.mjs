#!/usr/bin/env node
// Replay ai-match saves to attribute attrition and audit friendly trace continuity. Build first.
// Usage: node scripts/ai-supply-study.mjs <match directory> [match index ...]
// Requires ai-match --trace; writes supply-attribution.json (or a match-index-suffixed subset) into that directory.
// Attribution names the last transition from traced to untraced, NOT proven strategic intent or a mistake.
// Own moves can be justified by VP or feeding; losses can have multiple causes after the initial break.
// Removing current enemy presence is a query-only counterfactual; it does not undo earlier HQ destruction,
// captured ports, or a bot's later decisions. This is headless diagnostic evidence, not UI acceptance.
import { readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import * as m from '../dist/index.js';
import { isHq, isCombatUnit, isTransportPoint, reTicksOf, usageOf } from '../dist/rules/pieces.js';
import { availableRationTokens } from '../dist/rules/supply/relocation-impact.js';
import { eatOffMapCost } from '../dist/rules/supply/supply.js';

const dir = process.argv[2];
if (!dir) throw new Error('usage: ai-supply-study.mjs <match directory> [match index ...]');
const selected = process.argv.slice(3).map(Number);
if (selected.some(index => !Number.isSafeInteger(index) || index < 0)) throw new Error('Match indexes must be non-negative integers');
const output = resolve(dir, selected.length ? `supply-attribution-${selected.join('-')}.json` : 'supply-attribution.json');
const summary = JSON.parse(readFileSync(resolve(dir, 'summary.json'), 'utf8'));
const results = [];
const pieceAt = (state, id) => state.pieceState.pieces.find(p => p.id === id);
const hasTrace = (state, id) => {
  const piece = pieceAt(state, id);
  return piece?.location.kind === 'ON_MAP' ? m.pieceHasTrace(state, piece) : null;
};
for (const record of summary.records.filter(r => r.stopReason === 'FINISHED' && r.replay?.ok === true && (!selected.length || selected.includes(r.match)))) {
  const started = Date.now();
  const save = JSON.parse(readFileSync(resolve(dir, `match-${record.match}.save.json`), 'utf8'));
  const trace = new Map(readFileSync(resolve(dir, `match-${record.match}.trace.jsonl`), 'utf8').trim().split('\n').map(JSON.parse).map(t => [t.revision, t]));
  let state = m.parseGameStateJson(save.initialSnapshot).value;
  const states = [state];
  const losses = [];
  const contexts = [];
  const hqBreaks = [];
  const otherUnitTraceBreaks = [];
  const relocationTraceBreaks = [];
  const previewMismatches = [];
  const feedBreaks = [];
  const retreatChoices = [];
  const rationSpending = [];
  const rationPayments = [];
  let supplyRelocationActions = 0;
  let hqActions = 0;
  let relocationActions = 0;
  const stepsLost = { allied: 0, axis: 0 };
  for (const action of save.acceptedActions) {
    const next = m.ruleEngine.applyAction(state, action);
    if (!next.ok) throw new Error(`Replay rejected ${action.kind}`);
    const tx = state.activeTransaction ?? next.state.activeTransaction;
    const context = { revision: state.revision, turn: state.sequence.gameTurn, phase: state.sequence.phase,
      action, initiator: tx?.ownerId ?? action.actorId, transaction: tx?.kind ?? null,
      intent: trace.get(state.revision)?.intent ?? null };
    if (['PAY_FUEL', 'BUILD_HEDGEHOG'].includes(action.kind)) {
      const facts = m.ruleEngine.explain(state, action).facts;
      const value = key => facts.find(f => f.key === key)?.value;
      if (value('supply.rationBudgetApplicable')) rationSpending.push({ ...context,
        committedUnits: value('supply.rationCommittedUnits'), preserved: value('supply.rationCommitmentsPreserved'),
        searchExhausted: value('supply.rationSearchExhausted') });
    }
    if (action.kind === 'CHECK_SUPPLY') {
      const actualTokens = next.events.filter(e => e.kind === 'SUPPLY_SPENT').reduce((sum, e) => sum + e.quantity, 0);
      const groupTokens = eatOffMapCost(action.pieceIds.reduce((sum, id) => sum + reTicksOf(state, pieceAt(state, id)), 0));
      if (actualTokens !== groupTokens || action.pieceIds.some(id => !usageOf(next.state, pieceAt(next.state, id)).supplyPaid)) throw new Error('Ration payment mismatch');
      rationPayments.push({ ...context, units: action.pieceIds.length, actualTokens,
        searchExhausted: m.ruleEngine.explain(state, action).facts.find(f => f.key === 'supply.rationSearchExhausted')?.value,
        individualTokens: action.pieceIds.reduce((sum, id) => sum + eatOffMapCost(reTicksOf(state, pieceAt(state, id))), 0) });
    }
    let relocationFacts;
    if (['MOVE_PIECE', 'CHANGE_MODE'].includes(action.kind)
      && (isCombatUnit(state, pieceAt(state, action.pieceId)) || isTransportPoint(state, pieceAt(state, action.pieceId)))) {
      supplyRelocationActions++;
      relocationFacts = m.ruleEngine.explain(state, action).facts;
      const lost = state.pieceState.pieces.filter(p => p.ownerId === action.actorId && p.location.kind === 'ON_MAP'
        && isCombatUnit(state, p) && !m.pieceHasTrace(state, p)
        && availableRationTokens(next.state, pieceAt(next.state, p.id)) < availableRationTokens(state, p));
      if (lost.length) feedBreaks.push({ ...context, truck: isTransportPoint(state, pieceAt(state, action.pieceId)), lostIds: lost.map(p => p.id) });
      const predicted = relocationFacts.find(f => f.key === 'supply.relocationFeedLostIds')?.value;
      if (predicted !== lost.map(p => p.id).join(',')) previewMismatches.push({ ...context, kind: 'feed', predicted, actual: lost.map(p => p.id) });
    }
    if (action.kind === 'RESPOND_DECISION' && state.pendingDecision?.kind === 'RETREAT_HEX'
      && /^(hex:|with:)/u.test(action.choiceId)) {
      const rated = m.ruleEngine.getActionCandidates(state, { actorId: action.actorId, kind: 'RESPOND_DECISION', pieceId: null, budget: 400 }).actions
        .filter(a => /^(hex:|with:)/u.test(a.choiceId)).map(a => {
          const facts = m.ruleEngine.explain(state, a).facts;
          return { choiceId: a.choiceId, risk: ['supply.retreatForcedLosses', 'supply.retreatUnfed', 'supply.retreatTraceLost']
            .map(key => facts.find(f => f.key === key)?.value) };
        });
      const compare = (a, b) => a.risk[0] - b.risk[0] || a.risk[1] - b.risk[1] || a.risk[2] - b.risk[2];
      rated.sort(compare);
      const chosen = rated.find(r => r.choiceId === action.choiceId);
      if (!chosen || rated.some(r => r.risk.some(v => typeof v !== 'number'))) throw new Error('Missing retreat forecast');
      retreatChoices.push({ ...context, chosen, best: rated[0], worseSupplyRisk: compare(chosen, rated[0]) > 0 });
    }
    if (['MOVE_PIECE', 'CHANGE_MODE'].includes(action.kind) && isCombatUnit(state, pieceAt(state, action.pieceId))) {
      relocationActions++;
      const hq = isHq(state, pieceAt(state, action.pieceId));
      if (hq) hqActions++;
      const lost = state.pieceState.pieces.filter(p => p.ownerId === action.actorId && p.location.kind === 'ON_MAP'
        && isCombatUnit(state, p) && m.pieceHasTrace(state, p) && !m.pieceHasTrace(next.state, pieceAt(next.state, p.id)));
      if (lost.length) relocationTraceBreaks.push({ ...context, hq, lostIds: lost.map(p => p.id) });
      const predicted = relocationFacts.find(f => f.key === 'supply.relocationTraceLostIds')?.value;
      if (predicted !== lost.map(p => p.id).join(',')) previewMismatches.push({ ...context, predicted, actual: lost.map(p => p.id) });
      if (hq && lost.length) hqBreaks.push({ ...context, lostIds: lost.map(p => p.id) });
      const others = lost.filter(p => p.id !== action.pieceId);
      if (others.length) otherUnitTraceBreaks.push({ ...context, hq, lostIds: others.map(p => p.id) });
    }
    for (const event of next.events) {
      if (event.kind !== 'STEP_LOST') continue;
      const lostPiece = pieceAt(state, event.pieceId) ?? pieceAt(next.state, event.pieceId);
      if (!lostPiece) throw new Error(`Missing lost piece ${event.pieceId}`);
      stepsLost[String(lostPiece.ownerId).endsWith('axis') ? 'axis' : 'allied']++;
      if (state.pendingDecision?.kind !== 'ATTRITION_LOSS' && !next.events.some(e => e.kind === 'ATTRITION_ROLLED')) continue;
      losses.push({ at: contexts.length, pieceId: event.pieceId, loss: context });
    }
    contexts.push(context);
    states.push(next.state);
    state = next.state;
  }
  const hash = await m.hashGameState(state);
  if (!hash.ok || hash.value !== record.finalStateHash) throw new Error(`Final hash mismatch in ${record.match}`);
  for (const side of ['allied', 'axis']) {
    if (stepsLost[side] !== record.sides[side].stepsLost) throw new Error(`Step-loss count mismatch in ${record.match}/${side}`);
  }
  const cache = new Map();
  const rationCache = new Map();
  const fed = (i, id) => {
    const key = `${i}|${id}`;
    if (!rationCache.has(key)) {
      const p = pieceAt(states[i], id);
      rationCache.set(key, p?.location.kind !== 'ON_MAP' ? null : usageOf(states[i], p).supplyPaid
        || availableRationTokens(states[i], p) >= eatOffMapCost(reTicksOf(states[i], p)));
    }
    return rationCache.get(key);
  };
  const traced = (i, id) => {
    const key = `${i}|${id}`;
    if (!cache.has(key)) cache.set(key, hasTrace(states[i], id));
    return cache.get(key);
  };
  const attributed = losses.map(({ at, pieceId, loss }) => {
    const atLoss = states[at];
    const piece = pieceAt(atLoss, pieceId);
    const owner = piece.ownerId;
    let firstOut = at;
    while (firstOut > 0 && traced(firstOut - 1, pieceId) === false) firstOut--;
    const trigger = firstOut > 0 ? contexts[firstOut - 1] : null;
    const breakState = states[firstOut];
    const breakPiece = pieceAt(breakState, pieceId);
    const currentTrace = traced(at, pieceId);
    const category = currentTrace ? 'trace-present-at-loss-investigate' : !trigger ? 'initially-out-of-trace'
      : traced(firstOut - 1, pieceId) === null ? 'entered-map-out-of-trace'
      : trigger.transaction && trigger.initiator !== owner ? 'opponent-combat'
      : trigger.action.kind === 'ADVANCE_SEQUENCE' ? 'phase-transition-investigate'
      : trigger.initiator !== owner ? 'opponent-action' : 'own-action';
    // Pure query counterfactual. Keep all own units, weather, map control and formation choices unchanged;
    // remove only current enemy presence/ZOC. Does NOT undo earlier enemy destruction of HQs or port capture.
    const noEnemy = { ...atLoss, pieceState: { ...atLoss.pieceState,
      pieces: atLoss.pieceState.pieces.map(p => p.ownerId !== owner && p.location.kind === 'ON_MAP'
        ? { ...p, location: { kind: 'ELIMINATED' } } : p) } };
    const restoresWithoutEnemy = hasTrace(noEnemy, pieceId);
    const feeds = m.ruleEngine.queryFeedCoverage(atLoss, owner, pieceId).value.filter(f => f.hexIds.includes(piece.location.hexId));
    const ownObjective = breakState.configuration.objectives.find(o => o.hexId === breakPiece?.location.hexId);
    let firstUnfed = at;
    while (firstUnfed > 0 && fed(firstUnfed - 1, pieceId) === false) firstUnfed--;
    const rationTrigger = firstUnfed > 0 ? contexts[firstUnfed - 1] : null;
    const rationCategory = fed(at, pieceId) ? 'ration-present-at-loss-investigate' : !rationTrigger ? 'initially-unfed'
      : fed(firstUnfed - 1, pieceId) === null ? 'entered-map-unfed'
      : rationTrigger.transaction && rationTrigger.initiator !== owner ? 'opponent-combat'
      : rationTrigger.action.kind === 'ADVANCE_SEQUENCE' ? 'phase-transition-investigate'
      : rationTrigger.initiator !== owner ? 'opponent-action' : 'own-action';
    return { pieceId, owner, hexId: piece.location.hexId, category, restoresWithoutEnemy, currentTrace,
      rationCategory, rationTrigger,
      trigger, breakHex: breakPiece?.location.hexId, objectiveAtBreak: ownObjective ?? null,
      reachableFeedTokensAtLoss: feeds.map(f => ({ dumpId: f.dumpId, tokens: f.tokens })), loss };
  });
  const counts = {};
  const rationCounts = {};
  for (const r of attributed) counts[r.category] = (counts[r.category] ?? 0) + 1;
  for (const r of attributed) rationCounts[r.rationCategory] = (rationCounts[r.rationCategory] ?? 0) + 1;
  const result = { match: record.match, winner: record.winner, sides: record.sides, finalStateHash: hash.value, attrition: attributed, counts, rationCounts, hqActions, hqBreaks, relocationActions, otherUnitTraceBreaks, relocationTraceBreaks, previewMismatches, supplyRelocationActions, feedBreaks, retreatChoices, rationSpending, rationPayments };
  results.push(result);
  console.log(record.match, JSON.stringify(counts), `${Date.now() - started}ms`);
}
writeFileSync(output, `${JSON.stringify(results, null, 2)}\n`);
