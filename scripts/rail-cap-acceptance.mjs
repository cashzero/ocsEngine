// RAIL-11 to RAIL-14 (docs/quality/03-product-operation-verification-plan.md, docs/roadmap/15-rail-cap-wbs.md): Rail Cap
// operated through the real page in a real browser. Every step is a click, a key or a typed value on the page; every
// observation is read from the page.
//   npm run build && node scripts/rail-cap-acceptance.mjs [evidence-dir]
import { join } from 'node:path';
import { advanceTo, click, endPhase, gotoHex, handoff, has, open, placeArrivals, record, tab, textOf, where } from './air-acceptance/harness.mjs';

const evidenceDir = process.argv[2] ?? join('docs', 'quality', 'evidence', 'rail-cap-2026-10-08');
const h = await open({ evidenceDir });
const { page } = h;
// A map where an Allied unit starts at a station it can entrain from (about 4 seeds in 10 have one).
const seeds = { map: 9111, oob: 9112, deployment: 9113, rules: 9114 };

/** Printed hex number of an internal "q,r" id (presenter.ts printedHexLabel). */
const printed = (id) => { const [q, r] = id.split(',').map(Number); return `${String(q + Math.floor(r / 2) + 1).padStart(2, '0')}${String(r + 1).padStart(2, '0')}`; };
const railText = () => textOf(h, '.rail-panel');
const highlighted = () => page.evaluate(() => [...window.ocsMap.state.retreat]);
const rosterNames = async () => {
  await click(h, '#open-roster');
  const names = await page.evaluate(() => [...document.querySelectorAll('[data-roster-pick]')].map((node) => node.getAttribute('aria-label') ?? ''));
  await page.keyboard.press('Escape');
  await page.waitForTimeout(150);
  return names;
};
const pickRow = async (index) => {
  await click(h, '#open-roster');
  await page.locator('[data-roster-pick]').nth(index).click();
  await page.waitForTimeout(300);
};
/** The first own roster row whose Unit tab shows the rail panel, optionally with a rideable unit or SP to send. */
const findRailRow = async (wants) => {
  const names = await rosterNames();
  for (const [index, name] of names.entries()) {
    await pickRow(index);
    await tab(h, 'Unit').catch(() => {});
    if (!(await has(h, '.rail-panel'))) continue;
    if (await wants()) return { index, name };
  }
  return null;
};

try {
  // ── New Game: Rail Cap set on the form, visibly different from the default ───────────────────────────────
  await page.click('#open-menu');
  await page.click('#open-new-game');
  await page.waitForSelector('#new-game-rail-cap-allied');
  await page.selectOption('#new-game-engagement', 'ALLIED_ATTACKS');
  for (const [id, value] of [['width', 32], ['height', 24], ['divisions', 4], ['armored', 1], ['turn-limit', 4]]) { await page.fill(`#new-game-${id}`, String(value)); await page.press(`#new-game-${id}`, 'Tab'); }
  await page.selectOption('#new-game-air', 'NONE');
  const defaults = { allied: await page.inputValue('#new-game-rail-cap-allied'), axis: await page.inputValue('#new-game-rail-cap-axis') };
  const help = await page.evaluate(() => [...document.querySelectorAll('.field-help')].map((node) => node.textContent.replace(/\s+/g, ' ').trim()).find((text) => /by rail/u.test(text)) ?? '');
  // Default 0.4 point per division: the Allied attacker fields 6 divisions (1.5 × 4) → 2, the Axis defender 4 → 2.
  record(h, 'RAIL-11', 'The form shows each side\'s default Rail Cap (0.4 per division: Allied 2, Axis 2) and what it is for',
    `Allied ${defaults.allied}, Axis ${defaults.axis}; help: "${help}"`, defaults.allied === '2' && defaults.axis === '2' && /Movement Phase/u.test(help) && /0\.4 point per division/u.test(help));
  await page.fill('#new-game-rail-cap-allied', '5'); await page.press('#new-game-rail-cap-allied', 'Tab');
  await page.fill('#new-game-rail-cap-axis', '1'); await page.press('#new-game-rail-cap-axis', 'Tab');
  for (const [name, seed] of Object.entries(seeds)) { await page.fill(`#new-game-${name}-seed`, String(seed)); await page.press(`#new-game-${name}-seed`, 'Tab'); }
  await page.click('button[form="new-game-form"]');
  await page.waitForFunction(() => !!document.querySelector('#start-previewed-game:not([disabled])'), { timeout: 60000 });
  await page.waitForTimeout(600);
  const previewCap = await page.evaluate(() => [...document.querySelectorAll('.operation-metrics div')].find((node) => node.querySelector('dt')?.textContent === 'Rail Cap')?.querySelector('dd')?.textContent ?? '');
  await h.shot('preview');
  record(h, 'RAIL-11', 'The preview shows the Rail Cap the player set (Allied 5, Axis 1)', previewCap, /Allied 5/u.test(previewCap) && /Axis 1/u.test(previewCap));
  await page.click('#start-previewed-game');
  await page.waitForSelector('.turn-strip', { timeout: 60000 });
  await page.waitForTimeout(500);
  h.note(`New Game: Allied attack, 32×24, Compact, 4 divisions (1 armored), no air forces, 4 turns, Rail Cap Allied 5 / Axis 1, seeds ${JSON.stringify(seeds)}`);

  // ── Turn 1, Allied Movement: a unit by rail ───────────────────────────────────────────────────────────────
  await advanceTo(h, (state) => /Movement/u.test(state.phase) && /Allied/u.test(state.player) && !state.handoff);
  const found = await findRailRow(async () => (await page.locator('.rail-panel [data-rail-unit]:not([disabled])').count()) > 0);
  if (!found) throw new Error('No Allied unit stands where it can entrain.');
  const first = await railText();
  h.note(`Rail panel for ${found.name}: ${first.slice(0, 300)}`);
  record(h, 'RAIL-12', 'Selecting a unit at a station shows Rail from <hex> with the Rail Cap left (5 of 5)', first.slice(0, 160), /Rail from \d{4}/u.test(first) && /Rail Cap 5 of 5 left/u.test(first));
  const unitBox = page.locator('.rail-panel [data-rail-unit]:not([disabled])').first();
  const unitId = await unitBox.getAttribute('data-rail-unit');
  await unitBox.check();
  await page.waitForTimeout(250);
  const destinations = await highlighted();
  record(h, 'RAIL-12', 'The stations the cargo can reach are highlighted on the map', `${destinations.length} highlighted: ${destinations.slice(0, 6).map(printed).join(', ')}`, destinations.length > 0);
  // The farthest highlighted station from the entraining hex, picked with the map's own cursor.
  const fromLabel = first.match(/Rail from (\d{4})/u)[1];
  const far = destinations.map(printed).sort((left, right) => {
    const d = (label) => Math.abs(Number(label.slice(0, 2)) - Number(fromLabel.slice(0, 2))) + Math.abs(Number(label.slice(2)) - Number(fromLabel.slice(2)));
    return d(right) - d(left);
  })[0];
  const started = Date.now();
  await gotoHex(h, far, { enter: true });
  const ready = await railText();
  await h.shot('rail-unit-ready');
  record(h, 'RAIL-12', 'Clicking a highlighted station picks it and the panel prices the move', ready.match(/Costs [^R]+Rail Cap left/u)?.[0] ?? ready.slice(0, 200), /Costs .* of 5 Rail Cap left/u.test(ready));
  await click(h, '#confirm-rail', { settle: 600 });
  const elapsed = Date.now() - started;
  const notice = (await where(h)).notice;
  await h.shot('rail-unit-done');
  record(h, 'RAIL-12', 'Move by rail: the unit detrains at the station and the notice names the cost', `${notice} (${elapsed} ms from map click to result)`, new RegExp(`to ${far}`, 'u').test(notice) && /Rail Cap/u.test(notice));
  // The unit now stands at the station and may not move again (13.3e).
  const onMap = await page.evaluate((id) => window.ocsMap.state.counters.find((counter) => counter.pieceId === id)?.hexId ?? null, unitId);
  record(h, 'RAIL-12', 'The unit is drawn at the destination station', `${unitId} at ${onMap ? printed(onMap) : 'unknown'}`, onMap !== null && printed(onMap) === far);

  // ── The rest of Game Turn 1, both players, hand-offs and decisions as the page asks ──────────────────────
  const turn1 = [];
  await advanceTo(h, async (state) => {
    turn1.push(`${state.player} ${state.phase}`);
    return /Turn 2/u.test(state.turn);
  }, { limit: 200 });
  record(h, 'RAIL-13', 'Game Turn 1 is played to its end through both players\' phases and hand-offs', `${[...new Set(turn1)].length} steps seen; now ${(await where(h)).turn}`, /Turn 2/u.test((await where(h)).turn));

  // ── Turn 2: new SP arrive at a rail entry and go forward "off-map" (13.6b) ───────────────────────────────
  await advanceTo(h, (state) => /Reinforcement/u.test(state.phase) && /Allied/u.test(state.player) && !state.handoff, { limit: 200 });
  await tab(h, 'Arrivals').catch(() => {});
  await placeArrivals(h);
  await advanceTo(h, (state) => /Movement/u.test(state.phase) && /Allied/u.test(state.player) && !state.handoff, { limit: 50 });
  const supplyRow = await findRailRow(async () => /arrivals may entrain here/u.test(await railText()) && (await page.locator('.rail-panel [data-rail-dump]').count()) > 0);
  if (!supplyRow) throw new Error('No arrival dump at a rail entry offers rail transport.');
  const offMap = await railText();
  record(h, 'RAIL-14', 'The new SP at the rail entry show the rail panel, saying this turn\'s arrivals may entrain there (13.6b)', offMap.match(/Rail Cap .*?13\.6b/u)?.[0] ?? offMap.slice(0, 200), /arrivals may entrain here/u.test(offMap));
  const field = page.locator('.rail-panel [data-rail-dump]').first();
  const maxTokens = Number(await field.getAttribute('max'));
  const send = Math.min(maxTokens, 8);
  await field.fill(String(send));
  await field.press('Tab');
  await page.waitForTimeout(250);
  const spDestinations = (await highlighted()).map(printed);
  const spFrom = offMap.match(/Rail from (\d{4})/u)[1];
  const spTarget = spDestinations.sort((left, right) => Math.abs(Number(right.slice(0, 2)) - Number(spFrom.slice(0, 2))) - Math.abs(Number(left.slice(0, 2)) - Number(spFrom.slice(0, 2))))[0];
  await gotoHex(h, spTarget, { enter: true });
  const spReady = await railText();
  await h.shot('rail-sp-ready');
  await click(h, '#confirm-rail', { settle: 600 });
  const spNotice = (await where(h)).notice;
  await h.shot('rail-sp-done');
  record(h, 'RAIL-14', `${send}T of the new SP go by rail from the entry to ${spTarget}`, `${spReady.match(/Costs [^R]+Rail Cap left/u)?.[0] ?? ''} → ${spNotice}`, new RegExp(`Moved ${send}T by rail`, 'u').test(spNotice));
  // What is left of Rail Cap shows where the next cargo would entrain.
  await handoff(h);
  h.note(`Final position: ${JSON.stringify(await where(h))}`);
} catch (error) {
  h.note(`Run stopped: ${error instanceof Error ? error.stack : error}`);
  await h.shot('stopped').catch(() => {});
} finally {
  await h.finish('Rail Cap through the page (RAIL-11 to RAIL-14)');
  await h.close();
  const failed = (h.rows ?? []).filter(({ status }) => status !== 'PASS');
  console.log(`${(h.rows ?? []).length} observations, ${failed.length} failed, ${h.errors.length} page errors`);
  process.exitCode = failed.length > 0 || h.errors.length > 0 ? 1 : 0;
}
