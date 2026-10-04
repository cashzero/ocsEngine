// A reusable resolver kept in `state`: after a declaration, answer every decision with `pick` (first option by default),
// handing the screen over when asked and noting whether the map was hidden while it passed.
state.resolve = async (label, pick = () => 0) => {
  const steps = [];
  for (let guard = 0; guard < 40; guard += 1) {
    if (await has(h, '#begin-required-handoff')) {
      const reason = await textOf(h, '.handoff-panel');
      await click(h, '#begin-required-handoff', { settle: 300 });
      const mapVisible = await page.evaluate(() => { const m = document.querySelector('#hex-map'); return !!m && m.getClientRects().length > 0 && getComputedStyle(m).visibility !== 'hidden' && !m.closest('[inert]'); });
      steps.push({ handoff: reason.slice(0, 160), mapVisible });
      await h.shot(`${label}-handoff-${steps.length}`);
      await click(h, '#complete-handoff', { settle: 300 });
      continue;
    }
    if (await has(h, '#dismiss-away')) { await click(h, '#dismiss-away'); continue; }
    const w = await where(h);
    if (w.decision.length === 0) break;
    const prompt = await textOf(h, '.decision-panel');
    await h.shot(`${label}-decision-${steps.length}`);
    const index = pick(prompt, w.decision) ?? 0;
    const t = Date.now();
    await page.locator('[data-choice]').nth(index).click();
    await page.waitForTimeout(350);
    steps.push({ seat: w.seat, prompt: prompt.slice(0, 220), options: w.decision, chosen: w.decision[index], ms: Date.now() - t });
  }
  return steps;
};
// ACT-09: the Barrage chip for 1404, its plan, Declare, and the decisions.
await tab(h, 'Targets');
let t = Date.now();
await click(h, '[data-target-hex]', { settle: 100 });
await page.waitForSelector('#declare-draft', { timeout: 5000 });
const planMs = Date.now() - t;
const plan = await page.evaluate(() => document.querySelector('.deck-context')?.innerText.replace(/\s+/g, ' ').trim() ?? '');
const participants = await page.evaluate(() => [...document.querySelectorAll('[data-participant]')].map((n) => `${n.closest('label').innerText.replace(/\s+/g, ' ').trim()} ${n.checked ? '[x]' : '[ ]'}`));
await h.shot('act09-barrage-plan');
t = Date.now();
await click(h, '#declare-draft', { settle: 300 });
const declareMs = Date.now() - t;
const steps = await state.resolve('act09');
const after = await gotoHex(h, '1404');
await tab(h, 'Log').catch(() => {});
const log = (await textOf(h, '.command-rail')).slice(0, 600);
await h.shot('act09-barrage-done');
state.barrage = { planMs, plan, participants, declareMs, steps, after, log };
record(h, 'ACT-09', 'Legal firer/target are visible and the barrage transaction starts', `Barrage 1404 chip → plan in ${planMs} ms: "${plan.slice(0, 260)}"; firers ${participants.join('; ')}; Declare ${declareMs} ms; decisions ${steps.map((s) => s.seat ? `${s.seat}: ${s.chosen}` : `handoff (map hidden ${!s.mapVisible})`).join(' → ')}; 1404 afterwards "${after}"; Log "${log.slice(0, 200)}"`,
  /Barrage/.test(plan) && participants.length > 0 && planMs <= 1000 && declareMs <= 1500);
return state.barrage;
