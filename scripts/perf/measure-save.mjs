// Per-action persistence cost as the Undo stack fills: the save written after every accepted action carries
// every checkpoint's snapshot, so this times hashGameState, serializeGameState, createCheckpoint and
// serializeSave with 0..30 checkpoints (the UI keeps up to 30 Undo points plus one automatic one).
// Usage: npm run build && node scripts/perf/measure-save.mjs [WxH]
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { performance } from 'node:perf_hooks';

const lib = await import(`${pathToFileURL(resolve(process.env.PERF_DIST ?? 'dist')).href}/index.js`);
const [width, height] = (process.argv[2] ?? '64x48').split('x').map(Number);
const created = await lib.createNewGameOrchestrator(lib.createGameplayEngine(lib.createMemoryGameplayPorts()))
  .create({ ...lib.DEFAULT_NEW_GAME_REQUEST, map: { ...lib.DEFAULT_NEW_GAME_REQUEST.map, width, height } });
if (!created.ok) throw new Error(JSON.stringify(created.error).slice(0, 300));
const { session } = created.value;
const state = lib.parseGameStateJson(JSON.parse(session.serializeSave()).currentSnapshot).value;
const median = (fn, runs = 5) => { const t = []; for (let i = 0; i < runs; i += 1) { const s = performance.now(); fn(); t.push(performance.now() - s); } t.sort((a, b) => a - b); return t[Math.floor(runs / 2)]; };
const medianAsync = async (fn, runs = 5) => { const t = []; for (let i = 0; i < runs; i += 1) { const s = performance.now(); await fn(); t.push(performance.now() - s); } t.sort((a, b) => a - b); return t[Math.floor(runs / 2)]; };
console.log(`${width}x${height}: hashGameState ${(await medianAsync(() => lib.hashGameState(state))).toFixed(1)} ms, serializeGameState ${median(() => lib.serializeGameState(state)).toFixed(1)} ms, getView ${median(() => session.getView(created.value.bindings[0].seatId)).toFixed(2)} ms`);
for (let checkpoints = 0; checkpoints <= 30; checkpoints += 1) {
  if (checkpoints > 0) session.createCheckpoint(`perf ${checkpoints}`);
  if (checkpoints % 5 !== 0) continue;
  let bytes = 0;
  const ms = median(() => { bytes = session.serializeSave().length; }, 3);
  console.log(`checkpoints ${String(checkpoints).padStart(2)}: serializeSave ${ms.toFixed(1).padStart(7)} ms, ${(bytes / 1e6).toFixed(1)} MB; createCheckpoint ${median(() => { const c = session.createCheckpoint('x'); session.removeCheckpoint(c.id); }, 3).toFixed(1)} ms`);
}
