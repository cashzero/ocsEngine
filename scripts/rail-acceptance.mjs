// Rail acceptance driver: operates the built UI in Chromium from visible controls (New Game -> Generate ->
// Start -> Trace Supply overlay -> place arrivals -> End phase / hot-seat handoffs) through one whole Game Turn.
// Usage: npm run ui:serve, then node scripts/rail-acceptance.mjs <screenshot dir> (OCS_UI_URL overrides the address).
import { chromium } from 'playwright';
import { mkdirSync } from 'node:fs';

const out = process.argv[2];
mkdirSync(out, { recursive: true });
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1600, height: 1000 } });
const errors = [];
page.on('console', (message) => { if (message.type() === 'error') errors.push(message.text()); });
page.on('pageerror', (error) => errors.push(String(error)));
const shot = (name, options = {}) => page.screenshot({ path: `${out}/${name}.jpg`, type: 'jpeg', quality: 78, ...options });
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

await page.goto(process.env.OCS_UI_URL ?? 'http://127.0.0.1:4173/');
await page.waitForSelector('#open-menu', { timeout: 30000 });
await page.click('#open-menu');
await page.click('#open-new-game');
await page.click('button[form="new-game-form"]');
const t0 = Date.now();
await page.waitForSelector('#start-previewed-game:not(:disabled)', { timeout: 60000 });
console.log('preview ready ms', Date.now() - t0);
console.log('preview rail lines', await page.locator('.operation-map .rail-line').count(),
  'multi', await page.locator('.operation-map .rail-line.multi-rail').count(),
  'roads', await page.locator('.operation-map .generated-edge.road, .operation-map .generated-edge.primary-road').count());
await page.locator('.operation-map').first().screenshot({ path: `${out}/01-preview-map.jpg`, type: 'jpeg', quality: 85 });
await page.click('#start-previewed-game');
await page.waitForFunction(() => !document.querySelector('.new-game-dialog'), null, { timeout: 60000 });
await page.waitForTimeout(1500);
console.log('legend', (await page.locator('.map-legend').innerText()).replace(/\s+/g, ' '));
await shot('02-game-start');
await page.click('#toggle-trace-coverage');
await page.waitForTimeout(1200);
await shot('03-trace-overlay');
console.log('phase at start', await phase());

const seen = [];
for (let step = 0; step < 120; step += 1) {
  const current = await phase();
  if (!seen.includes(current)) { seen.push(current); console.log('step', step, current); }
  const body = await page.locator('body').innerText();
  if (/TURN\s*2\s*\//.test(body)) { console.log('reached Game Turn 2 at step', step); break; }
  if (/AXIS PLAYER TURN Reinforcement/.test(current) && !globalThis.axisShot) { globalThis.axisShot = true; await page.waitForTimeout(800); await shot('05-axis-overlay'); }
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
const traceOn = await page.locator('#toggle-trace-coverage').isChecked().catch(() => false);
if (!traceOn) await page.click('#toggle-trace-coverage').catch(() => {});
await page.waitForTimeout(1000);
await shot('04-supply-phase');
console.log('deck', (await page.locator('.command-rail').innerText().catch(() => '')).replace(/\s+/g, ' ').slice(0, 600));
console.log('final phase', await phase());
console.log('elapsed s', ((Date.now() - started) / 1000).toFixed(1));
console.log('errors', JSON.stringify(errors));
await browser.close();
