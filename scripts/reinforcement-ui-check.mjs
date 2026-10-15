// Drives the New Game dialog of the built app: sets reinforcement options, previews, starts, and reads what the game shows.
import { click, open, where } from './air-acceptance/harness.mjs';
import { configure, generate, openNewGame, start } from './product-acceptance/lib.mjs';

const out = process.argv[2] ?? 'artifacts/reinforcement-ui';
const h = await open({ evidenceDir: out });
const { page } = h;
const read = (id) => page.inputValue(`#new-game-${id}`);
try {
  await openNewGame(h);
  await configure(h, { turnLimit: 8, engagement: 'MEETING' });
  const fill = async (id, value) => { await page.fill(`#new-game-${id}`, String(value)); await page.press(`#new-game-${id}`, 'Tab'); };
  await fill('reinforcements-allied', 50);
  await fill('reinforcements-axis', 25);
  await fill('reinforcements-first-turn', 4);
  console.log('summary:', await page.textContent('#reinforcement-summary'));
  await h.shot('settings');
  // Too late: 75% from turn 6 must pull the first turn back.
  await fill('reinforcements-allied', 75);
  await fill('reinforcements-first-turn', 7);
  console.log('after 75%/T7:', await read('reinforcements-first-turn'), await read('reinforcements-allied'), (await page.textContent('#reinforcement-summary')).slice(-90));
  await fill('reinforcements-allied', 50);
  await fill('reinforcements-first-turn', 4);
  const generated = await generate(h);
  console.log('preview:', JSON.stringify(generated.state).slice(0, 300));
  console.log('metrics:', await page.evaluate(() => [...document.querySelectorAll('.operation-metrics div')].map((d) => d.textContent.replace(/\s+/g, ' ')).join(' | ')));
  await h.shot('preview');
  await start(h);
  console.log('started:', JSON.stringify(await where(h)));
  await h.shot('started');
  console.log('errors:', h.errors);
} finally { await h.close?.(); }
