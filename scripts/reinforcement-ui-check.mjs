// Operate the built UI, keyboard edits, complete turns, and sea/land divisional entry.
// npm run build && node scripts/reinforcement-ui-check.mjs artifacts/reinforcement-select
import { click, open, where, advanceTo, gotoHex, settleDecisions, placeArrivals, has } from './air-acceptance/harness.mjs';
import { configure, generate, openNewGame, start, menuSummary } from './product-acceptance/lib.mjs';

const h = await open({ evidenceDir: process.argv[2] ?? 'artifacts/reinforcement-select' });
const { page } = h;
const read = (id) => page.inputValue(`#new-game-${id}`);
const fill = async (id, value) => { await page.fill(`#new-game-${id}`, String(value)); await page.press(`#new-game-${id}`, 'Tab'); };
const select = async (id, value) => { await page.selectOption(`#new-game-${id}`, String(value)); };
const check = (ok, expectation, observed = '') => {
  h.rows.push({ expectation, observed, status: ok ? 'PASS' : 'FAIL' });
  h.note(`${ok ? 'PASS' : 'FAIL'} ${expectation}: ${observed}`);
  if (!ok) throw new Error(expectation);
};
let landEntered = null;
const advance = (until) => advanceTo(h, until, { limit: 180, before: async s => {
  h.note(`Phase ${JSON.stringify(s)}`);
  if (landEntered === null && /Turn 3/.test(s.turn) && s.phase === 'Reinforcement' && s.player.startsWith('Axis')) {
    const ground = await page.locator('.arrivals .deck-unit[data-piece]').evaluateAll(nodes => nodes.map(n => ({ id: n.dataset.piece, text: n.innerText })));
    const arrival = ground.find(r => /:f\d+-/.test(r.id));
    check(!!arrival, 'First Axis reinforcement division appears at T3', JSON.stringify(ground));
    await h.shot('land-ready'); await placeArrivals(h); await click(h, '#open-roster');
    check(await page.locator(`[data-roster-pick="${arrival.id}"]`).count() === 1, 'Axis divisional reinforcement enters legally and appears in the roster', arrival.text);
    await h.shot('land-arrived'); await click(h, '#close-roster');
    landEntered = arrival;
    return true;
  }
  return false;
} });
const printed = (id) => { const [q, r] = id.split(',').map(Number); return `${String(q + Math.floor(r / 2) + 1).padStart(2, '0')}${String(r + 1).padStart(2, '0')}`; };
try {
  await openNewGame(h);
  await configure(h, { turnLimit: 8, engagement: 'MEETING' });
  for (const side of ['allied', 'axis']) {
    const choices = await page.locator(`#new-game-reinforcements-${side}`).evaluate(el => ({ tag: el.tagName, options: [...el.options].map(o => ({ value: o.value, text: o.textContent })) }));
    check(choices.tag === 'SELECT' && choices.options.map(o => o.value).join(',') === '0,25,50,75', `${side} ratio is a labelled discrete selector`, JSON.stringify(choices));
  }
  const turn = page.locator('#new-game-reinforcements-first-turn');
  await turn.focus(); await page.keyboard.press('ControlOrMeta+A'); await page.keyboard.press('Backspace');
  check(await turn.inputValue() === '', 'First turn stays empty while being edited');
  await page.keyboard.type('4'); await page.keyboard.press('Tab');
  check(await turn.inputValue() === '4', 'Typing first turn 4 keeps 4');
  await select('reinforcements-allied', 75); await select('reinforcements-axis', 25); await fill('reinforcements-first-turn', 3);
  await page.locator('#new-game-turn-limit').focus(); await page.keyboard.press('ControlOrMeta+A'); await page.keyboard.press('Backspace');
  check(await read('reinforcements-allied') === '75' && await turn.inputValue() === '3', 'Clearing turn limit preserves reinforcement settings');
  await page.keyboard.type('10'); await page.keyboard.press('Tab');
  check(await read('reinforcements-allied') === '75' && await turn.inputValue() === '3', 'Typing turn limit 10 preserves 75% / T3');
  await fill('turn-limit', 4);
  check(await read('reinforcements-allied') === '25' && await turn.inputValue() === '2', 'Committed short campaign fits to a listed percentage and retains T2 fitting');
  check(await page.locator('#new-game-reinforcements-allied option[value="75"]').evaluate(option => option.disabled), 'An unplayable percentage is disabled');
  await h.shot('short-campaign-options');

  await select('reinforcements-allied', 0); await select('reinforcements-axis', 0);
  await configure(h, { width: 28, height: 20, divisions: 4, armored: 1, turnLimit: 6, engagement: 'ALLIED_ATTACKS' });
  await select('sea', 'FLANK'); await select('inland-entry-allied', 'NO');
  await fill('sea-cap-allied', 5); await fill('sea-cap-axis', 0);
  await fill('reinforcements-first-turn', 3);
  await select('reinforcements-allied', 25); await select('reinforcements-axis', 75);
  const summary = await page.locator('#reinforcement-summary').innerText();
  check(summary.includes('Allied: 2 divisions, Turn 3–4') && summary.includes('Axis: 3 divisions, Turn 3–5'), 'Settings show actual whole-division counts and schedules', summary);
  await h.shot('settings');
  const generated = await generate(h); h.timings.push({ label: 'Generate', elapsed: generated.elapsed });
  check(generated.state.page === 'preview', 'Preview generated', JSON.stringify(generated.state));
  const metrics = await page.locator('.operation-metrics').allInnerTexts();
  check(metrics.join(' ').includes('Allied 2 · Axis 3, from Turn 3'), 'Preview agrees with configured reinforcement counts', metrics.join(' | '));
  await h.shot('preview');
  const mounted = await start(h); h.timings.push({ label: 'Start', elapsed: mounted });
  h.note(`Mounted package ${await menuSummary(h)}`); await h.shot('started');
  await advance(s => s.phase === 'Movement' && s.player.startsWith('Allied'));

  await click(h, '#open-roster');
  const rows = await page.locator('[data-roster-pick]').evaluateAll(nodes => nodes.map(n => ({ id: n.dataset.rosterPick, text: n.innerText })));
  let moved = false;
  for (const row of rows.filter(r => /Move mode/.test(r.text))) {
    if (!await has(h, '.roster-popup')) await click(h, '#open-roster');
    await click(h, `[data-roster-pick="${row.id}"]`);
    if (await has(h, '.fuel-panel [data-unit-action]')) await click(h, '.fuel-panel [data-unit-action]');
    const destination = await page.evaluate(() => [...window.ocsMap.state.reachable.keys()][0]);
    if (!destination) continue;
    await gotoHex(h, printed(destination), { enter: true }); await click(h, '#confirm-move'); await settleDecisions(h);
    moved = true; h.note(`Moved ${row.text.replace(/\n/g, ' ')} to ${printed(destination)}`); break;
  }
  check(moved, 'A legal movement completed through the UI');
  await h.shot('legal-move');
  await advance(s => /Turn 3/.test(s.turn) && s.phase === 'Movement' && s.player.startsWith('Allied'));
  check(true, 'Completed full Game Turns 1 and 2 through handoffs and pending decisions', JSON.stringify(await where(h)));

  if (await has(h, '.roster-popup')) await click(h, '#close-roster');
  await page.keyboard.press('Escape');
  const candidates = await page.locator('[data-sea-unit]').evaluateAll(nodes => nodes.map(n => ({ id: n.dataset.seaUnit, disabled: n.disabled, text: n.closest('label').innerText })));
  const arrival = candidates.find(r => /:f\d+-/.test(r.id) && !r.disabled);
  check(!!arrival, 'A scheduled Allied division is available for shipping at T3', JSON.stringify(candidates));
  await page.locator(`[data-sea-unit="${arrival.id}"]`).check();
  const port = await page.locator('#sea-destination option:not([disabled])').first().getAttribute('value');
  await page.selectOption('#sea-destination', port); await h.shot('sea-ready'); await click(h, '#confirm-sea');
  await click(h, '#open-roster');
  check(await page.locator(`[data-roster-pick="${arrival.id}"]`).count() === 1, 'Shipped divisional unit is now in the serving roster', arrival.text);
  await h.shot('sea-arrived'); await click(h, '#close-roster');

  if (landEntered === null) await advance(() => landEntered !== null);
  check(h.errors.length === 0, 'No browser console or page errors', JSON.stringify(h.errors));
  await h.finish('Reinforcement percentage selectors and integrated entries');
} catch (error) {
  h.note(String(error)); await h.shot('failure'); await h.finish('Reinforcement percentage selectors: incomplete run'); throw error;
} finally { await h.close(); }
