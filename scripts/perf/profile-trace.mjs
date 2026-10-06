// Cold Trace Supply overlay queries on one opening state, for `node --cpu-prof` (then summarize-cpuprofile.mjs).
// Usage: node --cpu-prof --cpu-prof-dir=<dir> scripts/perf/profile-trace.mjs WxH[:divisions] [runs=10]
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { performance } from 'node:perf_hooks';

const dist = pathToFileURL(resolve(process.env.PERF_DIST ?? 'dist')).href;
const lib = await import(`${dist}/index.js`);
const [spec, runsText] = process.argv.slice(2);
const [size, divisionsText] = spec.split(':');
const [width, height] = size.split('x').map(Number);
const base = lib.DEFAULT_NEW_GAME_REQUEST;
const request = { ...base, map: { ...base.map, width, height }, oob: { ...base.oob, divisionsPerSide: Number(divisionsText ?? base.oob.divisionsPerSide) } };
const prepared = lib.prepareNewGame(request);
if (!prepared.ok) throw new Error(JSON.stringify(prepared.error).slice(0, 300));
const state = lib.createInitialGameState(prepared.value.scenario, prepared.value.configuration, 7).value;
const actor = state.scenario.players[0].id;
const times = [];
for (let i = 0; i < Number(runsText ?? 10); i += 1) {
  const started = performance.now();
  lib.queryTraceCoverage({ ...state }, actor, null);
  times.push(performance.now() - started);
}
console.log(spec, 'cold overlay ms', times.map((t) => Math.round(t)).join(' '));
