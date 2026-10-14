// AIR-10: an Engineer-Capable unit builds an Air Strip, upgrades it, and raises the Air Base to Level 3 (13.8d, 15.2, 15.3).
import { join } from 'node:path';
import { advanceTo, click, endPhase, has, newGame, open, placeArrivals, record, selectUnit, tab, textOf, where } from './harness.mjs';

const evidenceDir = join(process.argv[2] ?? 'artifacts/air-2026-10-03', 'air-10');
const h = await open({ evidenceDir });
const seeds = { map: 5101, oob: 5102, deployment: 5103, rules: 5104 };
try {
  await newGame(h, { seeds, turnLimit: 8 });
  h.note(`New Game: Standard scale, 3 divisions (1 armored), air forces (aircraft reinforcements built in) + transports, seeds ${JSON.stringify(seeds)}`);
  await endPhase(h); await placeArrivals(h); await endPhase(h);
  const movement = await where(h);
  record(h, 'AIR-10', 'Construction is offered in the Movement Phase', `${movement.turn}, ${movement.player}, ${movement.phase}`, movement.phase === 'Movement');

  // Turn 1: set the Engineer to Combat Mode (13.8a) and build an Air Strip for 1T (15.2A).
  await selectUnit(h, 'Engr Gp');
  const before = await textOf(h, '.command-rail');
  record(h, 'AIR-10', 'A unit in Move Mode is not Engineer-Capable (13.8a): no Construction section', before.includes('Construction') ? 'Construction offered' : 'no Construction section', !before.includes('Construction'));
  await click(h, '[data-mode="COMBAT"]');
  await h.shot('engineer-combat-mode');
  await click(h, '#plan-construction');
  const hexes = await h.page.evaluate(() => [...document.querySelectorAll('.hex-chips [data-target-hex]')].map((node) => node.textContent.trim()));
  record(h, 'AIR-10', 'The hexes within 2 Leg MP are listed and highlighted', `${hexes.length} hexes: ${hexes.join(' ')}`, hexes.length > 0);
  await h.shot('construction-hexes');
  const site = hexes[0];
  await h.page.locator('.hex-chips [data-target-hex]').first().click();
  await h.page.waitForTimeout(300);
  const options = await h.page.evaluate(() => [...document.querySelectorAll('[data-build-facility]')].map((node) => node.textContent.replace(/\s+/g, ' ').trim()));
  record(h, 'AIR-10', 'Both ways to build in an empty hex are priced: Air Base Level 1 = 4T (1 SP), Air Strip = 1T', options.join(' | '), options.some((text) => text.includes('Level 1 Air Base') && text.includes('4T')) && options.some((text) => text.includes('Air Strip') && text.includes('1T')));
  await h.shot('build-options');
  const started = Date.now();
  await click(h, '[data-build-facility="AIR_STRIP"]');
  const elapsed = Date.now() - started;
  const built = await where(h);
  record(h, 'AIR-10', 'Building an Air Strip costs 1T, paid at once, in the same phase', `notice "${built.notice}" (${elapsed} ms)`, built.notice.includes('Air Strip') && built.notice.includes('1T'));
  await tab(h, 'Ledger');
  const ledger = await textOf(h, '.command-rail');
  record(h, 'AIR-10', 'The supply ledger shows the 1T paid', ledger.match(/Supply this turn[^.]*\./)?.[0] ?? ledger.slice(0, 160), /1T paid/.test(ledger));
  await tab(h, 'Unit');
  const after = await textOf(h, '.command-rail');
  record(h, 'AIR-10', 'The Engineer constructs in one hex per phase (13.8d): no second Construction offer', after.includes('Build an Air Base or Air Strip…') ? 'offered again' : 'not offered', !after.includes('Build an Air Base or Air Strip…'));
  await h.shot('air-strip-built');

  // Turn 2: upgrade the Air Strip to a Level-1 Air Base for 3T (15.2A).
  await advanceTo(h, (state) => state.turn.startsWith('Turn 2') && state.player.startsWith('Allied') && state.phase === 'Movement');
  await selectUnit(h, 'Engr Gp');
  const levels = [];
  for (const [turn, expected, cost] of [[2, 'Upgrade the Air Strip to a Level 1 Air Base', '3T'], [3, 'Improve the Air Base to Level 2', '4T'], [4, 'Improve the Air Base to Level 3', '4T']]) {
    if (turn > 2) {
      await advanceTo(h, (state) => state.turn.startsWith(`Turn ${turn}`) && state.player.startsWith('Allied') && state.phase === 'Movement');
      await selectUnit(h, 'Engr Gp');
    }
    await click(h, '#plan-construction');
    await h.page.locator(`.hex-chips [data-target-hex]`, { hasText: site }).first().click();
    await h.page.waitForTimeout(300);
    const choices = await h.page.evaluate(() => [...document.querySelectorAll('[data-build-facility]')].map((node) => node.textContent.replace(/\s+/g, ' ').trim()));
    const wanted = choices.find((text) => text.startsWith(expected));
    record(h, 'AIR-10', `Turn ${turn}: ${expected} for ${cost}, and nothing else at ${site}`, choices.join(' | '), wanted !== undefined && wanted.includes(cost) && choices.length === 1);
    await h.shot(`turn-${turn}-options`);
    await click(h, '[data-build-facility="AIR_BASE"]');
    await tab(h, 'Ledger');
    const paid = await textOf(h, '.command-rail');
    record(h, 'AIR-10', `Turn ${turn}: the ledger shows ${cost} paid`, paid.match(/\d+T paid/)?.[0] ?? '', paid.includes(`${cost} paid`));
    levels.push(expected);
    await h.shot(`turn-${turn}-built`);
  }

  // Turn 5: a Level-3 Air Base is never improved (15.3).
  await advanceTo(h, (state) => state.turn.startsWith('Turn 5') && state.player.startsWith('Allied') && state.phase === 'Movement');
  await selectUnit(h, 'Engr Gp');
  const open5 = await has(h, '#plan-construction');
  let sites = [];
  if (open5) {
    await click(h, '#plan-construction');
    sites = await h.page.evaluate(() => [...document.querySelectorAll('.hex-chips [data-target-hex]')].map((node) => node.textContent.trim()));
  }
  record(h, 'AIR-10', 'Turn 5: a Level-3 Air Base cannot be improved further (15.3)', `site ${site} ${sites.includes(site) ? 'still offered' : 'not offered'}`, !sites.includes(site));
  await h.shot('turn-5-no-more');
  record(h, 'AIR-10', 'No browser console or page error during the run', `${h.errors.length} errors`, h.errors.length === 0);
} catch (error) {
  record(h, 'AIR-10', 'The scenario completes', String(error.message), false);
  await h.shot('failure').catch(() => {});
}
await h.finish('AIR-10 Air Base construction');
await h.close();
process.exitCode = h.rows.some((row) => row.status !== 'PASS') ? 1 : 0;
