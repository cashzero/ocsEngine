import { readFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { advanceTo, click, gotoHex, handoff, has, newGame, open, record, settleLogged, tab, textOf, where } from './air-acceptance/harness.mjs';
import { menuSummary, previewSignature } from './product-acceptance/lib.mjs';

const directory = process.argv[2] ?? 'artifacts/artillery-facility/browser';
const positions = resolve(process.argv[3] ?? 'artifacts/artillery-facility/positions');
const viewport = { width: Number(process.argv[4] ?? 1920), height: Number(process.argv[5] ?? 1080) };
const facts = JSON.parse(await readFile(join(positions, 'facts.json'), 'utf8'));
const h = await open({ evidenceDir: directory, viewport });
const { page } = h;
const id = 'ACT-18';
const observations = [];
const load = async (file, replay = false) => {
  await handoff(h);
  if (!(await has(h, '#load-game'))) await click(h, '#open-menu');
  const [chooser] = await Promise.all([page.waitForEvent('filechooser'), click(h, replay ? '#load-replay' : '#load-game')]);
  await chooser.setFiles(file);
  await page.waitForTimeout(800);
  const notice = await textOf(h, '.deck-notice');
  if (!/loaded|replay/i.test(notice)) throw new Error(`Loading did not succeed: ${notice}`);
  if (await has(h, '#close-utility')) await click(h, '#close-utility');
  await handoff(h);
};
const download = async (name, replay = false) => {
  if (!(await has(h, '#save-game'))) await click(h, '#open-menu');
  const [file] = await Promise.all([page.waitForEvent('download'), click(h, replay ? '#export-replay' : '#save-game')]);
  const path = resolve(directory, `${name}.json`);
  await file.saveAs(path);
  if (await has(h, '#close-utility')) await click(h, '#close-utility');
  return { path, value: JSON.parse(await readFile(path, 'utf8')) };
};
const snapshotOf = (save) => JSON.parse(save.currentSnapshot);

try {
  let preview;
  await newGame(h, {
    ...facts.request.map, style: facts.request.map.style, scale: facts.request.oob.scale,
    divisions: facts.request.oob.divisionsPerSide, armored: facts.request.oob.armoredDivisionsPerSide,
    air: 'STANDARD', transport: 'NONE', turnLimit: 3, seeds: facts.request.seeds,
    onSettings: async () => { await page.selectOption('#new-game-sea', 'FLANK'); },
    onPreview: async () => { preview = await previewSignature(h); await h.shot('new-game-preview'); },
  });
  const summary = await menuSummary(h);
  record(h, id, 'Changed coastal 18×12 / Standard / 3-division OOB package is previewed and that package starts',
    JSON.stringify({ metrics: preview.metrics, summary }), preview.metrics.Map === '18×12' && summary.includes(`${preview.metrics.Units} units`) && summary.includes('5101'));
  await advanceTo(h, (state) => state.player.startsWith('Allied') && state.phase === 'Movement');
  await click(h, '#open-roster');
  const infantry = await page.locator('[data-roster-pick]').evaluateAll((nodes) => nodes.map((node) => ({ id: node.dataset.rosterPick, text: node.innerText })).find((row) => /\b\d+\.(?:Inf|Abn)\b/.test(row.text)));
  if (!infantry) throw new Error('Generated New Game roster has no foot division.');
  await click(h, `[data-roster-pick="${infantry.id}"]`);
  if (await has(h, '[data-mode="MOVE"]')) await click(h, '[data-mode="MOVE"]');
  const move = await page.evaluate(() => [...window.ocsMap.state.reachable.keys()].find((hex) => hex !== window.ocsMap.state.selectedHexId));
  if (!move) throw new Error('New Game foot division has no legal move.');
  const [q, r] = move.split(',').map(Number);
  const label = `${String(q + Math.floor(r / 2) + 1).padStart(2, '0')}${String(r + 1).padStart(2, '0')}`;
  await gotoHex(h, label, { enter: true });
  await h.shot('new-game-legal-move');
  await click(h, '#confirm-move');
  await settleLogged(h);
  const phases = [];
  await advanceTo(h, (state) => /Turn 2/.test(state.turn) && state.decision.length === 0, { limit: 150, before: async (state) => { phases.push(state); return false; } });
  const final = await where(h);
  await h.shot('new-game-whole-turn');
  record(h, id, 'The same New Game completes a legal move and a whole turn with pending decisions and hot-seat handoffs', JSON.stringify({ infantry, move: label, final, phases: phases.length }), /Turn 2/.test(final.turn));
  observations.push({ newGame: { summary, preview: preview.metrics, phases, final } });

  for (const [position, target] of [['port-only', 'PORT'], ['base-only', 'AIR_BASE'], ['mixed', 'PORT'], ['mixed', 'AIR_BASE']]) {
    const name = `${position}-${target.toLowerCase()}`;
    await load(join(positions, `${position}.json`));
    await tab(h, 'Targets');
    await click(h, `[data-target-hex="${facts.target}"]`);
    const selector = page.locator('#barrage-target');
    const options = await selector.locator('option').evaluateAll((nodes) => nodes.map((node) => node.value));
    const selection = await page.locator('[data-participant]:checked').evaluateAll((nodes) => nodes.map((node) => node.dataset.participant));
    const previews = {};
    for (const option of position === 'mixed' ? ['COMBAT_UNITS', 'AIR_BASE', 'PORT'] : [target]) {
      await selector.selectOption(option);
      await page.waitForTimeout(200);
      previews[option] = await textOf(h, '.combat-draft');
      const after = await page.locator('[data-participant]:checked').evaluateAll((nodes) => nodes.map((node) => node.dataset.participant));
      if (JSON.stringify(after) !== JSON.stringify(selection)) throw new Error('Changing target changed selected artillery.');
    }
    if (position === 'mixed') {
      const gun = page.locator('[data-participant]').last();
      await gun.uncheck();
      await selector.selectOption('COMBAT_UNITS');
      await page.waitForTimeout(200);
      const combat = await textOf(h, '.combat-draft');
      await selector.selectOption('PORT');
      await page.waitForTimeout(200);
      const facility = await textOf(h, '.combat-draft');
      record(h, id, 'Changing the target with one 17-point artillery selected changes the displayed supply from 3T to 2T', JSON.stringify({ combat, facility }), /Supply 3T/.test(combat) && /Supply 2T/.test(facility));
      await h.shot(`${name}-different-supply-cost`);
      await gun.check();
    }
    await selector.selectOption(target);
    await page.waitForTimeout(200);
    const draft = await textOf(h, '.combat-draft');
    await h.shot(`${name}-preview`);
    record(h, id, `${position} offers explicit ${target} targeting and Facility Table preview`, JSON.stringify({ options, draft, previews }), options.includes(target) && /Facility/.test(draft) && /1d6|one die|single die/i.test(draft) && (position !== 'mixed' || options.length === 3));
    const started = Date.now();
    await click(h, '#declare-draft');
    const decisions = await settleLogged(h);
    const elapsed = Date.now() - started;
    await tab(h, 'Log');
    const log = await textOf(h, '.command-rail');
    await h.shot(`${name}-result`);
    const saved = await download(name);
    const after = snapshotOf(saved.value);
    const beforeSave = JSON.parse(await readFile(join(positions, `${position}.json`), 'utf8'));
    const before = snapshotOf(beforeSave);
    const piece = (state, pieceId) => state.pieceState.pieces.find(({ id: candidate }) => candidate === pieceId);
    const port = (state) => state.mapState.features.find((feature) => feature.definitionId === 'facility:port' && feature.location.hexId === facts.target);
    const level = (state) => piece(state, facts.base).statuses.find(({ statusDefinitionId }) => statusDefinitionId === 'status:air-base-level')?.value.value;
    const paid = piece(before, facts.dump).resourceQuantity - piece(after, facts.dump).resourceQuantity;
    const cost = Number(draft.match(/Supply\s+(\d+)T/)?.[1]);
    const delta = target === 'PORT' ? (port(after)?.damage ?? 0) - (port(before)?.damage ?? 0) : level(before) - level(after);
    const isolation = target === 'PORT' ? level(after) === level(before) && facts.planes.every((plane) => JSON.stringify(piece(before, plane)) === JSON.stringify(piece(after, plane))) : (port(after)?.damage ?? 0) === (port(before)?.damage ?? 0);
    const defenderSame = JSON.stringify(piece(before, facts.defender)) === JSON.stringify(piece(after, facts.defender));
    record(h, id, `${name} pays the displayed supply, damages its chosen facility, and leaves unrelated targets unchanged`, JSON.stringify({ paid, cost, delta, isolation, defenderSame, log, elapsed, draws: after.rng.draws, decisions }), paid === cost && delta > 0 && isolation && defenderSame && /die\s+[1-6]/i.test(log));
    observations.push({ position, target, options, previews, draft, paid, cost, delta, elapsed, decisions, rngDraws: after.rng.draws, log });
    if (position === 'mixed' && target === 'AIR_BASE') {
      const replay = await download(`${name}-replay`, true);
      await load(saved.path);
      const loaded = await download(`${name}-loaded`);
      await load(replay.path, true);
      const replayed = await download(`${name}-replayed`);
      record(h, id, 'A targeted artillery facility attack survives actual save loading and replay loading', JSON.stringify({ original: saved.value.finalStateHash, loaded: loaded.value.finalStateHash, replayed: replayed.value.finalStateHash }), saved.value.finalStateHash === loaded.value.finalStateHash && saved.value.finalStateHash === replayed.value.finalStateHash);
      await h.shot('save-and-replay-restored');
    }
  }
  record(h, id, 'Zero browser console or runtime errors', JSON.stringify(h.errors), h.errors.length === 0);
} catch (error) {
  record(h, id, 'The integrated artillery facility workflow completes', String(error.stack ?? error), false);
  await h.shot('failure').catch(() => {});
}
await h.finish('Artillery facility barrage through the mounted game');
const { writeFile } = await import('node:fs/promises');
await writeFile(join(directory, 'observations.json'), JSON.stringify(observations, null, 2));
const failed = h.rows.some((row) => row.status !== 'PASS');
await h.close();
if (failed) process.exitCode = 1;
