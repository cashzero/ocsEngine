// AIR-OM5: from the off-map airfield, an air barrage with all four aircraft through the Air tab.
// The first press was made in step 002.
if (/Press again/.test((await where(h)).end)) await click(h, '#end-phase', { settle: 600 });
const at = await where(h);
await tab(h, 'Air');
const buttons = await page.evaluate(() => [...document.querySelectorAll('[data-air-mission]')].map((b) => `${b.dataset.airMission}${b.disabled ? ' (disabled)' : ''}`));
await page.locator('[data-air-mission="BARRAGE"]').first().click();
await page.waitForTimeout(300);
const chips = await page.evaluate(() => [...document.querySelectorAll('.hex-chips [data-target-hex]')].map((c) => c.textContent.trim()));
await page.locator('.hex-chips [data-target-hex]').first().click();
await page.waitForTimeout(400);
const boxes = page.locator('[data-air-aircraft]');
const count = await boxes.count();
for (let index = 0; index < Math.min(count, 4); index += 1) if (!(await boxes.nth(index).isChecked())) await boxes.nth(index).check();
const labels = await page.locator('.air-panel .participant').allInnerTexts();
await h.shot('o02-mission-planned');
await click(h, '#declare-air-mission');
await settleDecisions(h);
await page.waitForTimeout(500);
const log = await page.evaluate(() => document.querySelector('.air-log, .mission-log, [data-air-log]')?.innerText ?? '');
await tab(h, 'Log');
const history = await page.evaluate(() => [...document.querySelectorAll('.log-entry, .history li, li')].map((n) => n.textContent.replace(/\s+/g, ' ').trim()).filter((t) => /barrage|Barrage|Ju\.88|Bf\.109|Fw-190/.test(t)).slice(-8));
await h.shot('o02-mission-flown');
await gotoHex(h, state.fieldHex, { enter: false });
const fieldText = await page.evaluate(() => document.querySelector('#hex-map ~ [aria-live], [aria-live].visually-hidden')?.textContent ?? '');
return { at, buttons, chips: chips.slice(0, 8), aircraft: labels, history, fieldText, after: await where(h) };
