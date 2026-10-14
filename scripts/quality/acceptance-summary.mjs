// Counts the rows of docs/quality/03-product-operation-verification-plan.md by the leading word of their Status cell.
// Usage: node scripts/quality/acceptance-summary.mjs [--list]
import { readFileSync } from 'node:fs';

const plan = readFileSync(new URL('../../docs/quality/03-product-operation-verification-plan.md', import.meta.url), 'utf8');
const groups = new Map();
for (const line of plan.split('\n')) {
  const cells = line.split('|').map((cell) => cell.trim());
  if (cells.length < 7 || !/^[A-Z]+-[A-Z]?\d+[a-z]?$/.test(cells[1])) continue;
  const status = cells[5].match(/^(PASS|FAIL|BLOCKED|UNAVAILABLE|UNVERIFIED|IN PROGRESS)/)?.[1] ?? 'OTHER (read the row)';
  groups.set(status, [...(groups.get(status) ?? []), cells[1]]);
}
let total = 0;
for (const [status, ids] of groups) {
  total += ids.length;
  console.log(`${status.padEnd(22)} ${String(ids.length).padStart(3)}${process.argv.includes('--list') ? `  ${ids.join(', ')}` : ''}`);
}
console.log(`${'TOTAL'.padEnd(22)} ${String(total).padStart(3)}`);
