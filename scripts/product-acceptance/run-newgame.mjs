// doc 03 §A: BOOT-01 and NG-01 to NG-10 through the New Game dialog of the built application.
// The dialog has two pages (Settings, then Preview) and a loading page while a package is built or started: Preview on the
// Settings page always generates afresh, Back returns to Settings, and Start exists only on the Preview page.
import { writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { click, has, open, record, textOf, where } from '../air-acceptance/harness.mjs';
import { configure, dialogState, generate, menuSummary, openNewGame, photographBuild, previewSignature, sha, start, startStageWatch, stopStageWatch, sweepMap } from './lib.mjs';

const evidenceDir = join(process.argv[2] ?? 'artifacts/product-2026-10-04', 'newgame');
const NG07 = { style: 'TEMPERATE_INLAND', width: 18, height: 12, scale: 'LARGE', divisions: 4, armored: 2, turnLimit: 3, seeds: { map: 91001, oob: 91002, deployment: 91003, rules: 91004 } };
const extra = {};

/** The preview shows divisions per side ("6 per side", or each side's count in an attack); the menu counts them all. */
const divisionTotal = (text) => { const counts = (text.match(/\d+/g) ?? []).map(Number); return counts.length === 1 ? 2 * counts[0] : counts.reduce((a, b) => a + b, 0); };
/** Compare a preview with the mounted game: size and terrain hex by hex, occupied hexes, units, formations, turns, seeds. */
const continuity = async (h, id, preview, request) => {
  const summary = await menuSummary(h);
  const swept = await sweepMap(h);
  const [w, hgt] = preview.metrics.Map.split('×').map(Number);
  const terrainMismatch = swept.cells.filter((cell, index) => `terrain-${cell.terrain}` !== preview.terrain[index]).map((cell, index) => `${cell.hex}:${cell.terrain}/${preview.terrain[index]}`);
  // A settlement is announced between the terrain and the units ("clear · village · no units").
  const occupied = swept.cells.filter((cell) => !/no units$/.test(cell.text)).length;
  const seeds = `seeds map ${request.seeds.map}, OOB ${request.seeds.oob}, deployment ${request.seeds.deployment}, rules ${request.seeds.rules}`;
  const turnText = (await where(h)).turn;
  const checks = {
    size: `${swept.width}×${swept.height}` === `${w}×${hgt}`,
    terrain: terrainMismatch.length === 0 && swept.cells.length === preview.terrain.length,
    occupied: String(occupied) === preview.metrics['Deployed hexes'],
    units: summary.includes(`${preview.metrics.Units} units`),
    formations: summary.includes(`${divisionTotal(preview.metrics.Divisions)} formations`),
    turns: summary.includes(`${request.turnLimit} turns`) && turnText.includes(`/ ${request.turnLimit}`),
    seeds: summary.includes(seeds),
  };
  extra[id] = { summary, mounted: { width: swept.width, height: swept.height, occupied, terrainMismatch: terrainMismatch.slice(0, 20) }, cells: swept.cells.map(({ text }) => text) };
  return { checks, summary, occupied, swept, terrainMismatch };
};

const h = await open({ evidenceDir });
const { page } = h;
try {
  // BOOT-01
  await page.waitForTimeout(500);
  const bootState = await where(h);
  const menuVisible = await has(h, '#open-menu');
  await click(h, '#open-menu');
  const entry = await textOf(h, '#open-new-game');
  await h.shot('boot-menu');
  await click(h, '#close-utility');
  record(h, 'BOOT-01', 'No boot error; an obvious New Game entry is available', `booted into ${bootState.turn} ${bootState.player} ${bootState.phase}; "☰ Menu" visible ${menuVisible} in the top bar; the menu's first button reads "${entry}"; console/page errors ${h.errors.length}`, menuVisible && /New Game/.test(entry) && h.errors.length === 0);

  // NG-01
  const before = { where: await where(h), summary: await menuSummary(h) };
  await openNewGame(h);
  await configure(h, { width: 20 });
  await h.shot('ng01-open');
  await click(h, '#close-new-game');
  const closed = !(await has(h, '.new-game-dialog'));
  await openNewGame(h);
  const reopened = await has(h, '.new-game-dialog');
  const reopenState = await dialogState(h);
  await click(h, '#close-new-game');
  const after = { where: await where(h), summary: await menuSummary(h) };
  record(h, 'NG-01', 'Dialog lifecycle is reversible and does not mutate the active game', `closed ${closed}, reopened ${reopened} (status "${reopenState.status}"); active game before "${before.summary}" ${before.where.turn} ${before.where.phase} / after "${after.summary}" ${after.where.turn} ${after.where.phase}`,
    closed && reopened && JSON.stringify(before) === JSON.stringify(after));

  // NG-02 and NG-10 (stages observed during the default Generate and Start)
  await page.reload();
  await page.waitForSelector('#open-menu');
  await openNewGame(h);
  const empty = await dialogState(h);
  await startStageWatch(h);
  const generated = await generate(h);
  const genStages = await stopStageWatch(h);
  const defaults = await previewSignature(h);
  await h.shot('ng02-default-preview');
  record(h, 'NG-02', 'Map, both OOB sides, deployment metrics, warnings, and Start are visible', `before Generate: "${empty.status}", Start ${empty.start ? 'present' : 'absent'}; Generate ${generated.elapsed} ms → "${generated.state.status}"; metrics ${JSON.stringify(defaults.metrics)}; sides ${defaults.sides.join('/')}; ${defaults.counters.length} preview counters; map hexes ${defaults.terrain.length}; Start "${generated.state.start?.text}" disabled ${generated.state.start?.disabled}`,
    generated.state.status === 'Preview ready' && defaults.sides.length === 2 && defaults.terrain.length > 0 && 'Deployed hexes' in defaults.metrics && 'Warnings' in defaults.metrics && generated.state.start && !generated.state.start.disabled && generated.elapsed <= 3000);

  // NG-03: change one option after the preview. Back to Settings is the only way to an option; the preview is then no longer on
  // screen and nothing can be started until Preview is pressed again, which generates afresh.
  const genBefore = sha(defaults);
  await configure(h, { turnLimit: 7 });
  await page.waitForTimeout(600);
  const staleState = await dialogState(h);
  await h.shot('ng03-after-change');
  record(h, 'NG-03', 'After changing an option the earlier preview is no longer offered as current: it is stale or gone, Start is unavailable, and nothing is generated until Preview is pressed', `after Back and changing Turn limit 8→7: page "${staleState.page}", status "${staleState.status}" — "${staleState.hint}"; preview on screen ${staleState.previewShown}; Start ${staleState.start ? `"${staleState.start.text}" disabled ${staleState.start.disabled}` : 'absent'}; preview dimmed ${staleState.stale}; (the row's old wording "visibly stale/dimmed, Start disabled" described the one-page dialog)`,
    staleState.page === 'settings' && !staleState.previewShown && (staleState.start === null || staleState.start.disabled) && !/Generating|Preview ready/.test(staleState.status));
  const regenerated = await generate(h);
  const regeneratedSig = await previewSignature(h);
  record(h, 'NG-03b', 'Pressing Preview after the change generates a new preview that carries it', `Preview → "${regenerated.state.status}", page "${regenerated.state.page}"; Start ${regenerated.state.start ? 'present' : 'absent'}; preview differs from the earlier one ${sha(regeneratedSig) !== genBefore} (turn limit is not shown on the preview, so only the rebuild is observed)`,
    regenerated.state.status === 'Preview ready' && regenerated.state.page === 'preview' && regenerated.state.start && !regenerated.state.start.disabled);
  await configure(h, { turnLimit: 8 });

  // NG-04: invalid values, one at a time.
  const invalids = [
    ['width', 10, { width: 10 }], ['divisions', 0, { divisions: 0 }], ['armored', 7, { armored: 7 }],
    ['map-seed', -1, { seeds: { map: -1 } }], ['turn-limit', 0, { turnLimit: 0 }],
  ];
  const invalidResults = [];
  for (const [field, value, option] of invalids) {
    await configure(h, option);
    const result = await generate(h).catch((error) => ({ elapsed: -1, state: { status: `no result: ${error.message}` } }));
    const state = await dialogState(h);
    invalidResults.push({ field, value, status: state.status, fieldError: state.fieldError, error: state.error, startDisabled: state.start?.disabled ?? null });
    await h.shot(`ng04-invalid-${field}`);
    // Restore the default before the next field.
    await configure(h, field === 'map-seed' ? { seeds: { map: 206569473 } } : { [field === 'turn-limit' ? 'turnLimit' : field]: { width: 32, divisions: 6, armored: 2, 'turn-limit': 8 }[field] });
  }
  // Armored above the division count (both in range).
  await configure(h, { divisions: 2, armored: 3 });
  await generate(h).catch(() => {});
  const mix = await dialogState(h);
  invalidResults.push({ field: 'armored>divisions', value: '2/3', status: mix.status, fieldError: mix.fieldError, error: mix.error, startDisabled: mix.start?.disabled ?? null });
  await h.shot('ng04-armored-over-divisions');
  await configure(h, { divisions: 6, armored: 2 });
  extra['NG-04'] = invalidResults;
  record(h, 'NG-04', 'Each invalid request is rejected with a player-readable field/stage error', invalidResults.map((r) => `${r.field}=${r.value}: ${r.fieldError ? `beside ${r.fieldError.field}: "${r.fieldError.text}"` : r.error ? `"${r.error}"` : 'NO MESSAGE'}; status "${r.status}"; Start disabled ${r.startDisabled}`).join(' | '),
    invalidResults.every((r) => (r.fieldError || r.error) && r.status !== 'Preview ready'));

  // NG-05: Randomize all seeds (on the Settings page; nothing is generated and no earlier preview stays on screen).
  await generate(h);
  await page.click('#back-to-settings');
  const seedValues = () => page.evaluate(() => ['map', 'oob', 'deployment', 'rules'].map((k) => document.querySelector(`#new-game-${k}-seed`)?.value));
  const seedsBefore = await seedValues();
  await click(h, '#randomize-new-game', { settle: 600 });
  const seedsAfter = await seedValues();
  const randState = await dialogState(h);
  await h.shot('ng05-randomized');
  record(h, 'NG-05', 'All four displayed seeds change; no earlier preview is offered as current; no generation until Preview', `seeds ${seedsBefore.join('/')} → ${seedsAfter.join('/')}; page "${randState.page}", status "${randState.status}"; preview on screen ${randState.previewShown}; Start ${randState.start ? 'present' : 'absent'}`,
    seedsBefore.every((seed, index) => seed !== seedsAfter[index]) && randState.page === 'settings' && !randState.previewShown && (randState.start === null || randState.start.disabled) && !/Generating|Preview ready/.test(randState.status));
  await click(h, '#close-new-game');

  // NG-06: the default package, built and started.
  await page.reload();
  await page.waitForSelector('#open-menu');
  await openNewGame(h);
  const defaultSeeds = await page.evaluate(() => Object.fromEntries(['map', 'oob', 'deployment', 'rules'].map((k) => [k, Number(document.querySelector(`#new-game-${k}-seed`)?.value)])));
  const defaultStyle = await page.inputValue('#new-game-style');
  const ng06Gen = await generate(h);
  const ng06Preview = await previewSignature(h);
  await h.shot('ng06-preview');
  await startStageWatch(h);
  const ng06Mount = await start(h);
  const startStages = await stopStageWatch(h);
  await h.shot('ng06-mounted');
  const ng06 = await continuity(h, 'NG-06', ng06Preview, { seeds: defaultSeeds, turnLimit: 8 });
  record(h, 'NG-06', 'Default 32×24 / COMPACT / 6 per side, 2 armored / 8 turns: preview and mounted size, style, units, formations, objectives, seeds and turn limit agree', `style ${defaultStyle}; preview ${JSON.stringify(ng06Preview.metrics)} (Generate ${ng06Gen.elapsed} ms, Start ${ng06Mount} ms); mounted ${ng06.swept.width}×${ng06.swept.height}, ${ng06.occupied} occupied hexes, terrain mismatches ${ng06.terrainMismatch.length}; menu "${ng06.summary}"; checks ${JSON.stringify(ng06.checks)}; objectives compared on the screenshots`,
    ng06Preview.metrics.Map === '32×24' && defaultStyle === 'TEMPERATE_INLAND' && Object.values(ng06.checks).every(Boolean) && ng06Gen.elapsed <= 3000 && ng06Mount <= 3000);

  // NG-10: what the player sees of progress across Preview (NG-02 run) and Start (NG-06 run): the stage strip on the Settings and
  // Preview pages, and the loading page's own step list while the package is built or started. At most one step may be active
  // at a time, the steps finish in order, and the pages before and after show truthful states.
  const lines = [...genStages, ...startStages];
  const parts = lines.flatMap((line) => line.split(' + '));
  const multiActive = parts.filter((part) => (part.match(/is-active/g) ?? []).length > 1);
  const activeOrder = genStages.flatMap((line) => line.split(' + ')).filter((part) => part.startsWith('loading[')).map((part) => part.match(/(\w+):is-active/)?.[1]).filter(Boolean);
  const buildOrder = ['Map', 'Forces', 'Deployment', 'Scenario'];
  const buildSeen = buildOrder.filter((name) => activeOrder.includes(name));
  const inOrder = buildSeen.every((name, index) => index === 0 || activeOrder.indexOf(name) > activeOrder.indexOf(buildSeen[index - 1]));
  const settingsStrip = empty.stages.join(' | ');
  const previewStrip = generated.state.stages.join(' | ');
  extra['NG-10'] = { ...extra['NG-10'], settingsStrip, settingsStripDrawn: empty.stripDrawn, previewStrip, previewStripDrawn: generated.state.stripDrawn, parts };
  record(h, 'NG-10', 'Configure, Map, OOB, Deployment and Gameplay show truthful current/completed states; no simultaneous "active" ambiguity', `Settings page strip (drawn ${empty.stripDrawn}): ${settingsStrip}; during Preview the drawn loading steps went ${activeOrder.join(' → ') || 'unseen'}; Preview page strip (drawn ${generated.state.stripDrawn}, otherwise read only by screen readers): ${previewStrip}; during Start the drawn parts were ${startStages.join(' ⇒ ') || 'none'}; parts with more than one active step: ${multiActive.length}. Pictures: the next two rows`,
    multiActive.length === 0 && buildSeen.length >= 3 && inOrder
      && empty.stripDrawn && /Configure:is-active/.test(settingsStrip) && !/(Map|OOB|Deployment|Gameplay):is-(active|complete)/.test(settingsStrip)
      && /Map:is-complete/.test(previewStrip) && /OOB:is-complete/.test(previewStrip) && /Deployment:is-complete/.test(previewStrip) && !/Gameplay:is-(active|complete)/.test(previewStrip)
      && startStages.some((line) => /loading\[/.test(line)));

  // NG-10 (picture): what is drawn while the default package is built, with the CPU throttled to lengthen every step.
  await openNewGame(h);
  const build = await photographBuild(h, { evidenceDir });
  extra['NG-10'] = { ...extra['NG-10'], build };
  record(h, 'NG-10 (loading page)', 'The loading page lights one build step at a time, earlier steps are ticked and later ones still open (judged on the frames)', `${build.files.length} compositor frames at ${build.rate}× slower CPU over ${build.elapsed} ms: ${build.files.join(', ')}; the step shown in each frame is read by eye, not by the script`,
    build.files.length >= 4);
  // The same for Start on this previewed package: the loading page of Start and the strip behind it, until the game is mounted.
  const buildStart = await photographBuild(h, { evidenceDir, press: '#start-previewed-game', done: () => !document.querySelector('.new-game-dialog') && !!document.querySelector('.turn-strip'), prefix: 'ng10-start', everyMs: 300 });
  extra['NG-10'] = { ...extra['NG-10'], buildStart };
  record(h, 'NG-10 (start)', 'While Start opens the previewed package the screen shows one current step and the finished steps before it (judged on the frames)', `${buildStart.files.length} compositor frames at ${buildStart.rate}× slower CPU over ${buildStart.elapsed} ms: ${buildStart.files.join(', ')}; the step shown in each frame is read by eye, not by the script`,
    buildStart.files.length >= 2);

  // NG-07: the fixed Large 18×12 package; preview and mounted package must agree (no frozen deployed-Hex or unit count).
  await openNewGame(h);
  await configure(h, NG07);
  const ng07Gen = await generate(h);
  const ng07Preview = await previewSignature(h);
  await h.shot('ng07-preview');
  const ng07Mount = await start(h);
  await h.shot('ng07-mounted');
  const ng07 = await continuity(h, 'NG-07', ng07Preview, NG07);
  const expected = { Map: '18×12', Divisions: '4 per side' };
  const headline = Object.entries(expected).map(([key, value]) => `${key} ${ng07Preview.metrics[key]} (expected ${value})`).join(', ');
  record(h, 'NG-07', 'Preview and mounted package agree: map size, terrain hex by hex, units, formations, seeds and turn limit; no frozen deployed-Hex or unit count', `${headline}; ${ng07Preview.terrain.length} hexes; Generate ${ng07Gen.elapsed} ms, Start ${ng07Mount} ms; mounted checks ${JSON.stringify(ng07.checks)}; menu "${ng07.summary}"`,
    Object.entries(expected).every(([key, value]) => ng07Preview.metrics[key] === value) && ng07Preview.terrain.length === 216 && Object.values(ng07.checks).every(Boolean));

  // NG-08: NG-07 again from a fresh page.
  await page.goto(page.url());
  await page.waitForSelector('#open-menu');
  await openNewGame(h);
  await configure(h, NG07);
  await generate(h);
  const ng08Preview = await previewSignature(h);
  await start(h);
  const ng08Swept = await sweepMap(h);
  const same = {
    terrainAndFeatures: sha([ng08Preview.terrain, ng08Preview.features]) === sha([ng07Preview.terrain, ng07Preview.features]),
    oob: ng08Preview.forces === ng07Preview.forces,
    deployment: ng08Preview.deployment === ng07Preview.deployment,
    mountedMap: sha(ng08Swept.cells.map(({ text }) => text)) === sha(ng07.swept.cells.map(({ text }) => text)),
  };
  await h.shot('ng08-mounted');
  record(h, 'NG-08', 'Map terrain/feature signature, OOB identity/stats, and deployment are identical from a fresh page', `preview terrain+features ${sha([ng08Preview.terrain, ng08Preview.features])}, OOB ${sha(ng08Preview.forces)}, deployment ${sha(ng08Preview.deployment)}; equal ${JSON.stringify(same)}`, Object.values(same).every(Boolean));

  // NG-09: change one seed at a time. Units are compared by the counters' names (the forces listing also prints starting
  // hexes, which follow the map). The Preview draws only which hexes are occupied, not which unit stands where, and a
  // deployment seed often keeps the same hexes (it breaks ties between them); so for the deployment seed a +k whose Preview is
  // unchanged is started and the mounted map is swept: the same terrain with different stacks is a deployment-only change.
  const dims = [];
  const preview = async (seeds) => {
    await openNewGame(h);
    await configure(h, { ...NG07, seeds });
    await generate(h);
    return previewSignature(h);
  };
  const baseSigs = { map: sha([ng07Preview.terrain, ng07Preview.features]), oob: sha(ng07Preview.counters), deployment: sha(ng07Preview.deployment) };
  const baseMounted = { terrain: sha(ng07.swept.cells.map(({ terrain }) => terrain)), stacks: sha(ng07.swept.cells.map(({ text }) => text)) };
  const diff = (sig) => ({ map: sha([sig.terrain, sig.features]) !== baseSigs.map, oob: sha(sig.counters) !== baseSigs.oob, deployment: sha(sig.deployment) !== baseSigs.deployment });
  for (const key of ['map', 'oob', 'deployment', 'rules']) {
    let offset = 0;
    let changed;
    let via = 'preview';
    do {
      offset += 1;
      changed = diff(await preview({ ...NG07.seeds, [key]: NG07.seeds[key] + offset }));
      if (key !== 'deployment' || changed.deployment) break;
      // Same hexes in the Preview: start this package and compare the mounted stacks with the NG-07 package's.
      await start(h);
      const swept = await sweepMap(h);
      const mountedTerrainSame = sha(swept.cells.map(({ terrain }) => terrain)) === baseMounted.terrain;
      if (mountedTerrainSame && sha(swept.cells.map(({ text }) => text)) !== baseMounted.stacks) { changed = { ...changed, deployment: true }; via = 'mounted map'; break; }
    } while (offset < 8);
    let rulesNote = '';
    if (key === 'rules') {
      await start(h);
      rulesNote = `; mounted weather ${(await page.evaluate(() => document.querySelector('.turn-cell strong')?.textContent.trim()))}`;
    } else if (await has(h, '#close-new-game')) await click(h, '#close-new-game');
    dims.push({ key, offset, changed, via, rulesNote });
  }
  extra['NG-09'] = dims;
  record(h, 'NG-09', 'Only the documented Map/OOB/deployment/rules dimension changes', dims.map(({ key, offset, changed, via, rulesNote }) => `${key} seed +${offset} → changed ${Object.entries(changed).filter(([, v]) => v).map(([k]) => k).join('+') || 'nothing in the preview'}${key === 'deployment' ? ` (seen on the ${via})` : ''}${rulesNote}`).join(' | '),
    dims[0].changed.map && !dims[0].changed.oob && dims[1].changed.oob && !dims[1].changed.map && dims[2].changed.deployment && !dims[2].changed.map && !dims[2].changed.oob && !Object.values(dims[3].changed).some(Boolean));
} catch (error) {
  record(h, 'RUN', 'The New Game run completes', String(error.stack ?? error.message), false);
  await h.shot('failure').catch(() => {});
}
record(h, 'UI-04(ng)', 'No browser console or page error during the New Game run', `${h.errors.length} errors`, h.errors.length === 0);
await writeFile(join(evidenceDir, 'observations.json'), JSON.stringify(extra, null, 1));
await h.finish('doc 03 §A: BOOT-01, NG-01 to NG-10');
await h.close();
