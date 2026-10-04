// ACT-15 continued: a Truck into 0502 must not change the RE; then End twice; the 4.8a elimination decision must follow.
await selectUnit(h, 'Truck');
await gotoHex(h, '0502', { enter: true });
await page.waitForTimeout(250);
const truckPreview = await page.evaluate(() => document.querySelector('.move-preview, .move-popup, [class*=preview]')?.innerText.replace(/\s+/g, ' ').trim() ?? '');
if (await has(h, '#confirm-move')) await click(h, '#confirm-move', { settle: 400 });
if (await has(h, '#finish-move')) await click(h, '#finish-move', { settle: 300 });
const warning = await page.evaluate(() => document.querySelector('[class*=overstack]')?.innerText.replace(/\s+/g, ' ').trim() ?? '');
await click(h, '#end-phase', { settle: 500 });
const first = await page.evaluate(() => ({ end: document.querySelector('#end-phase')?.innerText.replace(/\s+/g, ' ').trim(), phase: document.querySelector('.phase-picker strong')?.textContent.trim() }));
await h.shot('act15-end-first-press');
await click(h, '#end-phase', { settle: 600 });
let w = await where(h);
const decisions = [];
for (let guard = 0; guard < 12; guard += 1) {
  w = await where(h);
  if (await has(h, '#begin-required-handoff')) { decisions.push(`handoff: ${(await textOf(h, '.handoff-panel')).slice(0, 120)}`); break; }
  if (w.decision.length === 0) break;
  const prompt = (await textOf(h, '.decision-panel')).slice(0, 300);
  await h.shot(`act15-decision-${decisions.length}`);
  decisions.push(`[${w.seat}] "${prompt}" options ${w.decision.join(' | ')} → ${w.decision[0]}`);
  await page.locator('[data-choice]').first().click();
  await page.waitForTimeout(350);
}
const stack = await gotoHex(h, '0502');
await tab(h, 'Log');
const log = (await textOf(h, '.command-rail')).slice(0, 500);
const m = state.moves;
record(h, 'ACT-15', 'Overstack: the move preview warns and reads Confirm anyway; a warning beside End names the hex and RE; End needs a second press; the 4.8a elimination decision follows; moves within 10 RE show none; Trucks and dumps are not counted', `${m.length - 1} moves into 0502 within 10 RE showed no warning (e.g. "${m[0].preview}"); the 11th (Div Arty II / 7.A) previewed "${m.at(-1).preview}" with button "${m.at(-1).button}"; beside End: "${warning}"; a Truck then entered with "${truckPreview}" and the RE stayed as above; End → "${first.end}"; second press → ${decisions.join(' ‖ ')}; 0502 afterwards "${stack}"; Log "${log.slice(0, 200)}"`,
  m.slice(0, -1).every((x) => !x.warned) && m.at(-1).warned && m.at(-1).button === 'Confirm anyway' && /0502.*10\.5 RE/.test(warning) && !/Overstack/.test(truckPreview) && /Finish anyway|overstack/i.test(first.end) && decisions.some((d) => /4\.8|eliminat|overstack/i.test(d)));
return { truckPreview, warning, first, decisions, stack, log };
