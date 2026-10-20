// Map theme acceptance driver: operates the built UI in Chromium from visible controls. New Game -> pick the
// Western Europe theater -> Generate, then the Eastern Europe theater on the same seeds -> Generate (the two previews
// are compared on the drawn map) -> Start the Eastern Europe preview -> End phase / place arrivals / hot-seat
// handoffs through one whole Game Turn.
// Usage: npm run ui:serve, then node scripts/map-theme-acceptance.mjs <screenshot dir> (OCS_UI_URL overrides the address,
// OCS_CHROMIUM a Chromium-family browser executable such as Edge).
import { chromium } from 'playwright';
import { mkdirSync } from 'node:fs';

const out = process.argv[2];
mkdirSync(out, { recursive: true });
const browser = await chromium.launch(process.env.OCS_CHROMIUM ? { executablePath: process.env.OCS_CHROMIUM, args: ['--no-sandbox'] } : {});
const page = await browser.newPage({ viewport: { width: 1600, height: 1000 } });
const errors = [];
page.on('console', (message) => { if (message.type() === 'error') errors.push(message.text()); });
page.on('pageerror', (error) => errors.push(String(error)));
const shot = (name) => page.screenshot({ path: `${out}/${name}.jpg`, type: 'jpeg', quality: 78 });
const started = Date.now();
const phase = async () => (await page.locator('.phase-picker').first().getAttribute('aria-label').catch(() => '')) + ' | '
  + (await page.locator('.phase-picker').first().innerText().catch(() => '')).replace(/\s+/g, ' ').slice(0, 80);

/**
 * Places the selected arrival with the map's keyboard cursor (arrow keys, then Enter), as a keyboard player would:
 * entry hexes lie on the side's map edge, so walk the three outermost columns on each side until the cursor's
 * announcement says "entry hex".
 */
const placeWithMapCursor = async () => {
  const live = page.locator('#hex-map + [aria-live]');
  await page.focus('#hex-map');
  const press = async (key, times = 1) => { for (let i = 0; i < times; i += 1) await page.keyboard.press(key); return (await live.textContent()) ?? ''; };
  const scan = async (key) => {
    let text = await press(key === 'ArrowDown' ? 'ArrowUp' : 'ArrowDown', 0);
    for (let row = 0; row < 80; row += 1) {
      if (text.includes('entry hex')) { console.log('placing at', text.split(' · ')[0]); await page.keyboard.press('Enter'); return true; }
      const next = await press(key);
      if (next === text) return false;
      text = next;
    }
    return false;
  };
  await press('ArrowUp', 80);
  await press('ArrowLeft', 80);
  for (const [index, key] of ['ArrowDown', 'ArrowUp', 'ArrowDown'].entries()) {
    if (await scan(key)) return true;
    if (index < 2) await press('ArrowRight');
  }
  await press('ArrowRight', 80);
  await press('ArrowUp', 80);
  for (const [index, key] of ['ArrowDown', 'ArrowUp', 'ArrowDown'].entries()) {
    if (await scan(key)) return true;
    if (index < 2) await press('ArrowLeft');
  }
  return false;
};

/** What the drawn preview shows: terrain fills by class, road and rail segments, settlements, and the summary metrics. */
const readPreview = () => page.evaluate(() => {
  const map = document.querySelector('.operation-map');
  const count = (selector) => map?.querySelectorAll(selector).length ?? 0;
  const terrain = {};
  for (const node of map?.querySelectorAll('.terrain-fill') ?? []) {
    const kind = [...node.classList].find((name) => name.startsWith('terrain-') && name !== 'terrain-fill');
    if (kind) terrain[kind] = (terrain[kind] ?? 0) + 1;
  }
  return {
    terrain,
    roads: count('.generated-edge.road, .generated-edge.primary-road'),
    mainRoads: count('.generated-edge.primary-road'),
    rails: count('.rail-line'),
    multiRails: count('.rail-line.multi-rail'),
    metrics: document.querySelector('.operation-preview-content')?.innerText.replace(/\s+/g, ' ').slice(0, 600) ?? '',
  };
});

const generateWith = async (style) => {
  await page.selectOption('#new-game-style', style);
  const t0 = Date.now();
  await page.click('button[form="new-game-form"]');
  await page.waitForSelector('#start-previewed-game:not(:disabled)', { timeout: 60000 });
  const elapsed = Date.now() - t0;
  await page.waitForTimeout(500);
  const preview = await readPreview();
  console.log(style, 'preview ms', elapsed, JSON.stringify(preview));
  return preview;
};

await page.goto(process.env.OCS_UI_URL ?? 'http://127.0.0.1:4173/');
await page.waitForSelector('#open-menu', { timeout: 30000 });
await page.click('#open-menu');
await page.click('#open-new-game');
await page.waitForSelector('#new-game-form');
console.log('style options', JSON.stringify(await page.locator('#new-game-style option').allInnerTexts()));

const western = await generateWith('WESTERN_EUROPE');
await page.locator('.operation-map').first().screenshot({ path: `${out}/01-western-preview.jpg`, type: 'jpeg', quality: 85 });
const eastern = await generateWith('EASTERN_EUROPE');
await page.locator('.operation-map').first().screenshot({ path: `${out}/02-eastern-preview.jpg`, type: 'jpeg', quality: 85 });
await shot('03-eastern-dialog');
console.log('eastern/western roads', (eastern.roads / western.roads).toFixed(2), 'rails', (eastern.rails / western.rails).toFixed(2));

await page.click('#start-previewed-game');
await page.waitForFunction(() => !document.querySelector('.new-game-dialog'), null, { timeout: 60000 });
await page.waitForTimeout(1500);
console.log('mounted map', await page.locator('.map-card').first().getAttribute('aria-label'));
console.log('legend', (await page.locator('.map-legend').innerText().catch(() => '')).replace(/\s+/g, ' '));
await shot('04-eastern-game-start');
console.log('phase at start', await phase());

const seen = [];
let reachedTurnTwo = false;
for (let step = 0; step < 160; step += 1) {
  const current = await phase();
  if (!seen.includes(current)) { seen.push(current); console.log('step', step, current); }
  const body = await page.locator('body').innerText();
  if (/TURN\s*2\s*\//.test(body)) { console.log('reached Game Turn 2 at step', step); reachedTurnTwo = true; break; }
  if (await page.locator('#complete-handoff').isVisible().catch(() => false)) { await page.click('#complete-handoff'); await page.waitForTimeout(500); continue; }
  if (await page.locator('#begin-required-handoff').isVisible().catch(() => false)) { await page.click('#begin-required-handoff'); await page.waitForTimeout(500); continue; }
  if (await page.locator('#dismiss-away').isVisible().catch(() => false)) { await page.click('#dismiss-away'); await page.waitForTimeout(400); continue; }
  if (await page.locator('#dismiss-result').isVisible().catch(() => false)) { await page.click('#dismiss-result'); await page.waitForTimeout(400); continue; }
  const arrivalsTab = page.locator('[data-deck-tab="arrivals"]');
  if (/Reinforcement/.test(current) && await arrivalsTab.isVisible().catch(() => false)) await arrivalsTab.click().catch(() => {});
  // Reinforcement Phase: select each arriving unit, then the first entry hex offered.
  const arrival = page.locator('.arrivals button:not([data-target-hex])').first();
  if (await arrival.isVisible().catch(() => false)) {
    await arrival.click(); await page.waitForTimeout(500);
    const entry = page.locator('.arrivals [data-target-hex]').first();
    if (await entry.isVisible().catch(() => false)) { console.log('placing at', await entry.innerText()); await entry.click(); await page.waitForTimeout(700); continue; }
    if (await placeWithMapCursor()) { await page.waitForTimeout(700); continue; }
  }
  const end = page.locator('#end-phase');
  if (await end.isEnabled().catch(() => false)) { await end.click(); await page.waitForTimeout(700); continue; }
  await page.waitForTimeout(700);
}
await page.waitForTimeout(1000);
await shot('05-eastern-turn-2');
console.log('final phase', await phase(), 'reached turn 2', reachedTurnTwo);
console.log('elapsed s', ((Date.now() - started) / 1000).toFixed(1));
console.log('errors', JSON.stringify(errors));
await browser.close();
