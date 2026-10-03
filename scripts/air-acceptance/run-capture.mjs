// AIR-07: capture an Air Base with a ground unit (9.14f). The Allied Air Base at 0504 holds aircraft but no combat unit; the
// Axis Fallschirmjäger Battalion is planned in the first Aircraft Refit Phase and Air Dropped onto it in Turn 1. Landing on
// the base captures it: every aircraft there rolls on the Air Base Capture Table, and the Allied player displaces the
// survivors to a friendly base within twice their range (or loses them); they arrive Inactive.
import { join } from 'node:path';
import { advanceTo, click, gotoHex, newGame, open, record, selectUnit, settleLogged, tab, textOf, timed, where } from './harness.mjs';

const rulesSeed = Number(process.argv[3] ?? 5104);
const evidenceDir = join(process.argv[2] ?? 'docs/quality/evidence/air-2026-10-03', `air-07-rules-${rulesSeed}`);
const h = await open({ evidenceDir });
const seeds = { map: 5101, oob: 5102, deployment: 5103, rules: rulesSeed };
const at = (turn, side, phase) => (state) => state.turn.startsWith(`Turn ${turn} `) && state.player.startsWith(side) && state.phase === phase;
const facts = () => h.page.evaluate(() => Object.fromEntries([...document.querySelectorAll('.air-panel .combat-facts > div')].map((row) => [row.querySelector('dt')?.textContent.trim(), row.querySelector('dd')?.textContent.replace(/\s+/g, ' ').trim()])));

try {
  await newGame(h, { seeds, turnLimit: 4 });
  h.note(`New Game: Standard scale, air forces + transports + support, seeds ${JSON.stringify(seeds)}`);
  const before = await gotoHex(h, '0504');
  h.note(`0504 from the Allied seat before: ${before}`);

  // The Allied Engineer builds an Air Strip on Turn 1, so two Allied bases are in reach when 0504 falls and the owner must choose.
  await advanceTo(h, at(1, 'Allied', 'Movement'));
  await selectUnit(h, 'Engr Gp');
  await click(h, '[data-mode="COMBAT"]');
  await click(h, '#plan-construction');
  await h.page.locator('.hex-chips [data-target-hex]').first().click();
  await h.page.waitForTimeout(300);
  await click(h, '[data-build-facility="AIR_STRIP"]');
  h.note(`Allied Engineer: ${(await where(h)).notice}`);

  await advanceTo(h, at(1, 'Axis', 'Aircraft Refit Phase'));
  await click(h, '#start-drop-plan');
  await h.page.locator('.air-panel label.participant', { hasText: 'Fallschirmjäger' }).locator('[data-drop-unit]').check();
  await h.page.fill('#drop-hex', '0504'); await h.page.press('#drop-hex', 'Tab'); await h.page.waitForTimeout(300);
  await h.page.fill('#drop-turn', '1'); await h.page.press('#drop-turn', 'Tab'); await h.page.waitForTimeout(300);
  await click(h, '#confirm-drop-plan');
  const plan = await textOf(h, '.drop-plans');
  record(h, 'AIR-07', 'Axis: the Fallschirmjäger Battalion is planned to drop on the Allied Air Base at 0504 this turn (first Refit Phase of the game)', plan.slice(0, 200), /0504 on turn 1/.test(plan));
  const enemyView = await gotoHex(h, '0504');
  record(h, 'AIR-07', 'From the Axis seat 0504 is an Allied Air Base with aircraft and no combat unit', enemyView, /enemy Allied Air Base 2/.test(enemyView) && !/Battalion|Regiment|Division|Gp/.test(enemyView));

  await advanceTo(h, at(1, 'Axis', 'Movement'));
  await tab(h, 'Air');
  await click(h, '[data-air-mission="AIR_DROP"]');
  await h.page.locator('.hex-chips [data-target-hex]', { hasText: '0504' }).first().click();
  await h.page.waitForTimeout(400);
  const base = h.page.locator('[data-transport-base]', { hasText: '1407' });
  if ((await base.count()) > 0) { await base.first().click(); await h.page.waitForTimeout(300); }
  const unit = h.page.locator('.air-panel label.participant', { hasText: 'Fallschirmjäger' }).locator('[data-transport-unit]');
  if (!(await unit.isChecked())) await unit.click();
  // The Allied P-51 at 0504 is Active and fights the mission over its base: two Axis fighters fly along as escort.
  const escorts = h.page.locator('.air-panel label.participant', { hasText: /JG \d/ }).locator('[data-transport-escort]');
  for (let index = 0; index < Math.min(2, await escorts.count()); index += 1) if (!(await escorts.nth(index).isChecked())) { await escorts.nth(index).click(); await h.page.waitForTimeout(250); }
  await h.page.fill('#transport-tokens', '0'); await h.page.press('#transport-tokens', 'Tab'); await h.page.waitForTimeout(300);
  const preview = await facts();
  record(h, 'AIR-07', 'The drop onto the enemy base shows its Success Table number and Flak', JSON.stringify(preview), /Parachute/.test(preview.Landing ?? ''));
  await h.shot('drop-on-enemy-base-draft');
  const { elapsed } = await timed(h, 'Air Drop on 0504', () => click(h, '#declare-air-mission', { settle: 500 }));
  const steps = await settleLogged(h, (prompt, options) => {
    const decline = options.findIndex((text) => /Do not intercept/.test(text));
    if (decline >= 0) return decline;
    if (/Choose the aircraft that meets it/.test(prompt)) { const fighter = options.findIndex((text) => /JG \d/.test(text)); if (fighter >= 0) return fighter; }
    const original = options.findIndex((text) => /Original Air Base/.test(text));
    return original >= 0 ? original : 0;
  });
  const result = await textOf(h, '.deck-context');
  await h.shot('drop-on-enemy-base-result');
  h.note(`Air Drop result (${elapsed} ms): ${result}`);
  const landed = /Fallschirmjäger Battalion: \d+ .*lands/.test(result);
  record(h, 'AIR-07', 'The battalion lands on 0504 (or the table says it is lost)', result.slice(0, 500), /lands|is lost/.test(result));
  if (landed) {
    const displacement = steps.filter(({ prompt }) => /displace|captured|Capture/i.test(prompt));
    record(h, 'AIR-07', 'The Allied owner, after a handoff, chooses where each surviving aircraft displaces: a friendly base within twice its range, or loses it', displacement.map(({ seat, handedOver, prompt, options, chosen }) => `${seat}${handedOver ? ' [handoff]' : ''}: ${prompt} [${options.join(' | ')}] → ${chosen}`).join(' / ') || 'no displacement decision', displacement.length > 0 && displacement.every(({ seat }) => /Allied/.test(seat)));
    await tab(h, 'Log');
    const log = await textOf(h, '.command-rail');
    record(h, 'AIR-07', 'The capture rolls on the Air Base Capture Table are shown', (log.match(/[^.]*Capture Table[^.]*\./g) ?? []).slice(0, 6).join(' ') || log.slice(0, 400), /on the Air Base Capture Table/.test(log));
    const after = await gotoHex(h, '0504');
    record(h, 'AIR-07', 'The Air Base at 0504 now belongs to the Axis and the battalion holds it', after, /Fallschirmjäger/.test(after) && /Allied Air Base 2/.test(after) && !/enemy Allied Air Base 2/.test(after));
    await h.shot('captured-base');
    // The Allied seat, next Aircraft Refit Phase: the Refit panel lists each base's Inactive aircraft.
    await advanceTo(h, at(2, 'Allied', 'Aircraft Refit Phase'));
    await tab(h, 'Refit');
    const refit = await textOf(h, '.command-rail');
    const names = displacement.map(({ prompt }) => prompt.match(/captured: (.*?) must displace/)?.[1]).filter(Boolean);
    const chosen = displacement.map(({ chosen: label }) => label?.match(/at (\d{4})/)?.[1]);
    const sections = refit.split(/(?=Air (?:Base Level \d|Strip) \d{4})/);
    const placed = names.map((name, index) => ({ name, hex: chosen[index], listed: sections.some((section) => section.includes(chosen[index] ?? '----') && section.includes(name)) }));
    record(h, 'AIR-07', 'Each displaced aircraft is Inactive at the base chosen for it (listed for refit there on Turn 2)', placed.map(({ name, hex, listed }) => `${name} → ${hex}: ${listed ? 'Inactive there' : 'not listed'}`).join(' / ') || 'none', placed.length > 0 && placed.every(({ listed }) => listed));
    await h.shot('displaced-aircraft');
  } else h.note('The battalion did not land, so this run captured nothing; run another rules seed.');
  record(h, 'AIR-07', 'No browser console or page error during the run', `${h.errors.length} errors`, h.errors.length === 0);
} catch (error) {
  record(h, 'AIR-07', 'The scenario completes', String(error.stack ?? error.message), false);
  await h.shot('failure').catch(() => {});
}
h.note(`Final: ${JSON.stringify(await where(h).catch(() => ({})))}`);
await h.finish(`AIR-07 capture of an Air Base (rules seed ${rulesSeed})`);
await h.close();
process.exitCode = h.rows.some((row) => row.status !== 'PASS') ? 1 : 0;
