// Recheck SES-09 and UI-02 through visible controls; product FAIL rows are recorded observations.
// Usage: node scripts/product-acceptance/run-fail-confirmation.mjs [artifactDir]
import { readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { open, click, newGame, selectUnit, record, where } from '../air-acceptance/harness.mjs';
import { openNewGame, configure, menuSummary } from './lib.mjs';

const evidenceDir = process.argv[2] ?? 'artifacts/fail-confirmation';
const h = await open({ evidenceDir, viewport: { width: 1680, height: 1050 } });
const { page } = h;
const observations = { dialogs: [] };
page.on('dialog', async dialog => {
  observations.dialogs.push({ type: dialog.type(), message: dialog.message() });
  await dialog.dismiss();
});
const timed = async (label, operation) => {
  const started = Date.now();
  const result = await operation();
  h.timings.push({ label, elapsed: Date.now() - started });
  return result;
};
const save = async name => {
  await click(h, '#open-menu');
  const [download] = await Promise.all([page.waitForEvent('download'), click(h, '#save-game')]);
  const path = join(evidenceDir, `${name}.json`);
  await download.saveAs(path);
  await click(h, '#close-utility');
  const file = JSON.parse(await readFile(path, 'utf8'));
  return { hash: file.finalStateHash, actions: file.acceptedActions.length, state: JSON.parse(file.currentSnapshot) };
};
try {
  // Setup reload: enter an unmistakably different width, then reload with the dialog still open.
  await openNewGame(h);
  await configure(h, { width: 20 });
  observations.setupBefore = { width: await page.inputValue('#new-game-width'), url: page.url() };
  await h.shot('setup-before-reload');
  await timed('Reload during setup', async () => {
    await page.reload();
    await page.waitForSelector('#new-game-width');
  });
  observations.setupAfter = { width: await page.inputValue('#new-game-width'), url: page.url() };
  await h.shot('setup-after-reload');
  await click(h, '#close-new-game');

  // Active reload: start a distinct package and accept a real mode change before leaving.
  await newGame(h, { width: 16, height: 12, scale: 'COMPACT', divisions: 2, armored: 1,
    air: 'NONE', turnLimit: 2, seeds: { map: 7101, oob: 7102, deployment: 7103, rules: 7104 } });
  await selectUnit(h, 'Brown TF');
  await click(h, '[data-mode="MOVE"]');
  const before = await save('active-before');
  observations.activeBefore = { summary: await menuSummary(h), where: await where(h), hash: before.hash,
    actions: before.actions, revision: before.state.revision };
  await h.shot('active-before-reload');
  await timed('Reload during active play', async () => {
    await page.reload();
    await page.waitForSelector('#open-menu');
  });
  const visible = await page.locator('body').innerText();
  const after = await save('active-after');
  observations.activeAfter = { summary: await menuSummary(h), where: await where(h), hash: after.hash,
    actions: after.actions, revision: after.state.revision,
    recoveryNotice: visible.match(/recover|restored|reload|lost|unsaved/i)?.[0] ?? null,
    storage: await page.evaluate(() => ({ local: localStorage.length, session: sessionStorage.length })) };
  await h.shot('active-after-reload');
  const silent = before.hash !== after.hash && !observations.activeAfter.recoveryNotice && observations.dialogs.length === 0;
  record(h, 'SES-09', 'Recovery behavior is explicit; no silent state substitution',
    JSON.stringify({ setupBefore: observations.setupBefore, setupAfter: observations.setupAfter,
      activeBefore: observations.activeBefore, activeAfter: observations.activeAfter, dialogs: observations.dialogs }), !silent);

  // Exact NG-07 at the failing supported desktop size; show all own roster rows normally.
  await newGame(h, { width: 18, height: 12, scale: 'LARGE', divisions: 4, armored: 2, air: 'NONE',
    turnLimit: 3, seeds: { map: 91001, oob: 91002, deployment: 91003, rules: 91004 } });
  await click(h, '#open-roster');
  observations.roster = await page.locator('.roster-text').evaluateAll(nodes => nodes.map(node => {
    const name = [...node.childNodes].filter(n => n.nodeType === Node.TEXT_NODE).map(n => n.textContent).join('').trim();
    const range = document.createRange(); range.selectNodeContents(node);
    const style = getComputedStyle(node);
    return { name, clientWidth: node.clientWidth, scrollWidth: node.scrollWidth,
      textOverflow: style.textOverflow, whiteSpace: style.whiteSpace,
      clipped: node.scrollWidth > node.clientWidth + 1 };
  }));
  observations.layout = await page.evaluate(() => ({ viewport: [innerWidth, innerHeight],
    pageOverflow: document.scrollingElement.scrollWidth > innerWidth || document.scrollingElement.scrollHeight > innerHeight,
    deckScrolls: document.querySelector('.command-rail').scrollHeight > document.querySelector('.command-rail').clientHeight + 1,
    mapVisible: !!document.querySelector('#hex-map')?.getClientRects().length,
    phaseVisible: !!document.querySelector('.phase-picker')?.getClientRects().length,
    endVisible: !!document.querySelector('#end-phase')?.getClientRects().length }));
  await h.shot('roster-clipped-names');
  const clipped = observations.roster.filter(row => row.clipped);
  observations.tooltips = [];
  for (const row of clipped) {
    await page.locator('[data-roster-name]').filter({ has: page.locator('.roster-text', { hasText: row.name }) }).hover();
    const tooltip = page.locator('#roster-name-tooltip');
    observations.tooltips.push({ name: row.name, visible: await tooltip.isVisible(), text: await tooltip.textContent() });
  }
  await h.shot('roster-full-name-tooltip');
  record(h, 'UI-02', 'Roster-name ellipses expose full names in tooltips; bounded lists only, map and commands reachable',
    JSON.stringify({ layout: observations.layout, clipped, tooltips: observations.tooltips }), observations.tooltips.every(t => t.visible && t.text === t.name) && !observations.layout.pageOverflow && !observations.layout.deckScrolls);
} catch (error) {
  record(h, 'RUN', 'Both failure boundaries can be inspected', String(error.stack ?? error), false);
  await h.shot('unexpected-failure');
}
await writeFile(join(evidenceDir, 'observations.json'), JSON.stringify(observations, null, 2));
await h.finish('SES-09 and UI-02 current failure confirmation');
const unexpected = h.rows.some(row => row.id === 'RUN') || h.errors.length;
await h.close();
if (unexpected) process.exitCode = 1;
