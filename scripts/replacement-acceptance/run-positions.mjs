// REPL-03 to REPL-06 on the test position of make-position.mjs (run it first): loaded through Menu → Load save…, then every
// step is a click on the page. The Allied side captures an Axis truck by moving into it (9.14, 13.5e) and attacks a one-step
// Axis Armor unit until it is eliminated; in the Axis Reinforcement Phase the new Pax and Eq are placed in the HQ hex, where a
// reduced Axis division stands, and the Rebuild tab rebuilds the Dead Pile unit and the division. On Turn 2 the next Eq
// rebuild captured truck points. The game turn is completed, saved and loaded back.
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { advanceTo, click, endPhase, has, hexDistance, newGame, open, placeArrivals, record, settleDecisions, tab, tabs, textOf, timed, where } from '../air-acceptance/harness.mjs';

const root = process.argv[2] ?? 'docs/quality/evidence/replacements-2026-10-04';
const positionDir = process.argv[3] ?? 'tmp/replacement-ui';
const evidenceDir = join(root, 'repl-03-06');
const facts = JSON.parse(await readFile(join(positionDir, 'position-facts.json'), 'utf8'));
const h = await open({ evidenceDir });
const done = new Set();
const once = (key) => { if (done.has(key)) return false; done.add(key); return true; };
const turnOf = (state) => Number(state.turn.match(/Turn (\d+)/)?.[1] ?? 0);
const logText = async () => { await tab(h, 'Log'); return textOf(h, '.command-rail'); };
const nearHq = (hexes) => [...hexes].sort((a, b) => hexDistance(a.text.match(/\d{4}/)?.[0] ?? '9999', facts.axisHq.hex) - hexDistance(b.text.match(/\d{4}/)?.[0] ?? '9999', facts.axisHq.hex))[0];
let unitsRebuilt = false;
let trucksRebuilt = false;

/**
 * The map's keyboard hex cursor, one arrow key at a time, re-reading where it is after each press (the harness's gotoHex
 * batches presses, which on a 32-column map can stop short). `enter` then acts on the hex like a click.
 */
const cursorTo = async (label, { enter = false } = {}) => {
  const announced = () => h.page.evaluate(() => document.querySelector('#hex-map + [aria-live]')?.textContent ?? '');
  await h.page.focus('#hex-map');
  for (let guard = 0; guard < 80; guard += 1) {
    const at = (await announced()).match(/\b(\d{4})\b/)?.[1] ?? null;
    if (at === label) break;
    if (!at) { await h.page.keyboard.press('ArrowRight'); continue; }
    const dr = Number(label.slice(2, 4)) - Number(at.slice(2, 4));
    const dc = Number(label.slice(0, 2)) - Number(at.slice(0, 2));
    await h.page.keyboard.press(dr !== 0 ? (dr > 0 ? 'ArrowDown' : 'ArrowUp') : (dc > 0 ? 'ArrowRight' : 'ArrowLeft'));
  }
  const text = await announced();
  if (!text.includes(label)) throw new Error(`The map cursor did not reach ${label}: "${text}"`);
  if (enter) { await h.page.keyboard.press('Enter'); await h.page.waitForTimeout(350); }
  return text;
};

/** Type a value into a rebuild field the way a player does (change event on commit). */
const setField = async (selector, value) => {
  const field = h.page.locator(selector).first();
  await field.fill(String(value));
  await field.press('Tab');
  await h.page.waitForTimeout(300);
};

try {
  h.note(`Position: ${JSON.stringify(facts)}`);
  // The very New Game the position was made from (the default settings, Air forces None, these seeds), so its map is the save's.
  await newGame(h, { air: 'NONE', width: 32, height: 24, scale: 'COMPACT', divisions: 6, armored: 2, turnLimit: 8, seeds: { map: 6101, oob: 6102, deployment: 6103, rules: 6104 } });
  await click(h, '#open-menu');
  const [chooser] = await Promise.all([h.page.waitForEvent('filechooser'), click(h, '#load-game')]);
  await chooser.setFiles(join(positionDir, 'position.json'));
  await h.page.waitForFunction(() => /Save loaded/.test(document.querySelector('.deck-notice')?.textContent ?? ''), null, { timeout: 30000 });
  await click(h, '#close-utility').catch(() => {});
  h.note(`Loaded the test position: ${JSON.stringify(await where(h))}`);
  await h.shot('position-loaded');

  // 9.14 / 13.5e: the Allied Leg unit moves into the lone Axis truck.
  // Select the Leg unit through All units, searching by its hex (it is alone there), then enter the truck's hex on the map.
  await click(h, '#open-roster');
  await h.page.fill('#roster-search', facts.capturer.hex);
  await h.page.waitForTimeout(300);
  await click(h, '[data-roster-pick]');
  if (await has(h, '#roster-search')) await click(h, '#open-roster');
  await cursorTo(facts.truck.hex, { enter: true });
  await click(h, '#confirm-move', { settle: 500 });
  await settleDecisions(h);
  const captureLog = await logText();
  record(h, 'REPL-06', `The Allied Leg unit at ${facts.capturer.hex} moves into the lone Axis truck at ${facts.truck.hex} and captures part of it`, captureLog.match(/[^.]*captur[^.]*\./i)?.[0] ?? captureLog.slice(0, 200), /captur/i.test(captureLog));
  await h.shot('truck-captured');

  await advanceTo(h, (state) => trucksRebuilt && turnOf(state) >= 3, {
    limit: 600,
    before: async (state) => {
      const turn = turnOf(state);
      const side = state.player.split(' ')[0];
      // The Allied attack on the Axis Armor unit, through the Targets tab.
      if (side === 'Allied' && turn === 1 && state.phase === 'Combat' && once('attack')) {
        await tab(h, 'Targets');
        await click(h, `[data-target-hex]:has-text("${facts.victim.hex}")`);
        const boxes = h.page.locator('[data-participant]');
        for (let index = 0; index < (await boxes.count()); index += 1) if (!(await boxes.nth(index).isChecked())) { await boxes.nth(index).check(); await h.page.waitForTimeout(200); }
        await h.shot('attack-plan');
        await click(h, '#declare-draft', { settle: 500 });
        await settleDecisions(h);
        const log = await logText();
        record(h, 'REPL-03', `The Allied attack on ${facts.victim.hex} eliminates the one-step Axis Armor unit`, log.match(/[^.]*eliminated[^.]*\./)?.[0] ?? log.slice(0, 240), /eliminated/.test(log));
        await h.shot('attack-result');
        return true;
      }
      if (side === 'Axis' && state.phase === 'Reinforcement' && once(`arrivals-${turn}`)) {
        const arrivals = await textOf(h, '.arrivals');
        record(h, 'REPL-02', `Turn ${turn} Axis: Pax and Eq arrive`, arrivals.slice(0, 200), /Personnel replacements/.test(arrivals) && /Equipment replacements/.test(arrivals));
        await placeArrivals(h, nearHq);
        h.note(`Turn ${turn} Axis: arrivals placed nearest the HQ at ${facts.axisHq.hex}`);
        const labels = await tabs(h);
        record(h, turn === 1 ? 'REPL-03' : 'REPL-06', `Turn ${turn} Axis: a Rebuild tab is offered once the Repls stand in the HQ hex`, labels.join(', '), labels.some((label) => label.startsWith('Rebuild')));
        await tab(h, 'Rebuild');
        const panel = await textOf(h, '.command-rail');
        await h.shot(`turn-${turn}-rebuild-panel`);
        if (turn === 1) {
          record(h, 'REPL-03', 'The Rebuild tab lists the Dead Pile Armor unit at 1 Eq a step, with its placement mode', panel.slice(0, 500),
            /Dead Pile · 1 step missing · 1 Eq a step/.test(panel) && /Place in/.test(panel));
          record(h, 'REPL-04', "The Rebuild tab lists the reduced Axis division in the Repls' hex at 1 Pax a step", panel.match(/[^·]{0,40}· reduced here · \d steps? missing · 1 Pax a step/)?.[0] ?? panel.slice(0, 300),
            /reduced here · \d steps? missing · 1 Pax a step/.test(panel));
          record(h, 'REPL-06', 'The captured truck points can be rebuilt with Eq (13.5e)', panel.match(/Truck points lost to the enemy[^)]*\)/)?.[0] ?? 'no truck field', /Truck points lost to the enemy to rebuild \(1 Eq each, up to \d\)/.test(panel));
          // Asking for more than the Eq pay for is refused with the reason, and the button stays disabled.
          await setField('[data-rebuild-trucks]', 1);
          const refused = await textOf(h, '.command-rail');
          const disabled = await h.page.locator('[data-rebuild-units]').first().isDisabled();
          record(h, 'REPL-03', 'Asking for one truck point as well (2 Eq in all) is refused: the Eq in the hex are not enough', `${refused.match(/This rebuild takes \d+ Eq[^.]*\./)?.[0] ?? 'no reason shown'}; button disabled: ${disabled}`, /This rebuild takes 2 Eq; the hex holds 1\./.test(refused) && disabled);
          await h.shot('turn-1-rebuild-refused');
          await setField('[data-rebuild-trucks]', 0);
          const mode = await h.page.locator('[data-rebuild-mode]').first().inputValue().catch(() => 'none');
          const { elapsed } = await timed(h, 'rebuild units', () => click(h, '[data-rebuild-units]:not([disabled])', { settle: 400 }));
          const after = await where(h);
          record(h, 'REPL-03', `Rebuilding spends 1 Pax and 1 Eq (${elapsed} ms, budget 1,500 ms)`, `placement mode ${mode}; notice "${after.notice}"`, /Rebuilt 2 units with 1 Pax and 1 Eq/.test(after.notice) && elapsed <= 1500);
          const log = await logText();
          record(h, 'REPL-03', 'The Armor unit returns from the Dead Pile in the HQ hex', log.match(/[^.]*returned from the Dead Pile[^.]*\./)?.[0] ?? log.slice(0, 200), /returned from the Dead Pile with 1 step at/.test(log));
          record(h, 'REPL-04', 'The reduced division regains a step in place', log.match(/[^.]*regained[^.]*\./)?.[0] ?? log.slice(0, 200), /regained with 1 step at/.test(log));
          const stack = await cursorTo(facts.axisHq.hex);
          h.note(`Hex ${facts.axisHq.hex} now: ${stack}`);
          await h.shot('turn-1-rebuilt');
          unitsRebuilt = true;
        } else if (!trucksRebuilt) {
          const field = await has(h, '[data-rebuild-trucks]');
          if (field) {
            await setField('[data-rebuild-trucks]', 1);
            // Leave the other units out: only the truck is rebuilt with this turn's Eq.
            const boxes = h.page.locator('[data-rebuild-unit]');
            for (let index = 0; index < (await boxes.count()); index += 1) {
              const row = (await boxes.nth(index).locator('xpath=ancestor::div[contains(@class,"rebuild-unit")]').innerText()).replace(/\s+/g, ' ');
              if (/1 Eq a step/.test(row) && (await boxes.nth(index).isChecked())) { await boxes.nth(index).uncheck(); await h.page.waitForTimeout(250); }
            }
            const before = await textOf(h, '.command-rail');
            await click(h, '[data-rebuild-units]:not([disabled])', { settle: 400 });
            const after = await where(h);
            record(h, 'REPL-06', `Turn ${turn} Axis: one captured truck point is rebuilt for 1 Eq as a truck in the Eq hex`, `${before.match(/Truck points lost[^)]*\)/)?.[0]}; notice "${after.notice}"`, /1 truck point/.test(after.notice) && /1 Eq/.test(after.notice));
            const log = await logText();
            record(h, 'REPL-06', 'The Log reports the rebuilt truck point', log.match(/[^.]*truck point[^.]*rebuilt[^.]*\./)?.[0] ?? log.slice(0, 200), /1 truck point rebuilt at/.test(log));
            await h.shot(`turn-${turn}-truck-rebuilt`);
            trucksRebuilt = true;
          } else record(h, 'REPL-06', `Turn ${turn} Axis: the truck field is offered`, panel.slice(0, 300), false);
        }
        return true;
      }
      return false;
    },
  });
  const state = await where(h);
  record(h, 'REPL-05', 'Game Turns 1 and 2 are completed through the deck with the rebuilds, including hot-seat handoffs', `now ${state.turn} ${state.player} ${state.phase}`, unitsRebuilt && trucksRebuilt && turnOf(state) >= 3);
  // Save, change nothing, load: the save is replayed from its actions, rebuilds included.
  await click(h, '#open-menu');
  const [file] = await Promise.all([h.page.waitForEvent('download'), click(h, '#save-game')]);
  const path = join(evidenceDir, 'after-rebuilds-save.json');
  await file.saveAs(path);
  await click(h, '#close-utility');
  const before = await cursorTo(facts.axisHq.hex);
  await endPhase(h).catch(() => {});
  await click(h, '#open-menu');
  const [loader] = await Promise.all([h.page.waitForEvent('filechooser'), click(h, '#load-game')]);
  const { elapsed } = await timed(h, 'load save', async () => { await loader.setFiles(path); await h.page.waitForFunction(() => /Save loaded/.test(document.querySelector('.deck-notice')?.textContent ?? ''), null, { timeout: 30000 }); });
  await click(h, '#close-utility').catch(() => {});
  const loaded = await where(h);
  const afterHex = await cursorTo(facts.axisHq.hex);
  record(h, 'REPL-05', `Saving after the rebuilds and loading the file restores the same turn, phase and HQ hex (${elapsed} ms)`, `${state.turn} ${state.phase} → ${loaded.turn} ${loaded.phase}; hex ${facts.axisHq.hex}: "${before}" → "${afterHex}"`, loaded.turn === state.turn && loaded.phase === state.phase && before === afterHex);
  await h.shot('loaded-back');
} catch (error) {
  record(h, 'REPL-05', 'The scenario completes', String(error.stack ?? error.message), false);
  await h.shot('failure').catch(() => {});
}
record(h, 'REPL-05', 'No browser console or page error during the run', `${h.errors.length} errors`, h.errors.length === 0);
await h.finish('REPL-03 to REPL-06 on the replacement test position (Menu → Load save, then UI only)');
await h.close();
process.exitCode = h.rows.some((row) => row.status !== 'PASS') ? 1 : 0;
