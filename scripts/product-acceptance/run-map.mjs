// doc 03 §B: MAP-01 to MAP-05 on the exact NG-07 package. Visual judgements (MAP-01) are made on the saved screenshots;
// this run records the inputs, the readouts and the artifacts.
import { createHash } from 'node:crypto';
import { writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { click, gotoHex, has, open, placeArrivals, record, textOf, where } from '../air-acceptance/harness.mjs';
import { configure, deckText, generate, hoverLine, openNewGame, previewSignature, screenHexes, start, sweepMap } from './lib.mjs';

const evidenceDir = join(process.argv[2] ?? 'docs/quality/evidence/product-2026-10-04', 'map');
const NG07 = { style: 'MEDITERRANEAN_COAST', width: 18, height: 12, scale: 'LARGE', divisions: 4, armored: 2, turnLimit: 3, seeds: { map: 91001, oob: 91002, deployment: 91003, rules: 91004 } };
const extra = {};
const h = await open({ evidenceDir });
const { page } = h;
const mapShot = async () => createHash('sha256').update(await page.locator('#hex-map').screenshot()).digest('hex').slice(0, 12);
const zoom = () => textOf(h, '#zoom-level');
const selection = () => page.evaluate(() => document.querySelector('.selection-card, .unit-card, .deck-selection')?.innerText.replace(/\s+/g, ' ').trim().slice(0, 80) ?? document.body.innerText.includes('No unit selected') ? 'No unit selected' : '?');
const timedUi = async (fn) => { const t = Date.now(); await fn(); await page.waitForTimeout(50); return Date.now() - t; };

/** Read every roster row of the seat that has the screen. */
const roster = async () => {
  await click(h, '#open-roster');
  const rows = await page.evaluate(() => [...document.querySelectorAll('[data-roster-pick]')].map((node) => node.innerText.replace(/\s+/g, ' ').trim()));
  await click(h, '#close-roster');
  return rows;
};
/**
 * Play on the plain way (place arrivals, take the first option of a decision, end the step) until the Axis seat holds the
 * screen in the Axis Player Turn. The first hand-over screen is recorded: what it shows and whether the map is visible.
 */
const playToAxisTurn = async () => {
  let privacy = null;
  for (let guard = 0; guard < 120; guard += 1) {
    const state = await where(h);
    if (/Axis player turn/.test(state.player) && /Axis/.test(state.seat) && !state.handoff && !state.complete && !(await has(h, '#dismiss-away'))) return privacy;
    if (await has(h, '#complete-handoff')) {
      if (privacy === null) {
        privacy = await page.evaluate(() => ({ text: document.body.innerText.replace(/\s+/g, ' ').slice(0, 300), mapVisible: !!document.querySelector('#hex-map') && document.querySelector('#hex-map').getClientRects().length > 0 && getComputedStyle(document.querySelector('#hex-map')).visibility !== 'hidden' }));
        await h.shot('map05-handoff-privacy');
      }
      await click(h, '#complete-handoff', { settle: 400 });
      continue;
    }
    if (await has(h, '#begin-required-handoff')) { await click(h, '#begin-required-handoff', { settle: 400 }); continue; }
    if (await has(h, '#dismiss-away')) { await click(h, '#dismiss-away'); continue; }
    if (state.decision.length > 0) { await page.locator('[data-choice]').first().click(); await page.waitForTimeout(300); continue; }
    if (await has(h, '.arrivals .deck-unit[data-piece]')) { await placeArrivals(h); continue; }
    await click(h, '#end-phase', { settle: 300 });
    const after = await where(h);
    if (after.phase === state.phase && after.player === state.player && !after.handoff && !after.complete && after.decision.length === 0 && (await has(h, '#end-phase'))) await click(h, '#end-phase', { settle: 300 });
  }
  throw new Error('The Axis Player Turn was not reached.');
};

try {
  await openNewGame(h);
  await configure(h, NG07);
  await generate(h);
  const preview = await previewSignature(h);
  // MAP-01: the preview map, enlarged.
  await page.locator('.operation-map').screenshot({ path: join(evidenceDir, 'map01-preview-map.png') });
  await start(h);
  const swept = await sweepMap(h);
  extra.sweep = swept.cells.map(({ text }) => text);

  // MAP-01: mounted map at the default view and zoomed out to the whole map; entry hexes shown by selecting an arrival.
  await h.shot('map01-mounted-100');
  while ((await zoom()) !== '' && Number((await zoom()).replace('%', '')) > 60 && !(await page.locator('#zoom-out').isDisabled())) await click(h, '#zoom-out', { settle: 150 });
  await h.shot('map01-mounted-whole-map');
  await page.locator('.arrivals .deck-unit[data-piece]').first().click();
  await page.waitForTimeout(400);
  const entryHexes = await page.evaluate(() => [...document.querySelectorAll('.hex-chips [data-target-hex]')].map((node) => node.textContent.trim()));
  await h.shot('map01-entry-hexes-for-arrival');
  await click(h, '#deselect').catch(() => {});
  const legend = await textOf(h, '.map-legend');
  const settlements = swept.cells.filter(({ text }) => /· (village|city|town)/.test(text)).length;
  const objectives = swept.cells.filter(({ text }) => /objective/.test(text)).map(({ hex }) => hex);
  extra['MAP-01'] = { legend, entryHexes, settlements, objectives };
  record(h, 'MAP-01', 'Terrain uses visual fill/pattern; roads, rivers, settlements, entry areas and objectives are distinguishable without terrain-name labels on Hexes (judged on the screenshots)', `legend "${legend}"; ${settlements} settlement hexes and objective ${objectives.join(',')} announced by the cursor; ${entryHexes.length} entry hexes offered for the first arrival (${entryHexes.slice(0, 6).join(', ')}…); screenshots map01-*`, true);

  // MAP-02: drag, wheel, +/-, Reset.
  await click(h, '#zoom-reset', { settle: 300 });
  const startZoom = await zoom();
  const box = await page.locator('#hex-map').boundingBox();
  const emptyPoint = { x: box.x + box.width * 0.55, y: box.y + box.height * 0.2 };
  const shots = { reset: await mapShot() };
  const revision0 = await where(h);
  const dragMs = await timedUi(async () => { await page.mouse.move(emptyPoint.x, emptyPoint.y); await page.mouse.down(); await page.mouse.move(emptyPoint.x - 180, emptyPoint.y + 90, { steps: 8 }); await page.mouse.up(); });
  shots.drag = await mapShot();
  const zoomAfterDrag = await zoom();
  const wheelMs = await timedUi(async () => { await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2); await page.mouse.wheel(0, -400); await page.waitForTimeout(200); });
  const zoomWheel = await zoom();
  shots.wheel = await mapShot();
  const plusMs = await timedUi(() => click(h, '#zoom-in', { settle: 100 }));
  const zoomPlus = await zoom();
  const minusMs = await timedUi(async () => { await click(h, '#zoom-out', { settle: 100 }); await click(h, '#zoom-out', { settle: 100 }); });
  const zoomMinus = await zoom();
  const resetMs = await timedUi(() => click(h, '#zoom-reset', { settle: 200 }));
  const zoomReset = await zoom();
  shots.afterReset = await mapShot();
  const revision1 = await where(h);
  const noSelection = (await deckText(h)).includes('No unit selected');
  await h.shot('map02-after-reset');
  extra['MAP-02'] = { shots, startZoom, zoomAfterDrag, zoomWheel, zoomPlus, zoomMinus, zoomReset, timings: { dragMs, wheelMs, plusMs, minusMs, resetMs } };
  record(h, 'MAP-02', 'Camera changes after each input and Reset returns to 100% without selecting/moving a unit', `zoom ${startZoom} → drag (view changed ${shots.drag !== shots.reset}, zoom ${zoomAfterDrag}, ${dragMs} ms) → wheel ${zoomWheel} (${wheelMs} ms) → + ${zoomPlus} (${plusMs} ms) → −− ${zoomMinus} (${minusMs} ms) → Reset ${zoomReset} (${resetMs} ms); no unit selected afterwards ${noSelection}; phase unchanged ${revision0.phase === revision1.phase}`,
    shots.drag !== shots.reset && zoomWheel !== startZoom && zoomPlus !== zoomWheel && zoomMinus !== zoomPlus && zoomReset === '100%' && noSelection && Math.max(dragMs, wheelMs, plusMs, resetMs) <= 1000);

  // MAP-03: mouse and keyboard on an empty hex and on an own counter; the stack panel for an own and an enemy stack.
  const own = swept.cells.find(({ text }) => !/no units$/.test(text) && !/enemy/.test(text) && /, /.test(text.split(' · ').at(-1))) ?? swept.cells.find(({ text }) => !/no units$/.test(text) && !/enemy/.test(text));
  const empty = swept.cells.find(({ text }) => /clear · no units$/.test(text));
  const enemy = swept.cells.find(({ text }) => /enemy .*hidden/.test(text)) ?? swept.cells.find(({ text }) => /enemy/.test(text));
  const points = await screenHexes(h, { step: 36 });
  const results = [];
  for (const [kind, cell] of [['empty hex', empty], ['own stack', own], ['enemy stack', enemy]]) {
    const point = points.get(cell.hex);
    const ms = await timedUi(() => page.mouse.click(point.x, point.y));
    await page.waitForTimeout(300);
    const panel = await page.evaluate(() => (document.querySelector('.stack-picker')?.innerText ?? '').replace(/\s+/g, ' ').trim());
    const deck = (await deckText(h)).split('\n').slice(0, 8).join(' / ');
    results.push({ kind, hex: cell.hex, announced: cell.text, ms, deck, panel });
    await h.shot(`map03-click-${kind.replace(' ', '-')}`);
    if (await has(h, '#close-stack-picker')) await click(h, '#close-stack-picker');
    if (await has(h, '#deselect')) await click(h, '#deselect');
  }
  // Keyboard: the cursor and Enter on the own stack.
  const keyText = await gotoHex(h, own.hex, { enter: true });
  const keyDeck = (await deckText(h)).split('\n').slice(0, 12).join(' / ');
  const keyPanel = await page.evaluate(() => (document.querySelector('.stack-picker')?.innerText ?? '').replace(/\s+/g, ' ').trim());
  const focusVisible = await page.evaluate(() => document.activeElement?.id);
  await h.shot('map03-keyboard-enter-own');
  if (await has(h, '#close-stack-picker')) await click(h, '#close-stack-picker');
  if (await has(h, '#deselect')) await click(h, '#deselect');
  extra['MAP-03'] = { results, keyboard: { keyText, keyDeck, keyPanel, focusVisible } };
  record(h, 'MAP-03', 'Selection is visible; stack panel identifies the Hex and visible pieces (mouse and keyboard)', [...results.map((r) => `${r.kind} ${r.hex} click (${r.ms} ms): deck "${r.deck.slice(0, 120)}"${r.panel ? `; stack panel "${r.panel.slice(0, 140)}"` : ''}`), `keyboard Enter on ${own.hex}: "${keyText}" → deck "${keyDeck.slice(0, 120)}"${keyPanel ? `; stack panel "${keyPanel.slice(0, 140)}"` : ''}`].join(' | '),
    // Keyboard activation must show what a click shows: the hex and every visible piece of the stack.
    results.every((r) => r.deck.includes(r.hex) || r.panel.includes(r.hex))
      && own.text.split(' · ').at(-1).split(', ').every((name) => `${keyDeck} ${keyPanel}`.includes(name.split(' / ')[0])));

  // MAP-04 and MAP-05: both seats; the Axis seat is reached by playing on to the Axis Player Turn.
  const alliedRoster = await roster();
  const alliedSweep = await sweepMap(h);
  enemy.text = alliedSweep.cells.find(({ hex }) => hex === enemy.hex)?.text ?? enemy.text;
  own.text = alliedSweep.cells.find(({ hex }) => hex === own.hex)?.text ?? own.text;
  const alliedEnemyView = { hex: enemy.hex, text: enemy.text, dom: await page.content() };
  const privacy = await playToAxisTurn();
  const axisSeat = (await where(h)).seat;
  const axisRoster = await roster();
  const axisSweep = await sweepMap(h);
  await h.shot('map05-axis-seat');
  const axisOwnAtEnemyHex = axisSweep.cells.find(({ hex }) => hex === enemy.hex)?.text ?? '';
  const alliedStackSeenByAxis = axisSweep.cells.find(({ hex }) => hex === own.hex)?.text ?? '';
  const axisDom = await page.content();
  // What each seat must not see: unit names of the other side's stack beyond what the rules show.
  const hiddenAxisNames = axisOwnAtEnemyHex.split(' · ').at(-1).split(', ').filter((name) => !enemy.text.includes(name));
  const hiddenAlliedNames = own.text.split(' · ').at(-1).split(', ').filter((name) => !alliedStackSeenByAxis.includes(name));
  const leaks = {
    alliedDomHasHiddenAxis: hiddenAxisNames.filter((name) => alliedEnemyView.dom.includes(name.split(' / ')[0])),
    axisDomHasHiddenAllied: hiddenAlliedNames.filter((name) => axisDom.includes(name.split(' / ')[0])),
  };
  extra['MAP-05'] = { privacy, axisSeat, enemyHex: enemy.hex, alliedSees: enemy.text, axisOwns: axisOwnAtEnemyHex, alliedOwns: own.text, axisSees: alliedStackSeenByAxis, hiddenAxisNames, hiddenAlliedNames, leaks };
  record(h, 'MAP-05', 'Owner-visible data and enemy redaction follow the active seat; no private data leaks', `Allied seat sees ${enemy.hex} as "${enemy.text}"; Axis owner sees "${axisOwnAtEnemyHex}". Axis seat sees Allied ${own.hex} as "${alliedStackSeenByAxis}"; Allied owner sees "${own.text}". Handoff screen hid the map: ${privacy ? !privacy.mapVisible : 'no handoff screen seen'}. Hidden names found in the other seat's page DOM: ${JSON.stringify(leaks)}`,
    privacy !== null && !privacy.mapVisible && leaks.alliedDomHasHiddenAxis.length === 0 && leaks.axisDomHasHiddenAllied.length === 0 && axisOwnAtEnemyHex !== enemy.text);

  // MAP-04: every generated unit traceable from the preview to the two rosters.
  const rosterText = [...alliedRoster, ...axisRoster].join(' ¦ ');
  const missing = preview.counters.filter((name) => !rosterText.includes(name));
  extra['MAP-04'] = { previewCounters: preview.counters.length, alliedRoster, axisRoster, missing };
  record(h, 'MAP-04', 'Both sides/formations and every generated unit remain traceable; projection/stack hiding explains any count difference', `preview ${preview.counters.length} unit counters (${preview.metrics.Units} units); Allied roster ${alliedRoster.length} rows, Axis roster ${axisRoster.length} rows; preview names not found in either roster: ${missing.length ? missing.join(', ') : 'none'}`,
    missing.length === 0 && alliedRoster.length + axisRoster.length >= Number(preview.metrics.Units));
} catch (error) {
  record(h, 'RUN', 'The MAP run completes', String(error.stack ?? error.message), false);
  await h.shot('failure').catch(() => {});
}
record(h, 'UI-04(map)', 'No browser console or page error during the MAP run', `${h.errors.length} errors`, h.errors.length === 0);
await writeFile(join(evidenceDir, 'observations.json'), JSON.stringify(extra, null, 1));
await h.finish('doc 03 §B: MAP-01 to MAP-05 on the NG-07 package');
await h.close();
