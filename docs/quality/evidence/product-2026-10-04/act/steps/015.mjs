// End the Barrage Segment; in the Combat Segment read the attack targets.
if (await has(h, '#dismiss-result')) await click(h, '#dismiss-result');
await click(h, '#end-phase', { settle: 600 });
let w = await where(h);
if (/Finish anyway|Press again/.test(w.end)) { await click(h, '#end-phase', { settle: 600 }); w = await where(h); }
const deckTabs = await page.evaluate(() => [...document.querySelectorAll('[data-deck-tab]')].map((n) => n.textContent.trim()));
let chips = [];
if (deckTabs.some((t) => /Targets/.test(t))) { await tab(h, 'Targets'); chips = await page.evaluate(() => [...document.querySelectorAll('[data-target-hex]')].map((n) => n.textContent.trim())); }
await h.shot('combat-segment');
return { w, deckTabs, chips, deck: (await page.textContent('.command-rail')).replace(/\s+/g, ' ').slice(0, 400) };
