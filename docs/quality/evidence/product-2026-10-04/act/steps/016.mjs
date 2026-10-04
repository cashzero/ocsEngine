// ACT-07 regular combat: the Attack 1509 chip, its plan (participants, odds), Declare, every decision, the result.
await tab(h, 'Targets');
let t = Date.now();
await click(h, '[data-target-hex]', { settle: 100 });
await page.waitForSelector('#declare-draft', { timeout: 5000 });
const planMs = Date.now() - t;
const plan = await page.evaluate(() => document.querySelector('.deck-context')?.innerText.replace(/\s+/g, ' ').trim() ?? '');
const participants = await page.evaluate(() => [...document.querySelectorAll('[data-participant]')].map((n) => `${n.closest('label').innerText.replace(/\s+/g, ' ').trim()} ${n.checked ? '[x]' : '[ ]'}`));
const before = await gotoHex(h, '1509');
await h.shot('act07-attack-plan');
const enabled = !(await page.locator('#declare-draft').isDisabled());
let steps = [];
let declareMs = null;
if (enabled) {
  t = Date.now();
  await click(h, '#declare-draft', { settle: 300 });
  declareMs = Date.now() - t;
  steps = await state.resolve('act07');
}
const result = await page.evaluate(() => document.querySelector('.result-card')?.innerText.replace(/\s+/g, ' ').trim() ?? '');
await h.shot('act07-attack-result');
const after = await gotoHex(h, '1509');
await tab(h, 'Log').catch(() => {});
const log = (await textOf(h, '.command-rail')).slice(0, 700);
state.attack = { planMs, plan, participants, enabled, declareMs, steps, result, before, after, log };
record(h, 'ACT-07', 'Regular combat: legal participants and target are visible and the transaction starts', `Attack 1509 chip → plan in ${planMs} ms: "${plan.slice(0, 300)}"; participants ${participants.join('; ')}; Declare ${enabled ? `${declareMs} ms` : 'DISABLED'}; decisions ${steps.map((s) => s.seat ? `${s.seat}: "${s.prompt.slice(0, 70)}" → ${s.chosen}` : `handoff (map hidden ${!s.mapVisible})`).join(' → ')}; result "${result.slice(0, 200)}"; 1509 before "${before}" after "${after}"`,
  enabled && participants.length > 0 && steps.length > 0 && planMs <= 1000 && declareMs <= 1500);
return state.attack;
