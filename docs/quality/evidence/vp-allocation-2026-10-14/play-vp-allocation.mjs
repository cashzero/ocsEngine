// New Game Sea per side (2026-10-13): Allied attack, flank sea, Allied ports only (no inland entry), Axis Sea Cap 0.
// Plays Game Turn 1 through and ships from the Allied Box in Turn 2 Movement. Usage: node play-sea-sides.mjs <out-dir> [url]
import { chromium } from 'playwright';
const S = process.argv[2] ?? '.';
const URL = process.argv[3] ?? 'http://127.0.0.1:4173/';
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1500, height: 950 } });
const errors = [];
page.on('pageerror', (e) => errors.push(e.message));
page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
const shot = (name) => page.screenshot({ path: S + '/' + name + '.png' });
const text = async (selector) => (await page.locator(selector).first().innerText().catch(() => '')).replace(/\s+/g, ' ');
await page.goto(URL, { timeout: 60000 }); await page.waitForSelector('#open-menu', { timeout: 30000 });
await page.click('#open-menu'); await page.click('#open-new-game');
console.log('NO SEA per-side fields shown:', await page.locator('#new-game-inland-entry-allied').count());
await page.fill('#new-game-width', '28');
await page.fill('#new-game-height', '20');
await page.fill('#new-game-divisions', '4');
await page.fill('#new-game-armored', '1');
await page.fill('#new-game-map-seed', '206569473');
await page.selectOption('#new-game-engagement', 'ALLIED_ATTACKS');
await page.selectOption('#new-game-sea', 'FLANK');
console.log('FLANK fields:', await page.locator('#new-game-inland-entry-allied, #new-game-inland-entry-axis, #new-game-sea-cap-allied, #new-game-sea-cap-axis').count());
console.log('DEFAULT SEA CAP', await page.inputValue('#new-game-sea-cap-allied'), await page.inputValue('#new-game-sea-cap-axis'));
await page.selectOption('#new-game-inland-entry-allied', 'NO');
console.log('ALLIED min after NO:', await page.getAttribute('#new-game-sea-cap-allied', 'min'));
// Sea Cap 0 for a side without inland entry is refused.
await page.fill('#new-game-sea-cap-allied', '0');
await page.click('button[form="new-game-form"]'); await page.waitForTimeout(600);
console.log('REFUSED:', await text('#field-error'), '| still on settings:', await page.locator('#new-game-sea-cap-allied').isVisible());
await shot('01-refused-zero');
await page.fill('#new-game-sea-cap-allied', '5');
await page.fill('#new-game-sea-cap-axis', '0');
await page.waitForTimeout(300);
await shot('02-settings');
console.log('HELP:', (await text('.new-game-settings')).match(/Sea Cap: .*?per division[^.]*\./)?.[0]);
await page.click('button[form="new-game-form"]'); await page.waitForSelector('#start-previewed-game:not(:disabled)', { timeout: 90000 });
await page.waitForTimeout(800); await shot('03-preview');
// The west edge up close: Allied lands by sea, so no Allied entry band or Supply Source mark should be drawn there.
await page.screenshot({ path: S + '/03b-preview-west-edge.png', clip: { x: 40, y: 160, width: 260, height: 630 } });
console.log('PREVIEW entry bands allied/axis:', await page.locator('.preview-entry.side-first').count(), await page.locator('.preview-entry.side-second').count(),
  '| sources allied/axis:', await page.locator('.preview-supply-source.side-first').count(), await page.locator('.preview-supply-source.side-second').count());
console.log('PREVIEW METRICS:', await text('.operation-metrics'), '|', await text('.preview-key'));
await page.click('#start-previewed-game'); await page.waitForFunction(() => !document.querySelector('.new-game-dialog'), null, { timeout: 90000 });
await page.waitForTimeout(1000); await shot('04-start');
const top = async () => (await page.locator('header, .top-bar, body').first().innerText()).replace(/\s+/g, ' ').slice(0, 240);
console.log('T1', await top());
let steps = 0; const log = [];
while (steps < 150) {
  steps += 1;
  const now = await top();
  if (/TURN 2 \/ \d+/.test(now) && /ALLIED PLAYER TURN Movement/i.test(now)) break;
  if (/ALLIED PLAYER TURN Reinforcement/i.test(now) && /TURN 2/.test(now) && !log.includes('t2-reinf')) { log.push('t2-reinf'); await shot('05-turn2-reinforcement'); log.push('T2 REINF: ' + (await text('.command-deck, aside, body')).slice(0, 300)); }
  if (await page.locator('#begin-required-handoff').isVisible().catch(() => false)) { log.push('begin handoff'); await page.click('#begin-required-handoff'); await page.waitForTimeout(300); continue; }
  if (await page.locator('#complete-handoff').isVisible().catch(() => false)) { log.push('handoff'); await page.click('#complete-handoff'); await page.waitForTimeout(300); continue; }
  const second = page.locator('.decision-option', { hasText: 'Go second' });
  if (await second.isVisible().catch(() => false)) { log.push('decision: Go second'); await second.click(); await page.waitForTimeout(400); continue; }
  const option = page.locator('.decision-option').first();
  if (await option.isVisible().catch(() => false)) { log.push('decision: ' + (await option.innerText())); await option.click(); await page.waitForTimeout(400); continue; }
  const end = page.locator('#end-phase');
  if (await end.isEnabled().catch(() => false)) { log.push('end: ' + (await end.innerText()).replace(/\s+/g, ' ')); await end.click(); await page.waitForTimeout(250); if (await end.isEnabled().catch(() => false) && /Confirm|again|anyway/i.test(await end.innerText())) await end.click(); await page.waitForTimeout(500); continue; }
  log.push('stuck: ' + now); await shot('stuck'); break;
}
console.log(log.join('\n'));
console.log('TOP', await top());
if (!/TURN 2/.test(await top())) throw new Error('Did not complete Game Turn 1');
await page.click('#deselect').catch(() => {});
await page.locator('button', { hasText: 'Got it' }).click().catch(() => {});
await page.waitForTimeout(600); await shot('06-turn2-movement');
const panel = page.locator('.sea-panel');
console.log('PANEL', (await panel.innerText().catch(() => 'none')).replace(/\s+/g, ' ').slice(0, 900));
const destinations = await page.locator('#sea-destination option').allInnerTexts().catch(() => []);
console.log('DESTINATIONS', JSON.stringify(destinations));
const dump = panel.locator('input[data-sea-dump]').first();
if (await dump.count() > 0) { await dump.fill('4'); await dump.dispatchEvent('input'); await dump.dispatchEvent('change'); }
const value = await page.locator('#sea-destination option').nth(1).getAttribute('value').catch(() => null);
if (value) {
  await page.selectOption('#sea-destination', value); await page.waitForTimeout(400); await shot('07-sea-ready');
  await page.click('#confirm-sea'); await page.waitForTimeout(1200); await shot('08-shipped');
  console.log('AFTER SHIP', await top());
}
console.log('ERRORS', JSON.stringify(errors));
await browser.close();
