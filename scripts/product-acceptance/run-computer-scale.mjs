// doc 03 BOT-05 and BOT-09 at the default operation size (32×24, 6 divisions a side, 8 turns): two computers play to Game End
// in the built application, at Instant speed. Measures how long Pause takes to show while they play (the page must stay
// responsive), how long the whole game takes, and what the console says.
// Usage: npm run build && node scripts/product-acceptance/run-computer-scale.mjs [evidenceDir]
import { writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { click, open, record } from '../air-acceptance/harness.mjs';
import { generate, openNewGame, start } from './lib.mjs';

const evidenceDir = process.argv[2] ?? 'artifacts/product-computer-scale';
const h = await open({ evidenceDir });
const { page } = h;
const panel = () => page.evaluate(() => {
  const node = document.querySelector('#computer-panel');
  return { status: document.querySelector('#computer-status')?.textContent.trim() ?? '', played: Number(node?.dataset.played ?? -1), revision: Number(node?.dataset.revision ?? -1), playing: node?.dataset.playing === 'true' };
});
const extra = {};
try {
  await openNewGame(h);
  await page.selectOption('#new-game-seat-allied', 'COMPUTER');
  await page.selectOption('#new-game-seat-axis', 'COMPUTER');
  const built = await generate(h);
  h.note(`default operation built in ${built.elapsed} ms`);
  await start(h);
  await page.waitForTimeout(500);
  await page.selectOption('#computer-speed', 'INSTANT');
  const begun = Date.now();
  await page.waitForTimeout(6000);
  const during = await panel();
  await h.shot('instant-playing');
  // Pause is pressed while a computer decides and dispatches: the click must be handled between two actions.
  const pauseMs = await page.evaluate(async () => {
    const started = performance.now();
    document.querySelector('#pause-computer').click();
    while (!document.querySelector('#play-computer')) await new Promise((resolve) => setTimeout(resolve, 1));
    return performance.now() - started;
  });
  const paused = await panel();
  await page.waitForTimeout(1000);
  const pausedLater = await panel();
  await click(h, '#play-computer');
  await page.waitForSelector('#game-end-title', { timeout: 900000 });
  const total = Date.now() - begun;
  const end = await page.evaluate(() => ({ title: document.querySelector('#game-end-title')?.textContent.trim(), reason: document.querySelector('.game-end-reason')?.textContent.trim() }));
  const final = await panel();
  await h.shot('game-end');
  extra.timing = { pauseMs, totalMs: total, played: final.played, msPerAction: Math.round(total / final.played) };
  record(h, 'BOT-05', 'Two computers play the default operation to Game End at Instant speed with nobody operating; Pause takes effect at once; no console error',
    `${final.played} computer actions to "${end.title}" (${end.reason}) in ${Math.round(total / 1000)} s (${extra.timing.msPerAction} ms per action including drawing); ${during.played} played after 6 s; Pause showed in ${Math.round(pauseMs)} ms with ${paused.played} played, held ${paused.played}=${pausedLater.played}; page errors ${h.errors.length}`,
    !!end.title && h.errors.length === 0 && paused.played === pausedLater.played && pauseMs < 1500);
} catch (error) {
  h.note(`RUN STOPPED: ${error.stack ?? error.message}`);
  await h.shot('failure').catch(() => {});
  record(h, 'RUN', 'The run completes', String(error.message ?? error).slice(0, 300), false);
}
await h.finish('doc 03 BOT-05 / BOT-09 at the default size');
await writeFile(join(evidenceDir, 'extra.json'), JSON.stringify(extra, null, 2));
console.log(`\n${h.rows.filter((row) => row.status === 'PASS').length} PASS, ${h.rows.filter((row) => row.status !== 'PASS').length} not PASS; page errors ${h.errors.length}`);
await h.close();
