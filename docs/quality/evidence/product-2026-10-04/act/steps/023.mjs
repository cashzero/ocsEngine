// Retry of the Turn 2 part of step 022 (the Log tab hid the Arrivals list): place arrivals, end Movement, reach Supply.
const trail = [];
await tab(h, 'Arrivals').catch(() => {});
for (let guard = 0; guard < 10; guard += 1) {
  const w = await where(h);
  trail.push(`${w.player} ${w.phase} [${w.seat}] end "${w.end}"`);
  if (/Supply|Reaction|Combat/.test(w.phase) || w.decision.length) break;
  if (await has(h, '.arrivals .deck-unit[data-piece]')) { await placeArrivals(h); continue; }
  await click(h, '#end-phase', { settle: 500 });
  const a = await where(h);
  if (/Finish anyway|Press again/.test(a.end)) await click(h, '#end-phase', { settle: 500 });
}
const w = await where(h);
const deck = (await page.textContent('.command-rail')).replace(/\s+/g, ' ').slice(0, 900);
await h.shot('turn2-after-movement');
return { trail, w, deck };
