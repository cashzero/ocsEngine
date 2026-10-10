import { chromium } from 'playwright';
const S = process.argv[2] ?? '.';
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1500, height: 950 } });
const errors = [];
page.on('pageerror', (e) => errors.push(e.message));
page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
const shot = (name) => page.screenshot({ path: S + '/' + name + '.png' });
await page.goto('http://127.0.0.1:4391/'); await page.waitForSelector('#open-menu', { timeout: 30000 });
await page.click('#open-menu'); await page.click('#open-new-game');
await page.selectOption('#new-game-engagement', 'ALLIED_ATTACKS');
await page.selectOption('#new-game-sea', 'ATTACKER');
await shot('01-settings');
await page.click('button[form="new-game-form"]'); await page.waitForSelector('#start-previewed-game:not(:disabled)', { timeout: 90000 });
await page.waitForTimeout(800); await shot('02-preview');
await page.click('#start-previewed-game'); await page.waitForFunction(() => !document.querySelector('.new-game-dialog'), null, { timeout: 90000 });
await page.waitForTimeout(1000); await shot('03-start');
const top = async () => (await page.locator('header, .top-bar, body').first().innerText()).replace(/\s+/g, ' ').slice(0, 220);
console.log('T1', await top());
let steps = 0; const log = [];
while (steps < 120) {
  steps += 1;
  const text = await top();
  if (/TURN 2 \/ \d+/.test(text) && /ALLIED PLAYER TURN Movement/i.test(text)) break;
  if (await page.locator('#begin-required-handoff').isVisible().catch(() => false)) { log.push('begin handoff'); await page.click('#begin-required-handoff'); await page.waitForTimeout(300); continue; }
  if (await page.locator('#complete-handoff').isVisible().catch(() => false)) { log.push('handoff'); await page.click('#complete-handoff'); await page.waitForTimeout(300); continue; }
  const second = page.locator('.decision-option', { hasText: 'Go second' });
  if (await second.isVisible().catch(() => false)) { log.push('decision: Go second'); await second.click(); await page.waitForTimeout(400); continue; }
  const option = page.locator('.decision-option').first();
  if (await option.isVisible().catch(() => false)) { log.push('decision: ' + (await option.innerText())); await option.click(); await page.waitForTimeout(400); continue; }
  const end = page.locator('#end-phase');
  if (await end.isEnabled().catch(() => false)) { log.push('end: ' + (await end.innerText()).replace(/\s+/g, ' ')); await end.click(); await page.waitForTimeout(250); if (await end.isEnabled().catch(() => false) && /Confirm|again|anyway/i.test(await end.innerText())) await end.click(); await page.waitForTimeout(500); continue; }
  log.push('stuck: ' + text); await shot('stuck'); break;
}
console.log(log.join('\n'));
console.log('TOP', await top());
await page.mouse.click(1440, 900); await page.click('#deselect').catch(() => {});
await page.waitForTimeout(600); await shot('04-turn2-movement');
await page.locator('button', { hasText: 'Got it' }).click().catch(() => {});
await page.waitForTimeout(500); await shot('05-sea-panel');
const panel = page.locator('.sea-panel');
console.log('PANEL', (await panel.innerText().catch(() => 'none')).replace(/\s+/g, ' ').slice(0, 900));
// Ship the largest SP the panel allows to the first port.
const dump = panel.locator('input[data-sea-dump]').first();
await dump.fill('4'); await dump.dispatchEvent('input'); await dump.dispatchEvent('change');
const options = await page.locator('#sea-destination option').allInnerTexts();
console.log('DESTINATIONS', JSON.stringify(options));
const value = await page.locator('#sea-destination option').nth(1).getAttribute('value');
await page.selectOption('#sea-destination', value);
await page.waitForTimeout(400); await shot('06-sea-ready');
console.log('READY', (await panel.innerText()).replace(/\s+/g, ' ').slice(0, 700));
await page.click('#confirm-sea'); await page.waitForTimeout(1200); await shot('07-shipped');
console.log('AFTER', (await top()));
const panel2 = page.locator('.sea-panel');
console.log('PANEL2', (await panel2.innerText().catch(() => 'none')).replace(/\s+/g, ' ').slice(0, 900));
// Ship a combat unit (if one waits) to the second port.
const unit = panel2.locator('input[data-sea-unit]:not([disabled])').first();
if (await unit.count() > 0) {
  await unit.check();
  const second = await page.locator('#sea-destination option').nth(2).getAttribute('value').catch(() => null) ?? value;
  await page.selectOption('#sea-destination', second);
  await page.waitForTimeout(400);
  console.log('UNIT READY', (await panel2.innerText()).replace(/\s+/g, ' ').slice(0, 700));
  await page.click('#confirm-sea').catch(() => {}); await page.waitForTimeout(1200); await shot('08-unit-shipped');
  console.log('AFTER2', (await top()));
}
await page.click('#deselect').catch(() => {});
await page.mouse.move(700, 500); await page.mouse.down(); await page.mouse.move(1150, 500, { steps: 10 }); await page.mouse.up();
await page.waitForTimeout(600); await shot('09-coast');
console.log('ERRORS', JSON.stringify(errors));
await browser.close();
