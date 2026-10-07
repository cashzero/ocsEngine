#!/usr/bin/env node
// Air missions per game and side in an ai-match output directory (docs/roadmap/13-engagement-scenarios-wbs.md §6, AIR-OM4).
//   node scripts/ai-air-count.mjs <ai-match output dir>
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
const dir = process.argv[2];
if (!dir) { console.error('usage: node scripts/ai-air-count.mjs <dir>'); process.exit(2); }
const summary = JSON.parse(readFileSync(join(dir, 'summary.json'), 'utf8'));
const rows = [];
for (const record of summary.records) {
  const save = JSON.parse(readFileSync(join(dir, `match-${record.match}.save.json`), 'utf8'));
  const count = {};
  for (const action of save.acceptedActions) {
    if (action.kind !== 'DECLARE_AIR_MISSION') continue;
    const key = `${String(action.actorId).slice(7)} ${action.mission}`;
    count[key] = (count[key] ?? 0) + 1;
  }
  rows.push({ match: record.match, winner: record.winner, engagement: record.summary?.engagement, ...count });
}
console.table(rows);
