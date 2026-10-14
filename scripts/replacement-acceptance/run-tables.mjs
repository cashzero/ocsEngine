// Actual UI acceptance of docs/rule-engine/replacement-tables-2026-10-14.md §2: the Variable Replacement Table roll and both
// tables in a fresh New Game, then Unit Consolidation and Rebuild Table pricing on a loaded training position
// (make-tables-position.mjs). Every step after loading is a visible control; every observation is read from the page.
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { open, newGame, where, advanceTo, placeArrivals, click, tab, has, record, textOf, selectUnit } from '../air-acceptance/harness.mjs';

const evidenceDir = process.argv[2] ?? 'artifacts/replacement-tables-2026-10-14';
const positionDir = process.argv[3] ?? 'tmp/replacement-tables-position';
const h = await open({ evidenceDir });
const turn = (s) => Number(s.turn.match(/Turn (\d+)/)?.[1]);
const log = async () => { await tab(h, 'Log'); return textOf(h, '.command-rail'); };
const rollOf = (text) => text.match(/Variable Replacement Table roll (\d+): (no replacements|[^.]+)\./);
const counts = (summary) => ({ pax: Number(summary.match(/(\d+) Pax/)?.[1] ?? 0), eq: Number(summary.match(/(\d+) Eq/)?.[1] ?? 0) });
const arrivalCounts = async () => h.page.evaluate(() => {
  const rows = [...document.querySelectorAll('.arrivals .deck-unit[data-piece]')].map((node) => node.textContent ?? '');
  return { pax: rows.filter((text) => /Personnel/.test(text)).length, eq: rows.filter((text) => /Equipment/.test(text)).length, rows: rows.length };
});
const openTables = async () => {
  await tab(h, 'Rebuild');
  if (await has(h, '.replacement-tables summary')) await h.page.evaluate(() => { document.querySelector('.replacement-tables')?.setAttribute('open', ''); });
  return textOf(h, '.command-rail');
};

try {
  // 1-2: a fresh New Game, Game Turn 2 Reinforcement Phase.
  await newGame(h, { air: 'NONE', width: 18, height: 12, scale: 'STANDARD', divisions: 3, armored: 1, turnLimit: 6,
    seeds: { map: 7201, oob: 7202, deployment: 7203, rules: 7204 }, onPreview: async (text) => { h.note(`Fresh game preview: ${text.slice(0, 300)}`); await h.shot('fresh-preview'); } });
  await h.shot('fresh-started');
  const reached = await advanceTo(h, (s) => turn(s) === 2 && s.phase === 'Reinforcement');
  h.note(`Reached ${JSON.stringify(reached)}`);
  const arrivals = await arrivalCounts();
  const freshLog = await log();
  const roll = rollOf(freshLog);
  record(h, 'REPL-09', 'The Log shows the Variable Replacement Table roll of this Reinforcement Phase', roll ? roll[0] : freshLog.slice(0, 600), roll !== null);
  const rolled = roll ? (roll[2] === 'no replacements' ? { pax: 0, eq: 0 } : counts(roll[2])) : { pax: -1, eq: -1 };
  record(h, 'REPL-09', 'Exactly the rolled Pax and Eq wait in Arrivals as separate units', `rolled ${JSON.stringify(rolled)}, Arrivals ${JSON.stringify(arrivals)}`, arrivals.pax === rolled.pax && arrivals.eq === rolled.eq);
  await h.shot('fresh-roll-log');
  const tables = await openTables();
  record(h, 'REPL-10', 'The Rebuild tab shows the Rebuild Table (with the 13.5d pair row) and the Variable Replacement Table with nothing to rebuild',
    tables.slice(0, 1200), /Rebuild Table \(13\.5a\)/.test(tables) && /two for one Pax/.test(tables) && /1 Pax and 1 Eq a step/.test(tables) && /Variable Replacement Table/.test(tables));
  await h.shot('fresh-tables');
  await tab(h, 'Arrivals');
  await advanceTo(h, (s) => turn(s) >= 3);
  record(h, 'REPL-12', 'The fresh game completes Game Turn 2 through every decision and handoff', JSON.stringify(await where(h)), true);

  // 3-6: a different New Game, then the training position loaded through the Menu.
  const facts = JSON.parse(await readFile(join(positionDir, 'position-facts.json'), 'utf8'));
  await newGame(h, { air: 'NONE', width: 32, height: 24, scale: 'COMPACT', divisions: 6, armored: 2, turnLimit: 8,
    seeds: facts.seeds, onPreview: async (text) => { h.note(`Second, different preview: ${text.slice(0, 300)}`); await h.shot('second-preview'); } });
  await click(h, '#open-menu');
  const [loader] = await Promise.all([h.page.waitForEvent('filechooser'), click(h, '#load-game')]);
  await loader.setFiles(join(positionDir, 'position.json'));
  await h.page.waitForFunction(() => /Save loaded/.test(document.querySelector('.deck-notice')?.textContent ?? ''), null, { timeout: 30000 });
  if (await has(h, '#close-utility')) await click(h, '#close-utility');
  h.note(`Loaded training position: ${JSON.stringify(facts)}`);
  await advanceTo(h, (s) => s.phase === 'Reinforcement');
  const positionRoll = rollOf(await log());
  record(h, 'REPL-09', 'The loaded position also rolls the table on entering the Reinforcement Phase', positionRoll?.[0] ?? 'no roll line', positionRoll !== null);
  // Place the new arrivals anywhere but the training hex, so it keeps exactly 1 Pax and 1 Eq. The arrival rows are only
  // on the page while the Arrivals tab is open (run 1 read the Log first and placed nothing).
  await tab(h, 'Arrivals');
  await placeArrivals(h, (hexes) => hexes.find((hex) => hex.text !== facts.hex.label) ?? hexes[0]);

  await tab(h, 'Rebuild');
  const merge = `[data-consolidate="MERGE:${facts.keep.id}:${facts.give.id}"]`;
  const panel = await textOf(h, '.command-rail');
  record(h, 'REPL-11', 'The Rebuild tab offers Combine for the two reduced divisions, and no Exchange (that starts from the unit)',
    panel.slice(0, 1500), await has(h, merge) && !/Exchange/.test(panel) && (await h.page.locator('[data-consolidate]').count()) === 1);
  await h.shot('consolidation-offered');
  await click(h, merge);
  const merged = await log();
  record(h, 'REPL-11', 'Combine moves the steps to one division and sends the other to the Dead Pile (13.9-1)',
    merged.slice(0, 900), merged.includes(`${facts.give.name} joined ${facts.keep.name}`) && /1 step regained/.test(merged) && merged.includes('went to the Dead Pile'));
  // 13.9-2: Exchange starts from the unit on the map: select it, then pick the Dead Pile counter in its Unit tab.
  await selectUnit(h, facts.onMap.name);
  if (await has(h, '#close-roster')) await click(h, '#close-roster');
  await tab(h, 'Unit');
  const unitPanel = await textOf(h, '.command-rail');
  const choices = await h.page.locator('#exchange-choice option').allTextContents();
  record(h, 'REPL-11', 'The selected unit\'s Unit tab offers Exchange with a list of its identical Dead Pile counters of other divisions',
    `${JSON.stringify(choices)} · ${unitPanel.slice(0, 700)}`, choices.some((text) => text.includes(facts.twin.name)));
  await h.page.selectOption('#exchange-choice', { label: choices.find((text) => text.includes(facts.twin.name)) });
  await h.shot('exchange-offered');
  await click(h, '#exchange-run');
  const swapped = await log();
  record(h, 'REPL-11', 'Exchange puts the Dead Pile counter in the unit\'s place (13.9-2)', swapped.slice(0, 900), swapped.includes(`${facts.twin.name} took the place of ${facts.onMap.name}`));
  await h.shot('consolidated');

  // Rebuild Table prices in the training hex: two garrisons for 1 Pax; adding the dead HQ (1 Pax + 1 Eq) is refused.
  await tab(h, 'Rebuild');
  const card = `.refit-base:has([data-rebuild-units="${facts.hex.id}"])`;
  const box = (id) => `${card} input[data-rebuild-unit="${id}"]`;
  for (let guard = 0; guard < 12; guard += 1) {
    const checked = h.page.locator(`${card} input[data-rebuild-unit]:checked`);
    if ((await checked.count()) === 0) break;
    await checked.first().click(); await h.page.waitForTimeout(200);
  }
  for (const garrison of facts.garrisons) { await h.page.locator(box(garrison.id)).click(); await h.page.waitForTimeout(200); }
  const pairText = await textOf(h, card);
  record(h, 'REPL-10', 'Two dead garrisons are priced together at 1 Pax (13.5d)', pairText.slice(0, 700), /costs 1 Pax and 0 Eq/.test(pairText) && /1 Pax for two units/.test(pairText));
  await h.page.locator(box(facts.deadHq.id)).click(); await h.page.waitForTimeout(200);
  const refused = await textOf(h, card);
  const disabled = await h.page.locator(`[data-rebuild-units="${facts.hex.id}"]`).isDisabled();
  record(h, 'REPL-10', 'Adding the dead HQ (1 Pax and 1 Eq a step) is refused with the reason and the button disabled',
    refused.slice(0, 900), /1 Pax and 1 Eq a step/.test(refused) && /takes 2 Pax; the hex holds 1/.test(refused) && disabled);
  await h.shot('rebuild-refused');
  await h.page.locator(box(facts.deadHq.id)).click(); await h.page.waitForTimeout(200);
  await click(h, `[data-rebuild-units="${facts.hex.id}"]`);
  const rebuilt = await log();
  record(h, 'REPL-10', 'The two garrisons return from the Dead Pile for 1 Pax', rebuilt.slice(0, 900), (rebuilt.match(/returned from the Dead Pile/g) ?? []).length >= 2);
  await h.shot('rebuilt');

  if (await has(h, '[data-deck-tab="arrivals"]')) await tab(h, 'Arrivals');
  await advanceTo(h, (s) => turn(s) >= 3, { limit: 250 });
  const beforeSave = await where(h);
  await click(h, '#open-menu');
  const [download] = await Promise.all([h.page.waitForEvent('download'), click(h, '#save-game')]);
  const savePath = join(evidenceDir, 'tables-save.json'); await download.saveAs(savePath);
  const [restore] = await Promise.all([h.page.waitForEvent('filechooser'), click(h, '#load-game')]); await restore.setFiles(savePath);
  await h.page.waitForFunction(() => /Save loaded/.test(document.querySelector('.deck-notice')?.textContent ?? ''), null, { timeout: 30000 });
  if (await has(h, '#close-utility')) await click(h, '#close-utility');
  const afterSave = await where(h);
  const snapshot = JSON.parse(JSON.parse(await readFile(savePath, 'utf8')).currentSnapshot);
  const at = (id) => snapshot.pieceState.pieces.find((p) => p.id === id);
  const observed = { keep: at(facts.keep.id)?.remainingSteps, give: at(facts.give.id)?.location.kind, twin: at(facts.twin.id)?.location, onMap: at(facts.onMap.id)?.location.kind,
    garrisons: facts.garrisons.map(({ id }) => at(id)?.location.kind), pax: at('repl:position:pax:1')?.location.kind };
  record(h, 'REPL-12', 'The downloaded save holds the consolidations and the rebuild', JSON.stringify(observed),
    observed.keep === 3 && observed.give === 'ELIMINATED' && observed.twin?.kind === 'ON_MAP' && observed.onMap === 'ELIMINATED' && observed.garrisons.every((kind) => kind === 'ON_MAP') && observed.pax === 'ELIMINATED');
  record(h, 'REPL-12', 'Complete the turn and save/load through verified action replay', `${JSON.stringify(beforeSave)} → ${JSON.stringify(afterSave)}`, beforeSave.turn === afterSave.turn && beforeSave.phase === afterSave.phase);
  await h.shot('save-restored');
} catch (error) {
  record(h, 'REPL-12', 'Replacement tables acceptance finishes', String(error.stack ?? error), false);
  await h.shot('failure').catch(() => {});
} finally {
  record(h, 'REPL-12', 'No browser page/console errors', JSON.stringify(h.errors), h.errors.length === 0);
  await h.finish('Variable Replacement Table, Rebuild Table and Unit Consolidation: actual UI acceptance'); await h.close();
}
if (h.rows.some(({ status }) => status === 'FAIL')) process.exitCode = 1;
