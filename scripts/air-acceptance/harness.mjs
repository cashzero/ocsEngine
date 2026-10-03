// Drives the real command deck in a real browser (Playwright Chromium) for the AIR acceptance rows of
// docs/quality/03-product-operation-verification-plan.md. Nothing here touches the rule engine: every step is a click,
// a selection or a typed value on the page, and every observation is read from the page.
import { mkdir, writeFile } from 'node:fs/promises';
import { createServer } from 'node:http';
import { createReadStream, existsSync, statSync } from 'node:fs';
import { extname, join, normalize } from 'node:path';
import { chromium } from 'playwright';

const root = process.cwd();
const types = new Map([
  ['.css', 'text/css; charset=utf-8'], ['.html', 'text/html; charset=utf-8'], ['.js', 'text/javascript; charset=utf-8'],
  ['.json', 'application/json; charset=utf-8'], ['.map', 'application/json; charset=utf-8'], ['.svg', 'image/svg+xml'],
]);

/** Serves the built UI (web/ and dist/) on a free port. */
export const serve = () => new Promise((resolve) => {
  const server = createServer((request, response) => {
    const pathname = new URL(request.url ?? '/', 'http://localhost').pathname;
    const relative = pathname === '/' ? 'web/index.html' : decodeURIComponent(pathname).replace(/^\/+/, '');
    const resolved = normalize(join(root, relative));
    if (!resolved.startsWith(root) || !existsSync(resolved) || !statSync(resolved).isFile()) { response.writeHead(404); response.end('Not found'); return; }
    response.writeHead(200, { 'content-type': types.get(extname(resolved)) ?? 'application/octet-stream', 'cache-control': 'no-store' });
    createReadStream(resolved).pipe(response);
  });
  server.listen(0, '127.0.0.1', () => resolve({ url: `http://127.0.0.1:${server.address().port}/`, close: () => server.close() }));
});

export const open = async ({ evidenceDir, viewport = { width: 1920, height: 1080 } }) => {
  await mkdir(evidenceDir, { recursive: true });
  const server = await serve();
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport });
  const log = [];
  const errors = [];
  page.on('pageerror', (error) => errors.push(`pageerror: ${error}`));
  page.on('console', (message) => { if (message.type() === 'error') errors.push(`console: ${message.text()}`); });
  await page.goto(server.url);
  await page.waitForSelector('#open-menu', { timeout: 30000 });
  let shots = 0;
  const api = {
    page, errors, log, rows: [], timings: [],
    note: (text) => { log.push(text); console.log(`  · ${text}`); },
    shot: async (name) => {
      shots += 1;
      const file = `${String(shots).padStart(2, '0')}-${name}.jpg`;
      await page.screenshot({ path: join(evidenceDir, file), type: 'jpeg', quality: 70 });
      log.push(`screenshot ${file}`);
      return file;
    },
    close: async () => { await browser.close(); server.close(); },
    finish: async (title) => {
      // Where the run ended, as the page shows it (the state revision is printed only on the Game End dialog).
      const final = await page.evaluate(() => ({
        turn: document.querySelector('.turn-cell small')?.textContent.replace(/\s+/g, ' ').trim() ?? '',
        player: document.querySelector('.phase-picker small')?.textContent.trim() ?? '',
        phase: document.querySelector('.phase-picker strong')?.textContent.replace('▾', '').trim() ?? '',
        revision: document.querySelector('.game-end-reason')?.textContent.match(/final revision (\d+)/)?.[1] ?? null,
      })).catch(() => null);
      await writeFile(join(evidenceDir, 'results.json'), JSON.stringify({ title, final, rows: api.rows ?? [], timings: api.timings ?? [], errors }, null, 2));
      await writeFile(join(evidenceDir, 'log.md'), `# ${title}\n\n${log.map((line) => `- ${line}`).join('\n')}\n\nEnded at: ${final ? `${final.turn}, ${final.player}, ${final.phase}${final.revision ? `, final revision ${final.revision}` : ''}` : 'unknown'}\n\nConsole/page errors: ${errors.length}\n${errors.map((line) => `- ${line}`).join('\n')}\n`);
    },
  };
  return api;
};

/** New Game through the form: every field is set on the page, then the previewed package is started. */
export const newGame = async (h, options = {}) => {
  const { page } = h;
  const set = async (id, value) => { if (value !== undefined) await page.selectOption(`#new-game-${id}`, String(value)); };
  const type = async (id, value) => { if (value !== undefined) { await page.fill(`#new-game-${id}`, String(value)); await page.press(`#new-game-${id}`, 'Tab'); } };
  await page.click('#open-menu');
  await page.click('#open-new-game');
  await page.waitForSelector('#new-game-air');
  await set('style', options.style);
  await type('width', options.width ?? 18);
  await type('height', options.height ?? 12);
  await set('scale', options.scale ?? 'STANDARD');
  await type('divisions', options.divisions ?? 3);
  await type('armored', options.armored ?? 1);
  await set('air', options.air ?? 'STANDARD');
  if ((options.air ?? 'STANDARD') === 'STANDARD') {
    await set('air-transport', options.transport ?? 'STANDARD');
    await set('air-support', options.support ?? 'STANDARD');
  }
  await type('turn-limit', options.turnLimit ?? 8);
  await set('start-month', options.month);
  if (options.seeds) {
    await page.click('[data-settings="advanced"]');
    for (const [name, seed] of Object.entries(options.seeds)) await type(`${name}-seed`, seed);
    await page.click('[data-settings="basic"]');
  }
  await page.waitForFunction(() => !!document.querySelector('#start-previewed-game:not([disabled])'), { timeout: 30000 });
  await page.waitForTimeout(800);
  const preview = await page.evaluate(() => document.querySelector('.new-game-form, #new-game-form')?.closest('dialog, .new-game, section, div')?.textContent?.replace(/\s+/g, ' ').slice(0, 1200) ?? '');
  if (options.onPreview) await options.onPreview(preview);
  await page.click('#start-previewed-game');
  await page.waitForSelector('.turn-strip', { timeout: 30000 });
  await page.waitForTimeout(500);
};

/** Turn, player and phase as the page prints them. */
export const where = (h) => h.page.evaluate(() => ({
  turn: document.querySelector('.turn-cell small')?.textContent.replace(/\s+/g, ' ').trim() ?? '',
  player: document.querySelector('.phase-picker small')?.textContent.trim() ?? '',
  phase: document.querySelector('.phase-picker strong')?.textContent.replace('▾', '').trim() ?? '',
  seat: document.querySelector('.topbar')?.dataset.activeSeat ?? '',
  end: document.querySelector('#end-phase')?.textContent.replace(/\s+/g, ' ').trim() ?? '',
  endDisabled: document.querySelector('#end-phase')?.disabled ?? true,
  notice: document.querySelector('.deck-notice')?.textContent.replace(/\s+/g, ' ').trim() ?? '',
  handoff: !!document.querySelector('#begin-required-handoff'),
  complete: !!document.querySelector('#complete-handoff'),
  decision: [...document.querySelectorAll('[data-choice]')].map((node) => node.textContent.replace(/\s+/g, ' ').trim()),
}));

const visible = (h, selector) => h.page.evaluate((sel) => { const e = document.querySelector(sel); return !!e && e.offsetParent !== null; }, selector);

/** Click a control by selector, failing when it is missing, hidden or disabled. */
export const click = async (h, selector, options = {}) => {
  const locator = h.page.locator(selector).first();
  await locator.waitFor({ state: 'visible', timeout: options.timeout ?? 8000 });
  if (await locator.isDisabled()) throw new Error(`Control is disabled: ${selector}`);
  await locator.click();
  await h.page.waitForTimeout(options.settle ?? 250);
};

export const textOf = (h, selector) => h.page.evaluate((sel) => document.querySelector(sel)?.innerText.replace(/\s+/g, ' ').trim() ?? '', selector);
export const has = (h, selector) => visible(h, selector);

/** Hand the screen over when the game asks for it, then continue. */
export const handoff = async (h) => {
  for (let guard = 0; guard < 6; guard += 1) {
    if (await has(h, '#begin-required-handoff')) { await click(h, '#begin-required-handoff'); continue; }
    if (await has(h, '#complete-handoff')) { await click(h, '#complete-handoff'); continue; }
    // The report of what the other side did while this seat was away covers the deck until it is read.
    if (await has(h, '#dismiss-away')) { await click(h, '#dismiss-away'); continue; }
    return;
  }
};

/** End the current step as the page offers it (a second press confirms ending with units unmoved). */
export const endPhase = async (h) => {
  await handoff(h);
  const before = await where(h);
  await click(h, '#end-phase');
  await h.page.waitForTimeout(300);
  const middle = await where(h);
  if (middle.phase === before.phase && middle.player === before.player && !middle.handoff && !middle.complete && middle.decision.length === 0) {
    if (await has(h, '#end-phase')) await click(h, '#end-phase');
  }
  await handoff(h);
  return where(h);
};

/** Pick the deck tab with this label. */
export const tab = async (h, label) => {
  const target = h.page.locator('[data-deck-tab]', { hasText: new RegExp(`^\\s*${label}`, 'u') }).first();
  await target.waitFor({ state: 'visible', timeout: 8000 });
  await target.click();
  await h.page.waitForTimeout(200);
};

export const tabs = (h) => h.page.evaluate(() => [...document.querySelectorAll('[data-deck-tab]')].map((node) => node.textContent.replace(/\s+/g, ' ').trim()));

/** Answer a pending decision by the label (or part of it) of the option. */
export const choose = async (h, matcher) => {
  const options = h.page.locator('[data-choice]');
  const count = await options.count();
  for (let index = 0; index < count; index += 1) {
    const text = (await options.nth(index).innerText()).replace(/\s+/g, ' ').trim();
    if (typeof matcher === 'function' ? matcher(text, index) : text.includes(matcher)) { await options.nth(index).click(); await h.page.waitForTimeout(300); return text; }
  }
  throw new Error(`No decision option matches ${String(matcher)}; options: ${await options.allInnerTexts()}`);
};

/** Play through pending decisions with a rule (first option unless the rule picks) until none remain. */
export const settleDecisions = async (h, pick = () => 0, limit = 60) => {
  const taken = [];
  for (let guard = 0; guard < limit; guard += 1) {
    await handoff(h);
    const state = await where(h);
    if (state.decision.length === 0) return taken;
    const index = pick(state.decision, taken.length);
    taken.push(state.decision[index] ?? state.decision[0]);
    await h.page.locator('[data-choice]').nth(index ?? 0).click();
    await h.page.waitForTimeout(300);
  }
  throw new Error('Decisions did not settle.');
};

/**
 * Like settleDecisions, but each answer is recorded with the seat that gave it and whether the screen had to be handed
 * over first. `pick(prompt, options, seat)` returns the option index (default 0).
 */
export const settleLogged = async (h, pick = () => 0, limit = 60) => {
  const steps = [];
  for (let guard = 0; guard < limit; guard += 1) {
    const handed = (await has(h, '#begin-required-handoff')) || (await has(h, '#complete-handoff'));
    await handoff(h);
    const state = await where(h);
    if (state.decision.length === 0) return steps;
    const prompt = await textOf(h, '.decision-panel h2');
    const index = pick(prompt, state.decision, state.seat) ?? 0;
    steps.push({ seat: state.seat, handedOver: handed, prompt, options: state.decision, chosen: state.decision[index] });
    h.note(`${state.seat}${handed ? ' (after a handoff)' : ''}: ${prompt} → ${state.decision[index]}`);
    await h.page.locator('[data-choice]').nth(index).click();
    await h.page.waitForTimeout(300);
  }
  throw new Error('Decisions did not settle.');
};

/** Select a unit through the roster (All units), by a text it contains. */
export const selectUnit = async (h, text, index = 0) => {
  await click(h, '#open-roster');
  const rows = h.page.locator('[data-roster-pick]', { hasText: text });
  await rows.nth(index).waitFor({ state: 'visible', timeout: 8000 });
  await rows.nth(index).click();
  await h.page.waitForTimeout(300);
};

/** Place every arriving reinforcement: select its row in the Arrivals tab, then choose an entry hex chip (`prefer` may pick the hex). */
export const placeArrivals = async (h, prefer = (hexes) => hexes[0]) => {
  for (let guard = 0; guard < 12; guard += 1) {
    const rows = h.page.locator('.arrivals .deck-unit[data-piece]');
    if ((await rows.count()) === 0) return;
    await rows.first().click();
    await h.page.waitForTimeout(250);
    const hexes = await h.page.evaluate(() => [...document.querySelectorAll('.hex-chips [data-target-hex]')].map((node) => ({ id: node.dataset.targetHex, text: node.textContent.trim() })));
    if (hexes.length === 0) throw new Error('No entry hex offered for the selected arrival.');
    const chosen = prefer(hexes) ?? hexes[0];
    await h.page.locator(`.hex-chips [data-target-hex="${chosen.id}"]`).first().click();
    await h.page.waitForTimeout(300);
  }
};

/** Rows are recorded as the run goes: the expectation, what was observed, and whether they agree. */
export const record = (h, id, expectation, observed, ok) => {
  const row = { id, expectation, observed, status: ok ? 'PASS' : 'FAIL' };
  (h.rows ??= []).push(row);
  h.log.push(`${row.status} ${id}: ${expectation} — observed: ${observed}`);
  console.log(`  ${ok ? '✔' : '✘'} ${id}: ${expectation} — ${observed}`);
  return ok;
};

/** Elapsed milliseconds for an operation; the budget of the plan is 1,500 ms for an action and 1,000 ms for a panel. */
export const timed = async (h, label, fn) => {
  const started = Date.now();
  const value = await fn();
  const elapsed = Date.now() - started;
  (h.timings ??= []).push({ label, elapsed });
  return { value, elapsed };
};

/**
 * Keep playing, the dull way, until `until(state)` holds: place arrivals, take the first option of any decision, end the step.
 * `before(state)` runs at every stop and may do something of its own; it returns true when it acted.
 */
export const advanceTo = async (h, until, { before = async () => false, limit = 120 } = {}) => {
  for (let guard = 0; guard < limit; guard += 1) {
    await handoff(h);
    const state = await where(h);
    if (await until(state)) return state;
    if (await before(state)) continue;
    if (state.decision.length > 0) { await h.page.locator('[data-choice]').first().click(); await h.page.waitForTimeout(300); continue; }
    if (await has(h, '.arrivals .deck-unit[data-piece]')) { await placeArrivals(h); continue; }
    if (state.endDisabled) {
      if (await has(h, '#auto-pay')) { await click(h, '#auto-pay'); continue; }
      throw new Error(`Stuck in ${state.phase} (${state.player}): ${state.end}; notice: ${state.notice}`);
    }
    await endPhase(h);
  }
  throw new Error('advanceTo did not reach its goal.');
};

/** Printed hex number ("0507") to its distance from another, for choosing the nearest entry hex or base. */
export const hexDistance = (left, right) => {
  const cube = (label) => {
    const column = Number(label.slice(0, 2)) - 1;
    const r = Number(label.slice(2, 4)) - 1;
    const q = column - Math.floor(r / 2);
    return { x: q, z: r, y: -q - r };
  };
  const a = cube(left);
  const b = cube(right);
  return Math.max(Math.abs(a.x - b.x), Math.abs(a.y - b.y), Math.abs(a.z - b.z));
};

/**
 * Move the map's keyboard hex cursor to a printed hex number with the arrow keys (the map's own keyboard control) and
 * return what it announces for that hex. `enter` then presses Enter, which acts on the hex like a click.
 */
export const gotoHex = async (h, label, { enter = false } = {}) => {
  const announced = () => h.page.evaluate(() => document.querySelector('#hex-map ~ [aria-live], [aria-live].visually-hidden')?.textContent ?? '');
  const current = async () => (await announced()).match(/\b(\d{4})\b/)?.[1] ?? null;
  await h.page.focus('#hex-map');
  for (const key of ['ArrowRight', 'ArrowLeft']) await h.page.keyboard.press(key);
  if (!(await current())) { await h.page.keyboard.press('ArrowLeft'); await h.page.keyboard.press('ArrowRight'); }
  for (let guard = 0; guard < 4; guard += 1) {
    const at = await current();
    if (!at) throw new Error(`The map cursor announces no hex: "${await announced()}"`);
    if (at === label) break;
    const dc = Number(label.slice(0, 2)) - Number(at.slice(0, 2));
    const dr = Number(label.slice(2, 4)) - Number(at.slice(2, 4));
    for (let step = 0; step < Math.abs(dr); step += 1) await h.page.keyboard.press(dr > 0 ? 'ArrowDown' : 'ArrowUp');
    for (let step = 0; step < Math.abs(dc); step += 1) await h.page.keyboard.press(dc > 0 ? 'ArrowRight' : 'ArrowLeft');
  }
  const text = await announced();
  if ((await current()) !== label) throw new Error(`The map cursor did not reach ${label}: "${text}"`);
  if (enter) { await h.page.keyboard.press('Enter'); await h.page.waitForTimeout(350); }
  return text;
};

/** In an Aircraft Refit Phase: refit every base that offers it (one press per base). Returns how many bases refitted. */
export const refitAll = async (h) => {
  let count = 0;
  for (let guard = 0; guard < 8; guard += 1) {
    if (!(await has(h, '[data-refit]:not([disabled])'))) break;
    await h.page.locator('[data-refit]:not([disabled])').first().click();
    await h.page.waitForTimeout(400);
    count += 1;
  }
  return count;
};

/** Fly one air mission through the Air tab: pick the mission, the first hex (or `hex`), the first aircraft (or `aircraft` matcher), fly. */
export const flyMission = async (h, mission, { hex, pick = 0, settle = true, aircraft = null } = {}) => {
  await tab(h, 'Air');
  const button = h.page.locator(`[data-air-mission="${mission}"]`);
  if ((await button.count()) === 0 || (await button.first().isDisabled())) { h.note(`${mission}: button ${(await button.count()) === 0 ? 'missing' : 'disabled'}; tabs: ${(await tabs(h)).join(', ')}`); return false; }
  await button.first().click();
  await h.page.waitForTimeout(250);
  const chips = h.page.locator('.hex-chips [data-target-hex]');
  if ((await chips.count()) === 0) { h.note(`${mission}: no target hex`); await click(h, '#cancel-air-mission'); return false; }
  if (hex) await h.page.locator(`.hex-chips [data-target-hex]`, { hasText: hex }).first().click();
  else await chips.nth(pick).click();
  await h.page.waitForTimeout(350);
  const boxes = h.page.locator('[data-air-aircraft]');
  const labels = await h.page.locator('.air-panel .participant').allInnerTexts();
  const index = aircraft === null ? 0 : labels.findIndex((text) => aircraft.test(text));
  if ((await boxes.count()) === 0 || index < 0) { h.note(`${mission}: no matching aircraft: boxes ${await boxes.count()}, index ${index}, ${labels.length} listed`); await click(h, '#cancel-air-mission'); return false; }
  if (!(await boxes.nth(index).isChecked())) await boxes.nth(index).check();
  await click(h, '#declare-air-mission');
  if (settle) await settleDecisions(h);
  return true;
};
