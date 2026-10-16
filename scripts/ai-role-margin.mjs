#!/usr/bin/env node
// Attacker and defender effects of a candidate policy, apart (docs/ai/evaluation.md).
//
//   node scripts/ai-role-margin.mjs <baseline dir> <candidate dir> [<baseline dir> <candidate dir> ...]
//
// In a paired attack batch the candidate's attacker meets the opponent's defender and the opponent's attacker meets the
// candidate's defender, so neither side's VP alone measures either role. Each candidate directory is an AXIS_ATTACKS
// ai-match batch against the opponent policy; its baseline is the same seeds and --swap with the opponent policy on both
// sides. Per game, the attacker margin (attacker VP minus defender VP) is compared with the baseline game of the same match
// index: where the candidate attacks, its change; where it defends, the change in the opponent's attacker margin, negated.
// Positive means the candidate did better in that role than the opponent policy does against itself.
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const args = process.argv.slice(2);
if (args.length === 0 || args.length % 2 !== 0) throw new Error('usage: ai-role-margin.mjs <baseline dir> <candidate dir> [...]');
const records = (dir) => JSON.parse(readFileSync(join(dir, 'summary.json'), 'utf8')).records;
const attackerMargin = (record, attacker) => record.sides[attacker].vp - record.sides[attacker === 'axis' ? 'allied' : 'axis'].vp;
const attacking = [];
const defending = [];
for (let index = 0; index < args.length; index += 2) {
  const baseline = new Map(records(args[index]).map((record) => [record.match, record]));
  for (const record of records(args[index + 1])) {
    const base = baseline.get(record.match);
    if (!base) continue;
    // AXIS_ATTACKS: the Axis attacks; the opponent policy is the one the baseline played on both sides.
    const opponent = base.sides.axis.policy;
    if (record.sides.axis.policy !== opponent) attacking.push(attackerMargin(record, 'axis') - attackerMargin(base, 'axis'));
    else if (record.sides.allied.policy !== opponent) defending.push(attackerMargin(base, 'axis') - attackerMargin(record, 'axis'));
  }
}
const describe = (values) => {
  if (values.length < 2) return `n ${values.length}`;
  const mean = values.reduce((total, value) => total + value, 0) / values.length;
  const sd = Math.sqrt(values.reduce((total, value) => total + (value - mean) ** 2, 0) / (values.length - 1));
  return `${mean.toFixed(2)} ± ${(sd / Math.sqrt(values.length)).toFixed(2)} (n ${values.length})`;
};
console.log(`candidate attacking: attacker margin change ${describe(attacking)}`);
console.log(`candidate defending: change in the opponent's attacker margin, negated ${describe(defending)}`);
