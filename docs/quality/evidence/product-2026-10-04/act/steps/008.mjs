// Brown TF to 1310 (beside the enemy engineer at 1410), then read the overrun targets it offers.
await selectUnit(h, 'Brown TF');
const move = await moveSelectedTo(h, '1310', gotoHex);
await page.waitForTimeout(300);
await selectUnit(h, 'Brown TF');
const card = (await page.textContent('.command-rail')).replace(/\s+/g, ' ').slice(90, 330);
const tabs = await page.evaluate(() => [...document.querySelectorAll('[data-deck-tab]')].map((n) => n.textContent.trim()));
let chips = [];
if (tabs.some((t) => /Targets/.test(t))) { await tab(h, 'Targets'); chips = await page.evaluate(() => [...document.querySelectorAll('[data-target-hex]')].map((n) => n.textContent.trim())); }
const ring = await gotoHex(h, '1410');
await h.shot('act08-overrun-target');
return { move, card, tabs, chips, ring };
