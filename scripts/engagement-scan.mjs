#!/usr/bin/env node
// Seed scan of generated engagements (docs/roadmap/13-engagement-scenarios-wbs.md, SCN-R1 to R3). Build first: `npm run build`.
//
//   node scripts/engagement-scan.mjs --engagement MEETING --seeds 100 --trace          # gaps and per-unit trace supply
//   node scripts/engagement-scan.mjs --engagement AXIS_ATTACKS --seeds 1000 --scale LARGE --divisions 10 --armored 4
//
// Every seed set follows ai-match (0x0a1b0000 + index * 97). Prints failures, warning kinds, the distance from each ground
// unit to the nearest enemy one, and with --trace the share of each side's units in their own trace supply at the start.
import { join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const root = resolve(fileURLToPath(new URL('..', import.meta.url)));
const m = await import(pathToFileURL(join(root, 'dist', 'index.js')).href);
const options = { engagement: 'MEETING', seeds: 100, start: 0, trace: false, style: null, scale: null, divisions: null, armored: null, size: null };
const argv = process.argv.slice(2);
for (let index = 0; index < argv.length; index += 1) {
  const value = () => argv[++index];
  switch (argv[index]) {
    case '--engagement': options.engagement = value(); break;
    case '--seeds': options.seeds = Number(value()); break;
    case '--start': options.start = Number(value()); break;
    case '--trace': options.trace = true; break;
    case '--style': options.style = value(); break;
    case '--scale': options.scale = value(); break;
    case '--divisions': options.divisions = Number(value()); break;
    case '--armored': options.armored = Number(value()); break;
    case '--size': options.size = value().split('x').map(Number); break;
    default: throw new Error(`Unknown option ${argv[index]}`);
  }
}
const defaults = m.DEFAULT_NEW_GAME_REQUEST;
const failures = [];
const warnings = new Map();
const minimums = [];
const medians = [];
const traced = [];
let generated = 0;
for (let index = options.start; index < options.start + options.seeds; index += 1) {
  const base = 0x0a1b0000 + index * 97;
  const request = {
    ...defaults, engagement: options.engagement,
    map: { ...defaults.map, ...(options.style ? { style: options.style } : {}), ...(options.size ? { width: options.size[0], height: options.size[1] } : {}) },
    oob: { ...defaults.oob, ...(options.scale ? { scale: options.scale } : {}), ...(options.divisions ? { divisionsPerSide: options.divisions } : {}),
      ...(options.armored !== null ? { armoredDivisionsPerSide: options.armored } : {}) },
    seeds: { map: base + 1, oob: base + 2, deployment: base + 3, rules: base + 4 },
  };
  let prepared;
  try { prepared = m.prepareNewGame(request); } catch (error) { failures.push({ index, error: String(error) }); continue; }
  if (!prepared.ok) { failures.push({ index, error: prepared.error.map(({ code, message }) => `${code}: ${message}`).join('; ') }); continue; }
  const repeat = m.prepareNewGame(request);
  if (!repeat.ok || JSON.stringify(repeat.value.scenario) !== JSON.stringify(prepared.value.scenario)) failures.push({ index, error: 'not deterministic' });
  generated += 1;
  for (const warning of prepared.value.warnings) {
    const kind = warning.replace(/\d+/g, '#');
    warnings.set(kind, (warnings.get(kind) ?? 0) + 1);
  }
  const created = m.createInitialGameState(prepared.value.scenario, prepared.value.configuration, 1);
  if (!created.ok) { failures.push({ index, error: 'initial state invalid' }); continue; }
  const state = created.value;
  const garrisons = new Set(prepared.value.generatedOob.sides.map(({ garrisonDefinitionId }) => garrisonDefinitionId));
  const families = new Map(state.scenario.pieceCatalog.definitions.map(({ id, family }) => [id, family]));
  const army = (side) => state.pieceState.pieces.filter((piece) => String(piece.ownerId) === `player:${side}` && piece.location.kind === 'ON_MAP'
    && piece.remainingSteps !== null && families.get(piece.definitionId) === 'GROUND' && !garrisons.has(piece.definitionId));
  const allied = army('allied');
  const axis = army('axis');
  const nearest = (piece, others) => Math.min(...others.map((other) => m.hexDistanceBetween(piece.location.hexId, other.location.hexId)));
  const gaps = [...allied.map((piece) => nearest(piece, axis)), ...axis.map((piece) => nearest(piece, allied))].sort((left, right) => left - right);
  minimums.push(gaps[0]);
  medians.push(gaps[Math.floor(gaps.length / 2)]);
  if (options.trace) {
    for (const units of [allied, axis]) {
      const ok = units.filter((piece) => m.ruleEngine.queryTraceCoverage(state, piece.ownerId, piece.id).value.hexIds.includes(piece.location.hexId)).length;
      traced.push({ index, side: String(units[0]?.ownerId), share: ok / units.length });
    }
  }
}
const spread = (values) => {
  const sorted = [...values].sort((left, right) => left - right);
  return sorted.length === 0 ? 'none' : `min ${sorted[0]} · median ${sorted[Math.floor(sorted.length / 2)]} · max ${sorted.at(-1)}`;
};
console.log(`${options.engagement} ${JSON.stringify({ style: options.style, scale: options.scale, divisions: options.divisions, armored: options.armored, size: options.size })}`);
console.log(`seeds ${options.start}..${options.start + options.seeds - 1}: ${generated} generated, ${failures.length} failures`);
for (const failure of failures.slice(0, 10)) console.log(`  failure ${failure.index}: ${failure.error}`);
console.log(`warnings: ${JSON.stringify(Object.fromEntries(warnings))}`);
console.log(`nearest enemy, smallest per game: ${spread(minimums)}`);
console.log(`nearest enemy, median per game: ${spread(medians)}`);
if (options.trace) {
  const shares = traced.map(({ share }) => share);
  console.log(`sides in own trace at start: ${spread(shares.map((share) => Math.round(100 * share)))} %; below 95%: ${traced.filter(({ share }) => share < 0.95).map(({ index, side, share }) => `${index}/${side.slice(7)} ${Math.round(100 * share)}%`).join(', ') || 'none'}`);
}
process.exitCode = failures.length > 0 ? 1 : 0;
