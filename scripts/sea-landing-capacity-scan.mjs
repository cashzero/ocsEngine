#!/usr/bin/env node
// Structural capacity census, not a played balance test. Build first.
// node scripts/sea-landing-capacity-scan.mjs artifacts/sea-balance/capacity.json
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';
import * as m from '../dist/index.js';
const out = process.argv[2];
if (!out) throw new Error('Expected output JSON path');
const rows = [];
for (const [width, height] of [[18, 12], [32, 24], [64, 48]]) {
  for (const divisions of [2, 4, 6, 10]) for (const armored of [0, Math.min(2, divisions)]) for (const scale of ['COMPACT', 'LARGE']) {
    const request = { ...m.DEFAULT_NEW_GAME_REQUEST, engagement: 'ALLIED_ATTACKS',
      map: { ...m.DEFAULT_NEW_GAME_REQUEST.map, width, height, sea: 'FLANK' },
      oob: { ...m.DEFAULT_NEW_GAME_REQUEST.oob, scale, divisionsPerSide: divisions, armoredDivisionsPerSide: armored },
      inlandEntry: { allied: false, axis: true }, seaCap: { allied: 5, axis: 0 } };
    const prepared = m.prepareNewGame(request);
    if (!prepared.ok) { rows.push({ width, height, divisions, armored, scale, errors: prepared.error.map(e => e.code) }); continue; }
    const p = prepared.value;
    const attackerDivisions = m.sideDivisions({ ...request.oob, attacker: 'ALLIED' }, 'ALLIED').divisionsPerSide;
    let meanIncomeT = 0;
    for (let die1 = 1; die1 <= 6; die1++) for (let die2 = 1; die2 <= 6; die2++) {
      const roll = die1 + die2;
      const row = m.BTR_SUPPLY_TABLE.find(row => row.minimum <= roll && row.maximum >= roll);
      meanIncomeT += row.points[Math.min(12, attackerDivisions) - 1] * 4 / 36;
    }
    const ports = p.scenario.initialMapState.features.filter(f => f.definitionId === 'facility:port' && f.controllerId === m.GENERATED_PLAYERS.ALLIED);
    const initialSupplyT = p.scenario.initialPieceState.pieces.filter(piece => piece.ownerId === m.GENERATED_PLAYERS.ALLIED && piece.location.kind === 'ON_MAP')
      .reduce((n, piece) => n + (piece.resourceQuantity ?? 0), 0);
    const initialPortT = ports.reduce((n, f) => n + f.level, 0);
    rows.push({ width, height, divisions, armored, scale, attackerDivisions,
      totalPorts: p.generatedMap.strategicRegions.ports.length, attackerPorts: ports.length, initialPortT,
      seaCap: 5, maxInitialLandT: Math.min(initialPortT, 20), meanIncomeT, initialSupplyT,
      warnings: p.warnings, objectives: p.configuration.objectives.length,
      attackGoal: p.configuration.attackVictory.attackerPoints });
  }
}
mkdirSync(dirname(out), { recursive: true });
writeFileSync(out, JSON.stringify({ inputs: 'Default seeds, Allied attack, flank sea, ports only, Sea Cap 5/0; no matches played.', rows }, null, 2));
console.log(`Capacity census: ${rows.length} requests, ${rows.filter(r => r.errors).length} generation failures; ${out}`);
