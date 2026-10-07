#!/usr/bin/env node
// Per-step summary of the heuristic seat in one ai-match trace (scripts/ai-match.mjs --trace): node scripts/ai-narrate.mjs <match-N.trace.jsonl>
import { readFileSync } from 'node:fs';
const lines = readFileSync(process.argv[2], 'utf8').trim().split('\n').map(JSON.parse).filter((t) => t.policy.startsWith('heuristic'));
const byStep = new Map();
for (const t of lines) {
  const key = t.stepKey; const list = byStep.get(key) ?? []; list.push(t); byStep.set(key, list);
}
for (const [key, list] of byStep) {
  const kinds = {}; for (const t of list) kinds[t.action.kind] = (kinds[t.action.kind] ?? 0) + 1;
  const notable = list.filter((t) => /regular|overrun|barrage|unload|load|rebuild|hold|capture|hunt|answer|advance:|defender|option|retreat|safest|cheapest|first-player|supply-source/.test(t.intent) || t.kind === 'DECISION' || t.action.kind === 'DECLARE_COMBAT');
  console.log(`${key}  ${Object.entries(kinds).map(([k, v]) => `${k}×${v}`).join(' ')}`);
  for (const t of notable.slice(0, 8)) console.log(`     ${t.intent.slice(0, 150)}`);
  const moves = list.filter((t) => t.action.kind === 'MOVE_PIECE').map((t) => t.intent.replace(/^combat to /, '').slice(0, 40));
  if (moves.length) console.log(`     moves: ${moves.slice(0, 10).join(' | ')}${moves.length > 10 ? ' …' : ''}`);
}
