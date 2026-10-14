// REPL-01 and REPL-02 of docs/quality/03-product-operation-verification-plan.md (section I): Pax and Eq are built into every
// New Game (13.5). Drives only visible controls of the built application in Chromium, from the New Game form: a ground duel
// (Air forces None) whose form has no Air support option; Pax and Eq arrive in each Reinforcement Phase, are placed together,
// and a whole game turn is completed. The rebuild rows (REPL-03 to REPL-06) are run-positions.mjs.
// (A first version also tried to lose ground units to Air Barrages over 8 turns; with the generated air forces it never did,
// so the rebuilds are exercised on a test position instead, as in the breakdown gate.)
import { join } from 'node:path';
import { advanceTo, click, gotoHex, has, hexDistance, newGame, open, placeArrivals, record, selectUnit, textOf, where } from '../air-acceptance/harness.mjs';

const root = process.argv[2] ?? 'artifacts/replacements-2026-10-04';
const rulesSeed = Number(process.argv[3] ?? 6104);

/** Fly the first offered target of a mission with every aircraft `aircraft` accepts. */
const flyFirst = async (h, mission, aircraft) => {
  await tab(h, 'Air').catch(() => {});
  const button = h.page.locator(`[data-air-mission="${mission}"]:not([disabled])`);
  if ((await button.count()) === 0) return false;
  await button.first().click();
  await h.page.waitForTimeout(250);
  if ((await h.page.locator('.hex-chips [data-target-hex]').count()) === 0) { await click(h, '#cancel-air-mission'); return false; }
  await h.page.locator('.hex-chips [data-target-hex]').first().click();
  await h.page.waitForTimeout(400);
  const rows = h.page.locator('.air-panel .participant');
  for (let index = 0; index < (await rows.count()); index += 1) {
    const box = rows.nth(index).locator('[data-air-aircraft]');
    const want = aircraft.test((await rows.nth(index).innerText()).replace(/\s+/g, ' '));
    if ((await box.count()) > 0 && (await box.isChecked()) !== want) { await box.click(); await h.page.waitForTimeout(200); }
  }
  if (await h.page.locator('#declare-air-mission').isDisabled()) { await click(h, '#cancel-air-mission'); return false; }
  await click(h, '#declare-air-mission', { settle: 500 });
  await settleDecisions(h);
  return true;
};

/** The printed hex of the selected unit, read from the unit card ("0507 · ..."). */
const selectedHex = async (h) => (await textOf(h, '.command-rail')).match(/(\d{4}) · /)?.[1] ?? null;

/** Put the side's HQ in Combat Mode (13.5a) through its unit card, once, and remember where it stands. */
const hqToCombat = async (h, hq, side, turn) => {
  if (hq[side]) return false;
  await selectUnit(h, /HQ/);
  hq[side] = await selectedHex(h);
  const changed = await has(h, '[data-mode="COMBAT"]');
  if (changed) await click(h, '[data-mode="COMBAT"]');
  h.note(`Turn ${turn} ${side}: HQ at ${hq[side]} ${changed ? 'put in Combat Mode' : 'already in Combat Mode'} (13.5a)`);
  await click(h, '#deselect').catch(() => {});
  return true;
};

const nearHqOf = (hq, side) => (hexes) => hq[side] ? [...hexes].sort((a, b) => hexDistance(a.text, hq[side]) - hexDistance(b.text, hq[side]))[0] : hexes[0];

// ─── Part 1: ground duel ───────────────────────────────────────────────────────────────────────
{
  const h = await open({ evidenceDir: join(root, 'repl-01-02') });
  const seeds = { map: 6101, oob: 6102, deployment: 6103, rules: rulesSeed };
  const hq = {};
  try {
    await click(h, '#open-menu');
    await click(h, '#open-new-game');
    await h.page.waitForSelector('#new-game-air');
    const form = await textOf(h, '#new-game-form');
    record(h, 'REPL-01', 'The New Game form has no Air support option and says both sides receive Pax and Eq every turn',
      `air-support select present: ${await has(h, '#new-game-air-support')}; help: "${form.match(/Each side receives[^.]*\./)?.[0] ?? 'missing'}"`,
      !(await has(h, '#new-game-air-support')) && /Each side receives Pax and Eq replacements every turn/.test(form));
    await h.shot('new-game-form');
    await click(h, '#close-new-game');
    await newGame(h, { seeds, air: 'NONE', turnLimit: 4 });
    h.note(`New Game: Standard scale, Air forces None (ground duel), seeds ${JSON.stringify(seeds)}`);
    let arrived = 0;
    const goal = (state) => state.turn.startsWith('Turn 2 ');
    await advanceTo(h, goal, {
      limit: 300,
      before: async (state) => {
        const turn = Number(state.turn.match(/Turn (\d+)/)?.[1] ?? 0);
        const side = state.player.split(' ')[0];
        if (state.phase === 'Movement' && !hq[side]) return hqToCombat(h, hq, side, turn);
        if (state.phase === 'Reinforcement' && await has(h, '.arrivals .deck-unit[data-piece]')) {
          const text = await textOf(h, '.arrivals');
          const pax = /Personnel replacements/.test(text);
          const eq = /Equipment replacements/.test(text);
          if (arrived < 2) {
            record(h, 'REPL-02', `Turn ${turn} (${side}): Pax and Eq are listed among the arrivals in a game without air forces`, text.slice(0, 260), pax && eq);
            // The counters drawn in the list are the ones the map draws (the same counter art): one prints "Pax", the other "Eq".
            const printed = await h.page.evaluate(() => [...document.querySelectorAll('.arrivals .eq-label')].map((node) => node.textContent.trim()));
            record(h, 'REPL-02', `Turn ${turn} (${side}): the replacement counters print "Repl PAX" and "Repl EQ" with their quantity`, `printed: ${printed.join(', ')}`, printed.includes('PAX') && printed.includes('EQ'));
            await h.shot(`turn-${turn}-${side}-arrivals`);
          }
          // Every arrival goes to the same hex here, so the Pax and Eq end up stacked together.
          let placedAt = null;
          await placeArrivals(h, (hexes) => { const chosen = placedAt ? hexes.find(({ text }) => text.includes(placedAt)) ?? nearHqOf(hq, side)(hexes) : nearHqOf(hq, side)(hexes); placedAt ??= chosen.text.match(/\d{4}/)?.[0] ?? null; return chosen; });
          if (arrived < 2 && placedAt) {
            const announced = await gotoHex(h, placedAt);
            record(h, 'REPL-02', `Turn ${turn} (${side}): the Pax and Eq stand in ${placedAt} as separate counters`, announced, /Personnel replacements/.test(announced) && /Equipment replacements/.test(announced));
          }
          arrived += 1;
          return true;
        }
        return false;
      },
    });
    const state = await where(h);
    record(h, 'REPL-02', 'A whole game turn of the ground duel is completed with Pax and Eq arriving', `now ${state.turn} ${state.player} ${state.phase}; arrival phases with Repls: ${arrived}`, state.turn.startsWith('Turn 2 ') && arrived >= 2);
    record(h, 'REPL-02', 'No browser console or page error during the run', `${h.errors.length} errors`, h.errors.length === 0);
  } catch (error) {
    record(h, 'REPL-02', 'The scenario completes', String(error.stack ?? error.message), false);
    await h.shot('failure').catch(() => {});
  }
  await h.finish(`REPL-01 / REPL-02 ground duel with built-in Pax and Eq (rules seed ${rulesSeed})`);
  await h.close();
  process.exitCode = h.rows.some((row) => row.status !== 'PASS') ? 1 : 0;
}
