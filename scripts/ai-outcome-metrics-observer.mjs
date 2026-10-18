import assert from 'node:assert/strict';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';

const ratio = (numerator, denominator) => denominator > 0 ? numerator / denominator : null;
const causes = () => ({ attrition: 0, overstack: 0, combat: 0, overrun: 0, barrage: 0, other: 0 });
const sum = (values) => values.reduce((a, b) => a + b, 0);
const combatCount = (counts) => counts.combat + counts.overrun + counts.barrage;
const withoutSequence = ({ sequence, ...event }) => event;

export async function loadOutcomeObserver(engine, m) {
  const modules = await Promise.all(['pieces', 'supply/supply', 'supply/ration-budget',
    'lifecycle/lifecycle', 'lifecycle/interrupts', 'breakdown/breakdown'].map((name) =>
    import(pathToFileURL(join(engine, 'rules', `${name}.js`)).href)));
  const [pieces, supply, ration, lifecycle, interrupts, breakdown] = modules;
  return (initial, cutoffTurn, record) => {
    const players = initial.scenario.players.map((p) => p.id);
    const sideOf = (id) => String(id).split(':').at(-1);
    const consumers = (state, id) => state.pieceState.pieces.filter((p) => p.ownerId === id && m.isOnMapCombatUnit(state, p));
    const ticks = (state, units) => sum(units.map((p) => pieces.reTicksOf(state, p)));
    const observations = Object.fromEntries(players.map((id) => [id, {
      initialReTicks: ticks(initial, consumers(initial, id)), entry: null, settlements: [],
      lossCauses: { early: causes(), total: causes() },
    }]));

    function sampleEntry(state) {
      const { gameTurn, phase, phasingPlayerId: id } = state.sequence;
      if (gameTurn !== cutoffTurn || phase !== 'SUPPLY' || observations[id].entry) return;
      const recovered = ration.afterRequiredRecovery(state, id);
      const demand = consumers(recovered, id).filter((p) => !pieces.usageOf(recovered, p).supplyPaid
        && !supply.pieceHasTrace(recovered, p) && !recovered.air.droppedIds.includes(p.id));
      const plan = ration.rationPlan(state, id);
      const admitted = new Set(plan.groups.flatMap((group) => group.pieceIds));
      const sourceDependence = new Map();
      const units = demand.map((p) => {
        const reTicks = pieces.reTicksOf(recovered, p);
        const sources = supply.dumpsReaching(recovered, id, p.location.hexId, p)
          .map((source) => ({ pieceId: source.pieceId, tokens: source.availableQuantity }));
        const strat = p.mode === 'STRAT';
        const individuallyPayable = !strat && sources.some((s) => s.tokens >= supply.eatOffMapCost(reTicks));
        if (!strat && sources.length === 1) {
          sourceDependence.set(sources[0].pieceId, (sourceDependence.get(sources[0].pieceId) ?? 0) + reTicks);
        }
        assert(!strat || !admitted.has(p.id), 'STRAT cannot receive rations');
        return { pieceId: p.id, reTicks, strat, sources, individuallyPayable, assigned: admitted.has(p.id) };
      });
      assert([...admitted].every((id) => units.some((p) => p.pieceId === id)), 'plan uses only eligible demands');
      observations[id].entry = {
        turn: gameTurn, revision: state.revision, initialReTicks: observations[id].initialReTicks,
        traceGapReTicks: sum(units.map((p) => p.reTicks)),
        individualGapReTicks: sum(units.filter((p) => !p.individuallyPayable).map((p) => p.reTicks)),
        jointGapReTicks: plan.exhausted ? null : sum(units.filter((p) => !p.assigned).map((p) => p.reTicks)),
        singleSourceDependenceReTicks: Math.max(0, ...sourceDependence.values()),
        stratGapReTicks: sum(units.filter((p) => p.strat).map((p) => p.reTicks)),
        searchExhausted: plan.exhausted, units, groups: plan.groups,
      };
    }

    function sampleSettlement(state, from, revision) {
      const id = from.phasingPlayerId;
      const own = consumers(state, id);
      const oos = own.filter((p) => pieces.isOutOfSupply(p));
      const data = observations[id];
      assert(!data.settlements.some((s) => s.turn === from.gameTurn), 'one Supply settlement per side and turn');
      data.settlements.push({ turn: from.gameTurn, revision,
        initialReTicks: data.initialReTicks, remainingReTicks: ticks(state, own),
        outOfSupplyReTicks: ticks(state, oos),
        burden: ratio(ticks(state, oos), data.initialReTicks),
        outOfSupplyUnits: oos.map((p) => ({ pieceId: p.id, reTicks: pieces.reTicksOf(state, p), remainingSteps: p.remainingSteps })),
      });
    }

    function observeSequence(before, action, applied) {
      const transitions = applied.events.filter((e) => e.kind === 'SEQUENCE_ADVANCED');
      if (!transitions.some((e) => e.from.phase === 'SUPPLY' || e.to.phase === 'SUPPLY')) return;
      let current = before;
      if (action.kind === 'RESPOND_DECISION') {
        const pending = before.pendingDecision;
        if (pending.kind === 'FIRST_PLAYER') current = lifecycle.resolveFirstPlayerDecision(before, action.choiceId);
        else if (pending.kind === 'OVERSTACK_ELIMINATION') current = lifecycle.eliminateForOverstack(before, action.choiceId);
        else if (pending.kind === 'BREAKDOWN_ABSORPTION') {
          const { breakdownId, absorberId } = breakdown.parseAbsorptionChoice(action.choiceId);
          current = breakdown.absorbInto({ ...before, pendingDecision: null }, breakdownId, absorberId).state;
        } else if (pending.transactionId === null && ['ATTRITION_LOSS', 'DISPLACEMENT_HEX'].includes(pending.kind)) {
          current = interrupts.applyInterruptChoice(before, action.choiceId).state;
        } else throw new Error(`Unsupported sequence prefix ${pending.kind}`);
      } else assert.equal(action.kind, 'ADVANCE_SEQUENCE', 'known prefix before lifecycle sampling');
      for (const event of transitions) {
        if (current.interrupts.length) current = interrupts.settleInterrupts(current, null).state;
        assert.equal(current.pendingDecision, null, 'no unresolved choice before sampled lifecycle transition');
        assert.deepEqual(current.sequence, event.from, 'sampled sequence matches real replay');
        sampleEntry(current);
        const step = lifecycle.applySequenceLifecycle(current, event.to);
        const index = applied.events.indexOf(event);
        assert.deepEqual(step.events.map(withoutSequence),
          applied.events.slice(index, index + step.events.length).map(withoutSequence),
          'sampled lifecycle emits exactly the real replay events');
        current = step.state;
        if (event.from.phase === 'SUPPLY') sampleSettlement(current, event.from, before.revision);
        sampleEntry(current);
      }
    }

    function after(before, action, applied) {
      observeSequence(before, action, applied);
      let context = before.pendingDecision?.kind === 'ATTRITION_LOSS' ? 'attrition'
        : before.pendingDecision?.kind === 'OVERSTACK_ELIMINATION' ? 'overstack' : null;
      const transaction = before.activeTransaction ?? applied.state.activeTransaction;
      const transactionCause = { COMBAT: 'combat', OVERRUN: 'overrun', BARRAGE: 'barrage' }[transaction?.kind]
        ?? ({ DECLARE_COMBAT: action.combatKind === 'OVERRUN' ? 'overrun' : 'combat', DECLARE_BARRAGE: 'barrage' }[action.kind]) ?? 'other';
      let turn = before.sequence.gameTurn;
      for (const event of applied.events) {
        if (event.kind === 'SEQUENCE_ADVANCED') { turn = event.from.gameTurn; context = null; }
        if (event.kind === 'ATTRITION_ROLLED') context = 'attrition';
        if (event.kind === 'DECISION_REQUESTED') {
          context = event.decision.kind === 'ATTRITION_LOSS' ? 'attrition'
            : event.decision.kind === 'OVERSTACK_ELIMINATION' ? 'overstack' : null;
        }
        if (event.kind !== 'STEP_LOST') continue;
        const p = before.pieceState.pieces.find((p) => p.id === event.pieceId)
          ?? applied.state.pieceState.pieces.find((p) => p.id === event.pieceId);
        assert(p, 'every lost piece has an owner');
        const cause = context ?? transactionCause;
        observations[p.ownerId].lossCauses.total[cause]++;
        if (turn <= cutoffTurn) observations[p.ownerId].lossCauses.early[cause]++;
      }
    }

    function finish(cutoff, final) {
      const output = {};
      for (const id of players) {
        const other = players.find((p) => p !== id);
        const data = observations[id];
        const entry = data.entry;
        const lossTotal = sum(Object.values(data.lossCauses.total));
        const enemyTotal = sum(Object.values(observations[other].lossCauses.total));
        assert.equal(lossTotal, record.sides[sideOf(id)].stepsLost, 'STEP_LOST reconciles with summary');
        assert.equal(enemyTotal, record.sides[sideOf(id)].stepsKilled, 'enemy STEP_LOST reconciles with summary');
        const expectedTurns = Array.from({ length: initial.configuration.turnLimit }, (_, i) => i + 1);
        const missingTurns = expectedTurns.filter((turn) => !data.settlements.some((s) => s.turn === turn));
        assert.deepEqual(missingTurns, [], 'every configured Supply settlement must be observed');
        const earlySamples = data.settlements.filter((s) => s.turn <= cutoffTurn);
        const futureSamples = data.settlements.filter((s) => s.turn > cutoffTurn);
        const burden = (samples) => samples.length && data.initialReTicks > 0
          ? sum(samples.map((s) => s.burden)) / samples.length : null;
        const values = (period, samples) => ({
          lossEvents: sum(Object.values(data.lossCauses[period])),
          enemyLossEvents: sum(Object.values(observations[other].lossCauses[period])),
          combatLossEvents: combatCount(data.lossCauses[period]),
          enemyCombatLossEvents: combatCount(observations[other].lossCauses[period]),
          attritionLossEvents: data.lossCauses[period].attrition,
          supplyBurden: burden(samples),
        });
        const remainingReTicks = ticks(cutoff, consumers(cutoff, id));
        output[sideOf(id)] = {
          schemaVersion: 1, cutoffTurn, turnLimit: initial.configuration.turnLimit, finalGameTurn: final.sequence.gameTurn,
          metrics: {
            supplyTraceGap: entry ? ratio(entry.traceGapReTicks, data.initialReTicks) : null,
            supplyIndividualGap: entry ? ratio(entry.individualGapReTicks, data.initialReTicks) : null,
            supplyJointGap: entry && !entry.searchExhausted ? ratio(entry.jointGapReTicks, data.initialReTicks) : null,
            supplySingleSourceDependence: entry ? ratio(entry.singleSourceDependenceReTicks, data.initialReTicks) : null,
            remainingReShare: ratio(remainingReTicks, data.initialReTicks),
          },
          early: values('early', earlySamples), outcomes: values('total', futureSamples),
          supplySamples: { initialReTicks: data.initialReTicks, remainingReTicks, entry,
            entryMissing: !entry, denominatorMissing: data.initialReTicks === 0,
            settlements: data.settlements },
          supplyCoverage: { earlyTurns: earlySamples.map((s) => s.turn), futureTurns: futureSamples.map((s) => s.turn), missingTurns },
          lossCauses: data.lossCauses,
        };
      }
      return output;
    }
    return { before: sampleEntry, after, finish };
  };
}
