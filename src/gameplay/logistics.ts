import type { HexId, PieceId, PlayerId, Revision } from '../core/index.js';
import type { GameAction, GameState, RuleEngine } from '../rules/index.js';
import { capacityTokens, fuelCoverage, fuelOptions, isFriendlyDump, isTransportPoint, isExtender, pieceHasTrace, unitsNeedingSupply } from '../rules/index.js';
import { hexOf, isCombatUnit, isHq, usageOf } from '../rules/pieces.js';
import { afterRequiredRecovery, rationPlan } from '../rules/supply/ration-budget.js';

export interface LogisticsRequest {
  readonly sourceId: PieceId;
  readonly destination: HexId;
  readonly tokens: number;
  readonly excludedTruckIds?: readonly PieceId[];
}
export interface LogisticsStep {
  readonly action: GameAction;
  readonly label: string;
  readonly costTicks: number;
  readonly remainingTicks: number;
}
export interface LogisticsPlan {
  readonly revision: Revision;
  readonly request: LogisticsRequest;
  readonly delivered: number;
  readonly destinationStock: number;
  readonly steps: readonly LogisticsStep[];
  readonly reasons: readonly string[];
  readonly alternatives: readonly HexId[];
  readonly warnings: readonly string[];
}
export interface LogisticsOverview {
  readonly dumps: readonly { readonly id: PieceId; readonly hexId: HexId; readonly tokens: number }[];
  readonly trucks: readonly { readonly id: PieceId; readonly hexId: HexId; readonly capacity: number; readonly loaded: number }[];
  readonly destinations: readonly HexId[];
  readonly fuel: {
    readonly revision: Revision;
    readonly selected: readonly PieceId[];
    readonly choices: readonly { readonly action: GameAction; readonly tokens: number; readonly covers: readonly PieceId[] }[];
    readonly steps: readonly GameAction[];
    readonly tokens: number;
    readonly missing: readonly { readonly id: PieceId; readonly hexId: HexId; readonly tokens: number }[];
  };
  readonly supply: {
    readonly outOfTrace: readonly PieceId[];
    readonly unfed: readonly PieceId[];
    readonly groups: readonly { readonly sourcePieceId: PieceId; readonly pieceIds: readonly PieceId[]; readonly tokens: number }[];
    readonly searchExhausted: boolean;
  };
}
const envelope = (state: GameState, actorId: PlayerId, index: number) => ({
  actionId: `logistics:${state.revision}:${index}` as GameAction['actionId'], actorId, expectedRevision: state.revision,
});
const ownDumps = (state: GameState, actorId: PlayerId) => state.pieceState.pieces.filter(p => p.ownerId === actorId && hexOf(p) !== null && isFriendlyDump(state, actorId, p));
const legalDestinations = (state: GameState, actorId: PlayerId): HexId[] => [...new Set(state.pieceState.pieces
  .filter(p => p.ownerId === actorId && hexOf(p) !== null && (isCombatUnit(state, p) || isFriendlyDump(state, actorId, p))).map(p => hexOf(p)!))].sort();

/** A legal witness, simulated solely with the same reducer used by real dispatch. No random action is admitted. */
export const planLogistics = (state: GameState, actorId: PlayerId, request: LogisticsRequest, rules: RuleEngine): LogisticsPlan => {
  const destinations = legalDestinations(state, actorId);
  const alternatives = [...destinations].sort((a,b) => {
    const distance = (id: string) => { const [x,y] = id.split(',').map(Number), [dx,dy] = request.destination.split(',').map(Number); return Math.max(Math.abs(x!-dx!), Math.abs(y!-dy!), Math.abs(x!+y!-dx!-dy!)); };
    return distance(a)-distance(b) || a.localeCompare(b);
  }).slice(0, 8);
  const reasons: string[] = [], warnings: string[] = [], steps: LogisticsStep[] = [];
  let next = state, delivered = 0;
  const source = ownDumps(state, actorId).find(p => p.id === request.sourceId);
  const result = (): LogisticsPlan => ({ revision: state.revision, request, delivered, steps, reasons, alternatives, warnings,
    destinationStock: ownDumps(next, actorId).filter(p => hexOf(p) === request.destination).reduce((sum,p) => sum + (p.resourceQuantity ?? 0),0) });
  if (state.sequence.phase !== 'MOVEMENT' || state.sequence.segment !== 'MOVEMENT' || state.sequence.actingPlayerId !== actorId || state.pendingDecision) reasons.push('Plan transport in your Movement Segment after pending decisions (13.2d).');
  if (!source) reasons.push('Choose your on-map supply dump.');
  if (!Number.isSafeInteger(request.tokens) || request.tokens < 1) reasons.push('Enter a positive whole number of Tokens.');
  if (!destinations.includes(request.destination)) reasons.push('Unloading needs a friendly combat unit or supply dump at the destination (13.2f). Choose one of the suggested legal hexes.');
  if (source && hexOf(source) === request.destination) reasons.push('The supply is already at that destination.');
  if (reasons.length) return result();
  const trucks = state.pieceState.pieces.filter(p => p.ownerId === actorId && hexOf(p) !== null && isTransportPoint(state,p) && !isExtender(state,p)
    && !request.excludedTruckIds?.includes(p.id)).sort((a,b) => capacityTokens(state,b)-capacityTokens(state,a) || a.id.localeCompare(b.id));
  const failures = new Set<string>();
  if (request.tokens > (source!.resourceQuantity ?? 0)) failures.add(`The source holds only ${source!.resourceQuantity ?? 0}T.`);
  for (const truck of trucks) {
    let trips = 0;
    while (delivered < request.tokens) {
    if (delivered >= request.tokens) break;
    let trial = next;
    const trialSteps: LogisticsStep[] = [];
    const take = (action: GameAction, label: string): boolean => {
      const before = trial;
      const transition = rules.applyAction(before, action);
      if (!transition.ok) { transition.violations.forEach(v => failures.add(`${v.message} (${v.rule})`)); return false; }
      if (JSON.stringify(before.rng) !== JSON.stringify(transition.state.rng) || transition.state.pendingDecision) { failures.add('This route requires a random capture or decision; choose another destination.'); return false; }
      trial = transition.state;
      const current = trial.pieceState.pieces.find(p => p.id === truck.id)!;
      const spent = usageOf(trial,current).movementSpentTicks;
      trialSteps.push({ action, label, costTicks: spent - usageOf(before, before.pieceState.pieces.find(p => p.id === truck.id)!).movementSpentTicks,
        remainingTicks: rules.queryTransportOptions(trial,actorId,truck.id).value?.remainingTicks ?? 0 });
      return true;
    };
    const moveTo = (hexId: HexId): boolean => {
      const current = trial.pieceState.pieces.find(p => p.id === truck.id)!;
      if (hexOf(current) === hexId) return true;
      const route = rules.queryMovementRange(trial,actorId,truck.id).value?.find(h => h.hexId === hexId);
      if (!route) { failures.add('No route with enough remaining MP, or the truck has finished moving (6.1g, 13.2f).'); return false; }
      return take({ ...envelope(trial,actorId,trialSteps.length),kind:'MOVE_PIECE',pieceId:truck.id,path:route.path },`Move ${truck.id} via ${route.path.join(' → ')}`);
    };
    if (!moveTo(hexOf(source!)!)) break;
    const option = rules.queryTransportOptions(trial,actorId,truck.id).value?.loads.find(l => l.pieceId === request.sourceId && l.available);
    if (!option) { failures.add('The source has no loadable stock, the truck has no free capacity, or loading exceeds its remaining MP (13.2f).'); break; }
    const tokens = Math.min(request.tokens-delivered,option.maxTokens);
    if (!take({...envelope(trial,actorId,trialSteps.length),kind:'LOAD_SUPPLY',truckId:truck.id,dumpId:request.sourceId,tokens},`Load ${tokens}T onto ${truck.id}`)) break;
    if (!moveTo(request.destination)) break;
    if (!take({...envelope(trial,actorId,trialSteps.length),kind:'UNLOAD_SUPPLY',truckId:truck.id,tokens},`Unload ${tokens}T from ${truck.id}`)) break;
    next = trial; steps.push(...trialSteps); delivered += tokens; trips += 1;
    }
    // Finish after all possible trips, before another truck begins (6.1g).
    const trial = next;
    const finish: GameAction = {...envelope(trial,actorId,steps.length),kind:'END_MOVE',pieceId:truck.id};
    if (trips > 0 && rules.validateAction(trial,finish).allowed) {
      const ended = rules.applyAction(trial,finish);
      if (ended.ok) { next = ended.state; steps.push({action:finish,label:`Finish ${truck.id}`,costTicks:0,remainingTicks:rules.queryTransportOptions(next,actorId,truck.id).value?.remainingTicks??0}); }
    }
  }
  if (delivered < request.tokens) reasons.push(`Can deliver ${delivered}T of ${request.tokens}T; short ${request.tokens-delivered}T. ${[...failures].join(' ') || 'No available trucks; include more trucks or choose a nearer relay hex.'}`);
  warnings.push('Current positions and visible information only: enemy action can cut or capture this route. Review the map before confirming.');
  return result();
};

export const logisticsOverview = (state: GameState, actorId: PlayerId, selected: readonly PieceId[], rules: RuleEngine): LogisticsOverview => {
  const own = state.pieceState.pieces.filter(p => p.ownerId === actorId && hexOf(p) !== null);
  selected = selected.filter(id => own.some(p=>p.id===id));
  const wanted = new Set(selected);
  const choices: LogisticsOverview['fuel']['choices'][number][] = [];
  for (const piece of own.filter(p => wanted.size > 0 && (wanted.has(p.id) || isHq(state,p)))) for (const option of fuelOptions(state,piece)) {
    if (!option.fueledPieceIds.some(id => wanted.has(id))) continue;
    for (const source of option.sources) choices.push({action:{...envelope(state,actorId,choices.length),kind:'PAY_FUEL',method:option.method,pieceId:piece.id,sourcePieceId:source.pieceId},tokens:option.tokens,covers:option.fueledPieceIds});
  }
  let next = state, tokens = 0;
  const steps: GameAction[] = [];
  const covered = new Set(own.filter(p => fuelCoverage(state,p) !== null).map(p => p.id));
  while ([...wanted].some(id => !covered.has(id))) {
    const options = choices.filter(c => c.covers.some(id => wanted.has(id) && !covered.has(id)))
      .sort((a,b) => b.covers.filter(id => wanted.has(id) && !covered.has(id)).length / b.tokens - a.covers.filter(id => wanted.has(id) && !covered.has(id)).length / a.tokens || a.tokens-b.tokens);
    let found = false;
    for (const option of options) {
      const action = {...option.action,...envelope(next,actorId,steps.length)};
      const transition = rules.applyAction(next,action);
      if (!transition.ok) continue;
      next = transition.state; steps.push(action); tokens += option.tokens;
      own.filter(p => fuelCoverage(next,p) !== null).forEach(p => covered.add(p.id)); found = true; break;
    }
    if (!found) break;
  }
  const future: GameState = state.sequence.phase === 'SUPPLY' ? state : { ...state,
    usage: state.usage.map(entry => ({...entry,supplyPaid:false,recovered:false})), activeTransaction:null, pendingDecision:null };
  const recovered = afterRequiredRecovery(future,actorId);
  const plan = rationPlan(future,actorId);
  const funded = new Set(plan.groups.flatMap(g => g.pieceIds));
  const outOfTrace = own.filter(p => isCombatUnit(recovered,p) && !pieceHasTrace(recovered,p) && !usageOf(recovered,p).supplyPaid && !recovered.air.droppedIds.includes(p.id)).map(p=>p.id);
  return {
    dumps:ownDumps(state,actorId).map(p=>({id:p.id,hexId:hexOf(p)!,tokens:p.resourceQuantity??0})),
    trucks:own.filter(p=>isTransportPoint(state,p)&&!isExtender(state,p)).map(p=>({id:p.id,hexId:hexOf(p)!,capacity:capacityTokens(state,p),loaded:rules.queryTransportOptions(state,actorId,p.id).value?.loadedTokens??0})),
    destinations:legalDestinations(state,actorId),
    fuel:{revision:state.revision,selected,choices,steps,tokens,missing:own.filter(p=>wanted.has(p.id)&&!covered.has(p.id)).map(p=>({id:p.id,hexId:hexOf(p)!,tokens:1}))},
    supply:{outOfTrace,unfed:outOfTrace.filter(id=>!funded.has(id)),groups:plan.groups,searchExhausted:plan.exhausted},
  };
};
