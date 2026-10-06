// One New Game stage at a given size, for `node --cpu-prof` (then scripts/perf/summarize-cpuprofile.mjs).
// Usage: node --cpu-prof --cpu-prof-dir=<dir> scripts/perf/profile-stage.mjs <map|session|turn> WxH[:divisions]
// PERF_DIST selects the build (the size cap applies to the default one).
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { performance } from 'node:perf_hooks';

const dist = pathToFileURL(resolve(process.env.PERF_DIST ?? 'dist')).href;
const lib = await import(`${dist}/index.js`);
const [stage, spec] = process.argv.slice(2);
const [size, divisionsText] = spec.split(':');
const [width, height] = size.split('x').map(Number);
const base = lib.DEFAULT_NEW_GAME_REQUEST;
const request = { ...base, map: { ...base.map, width, height }, oob: { ...base.oob, divisionsPerSide: Number(divisionsText ?? base.oob.divisionsPerSide) } };
const started = performance.now();
if (stage === 'map') {
  lib.generateRandomMap({ ...request.map, seed: request.seeds.map });
} else {
  const created = await lib.createNewGameOrchestrator(lib.createGameplayEngine(lib.createMemoryGameplayPorts())).create(request);
  if (!created.ok) throw new Error(JSON.stringify(created.error).slice(0, 300));
  if (stage === 'turn') {
    let s = lib.parseGameStateJson(JSON.parse(created.value.session.serializeSave()).currentSnapshot).value;
    const turnStart = performance.now();
    for (let n = 0; n < 400 && s.sequence.gameTurn < 2; n += 1) {
      const who = s.pendingDecision?.ownerId ?? s.sequence.actingPlayerId;
      const place = s.pendingDecision ? null : lib.ruleEngine.getActionCandidates(s, { actorId: who, kind: 'PLACE_REINFORCEMENT', pieceId: null, budget: 1 }).actions[0];
      const body = s.pendingDecision ? { kind: 'RESPOND_DECISION', decisionId: s.pendingDecision.id, choiceId: s.pendingDecision.options[0].id }
        : place ? { kind: place.kind, pieceId: place.pieceId, hexId: place.hexId } : { kind: 'ADVANCE_SEQUENCE' };
      const result = lib.applyGameAction(s, { ...body, actionId: `action:prof:${n}`, actorId: who, expectedRevision: s.revision });
      if (!result.ok) throw new Error(result.violations.map(({ code }) => code).join(','));
      s = result.state;
    }
    console.log('turn 1 ms', Math.round(performance.now() - turnStart));
  }
}
console.log(stage, spec, 'total ms', Math.round(performance.now() - started));
