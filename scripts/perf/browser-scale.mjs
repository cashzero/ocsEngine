// Browser latency probe for large maps: operates the built UI in Chromium from visible controls (New Game with the chosen
// map size -> Generate -> Start -> optional Trace Supply overlay -> place every arrival -> End phase / hot-seat handoffs)
// through Game Turn 1, and records for each click how long the page takes to settle (main thread free for 5 frames),
// the long tasks inside it, and a CPU profile of the whole game (rendering included).
// Usage: npm run build; OCS_UI_PORT=4190 node scripts/serve-ui.mjs &; node scripts/perf/browser-scale.mjs <outDir> [WxH]
// PERF_TRACE=0 leaves the Trace Supply overlay off; PERF_TRACE=once only times turning it on and off. OCS_UI_URL overrides the address.
import { chromium } from 'playwright';
import { mkdir, writeFile } from 'node:fs/promises';

const out = process.argv[2] ?? 'tmp/perf-browser';
const [width, height] = (process.argv[3] ?? '64x48').split('x').map(Number);
const traceMode = process.env.PERF_TRACE === '0' ? 'off' : process.env.PERF_TRACE === 'once' ? 'once' : 'on';
const traceOn = traceMode !== 'off';
await mkdir(out, { recursive: true });
const browser = await chromium.launch(process.env.OCS_CHROMIUM ? { executablePath: process.env.OCS_CHROMIUM } : {});
const page = await browser.newPage({ viewport: { width: 1600, height: 1000 } });
const errors = [];
page.on('pageerror', (error) => errors.push(String(error)));
await page.addInitScript(() => {
  window.__long = [];
  new PerformanceObserver((list) => { for (const entry of list.getEntries()) window.__long.push({ start: entry.startTime, ms: entry.duration }); })
    .observe({ type: 'longtask', buffered: true });
});

/** Page time when the main thread has been free for five consecutive frames. */
const settle = () => page.evaluate(() => new Promise((resolve) => {
  let last = performance.now(); let calm = 0; let calmStart = last;
  const tick = () => {
    const now = performance.now();
    if (now - last < 50) { if (calm === 0) calmStart = last; calm += 1; } else calm = 0;
    last = now;
    if (calm >= 5) resolve(calmStart); else requestAnimationFrame(tick);
  };
  requestAnimationFrame(tick);
}));
const rows = [];
const measure = async (name, action) => {
  // PERF_FRAMES=1 also lists the gaps between animation frames inside each measurement (where the time went).
  const t0 = await page.evaluate((frames) => {
    if (frames) {
      window.__frames = [];
      const tick = (now) => { if (window.__frames) { window.__frames.push(now); requestAnimationFrame(tick); } };
      requestAnimationFrame(tick);
    }
    return performance.now();
  }, Boolean(process.env.PERF_FRAMES));
  await action();
  const t1 = await settle();
  const long = await page.evaluate((from) => window.__long.filter(({ start }) => start >= from - 1), t0);
  const row = { name, ms: Math.round(t1 - t0), longTasks: long.length, longestMs: Math.round(Math.max(0, ...long.map(({ ms }) => ms))), longTotalMs: Math.round(long.reduce((sum, { ms }) => sum + ms, 0)) };
  if (process.env.PERF_FRAMES) {
    row.frames = await page.evaluate((from) => {
      const frames = window.__frames ?? [];
      window.__frames = null;
      return frames.map((at, index) => [Math.round(at - from), Math.round(at - (index > 0 ? frames[index - 1] : from))]).filter(([, gap]) => gap > 20);
    }, t0);
  }
  rows.push(row);
  console.log(`${String(row.ms).padStart(6)} ms  long ${String(row.longTotalMs).padStart(6)} ms (${row.longTasks}, max ${row.longestMs})  ${name}${row.frames ? `  frame gaps [at, ms]: ${JSON.stringify(row.frames)}` : ''}`);
  return row;
};
/**
 * Walks the map's keyboard cursor (as in scripts/rail-acceptance.mjs) along the three outermost columns on each side until
 * its announcement says "entry hex"; the placing Enter press is left to the caller so only it is timed.
 */
const findEntryWithMapCursor = async () => {
  // Enough presses to cross the whole map from any cursor position.
  const reach = Math.max(width, height) + 2;
  const live = page.locator('#hex-map + [aria-live]');
  await page.focus('#hex-map');
  const press = async (key, times = 1) => { for (let i = 0; i < times; i += 1) await page.keyboard.press(key); return (await live.textContent()) ?? ''; };
  const scan = async (key) => {
    let text = await press(key, 0);
    for (let row = 0; row < reach; row += 1) {
      if (text.includes('entry hex')) return true;
      const next = await press(key);
      if (next === text) return false;
      text = next;
    }
    return false;
  };
  await press('ArrowUp', reach);
  await press('ArrowLeft', reach);
  for (const [index, key] of ['ArrowDown', 'ArrowUp', 'ArrowDown'].entries()) {
    if (await scan(key)) return true;
    if (index < 2) await press('ArrowRight');
  }
  await press('ArrowRight', reach);
  await press('ArrowUp', reach);
  for (const [index, key] of ['ArrowDown', 'ArrowUp', 'ArrowDown'].entries()) {
    if (await scan(key)) return true;
    if (index < 2) await press('ArrowLeft');
  }
  return false;
};
const phase = async () => (await page.locator('.phase-picker').first().innerText().catch(() => '')).replace(/\s+/g, ' ').slice(0, 60);

await page.goto(process.env.OCS_UI_URL ?? 'http://127.0.0.1:4190/');
await page.waitForSelector('#open-menu', { timeout: 120000 });
await settle();
await page.click('#open-menu');
await page.click('#open-new-game');
await page.fill('#new-game-width', String(width));
await page.fill('#new-game-height', String(height));
await measure(`new game: generate preview ${width}x${height}`, async () => {
  await page.click('button[form="new-game-form"]');
  await page.waitForSelector('#start-previewed-game:not(:disabled)', { timeout: 300000 });
});
await measure('new game: start previewed game', async () => {
  await page.click('#start-previewed-game');
  await page.waitForFunction(() => !document.querySelector('.new-game-dialog'), null, { timeout: 300000 });
});

const cdp = await page.context().newCDPSession(page);
await cdp.send('Profiler.enable');
await cdp.send('Profiler.setSamplingInterval', { interval: 500 });
await cdp.send('Profiler.start');

// Map interaction without any rule query: a drag pan and a zoom step.
const box = await page.locator('#hex-map').boundingBox();
const pan = (direction) => async () => {
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await page.mouse.down();
  for (let i = 1; i <= 10; i += 1) await page.mouse.move(box.x + box.width / 2 - 30 * i * direction, box.y + box.height / 2 - 10 * i * direction);
  await page.mouse.up();
};
await measure('map: drag pan 300px', pan(1));
await measure('map: zoom in', () => page.click('#zoom-in'));
await measure('map: zoom out', () => page.click('#zoom-out'));
if (traceOn) await measure('ui: toggle Trace Supply on', () => page.click('#toggle-trace-coverage'));
// PERF_SHOT=1 keeps a picture of the overlay as drawn, so a faster trace can be checked by eye as well.
if (traceOn && process.env.PERF_SHOT) await page.screenshot({ path: `${out}/trace-overlay-${width}x${height}.jpg`, type: 'jpeg', quality: 80 });
// PERF_TRACE=once: measure turning the overlay on and off, then play the turn without it (large maps).
if (traceOn) await measure('map: drag pan 300px, Trace Supply on', pan(-1));
if (traceMode === 'once') await measure('ui: toggle Trace Supply off', () => page.click('#toggle-trace-coverage'));

let placementFailures = 0;
for (let step = 0; step < 150; step += 1) {
  const current = await phase();
  const body = await page.locator('body').innerText();
  if (/TURN\s*2\s*\//.test(body)) { console.log('reached Game Turn 2 at step', step); break; }
  if (await page.locator('#complete-handoff').isVisible().catch(() => false)) { await measure(`handoff: complete (${current})`, () => page.click('#complete-handoff')); continue; }
  if (await page.locator('#begin-required-handoff').isVisible().catch(() => false)) { await measure(`handoff: begin (${current})`, () => page.click('#begin-required-handoff')); continue; }
  if (await page.locator('#dismiss-away').isVisible().catch(() => false)) { await measure('dismiss away report', () => page.click('#dismiss-away')); continue; }
  if (await page.locator('#dismiss-result').isVisible().catch(() => false)) { await measure('dismiss result', () => page.click('#dismiss-result')); continue; }
  const arrivalsTab = page.locator('[data-deck-tab="arrivals"]');
  if (/Reinforcement/.test(current) && await arrivalsTab.isVisible().catch(() => false) && await arrivalsTab.getAttribute('aria-pressed') !== 'true') {
    await measure('open Arrivals tab', () => arrivalsTab.click()); continue;
  }
  const arrival = page.locator('.arrivals button:not([data-target-hex])').first();
  if (await arrival.isVisible().catch(() => false)) {
    await measure(`reinforcement: select arrival (${current})`, () => arrival.click());
    if (await findEntryWithMapCursor()) { await measure(`reinforcement: place (${current})`, () => page.keyboard.press('Enter')); continue; }
    console.log('no entry hex found for the selected arrival');
    if ((placementFailures += 1) >= 3) { console.log('giving up: arrivals cannot be placed with the map cursor'); break; }
  }
  const end = page.locator('#end-phase');
  if (await end.isEnabled().catch(() => false)) { await measure(`end step (${current})`, () => end.click()); continue; }
  await page.waitForTimeout(300);
}

const { profile } = await cdp.send('Profiler.stop');
const tag = `${width}x${height}-trace-${traceMode}`;
await writeFile(`${out}/browser-${tag}.cpuprofile`, JSON.stringify(profile));
await writeFile(`${out}/browser-${tag}.json`, JSON.stringify({ width, height, traceOn, rows, errors }, null, 1));
const byKind = new Map();
for (const row of rows) {
  const kind = row.name.replace(/ \(.*\)$/u, '');
  const agg = byKind.get(kind) ?? { kind, count: 0, ms: 0, max: 0 };
  agg.count += 1; agg.ms += row.ms; agg.max = Math.max(agg.max, row.ms);
  byKind.set(kind, agg);
}
console.log(`\n${tag}: kind / count / avg ms / max ms`);
for (const agg of [...byKind.values()].sort((a, b) => b.ms - a.ms)) console.log(`${agg.kind.padEnd(44)} ${String(agg.count).padStart(4)} ${String(Math.round(agg.ms / agg.count)).padStart(7)} ${String(agg.max).padStart(7)}`);
console.log('page errors', errors.length, errors.slice(0, 3));
await browser.close();
