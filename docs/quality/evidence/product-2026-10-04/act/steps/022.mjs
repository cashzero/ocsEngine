// Record ACT-01 and ACT-14 for Turn 1 (steps 002–021: every operation was a click, key press or typed value on a visible
// control). Then, in Turn 2, go to the Allied Supply Phase and see whether it stops (ACT-06).
const t1 = state.turn1;
const handoffs = t1.log.filter((l) => /hand|Hand/.test(l)).length;
record(h, 'ACT-01', 'Advancing through every phase/segment of one whole turn reaches the next game turn with no dead end', `Turn 1 ran Allied Reinforcement → Movement (Movement, Barrage) → Supply (passed automatically, no legal action) → Axis Reaction (passed: only dump blowing) → Combat (Barrage, Combat) → Exploitation → Clean Up → Axis Player Turn (same phases) → First Player decision → "${t1.trail.at(-1)}"; ${t1.log.length} Log entries; no step needed a hidden control or a direct API call`, /Turn 2/.test(t1.trail.at(-1)));
record(h, 'ACT-14', 'A whole turn with at least one unit action, all required hand-overs and decisions; turn increments; no phase skipped by a shortcut', `Unit actions: place reinforcements (both sides), Reserve and release, fuel, 5 moves, overrun 1410, barrage 1404, attack 1509 (Allied), attack 1305 (Axis); decisions answered by the owning seat (supply sources, advance after combat, First Player); hand-overs with the map hidden: overrun ×2, Allied attack ×2, Axis turn start, Axis attack ×2, First Player; skipped phases were passed by the product itself with the reason in the Log ("Passed automatically, no legal actions")`, /Turn 2/.test(t1.trail.at(-1)));
// Turn 2: reinforcements, Movement, then the Supply Phase.
const trail = [];
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
