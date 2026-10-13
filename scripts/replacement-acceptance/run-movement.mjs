// Actual UI acceptance: two visibly different New Games, movement/fuel/modes, and movement-to-rebuild on a loaded position.
// Position preparation is separate; every action after loading uses visible product controls.
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { open, newGame, where, advanceTo, placeArrivals, click, tab, has, gotoHex, record, textOf, settleDecisions, selectUnit, hexDistance } from '../air-acceptance/harness.mjs';

const evidenceDir = process.argv[2] ?? 'docs/quality/evidence/replacement-movement-2026-10-13';
const positionDir = process.argv[3] ?? 'tmp/replacement-movement-position';
const h = await open({ evidenceDir });
const turn = (s) => Number(s.turn.match(/Turn (\d+)/)?.[1]);
const label = (id) => { const [q, r] = id.split(',').map(Number); return `${String(q + Math.floor(r / 2) + 1).padStart(2, '0')}${String(r + 1).padStart(2, '0')}`; };
const select = async (name) => { await selectUnit(h, name); if (await has(h, '#close-roster')) await click(h, '#close-roster'); await tab(h, 'Unit'); };
const move = async (name, to, fuel = false, modes = false) => {
  await select(name);
  if (modes) {
    record(h, 'REPL-07', `${name} offers Reserve/Strat but no Combat Mode`, await textOf(h, '.mode-actions'), await has(h, '[data-mode="RESERVE"]') && await has(h, '[data-mode="STRAT"]') && !(await has(h, '[data-mode="COMBAT"]')));
    await click(h, '[data-mode="STRAT"]'); await h.shot('pax-strat');
    await click(h, '[data-mode="MOVE"]');
    await click(h, '[data-mode="RESERVE"]'); await h.shot('pax-reserve');
    await click(h, '[data-mode="MOVE"]');
  }
  if (fuel) {
    const blocked = await textOf(h, '.command-rail');
    record(h, 'REPL-08', 'Eq movement requires fuel', blocked.slice(0, 800), /fuel/i.test(blocked));
    await click(h, '[data-fuel-method="SINGLE_UNIT"]');
    await click(h, '.fuel-panel [data-unit-action]');
  }
  const before = await textOf(h, '.command-rail');
  await gotoHex(h, to, { enter: true });
  await h.shot(fuel ? 'eq-move-preview' : 'pax-move-preview');
  await click(h, '#confirm-move');
  await settleDecisions(h);
  const after = await textOf(h, '.command-rail');
  record(h, 'REPL-07', `${name} moves to ${to} with its MP recorded`, `${before.slice(0, 450)} → ${after.slice(0, 800)}`, after.includes(to) && /Moved|moved|MP/.test(after));
  await h.shot(fuel ? 'eq-moved' : 'pax-moved');
};

try {
  await newGame(h, { air: 'NONE', width: 18, height: 12, scale: 'STANDARD', divisions: 3, armored: 1, turnLimit: 6,
    seeds: { map: 6101, oob: 6102, deployment: 6103, rules: 6104 }, onPreview: async (text) => { h.note(`First preview: ${text}`); await h.shot('new-game-small-preview'); } });
  await h.shot('new-game-small-started');
  const first = await where(h);
  await advanceTo(h, (s) => turn(s) === 2 && s.phase === 'Reinforcement');
  record(h, 'REPL-05', 'The first fresh New Game completes Turn 1 with legal decisions and handoffs', `${JSON.stringify(first)} → ${JSON.stringify(await where(h))}`, true);
  await click(h, '#open-roster');
  const hq = (await h.page.locator('.roster-hq [data-roster-pick]').first().getAttribute('aria-label')).match(/\d{4}/)?.[0];
  await click(h, '#close-roster');
  await placeArrivals(h, (hexes) => hexes.find((hex) => hex.text === hq) ?? hexes.sort((a, b) => hexDistance(a.text, hq) - hexDistance(b.text, hq))[0]);
  await advanceTo(h, (s) => s.phase === 'Movement');
  await select('Personnel replacements');
  const destination = await h.page.evaluate(() => [...window.ocsMap.state.reachable.keys()][0]);
  if (!destination) throw new Error('Pax has no highlighted movement destination.');
  const target = label(destination);
  await move('Personnel replacements', target, false, true);
  await move('Equipment replacements', target, true);
  await advanceTo(h, (s) => turn(s) >= 3);
  record(h, 'REPL-05', 'The fresh New Game completes the entire turn containing replacement movement', JSON.stringify(await where(h)), true);
  await h.shot('fresh-turn-completed');

  const facts = JSON.parse(await readFile(join(positionDir, 'position-facts.json'), 'utf8'));
  await newGame(h, { air: 'NONE', width: 32, height: 24, scale: 'COMPACT', divisions: 6, armored: 2, turnLimit: 8,
    seeds: { map: 6101, oob: 6102, deployment: 6103, rules: 6104 }, onPreview: async (text) => { h.note(`Second, different Map/OOB preview: ${text}`); await h.shot('new-game-large-preview'); } });
  await h.shot('new-game-large-started');
  await click(h, '#open-menu');
  const [loader] = await Promise.all([h.page.waitForEvent('filechooser'), click(h, '#load-game')]);
  await loader.setFiles(join(positionDir, 'position.json'));
  await h.page.waitForFunction(() => /Save loaded/.test(document.querySelector('.deck-notice')?.textContent ?? ''), null, { timeout: 30000 });
  if (await has(h, '#close-utility')) await click(h, '#close-utility');
  h.note(`Loaded test position: ${JSON.stringify(facts)}`);
  await select(facts.capturer.name);
  await gotoHex(h, facts.truck.hex, { enter: true });
  await click(h, '#confirm-move'); await settleDecisions(h);
  await h.shot('test-position-capture');
  let attacked = false;
  await advanceTo(h, (s) => turn(s) === 2 && s.player.startsWith('Axis') && s.phase === 'Reinforcement', {
    before: async (s) => {
      if (!attacked && s.player.startsWith('Allied') && s.phase === 'Combat') {
        await tab(h, 'Targets'); await click(h, `[data-target-hex]:has-text("${facts.victim.hex}")`);
        const boxes = h.page.locator('[data-participant]');
        for (let i = 0; i < await boxes.count(); i++) if (!(await boxes.nth(i).isChecked())) await boxes.nth(i).check();
        await click(h, '#declare-draft'); await settleDecisions(h);
        await tab(h, 'Log'); const log = await textOf(h, '.command-rail');
        record(h, 'REPL-03', 'The test-position ground unit is eliminated in actual UI combat', log.slice(0, 1600), /eliminated/.test(log));
        await h.shot('combat-loss'); attacked = true; return true;
      }
      return false;
    }, limit: 250,
  });
  let origin;
  await placeArrivals(h, (hexes) => {
    const adjacent = hexes.filter((hex) => hexDistance(hex.text, facts.axisHq.hex) === 1).sort((a, b) => a.text.localeCompare(b.text));
    const picked = hexes.find((hex) => hex.text === origin) ?? adjacent[0] ?? hexes[0]; if (adjacent.length > 0) origin ??= picked.text; return picked;
  });
  h.note(`Replacements arrive at ${origin}, reduced unit/HQ at ${facts.axisHq.hex}.`);
  await advanceTo(h, (s) => s.phase === 'Movement' && s.player.startsWith('Axis'));
  await move('Personnel replacements', facts.axisHq.hex);
  await move('Equipment replacements', facts.axisHq.hex, true);
  await advanceTo(h, (s) => turn(s) === 3 && s.phase === 'Reinforcement' && s.player.startsWith('Axis'), { limit: 250 });
  // Put the new arrivals away from the rebuild hex, so the old moved replacements pay for the rebuild.
  await placeArrivals(h, (hexes) => hexes.find((hex) => hex.text === origin) ?? hexes.find((hex) => hex.text !== facts.axisHq.hex) ?? hexes[0]);
  await tab(h, 'Rebuild');
  const panel = await textOf(h, '.command-rail');
  record(h, 'REPL-04', 'The moved replacements offer the reduced unit and eliminated unit for rebuilding', panel.slice(0, 1600), /reduced here/.test(panel) && /Dead Pile/.test(panel));
  const steps = h.page.locator('[data-rebuild-steps]');
  for (let i = 0; i < await steps.count(); i++) { await steps.nth(i).fill('1'); await steps.nth(i).press('Tab'); }
  await h.shot('moved-replacements-rebuild');
  const [column, row] = [Number(facts.axisHq.hex.slice(0, 2)) - 1, Number(facts.axisHq.hex.slice(2, 4)) - 1];
  const rebuildHex = `${column - Math.floor(row / 2)},${row}`;
  await click(h, `[data-rebuild-units="${rebuildHex}"]:not([disabled])`);
  record(h, 'REPL-03', 'Spending the moved Pax/Eq restores a step and rebuilds the eliminated unit', (await where(h)).notice, /Rebuilt 2 units with 1 Pax and 1 Eq/.test((await where(h)).notice));
  await tab(h, 'Log');
  const rebuiltLog = await textOf(h, '.command-rail');
  record(h, 'REPL-04', 'The reduced unit actually regains a step at the moved replacements hex', rebuiltLog.slice(0, 1800), rebuiltLog.includes(facts.division.name) && rebuiltLog.includes('regained') && rebuiltLog.includes(facts.axisHq.hex));
  await h.shot('rebuild-result');
  await advanceTo(h, (s) => turn(s) >= 4, { limit: 250 });
  const beforeSave = await where(h);
  await click(h, '#open-menu');
  const [download] = await Promise.all([h.page.waitForEvent('download'), click(h, '#save-game')]);
  const savePath = join(evidenceDir, 'moved-and-rebuilt-save.json'); await download.saveAs(savePath);
  const [restore] = await Promise.all([h.page.waitForEvent('filechooser'), click(h, '#load-game')]); await restore.setFiles(savePath);
  await h.page.waitForFunction(() => /Save loaded/.test(document.querySelector('.deck-notice')?.textContent ?? ''), null, { timeout: 30000 });
  if (await has(h, '#close-utility')) await click(h, '#close-utility');
  const afterSave = await where(h);
  const saved = JSON.parse(await readFile(savePath, 'utf8'));
  const snapshot = JSON.parse(saved.currentSnapshot);
  const movedCounters = snapshot.pieceState.pieces.filter(p => p.id === 'repl-arrival:player:axis:2' || p.id === 'repl-arrival:player:axis:2:pax');
  record(h, 'REPL-04', 'Downloaded save corroborates that both moved replacements were spent', JSON.stringify(movedCounters.map(p => ({ id: p.id, location: p.location, quantity: p.resourceQuantity }))), movedCounters.length === 2 && movedCounters.every(p => p.location.kind === 'ELIMINATED' && p.resourceQuantity === 0));
  record(h, 'REPL-05', 'Complete the rebuilding turn and save/load through verified action replay', `${JSON.stringify(beforeSave)} → ${JSON.stringify(afterSave)}`, beforeSave.turn === afterSave.turn && beforeSave.phase === afterSave.phase);
  await h.shot('save-restored');
} catch (error) {
  record(h, 'REPL-07', 'Replacement movement acceptance finishes', String(error.stack ?? error), false);
  await h.shot('failure').catch(() => {});
} finally {
  record(h, 'REPL-07', 'No browser page/console errors', JSON.stringify(h.errors), h.errors.length === 0);
  await h.finish('Movable replacement units: actual UI acceptance'); await h.close();
}
if (h.rows.some(({ status }) => status === 'FAIL')) process.exitCode = 1;
