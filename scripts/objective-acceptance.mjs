// Objective acceptance driver: operates the built UI in Chromium from visible controls. New Game -> Generate the
// default operation (the preview shows the objective count and VP) -> Start -> sweep the map's keyboard cursor
// over every hex and record each hex the cursor announces as an objective, with its settlement and VP.
// Usage: npm run ui:serve, then node scripts/objective-acceptance.mjs <screenshot dir> (OCS_UI_URL overrides the
// address, OCS_CHROMIUM a Chromium-family browser executable such as Edge).
import { chromium } from 'playwright';
import { mkdirSync } from 'node:fs';

const out = process.argv[2];
mkdirSync(out, { recursive: true });
const browser = await chromium.launch(process.env.OCS_CHROMIUM ? { executablePath: process.env.OCS_CHROMIUM, args: ['--no-sandbox'] } : {});
const page = await browser.newPage({ viewport: { width: 1600, height: 1000 } });
const errors = [];
page.on('console', (message) => { if (message.type() === 'error') errors.push(message.text()); });
page.on('pageerror', (error) => errors.push(String(error)));

await page.goto(process.env.OCS_UI_URL ?? 'http://127.0.0.1:4173/');
await page.waitForSelector('#open-menu', { timeout: 30000 });
await page.click('#open-menu');
await page.click('#open-new-game');
await page.waitForSelector('#new-game-form');
await page.click('button[form="new-game-form"]');
await page.waitForSelector('#start-previewed-game:not(:disabled)', { timeout: 60000 });
await page.waitForTimeout(500);
const metrics = await page.locator('.operation-metrics').innerText();
console.log('preview metrics', metrics.replace(/\s+/g, ' '));
console.log('preview stars', await page.locator('.operation-map .preview-objective').count());
await page.locator('.operation-map').first().screenshot({ path: `${out}/01-preview-objectives.jpg`, type: 'jpeg', quality: 88 });

await page.click('#start-previewed-game');
await page.waitForFunction(() => !document.querySelector('.new-game-dialog'), null, { timeout: 60000 });
await page.waitForTimeout(1500);
await page.screenshot({ path: `${out}/02-game-start.jpg`, type: 'jpeg', quality: 85 });
for (let i = 0; i < 3; i += 1) { await page.click('#zoom-out'); await page.waitForTimeout(300); }
await page.screenshot({ path: `${out}/03-game-zoomed-out.jpg`, type: 'jpeg', quality: 88 });
await page.click('#zoom-reset').catch(() => {});

// Sweep: top-left corner, then row by row (right along even rows, left along odd ones).
const live = page.locator('#hex-map + [aria-live]');
await page.focus('#hex-map');
const press = async (key, times = 1) => { for (let i = 0; i < times; i += 1) await page.keyboard.press(key); return (await live.textContent()) ?? ''; };
await press('ArrowUp', 60);
await press('ArrowLeft', 80);
const announced = new Map();
let text = await press('ArrowRight', 0);
for (let row = 0; row < 60; row += 1) {
  const key = row % 2 === 0 ? 'ArrowRight' : 'ArrowLeft';
  for (let column = 0; column < 80; column += 1) {
    const hex = text.split(' · ')[0];
    if (!announced.has(hex)) announced.set(hex, text);
    const next = await press(key);
    if (next === text) break;
    text = next;
  }
  const below = await press('ArrowDown');
  if (below === text) break;
  text = below;
}
const objectives = [...announced.values()].filter((line) => line.includes('objective'));
console.log('hexes swept', announced.size);
console.log('objectives announced', objectives.length);
for (const line of objectives) console.log('  ', line.slice(0, 160));
console.log('objective hexes without a city or town', objectives.filter((line) => !/ · (city|town) · /.test(line)).length);
console.log('errors', JSON.stringify(errors));
await browser.close();
