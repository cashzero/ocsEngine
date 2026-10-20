// doc 03: MAP-06, ACT-05, ACT-05a and REPL-02 on Game Turn 2, where the first reinforcements arrive (nothing arrives in Game Turn 1).
// One Eastern Europe package, ground duel, seeds fixed; Game Turn 1 is played through on the plain way, then the first Reinforcement Phase of Game Turn 2 (whichever side moves first) is inspected and operated, and Game Turn 2 is played to its end.
// Usage: node scripts/product-acceptance/run-turn2.mjs <evidenceRoot>
import { writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { click, gotoHex, has, open, placeArrivals, record, selectUnit, where } from '../air-acceptance/harness.mjs';
import { configure, generate, openNewGame, previewSignature, playUntil, start } from './lib.mjs';

const evidenceDir = join(process.argv[2] ?? 'artifacts/product-2026-10-14', 'turn2');
const BASE = { width: 32, height: 24, scale: 'COMPACT', divisions: 6, armored: 2, turnLimit: 3, seeds: { map: 91001, oob: 91002, deployment: 91003, rules: 91004 } };
const extra = {};
const h = await open({ evidenceDir });
const { page } = h;
const label = (id) => { const [q, r] = id.split(',').map(Number); return `${String(q + Math.floor(r / 2) + 1).padStart(2, '0')}${String(r + 1).padStart(2, '0')}`; };
const placementLabels = async () => (await page.evaluate(() => [...window.ocsMap.state.placement])).map(label);
/** Counts of what the Preview draws: terrain classes, roads, railways. */
const flatness = () => page.evaluate(() => {
  const count = (selector) => document.querySelectorAll(`.operation-map ${selector}`).length;
  const fills = [...document.querySelectorAll('.operation-map .terrain-layer .terrain-fill')];
  const of = (name) => fills.filter((node) => node.classList.contains(`terrain-${name}`)).length;
  return { hexes: fills.length, clear: of('clear'), woods: of('woods'), rough: of('rough'), mountain: of('mountain'), marsh: of('marsh'), water: of('water'), roads: count('.road-casing'), rails: count('.rail-line') };
});

try {
  // MAP-06 first part: the same seeds, Western Europe then Eastern Europe, side by side.
  await openNewGame(h);
  await configure(h, { ...BASE, style: 'WESTERN_EUROPE' });
  await generate(h);
  const western = await flatness();
  await page.locator('.operation-map').screenshot({ path: join(evidenceDir, 'map06-western-preview.png') });
  await configure(h, { style: 'EASTERN_EUROPE' });
  await generate(h);
  const eastern = await flatness();
  const easternSig = await previewSignature(h);
  await page.locator('.operation-map').screenshot({ path: join(evidenceDir, 'map06-eastern-preview.png') });
  extra['MAP-06'] = { western, eastern };
  const flatter = eastern.mountain === 0 && eastern.rough + eastern.mountain < western.rough + western.mountain && eastern.clear > western.clear;
  const sparser = eastern.roads < western.roads && eastern.rails < western.rails;
  await start(h);
  await h.shot('map06-eastern-started');
  const opening = { ...(await where(h)), arrivalsTab: await has(h, '[data-deck-tab="arrivals"]'), arrivalRows: await page.locator('.arrivals .deck-unit[data-piece]').count() };
  const mountedTerrain = await page.evaluate(() => document.querySelector('#hex-map') ? 'mounted' : 'none');

  // Game Turn 1: plain way until the Allied Reinforcement Phase of Game Turn 2.
  const turn1 = await playUntil(h, async (s) => /Turn 2/.test(s.turn) && s.phase === 'Reinforcement', { limit: 200 });
  await h.shot('turn2-first-reinforcement');
  const after1 = await where(h);

  // The arrivals as the deck lists them.
  const rows = await page.evaluate(() => [...document.querySelectorAll('.arrivals .deck-unit[data-piece]')].map((node) => ({ piece: node.dataset.piece, text: node.innerText.replace(/\s+/g, ' ').trim(), tokens: node.querySelector('svg')?.textContent.replace(/\s+/g, ' ').trim() ?? '' })));
  extra.arrivals = rows;
  const replRows = rows.filter(({ text }) => /\b(Pax|Eq)\b/.test(text));
  const unitRows = rows.filter(({ text }) => !/\b(Pax|Eq)\b/.test(text));

  // ACT-05: an ordinary unit is offered only legal entry hexes, and a click elsewhere is refused.
  let act05;
  if (unitRows.length > 0) {
    await page.locator(`.arrivals .deck-unit[data-piece="${unitRows[0].piece}"]`).click();
    await page.waitForTimeout(300);
    const entry = await placementLabels();
    // A hex that is not offered: the farthest hex from every entry hex is not needed; any hex outside the set will do.
    const outside = ['0808', '1208', '1008', '0612'].find((hex) => !entry.includes(hex)) ?? '1010';
    const countBefore = (await page.locator('.arrivals .deck-unit[data-piece]').count());
    await gotoHex(h, outside, { enter: true });
    await page.waitForTimeout(300);
    const countAfterRefusal = (await page.locator('.arrivals .deck-unit[data-piece]').count());
    const stillSelected = await has(h, '#deselect');
    await h.shot('act05-illegal-click');
    // Restore the selection if the click dropped it, then place on a legal hex.
    if (!(await page.evaluate(() => window.ocsMap.state.placement.size))) await page.locator(`.arrivals .deck-unit[data-piece="${unitRows[0].piece}"]`).click();
    const legal = (await placementLabels());
    await gotoHex(h, legal[0], { enter: true });
    await page.waitForTimeout(400);
    const countAfterPlace = (await page.locator('.arrivals .deck-unit[data-piece]').count());
    await h.shot('act05-placed');
    act05 = { piece: unitRows[0].text, entry, outside, countBefore, countAfterRefusal, stillSelected, placedAt: legal[0], countAfterPlace };
  }
  extra['ACT-05'] = act05;
  record(h, 'ACT-05', 'An off-map reinforcement is placed only on a legal entry Hex', act05 ? `Game Turn 2 ${after1.player} Reinforcement lists ${rows.length} arrivals (${unitRows.length} units, ${replRows.length} Pax/Eq); "${act05.piece}" offered entry hexes ${act05.entry.join(', ')}; clicking ${act05.outside} (not offered) left ${act05.countAfterRefusal} of ${act05.countBefore} arrivals; placing on ${act05.placedAt} left ${act05.countAfterPlace}` : `no ordinary unit arrived on Game Turn 2 (arrivals: ${rows.map((r) => r.text).join(' | ')})`,
    !!act05 && act05.entry.length > 0 && !act05.entry.includes(act05.outside) && act05.countAfterRefusal === act05.countBefore && act05.countAfterPlace === act05.countBefore - 1);

  // REPL-02: Pax and Eq are listed with their quantity, can go to an entry hex or within 2 hexes of an HQ.
  let repl;
  if (replRows.length > 0) {
    await page.locator(`.arrivals .deck-unit[data-piece="${replRows[0].piece}"]`).click();
    await page.waitForTimeout(300);
    const replHexes = await placementLabels();
    const entryHexes = act05?.entry ?? [];
    const extraHexes = replHexes.filter((hex) => !entryHexes.includes(hex));
    await h.shot('repl02-pax-eq-placement');
    repl = { rows: replRows.map(({ text, tokens }) => `${text} [${tokens}]`), replHexes, entryHexes, extraHexes };
  }
  extra['REPL-02'] = repl;
  // Place everything left (the plain way), then play Game Turn 2 to its end.
  await placeArrivals(h);
  const leftAfterPlacing = await page.locator('.arrivals .deck-unit[data-piece]').count();
  // The other side's Reinforcement Phase of Game Turn 2: what arrives for it.
  const firstSide = after1.player;
  await playUntil(h, async (s) => /Turn 2/.test(s.turn) && s.phase === 'Reinforcement' && s.player !== firstSide, { limit: 120 });
  const rows2 = await page.evaluate(() => [...document.querySelectorAll('.arrivals .deck-unit[data-piece]')].map((node) => node.innerText.replace(/\s+/g, ' ').trim()));
  const secondSide = (await where(h)).player;
  await h.shot('turn2-second-reinforcement');
  extra['ACT-05a'] = { opening, firstSide, firstRows: rows.map((r) => r.text), secondSide, secondRows: rows2 };
  const turn2 = await playUntil(h, async (s) => /Turn 3/.test(s.turn), { limit: 220, placeArrivals });
  await h.shot('turn3-reached');
  const end = await where(h);
  record(h, 'REPL-02', 'Pax and Eq are listed in Arrivals each Reinforcement Phase, print "Pax"/"Eq" with their quantity, can be placed at an entry hex or within 2 hexes of an HQ, remain separate 1/4 RE replacement units; the turn completes', repl ? `Game Turn 2 arrivals: ${repl.rows.join(' | ')}; offered hexes for the first: ${repl.replHexes.join(', ')} (entry hexes ${repl.entryHexes.join(', ') || 'unknown'}; extra near HQs: ${repl.extraHexes.join(', ') || 'none'}); arrivals left after placing all ${leftAfterPlacing}; Game Turn 2 played through to ${end.turn}, ${end.player}, ${end.phase}` : `no Pax/Eq in the Game Turn 2 arrivals (${rows.map((r) => r.text).join(' | ')})`,
    !!repl && repl.rows.every((row) => /(Pax|Eq)/.test(row) && /\d/.test(row)) && repl.extraHexes.length > 0 && leftAfterPlacing === 0 && /Turn 3/.test(end.turn));

  const kinds = (list) => ({ unit: list.some((t) => !/(Pax|Eq|Truck|Supply|SP)\b/.test(t) || /Arty|Gp|Rgt|Bn/.test(t)), sp: list.some((t) => /Supply dump|\bSP\b/.test(t)), repl: list.some((t) => /\bPax\b/.test(t)) && list.some((t) => /\bEq\b/.test(t)) });
  const k1 = kinds(rows.map((r) => r.text));
  const k2 = kinds(rows2);
  record(h, 'ACT-05a', 'Nothing arrives on Game Turn 1: play opens in the Movement Phase with no Arrivals tab; the held-back unit, the SP and the Pax/Eq arrive in each side\'s Game Turn 2 Reinforcement Phase', `opening: ${opening.turn}, ${opening.player}, ${opening.phase}, arrivals tab ${opening.arrivalsTab}, ${opening.arrivalRows} arrival rows; Game Turn 2 ${firstSide}: ${rows.map((r) => r.text).join(' | ')}; Game Turn 2 ${secondSide}: ${rows2.join(' | ')}`,
    opening.phase === 'Movement' && !opening.arrivalsTab && opening.arrivalRows === 0 && k1.unit && k1.sp && k1.repl && k2.unit && k2.sp && k2.repl && firstSide !== secondSide);

  // MAP-06 second part: the arrival/phase/hand-over run reached Game Turn 2 and beyond on the Eastern map.
  record(h, 'MAP-06', 'Eastern Europe is offered; its preview is visibly flatter (mostly open, few hills, no mountains) with clearly fewer roads and railways than Western Europe on the same seeds; the started map is the preview; arrivals, phase ends and hand-overs reach Game Turn 2', `same seeds, Preview counts Western Europe ${JSON.stringify(western)} vs Eastern ${JSON.stringify(eastern)}; started map ${mountedTerrain}; Game Turn 1 played through (first hand-over screen: ${turn1.privacy ? `map hidden ${!turn1.privacy.mapVisible}` : 'none seen'}) to ${after1.turn}, ${after1.player}, ${after1.phase}; Game Turn 2 reached ${end.turn}. Visual flatness is judged on map06-*-preview.png`,
    flatter && sparser && /Turn 3/.test(end.turn));
  extra.eastern = { sig: easternSig.metrics };
} catch (error) {
  record(h, 'RUN', 'The Game Turn 2 run completes', String(error.stack ?? error.message), false);
  await h.shot('failure').catch(() => {});
}
record(h, 'UI-04(turn2)', 'No browser console or page error during the run', `${h.errors.length} errors`, h.errors.length === 0);
await writeFile(join(evidenceDir, 'observations.json'), JSON.stringify(extra, null, 1));
await h.finish('doc 03: MAP-06, ACT-05, REPL-02 on Game Turn 2');
await h.close();
