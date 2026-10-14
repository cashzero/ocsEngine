// Actual UI boundary: two distinct generated previews, mounted AEPs, off-map mission, entire turn and refit.
import { join } from 'node:path';
import { open, newGame, gotoHex, advanceTo, tab, click, settleLogged, record, where, refitAll } from './harness.mjs';
import { printedHexLabel } from '../../dist/index.js';
const evidenceDir = join(process.cwd(), 'artifacts/aep-2026-10-13/final');
const h = await open({ evidenceDir });
const clickPage = h.page.click.bind(h.page);
h.page.click = async (selector, ...args) => {
  const started = Date.now();
  const value = await clickPage(selector, ...args);
  if (selector === 'button[form="new-game-form"]') await h.page.waitForSelector('#start-previewed-game:not([disabled])');
  if (selector === '#start-previewed-game') await h.page.waitForSelector('#new-game-form', { state: 'hidden' });
  h.timings.push({ label: selector, elapsed: Date.now() - started });
  return value;
};
const marks = async () => h.page.locator('.preview-air-entry').evaluateAll((nodes) => nodes.map((node) => ({ hex: node.dataset.hex, side: node.dataset.side })));
try {
  let first;
  await newGame(h, { width: 16, height: 12, scale: 'COMPACT', divisions: 1, armored: 0, air: 'NONE', seeds: { map: 13101, oob: 13102, deployment: 13103, rules: 13104 }, onPreview: async () => {
    first = await marks(); h.note(`16x12 / Compact / 1 infantry division / ground duel AEPs ${JSON.stringify(first)}`); await h.shot('small-preview');
  } });
  record(h, 'AEP-01', 'Small generated map shows one AEP per side', JSON.stringify(first), first.length === 2);
  await h.shot('small-mounted');
  let second;
  await newGame(h, { width: 24, height: 18, scale: 'STANDARD', divisions: 2, armored: 1, air: 'STANDARD', engagement: 'AXIS_ATTACKS', month: '9', seeds: { map: 13201, oob: 13202, deployment: 13203, rules: 13204 }, onPreview: async () => {
    second = await marks(); h.note(`24x18 / Standard / 2 divisions, 1 armored / Axis attacks AEPs ${JSON.stringify(second)}`); await h.shot('attack-preview');
  } });
  record(h, 'AEP-02', 'Different map/OOB preview and same mounted package expose friendly and enemy AEPs', JSON.stringify(second), second.length === 2 && JSON.stringify(first) !== JSON.stringify(second));
  await h.page.locator('#toggle-hide-units').check();
  await click(h, '#zoom-out');
  await click(h, '#zoom-out');
  await click(h, '#zoom-out');
  for (const mark of second) {
    const label = printedHexLabel(mark.hex);
    const hover = await gotoHex(h, label);
    record(h, 'AEP-02', `Mounted ${mark.side} AEP ${label} announces owner and range origin`, hover, hover.includes('Air Entry Point (AEP)') && hover.includes('+1 hex'));
    await h.shot(`mounted-${mark.side.toLowerCase()}-aep`);
  }
  await h.page.locator('#toggle-hide-units').uncheck();
  await advanceTo(h, (state) => /Barrage/.test(state.phase) && state.player.startsWith('Axis'));
  await tab(h, 'Air');
  await click(h, '[data-air-mission="BARRAGE"]');
  await click(h, '.hex-chips [data-target-hex]');
  const panel = await h.page.locator('.air-panel.combat-draft').innerText();
  const axis = printedHexLabel(second.find((mark) => mark.side === 'SECOND').hex);
  record(h, 'AEP-03', 'Off-map sortie panel identifies Axis AEP and counts range from it', panel, panel.includes(`AEP ${axis}`) && panel.includes('range from nearest AEP +1 hex') && panel.includes('off-map airfield'));
  const participants = h.page.locator('.air-panel .participant');
  let picked = 0;
  for (let i = 0; i < await participants.count(); i += 1) {
    const entry = participants.nth(i);
    const offMap = (await entry.innerText()).includes('off-map airfield');
    const take = offMap && picked < 2;
    await entry.locator('[data-air-aircraft]').setChecked(take);
    if (take) picked += 1;
  }
  if (picked !== 2) throw new Error('Need two off-map aircraft');
  h.note('Deselected on-map aircraft; only two off-map aircraft selected');
  await h.shot('off-map-barrage-plan');
  const start = Date.now();
  await click(h, '#declare-air-mission');
  const decisions = await settleLogged(h);
  h.note(`Off-map Barrage flown: ${Date.now() - start} ms including decisions ${JSON.stringify(decisions)}`);
  h.timings.push({ label: 'Sortie including required decisions and handoffs', elapsed: Date.now() - start });
  await h.shot('off-map-barrage-result');
  await tab(h, 'Log');
  const log = await h.page.locator('.deck-body').innerText();
  h.note(`Barrage log: ${log}`);
  record(h, 'AEP-03', 'Legal off-map barrage resolves through actual decisions', JSON.stringify(await where(h)), (await where(h)).decision.length === 0);
  await advanceTo(h, (state) => state.turn.startsWith('Turn 2 ') && state.player.startsWith('Axis') && state.phase === 'Aircraft Refit Phase', { limit: 120 });
  await h.shot('whole-turn-complete-refit');
  const refitStart = Date.now();
  const count = await refitAll(h);
  h.timings.push({ label: 'Refit including harness settle', elapsed: Date.now() - refitStart });
  record(h, 'AEP-04', 'Entire first Game Turn and required handoffs complete; flown off-map aircraft refit next turn', `${JSON.stringify(await where(h))}, ${count} refits`, count > 0);
  await click(h, '#open-menu');
  await click(h, '#create-checkpoint');
  const checkpoint = await h.page.locator('.checkpoint').last().innerText();
  h.note(`Final revision from visible checkpoint: ${checkpoint}`);
  await h.shot('final-revision');
  record(h, 'AEP-05', 'No browser console/page errors', String(h.errors.length), h.errors.length === 0);
} catch (error) {
  record(h, 'AEP', 'Integrated AEP flow completes', String(error.stack ?? error), false);
  await h.shot('failure');
}
await h.finish('AEP integrated player operation');
await h.close();
process.exitCode = h.rows.some((row) => row.status !== 'PASS') ? 1 : 0;
