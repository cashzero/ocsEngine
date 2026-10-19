#!/usr/bin/env node
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { basename, dirname } from 'node:path';

const digest = bytes => createHash('sha256').update(bytes).digest('hex');
const total = terms => {
  assert.ok(Array.isArray(terms), 'Score terms must be an array');
  for (const term of terms) assert.ok(typeof term.term === 'string' && Number.isFinite(term.value), 'Invalid score term');
  return terms.reduce((sum, term) => sum + term.value, 0);
};
const byTerm = terms => {
  const values = new Map();
  for (const { term, value } of terms) values.set(term, (values.get(term) ?? 0) + value);
  return values;
};
const crossings = (candidate, stay) => {
  const margin = total(candidate) - total(stay);
  if (margin > 0) return [];
  const left = byTerm(candidate), right = byTerm(stay);
  return [...new Set([...left.keys(), ...right.keys()])].flatMap(term => {
    const comparativeTerm = (left.get(term) ?? 0) - (right.get(term) ?? 0);
    const marginWithoutTerm = margin - comparativeTerm;
    return marginWithoutTerm > 0 ? [{ term, margin, comparativeTerm, marginWithoutTerm }] : [];
  });
};
const empty = () => ({ groups: 0, scored: 0, improving: 0, notImproving: 0,
  correctionEligible: 0, correctionChecked: 0, correctionApplied: 0, correctionRefused: 0, correctionBudget: 0, notEligible: 0,
  supplyChecked: 0, supplyPreserved: 0, supplyRefused: 0, supplySkippedAfterSelection: 0, selected: 0,
  noImprovingGroups: 0, allImprovingSupplyRefusedGroups: 0, groupsWithSupplyRefusal: 0, supplyRefusedButSelectedGroups: 0 });
const rateDefinitions = {
  improvingFraction: ['improving', 'scored'],
  correctionCheckedFraction: ['correctionChecked', 'correctionEligible'],
  correctionAppliedFraction: ['correctionApplied', 'correctionChecked'],
  supplyRefusedFraction: ['supplyRefused', 'supplyChecked'],
  supplySkippedFraction: ['supplySkippedAfterSelection', 'improving'],
  supplyExhaustionGroupFraction: ['allImprovingSupplyRefusedGroups', 'groups'],
  noImprovingGroupFraction: ['noImprovingGroups', 'groups'],
  refusalRecoveredGroupFraction: ['supplyRefusedButSelectedGroups', 'groupsWithSupplyRefusal'],
};
const emptyRates = () => Object.fromEntries(Object.keys(rateDefinitions).map(key => [key, { sum: 0, groups: 0 }]));
const addRates = (rates, counts) => {
  for (const [key, [numerator, denominator]] of Object.entries(rateDefinitions)) {
    if (counts[denominator] === 0) continue;
    rates[key].sum += counts[numerator] / counts[denominator]; rates[key].groups++;
  }
};
const finishRates = (rates, counts) => Object.fromEntries(Object.entries(rateDefinitions).map(([key, [numerator, denominator]]) => [key, {
  pooled: counts[denominator] === 0 ? null : counts[numerator] / counts[denominator],
  equalGroupMean: rates[key].groups === 0 ? null : rates[key].sum / rates[key].groups,
  groupsWithDenominator: rates[key].groups,
}]));
const options = {};
for (let index = 2; index < process.argv.length; index++) {
  const flag = process.argv[index];
  if (flag === '--self-test') { options.selfTest = true; continue; }
  assert.ok(['--input', '--summary', '--out'].includes(flag), `Unknown option ${flag}`);
  const value = process.argv[++index];
  assert.ok(value && !value.startsWith('--'), `Missing value for ${flag}`);
  options[flag.slice(2)] = value;
}
if (options.selfTest) {
  const terms = values => Object.entries(values).map(([term, value]) => ({ term, value }));
  assert.deepEqual(crossings(terms({ progress: 5, exposure: -4 }), terms({ progress: 3, exposure: -1 })),
    [{ term: 'exposure', margin: -1, comparativeTerm: -3, marginWithoutTerm: 2 }]);
  assert.deepEqual(crossings(terms({ progress: 2, exposure: -5 }), terms({ progress: 3, exposure: -5 })), []);
  assert.deepEqual(crossings(terms({ progress: 3, exposure: -1 }), terms({ progress: 3 })), []);
  assert.equal(total([{ term: 'x', value: 2 }, { term: 'x', value: 3 }]), 5);
  assert.throws(() => total([{ term: 'x', value: NaN }]), /Invalid score term/);
  const rateControl = emptyRates();
  addRates(rateControl, { ...empty(), groups: 1, scored: 2, improving: 1 });
  addRates(rateControl, { ...empty(), groups: 1, scored: 8, improving: 7 });
  addRates(rateControl, { ...empty(), groups: 1 });
  assert.deepEqual(finishRates(rateControl, { ...empty(), groups: 3, scored: 10, improving: 8 }).improvingFraction,
    { pooled: 0.8, equalGroupMean: 0.6875, groupsWithDenominator: 2 });
  console.log('Comparative term deletion, common penalties, strict stay boundary and finite-score controls passed');
} else {
  assert.ok(options.input && options.summary && options.out, 'Use --input <payload.json> --summary <equivalence-summary.json> --out <report.json>');
  const bytes = readFileSync(options.input), summaryBytes = readFileSync(options.summary);
  const summary = JSON.parse(summaryBytes), inputHash = digest(bytes);
  assert.equal(summary.hashes?.[basename(options.input, '.json')], inputHash, 'Input is not bound to the supplied equivalence summary');
  const input = JSON.parse(bytes);
  assert.ok(Array.isArray(input.observations), 'Expected a study payload with observations');
  const all = empty(), purposes = new Map(), targets = new Map(), roles = new Map(), terms = new Map(), rates = emptyRates();
  let queryOnly = 0;
  const decisions = new Set();
  for (const report of input.observations) {
    assert.ok(typeof report.runId === 'string' && Number.isInteger(report.decisionOrdinal), 'Invalid decision identity');
    const identity = JSON.stringify([report.runId, report.decisionOrdinal]);
    assert.ok(!decisions.has(identity), 'Duplicate decision identity');
    decisions.add(identity);
    if (report.coverage === 'QUERY_ONLY') {
      assert.equal(report.schemaVersion, 1);
      assert.ok(report.candidates.every(candidate => candidate.policyEvaluation === 'NOT_INSTRUMENTED'));
      assert.ok(!('movementGroups' in report));
      queryOnly++; continue;
    }
    assert.equal(report.coverage, 'QUERY_AND_MOVEMENT');
    assert.equal(report.schemaVersion, 2);
    assert.ok(Array.isArray(report.movementGroups) && report.movementGroups.length > 0, 'Missing movement groups');
    const candidates = new Map(report.candidates.map(candidate => [candidate.id, candidate]));
    assert.equal(candidates.size, report.candidates.length, 'Duplicate candidate identity');
    for (const group of report.movementGroups) {
      assert.equal(group.conditionCoverage, 'COMPOSITE_ONLY');
      assert.ok(['COMBAT', 'HQ', 'ARTILLERY'].includes(group.role), 'Unknown movement role');
      assert.equal(group.correctionLimit, 12);
      assert.ok(Math.abs(total(group.stay.terms) - group.stay.score) < 1e-9, 'Stay terms do not reconcile');
      const ids = group.candidates.map(row => row.candidateId), membership = new Set(ids);
      assert.equal(ids.length, membership.size, 'Duplicate group candidate');
      for (const id of ids) {
        const candidate = candidates.get(id);
        assert.equal(candidate?.policyEvaluation, 'MOVEMENT_DESTINATION');
        assert.equal(candidate.action.kind, 'MOVE_PIECE');
        assert.equal(candidate.action.pieceId, group.pieceId);
        assert.equal(candidate.action.path[0], group.stay.origin);
      }
      for (const order of [group.correctionEligibleOrder, group.correctionCheckedOrder, group.improvingOrder, group.supplyCheckedOrder]) {
        assert.equal(new Set(order).size, order.length, 'Duplicate visit identity');
        assert.ok(order.every(id => membership.has(id)), 'Visit is outside scored group');
      }
      assert.deepEqual(group.correctionCheckedOrder, group.correctionEligibleOrder.slice(0, 12), 'Correction cap/order mismatch');
      assert.deepEqual(group.supplyCheckedOrder, group.improvingOrder.slice(0, group.supplyCheckedOrder.length), 'Supply checks are not the improving prefix');
      const eligible = new Set(group.correctionEligibleOrder), checked = new Set(group.correctionCheckedOrder);
      const improving = new Set(group.improvingOrder), supply = new Set(group.supplyCheckedOrder);
      const counts = empty(); counts.groups = 1; counts.scored = ids.length;
      counts.correctionEligible = eligible.size; counts.correctionChecked = checked.size;
      counts.supplyChecked = supply.size; counts.improving = improving.size;
      const crossed = new Map();
      for (const row of group.candidates) {
        const id = row.candidateId;
        const retained = row.retainedTerms;
        assert.ok(Math.abs(total(row.baseTerms) - row.baseScore) < 1e-9, 'Base score does not reconcile');
        assert.ok(Math.abs(total(retained) - row.retainedScore) < 1e-9, 'Retained score does not reconcile');
        if (checked.has(id)) {
          assert.equal(row.correction.status, 'EVALUATED');
          assert.equal(typeof row.correction.applied, 'boolean');
          assert.deepEqual(retained, row.correction.retainedTerms);
          assert.equal(row.correction.allowed, row.correction.explanation.allowed);
          if (row.correction.applied) counts.correctionApplied++;
          else { counts.correctionRefused++; assert.deepEqual(retained, row.baseTerms); }
        } else {
          assert.equal(row.correction.status, 'NOT_EVALUATED');
          assert.deepEqual(retained, row.baseTerms);
          assert.equal(row.correction.reason, eligible.has(id) ? 'CORRECTION_BUDGET' : 'NOT_ELIGIBLE');
          if (eligible.has(id)) counts.correctionBudget++; else counts.notEligible++;
        }
        assert.equal(total(retained) > group.stay.score, improving.has(id), 'Improving membership disagrees with actual retained terms');
        if (!improving.has(id)) counts.notImproving++;
        if (supply.has(id)) {
          assert.equal(row.finalSupply.status, 'EVALUATED');
          assert.equal(typeof row.finalSupply.preserved, 'boolean');
          if (row.finalSupply.preserved) {
            counts.supplyPreserved++;
            assert.equal(id, group.selectedCandidateId);
            assert.equal(id, group.supplyCheckedOrder.at(-1));
          } else counts.supplyRefused++;
        } else {
          assert.equal(row.finalSupply.status, 'NOT_EVALUATED');
          assert.equal(row.finalSupply.reason, improving.has(id) ? 'EARLIER_CANDIDATE_SELECTED' : 'NOT_IMPROVING');
          if (improving.has(id)) counts.supplySkippedAfterSelection++;
        }
        for (const crossing of crossings(retained, group.stay.terms)) crossed.set(crossing.term, (crossed.get(crossing.term) ?? 0) + 1);
      }
      if (group.selectedCandidateId === null) {
        assert.equal(counts.supplyPreserved, 0);
        assert.equal(supply.size, improving.size);
        if (improving.size === 0) counts.noImprovingGroups = 1;
        else counts.allImprovingSupplyRefusedGroups = 1;
      } else {
        counts.selected = 1;
        assert.equal(counts.supplyPreserved, 1);
        assert.equal(report.choice?.candidateId, group.selectedCandidateId, 'Group selection differs from policy choice');
      }
      if (counts.supplyRefused > 0) {
        counts.groupsWithSupplyRefusal = 1;
        if (counts.selected) counts.supplyRefusedButSelectedGroups = 1;
      }
      assert.equal(counts.selected + counts.noImprovingGroups + counts.allImprovingSupplyRefusedGroups, 1);
      const purpose = group.assignedTarget?.purpose ?? 'UNASSIGNED';
      const targetKey = JSON.stringify(group.assignedTarget === null ? null : [purpose, group.assignedTarget.hexId]);
      const perTarget = targets.get(targetKey) ?? { assignedTarget: group.assignedTarget, counts: empty() };
      const perPurpose = purposes.get(purpose) ?? empty();
      const perRole = roles.get(group.role) ?? { counts: empty(), terms: new Map(), rates: emptyRates() };
      for (const key of Object.keys(counts)) {
        all[key] += counts[key]; perPurpose[key] += counts[key]; perRole.counts[key] += counts[key]; perTarget.counts[key] += counts[key];
      }
      purposes.set(purpose, perPurpose); targets.set(targetKey, perTarget);
      addRates(rates, counts); addRates(perRole.rates, counts);
      for (const [term, count] of crossed) {
        const value = terms.get(term) ?? { candidateCrossings: 0, groupsWithCrossings: 0, candidateCrossingsWithoutSelection: 0, groupsWithoutSelection: 0 };
        value.candidateCrossings += count; value.groupsWithCrossings++;
        if (!counts.selected) { value.candidateCrossingsWithoutSelection += count; value.groupsWithoutSelection++; }
        terms.set(term, value);
        const roleValue = perRole.terms.get(term) ?? { candidateCrossings: 0, groupsWithCrossings: 0, candidateCrossingsWithoutSelection: 0, groupsWithoutSelection: 0 };
        roleValue.candidateCrossings += count; roleValue.groupsWithCrossings++;
        if (!counts.selected) { roleValue.candidateCrossingsWithoutSelection += count; roleValue.groupsWithoutSelection++; }
        perRole.terms.set(term, roleValue);
      }
      roles.set(group.role, perRole);
    }
  }
  assert.ok(all.groups > 0, 'No movement observations available');
  const output = { scope: 'Descriptive executed movement gates and algebraic stay-term sensitivity; no VP prediction or causal effect established',
    input: options.input, inputSha256: inputHash, equivalenceSummary: options.summary, summarySha256: digest(summaryBytes),
    decisions: decisions.size, queryOnlyDecisions: queryOnly, counts: all,
    rates: finishRates(rates, all),
    assignedTargetPurposes: Object.fromEntries(purposes), assignedTargets: [...targets.values()],
    byRole: Object.fromEntries([...roles].map(([role, value]) => [role, { counts: value.counts, rates: finishRates(value.rates, value.counts),
      comparativeTermDeletion: Object.fromEntries([...value.terms].sort((a, b) => b[1].candidateCrossings - a[1].candidateCrossings)) }])),
    comparativeTermDeletion: Object.fromEntries([...terms].sort((a, b) => b[1].candidateCrossings - a[1].candidateCrossings)),
    interpretation: 'Term deletion removes the term from both candidate and stay. Crossings overlap and do not imply legality, supply preservation, priority, selection or VP benefit. Candidate/group counts are dependent, not independent trials. Equal-group rates exclude groups with zero denominator and retain that support count; assigned targets are planning identities, not verified objective-control outcomes.',
    predictiveQualification: 'NOT_TESTED' };
  mkdirSync(dirname(options.out), { recursive: true });
  writeFileSync(options.out, `${JSON.stringify(output, null, 2)}\n`);
  console.log(JSON.stringify(output, null, 2));
}
