import { readFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { advanceTo, click, gotoHex, has, newGame, open, record, settleLogged, tab, textOf, where } from './air-acceptance/harness.mjs';
import { menuSummary, previewSignature } from './product-acceptance/lib.mjs';

const directory = resolve(process.argv[2] ?? 'artifacts/facility-todos/computer-browser');
const positions = resolve(process.argv[3] ?? 'artifacts/facility-todos/positions');
const facts = JSON.parse(await readFile(join(positions, 'facts.json'), 'utf8'));
const h = await open({ evidenceDir: directory });
const { page } = h;
const id = 'BOT-12';
const download = async (name, replay = false) => {
  await click(h, '#open-menu');
  const [file] = await Promise.all([page.waitForEvent('download'), click(h, replay ? '#export-replay' : '#save-game')]);
  const path = join(directory, `${name}.json`);
  await file.saveAs(path);
  if (await has(h, '#close-utility')) await click(h, '#close-utility');
  return { path, value: JSON.parse(await readFile(path, 'utf8')) };
};
const load = async (path, expectedRevision, replay = false) => {
  await click(h, '#open-menu');
  const [chooser] = await Promise.all([page.waitForEvent('filechooser'), click(h, replay ? '#load-replay' : '#load-game')]);
  await page.evaluate((revision) => {
    const observer = new MutationObserver(() => {
      const panel = document.querySelector('#computer-panel');
      const button = document.querySelector('#pause-computer');
      if (Number(panel?.dataset.revision) === revision && button && !document.querySelector('.app-shell[inert]')) {
        observer.disconnect();
        button.click();
      }
    });
    observer.observe(document.body, { subtree: true, childList: true, attributes: true });
  }, expectedRevision);
  await chooser.setFiles(path);
  await page.waitForFunction((revision) => Number(document.querySelector('#computer-panel')?.dataset.revision) === revision
    && document.querySelector('#computer-panel')?.dataset.playing === 'false'
    && /loaded/i.test(document.querySelector('.deck-notice')?.textContent ?? ''), expectedRevision);
  await page.selectOption('#computer-speed', 'SLOW');
  await page.waitForSelector('#play-computer');
  if (await has(h, '#view-as')) await page.selectOption('#view-as', 'seat:allied');
};
const step = async () => {
  const before = Number(await page.locator('#computer-panel').getAttribute('data-played'));
  await page.locator('#step-computer').click();
  await page.waitForFunction((played) => Number(document.querySelector('#computer-panel')?.dataset.played) > played
    || !!document.querySelector('#computer-stuck'), before);
  if (await has(h, '#computer-stuck')) throw new Error(await textOf(h, '#computer-stuck'));
};

try {
  let preview;
  await newGame(h, {
    ...facts.request.map, scale: facts.request.oob.scale, divisions: facts.request.oob.divisionsPerSide,
    armored: facts.request.oob.armoredDivisionsPerSide, air: 'STANDARD', transport: 'NONE', turnLimit: 3,
    seeds: facts.request.seeds, onSettings: () => page.selectOption('#new-game-sea', 'FLANK'),
    onPreview: async () => { preview = await previewSignature(h); await h.shot('changed-new-game-preview'); },
  });
  const summary = await menuSummary(h);
  record(h, id, 'The changed Map/OOB is previewed and that same generated package starts', JSON.stringify({ preview: preview.metrics, summary }), preview.metrics.Map === '18×12' && summary.includes(`${preview.metrics.Units} units`) && summary.includes('5101'));
  await advanceTo(h, (state) => state.player.startsWith('Allied') && state.phase === 'Movement');
  await click(h, '#open-roster');
  const infantry = await page.locator('[data-roster-pick]').evaluateAll((nodes) => nodes.map((node) => ({ id: node.dataset.rosterPick, text: node.innerText })).find((row) => /\b\d+\.(?:Inf|Abn)\b/.test(row.text)));
  if (!infantry) throw new Error('No generated foot division.');
  await click(h, `[data-roster-pick="${infantry.id}"]`);
  if (await has(h, '[data-mode="MOVE"]')) await click(h, '[data-mode="MOVE"]');
  const move = await page.evaluate(() => [...window.ocsMap.state.reachable.keys()].find((hex) => hex !== window.ocsMap.state.selectedHexId));
  if (!move) throw new Error('No legal move.');
  const [q, r] = move.split(',').map(Number);
  await gotoHex(h, `${String(q + Math.floor(r / 2) + 1).padStart(2, '0')}${String(r + 1).padStart(2, '0')}`, { enter: true });
  await click(h, '#confirm-move');
  await settleLogged(h);
  await advanceTo(h, (state) => /Turn 2/.test(state.turn) && state.decision.length === 0, { limit: 150 });
  record(h, id, 'The changed New Game completes a legal move and a whole turn with decisions and handoffs', JSON.stringify(await where(h)), /Turn 2/.test((await where(h)).turn));
  await h.shot('changed-new-game-whole-turn');

  for (const kind of ['port-only', 'base-only']) {
    const target = kind === 'port-only' ? 'PORT' : 'AIR_BASE';
    await load(join(positions, `${kind}-computer.json`), 0);
    await h.shot(`${kind}-before-computer`);
    await tab(h, 'Targets');
    await click(h, `[data-target-hex="${facts.target}"]`);
    await page.selectOption('#barrage-target', target);
    const prices = new Map();
    const price = async () => {
      const firers = await page.locator('[data-participant]:checked').evaluateAll((nodes) => nodes.map((node) => node.dataset.participant).sort().join('|'));
      const draft = await textOf(h, '.combat-draft');
      prices.set(firers, { cost: Number(draft.match(/Supply\s+(\d+)T/)?.[1]), draft });
    };
    await price();
    const participants = page.locator('[data-participant]');
    if (await participants.count() !== 2) throw new Error('Expected two generated artillery units.');
    await participants.last().uncheck();
    await price();
    await participants.last().check();
    await participants.first().uncheck();
    await price();
    await click(h, '#cancel-draft');
    await tab(h, 'Log');
    for (let count = 0; count < 12 && !/Barrage vs Facility/.test(await textOf(h, '.command-rail')); count += 1) {
      await step();
      h.note(`${kind} Step ${count + 1}: ${await textOf(h, '#computer-last')}`);
      if (count === 0) await h.shot(`${kind}-declaration`);
    }
    await tab(h, 'Log');
    const log = await textOf(h, '.command-rail');
    await h.shot(`${kind}-computer-result`);
    const saved = await download(`${kind}-saved`);
    const state = JSON.parse(saved.value.currentSnapshot);
    const initial = JSON.parse(saved.value.initialSnapshot);
    const declaration = saved.value.acceptedActions.find((action) => action.kind === 'DECLARE_BARRAGE');
    const expected = prices.get([...(declaration?.firerIds ?? [])].sort().join('|'));
    const piece = (value, pieceId) => value.pieceState.pieces.find(({ id: key }) => key === pieceId);
    const paid = piece(initial, facts.dump).resourceQuantity - piece(state, facts.dump).resourceQuantity;
    const levels = (value) => piece(value, facts.base).statuses.find(({ statusDefinitionId }) => statusDefinitionId === 'status:air-base-level').value.value;
    const hits = (value) => value.mapState.features.find((feature) => feature.definitionId === 'facility:port' && feature.location.hexId === facts.target)?.damage ?? 0;
    const changed = target === 'PORT' ? hits(state) > hits(initial) && levels(state) === levels(initial)
      : levels(state) < levels(initial) && hits(state) === hits(initial);
    record(h, id, `The computer chooses ${target}, pays the displayed Facility Table cost, and resolves actual facility damage`, JSON.stringify({ declaration, paid, expected, log, hits: hits(state), level: levels(state) }), declaration?.target === target && paid === expected?.cost && paid > 0 && changed && /Facility die: [1-6]/.test(log));
    const replay = await download(`${kind}-replay`, true);
    const revision = state.revision;
    await step();
    await load(saved.path, revision);
    const restored = await download(`${kind}-loaded`);
    await step();
    await load(replay.path, revision, true);
    const replayed = await download(`${kind}-replayed`);
    record(h, id, `The computer ${target} attack survives changed state, save loading and replay loading`, JSON.stringify({ original: saved.value.finalStateHash, loaded: restored.value.finalStateHash, replayed: replayed.value.finalStateHash }), saved.value.finalStateHash === restored.value.finalStateHash && saved.value.finalStateHash === replayed.value.finalStateHash);
    await h.shot(`${kind}-save-replay-restored`);
  }
  record(h, id, 'No browser errors or computer stall', JSON.stringify(h.errors), h.errors.length === 0 && !await has(h, '#computer-stuck'));
} catch (error) {
  record(h, id, 'The mounted computer facility workflow completes', String(error.stack ?? error), false);
  await h.shot('failure').catch(() => {});
}
await h.finish('Computer artillery against ports and Air Bases');
const failed = h.rows.some((row) => row.status !== 'PASS');
await h.close();
if (failed) process.exitCode = 1;
