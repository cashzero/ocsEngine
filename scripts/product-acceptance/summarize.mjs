// Lists every recorded row of the product-acceptance runs under an evidence root (results.json per run folder).
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

const root = process.argv[2] ?? 'docs/quality/evidence/product-2026-10-04';
for (const name of readdirSync(root).sort()) {
  const file = join(root, name, 'results.json');
  if (!existsSync(file)) { console.log(`== ${name}: no results.json`); continue; }
  const { rows = [], errors = [] } = JSON.parse(readFileSync(file, 'utf8'));
  console.log(`== ${name}: ${rows.length} rows, ${errors.length} page errors`);
  for (const row of rows) console.log(`  ${row.status.padEnd(8)} ${row.id}`);
}
