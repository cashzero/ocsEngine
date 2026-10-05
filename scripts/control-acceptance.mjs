// Hex control acceptance driver (13.3h): operates the built UI in Chromium from visible controls. New Game -> Generate
// the default operation -> Start -> Trace Supply overlay (rail control shown along the track: own, enemy, neutral) ->
// move a truck, then a combat unit, onto neutral rail Hexes -> play on with hot-seat handoffs and arrivals into Game
// Turn 2. Observations come from the page: the overlay state the map is drawing (window.ocsMap.state), the map
// cursor's announcements and screenshots.
// Usage: npm run build, then node scripts/control-acceptance.mjs <evidence dir>.
import { click, gotoHex, has, open, placeArrivals, record, where } from './air-acceptance/harness.mjs';
import { generate, openNewGame, playUntil, start } from './product-acceptance/lib.mjs';

const evidenceDir = process.argv[2] ?? 'docs/quality/evidence/control-2026-10-05';
const h = await open({ evidenceDir, viewport: { width: 1600, height: 1000 } });
const { page } = h;

/** Printed hex number of a Hex ID, as presenter.ts prints it. */
const label = (id) => {
  const [q, r] = id.split(',').map(Number);
  return `${String(q + Math.floor(r / 2) + 1).padStart(2, '0')}${String(r + 1).padStart(2, '0')}`;
};
const railControl = () => page.evaluate(() => window.ocsMap.state.railControl.map(({ hexId, control }) => ({ hexId, control })));
const controlOf = async (id) => (await railControl()).find(({ hexId }) => hexId === id)?.control ?? 'not a rail hex';
const counts = (entries) => entries.reduce((total, { control }) => ({ ...total, [control]: (total[control] ?? 0) + 1 }), {});

const objectives = () => page.evaluate(() => window.ocsMap.state.objectives.map(({ hexId, points, holder }) => ({ hexId, points, holder })));
const vpText = () => page.evaluate(() => document.querySelector('.vp-cell')?.innerText.replace(/\s+/g, ' ').trim() ?? '');
const neutralRail = async () => new Set((await railControl()).filter(({ control }) => control === 'NEUTRAL').map(({ hexId }) => hexId));

/**
 * Select each own unit whose piece ID matches, and move the first one that can reach one of `targets` (Hex IDs).
 * Returns what was moved where, and the rail Hex's control before and after.
 */
const moveOnto = async (pattern, targets) => {
  const neutral = await targets();
  await click(h, '#open-roster');
  const ids = await page.evaluate((source) => [...document.querySelectorAll('[data-roster-pick]')]
    .map((node) => node.getAttribute('data-roster-pick')).filter((id) => new RegExp(source).test(id)), pattern.source);
  for (const id of ids) {
    if (!(await has(h, `[data-roster-pick="${id}"]`))) await click(h, '#open-roster');
    await page.locator(`[data-roster-pick="${id}"]`).first().click();
    await page.waitForTimeout(400);
    const reach = await page.evaluate(() => [...window.ocsMap.state.reachable.keys()]);
    const target = reach.filter((hexId) => neutral.has(hexId)).sort((a, b) => reach.indexOf(a) - reach.indexOf(b)).at(-1);
    if (!target) continue;
    const name = (await page.locator('.command-rail .unit-name, .command-rail h2, .command-rail strong').first().innerText().catch(() => id)).trim();
    const before = await controlOf(target);
    await gotoHex(h, label(target), { enter: true });
    if (!(await has(h, '#confirm-move'))) continue;
    await click(h, '#confirm-move', { settle: 600 });
    if (await has(h, '#finish-move')) await click(h, '#finish-move', { settle: 400 });
    const announced = await gotoHex(h, label(target));
    return { id, name, hex: label(target), before, after: await controlOf(target), announced };
  }
  return null;
};

await openNewGame(h);
await generate(h);
await h.shot('preview');
await start(h);
await page.waitForTimeout(1200);
const opening = await where(h);
h.note(`opened: ${opening.turn} · ${opening.player} · ${opening.phase}`);
await h.shot('game-start-no-overlay');
const offCount = (await railControl()).length;

await click(h, '#toggle-trace-coverage', { settle: 1200 });
const atStart = await railControl();
h.note(`rail control with the overlay off: ${offCount} entries; on: ${JSON.stringify(counts(atStart))}`);
await h.shot('trace-overlay-rail-control');
for (let i = 0; i < 4; i += 1) if (await page.locator('#zoom-out').isEnabled()) await click(h, '#zoom-out', { settle: 250 });
await h.shot('trace-overlay-whole-map');
await click(h, '#zoom-reset').catch(() => {});
record(h, 'CTL-1', 'Rail control is drawn only while the Trace Supply overlay is on, with own, enemy and neutral rail hexes',
  `off: ${offCount}; on: ${JSON.stringify(counts(atStart))}`,
  offCount === 0 && ['OWN', 'ENEMY', 'NEUTRAL'].every((kind) => atStart.some(({ control }) => control === kind)));

const truck = await moveOnto(/transport/, neutralRail);
h.note(`truck move: ${JSON.stringify(truck)}`);
if (truck) await h.shot('truck-on-neutral-rail');
record(h, 'CTL-2', 'A truck entering a neutral rail hex leaves it neutral (13.3h)', JSON.stringify(truck), truck?.before === 'NEUTRAL' && truck.after === 'NEUTRAL');

const combat = await moveOnto(/combat/, neutralRail);
h.note(`combat unit move: ${JSON.stringify(combat)}`);
if (combat) await h.shot('combat-unit-takes-rail');
record(h, 'CTL-3', 'A combat unit entering a neutral rail hex takes control of it (13.3h)', JSON.stringify(combat), combat?.before === 'NEUTRAL' && combat.after === 'OWN');

let arrivals = 0;
const placeAndCount = async (handle) => {
  arrivals += await page.locator('.arrivals .deck-unit[data-piece]').count();
  await placeArrivals(handle);
};
const turn2 = await playUntil(h, async (state) => /\b2\s*\//.test(state.turn) && state.phase === 'Movement', { limit: 200, placeArrivals: placeAndCount });
h.note(`reached ${turn2.state.turn} · ${turn2.state.player} · ${turn2.state.phase}; arrivals placed on the way: ${arrivals}`);
if (!(await page.locator('#toggle-trace-coverage').isChecked().catch(() => false))) await click(h, '#toggle-trace-coverage', { settle: 1200 });
const atTurn2 = await railControl();
h.note(`rail control at Game Turn 2 (${turn2.state.player}): ${JSON.stringify(counts(atTurn2))}`);
const startOf = new Map(atStart.map(({ hexId, control }) => [hexId, control]));
h.note(`rail hexes whose control changed since the start (start view Allied, now ${turn2.state.player}): ${atTurn2
  .filter(({ hexId, control }) => !((startOf.get(hexId) === 'NEUTRAL' && control === 'NEUTRAL') || (startOf.get(hexId) !== 'NEUTRAL' && control !== 'NEUTRAL' && startOf.get(hexId) !== control)))
  .map(({ hexId, control }) => `${label(hexId)} ${startOf.get(hexId)}→${control}`).join(', ')}`);
await h.shot('turn-2-rail-control');
if (combat) h.note(`hex ${combat.hex} at Game Turn 2: ${(await gotoHex(h, combat.hex)).slice(0, 160)}`);
record(h, 'CTL-4', 'One whole Game Turn completes with handoffs and Game Turn 2 arrivals placed', `${turn2.state.turn} · ${turn2.state.phase}; arrivals ${arrivals}`, arrivals > 0);
// Objectives: always drawn with their holder's mark and VP; the top bar sums the VP held now. Checked in the Allied
// Movement Phase of Game Turn 2, when the forward units can reach the neutral towns.
await playUntil(h, async (state) => /\b2\s*\//.test(state.turn) && state.phase === 'Movement' && /Allied/.test(state.player), { limit: 200, placeArrivals });
await click(h, '#zoom-reset').catch(() => {});
const objectivesAtStart = await objectives();
const vpAtStart = await vpText();
const neutralObjective = objectivesAtStart.find(({ holder }) => holder === null);
const neutralLine = neutralObjective ? await gotoHex(h, label(neutralObjective.hexId)) : '';
await h.shot('objective-neutral-marker');
h.note(`objectives at start: ${objectivesAtStart.map(({ hexId, points, holder }) => `${label(hexId)} ${points} VP ${holder === null ? 'neutral' : `player ${holder + 1}`}`).join(', ')}; top bar "${vpAtStart}"; cursor "${neutralLine.slice(0, 140)}"`);
const taker = await moveOnto(/combat/, async () => new Set((await objectives()).filter(({ holder }) => holder === null).map(({ hexId }) => hexId)));
const takenAfter = taker ? (await objectives()).find(({ hexId }) => label(hexId) === taker.hex) : null;
const vpAfter = await vpText();
if (taker) await h.shot('objective-taken');
h.note(`objective move: ${JSON.stringify(taker)}; marker holder now ${takenAfter?.holder ?? 'none'}; top bar "${vpAfter}"`);
record(h, 'CTL-5', 'Objectives show VP and holder on the map, in the hover line and in a live top-bar VP score; a combat unit taking a neutral objective updates all three',
  `start "${vpAtStart}", neutral objective line "${neutralLine.slice(0, 120)}"; after ${taker ? `${taker.name} → ${taker.hex}: holder ${takenAfter?.holder}, line "${taker.announced.slice(0, 120)}", top bar "${vpAfter}"` : 'no combat unit could reach a neutral objective this turn'}`,
  /neutral/.test(neutralLine) && taker !== null && takenAfter?.holder === 0 && /held by/.test(taker.announced) && vpAfter !== vpAtStart);

h.note(`console/page errors: ${h.errors.length}`);
await h.finish('Hex control acceptance (13.3h) 2026-10-05');
await h.close();
