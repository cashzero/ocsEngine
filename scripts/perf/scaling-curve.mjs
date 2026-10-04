// Scaling curve: times each engine and UI-building component on generated games of growing map size (and unit count),
// so the component that becomes the next bottleneck as maps grow can be predicted rather than guessed. Every component
// is timed on its own, on the opening state (Turn 1, first Reinforcement Phase), with per-state caches defeated by a
// shallow state copy so a "cold" query is what the UI pays after any action. Turn 1 is then played headlessly (place every
// arrival, answer decisions with their first option, advance) and every applyAction is timed by the step it ended.
// Usage: npm run build && node scripts/perf/scaling-curve.mjs <outDir> [WxH[:divisions] ...]
// PERF_DIST points at another build, e.g. a measurement-only copy with the 64x48 size cap raised (see the report).
import { mkdir, writeFile } from 'node:fs/promises';
import { performance } from 'node:perf_hooks';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

const dist = pathToFileURL(resolve(process.env.PERF_DIST ?? 'dist')).href;
const lib = await import(`${dist}/index.js`);
const { friendlySupplySources } = await import(`${dist}/rules/supply/supply.js`);
const { queryReachableHexes } = await import(`${dist}/rules/movement/movement.js`);
const art = await import(`${dist}/ui/map-art.js`);
const {
  DEFAULT_NEW_GAME_REQUEST, createGameplayEngine, createMemoryGameplayPorts, generateRandomMap, generateRandomOob, deployGeneratedForces,
  composeGeneratedScenario, validateGeneratedScenarioPackage, GENERATED_PLAYERS, buildGeneratedMapPreview, ruleEngine, hashGameState,
  serializeGameState, parseGameStateJson, applyGameAction,
} = lib;

const out = process.argv[2] ?? 'tmp/perf-scaling';
const configs = (process.argv.length > 3 ? process.argv.slice(3) : ['16x12', '24x18', '32x24', '48x36', '64x48', '80x60', '96x72', '128x96'])
  .map((text) => { const [size, divisions] = text.split(':'); const [width, height] = size.split('x').map(Number); return { width, height, divisions: Number(divisions ?? DEFAULT_NEW_GAME_REQUEST.oob.divisionsPerSide) }; });
await mkdir(out, { recursive: true });

/** Median of up to `runs` timings, fewer when one run already takes over `budgetMs`. */
const time = (fn, runs = 5, budgetMs = 1500) => {
  const times = [];
  for (let i = 0; i < runs; i += 1) {
    const started = performance.now();
    fn();
    times.push(performance.now() - started);
    if (times.reduce((a, b) => a + b, 0) > budgetMs && times.length >= 1) break;
  }
  times.sort((a, b) => a - b);
  return Math.round(times[Math.floor(times.length / 2)] * 10) / 10;
};
const timeAsync = async (fn, runs = 5) => { const times = []; for (let i = 0; i < runs; i += 1) { const s = performance.now(); await fn(); times.push(performance.now() - s); } times.sort((a, b) => a - b); return Math.round(times[Math.floor(times.length / 2)] * 10) / 10; };
/** A shallow copy has a new identity, so WeakMap caches keyed by the state (paths, sources) start cold. */
const fresh = (state) => ({ ...state });

const results = [];
for (const { width, height, divisions } of configs) {
  const label = `${width}x${height}:${divisions}`;
  const request = {
    ...DEFAULT_NEW_GAME_REQUEST, map: { ...DEFAULT_NEW_GAME_REQUEST.map, width, height },
    oob: { ...DEFAULT_NEW_GAME_REQUEST.oob, divisionsPerSide: divisions, armoredDivisionsPerSide: Math.min(DEFAULT_NEW_GAME_REQUEST.oob.armoredDivisionsPerSide, divisions) },
  };
  const row = { label, width, height, divisions, hexes: width * height, ms: {}, facts: {} };
  const t = row.ms;
  try {
    // New Game, stage by stage (the orchestrator's prepareNewGame, then session creation).
    let started = performance.now();
    const map = generateRandomMap({ ...request.map, seed: request.seeds.map });
    t['newgame.map'] = performance.now() - started;
    if (!map.ok) throw new Error(`map: ${JSON.stringify(map.error).slice(0, 200)}`);
    started = performance.now();
    const oob = generateRandomOob({ ...request.oob, seed: request.seeds.oob });
    t['newgame.oob'] = performance.now() - started;
    started = performance.now();
    const deployment = deployGeneratedForces(map.value, oob.value, request.seeds.deployment, GENERATED_PLAYERS);
    t['newgame.deploy'] = performance.now() - started;
    if (!deployment.ok) throw new Error(`deploy: ${JSON.stringify(deployment.error).slice(0, 200)}`);
    started = performance.now();
    const composed = composeGeneratedScenario(request, map.value, oob.value, deployment.value);
    t['newgame.compose'] = performance.now() - started;
    if (!composed.ok) throw new Error(`compose: ${JSON.stringify(composed.error).slice(0, 200)}`);
    started = performance.now();
    const failures = validateGeneratedScenarioPackage(composed.value);
    t['newgame.validate'] = performance.now() - started;
    if (failures.length > 0) throw new Error(`validate: ${JSON.stringify(failures).slice(0, 200)}`);
    const pkg = composed.value;
    const engine = createGameplayEngine(createMemoryGameplayPorts());
    started = performance.now();
    const session = await engine.createSession({ scenario: pkg.scenario, configuration: pkg.configuration, rulesSeed: request.seeds.rules, bindings: pkg.bindings, label });
    session.start();
    t['newgame.session'] = performance.now() - started;

    // New Game preview markup (map part of the SVG the dialog draws) and the theater model the canvas map is built from.
    started = performance.now();
    const preview = buildGeneratedMapPreview(pkg.generatedMap, 32);
    const svg = preview.cells.map((cell) => art.terrainFillHtml(cell, 32)).join('') + art.regionEdgesHtml(preview.cells, 32) + art.hexGridHtml(preview.cells, 32)
      + preview.cells.map((cell) => art.terrainGlyphsHtml(cell, 32)).join('') + art.coastlineHtml(preview.cells, 32) + art.riversHtml(preview.edges, 32, 'generated-edge')
      + art.roadsHtml(preview.edges, preview.cells, 32, 'generated-edge') + art.railsHtml(preview.edges, preview.cells, 32);
    t['ui.previewSvg'] = performance.now() - started;
    row.facts.previewSvgBytes = svg.length;
    t['ui.theaterModel'] = time(() => buildGeneratedMapPreview(pkg.generatedMap, 50), 3);

    const state = parseGameStateJson(JSON.parse(session.serializeSave()).currentSnapshot).value;
    const allied = state.scenario.players[0].id;
    const sources = friendlySupplySources(state, allied);
    const pieces = state.pieceState.pieces;
    row.facts.pieces = pieces.length;
    row.facts.onMap = pieces.filter((p) => p.location.kind === 'ON_MAP').length;
    row.facts.sources = sources.length;
    row.facts.stateBytes = serializeGameState(state).value.length;
    row.facts.saveBytes = session.serializeSave().length;
    row.facts.phase = `${state.sequence.phase} ${state.sequence.actingPlayerId}`;

    // Trace supply.
    t['trace.sources(cold)'] = time(() => friendlySupplySources(fresh(state), allied), 3);
    t['trace.overlay(any unit)'] = time(() => ruleEngine.queryTraceCoverage(fresh(state), allied, null), 3, 4000);
    const unit = pieces.find((p) => p.ownerId === allied && p.location.kind === 'ON_MAP');
    t['trace.overlay(one unit)'] = time(() => ruleEngine.queryTraceCoverage(fresh(state), allied, unit.id), 3, 4000);

    // Reinforcements.
    const actor = state.sequence.actingPlayerId;
    t['reinf.candidates(all)'] = time(() => ruleEngine.getActionCandidates(fresh(state), { actorId: actor, kind: 'PLACE_REINFORCEMENT', pieceId: null, budget: 500 }), 3);
    const placements = ruleEngine.getActionCandidates(state, { actorId: actor, kind: 'PLACE_REINFORCEMENT', pieceId: null, budget: 5000 });
    row.facts.placementCandidates = placements.actions.length;
    const first = placements.actions[0];
    if (first) t['reinf.validate(one)'] = time(() => ruleEngine.validateAction(fresh(state), first), 5);

    // Per-click session overhead.
    t['ui.getActionFamilies'] = time(() => ruleEngine.getActionFamilies(fresh(state), actor), 5);
    t['ui.getView(project+clone)'] = time(() => session.getView(pkg.bindings[0].seatId), 5);
    t['save.hashGameState'] = await timeAsync(() => hashGameState(state), 3);
    t['save.serializeSave'] = time(() => session.serializeSave(), 3);
    t['save.createCheckpoint'] = time(() => { const c = session.createCheckpoint('perf'); session.removeCheckpoint(c.id); }, 3);

    // Movement range of the most mobile on-map unit, and of the same unit in Strat Mode (trace checked per reached hex).
    const defs = new Map(state.scenario.pieceCatalog.definitions.map((d) => [d.id, d]));
    const ma = (p) => Math.max(0, ...(defs.get(p.definitionId)?.faces.flatMap((f) => f.steps.map((s) => s.movementPointTicks ?? 0)) ?? [0]));
    // Units that would first need fuel (FUEL_REQUIRED) are skipped: the most mobile unit that may move at once is timed.
    const moving = { ...state, sequence: { ...state.sequence, phase: 'MOVEMENT', segment: 'MOVEMENT' } };
    const mover = pieces.filter((p) => p.ownerId === actor && p.location.kind === 'ON_MAP' && defs.get(p.definitionId)?.counter?.kind === 'COMBAT'
      && queryReachableHexes(moving, actor, p.id).allowed).sort((a, b) => ma(b) - ma(a))[0];
    row.facts.mover = mover ? `${mover.id} MA ${ma(mover) / 4}` : null;
    if (mover) {
      t['move.range'] = time(() => queryReachableHexes(fresh(moving), actor, mover.id), 3);
      row.facts.reach = queryReachableHexes(moving, actor, mover.id).value?.length ?? 0;
      const strat = { ...moving, pieceState: { ...moving.pieceState, pieces: pieces.map((p) => p.id === mover.id ? { ...p, mode: 'STRAT' } : p) } };
      t['move.range(strat)'] = time(() => queryReachableHexes(fresh(strat), actor, mover.id), 3, 4000);
      row.facts.stratReach = queryReachableHexes(strat, actor, mover.id).value?.length ?? 0;
    }

    // Turn 1, headless: every applyAction timed and grouped by the step it ends.
    let s = state;
    let n = 0;
    const steps = {};
    for (let guard = 0; guard < 400 && s.sequence.gameTurn < 2 && s.sequence.phase !== 'COMPLETE'; guard += 1) {
      const who = s.pendingDecision?.ownerId ?? s.sequence.actingPlayerId;
      let action;
      if (s.pendingDecision) action = { kind: 'RESPOND_DECISION', decisionId: s.pendingDecision.id, choiceId: s.pendingDecision.options[0].id };
      else {
        const place = ruleEngine.getActionCandidates(s, { actorId: who, kind: 'PLACE_REINFORCEMENT', pieceId: null, budget: 1 }).actions[0];
        action = place ? { kind: place.kind, pieceId: place.pieceId, hexId: place.hexId } : { kind: 'ADVANCE_SEQUENCE' };
      }
      const key = `${action.kind === 'ADVANCE_SEQUENCE' ? `advance from ${s.sequence.phase}` : action.kind}`;
      started = performance.now();
      const result = applyGameAction(s, { ...action, actionId: `action:perf:${n += 1}`, actorId: who, expectedRevision: s.revision });
      const ms = performance.now() - started;
      if (!result.ok) throw new Error(`turn: ${key} rejected ${result.violations.map(({ code }) => code).join(',')}`);
      const entry = steps[key] ??= { count: 0, ms: 0, max: 0 };
      entry.count += 1; entry.ms += ms; entry.max = Math.max(entry.max, ms);
      s = result.state;
    }
    row.turn1 = steps;
    t['turn1.applyAction(total)'] = Object.values(steps).reduce((a, b) => a + b.ms, 0);
    t['turn1.advance(max)'] = Math.max(0, ...Object.entries(steps).filter(([k]) => k.startsWith('advance')).map(([, v]) => v.max));
    await session.close();
  } catch (error) {
    row.error = String(error.message ?? error).slice(0, 300);
  }
  for (const key of Object.keys(t)) t[key] = Math.round(t[key] * 10) / 10;
  results.push(row);
  console.log(`\n== ${label} (${row.hexes} hexes) ${row.error ? `ERROR ${row.error}` : ''}`);
  console.log(JSON.stringify(row.facts));
  console.log(Object.entries(t).map(([k, v]) => `${k}=${v}`).join('  '));
}

// Growth exponent per component between consecutive sizes with the same division count: ms ∝ hexes^k.
const keys = [...new Set(results.flatMap((r) => Object.keys(r.ms)))];
console.log('\ncomponent'.padEnd(30) + results.map((r) => r.label.padStart(14)).join(''));
for (const key of keys) console.log(key.padEnd(30) + results.map((r) => String(r.ms[key] ?? '-').padStart(14)).join(''));
await writeFile(`${out}/scaling-curve.json`, JSON.stringify({ generatedAt: new Date().toISOString(), node: process.version, dist, results }, null, 1));
console.log(`\nwritten ${out}/scaling-curve.json`);
