// NG-14 (docs/quality/03-product-operation-verification-plan.md, docs/roadmap/16-bridging-wbs.md): engineer bridging operated
// through the real page in a real browser. Every step is a click, a key or a selection on the page; every observation is read from it.
//   npm run build && node scripts/bridging-acceptance.mjs [evidence-dir]
import { join } from 'node:path';
import { advanceTo, click, gotoHex, handoff, has, newGame, open, record, selectUnit, textOf, where } from './air-acceptance/harness.mjs';

const evidenceDir = process.argv[2] ?? join('docs', 'quality', 'evidence', 'bridging-2026-10-10');
const h = await open({ evidenceDir });
const { page } = h;
// Axis attack, 24x16: the Axis engineer starts in Move Mode at 2114 on a river; the tank at 2113 can reach 1915 only by
// a bridge there.
const seeds = { map: 8911, oob: 8912, deployment: 8913, rules: 8914 };
const ROW = 'NG-14';
const ENGINEER_HEX = '2114';
const ENGINEER_ID = '14,13';
const TANK_HEX = '2113';
const FAR_HEX = '1915';

const label = (id) => { const [q, r] = id.split(',').map(Number); return `${String(q + Math.floor(r / 2) + 1).padStart(2, '0')}${String(r + 1).padStart(2, '0')}`; };
/** Bridges the map draws for the active seat, as "2109>2110" pairs. */
const mapBridges = () => page.evaluate(() => window.ocsMap.state.bridges.map(({ hexId, acrossHexId, major }) => ({ hexId, acrossHexId, major })))
  .then((list) => list.map(({ hexId, acrossHexId, major }) => `${label(hexId)}>${label(acrossHexId)}${major ? ' (Major)' : ''}`));
/** Own counters the map draws in a hex, by their labels. */
const ownCountersAt = (hex) => page.evaluate((wanted) => window.ocsMap.state.counters.map(({ label: text }) => text)
  .filter((text) => !text.startsWith('Enemy ') && text.endsWith(`hex ${wanted}`)).map((text) => text.replace(/, hex \d{4}$/u, ''))
  .filter((text) => !/Supply dump|Truck|Hedgehog/u.test(text)), hex);
/** Select the own unit whose map label starts with `name`, through the roster. */
const select = async (name) => { await page.keyboard.press('Escape').catch(() => {}); await selectUnit(h, name); };
/** The hover line of a hex, as the map cursor announces it. */
const hover = (hex) => gotoHex(h, hex);
const fuel = async () => {
  if (await has(h, '[data-fuel-method="SINGLE_UNIT"]')) {
    await click(h, '[data-fuel-method="SINGLE_UNIT"]');
    const option = page.locator('.fuel-panel [data-unit-action]').first();
    if (await option.count()) { await option.click(); await page.waitForTimeout(400); }
  }
};
/** A close-up of the map around a hex, zoomed in with the map's own + button. */
const closeUp = async (name, hexId) => {
  for (let step = 0; step < 4; step += 1) await page.click('#zoom-in');
  await page.evaluate((id) => window.ocsMap.ensureVisible(id), hexId);
  await page.waitForTimeout(400);
  const rect = await page.evaluate((id) => { const r = window.ocsMap.hexClientRect(id); return r && { x: r.x, y: r.y, width: r.width, height: r.height }; }, hexId);
  const file = `${name}.jpg`;
  if (rect) {
    const pad = rect.width * 1.8;
    await page.screenshot({ path: join(evidenceDir, file), type: 'jpeg', quality: 80,
      clip: { x: Math.max(0, rect.x - pad), y: Math.max(60, rect.y - pad), width: rect.width + 2 * pad, height: rect.height + 2 * pad } });
    h.log.push(`screenshot ${file}`);
  }
  await page.click('#zoom-reset');
  await page.waitForTimeout(300);
};
const reachable = () => page.evaluate(() => [...window.ocsMap.state.reachable.keys()]).then((ids) => ids.map(label));

try {
  await newGame(h, { engagement: 'AXIS_ATTACKS', width: 24, height: 16, scale: 'COMPACT', divisions: 3, armored: 1, air: 'NONE', turnLimit: 3, month: 9, seeds });
  h.note(`New Game: Axis attack, 24×16, Compact, 3 divisions (1 armored), no air forces, 3 turns, September, seeds ${JSON.stringify(seeds)}`);
  await advanceTo(h, (state) => state.player.startsWith('Axis') && state.phase === 'Movement');

  // Engineers start in Move Mode (OOB deployment), so nothing is bridged yet.
  const none = await mapBridges();
  record(h, ROW, 'At the start no bridge is drawn: the engineer at 2114 is in Move Mode', none.join(', ') || 'no bridges', none.length === 0);
  const tank = (await ownCountersAt(TANK_HEX))[0] ?? '';
  await select(tank);
  await fuel();
  const tankBefore = await hover(FAR_HEX);
  record(h, ROW, `Unbridged, the tank at ${TANK_HEX} cannot reach ${FAR_HEX} across the river`, `${tank}: ${tankBefore}`, /out of reach/u.test(tankBefore));

  // 13.8a/b: the player switches the engineer to Combat Mode; it bridges the rivers of its hex at once.
  const crew = await ownCountersAt(ENGINEER_HEX);
  const engineer = crew.find((text) => !/\bHQ\b/u.test(text)) ?? crew[0] ?? '';
  await select(engineer);
  await click(h, '[data-mode="COMBAT"]', { settle: 500 });
  const bridges = await mapBridges();
  record(h, ROW, 'After the switch to Combat Mode the map draws the engineer\'s bridges on the river hexsides of its hex', `${engineer}: ${bridges.join(', ') || 'none'}`,
    bridges.length > 0 && bridges.every((entry) => entry.startsWith(`${ENGINEER_HEX}>`)));
  const status = await page.evaluate(() => document.querySelector('[data-status="bridging"]')?.getAttribute('aria-label') ?? '');
  record(h, ROW, 'The engineer\'s status shows a BRIDGE mark explaining Bridging', status || 'no mark', /Bridging: \d river hexsides? at this hex \(13\.8b\)/u.test(status));
  await h.shot('engineer-status');
  const hoverLine = await hover(ENGINEER_HEX);
  record(h, ROW, 'The hover line of the engineer\'s hex says what the bridge does', hoverLine, /your engineer bridges \d river hexsides? here \(/u.test(hoverLine));
  await h.shot('bridges-on-map');
  await closeUp('close-bridges', ENGINEER_ID);

  // The tank now crosses over the bridge.
  await select(tank);
  const tankAfter = await hover(FAR_HEX);
  record(h, ROW, `With the bridge, the tank at ${TANK_HEX} reaches ${FAR_HEX}`, tankAfter, /· \d+(\.\d+)? MP, [\d.]+ left/u.test(tankAfter));
  await gotoHex(h, FAR_HEX, { enter: true });
  await h.shot('move-across-bridge');
  const started = Date.now();
  await click(h, '#confirm-move', { settle: 500 });
  const after = await ownCountersAt(FAR_HEX);
  record(h, ROW, 'Confirming moves the tank across the bridge', `at ${FAR_HEX} now: ${after.join(' | ')} (${Date.now() - started} ms)`, after.includes(tank));
  await closeUp('close-tank-across', ENGINEER_ID);

  // Finish Game Turn 1; in the next Axis Movement Phase the engineer leaves Combat Mode and its bridges vanish (13.8b).
  await advanceTo(h, (state) => state.turn.startsWith('Turn 2'));
  const turn2 = await where(h);
  record(h, ROW, 'Game Turn 1 ends and Turn 2 begins', `${turn2.turn}, ${turn2.player}, ${turn2.phase}`, turn2.turn.startsWith('Turn 2'));
  await advanceTo(h, (state) => state.turn.startsWith('Turn 2') && state.player.startsWith('Axis') && state.phase === 'Movement');
  const still = await mapBridges();
  record(h, ROW, 'The bridges stay while the engineer stays in Combat Mode', still.join(', ') || 'none', still.length === bridges.length);
  await select(engineer);
  await click(h, '[data-mode="MOVE"]', { settle: 500 });
  const gone = await mapBridges();
  record(h, ROW, 'Switching the engineer back to Move Mode removes its bridges from the map', gone.join(', ') || 'no bridges', gone.length === 0);
  await h.shot('bridge-removed');
  await closeUp('close-bridge-removed', ENGINEER_ID);
  await handoff(h);
  record(h, ROW, 'No browser console or page error during the run', `${h.errors.length} errors`, h.errors.length === 0);
} catch (error) {
  record(h, ROW, 'The scenario completes', String(error.message), false);
  await h.shot('failure').catch(() => {});
} finally {
  await h.finish('Engineer bridging (13.8b): browser evidence');
  await h.close();
}
