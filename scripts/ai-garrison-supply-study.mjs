import { readFileSync, readdirSync, mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import * as m from '../dist/index.js';
import { usageOf } from '../dist/rules/pieces.js';
import { availableRationTokens } from '../dist/rules/supply/relocation-impact.js';
// Replay whole AI games; count garrison feeding, delivered SP actually eaten, missed legal feeds and attrition.
// node scripts/ai-garrison-supply-study.mjs <ai-match-dir> [evidence-dir]
const [dir, out = dir] = process.argv.slice(2);
if (!dir) throw new Error('usage: ai-garrison-supply-study.mjs <ai-match-dir> [evidence-dir]');
const records = [];
for (const file of readdirSync(dir).filter((name) => name.endsWith('.save.json'))) {
  const save = JSON.parse(readFileSync(join(dir, file), 'utf8'));
  let state = m.parseGameStateJson(save.initialSnapshot).value;
  const record = { file, feeds: [], truckDeliveries: [], supplyEnds: [], missedLegalFeeds: [], attrition: [], losses: [] };
  const delivered = new Set();
  const isGarrison = (p) => /:garrison$/.test(String(p.definitionId));
  const onMapGarrisons = (current, actor) => current.pieceState.pieces.filter((p) => p.ownerId === actor && p.location.kind === 'ON_MAP' && isGarrison(p));
  for (const action of save.acceptedActions) {
    const before = state;
    const result = m.ruleEngine.applyAction(state, action);
    if (!result.ok) throw new Error(`${file}: rejected ${action.kind}`);
    state = result.state;
    if (action.kind === 'UNLOAD_SUPPLY') {
      const truck = before.pieceState.pieces.find((p) => p.id === action.truckId);
      const fed = onMapGarrisons(state, action.actorId).filter((p) => !m.pieceHasTrace(state, p) && m.ruleEngine.queryFeedCoverage(state, action.actorId, p.id).value.some((d) => d.hexIds.includes(p.location.hexId) && state.pieceState.pieces.find((q) => q.id === d.dumpId)?.location.hexId === truck.location.hexId));
      if (fed.length) {
        for (const p of state.pieceState.pieces.filter((p) => p.ownerId === action.actorId && p.location.kind === 'ON_MAP' && p.location.hexId === truck.location.hexId && p.resourceQuantity > 0)) delivered.add(p.id);
        record.truckDeliveries.push({ turn: before.sequence.gameTurn, hex: truck.location.hexId, tokens: action.tokens, garrisons: fed.map((p) => p.id) });
      }
    }
    if (action.kind === 'CHECK_SUPPLY') {
      const garrisons = action.pieceIds.filter((id) => isGarrison(before.pieceState.pieces.find((p) => p.id === id)));
      if (garrisons.length) record.feeds.push({ turn: before.sequence.gameTurn, garrisons, source: action.sourcePieceId, delivered: delivered.has(action.sourcePieceId) });
    }
    if (action.kind === 'ADVANCE_SEQUENCE' && before.sequence.phase === 'SUPPLY') {
      const garrisons = onMapGarrisons(before, action.actorId);
      record.supplyEnds.push({ turn: before.sequence.gameTurn, total: garrisons.length, untraced: garrisons.filter((p) => !m.pieceHasTrace(before, p)).length,
        unfed: garrisons.filter((p) => !m.pieceHasTrace(before, p) && !usageOf(before, p).supplyPaid).map((p) => ({ id: p.id, hex: p.location.hexId, reachableTokens: availableRationTokens(before, p) })) });
      const candidates = m.ruleEngine.getActionCandidates(before, { actorId: action.actorId, kind: 'CHECK_SUPPLY', pieceId: null, budget: 1000 }).actions;
      const missed = candidates.filter((a) => a.pieceIds.some((id) => isGarrison(before.pieceState.pieces.find((p) => p.id === id))));
      if (missed.length) record.missedLegalFeeds.push({ turn: before.sequence.gameTurn, actions: missed });
    }
    for (const e of result.events.filter((e) => e.kind === 'ATTRITION_ROLLED')) {
      const affected = before.pieceState.pieces.filter((p) => p.location.kind === 'ON_MAP' && isGarrison(p)
        && p.location.hexId === e.hexId && !m.pieceHasTrace(before, p) && !usageOf(before, p).supplyPaid);
      if (affected.length) record.attrition.push({ turn: before.sequence.gameTurn, ...e, garrisons: affected.map((p) => p.id) });
    }
    if (before.pendingDecision?.kind === 'ATTRITION_LOSS') {
      const lost = onMapGarrisons(before, action.actorId).filter((p) => state.pieceState.pieces.find((q) => q.id === p.id)?.location.kind !== 'ON_MAP');
      record.losses.push(...lost.map((p) => ({ turn: before.sequence.gameTurn, id: p.id, hex: p.location.hexId })));
    }
  }
  records.push(record);
}
const summary = { games: records.length, feeds: records.reduce((n,r)=>n+r.feeds.length,0), truckDeliveries: records.reduce((n,r)=>n+r.truckDeliveries.length,0), feedsFromDelivered: records.reduce((n,r)=>n+r.feeds.filter(f=>f.delivered).length,0), missedLegalFeeds: records.reduce((n,r)=>n+r.missedLegalFeeds.length,0), attritionRolls: records.reduce((n,r)=>n+r.attrition.length,0), losses: records.reduce((n,r)=>n+r.losses.length,0), records };
mkdirSync(out,{recursive:true});writeFileSync(join(out,'garrison-supply.json'),JSON.stringify(summary,null,2));
console.log(JSON.stringify({...summary,records:summary.records.map(r=>({file:r.file,unfed:r.supplyEnds.filter(s=>s.unfed.length),deliveries:r.truckDeliveries,losses:r.losses}))},null,2));
