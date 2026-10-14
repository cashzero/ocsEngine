import { chromium } from 'playwright';
import { mkdir, rm, writeFile } from 'node:fs/promises';
import assert from 'node:assert/strict';

// Timed Breakdown (20.0) run on the built UI: default New Game, Allied and Axis divisions, through Game Turn 1.
// Needs `npm run build` and the UI served at 127.0.0.1:4391 (`OCS_UI_PORT=4391 node scripts/serve-ui.mjs`).
const out = process.argv[2] ?? 'artifacts/breakdowns-2026-10-03';
await rm(out, { recursive: true, force: true });
await mkdir(out, { recursive: true });
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1680, height: 1050 } });
const errors = [];
page.on('pageerror', (error) => errors.push(String(error)));
page.on('console', (message) => { if (message.type() === 'error') errors.push(message.text()); });
const steps = [];
const idle = () => page.waitForFunction(() => !document.querySelector('.deck-notice')?.textContent?.includes('Preparing action'), null, { timeout: 30000 });
/** Elapsed time from the input until `until` (a page predicate for the visible result) holds. */
const timed = async (operation, run, until = null) => {
  const start = performance.now();
  await run();
  if (until) await page.waitForFunction(until, null, { timeout: 30000 });
  await idle();
  const elapsedMs = Math.round(performance.now() - start);
  steps.push({ operation, elapsedMs });
  return elapsedMs;
};
const shot = (name) => page.screenshot({ path: `${out}/${name}.png` });
const text = (selector) => page.$eval(selector, (e) => e.innerText);
const unitsIs = (count) => `/\\(${count}\\)/.test(document.querySelector('#open-roster')?.textContent ?? '')`;
const units = async () => Number(/\((\d+)\)/u.exec(await text('#open-roster'))?.[1]);
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
const placeArrivals = async (hex) => {
  for (const id of await page.$$eval('[data-piece]', (els) => els.map((e) => e.dataset.piece))) {
    await page.click(`[data-piece="${id}"]`); await idle(); await clickHex(hex); await idle();
  }
};
const openRoster = async () => { if (!(await page.$('.roster-popup'))) { await page.click('#open-roster'); await page.waitForSelector('.roster-popup'); } };
const rosterIds = async () => { await openRoster(); return page.$$eval('[data-roster-pick]', (els) => els.map((e) => e.dataset.rosterPick)); };
const rosterNames = async () => { await openRoster(); return page.$$eval('.roster-unit', (els) => els.map((e) => e.getAttribute('aria-label'))); };
const pickFromRoster = async (pieceId) => { await openRoster(); await page.click(`[data-roster-pick="${pieceId}"]`); await idle(); };
const DETACH = '[data-unit-action^="BREAKDOWN:"]';
const handOver = async () => { await page.click('#begin-required-handoff'); await page.click('#complete-handoff'); await idle(); };
const endUntil = async (predicate, limit = 30) => {
  for (let i = 0; i < limit && !(await predicate()); i++) {
    for (const selector of ['#begin-required-handoff', '#complete-handoff', '#dismiss-result', '#dismiss-away', '#end-phase']) {
      const element = await page.$(`${selector}:not(:disabled)`);
      if (element && await element.isVisible()) { await element.click(); await idle(); await page.waitForTimeout(200); break; }
    }
  }
};
const closeRoster = async () => { if (await page.$('.roster-popup')) { await page.click('#close-roster'); await idle(); } };

const ALLIED_DIVISION = 'generated-oob:206569474:allied:f1-combat-1:unit';
const AXIS_DIVISION = 'generated-oob:206569474:axis:f1-combat-1:unit';
const result = {};
try {
  await page.goto('http://127.0.0.1:4391/');
  await page.waitForSelector('#open-menu');
  await page.click('#zoom-out'); await page.click('#zoom-out'); await page.waitForTimeout(400);
  await calibrate();
  await placeArrivals('0113');
  await page.click('#end-phase'); await idle();
  assert.match(await text('body'), /Movement/u);

  // A1: the division's Unit tab offers one Detach button.
  await timed('select 101.Abn from All units', () => pickFromRoster(ALLIED_DIVISION));
  result.alliedOffers = await page.$$eval('[data-unit-action]', (els) => els.map((e) => e.innerText));
  assert.deepEqual(result.alliedOffers, ['Detach a Breakdown (5-4-3, 1 RE; the division loses a step)']);
  await shot('01-allied-division-breakdowns');
  const before = await units();

  // A2: detach 1/101.Abn.
  await timed('detach 1/101.Abn', () => page.click(DETACH), unitsIs(before + 1));
  result.afterDetach = { units: await units(), notice: await text('.deck-notice') };

  // A3: the Breakdown is its own unit, numbered after the division, and can move this phase.
  result.rosterAfterDetach = await rosterNames();
  assert.ok(result.rosterAfterDetach.some((name) => name?.startsWith('1/101.Abn,')));
  const breakdownId = (await rosterIds()).find((id) => id?.includes('#breakdown'));
  await timed('select the Breakdown', () => pickFromRoster(breakdownId));
  result.breakdownStrip = (await text('.command-rail')).slice(0, 300);
  assert.match(result.breakdownStrip, /1\/101\.Abn/u);
  await shot('02-breakdown-selected');
  await timed('preview move to 0214', () => clickHex('0214'), "!!document.querySelector('.move-popup')");
  await timed('confirm move', () => page.click('#confirm-move'), "document.querySelector('.deck-notice')?.textContent?.includes('Moved to 0214')");

  // A4: detach 2/101.Abn and take it back with Undo.
  await pickFromRoster(ALLIED_DIVISION);
  const beforeExtra = await units();
  await timed('detach 2/101.Abn', () => page.click(DETACH), unitsIs(beforeExtra + 1));
  const withExtra = await units();
  await timed('Undo the detach', () => page.click('#undo-step'), unitsIs(withExtra - 1));
  result.undo = { before: withExtra, after: await units() };

  // A5: 2/101.Abn left with its reduced division is absorbed when the phase ends (20.0d).
  await pickFromRoster(ALLIED_DIVISION);
  const beforeSecond = await units();
  await timed('detach 2/101.Abn again', () => page.click(DETACH), unitsIs(beforeSecond + 1));
  result.rosterBeforeEnd = await rosterNames();
  assert.ok(result.rosterBeforeEnd.some((name) => name?.startsWith('2/101.Abn,')), 'Undo freed number 2');
  await closeRoster();
  result.warning = await page.$$eval('.absorb-note', (els) => els.map((e) => e.innerText));
  assert.ok(result.warning.some((line) => line.includes('When this phase ends: 2/101.Abn rejoins 101.Abn')), JSON.stringify(result.warning));
  await shot('03a-absorb-warning');
  const beforeEnd = await units();
  await page.click('#end-phase'); await idle();
  await timed('confirm End Movement Segment', () => page.click('#end-phase'), unitsIs(beforeEnd - 1));
  result.absorb = { before: beforeEnd, after: await units() };
  await page.click('[data-deck-tab="log"]'); await idle();
  result.alliedLog = await page.$$eval('.deck-event', (els) => els.slice(0, 6).map((e) => e.innerText.replace(/\s+/gu, ' ')));
  assert.ok(result.alliedLog.some((line) => line.includes('101.Abn absorbed 2/101.Abn and regained a step')));
  assert.ok(result.alliedLog.some((line) => line.includes('101.Abn detached 1/101.Abn')));
  await shot('03-allied-log-absorbed');

  // A6: the Axis commander's log does not reveal the detachment (4.9a).
  await endUntil(async () => !!(await page.$('#begin-required-handoff')));
  await timed('hand over to Axis', handOver, "!!document.querySelector('#dismiss-away')");
  result.axisAway = await text('.command-rail');
  assert.ok(result.axisAway.includes('An enemy unit reorganized'));
  assert.ok(!result.axisAway.includes('detached'));
  await shot('04-axis-away-report');
  await page.click('#dismiss-away'); await idle();

  // A7: Axis division (Luftwaffe pool) detaches 1/5.FJ, moves it, and the turn ends.
  await placeArrivals('3213');
  await page.click('#end-phase'); await idle();
  await timed('select 5.FJ from All units', () => pickFromRoster(AXIS_DIVISION));
  result.axisOffers = await page.$$eval('[data-unit-action]', (els) => els.map((e) => e.innerText));
  const beforeAxis = await units();
  await timed('detach 1/5.FJ', () => page.click(DETACH), unitsIs(beforeAxis + 1));
  assert.ok((await rosterNames()).some((name) => name?.startsWith('1/5.FJ,')));
  const axisBreakdown = (await rosterIds()).find((id) => id?.includes('axis') && id.includes('#breakdown'));
  await pickFromRoster(axisBreakdown);
  await shot('05-axis-breakdown-selected');
  await clickHex('3113'); await idle();
  await timed('confirm Axis Breakdown move', () => page.click('#confirm-move'), "document.querySelector('.deck-notice')?.textContent?.includes('Moved to 3113')");
  await endUntil(async () => (await text('body')).includes('TURN 2 /'), 40);
  result.final = (await text('body')).slice(0, 120).replace(/\s+/gu, ' ');
  assert.match(result.final, /TURN 2 \//u);
  await shot('06-turn-2');
} finally {
  result.steps = steps;
  result.consoleErrors = errors;
  await writeFile(`${out}/run.json`, JSON.stringify(result, null, 2));
  console.log(JSON.stringify(result, null, 2));
  await browser.close();
}
