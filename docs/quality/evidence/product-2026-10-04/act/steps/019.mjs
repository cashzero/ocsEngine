// End the Allied Exploitation and Clean Up, stopping at the first hand-over prompt; there, try to act from the wrong seat
// (ACT-13): select an own unit, open its actions, try a move with the cursor; nothing private or legal may be offered.
const path = [];
for (let guard = 0; guard < 20; guard += 1) {
  const w = await where(h);
  path.push(`${w.player} ${w.phase} [${w.seat}]`);
  if (w.handoff) break;
  if (w.decision.length) { path.push(`decision: ${w.decision.join(' | ')}`); await page.locator('[data-choice]').first().click(); await page.waitForTimeout(300); continue; }
  if (await has(h, '#dismiss-result')) await click(h, '#dismiss-result');
  await click(h, '#end-phase', { settle: 500 });
  const a = await where(h);
  if (/Finish anyway|Press again/.test(a.end)) await click(h, '#end-phase', { settle: 500 });
}
const w = await where(h);
const panel = await textOf(h, '.handoff-panel');
await h.shot('act13-handoff-required');
// Try to act as the seat that still holds the screen.
const attempts = {};
attempts.rosterButton = await has(h, '#open-roster');
const point = await hexOnScreen(h, '1206', gotoHex);
await page.mouse.click(point.x, point.y);
await page.waitForTimeout(300);
attempts.afterClickOwnUnit = (await page.textContent('.command-rail')).replace(/\s+/g, ' ').slice(0, 300);
attempts.modeButtons = await page.locator('[data-mode]').count();
attempts.announceTarget = await gotoHex(h, '1207', { enter: true });
attempts.confirmMove = await has(h, '#confirm-move');
attempts.endPhase = await page.evaluate(() => ({ text: document.querySelector('#end-phase')?.textContent.replace(/\s+/g, ' ').trim(), disabled: document.querySelector('#end-phase')?.disabled }));
attempts.stillHandoff = await has(h, '#begin-required-handoff');
await h.shot('act13-wrong-seat-attempt');
record(h, 'ACT-13', 'Attempting an operation from the wrong hot-seat side: private candidates are unavailable and the UI gives an obvious handoff path', `${w.turn} ${w.player} ${w.phase}, screen held by ${w.seat}; deck: "${panel}"; clicking own Chap TF → "${attempts.afterClickOwnUnit.slice(0, 160)}"; mode buttons ${attempts.modeButtons}; Enter on 1207 → "${attempts.announceTarget}", Confirm move offered ${attempts.confirmMove}; End button ${JSON.stringify(attempts.endPhase)}; hand-over button still shown ${attempts.stillHandoff}`,
  attempts.modeButtons === 0 && !attempts.confirmMove && attempts.stillHandoff);
return { path, w, panel, attempts };
