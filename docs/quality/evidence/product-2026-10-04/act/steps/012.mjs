// Div Arty I / 7.A (fuelled with its formation) to 1305, two hexes from 3.FJ at 1404; then end the Movement Segment.
await tab(h, 'Unit').catch(() => {});
await selectUnit(h, 'Div Arty I');
const reach = await gotoHex(h, '1305');
const move = await moveSelectedTo(h, '1305', gotoHex);
if (await has(h, '#finish-move')) await click(h, '#finish-move');
const before = await where(h);
await click(h, '#end-phase', { settle: 500 });
let after = await where(h);
let second = null;
if (after.phase === before.phase && after.end === before.end) { second = after.end; await click(h, '#end-phase', { settle: 500 }); after = await where(h); }
const deck = (await page.textContent('.command-rail')).replace(/\s+/g, ' ').slice(0, 500);
const deckTabs = await page.evaluate(() => [...document.querySelectorAll('[data-deck-tab]')].map((n) => n.textContent.trim()));
await h.shot('after-movement-segment');
return { reach, move, before: before.end, second, after, deck, deckTabs, at1404: await gotoHex(h, '1404') };
