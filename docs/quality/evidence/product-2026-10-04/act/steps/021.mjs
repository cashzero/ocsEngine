// Axis attack on 1305 (Allied artillery), then play the rest of Turn 1 to the start of Turn 2, noting every phase, every
// hand-over and every decision on the way.
if (await has(h, '#dismiss-result')) await click(h, '#dismiss-result');
await tab(h, 'Targets');
await click(h, '[data-target-hex]', { settle: 300 });
const plan = await page.evaluate(() => document.querySelector('.deck-context')?.innerText.replace(/\s+/g, ' ').trim() ?? '');
await click(h, '#declare-draft', { settle: 300 });
const attackSteps = await state.resolve('axis-attack');
const result = await page.evaluate(() => document.querySelector('.result-card')?.innerText.replace(/\s+/g, ' ').trim() ?? '');
const trail = [];
for (let guard = 0; guard < 40; guard += 1) {
  const w = await where(h);
  if (/Turn 2/.test(w.turn) && !w.handoff && !w.complete && w.decision.length === 0) { trail.push(`reached ${w.turn} ${w.player} ${w.phase} [${w.seat}]`); break; }
  if (await has(h, '#begin-required-handoff')) { trail.push(`handoff: ${(await textOf(h, '.handoff-panel')).slice(0, 120)}`); await click(h, '#begin-required-handoff', { settle: 300 }); continue; }
  if (await has(h, '#complete-handoff')) { await click(h, '#complete-handoff', { settle: 300 }); continue; }
  if (await has(h, '#dismiss-away')) { await click(h, '#dismiss-away'); continue; }
  if (await has(h, '#dismiss-result')) { await click(h, '#dismiss-result'); continue; }
  if (w.decision.length) { const prompt = (await textOf(h, '.decision-panel')).slice(0, 160); trail.push(`decision [${w.seat}] "${prompt}" → ${w.decision[0]}`); await page.locator('[data-choice]').first().click(); await page.waitForTimeout(300); continue; }
  trail.push(`${w.player} ${w.phase} [${w.seat}] → End`);
  await click(h, '#end-phase', { settle: 500 });
  const a = await where(h);
  if (/Finish anyway|Press again/.test(a.end)) await click(h, '#end-phase', { settle: 500 });
}
await h.shot('turn-2-start');
await tab(h, 'Log').catch(() => {});
const log = await page.evaluate(() => [...document.querySelectorAll('.deck-event')].map((n) => n.innerText.replace(/\s+/g, ' ').trim()));
state.turn1 = { plan, attackSteps, result, trail, log };
return { plan: plan.slice(0, 250), attackSteps, result: result.slice(0, 300), trail, logCount: log.length };
