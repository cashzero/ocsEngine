#!/usr/bin/env python3
"""Apply a registered position-metric confirmation's pass rule (docs/roadmap/18-position-metrics-wbs.md, P7).

    python3 scripts/ai-position-confirm.py <registration.json> <validation.json> <final.json> [--out <verdicts.json>]

validation.json and final.json are the prospective outputs of ai-position-validate.py and ai-position-final.py named in
the registration. Each hypothesis is judged in each registered subset or Game Turn exactly as the registration's
measure says: R2 needs the interval of the out-of-sample R2 gain above 0; MAE needs every interval of the listed bucket
model's MAE gain (over zero, training median and the baseline's buckets) above 0, or for a final-result hypothesis the
MAE gain interval above 0; "or" accepts either.
"""
import json
import sys


def above(interval):
    return interval is not None and interval[0] > 0


def near_term(test, measure):
    intervals = test.get('intervals')
    if not intervals:
        return False, {'status': test.get('status')}
    r2 = above(intervals['r2Gain95'])
    fixed = all(above(value) for value in intervals['metricBucketMedianMaeGain95'].values())
    quintile = all(above(value) for value in intervals['metricQuantileMedianMaeGain95'].values())
    passes = {'R2': r2, 'R2 or MAE (fixed buckets)': r2 or fixed,
              'R2 or MAE (fixed buckets or quintile bins)': r2 or fixed or quintile}[measure]
    return passes, {'nRows': test['evaluated']['nRows'], 'r2Gain': test['r2Gain'], 'r2Gain95': intervals['r2Gain95'],
                    'maeFixedBuckets': fixed, 'maeQuintileBins': quintile}


def main():
    args = sys.argv[1:]
    out = args[args.index('--out') + 1] if '--out' in args else None
    registration, validation, final = (json.load(open(path)) for path in args[:3])
    verdicts = []
    for hypothesis in registration['hypotheses']:
        if 'test' in hypothesis:
            target, metric, baseline = hypothesis['test']
            for subset in hypothesis['subsets']:
                test = next(t for t in validation['prospective'][subset]
                            if (t['target'], t['metric'], t['baseline']) == (target, metric, baseline))
                passed, detail = near_term(test, hypothesis['measure'])
                verdicts.append({'id': hypothesis['id'], 'where': subset, 'passed': passed, **detail})
        else:
            for turn in hypothesis['gameTurns']:
                gain = final['results'][f"{hypothesis['engagement']} Game Turn {turn}"]['gains'][hypothesis['final']]
                interval = gain['r2Gain95'] if hypothesis['measure'] == 'R2' else gain['maeGain95']
                verdicts.append({'id': hypothesis['id'], 'where': f'Game Turn {turn}', 'passed': above(interval),
                                 'gain': gain['r2Gain'] if hypothesis['measure'] == 'R2' else gain['maeGain'], 'gain95': interval})
    for verdict in verdicts:
        detail = (f"R2 {verdict['r2Gain']:+.3f} [{verdict['r2Gain95'][0]:+.3f}, {verdict['r2Gain95'][1]:+.3f}] MAE fixed {verdict['maeFixedBuckets']} quintile {verdict['maeQuintileBins']}"
                  if 'r2Gain95' in verdict else f"gain {verdict['gain']:+.3f} [{verdict['gain95'][0]:+.3f}, {verdict['gain95'][1]:+.3f}]" if 'gain95' in verdict else str(verdict))
        print(f"{verdict['id']:4} {verdict['where']:16} {'PASS' if verdict['passed'] else 'fail'}  {detail}")
    if out:
        json.dump(verdicts, open(out, 'w'), indent=1)


if __name__ == '__main__':
    main()
