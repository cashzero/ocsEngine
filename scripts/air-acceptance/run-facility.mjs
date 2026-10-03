// AIR-06 (second half): an Air Base barraged on the Facility Table loses Levels but never drops below Level 1 (15.0c).
// Every Axis Barrage Segment, all Active Axis bombers with one fighter strike the Allied Air Base at 0504; the preview's Flak
// modifier names the base's current Level before each strike, and the result names the Facility Table outcome.
import { join } from 'node:path';
import { advanceTo, click, has, newGame, open, record, refitAll, settleLogged, tab, textOf, timed } from './harness.mjs';

const rulesSeed = Number(process.argv[3] ?? 5104);
const target = process.argv[4] ?? '0504';
const evidenceDir = join(process.argv[2] ?? 'docs/quality/evidence/air-2026-10-03', `air-06-facility-rules-${rulesSeed}`);
const h = await open({ evidenceDir });
const seeds = { map: 5101, oob: 5102, deployment: 5103, rules: rulesSeed };
const turnLimit = 8;
const done = new Set();
const once = (key) => { if (done.has(key)) return false; done.add(key); return true; };
const strikes = [];
const levelOf = (text) => Number(text.match(/Air Base Level (\d) \+/)?.[1] ?? NaN);

try {
  await newGame(h, { seeds, turnLimit });
  h.note(`New Game: Standard scale, air forces + transports + support, ${turnLimit} turns, seeds ${JSON.stringify(seeds)}; target ${target}`);
  // A Level-reducing result reads "die N, L..." with L the Levels lost; the floor shows when the preview after such a hit on Level 1 still says Level 1.
  const reduces = (outcome) => Number(outcome?.match(/die \d, (\d)/)?.[1] ?? 0) > 0;
  const finished = () => strikes.some(({ before, outcome }, index) => before === 1 && reduces(outcome) && strikes[index + 1]?.before === 1);
  await advanceTo(h, async (state) => finished() || /Game over/.test(state.phase) || (await has(h, '#download-final-save')), {
    limit: 900,
    before: async (state) => {
      const side = state.player.split(' ')[0];
      const key = (name) => `${state.turn}|${side}|${name}`;
      if (state.phase === 'Aircraft Refit Phase' && once(key('refit'))) { await refitAll(h); return true; }
      if (side !== 'Axis' || !/Barrage/.test(state.phase) || !once(key('strike'))) return false;
      await tab(h, 'Air');
      if (!(await has(h, '[data-air-mission="BARRAGE"]:not([disabled])'))) { h.note(`${state.turn}: no Axis aircraft can barrage`); return true; }
      await click(h, '[data-air-mission="BARRAGE"]');
      const chip = h.page.locator('.hex-chips [data-target-hex]', { hasText: target });
      if ((await chip.count()) === 0) { h.note(`${state.turn}: ${target} is not offered`); await click(h, '#cancel-air-mission'); return true; }
      await chip.first().click();
      await h.page.waitForTimeout(400);
      if (await has(h, '[data-air-target="AIR_BASE"]')) await click(h, '[data-air-target="AIR_BASE"]');
      let fighters = 0;
      const rows = h.page.locator('.air-panel .participant');
      for (let index = 0; index < (await rows.count()); index += 1) {
        const label = (await rows.nth(index).innerText()).replace(/\s+/g, ' ');
        const want = /\bKG \d/.test(label) || (/\bJG \d/.test(label) && fighters++ < 1);
        const box = rows.nth(index).locator('[data-air-aircraft]');
        if ((await box.count()) > 0 && (await box.isChecked()) !== want) { await box.click(); await h.page.waitForTimeout(200); }
      }
      const preview = await textOf(h, '.air-panel');
      if (await h.page.locator('#declare-air-mission').isDisabled()) { h.note(`${state.turn}: no bomber ready`); await click(h, '#cancel-air-mission'); return true; }
      const before = levelOf(preview);
      await h.shot(`${state.turn.split(' /')[0].replace(' ', '-')}-facility-draft`);
      const { elapsed } = await timed(h, `${state.turn} Facility barrage`, () => click(h, '#declare-air-mission', { settle: 500 }));
      await settleLogged(h, (prompt, options) => Math.max(0, options.findIndex((text) => /Do not intercept|Original Air Base/.test(text))));
      const result = await textOf(h, '.deck-context');
      const outcome = result.match(/Barrage vs Facility[^.]*\./)?.[0] ?? null;
      strikes.push({ turn: state.turn, before, outcome, elapsed });
      h.note(`${state.turn}: Level ${before} before; ${outcome ?? 'no Facility roll (the bombers did not get through)'} (${elapsed} ms)`);
      await h.shot(`${state.turn.split(' /')[0].replace(' ', '-')}-facility-result`);
      return true;
    },
  });
  // The Level the next preview shows after each strike is the Level the strike left.
  const levels = strikes.map(({ before }) => before).filter(Number.isFinite);
  record(h, 'AIR-06', `The Level of the Air Base at ${target} as each strike's preview showed it`, strikes.map(({ turn, before, outcome }) => `${turn.split(' /')[0]}: L${before} → ${outcome ?? 'no roll'}`).join(' / '), levels.length > 0);
  record(h, 'AIR-06', 'Every Level shown is 1 or more; a Level-reducing result on a Level-1 base leaves it at Level 1', `levels seen ${levels.join(', ')}; ${finished() ? 'a reducing result hit the base at Level 1' : 'no reducing result hit it at Level 1 in this run'}`, levels.every((level) => level >= 1) && finished());
  record(h, 'AIR-06', 'No browser console or page error during the run', `${h.errors.length} errors`, h.errors.length === 0);
} catch (error) {
  record(h, 'AIR-06', 'The scenario completes', String(error.stack ?? error.message), false);
  await h.shot('failure').catch(() => {});
}
await h.finish(`AIR-06 Facility Table floor at Level 1 (rules seed ${rulesSeed}, target ${target})`);
await h.close();
process.exitCode = h.rows.some((row) => row.status !== 'PASS') ? 1 : 0;
