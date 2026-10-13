from pathlib import Path
from collections import Counter, defaultdict
import json, gzip, hashlib, statistics, math

root = Path('tmp/ai-match/v19-vp-2026-10-13')
out = Path('docs/quality/evidence/ai-vp-strategy-v19-2026-10-13')
out.mkdir(parents=True, exist_ok=True)
archive, runs, tables = [], [], {}
for group in ['development', 'holdout', 'reference-v17', 'attack']:
    totals, pairs = defaultdict(Counter), defaultdict(list)
    for style in ['temperate', 'eastern', 'mediterranean']:
        directory = root / (group + '-' + style)
        summary = json.load(open(directory / 'summary.json'))
        audit = json.load(open(directory / 'supply-attribution.json'))
        assert len(summary['records']) == len(audit) == 8
        local = defaultdict(Counter)
        for record in audit:
            original = next(x for x in summary['records'] if x['match'] == record['match'])
            assert original['stopReason'] == 'FINISHED' and original['replay']['ok']
            assert original['rejected'] == 0 and not original['errors'] and not record['previewMismatches']
            assert record['finalStateHash'] == original['finalStateHash']
            for side, info in record['sides'].items():
                version = '19' if info['policy'] == 'heuristic' else '17' if group == 'reference-v17' else '18'
                other = record['sides']['axis' if side == 'allied' else 'allied']
                owner = 'player:' + side
                for t in [totals[version], local[version]]:
                    t.update(games=1, vp=info['vp'], kills=info['stepsKilled'], losses=info['stepsLost'])
                    t['draws' if record['winner'] == 'draw' else 'wins' if record['winner'] == side else 'defeats'] += 1
                    t['attritionSteps'] += sum(a['owner'] == owner for a in record['attrition'])
                    t['ownRationTriggerSteps'] += sum(a['owner'] == owner and a['rationCategory'] == 'own-action' for a in record['attrition'])
                    t['traceBreaks'] += sum(b['action']['actorId'] == owner for b in record['relocationTraceBreaks'])
                    t['feedBreaks'] += sum(b['action']['actorId'] == owner for b in record['feedBreaks'])
                    t['spendingViolations'] += sum(b['action']['actorId'] == owner and not b['preserved'] for b in record['rationSpending'])
                pairs[(version, style, original['seeds']['map'])].append(info['vp'] - other['vp'])
        runs.append(dict(group=group, style=style, policies=dict(local)))
        archive.append(dict(group=group, style=style, summary=summary, supply=audit))
    for version, t in totals.items():
        t['meanVp'] = t['vp'] / t['games']
        t['meanKills'] = t['kills'] / t['games']
        t['meanLosses'] = t['losses'] / t['games']
        ps = [statistics.mean(p) for (v, style, seed), p in pairs.items() if v == version]
        assert len(ps) == 12 and all(len(p) == 2 for p in pairs.values())
        t['pairedVpMargin'] = statistics.mean(ps)
        t['pairedSE'] = statistics.stdev(ps) / math.sqrt(len(ps))
        t['pairs'] = len(ps)
    tables[group] = dict(totals)

files = ['src/ai/policies/heuristic.ts', 'src/rules/engine.ts', 'src/rules/replacement/forecast.ts']
for f in files:
    assert Path(f).read_bytes() == (root / 'engine-checkout' / f).read_bytes()
sha = lambda p: hashlib.sha256(Path(p).read_bytes()).hexdigest()
cases = json.load(open(root / 'cases.json'))
case_summary = [{k: c[k] for k in ['name', 'version', 'completed', 'firstOwnSupply', 'victory', 'attritionSteps', 'finalUnfed', 'committedUnfed']} |
                {'firstAction': c['actions'][0], 'paymentTokens': sum(p['tokens'] for p in c['payments'])} for c in cases]
result = dict(
    baseCommit='391140c4c5b679271a410681e3e87e5f2422447a', candidatePolicy='heuristic@19',
    tables=tables, runs=runs, cases=case_summary,
    frozenSourceSha256={f: sha(root / 'engine-checkout' / f) for f in files},
    testSha256=sha('tests/ai/rebuild-strategy.test.ts'),
    fixtureSha256={p.name: sha(p) for p in Path('tests/ai/fixtures').glob('vp-rebuild-*.state.json.gz')},
    frozenPolicyBuildSha256={
        'v19': sha(root / 'engine-checkout/dist/ai/policies/heuristic.js'),
        'v18': sha(root / 'baseline-v18/ai/policies/heuristic.js'),
        'v17': sha(root.parent / 'v18-battles-2026-10-13/baseline-v17/ai/policies/heuristic.js')},
    validation={
        'typecheck': 'passed', 'build': 'passed', 'smoke': 'passed',
        'fullSuite': {'passedFiles': 90, 'passedTests': 646, 'skippedFiles': 4, 'skippedTests': 8, 'durationSeconds': 62.78},
        'afterRejectedExperimentRevert': {'files': 3, 'passedTests': 7, 'durationSeconds': 18.08,
            'command': 'npx vitest run tests/ai/garrison-supply.test.ts tests/ai/vp-capture.test.ts tests/ai/rebuild-strategy.test.ts --maxWorkers=2'},
        'unchangedVpRegressionExpectations': [8, 10],
        'sourceBoundaryInitialFailure': 'Two false positives from rebuild-preview filename matching the existing ui-path regex; renamed to forecast, without relaxing tests.'},
    rejectedExperiment={
        'policy': 'v20 prototype, not shipped', 'sourceSha256': sha(root.parent / 'v20-vp-2026-10-13/rejected-heuristic.ts'),
        'acceptanceFailure': 'Existing legal garrison rescue at 8,5 stopped feeding that garrison in both trial orderings. Policy restored byte-for-byte to frozen v19.'},
    caveats=[
        'The holdout MEETING batch tied on VP; aggregate development improvement was not independently replicated there.',
        'All reported paired standard errors use 12 map-seed pairs; these small samples do not establish statistical superiority.',
        'Both policies use the same frozen latest engine, generator and garrison-stock configuration.',
        'Historical rebuild continuations worsened axis VP by one in two snapshots; these are not independent matches or proof of VP gain.',
        'Guard counts cover existing move/mode individual access and optional fuel/hedgehog shared commitments, not every supply decision.',
        'Own-action ration triggers are transitions, not proof of a mistake or sole cause.',
        'Headless results do not promote UI operation rows; concurrent timings are not latency evidence.'])
(out / 'results.json').write_text(json.dumps(result, ensure_ascii=False, indent=2) + '\n')
for name, data in [('runs.json.gz', archive), ('rebuild-continuations.json.gz', cases)]:
    with gzip.GzipFile(filename=str(out / name), mode='wb', mtime=0) as f:
        f.write(json.dumps(data, separators=(',', ':')).encode())
for name in ['batch.py', 'cases.mjs', 'summarize.py']:
    (out / name).write_bytes((root / name).read_bytes())
print(json.dumps(tables, indent=2))
