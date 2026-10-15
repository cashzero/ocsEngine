// doc 03 §BOT: computer players, operated through the built application in a real browser (Playwright Chromium).
// Every step is a click, a typed value or a selection on a visible control; every observation is read from the page.
// Usage: npm run build && node scripts/product-acceptance/run-computer.mjs [evidenceDir]
// Parts: A person against the computer (BOT-01 to BOT-04, BOT-06 to BOT-08), B computer against computer (BOT-05).
import { readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { click, gotoHex, has, hexDistance, open, placeArrivals, record, textOf, where } from '../air-acceptance/harness.mjs';
import { configure, generate, openNewGame, start } from './lib.mjs';

const evidenceDir = process.argv[2] ?? 'artifacts/product-computer';
const h = await open({ evidenceDir });
const { page } = h;
const SMALL = { style: 'TEMPERATE_INLAND', width: 16, height: 12, scale: 'COMPACT', divisions: 2, armored: 1, turnLimit: 6 };
const extra = {};

/** New Game through the dialog: the settings typed, the seats chosen, previewed, and the previewed package started. */
const startGame = async ({ allied = 'PLAYER', axis = 'PLAYER', seeds, ...options }) => {
  await openNewGame(h);
  await configure(h, { ...SMALL, ...options, seeds });
  await page.selectOption('#new-game-seat-allied', allied);
  await page.selectOption('#new-game-seat-axis', axis);
  const built = await generate(h);
  const players = await textOf(h, '#preview-players');
  await h.shot(`preview-${allied.toLowerCase()}-vs-${axis.toLowerCase()}`);
  const elapsed = await start(h);
  await page.waitForTimeout(500);
  return { built, players, elapsed };
};

const panel = () => page.evaluate(() => {
  const node = document.querySelector('#computer-panel');
  return {
    present: !!node,
    stuck: !!document.querySelector('#computer-stuck'),
    stuckRevision: Number(document.querySelector('#computer-stuck')?.dataset.revision ?? -1),
    stuckText: document.querySelector('#computer-stuck')?.innerText.replace(/\s+/g, ' ').trim() ?? '',
    status: document.querySelector('#computer-status')?.textContent.trim() ?? '',
    last: document.querySelector('#computer-last')?.textContent.replace(/\s+/g, ' ').trim() ?? '',
    playing: node?.dataset.playing === 'true',
    speed: node?.dataset.speed ?? '',
    played: Number(node?.dataset.played ?? -1),
    revision: Number(node?.dataset.revision ?? -1),
  };
});
const screenState = () => page.evaluate(() => ({
  handoff: !!document.querySelector('#begin-required-handoff') || !!document.querySelector('#complete-handoff'),
  privacy: !!document.querySelector('.privacy-screen'),
  seat: document.querySelector('.topbar')?.dataset.activeSeat ?? '',
  gameEnd: !!document.querySelector('#game-end-title'),
}));
const waitFor = (predicate, label, timeout = 120000) => page.waitForFunction(predicate, null, { timeout }).catch((error) => { throw new Error(`Timed out waiting for ${label}: ${error.message}`); });
const computerIsPlaying = () => page.evaluate(() => /is playing/.test(document.querySelector('#computer-status')?.textContent ?? ''));
const yourTurn = () => page.evaluate(() => /Your turn/.test(document.querySelector('#computer-status')?.textContent ?? ''));

/** Own roster rows by accessible name, and picking one. */
const rosterRows = async () => {
  await click(h, '#open-roster');
  const names = await page.evaluate(() => [...document.querySelectorAll('[data-roster-pick]')].map((node) => node.getAttribute('aria-label') ?? ''));
  await page.keyboard.press('Escape');
  await page.waitForTimeout(150);
  return names;
};
const pickRow = async (index) => {
  await click(h, '#open-roster');
  await page.locator('[data-roster-pick]').nth(index).click();
  await page.waitForTimeout(300);
};
const enemyHexes = () => page.evaluate(() => [...new Set(window.ocsMap.state.counters.filter(({ label }) => label.startsWith('Enemy')).map(({ hexId }) => {
  const [q, r] = hexId.split(',').map(Number);
  return `${String(q + Math.floor(r / 2) + 1).padStart(2, '0')}${String(r + 1).padStart(2, '0')}`;
}))]);

/**
 * Play the person's side the dull way (place arrivals, first option of any decision, end the step) until `until(state)`
 * holds. When a computer is to act the person waits: nothing is clicked for it.
 */
const playOn = async (until, { limit = 600, before = async () => false } = {}) => {
  for (let guard = 0; guard < limit; guard += 1) {
    const state = await where(h);
    const computer = await panel();
    if (state.handoff || state.complete) throw new Error(`A hand-over screen appeared (${JSON.stringify(state)}).`);
    if (computer.stuck) throw new Error(`The computer is stuck: ${computer.stuckText}`);
    if (await has(h, '#game-end-title')) return { state, computer };
    if (await until(state, computer)) return { state, computer };
    if (computer.present && /is playing/.test(computer.status)) { await page.waitForTimeout(150); continue; }
    if (await before(state, computer)) continue;
    if (await has(h, '#dismiss-away')) { await click(h, '#dismiss-away'); continue; }
    if (await has(h, '#dismiss-result')) { await click(h, '#dismiss-result'); continue; }
    if (state.decision.length > 0) { await page.locator('[data-choice]').first().click(); await page.waitForTimeout(250); continue; }
    if (await has(h, '.arrivals .deck-unit[data-piece]')) { await placeArrivals(h); continue; }
    if (state.endDisabled) {
      if (await has(h, '#auto-pay')) { await click(h, '#auto-pay'); continue; }
      await page.waitForTimeout(200);
      continue;
    }
    await click(h, '#end-phase', { settle: 250 });
    if (await has(h, '#end-phase') && (await where(h)).phase === state.phase) await click(h, '#end-phase', { settle: 250 }).catch(() => {});
  }
  throw new Error('playOn did not reach its goal.');
};

const saveGame = async (name) => {
  await click(h, '#open-menu');
  const [download] = await Promise.all([page.waitForEvent('download'), page.click('#save-game')]);
  const path = join(evidenceDir, name);
  await download.saveAs(path);
  await click(h, '#close-utility');
  return path;
};
const loadGame = async (path) => {
  await click(h, '#open-menu');
  await page.setInputFiles('#save-file', path);
  await page.waitForTimeout(800);
};

try {
  // ------------------------------------------------------------------ A: a person against the computer
  const a = await startGame({ allied: 'PLAYER', axis: 'COMPUTER', seeds: { map: 94001, oob: 94002, deployment: 94003, rules: 94004 } });
  const started = await screenState();
  const first = await panel();
  await h.shot('person-vs-computer-start');
  record(h, 'BOT-01', 'New Game offers a computer for one side; the preview names who plays; Start opens the game with no hand-over screen',
    `preview "${a.players}"; started in ${a.elapsed} ms; seat "${started.seat}"; hand-over ${started.handoff}; computer panel ${first.present} ("${first.status}")`,
    a.players === 'Allied: you · Axis: computer' && !started.handoff && started.seat === 'Allied commander' && first.present && first.status === 'Your turn');

  // BOT-02: the person attacks; the computer answers the defender's decisions at once, with no hand-over.
  let attacker = null;
  const targets = await enemyHexes();
  const rows = await rosterRows();
  for (const [index, name] of rows.entries()) {
    if (!/,/.test(name) || /HQ|Truck|Supply|Arty|Art\b/u.test(name)) continue;
    await pickRow(index);
    if (await has(h, '[data-fuel-method="SINGLE_UNIT"]')) {
      await click(h, '[data-fuel-method="SINGLE_UNIT"]');
      const option = page.locator('.fuel-panel [data-unit-action]').first();
      if (await option.count()) { await option.click(); await page.waitForTimeout(400); }
    }
    const reach = await page.evaluate(() => [...window.ocsMap.state.reachable.keys()].map((id) => {
      const [q, r] = id.split(',').map(Number);
      return `${String(q + Math.floor(r / 2) + 1).padStart(2, '0')}${String(r + 1).padStart(2, '0')}`;
    }));
    const destination = reach.find((hex) => targets.some((target) => hexDistance(hex, target) === 1));
    if (!destination) continue;
    await gotoHex(h, destination, { enter: true });
    if (!(await has(h, '#confirm-move'))) continue;
    await click(h, '#confirm-move', { settle: 500 });
    attacker = { name, destination, target: targets.find((target) => hexDistance(destination, target) === 1) };
    break;
  }
  h.note(`attacker: ${JSON.stringify(attacker)}`);
  if (attacker) {
    await playOn((state) => state.phase === 'Combat', { before: async () => false });
    await gotoHex(h, attacker.destination, { enter: true });
    await gotoHex(h, attacker.target, { enter: true });
    await h.shot('person-attack-sheet');
    if (await has(h, '#declare-draft')) {
      await click(h, '#declare-draft', { settle: 200 });
      // The computer is the defender: sample what the person's screen says while its answers come in.
      const seen = new Set();
      for (let guard = 0; guard < 80; guard += 1) {
        const now = await panel();
        const state = await where(h);
        if (now.last) seen.add(now.last);
        if (state.complete || state.handoff) throw new Error('A hand-over was asked for while the computer defended.');
        if (state.decision.length > 0) { await page.locator('[data-choice]').first().click(); await page.waitForTimeout(250); continue; }
        if (await has(h, '#auto-pay')) { await click(h, '#auto-pay'); continue; }
        if (await has(h, '.result-card')) break;
        await page.waitForTimeout(150);
      }
      const resultCard = await textOf(h, '.result-card');
      await h.shot('person-attack-result');
      record(h, 'BOT-02', 'The person attacks; the computer answers the defender decisions by itself, the result shows on the person\'s screen, and no hand-over appears',
        `result card: "${resultCard.slice(0, 160)}"; computer actions seen: ${[...seen].slice(0, 4).join(' | ')}`,
        resultCard.length > 0 && !(await screenState()).handoff);
    } else {
      record(h, 'BOT-02', 'The person attacks the computer', 'no attack could be declared from the reached hex', false);
    }
  } else {
    record(h, 'BOT-02', 'The person attacks the computer', 'no unit could reach a hex next to the enemy in the first Movement Phase', false);
  }

  // BOT-03: the computer's Player Turn runs by itself, can be paused, stepped and sped up.
  await playOn((state, computer) => /is playing/.test(computer.status), { limit: 200 });
  const begun = await panel();
  await h.shot('computer-turn-playing');
  await page.waitForTimeout(700);
  const whileFast = await panel();
  await click(h, '#pause-computer');
  const paused = await panel();
  await page.waitForTimeout(1500);
  const stillPaused = await panel();
  await click(h, '#step-computer');
  await page.waitForTimeout(700);
  const stepped = await panel();
  await h.shot('computer-paused-stepped');
  record(h, 'BOT-03', 'The computer turn plays by itself with each action shown; Pause stops it, Step plays exactly one action, Play resumes',
    `playing "${begun.status}"; played ${begun.played}→${whileFast.played} in 0.7 s; paused "${paused.status}" held ${paused.played}=${stillPaused.played} for 1.5 s; one Step → played ${stepped.played}; last "${stepped.last}"`,
    /is playing/.test(begun.status) && whileFast.played > begun.played && /Paused/.test(paused.status) && stillPaused.played === paused.played && stepped.played === paused.played + 1 && stepped.last.length > 0);
  await page.selectOption('#computer-speed', 'INSTANT');
  await click(h, '#play-computer');
  await waitFor(() => /Your turn/.test(document.querySelector('#computer-status')?.textContent ?? ''), 'the computer turn to end at Instant speed', 180000);
  const afterInstant = await panel();
  await h.shot('computer-turn-done');
  h.note(`computer turn at Instant: ${afterInstant.played} computer actions in all, status "${afterInstant.status}"`);

  // BOT-04: the person plays on to Game Turn 2 (a whole Game Turn: both Player Turns) with the computer answering in between.
  const turn2 = await playOn((state) => state.turn.startsWith('Turn 2') && state.player.startsWith('Allied'), { limit: 800 });
  const log = await page.evaluate(() => document.body.innerText.length);
  record(h, 'BOT-04', 'A whole Game Turn is played with a person and a computer: legal actions, decisions, the computer\'s turn, no hand-over, no stall',
    `reached ${turn2.state.turn}, ${turn2.state.player}, ${turn2.state.phase}; computer actions so far ${turn2.computer.played}; errors ${h.errors.length}`,
    turn2.state.turn.startsWith('Turn 2') && h.errors.length === 0 && !turn2.computer.stuck);
  void log;

  // BOT-06: save while the computer plays, reload the page, load the save: the computer goes on from there.
  // Stop the computer while it has the move (its turn can end between seeing it play and the Pause click): pause, and if the
  // person was to act after all, let it play on and try again.
  for (let attempt = 0; attempt < 12; attempt += 1) {
    await playOn((state, computer) => /is playing/.test(computer.status), { limit: 400 });
    await click(h, '#pause-computer', { settle: 0 });
    if (/acts next/.test((await panel()).status)) break;
    await click(h, '#play-computer');
  }
  const toSave = await panel();
  if (!/acts next/.test(toSave.status)) throw new Error(`Could not stop the computer while it had the move: ${toSave.status}`);
  const savePath = await saveGame('computer-midturn-save.json');
  await h.shot('before-reload');
  // A save loads into a game of the same scenario (a page opened anew has the default one), so the same operation is
  // opened again from its seeds, as two persons; the save then names who plays each seat.
  await startGame({ allied: 'PLAYER', axis: 'PLAYER', seeds: { map: 94001, oob: 94002, deployment: 94003, rules: 94004 } });
  const fresh = await panel();
  await loadGame(savePath);
  const loaded = await panel();
  await h.shot('after-load');
  // Nobody presses Play: a loaded game's computers go on by themselves.
  await page.waitForTimeout(2500);
  const resumed = await panel();
  record(h, 'BOT-06', 'A save made during the computer\'s turn, loaded into the same operation opened anew, has the computer go on from the same position',
    `saved at revision ${toSave.revision} (paused); same operation reopened with two persons: computer panel ${fresh.present}; after load: panel ${loaded.present} at revision ${loaded.revision}; 2.5 s later, with nobody pressing Play: revision ${resumed.revision}, played ${resumed.played}, last "${resumed.last}"`,
    !fresh.present && loaded.present && loaded.revision >= toSave.revision && resumed.revision > toSave.revision && resumed.played > 0);

  // BOT-07: back to a checkpoint before the computer acted; it acts the same way from the same position.
  // At the start of the computer's own Movement Phase, where it has many actions ahead.
  for (let attempt = 0; attempt < 20; attempt += 1) {
    await playOn((state, computer) => /is playing/.test(computer.status) && state.player.startsWith('Axis') && state.phase === 'Movement', { limit: 800 });
    await click(h, '#pause-computer', { settle: 0 });
    const now = await where(h);
    if (/acts next/.test((await panel()).status) && now.player.startsWith('Axis') && now.phase === 'Movement') break;
    await click(h, '#play-computer');
  }
  await page.waitForTimeout(300);
  await click(h, '#open-menu');
  await click(h, '#create-checkpoint');
  await click(h, '#close-utility');
  const mark = await panel();
  const sequence = async (count) => {
    const texts = [];
    for (let i = 0; i < count; i += 1) {
      const before = (await panel()).played;
      await click(h, '#step-computer', { settle: 100 });
      await page.waitForFunction((n) => Number(document.querySelector('#computer-panel')?.dataset.played) > n, before, { timeout: 15000 }).catch(() => {});
      texts.push((await panel()).last);
    }
    return texts;
  };
  const firstRun = await sequence(5);
  await click(h, '#open-menu');
  const restoreLabel = await page.locator('.checkpoint', { hasText: `R${mark.revision}` }).first().innerText();
  await page.locator('.checkpoint', { hasText: `R${mark.revision}` }).first().click();
  await page.waitForTimeout(600);
  const restored = await panel();
  await h.shot('after-restore');
  const secondRun = await sequence(5);
  record(h, 'BOT-07', 'Restoring a checkpoint taken before the computer acted puts the game back; the computer then plays the same five actions',
    `checkpoint "${restoreLabel.replace(/\s+/g, ' ')}" at revision ${mark.revision}; after restore revision ${restored.revision}; first run ${JSON.stringify(firstRun)}; second run ${JSON.stringify(secondRun)}`,
    restored.revision === mark.revision && JSON.stringify(firstRun) === JSON.stringify(secondRun) && firstRun.every((text) => text.length > 0));
  extra['BOT-07'] = { firstRun, secondRun };

  // BOT-08: a computer that cannot go on (a test policy named in the save) stops visibly; the person takes the seat over and plays on.
  const saved = JSON.parse(await readFile(savePath, 'utf8'));
  const stallAt = toSave.revision;
  for (const binding of saved.bindings) if (binding.controller?.kind === 'BOT') binding.controller.policyId = `test-stall:${stallAt}`;
  const stallPath = join(evidenceDir, 'computer-stall-save.json');
  await writeFile(stallPath, JSON.stringify(saved));
  await loadGame(stallPath);
  await waitFor(() => !!document.querySelector('#computer-stuck'), 'the stuck banner', 60000);
  const stuck = await panel();
  await h.shot('computer-stuck');
  await page.waitForTimeout(1500);
  const stuckLater = await panel();
  await click(h, '#take-over-seat');
  await page.waitForTimeout(500);
  const taken = await panel();
  const takenState = await screenState();
  await h.shot('computer-taken-over');
  const manual = await where(h);
  const stalledDecision = manual.decision;
  // The seat is the person's now: whatever the computer left pending (a decision or the step) is theirs to do.
  const recoverStocks = async () => {
    const action = page.locator('.command-rail button', { hasText: /recover internal stocks/i }).first();
    if ((await action.count()) === 0) return false;
    await action.click();
    await page.waitForTimeout(300);
    return true;
  };
  await playOn((state) => state.phase !== manual.phase && state.decision.length === 0, { limit: 60, before: recoverStocks });
  const manualLater = await where(h);
  const afterPlay = await panel();
  record(h, 'BOT-08', 'A stuck computer shows what went wrong and does nothing more; "Play it myself" hands the seat to the person, who can then act',
    `banner "${stuck.stuckText.slice(0, 200)}"; revision ${stuck.stuckRevision}→${stuckLater.stuckRevision} while stuck; after take-over: computer panel ${taken.present}, seat "${takenState.seat}", hand-over screen ${takenState.privacy}; left pending for the person: ${JSON.stringify(stalledDecision)} in ${manual.player} ${manual.phase}; the person then played on to ${manualLater.turn}, ${manualLater.player}, ${manualLater.phase}`,
    /cannot go on/i.test(stuck.stuckText) && stuckLater.stuckRevision === stuck.stuckRevision && stuck.stuckRevision > 0 && !taken.present && !takenState.privacy && !afterPlay.present && manualLater.phase !== manual.phase);

  // ------------------------------------------------------------------ B: computer against computer
  const b = await startGame({ allied: 'COMPUTER', axis: 'COMPUTER', seeds: { map: 94101, oob: 94102, deployment: 94103, rules: 94104 } });
  const spectate = await screenState();
  const spectateStart = await panel();
  await h.shot('computers-start');
  await page.waitForTimeout(1500);
  const watching = await panel();
  const viewOptions = await page.evaluate(() => [...document.querySelectorAll('#view-as option')].map((node) => node.textContent.trim()));
  const seatBefore = (await screenState()).seat;
  await page.selectOption('#view-as', { index: 1 });
  await page.waitForTimeout(500);
  const seatAfter = (await screenState()).seat;
  await h.shot('computers-other-side');
  await click(h, '#pause-computer');
  const pausedB = await panel();
  await page.waitForTimeout(1200);
  const pausedB2 = await panel();
  await page.selectOption('#computer-speed', 'INSTANT');
  await click(h, '#play-computer');
  await waitFor(() => !!document.querySelector('#game-end-title'), 'Game End', 600000);
  const end = await page.evaluate(() => ({ title: document.querySelector('#game-end-title')?.textContent.trim(), reason: document.querySelector('.game-end-reason')?.textContent.trim() }));
  await h.shot('computers-game-end');
  const finalPanel = await panel();
  record(h, 'BOT-05', 'Two computers play to Game End with nobody operating; the screen shows no hand-over, can be paused, sped up and viewed from either side',
    `preview "${b.players}"; started with hand-over ${spectate.handoff}; played ${spectateStart.played}→${watching.played} in 1.5 s unattended; views ${JSON.stringify(viewOptions)}, seat "${seatBefore}"→"${seatAfter}"; paused ${pausedB.played}=${pausedB2.played}; Game End "${end.title}" (${end.reason})`,
    b.players === 'Allied: computer · Axis: computer' && !spectate.handoff && watching.played > spectateStart.played && seatBefore !== seatAfter && pausedB.played === pausedB2.played && !!end.title);
  extra['BOT-05'] = { end, finalPanel };
  const finalSave = await (async () => {
    const [download] = await Promise.all([page.waitForEvent('download'), page.click('#download-final-save')]);
    const path = join(evidenceDir, 'computers-final-save.json');
    await download.saveAs(path);
    return path;
  })();
  extra.finalSave = finalSave;
} catch (error) {
  h.note(`RUN STOPPED: ${error.stack ?? error.message}`);
  await h.shot('failure').catch(() => {});
  record(h, 'RUN', 'The run completes', String(error.message ?? error).slice(0, 300), false);
}

await h.finish('doc 03 §BOT computer players');
await writeFile(join(evidenceDir, 'extra.json'), JSON.stringify(extra, null, 2));
console.log(`\n${h.rows.filter((row) => row.status === 'PASS').length} PASS, ${h.rows.filter((row) => row.status !== 'PASS').length} not PASS; page errors ${h.errors.length}`);
await h.close();
