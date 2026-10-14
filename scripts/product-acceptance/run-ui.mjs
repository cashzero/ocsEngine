// doc 03 §E: UI-01 to UI-05, measured on the real flows (the NG-07 New Game dialog and package, then the contact package of
// the ACT run played through an overrun with its decisions and hand-overs), not on a static shell.
// Usage: node scripts/product-acceptance/run-ui.mjs <evidenceRoot> WIDTHxHEIGHT
import { writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { click, gotoHex, has, open, placeArrivals, record, selectUnit, where } from '../air-acceptance/harness.mjs';
import { detectLayoutIssues } from '../ui-layout-detector.mjs';
import { configure, generate, moveSelectedTo, openNewGame, payFuel, start } from './lib.mjs';

const [width, height] = (process.argv[3] ?? '1920x1080').split('x').map(Number);
const evidenceDir = join(process.argv[2] ?? 'docs/quality/evidence/product-2026-10-04', `ui-${width}x${height}`);
const h = await open({ evidenceDir, viewport: { width, height } });
const { page } = h;
const points = [];

/** Layout facts of the current screen. */
const measure = async (label) => {
  const facts = await page.evaluate(() => {
    const vw = innerWidth; const vh = innerHeight;
    const scroller = document.scrollingElement;
    const map = document.querySelector('#hex-map');
    const mapRect = map && map.getClientRects().length ? map.getBoundingClientRect() : null;
    const rail = document.querySelector('.command-rail');
    const visible = (e) => { const r = e.getBoundingClientRect(); const s = getComputedStyle(e); return r.width > 0 && r.height > 0 && s.visibility !== 'hidden' && s.display !== 'none' && r.bottom > 0 && r.right > 0 && r.top < vh && r.left < vw; };
    // Scrolling boxes inside the deck (bounded lists may scroll; the deck itself may not).
    const scrolling = rail ? [rail, ...rail.querySelectorAll('*')].filter((e) => { const s = getComputedStyle(e); return /(auto|scroll)/.test(s.overflowY) && e.scrollHeight > e.clientHeight + 1; })
      .map((e) => `${e.tagName.toLowerCase()}.${String(e.className).split(' ')[0]}${e === rail ? ' (the deck itself)' : ''} ${e.scrollHeight}/${e.clientHeight}`) : [];
    // Smallest text: every visible text node outside SVG counter art and the canvas.
    let min = { size: 99, text: '' };
    const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
    for (let node = walker.nextNode(); node; node = walker.nextNode()) {
      const text = node.textContent.trim();
      const parent = node.parentElement;
      if (!text || !parent || parent.closest('svg') || !visible(parent)) continue;
      const size = parseFloat(getComputedStyle(parent).fontSize);
      if (size < min.size) min = { size, text: `${text.slice(0, 40)} <${parent.tagName.toLowerCase()}.${String(parent.className).split(' ')[0]}>` };
    }
    const end = document.querySelector('#end-phase');
    const phase = document.querySelector('.phase-picker');
    const inView = (e) => !!e && visible(e) && e.getBoundingClientRect().bottom <= vh && e.getBoundingClientRect().right <= vw;
    return {
      pageOverflow: { x: scroller.scrollWidth > vw, y: scroller.scrollHeight > vh },
      mapShare: mapRect ? Math.round((mapRect.width * mapRect.height) / (vw * vh) * 100) : null,
      deckScrolls: scrolling,
      minFont: min,
      endVisible: inView(end), phaseVisible: inView(phase),
    };
  });
  const issues = await page.evaluate(detectLayoutIssues);
  facts.issues = issues.map((issue) => `${issue.kind}: ${issue.el ?? ''} "${issue.text ?? ''}"`.slice(0, 160));
  const shot = await h.shot(`ui-${label}`);
  points.push({ label, shot, ...facts });
  return facts;
};

try {
  // NG-07: the dialog, the preview, the mounted package.
  await openNewGame(h);
  await measure('new-game-configure');
  await configure(h, { style: 'TEMPERATE_INLAND', width: 18, height: 12, scale: 'LARGE', divisions: 4, armored: 2, turnLimit: 3, seeds: { map: 91001, oob: 91002, deployment: 91003, rules: 91004 } });
  await generate(h);
  await measure('new-game-preview');
  await start(h);
  await measure('ng07-mounted');
  await selectUnit(h, 'Standish TF');
  await measure('ng07-unit-selected');
  await click(h, '#open-roster');
  await measure('ng07-roster');
  await click(h, '#close-roster');
  await click(h, '#open-menu');
  await measure('menu');
  await click(h, '#close-utility');

  // The contact package (ACT run): arrivals, fuel, a move preview, an overrun plan, its decisions and hand-overs.
  await openNewGame(h);
  await configure(h, { width: 16, height: 12, scale: 'COMPACT', divisions: 2, armored: 1, turnLimit: 2, seeds: { map: 7101, oob: 7102, deployment: 7103, rules: 7104 } });
  await generate(h);
  await start(h);
  await measure('contact-reinforcement');
  await placeArrivals(h);
  await click(h, '#end-phase', { settle: 600 });
  await selectUnit(h, 'Brown TF');
  await payFuel(h, 'FORMATION');
  await measure('fuel-panel');
  await gotoHex(h, '1310', { enter: true });
  await measure('move-preview');
  await click(h, '#confirm-move', { settle: 400 });
  await selectUnit(h, 'Brown TF');
  await gotoHex(h, '1410', { enter: true });
  await measure('overrun-plan');
  await click(h, '#declare-draft', { settle: 400 });
  for (let guard = 0; guard < 12; guard += 1) {
    if (await has(h, '#begin-required-handoff')) { await measure(`handoff-prompt-${guard}`); await click(h, '#begin-required-handoff', { settle: 300 }); await measure(`privacy-${guard}`); await click(h, '#complete-handoff', { settle: 300 }); continue; }
    const w = await where(h);
    if (w.decision.length === 0) break;
    await measure(`decision-${guard}`);
    await page.locator('[data-choice]').first().click();
    await page.waitForTimeout(350);
  }
  await measure('after-overrun');
  await click(h, '#end-phase', { settle: 500 });
  await measure('end-confirm');
} catch (error) {
  record(h, 'RUN', 'The UI run completes', String(error.stack ?? error.message), false);
  await h.shot('failure').catch(() => {});
}

const summary = (p) => `${p.label}: map ${p.mapShare}%, page overflow ${JSON.stringify(p.pageOverflow)}, deck scrolls [${p.deckScrolls.join('; ')}], End ${p.endVisible ? 'visible' : 'NOT visible'}, phase ${p.phaseVisible ? 'visible' : 'NOT visible'}, min font ${p.minFont.size}px "${p.minFont.text}", layout issues ${p.issues.length}`;
const deckSelfScroll = points.filter((p) => p.deckScrolls.some((s) => /the deck itself/.test(s)));
const overflow = points.filter((p) => p.pageOverflow.x || p.pageOverflow.y);
const small = points.filter((p) => p.minFont.size < 13);
const withIssues = points.filter((p) => p.issues.length > 0);
const gameScreens = points.filter((p) => p.mapShare !== null && !/new-game|menu|privacy/.test(p.label));
if (width === 1920) {
  record(h, 'UI-01', 'At 1920×1080 the map remains dominant; the single left deck does not scroll; primary commands and current phase/seat remain visible', `${gameScreens.length} game screens: map share ${Math.min(...gameScreens.map((p) => p.mapShare))}–${Math.max(...gameScreens.map((p) => p.mapShare))}%; deck scrolling itself on ${deckSelfScroll.map((p) => p.label).join(', ') || 'none'}; End/phase hidden on ${gameScreens.filter((p) => !p.endVisible || !p.phaseVisible).map((p) => p.label).join(', ') || 'none'}`,
    gameScreens.every((p) => p.mapShare >= 50 && p.endVisible && p.phaseVisible) && deckSelfScroll.length === 0);
} else {
  record(h, 'UI-02', `At ${width}×${height}: no page overflow, clipped content or whole-deck scrolling; only bounded lists scroll; map and commands reachable`, `page overflow on ${overflow.map((p) => p.label).join(', ') || 'none'}; deck scrolling itself on ${deckSelfScroll.map((p) => p.label).join(', ') || 'none'}; layout issues on ${withIssues.map((p) => `${p.label} (${p.issues.slice(0, 2).join(' / ')})`).join('; ') || 'none'}; End/phase hidden on ${gameScreens.filter((p) => !p.endVisible || !p.phaseVisible).map((p) => p.label).join(', ') || 'none'}`,
    overflow.length === 0 && deckSelfScroll.length === 0 && withIssues.length === 0 && gameScreens.every((p) => p.endVisible && p.phaseVisible));
}
record(h, `UI-03(${width})`, 'Minimum computed size of visible interface text is 13 px; no illegible clipped labels (screenshots)', `smallest per screen: ${points.map((p) => `${p.label} ${p.minFont.size}px`).join(', ')}; below 13 px: ${small.map((p) => `${p.label}: "${p.minFont.text}" ${p.minFont.size}px`).join('; ') || 'none'}`, small.length === 0);
record(h, `UI-04(${width})`, 'Zero uncaught exception or error log while repeating NG-07 and an overrun turn', `${h.errors.length} errors${h.errors.length ? `: ${h.errors.slice(0, 3).join(' | ')}` : ''}`, h.errors.length === 0);
await writeFile(join(evidenceDir, 'measurements.json'), JSON.stringify(points, null, 1));
await h.finish(`doc 03 §E: UI rows at ${width}×${height}`);
await h.close();
console.log(points.map(summary).join('\n'));
