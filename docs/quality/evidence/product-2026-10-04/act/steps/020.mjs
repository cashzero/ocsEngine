// Axis Player Turn: hand over (privacy), place arrivals, move 3.FJ one hex, end Movement; stop if the Supply Phase stops.
const log = [];
await click(h, '#begin-required-handoff', { settle: 300 });
const privacy = await page.evaluate(() => { const m = document.querySelector('#hex-map'); return { mapVisible: !!m && m.getClientRects().length > 0 && getComputedStyle(m).visibility !== 'hidden' && !m.closest('[inert]'), text: document.body.innerText.replace(/\s+/g, ' ').slice(0, 160) }; });
await click(h, '#complete-handoff', { settle: 400 });
if (await has(h, '#dismiss-away')) { log.push(`away report: ${(await textOf(h, '.away-report, .deck-context')).slice(0, 300)}`); await click(h, '#dismiss-away'); }
await tab(h, 'Arrivals').catch(() => {});
await placeArrivals(h);
await click(h, '#end-phase', { settle: 500 });
let w = await where(h);
log.push(`${w.player} ${w.phase} [${w.seat}]`);
await tab(h, 'Unit').catch(() => {});
await selectUnit(h, '3.FJ');
const move = await moveSelectedTo(h, '1405', gotoHex);
if (await has(h, '#finish-move')) await click(h, '#finish-move');
await click(h, '#end-phase', { settle: 500 });
w = await where(h);
if (/Finish anyway|Press again/.test(w.end)) { await click(h, '#end-phase', { settle: 500 }); w = await where(h); }
for (let guard = 0; guard < 8 && !/Supply|Reaction|Combat/.test(w.phase); guard += 1) {
  if (w.handoff || w.complete) { log.push(`handoff at ${w.phase}`); break; }
  if (w.decision.length) break;
  await click(h, '#end-phase', { settle: 500 });
  w = await where(h);
  if (/Finish anyway|Press again/.test(w.end)) { await click(h, '#end-phase', { settle: 500 }); w = await where(h); }
}
await h.shot('axis-after-movement');
const deck = (await page.textContent('.command-rail')).replace(/\s+/g, ' ').slice(0, 900);
return { privacy, log, move, w, deck };
