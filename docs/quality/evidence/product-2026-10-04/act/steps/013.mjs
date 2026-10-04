// Confirm ending the Movement Segment (second press), then look at the Barrage Segment: deck tabs, barrage targets.
await click(h, '#end-phase', { settle: 600 });
const w = await where(h);
const deckTabs = await page.evaluate(() => [...document.querySelectorAll('[data-deck-tab]')].map((n) => n.textContent.trim()));
let chips = [];
if (deckTabs.some((t) => /Targets/.test(t))) { await tab(h, 'Targets'); chips = await page.evaluate(() => [...document.querySelectorAll('[data-target-hex]')].map((n) => n.textContent.trim())); }
await selectUnit(h, 'Div Arty I');
const card = (await page.textContent('.command-rail')).replace(/\s+/g, ' ').slice(80, 460);
const at1404 = await gotoHex(h, '1404');
await h.shot('barrage-segment');
return { w, deckTabs, chips, card, at1404 };
