// doc 03 §D: SES-02 to SES-09 on a turn-limit-one game of the contact package (16×12, 2 divisions per side, seeds 7101–7104).
// SES-01 (Pause then Resume) is not run: the product has no Pause control any more (a saved-paused game only shows a Resume banner).
// Usage: node scripts/product-acceptance/run-session.mjs <evidenceRoot>
import { readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { click, has, open, record, selectUnit, where } from '../air-acceptance/harness.mjs';
import { configure, generate, menuSummary, openNewGame, start } from './lib.mjs';

const evidenceDir = join(process.argv[2] ?? 'artifacts/product-2026-10-14', 'session');
const PACKAGE = { width: 16, height: 12, scale: 'COMPACT', divisions: 2, armored: 1, turnLimit: 1, seeds: { map: 7101, oob: 7102, deployment: 7103, rules: 7104 } };
const extra = {};
const h = await open({ evidenceDir });
const { page } = h;
const dialogs = [];
page.on('dialog', (dialog) => { dialogs.push(`${dialog.type()}: ${dialog.message()}`); void dialog.dismiss(); });

/** Click a control that triggers a download, save the file next to the evidence and return its path. */
const download = async (selector) => {
  const [file] = await Promise.all([page.waitForEvent('download'), click(h, selector)]);
  const path = join(evidenceDir, file.suggestedFilename());
  await file.saveAs(path);
  return path;
};
const menuDownload = async (selector) => { await click(h, '#open-menu'); const path = await download(selector); await click(h, '#close-utility'); return path; };
/** The facts a save must keep: turn, seat, phase, one unit's mode and the log text. */
const readState = async (unit) => {
  const w = await where(h);
  await selectUnit(h, unit);
  const card = await page.evaluate(() => document.querySelector('.command-rail')?.innerText.replace(/\s+/g, ' ').trim() ?? '');
  await click(h, '#deselect').catch(() => {});
  await click(h, '[data-deck-tab="log"]').catch(() => {});
  const log = await page.evaluate(() => document.querySelector('.command-rail')?.innerText.replace(/\s+/g, ' ').trim().slice(0, 600) ?? '');
  await click(h, '[data-deck-tab="unit"]').catch(() => {});
  return { turn: w.turn, player: w.player, phase: w.phase, seat: w.seat, mode: card.match(/(Combat|Move|Reserve|Strat) mode/)?.[0] ?? '?', log };
};
const modeOf = (state) => state.mode;
/** The operations the log records, without the notices the restore and the load add themselves. */
const historyOf = (state) => (state.log.match(/changed to \w+ mode/g) ?? []).join(' | ');
const toggleMode = async (unit) => {
  await selectUnit(h, unit);
  const to = (await has(h, '[data-mode="COMBAT"]')) ? 'COMBAT' : 'MOVE';
  await click(h, `[data-mode="${to}"]`, { settle: 500 });
  await click(h, '#deselect').catch(() => {});
  return to;
};

try {
  await openNewGame(h);
  await configure(h, PACKAGE);
  await generate(h);
  await start(h);
  const UNIT = 'Brown TF';
  const baseline = await readState(UNIT);

  // SES-04: checkpoint, an action, restore.
  await click(h, '#open-menu');
  await click(h, '#create-checkpoint', { settle: 400 });
  const checkpoints = await page.evaluate(() => [...document.querySelectorAll('[data-checkpoint]')].map((node) => node.textContent.trim()));
  await h.shot('ses04-checkpoint-created');
  await click(h, '#close-utility');
  const toMode = await toggleMode(UNIT);
  const changed = await readState(UNIT);
  await click(h, '#open-menu');
  await click(h, '[data-checkpoint]:has-text("Revision")', { settle: 800 });
  const restored = await readState(UNIT);
  await h.shot('ses04-restored');
  extra['SES-04'] = { checkpoints, baseline, changed, restored };
  // Play continues after the restore: the same action works again.
  await toggleMode(UNIT);
  const again = await readState(UNIT);
  record(h, 'SES-04', 'Revision/state return to checkpoint and play can continue', `checkpoints ${JSON.stringify(checkpoints)}; ${UNIT} ${modeOf(baseline)} → (action: ${toMode} mode) ${modeOf(changed)} → restored ${modeOf(restored)}; turn/seat/phase after restore "${restored.turn} ${restored.player} ${restored.phase}" vs baseline "${baseline.turn} ${baseline.player} ${baseline.phase}"; logged operations after restore [${historyOf(restored)}] vs at the checkpoint [${historyOf(baseline)}] (the restore adds its own notice); after restoring, the action works again (${modeOf(again)})`,
    checkpoints.length > 0 && modeOf(changed) !== modeOf(baseline) && modeOf(restored) === modeOf(baseline) && historyOf(restored) === historyOf(baseline) && modeOf(again) !== modeOf(baseline));
  await toggleMode(UNIT); // back to the baseline mode

  // SES-05: download a save, change the state, load the file.
  const saved = await readState(UNIT);
  const savePath = await menuDownload('#save-game');
  await toggleMode(UNIT);
  const afterChange = await readState(UNIT);
  await click(h, '#open-menu');
  await page.setInputFiles('#save-file', savePath);
  await page.waitForTimeout(1200);
  const loaded = await readState(UNIT);
  await h.shot('ses05-loaded');
  const saveBytes = (await readFile(savePath)).length;
  extra['SES-05'] = { savePath, saveBytes, saved, afterChange, loaded };
  record(h, 'SES-05', 'Loaded revision, sequence, counters, active seat, and history agree with saved state', `save ${saveBytes} bytes; at save ${saved.turn} ${saved.player} ${saved.phase} seat ${saved.seat}, ${UNIT} ${modeOf(saved)}; after a change ${modeOf(afterChange)}; after loading ${loaded.turn} ${loaded.player} ${loaded.phase} seat ${loaded.seat}, ${UNIT} ${modeOf(loaded)}; logged operations [${historyOf(loaded)}] vs at save [${historyOf(saved)}] (the load adds its own notice)`,
    saveBytes > 1000 && modeOf(afterChange) !== modeOf(saved) && modeOf(loaded) === modeOf(saved) && loaded.turn === saved.turn && loaded.player === saved.player && loaded.phase === saved.phase && loaded.seat === saved.seat && historyOf(loaded) === historyOf(saved));

  // SES-02 and SES-03: play on until a player change; the visible hand-over prompt, then the hand-over itself.
  let prompt = null;
  let privacy = null;
  let afterHandoff = null;
  const beforeSeat = (await where(h)).seat;
  for (let guard = 0; guard < 60 && !afterHandoff; guard += 1) {
    if (await has(h, '#begin-required-handoff')) {
      prompt = await page.evaluate(() => ({ text: document.querySelector('#begin-required-handoff')?.closest('section, div')?.innerText.replace(/\s+/g, ' ').trim().slice(0, 300) ?? '', button: document.querySelector('#begin-required-handoff')?.textContent.trim(), menuOpen: !!document.querySelector('.menu-dialog'), mapVisible: !!document.querySelector('#hex-map')?.getClientRects().length }));
      await h.shot('ses02-handoff-prompt');
      await click(h, '#begin-required-handoff', { settle: 500 });
      privacy = await page.evaluate(() => ({ text: document.body.innerText.replace(/\s+/g, ' ').slice(0, 300), mapVisible: !!document.querySelector('#hex-map') && document.querySelector('#hex-map').getClientRects().length > 0 && getComputedStyle(document.querySelector('#hex-map')).visibility !== 'hidden', unitNames: /Brown TF|Chap TF|Standish/.test(document.body.innerText) }));
      await h.shot('ses03-privacy-screen');
      await click(h, '#complete-handoff', { settle: 600 });
      afterHandoff = { ...(await where(h)), mapVisible: await page.evaluate(() => !!document.querySelector('#hex-map')?.getClientRects().length) };
      await h.shot('ses03-after-handoff');
      break;
    }
    const w = await where(h);
    if (w.decision.length > 0) { await page.locator('[data-choice]').first().click(); await page.waitForTimeout(300); continue; }
    if (w.endDisabled && (await has(h, '#auto-pay'))) { await click(h, '#auto-pay'); continue; }
    await click(h, '#end-phase', { settle: 400 });
  }
  extra['SES-02'] = { prompt, beforeSeat };
  extra['SES-03'] = { privacy, afterHandoff };
  record(h, 'SES-02', 'Current player can identify the required handoff without opening unrelated tools', prompt ? `prompt button "${prompt.button}", text "${prompt.text}"; menu open ${prompt.menuOpen}` : 'no hand-over prompt appeared', !!prompt && !prompt.menuOpen && /hand|screen|player|Axis|Allied/i.test(`${prompt.button} ${prompt.text}`));
  record(h, 'SES-03', 'Map/player projection is absent until next player confirmation', privacy ? `privacy screen "${privacy.text.slice(0, 160)}", map visible ${privacy.mapVisible}, own unit names in the page ${privacy.unitNames}; after confirming the seat is ${afterHandoff?.seat} (before ${beforeSeat}), map visible ${afterHandoff?.mapVisible}` : 'no privacy screen', !!privacy && !privacy.mapVisible && !privacy.unitNames && !!afterHandoff?.mapVisible && afterHandoff.seat !== beforeSeat);

  // SES-06: finish the turn-limit-one game.
  let ended = false;
  for (let guard = 0; guard < 200 && !ended; guard += 1) {
    if (await has(h, '#game-end-title')) { ended = true; break; }
    if (await has(h, '#begin-required-handoff')) { await click(h, '#begin-required-handoff', { settle: 300 }); continue; }
    if (await has(h, '#complete-handoff')) { await click(h, '#complete-handoff', { settle: 300 }); continue; }
    if (await has(h, '#dismiss-away')) { await click(h, '#dismiss-away'); continue; }
    const w = await where(h);
    if (w.decision.length > 0) { await page.locator('[data-choice]').first().click(); await page.waitForTimeout(300); continue; }
    if (w.endDisabled && (await has(h, '#auto-pay'))) { await click(h, '#auto-pay'); continue; }
    if (w.endDisabled && (await has(h, '.arrivals .deck-unit[data-piece]'))) throw new Error('Arrivals must be placed.');
    await click(h, '#end-phase', { settle: 350 });
  }
  const gameEnd = await page.evaluate(() => ({ count: document.querySelectorAll('#game-end-title').length, title: document.querySelector('#game-end-title')?.textContent.trim(), scores: [...document.querySelectorAll('.game-end-scores div')].map((n) => n.textContent.replace(/\s+/g, ' ').trim()), reason: document.querySelector('.game-end-reason')?.textContent.trim() }));
  await h.shot('ses06-game-end');
  extra['SES-06'] = gameEnd;
  record(h, 'SES-06', 'Game End appears once with winner/draw, scores, reason, and final revision', ended ? `dialogs ${gameEnd.count}; "${gameEnd.title}"; scores ${gameEnd.scores.join(' / ')}; ${gameEnd.reason}` : 'Game End never appeared', ended && gameEnd.count === 1 && gameEnd.scores.length === 2 && /final revision \d+/.test(gameEnd.reason ?? ''));

  // SES-07: final save and replay.
  const finalPath = await download('#download-final-save');
  const replayPath = await download('#download-replay');
  const finalText = await readFile(finalPath, 'utf8');
  const replayText = await readFile(replayPath, 'utf8');
  let finalJson = null; let replayJson = null;
  try { finalJson = JSON.parse(finalText); } catch { /* reported below */ }
  try { replayJson = JSON.parse(replayText); } catch { /* reported below */ }
  // Loading the final save shows the same Game End.
  await click(h, '#close-game-end');
  await click(h, '#open-menu');
  await page.setInputFiles('#save-file', finalPath);
  await page.waitForSelector('#game-end-title', { timeout: 10000 }).catch(() => {});
  const gameEnd2 = await page.evaluate(() => ({ title: document.querySelector('#game-end-title')?.textContent.trim(), scores: [...document.querySelectorAll('.game-end-scores div')].map((n) => n.textContent.replace(/\s+/g, ' ').trim()), reason: document.querySelector('.game-end-reason')?.textContent.trim() }));
  extra['SES-07'] = { finalBytes: finalText.length, replayBytes: replayText.length, finalKeys: finalJson ? Object.keys(finalJson).slice(0, 12) : null, replayKeys: replayJson ? Object.keys(replayJson).slice(0, 12) : null, gameEnd2 };
  record(h, 'SES-07', 'Both files are nonempty, parseable, and reproduce the displayed final result', `final save ${finalText.length} bytes (parseable ${!!finalJson}), replay ${replayText.length} bytes (parseable ${!!replayJson}); loading the final save shows "${gameEnd2.title}", ${gameEnd2.scores.join(' / ')}, ${gameEnd2.reason} (displayed before: "${gameEnd.title}", ${gameEnd.scores.join(' / ')}, ${gameEnd.reason}); the replay file has no loader in the UI, so only that it parses is checked`,
    finalText.length > 1000 && replayText.length > 100 && !!finalJson && !!replayJson && gameEnd2.title === gameEnd.title && gameEnd2.scores.join() === gameEnd.scores.join() && gameEnd2.reason === gameEnd.reason);

  // SES-08: New Game from Game End.
  const summaryBefore = gameEnd2.title;
  await click(h, '#new-game-after-end');
  await page.waitForSelector('#new-game-form');
  const fresh = await page.evaluate(() => ({ page: document.querySelector('#new-game-form')?.dataset.newGamePage, gameEndShown: !!document.querySelector('#game-end-title'), status: document.querySelector('.new-game-submit strong')?.textContent.trim(), preview: !!document.querySelector('.operation-preview'), width: document.querySelector('#new-game-width')?.value }));
  await h.shot('ses08-new-game-from-end');
  extra['SES-08'] = fresh;
  record(h, 'SES-08', 'Fresh configuration opens; the finished session is not silently reused', `New Game opened on the "${fresh.page}" page, status "${fresh.status}", preview shown ${fresh.preview}, Game End dialog still shown ${fresh.gameEndShown}; the finished game is replaced only by pressing Preview and Start`, fresh.page === 'settings' && !fresh.preview && !fresh.gameEndShown);
  await click(h, '#close-new-game');
  if (await has(h, '#close-game-end')) await click(h, '#close-game-end');

  // SES-09: reload during setup and during active play. The address keeps "#new-game" while the dialog is open, so a reload may
  // reopen it; what is open is recorded before it is closed.
  const afterReload = async () => {
    await page.reload();
    await page.waitForSelector('#open-menu');
    await page.waitForTimeout(500);
    const dialogOpen = await has(h, '#new-game-form');
    const url = page.url();
    if (dialogOpen) await click(h, '#close-new-game');
    return { dialogOpen, url, summary: await menuSummary(h), state: await where(h) };
  };
  const afterReloadFinished = await afterReload();
  await openNewGame(h);
  await configure(h, { width: 20 });
  const setupWidth = await page.inputValue('#new-game-width');
  const afterSetupReload = { ...(await afterReload()), dialogs: [...dialogs] };
  await openNewGame(h);
  await configure(h, PACKAGE);
  await generate(h);
  await start(h);
  const activeBefore = { summary: await menuSummary(h), state: await readState('Brown TF') };
  await toggleMode('Brown TF');
  const activeChanged = await readState('Brown TF');
  const activeAfter = { ...(await afterReload()), banner: await page.evaluate(() => document.body.innerText.match(/recover|restored|reload|lost|unsaved/i)?.[0] ?? null), dialogs: [...dialogs] };
  await h.shot('ses09-after-active-reload');
  extra['SES-09'] = { afterReloadFinished, setupWidth, afterSetupReload, activeBefore, activeChanged, activeAfter };
  const silent = activeAfter.summary !== activeBefore.summary && !activeAfter.banner && dialogs.length === 0;
  record(h, 'SES-09', 'Recovery behavior is explicit; no silent state substitution', `reload in setup (width typed ${setupWidth}): the New Game dialog is ${afterSetupReload.dialogOpen ? 'reopened (address kept #new-game) with its settings reset' : 'gone'}, the game behind it is "${afterSetupReload.summary}"; reload during active play (${activeBefore.summary}, ${activeChanged.turn} ${activeChanged.phase}, ${UNIT_MODE(activeChanged)}): the page shows "${activeAfter.summary}", ${activeAfter.state.turn} ${activeAfter.state.player} ${activeAfter.state.phase}; any warning, banner or prompt: ${activeAfter.banner ?? 'none'}; browser dialogs ${dialogs.length}`,
    !silent);
} catch (error) {
  record(h, 'RUN', 'The session run completes', String(error.stack ?? error.message), false);
  await h.shot('failure').catch(() => {});
}
function UNIT_MODE(state) { return state.mode; }
record(h, 'UI-04(ses)', 'No browser console or page error during the session run', `${h.errors.length} errors`, h.errors.length === 0);
await writeFile(join(evidenceDir, 'observations.json'), JSON.stringify(extra, null, 1));
await h.finish('doc 03 §D: SES-02 to SES-09');
await h.close();
