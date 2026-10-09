// Shared steps for the doc 03 §A–E acceptance runs. Every step is a click, a typed value or a key press on a visible
// control of the built application; every observation is read from the page (text, classes, the map's keyboard cursor).
import { createHash } from 'node:crypto';
import { click, has, where } from '../air-acceptance/harness.mjs';

export const sha = (value) => createHash('sha256').update(typeof value === 'string' ? value : JSON.stringify(value)).digest('hex').slice(0, 16);

/** Open the New Game dialog through the menu. */
export const openNewGame = async (h) => {
  if (!(await has(h, '#open-new-game'))) await click(h, '#open-menu');
  await click(h, '#open-new-game');
  await h.page.waitForSelector('#new-game-form');
};

/** Type the settings on the form (the dialog must be open). After a Generate the dialog shows the preview page, so go back to Settings first. */
export const configure = async (h, options = {}) => {
  const { page } = h;
  if (await page.$('#back-to-settings')) await page.click('#back-to-settings');
  const type = async (id, value) => { if (value !== undefined) { await page.fill(`#new-game-${id}`, String(value)); await page.press(`#new-game-${id}`, 'Tab'); } };
  if (options.engagement) await page.selectOption('#new-game-engagement', options.engagement);
  if (options.style) await page.selectOption('#new-game-style', options.style);
  await type('width', options.width);
  await type('height', options.height);
  if (options.scale) await page.selectOption('#new-game-scale', options.scale);
  await type('divisions', options.divisions);
  await type('armored', options.armored);
  await type('turn-limit', options.turnLimit);
  if (options.seeds) {
    for (const [name, seed] of Object.entries(options.seeds)) await type(`${name}-seed`, seed);
  }
};

/** The footer status of the dialog, the stage classes and the Start button state. */
export const dialogState = (h) => h.page.evaluate(() => ({
  status: document.querySelector('.new-game-submit strong')?.textContent.trim() ?? '',
  hint: document.querySelector('.new-game-submit p')?.textContent.trim() ?? '',
  stages: [...document.querySelectorAll('.flow-steps span')].map((node) => `${node.textContent.trim()}:${node.className || '-'}`),
  start: document.querySelector('#start-previewed-game') ? { disabled: document.querySelector('#start-previewed-game').disabled, text: document.querySelector('#start-previewed-game').textContent.trim() } : null,
  stale: !!document.querySelector('.operation-preview-content.is-stale'),
  error: document.querySelector('.new-game-error')?.innerText.replace(/\s+/g, ' ').trim() ?? '',
  fieldError: document.querySelector('#field-error') ? { field: document.querySelector('#field-error').closest('label')?.querySelector('input,select')?.id ?? '', text: document.querySelector('#field-error').textContent.trim() } : null,
}));

/** Watch the stage strip: every distinct class combination it shows is recorded until `stopStageWatch`. */
export const startStageWatch = (h) => h.page.evaluate(() => {
  window.__stages = [];
  const read = () => [...document.querySelectorAll('.flow-steps span')].map((node) => `${node.textContent.trim()}:${node.className || '-'}`).join(' | ');
  const push = () => { const now = read(); if (now && window.__stages.at(-1) !== now) window.__stages.push(now); };
  push();
  window.__stageObserver = new MutationObserver(push);
  window.__stageObserver.observe(document.body, { subtree: true, childList: true, attributes: true, attributeFilter: ['class'] });
});
export const stopStageWatch = (h) => h.page.evaluate(() => { window.__stageObserver?.disconnect(); return window.__stages ?? []; });

/** Press Generate operation and wait until the dialog reports a result; returns the elapsed time and the state. */
export const generate = async (h) => {
  const started = Date.now();
  await h.page.click('button[form="new-game-form"]');
  await h.page.waitForFunction(() => {
    const status = document.querySelector('.new-game-submit strong')?.textContent ?? '';
    return /Preview ready|Cannot build|Preview invalidated|Configure operation/.test(status) && !/Generating/.test(status) && !document.querySelector('button[form="new-game-form"]')?.disabled;
  }, null, { timeout: 30000 });
  const elapsed = Date.now() - started;
  return { elapsed, state: await dialogState(h) };
};

/** What the preview shows, split by the seed that should drive it. */
export const previewSignature = (h) => h.page.evaluate(() => {
  const svg = document.querySelector('.operation-map');
  const terrain = [...(svg?.querySelectorAll('.terrain-layer .terrain-fill') ?? [])].map((node) => [...node.classList].find((name) => name.startsWith('terrain-') && name !== 'terrain-fill'));
  const features = [...(svg?.querySelectorAll('.generated-edge, .settlement-marker, .preview-entry, .preview-objective') ?? [])].map((node) => node.outerHTML).join('');
  const deployment = [...(svg?.querySelectorAll('.preview-deployment') ?? [])].map((node) => node.outerHTML).join('');
  const metrics = Object.fromEntries([...document.querySelectorAll('.operation-metrics div')].map((node) => [node.querySelector('dt').textContent.trim(), node.querySelector('dd').textContent.trim()]));
  const forces = document.querySelector('.preview-forces')?.textContent.replace(/\s+/g, ' ').trim() ?? '';
  const counters = [...document.querySelectorAll('.preview-forces .preview-counter figcaption')].map((node) => node.textContent.trim());
  return { terrain, features, deployment, metrics, forces, counters, sides: [...document.querySelectorAll('.preview-force header strong')].map((node) => node.textContent.trim()), warnings: document.querySelector('.preview-warnings')?.innerText ?? '' };
});

/** Press Start and wait for the mounted game; returns the elapsed time. */
export const start = async (h) => {
  const started = Date.now();
  await h.page.click('#start-previewed-game');
  await h.page.waitForFunction(() => !document.querySelector('.new-game-dialog') && !!document.querySelector('.turn-strip'), null, { timeout: 30000 });
  return Date.now() - started;
};

/** The game line of the menu (units, formations, turns, seeds), read by opening and closing the menu. */
export const menuSummary = async (h) => {
  await click(h, '#open-menu');
  const text = await h.page.evaluate(() => document.querySelector('.menu-section .supporting')?.textContent.replace(/\s+/g, ' ').trim() ?? '');
  await click(h, '#close-utility');
  return text;
};

const announced = (h) => h.page.evaluate(() => document.querySelector('#hex-map ~ [aria-live], [aria-live].visually-hidden')?.textContent ?? '');

/**
 * Sweep the mounted map with its keyboard hex cursor (arrow keys, as a keyboard player would) and return one announcement
 * per hex, in row-major order, plus the size the cursor could reach.
 */
export const sweepMap = async (h) => {
  const { page } = h;
  await page.focus('#hex-map');
  await page.keyboard.press('ArrowRight');
  await page.keyboard.press('ArrowLeft');
  const label = async () => (await announced(h)).match(/\b(\d{4})\b/)?.[1] ?? null;
  // Go to the top-left corner.
  for (let guard = 0; guard < 80; guard += 1) { const before = await label(); await page.keyboard.press('ArrowUp'); if ((await label()) === before) break; }
  for (let guard = 0; guard < 80; guard += 1) { const before = await label(); await page.keyboard.press('ArrowLeft'); if ((await label()) === before) break; }
  const rows = [];
  for (let row = 0; row < 80; row += 1) {
    const line = [await announced(h)];
    for (let guard = 0; guard < 80; guard += 1) {
      const before = await label();
      await page.keyboard.press('ArrowRight');
      if ((await label()) === before) break;
      line.push(await announced(h));
    }
    rows.push(line);
    // Back to the left edge, then down one row.
    for (let guard = 0; guard < 80; guard += 1) { const before = await label(); await page.keyboard.press('ArrowLeft'); if ((await label()) === before) break; }
    const before = await label();
    await page.keyboard.press('ArrowDown');
    if ((await label()) === before) break;
  }
  // A named settlement announces its name before the terrain ("Hex 2701 · Antmar · clear · village · no units").
  const terrains = new Set(['clear', 'woods', 'rough', 'mountain', 'marsh', 'water']);
  const cells = rows.flat().map((text) => {
    const [, hex, rest] = text.match(/^Hex (\d{4}) · (.*)$/) ?? [];
    const fields = (rest ?? '').split(' · ');
    const at = fields.findIndex((field) => terrains.has(field.trim()));
    const index = at < 0 ? 0 : at;
    return { hex, terrain: fields[index]?.trim(), units: fields.slice(index + 1).join(' · ').trim(), text };
  });
  return { width: rows[0]?.length ?? 0, height: rows.length, cells };
};

/** The hover line under the map ("Hex 0907 · clear · …"). */
export const hoverLine = (h) => h.page.evaluate(() => document.querySelector('.hover-info')?.textContent ?? '');

/**
 * Find where a printed hex is on screen by moving the mouse over the map and reading the hover line, as a player would.
 * Returns the centre of the points that named the hex, or null when it is not on screen.
 */
export const locateHex = async (h, label, { step = 22 } = {}) => {
  const box = await h.page.locator('#hex-map').boundingBox();
  const hits = [];
  for (let y = box.y + 8; y < box.y + box.height - 8; y += step) {
    for (let x = box.x + 8; x < box.x + box.width - 8; x += step) {
      await h.page.mouse.move(x, y);
      if ((await hoverLine(h)).startsWith(`Hex ${label} `)) hits.push({ x, y });
    }
    if (hits.length > 0 && !hits.some((hit) => hit.y === y)) break;
  }
  if (hits.length === 0) return null;
  return { x: hits.reduce((sum, hit) => sum + hit.x, 0) / hits.length, y: hits.reduce((sum, hit) => sum + hit.y, 0) / hits.length };
};

/** One mouse pass over the map: every printed hex on screen with the centre of the points that named it. */
export const screenHexes = async (h, { step = 28 } = {}) => {
  const box = await h.page.locator('#hex-map').boundingBox();
  const points = new Map();
  for (let y = box.y + 10; y < box.y + box.height - 10; y += step) {
    for (let x = box.x + 10; x < box.x + box.width - 10; x += step) {
      await h.page.mouse.move(x, y);
      // Points over the map's own controls (zoom, legend) leave the previous hover line, so they are skipped.
      const label = await h.page.evaluate(([px, py]) => document.elementFromPoint(px, py)?.id === 'hex-map'
        ? document.querySelector('.hover-info')?.textContent.match(/^Hex (\d{4})/)?.[1] ?? null : null, [x, y]);
      if (label) points.set(label, [...(points.get(label) ?? []), { x, y }]);
    }
  }
  return new Map([...points].map(([label, hits]) => [label, { x: hits.reduce((s, p) => s + p.x, 0) / hits.length, y: hits.reduce((s, p) => s + p.y, 0) / hits.length }]));
};

/** Locate a hex near a screen point (default: the map's centre, where the keyboard cursor keeps it) by hovering. */
export const locateNear = async (h, label, { around = null, radius = 260, step = 14 } = {}) => {
  const box = await h.page.locator('#hex-map').boundingBox();
  const centre = around ?? { x: box.x + box.width / 2, y: box.y + box.height / 2 };
  const hits = [];
  for (let y = Math.max(box.y + 4, centre.y - radius); y < Math.min(box.y + box.height - 4, centre.y + radius); y += step) {
    for (let x = Math.max(box.x + 4, centre.x - radius); x < Math.min(box.x + box.width - 4, centre.x + radius); x += step) {
      await h.page.mouse.move(x, y);
      const named = await h.page.evaluate(([px, py]) => document.elementFromPoint(px, py)?.id === 'hex-map'
        ? document.querySelector('.hover-info')?.textContent.match(/^Hex (\d{4})/)?.[1] ?? null : null, [x, y]);
      if (named === label) hits.push({ x, y });
    }
  }
  if (hits.length === 0) return null;
  return { x: hits.reduce((s, p) => s + p.x, 0) / hits.length, y: hits.reduce((s, p) => s + p.y, 0) / hits.length };
};

/** Bring a hex on screen with the keyboard cursor (the map follows it), then locate it with the mouse. */
export const hexOnScreen = async (h, label, gotoHex) => {
  await gotoHex(h, label);
  return (await locateNear(h, label)) ?? (await screenHexes(h, { step: 30 })).get(label) ?? null;
};

/** Text of the left command deck. */
export const deckText = (h) => h.page.evaluate(() => document.querySelector('.command-deck, .deck, aside')?.innerText.replace(/\n{2,}/g, '\n').trim() ?? '');

/**
 * Play on the plain way (place arrivals, take the first option of a decision, end the step) until `until(state)` holds.
 * The first hand-over screen is recorded: its text and whether the map is visible behind it.
 */
export const playUntil = async (h, until, { limit = 160, placeArrivals } = {}) => {
  const { page } = h;
  let privacy = null;
  for (let guard = 0; guard < limit; guard += 1) {
    const state = await where(h);
    if (!state.handoff && !state.complete && !(await has(h, '#dismiss-away')) && (await until(state))) return { privacy, state };
    if (await has(h, '#complete-handoff')) {
      if (privacy === null) {
        privacy = await page.evaluate(() => {
          const map = document.querySelector('#hex-map');
          return { text: document.body.innerText.replace(/\s+/g, ' ').slice(0, 300), mapVisible: !!map && map.getClientRects().length > 0 && getComputedStyle(map).visibility !== 'hidden' };
        });
        await h.shot('handoff-privacy');
      }
      await click(h, '#complete-handoff', { settle: 400 });
      continue;
    }
    if (await has(h, '#begin-required-handoff')) { await click(h, '#begin-required-handoff', { settle: 400 }); continue; }
    if (await has(h, '#dismiss-away')) { await click(h, '#dismiss-away'); continue; }
    if (state.decision.length > 0) { await page.locator('[data-choice]').first().click(); await page.waitForTimeout(300); continue; }
    if (placeArrivals && (await has(h, '.arrivals .deck-unit[data-piece]'))) { await placeArrivals(h); continue; }
    if (state.endDisabled && (await has(h, '#auto-pay'))) { await click(h, '#auto-pay'); continue; }
    await click(h, '#end-phase', { settle: 300 });
    const after = await where(h);
    if (after.phase === state.phase && after.player === state.player && !after.handoff && !after.complete && after.decision.length === 0 && (await has(h, '#end-phase'))) await click(h, '#end-phase', { settle: 300 });
  }
  throw new Error('playUntil did not reach its goal.');
};

/** Text of every counter SVG inside an element (the printed fields in drawing order). */
export const counterTokens = (h, selector) => h.page.evaluate((sel) => [...document.querySelectorAll(sel)].map((node) => (node.querySelector('svg')?.textContent ?? node.textContent).replace(/\s+/g, ' ').trim()), selector);

/** The counter tokens of the selected unit's card at the top of the deck. */
export const cardTokens = (h) => h.page.evaluate(() => {
  const svg = document.querySelector('.command-rail svg');
  return svg ? svg.textContent.replace(/\s+/g, ' ').trim() : '';
});

/** Pay fuel for the selected unit: the method button, then the first dump offered. Returns the label of the dump chosen. */
export const payFuel = async (h, method = 'SINGLE_UNIT') => {
  await click(h, `[data-fuel-method="${method}"]`);
  const option = h.page.locator('.fuel-panel [data-unit-action]').first();
  await option.waitFor({ state: 'visible', timeout: 5000 });
  const label = (await option.innerText()).replace(/\s+/g, ' ').trim();
  await option.click();
  await h.page.waitForTimeout(500);
  return label;
};

/** Move the selected unit to a printed hex with the map's keyboard cursor (Enter acts like a click), then confirm. */
export const moveSelectedTo = async (h, label, gotoHex) => {
  await gotoHex(h, label, { enter: true });
  const preview = await h.page.evaluate(() => document.querySelector('.move-preview')?.innerText.replace(/\s+/g, ' ').trim() ?? '');
  const confirm = h.page.locator('#confirm-move');
  if ((await confirm.count()) === 0 || (await confirm.isDisabled())) return { moved: false, preview };
  const started = Date.now();
  await confirm.click();
  await h.page.waitForTimeout(400);
  return { moved: true, preview, elapsed: Date.now() - started };
};

export { where };
