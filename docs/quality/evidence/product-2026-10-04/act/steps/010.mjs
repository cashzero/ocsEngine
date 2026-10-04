// ACT-08 overrun by Brown TF (1310) on the engineer at 1410, through the map's red ring (cursor + Enter = click).
// First open the plan and cancel it (state must be unchanged), then open it again, declare, and answer every decision.
// Each decision: the seat that answers, whether the screen was handed over first and whether the map was hidden meanwhile.
await selectUnit(h, 'Brown TF');
let t = Date.now();
await gotoHex(h, '1410', { enter: true });
const draftMs = Date.now() - t;
const draft1 = await page.evaluate(() => document.querySelector('.draft-panel, .deck-context')?.innerText.replace(/\s+/g, ' ').trim() ?? '');
await h.shot('act08-overrun-draft');
await click(h, '#cancel-draft', { settle: 300 });
const afterCancel = { card: (await page.textContent('.command-rail')).replace(/\s+/g, ' ').match(/\d+(\.\d+)? MP left/)?.[0], draftOpen: await has(h, '#declare-draft') };
await selectUnit(h, 'Brown TF');
await gotoHex(h, '1410', { enter: true });
const draft2 = await page.evaluate(() => document.querySelector('.deck-context')?.innerText.replace(/\s+/g, ' ').trim() ?? '');
t = Date.now();
await click(h, '#declare-draft', { settle: 100 });
await page.waitForTimeout(400);
const declareMs = Date.now() - t;
const steps = [];
for (let guard = 0; guard < 40; guard += 1) {
  if (await has(h, '#begin-required-handoff')) {
    const reason = await textOf(h, '.handoff-panel');
    await click(h, '#begin-required-handoff', { settle: 300 });
    const screen = await page.evaluate(() => { const m = document.querySelector('#hex-map'); return { mapVisible: !!m && m.getClientRects().length > 0 && getComputedStyle(m).visibility !== 'hidden' && !m.closest('[inert]'), text: document.body.innerText.replace(/\s+/g, ' ').slice(0, 200) }; });
    steps.push({ handoff: reason, privacy: screen });
    await h.shot(`act10-handoff-${steps.length}`);
    await click(h, '#complete-handoff', { settle: 300 });
    continue;
  }
  if (await has(h, '#dismiss-away')) { await click(h, '#dismiss-away'); continue; }
  const w = await where(h);
  if (w.decision.length === 0) break;
  const prompt = await textOf(h, '.decision-panel');
  const mapVisible = await page.evaluate(() => { const m = document.querySelector('#hex-map'); return !!m && getComputedStyle(m).visibility !== 'hidden' && !m.closest('[inert]'); });
  await h.shot(`act10-decision-${steps.length}`);
  const t2 = Date.now();
  await page.locator('[data-choice]').first().click();
  await page.waitForTimeout(350);
  steps.push({ seat: w.seat, prompt: prompt.slice(0, 260), options: w.decision, chosen: w.decision[0], mapVisible, ms: Date.now() - t2 });
}
const result = await page.evaluate(() => document.querySelector('.result-card')?.innerText.replace(/\s+/g, ' ').trim() ?? '');
await h.shot('act08-overrun-result');
const at1410 = await gotoHex(h, '1410');
await tab(h, 'Log').catch(() => {});
const log = (await textOf(h, '.command-rail')).slice(-500);
state.overrun = { draftMs, draft1, afterCancel, draft2, declareMs, steps, result, at1410, log };
return state.overrun;
