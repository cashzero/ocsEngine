// End the Combat Segment; in the Exploitation Phase release the reserve 82.Abn and move it (ACT-04).
if (await has(h, '#dismiss-result')) await click(h, '#dismiss-result');
await click(h, '#end-phase', { settle: 600 });
let w = await where(h);
if (/Finish anyway|Press again/.test(w.end)) { await click(h, '#end-phase', { settle: 600 }); w = await where(h); }
const handoffSeen = [];
for (let guard = 0; guard < 6 && (w.handoff || w.complete || w.decision.length); guard += 1) {
  if (w.decision.length) { handoffSeen.push(`decision ${w.seat}: ${w.decision.join(' | ')}`); await page.locator('[data-choice]').first().click(); await page.waitForTimeout(300); }
  else { handoffSeen.push('handoff'); await handoff(h); }
  w = await where(h);
}
await tab(h, 'Unit').catch(() => {});
await selectUnit(h, '82.Abn');
const before = (await page.textContent('.command-rail')).replace(/\s+/g, ' ').slice(70, 330);
const releaseOffered = await has(h, '#release-reserve');
let after = '';
let releaseMs = null;
let move = null;
if (releaseOffered) {
  const t = Date.now();
  await click(h, '#release-reserve', { settle: 100 });
  await page.waitForFunction(() => !document.querySelector('#release-reserve'), null, { timeout: 5000 });
  releaseMs = Date.now() - t;
  await page.waitForTimeout(300);
  after = (await page.textContent('.command-rail')).replace(/\s+/g, ' ').slice(70, 330);
  await h.shot('act04-released');
  move = await moveSelectedTo(h, '0205', gotoHex);
  if (await has(h, '#finish-move')) await click(h, '#finish-move');
}
const at = await gotoHex(h, '0205');
await tab(h, 'Log').catch(() => {});
const log = (await textOf(h, '.command-rail')).slice(0, 500);
record(h, 'ACT-04', 'A reachable reserve unit becomes released and can act in its legal segment', `${w.turn} ${w.player} ${w.phase} (${handoffSeen.join('; ') || 'no interruptions'}); 82.Abn before "${before}"; Release reserve offered ${releaseOffered}${releaseOffered ? ` → ${releaseMs} ms → "${after}"; then moved to 0205: ${JSON.stringify(move)} → "${at}"` : ''}; Log "${log.slice(0, 250)}"`,
  releaseOffered && move?.moved && /82\.Abn/.test(at) && releaseMs <= 1500);
return { w, handoffSeen, before, releaseOffered, releaseMs, after, move, at, log };
