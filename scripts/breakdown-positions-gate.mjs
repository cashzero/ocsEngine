import { chromium } from 'playwright';
import { mkdir, writeFile } from 'node:fs/promises';
import assert from 'node:assert/strict';

// Breakdown UI run from test positions: absorption warning and owner's choice (save A), retreat/advance Breakdowns (save B).
// Needs `npm run build`, `node scripts/breakdown-make-saves.mjs`, and the UI served at 127.0.0.1:4391
// (`OCS_UI_PORT=4391 node scripts/serve-ui.mjs`). Starts a New Game with 5 formations per side, then loads each save
// through Menu > Load save and plays it with clicks only.
const out = process.argv[2] ?? 'artifacts/breakdowns-2026-10-03/positions';
await mkdir(out, { recursive: true });
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1680, height: 1050 } });
const errors = [];
page.on('pageerror', (error) => errors.push(String(error)));
page.on('console', (message) => { if (message.type() === 'error') errors.push(message.text()); });
const steps = []; const result = { decisions: [] };
const idle = () => page.waitForFunction(() => !document.querySelector('.deck-notice')?.textContent?.includes('Preparing action'), null, { timeout: 30000 });
const timed = async (operation, run, until = null) => {
  const start = performance.now(); await run();
  if (until) await page.waitForFunction(until, null, { timeout: 30000 });
  await idle(); steps.push({ operation, elapsedMs: Math.round(performance.now() - start) });
};
const shot = (name) => page.screenshot({ path: `${out}/${name}.png` });
const text = (selector) => page.$eval(selector, (e) => e.innerText);
const units = async () => Number(/\((\d+)\)/u.exec(await text('#open-roster'))?.[1]);
const unitsIs = (count) => `/\\(${count}\\)/.test(document.querySelector('#open-roster')?.textContent ?? '')`;
let grid = null;
const hoverLabel = async (x, y) => { await page.mouse.move(x, y); await page.waitForTimeout(25); return /Hex (\d{4})/u.exec(await text('.hover-info'))?.[1] ?? null; };
const calibrate = async () => {
  const map = await page.$eval('canvas', (c) => { const r = c.getBoundingClientRect(); return { x: r.x, y: r.y, width: r.width, height: r.height }; });
  const samples = [];
  for (let i = 0; i < 12; i++) for (let j = 0; j < 9; j++) {
    const x = map.x + 120 + i * (map.width - 240) / 11; const y = map.y + 120 + j * (map.height - 240) / 8;
    const label = await hoverLabel(x, y);
    if (label) { const r = Number(label.slice(2)) - 1; samples.push({ x, y, a: Number(label.slice(0, 2)) - 1 - Math.floor(r / 2) + r / 2, r }); }
  }
  const fit = (pairs) => { const n = pairs.length; const sx = pairs.reduce((s, [a]) => s + a, 0); const sy = pairs.reduce((s, [, b]) => s + b, 0);
    const sxx = pairs.reduce((s, [a]) => s + a * a, 0); const sxy = pairs.reduce((s, [a, b]) => s + a * b, 0);
    const slope = (n * sxy - sx * sy) / (n * sxx - sx * sx); return { slope, intercept: (sy - slope * sx) / n }; };
  grid = { fx: fit(samples.map((s) => [s.a, s.x])), fy: fit(samples.map((s) => [s.r, s.y])) };
};
const clickHex = async (label) => {
  const r = Number(label.slice(2)) - 1; const a = Number(label.slice(0, 2)) - 1 - Math.floor(r / 2) + r / 2;
  const x = grid.fx.intercept + grid.fx.slope * a; const y = grid.fy.intercept + grid.fy.slope * r;
  assert.equal(await hoverLabel(x, y), label, `pointer is over ${label}`);
  await page.mouse.click(x, y);
};
const openRoster = async () => { if (!(await page.$('.roster-popup'))) { await page.click('#open-roster'); await page.waitForSelector('.roster-popup'); } };
const closeRoster = async () => { if (await page.$('.roster-popup')) { await page.click('#close-roster'); await idle(); } };
const rosterPick = async (label) => {
  await openRoster();
  const id = await page.$$eval('.roster-unit', (els, wanted) => els.find((e) => e.getAttribute('aria-label')?.startsWith(`${wanted},`))?.dataset.rosterPick ?? null, label);
  assert.ok(id, `roster has ${label}`);
  await page.click(`[data-roster-pick="${id}"]`); await idle();
};
const DETACH = '[data-unit-action^="BREAKDOWN:"]';
const moveTo = async (label, hex) => {
  await rosterPick(label);
  await timed(`move ${label} to ${hex}`, async () => { await clickHex(hex); await page.waitForSelector('#confirm-move'); await page.click('#confirm-move'); },
    `document.querySelector('.deck-notice')?.textContent?.includes('Moved to ${hex}')`);
};
const handOver = async () => {
  for (const selector of ['#begin-required-handoff', '#complete-handoff', '#dismiss-away', '#dismiss-result']) {
    const element = await page.$(`${selector}:not(:disabled)`);
    if (element && await element.isVisible()) { await element.click(); await idle(); await page.waitForTimeout(150); return true; }
  }
  return false;
};
/** Answer decisions (handing the screen over as needed) with the first matching rule, until none is open. */
const answerDecisions = async (rules, limit = 30) => {
  for (let i = 0; i < limit; i++) {
    if (await handOver()) continue;
    let options = await page.$$eval('[data-choice]', (els) => els.map((e) => ({ id: e.dataset.choice, label: e.innerText.trim() })));
    if (options.length === 0) {
      // A decision or hand-over may still be rendering after the last click.
      await page.waitForSelector('[data-choice], #begin-required-handoff, #complete-handoff', { timeout: 2000 }).catch(() => {});
      if (await page.$('#begin-required-handoff, #complete-handoff')) continue;
      options = await page.$$eval('[data-choice]', (els) => els.map((e) => ({ id: e.dataset.choice, label: e.innerText.trim() })));
      if (options.length === 0) return;
    }
    const prompt = (await page.$eval('.decision, .deck-decision, [class*="decision"]', (e) => e.innerText.split('\n').slice(0, 3).join(' ')).catch(() => ''));
    const rule = rules.find((candidate) => candidate.when(options) !== undefined);
    const choice = rule ? rule.when(options) : options[0];
    result.decisions.push({ prompt: prompt.slice(0, 160), options: options.map(({ label }) => label), chose: choice.label });
    if (rule?.shot) await shot(rule.shot);
    if (rule?.once) rules.splice(rules.indexOf(rule), 1);
    await timed(`decide: ${choice.label}`, () => page.click(`[data-choice="${choice.id}"]`));
    await page.waitForTimeout(150);
  }
};
const loadSave = async (file) => {
  await page.click('#open-menu');
  const [chooser] = await Promise.all([page.waitForEvent('filechooser'), page.click('#load-game')]);
  await timed(`load ${file}`, () => chooser.setFiles(file), "document.querySelector('.deck-notice')?.textContent?.includes('Save loaded')");
};

try {
  await page.goto('http://127.0.0.1:4391/');
  await page.waitForSelector('#open-menu');
  // New Game with 5 formations per side (three US divisions), as the saves were made.
  await page.click('#open-menu'); await page.click('#open-new-game');
  await page.fill('#new-game-formations', '5'); await page.press('#new-game-formations', 'Tab');
  await page.click('button[form="new-game-form"]');
  await page.waitForSelector('#start-previewed-game:not(:disabled)', { timeout: 60000 });
  await page.click('#start-previewed-game');
  await page.waitForFunction(() => !document.querySelector('.new-game-dialog'), null, { timeout: 60000 });
  await idle();

  // ── Save A: Allied Movement Phase ──
  await loadSave('tmp/breakdown-ui/save-A.json');
  await handOver();
  await page.click('#zoom-out'); await page.click('#zoom-out'); await page.waitForTimeout(400);
  await calibrate();
  // 90.Inf and 13.Abn each detach a Breakdown and send it away, so both are reduced.
  for (const [division, away] of [['90.Inf', '1512'], ['13.Abn', '1613']]) {
    await rosterPick(division);
    const before = await units();
    await timed(`detach from ${division}`, () => page.click(DETACH), unitsIs(before + 1));
    await moveTo(`1/${division}`, away);
  }
  // 101.Abn's Breakdown joins them in 1612: two reduced units of its pool could absorb it, and neither is 101.Abn.
  await rosterPick('101.Abn');
  const beforeAbn = await units();
  await timed('detach from 101.Abn', () => page.click(DETACH), unitsIs(beforeAbn + 1));
  await moveTo('1/101.Abn', '1612');
  await closeRoster();
  result.warning = await page.$$eval('.absorb-note', (els) => els.map((e) => e.innerText));
  assert.ok(result.warning.some((line) => line.includes('1/101.Abn is absorbed by 90.Inf or 13.Abn (you choose)')), JSON.stringify(result.warning));
  await shot('A1-warning-before-end');
  const beforeEnd = await units();
  await page.click('#end-phase'); await idle();
  if ((await text('#end-phase')).includes('Finish anyway')) await page.click('#end-phase');
  await page.waitForSelector('[data-choice]', { timeout: 30000 });
  await answerDecisions([{ when: (options) => options.find(({ label }) => label === '13.Abn absorbs 1/101.Abn'), shot: 'A2-absorber-choice', once: true }]);
  result.afterChoice = { units: await units(), before: beforeEnd };
  await page.click('[data-deck-tab="log"]').catch(() => {}); await idle();
  result.logA = await page.$$eval('.deck-event', (els) => els.slice(0, 4).map((e) => e.innerText.replace(/\s+/gu, ' ')));
  assert.ok(result.logA.some((line) => line.includes('13.Abn absorbed 1/101.Abn and regained a step')), JSON.stringify(result.logA));
  await shot('A3-log');

  // ── Save B: Allied Combat Segment against 246.VG ──
  await loadSave('tmp/breakdown-ui/save-B.json');
  await handOver();
  await calibrate();
  await rosterPick('90.Inf');
  await closeRoster();
  await timed('plan attack on 1712', () => clickHex('1712'), "!!document.querySelector('#declare-draft')");
  for (const id of await page.$$eval('[data-participant]', (els) => els.filter((e) => !e.checked).map((e) => e.dataset.participant))) {
    await page.click(`[data-participant="${id}"]`); await idle();
  }
  await shot('B1-attack-draft');
  await timed('declare attack', () => page.click('#declare-draft'));
  await page.waitForTimeout(800);
  await shot('B1b-after-declare');
  result.afterDeclare = { buttons: await page.$$eval('button', (els) => els.filter((e) => e.offsetParent).map((e) => `${e.id}|${e.className}|${e.innerText.trim().slice(0, 60)}`)) };
  console.log(JSON.stringify(result.afterDeclare));
  const rules = [
    { when: (options) => options.find(({ label }) => /^Retreat 1 hex$/u.test(label)) },
    { when: (options) => options.find(({ label }) => label.startsWith('Detach a Breakdown from 246.VG')), shot: 'B2-retreat-breakdown', once: true },
    { when: (options) => options.find(({ label }) => label === 'Retreat the units separately'), shot: 'B3-retreat-split', once: true },
    { when: (options) => options.find(({ label }) => /retreats to/u.test(label)) },
    { when: (options) => options.find(({ label }) => label.startsWith('Detach a Breakdown from 90.Inf')), shot: 'B4-advance-breakdown', once: true },
    { when: (options) => options.find(({ label }) => /^Advance 2\/90\.Inf$|^Advance 1\/90\.Inf$/u.test(label)), shot: 'B5-advance-the-breakdown', once: true },
    { when: (options) => options.find(({ label }) => /Stop advancing|Do not advance/u.test(label)) },
  ];
  await answerDecisions(rules, 40);
  await page.click('[data-deck-tab="log"]').catch(() => {}); await idle();
  result.logB = await page.$$eval('.deck-event', (els) => els.slice(0, 6).map((e) => e.innerText.replace(/\s+/gu, ' ')));
  await openRoster();
  result.rosterB = await page.$$eval('.roster-unit', (els) => els.map((e) => e.getAttribute('aria-label')));
  await shot('B6-after-combat');
} finally {
  result.steps = steps; result.consoleErrors = errors;
  await writeFile(`${out}/run.json`, JSON.stringify(result, null, 2));
  console.log(JSON.stringify(result, null, 2));
  await browser.close();
}
