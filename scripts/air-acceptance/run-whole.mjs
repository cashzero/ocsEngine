// AIR-09: a whole game with air forces through the command deck — refits, Fighter Sweeps and Air Barrages every player
// turn — to Game End; a save downloaded mid-game and loaded back; the final save and replay downloaded; the final save
// loaded back (loading replays every action and refuses a mismatch); and the replay file re-run against its final hash.
import { readFile, stat } from 'node:fs/promises';
import { join } from 'node:path';
import { advanceTo, click, gotoHex, has, newGame, open, record, refitAll, settleDecisions, tab, textOf, timed, where } from './harness.mjs';

const evidenceDir = join(process.argv[2] ?? 'artifacts/air-2026-10-03', 'air-09');
const turnLimit = Number(process.argv[3] ?? 3);
const h = await open({ evidenceDir });
const seeds = { map: 5101, oob: 5102, deployment: 5103, rules: 5104 };
const done = new Set();
const once = (key) => { if (done.has(key)) return false; done.add(key); return true; };
const flights = [];

/** Fly the first offered target of a mission with every eligible aircraft that `aircraft` accepts (up to the panel's limit). */
const flyFirst = async (mission, aircraft) => {
  await tab(h, 'Air');
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
  const state = await where(h);
  await click(h, '#declare-air-mission', { settle: 500 });
  await settleDecisions(h);
  flights.push(`${state.turn.split(' /')[0]} ${state.player.split(' ')[0]} ${mission}`);
  return true;
};

/** What the page shows that a faithful load must restore: turn, player, phase, seat, the Log, and a few stacks. */
const fingerprint = async () => {
  const state = await where(h);
  await tab(h, 'Log').catch(() => {});
  // The Log entries themselves (the deck around them also holds this session's notices, which a load replaces).
  const log = await h.page.evaluate(() => [...document.querySelectorAll('.deck-event')].map((node) => node.innerText.replace(/s+/g, ' ').trim()));
  const stacks = [];
  for (const hex of ['0305', '0504', '1407', '1707']) stacks.push(await gotoHex(h, hex));
  return { turn: state.turn, player: state.player, phase: state.phase, seat: state.seat, log, stacks };
};
const download = async (selector, name) => {
  const [file] = await Promise.all([h.page.waitForEvent('download'), click(h, selector)]);
  const path = join(evidenceDir, name);
  await file.saveAs(path);
  return path;
};
const load = async (path) => {
  if (!(await has(h, '#load-game'))) await click(h, '#open-menu');
  const [chooser] = await Promise.all([h.page.waitForEvent('filechooser'), click(h, '#load-game')]);
  const { elapsed } = await timed(h, `load ${path}`, async () => { await chooser.setFiles(path); await h.page.waitForFunction(() => /Save loaded/.test(document.querySelector('.deck-notice')?.textContent ?? ''), null, { timeout: 30000 }); });
  return elapsed;
};

try {
  await newGame(h, { seeds, turnLimit });
  h.note(`New Game: Standard scale, air forces (aircraft reinforcements built in) + transports, ${turnLimit} turns, seeds ${JSON.stringify(seeds)}`);
  let saved = null;
  const ended = async () => has(h, '#download-final-save');
  await advanceTo(h, ended, {
    limit: 600,
    before: async (state) => {
      const side = state.player.split(' ')[0];
      const key = (name) => `${state.turn}|${side}|${name}`;
      if (state.phase === 'Aircraft Refit Phase' && once(key('refit'))) { await refitAll(h); return true; }
      if (state.phase === 'Movement' && once(key('sweep'))) { await flyFirst('FIGHTER_SWEEP', /\b(FG|JG)\b/); return true; }
      if (/Barrage/.test(state.phase) && once(key('barrage'))) { await flyFirst('BARRAGE', /\b(BG|KG|FG|JG)\b/); return true; }
      // The mid-game save: Turn 2, the first Movement Phase, after its sweep.
      if (saved === null && state.turn.startsWith('Turn 2 ') && state.phase === 'Movement' && done.has(key('sweep'))) {
        if (!done.has('turn-1-complete')) {
          done.add('turn-1-complete');
          record(h, 'AIR-09', 'A whole game turn with air forces is completed through the deck (refits, sweeps, barrages, handoffs)', `now ${state.turn}; flights so far: ${flights.join(', ')}`, flights.some((flight) => flight.startsWith('Turn 1')));
        }
        const before = await fingerprint();
        await click(h, '#open-menu');
        const path = await download('#save-game', 'mid-game-save.json');
        await click(h, '#close-utility');
        saved = { path, before };
        h.note(`Saved ${state.turn} ${state.player} ${state.phase} to ${path} (${(await stat(path)).size} bytes)`);
        await h.shot('mid-game-saved');
        // Change the state, then load the file back.
        await click(h, '#end-phase');
        await h.page.waitForTimeout(300);
        if (await has(h, '#end-phase')) await click(h, '#end-phase').catch(() => {});
        const changed = await where(h);
        const elapsed = await load(path);
        const after = await fingerprint();
        if (JSON.stringify(after.log) !== JSON.stringify(before.log)) h.note(`Log before: ${JSON.stringify(before.log.slice(0, 6))}
Log after: ${JSON.stringify(after.log.slice(0, 6))}`);
        record(h, 'AIR-09', 'Loading the mid-game save restores the saved turn, phase, seat, Log and stacks', `changed to "${changed.phase}" then loaded (${elapsed} ms): ${after.turn} ${after.player} ${after.phase} ${after.seat}; stacks equal ${JSON.stringify(after.stacks) === JSON.stringify(before.stacks)}; log equal ${JSON.stringify(after.log) === JSON.stringify(before.log)} (${after.log.length} entries)`,
          after.turn === before.turn && after.player === before.player && after.phase === before.phase && after.seat === before.seat && JSON.stringify(after.stacks) === JSON.stringify(before.stacks) && JSON.stringify(after.log) === JSON.stringify(before.log));
        await h.shot('mid-game-loaded');
        return true;
      }
      return false;
    },
  });
  const endText = await textOf(h, '.game-end-dialog');
  await h.shot('game-end');
  record(h, 'AIR-09', 'The game reaches Game End with no dead end', endText, /GAME END/i.test(endText) && /final revision \d+/.test(endText));
  h.note(`Flights flown: ${flights.join(', ')}`);
  const finalSave = await download('#download-final-save', 'final-save.json');
  const replay = await download('#download-replay', 'replay.json');
  const saveJson = JSON.parse(await readFile(finalSave, 'utf8'));
  const replayJson = JSON.parse(await readFile(replay, 'utf8'));
  record(h, 'AIR-09', 'The final save and the replay download as nonempty, parseable files', `final save ${(await stat(finalSave)).size} bytes, replay ${(await stat(replay)).size} bytes with ${replayJson.actions?.length} actions`, (replayJson.actions?.length ?? 0) > 0 && typeof saveJson === 'object');

  // The replay file, re-run by the built rule engine from its initial snapshot, must end on its recorded final hash.
  const engine = await import(new URL('../../dist/index.js', import.meta.url));
  const parsed = engine.parseGameStateJson(replayJson.initialSnapshot);
  const initial = parsed.ok ? parsed.value : parsed;
  const replayed = engine.replayRuleActions(initial, replayJson.actions);
  const hash = replayed.ok ? await engine.hashGameState(replayed.state) : null;
  const hashText = hash && typeof hash === 'object' && 'value' in hash ? hash.value : hash;
  record(h, 'AIR-09', 'Re-running the replay file reproduces its final state hash', `replayed ${replayed.ok ? 'ok' : 'FAILED'}; hash ${hashText} vs ${replayJson.finalStateHash}`, replayed.ok && hashText === replayJson.finalStateHash);

  // Load the final save through the menu: the engine replays every action and refuses any mismatch.
  await click(h, '#close-game-end');
  const elapsed = await load(finalSave);
  const reloaded = await textOf(h, '.game-end-dialog');
  await h.shot('final-save-loaded');
  record(h, 'AIR-09', 'Loading the final save shows the same Game End: winner, scores, reason and final revision', `${reloaded} (${elapsed} ms)`, reloaded === endText);
  record(h, 'AIR-09', 'No browser console or page error during the run', `${h.errors.length} errors`, h.errors.length === 0);
} catch (error) {
  record(h, 'AIR-09', 'The scenario completes', String(error.stack ?? error.message), false);
  await h.shot('failure').catch(() => {});
}
h.note(`Final: ${JSON.stringify(await where(h).catch(() => ({})))}`);
await h.finish(`AIR-09 whole air game, save/load and replay (${turnLimit} turns)`);
await h.close();
process.exitCode = h.rows.some((row) => row.status !== 'PASS') ? 1 : 0;
