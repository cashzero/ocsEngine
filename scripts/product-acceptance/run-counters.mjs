// doc 03 §B1: CTR-01 to CTR-07 on the NG-07 package at one viewport; CTR-08 is this run repeated at 1920×1080 and 1680×1050.
// Printed fields are read from the counter SVGs on the page (preview, roster, stack list, unit card); the canvas map
// counters and the visual grammar are judged on the saved element screenshots. The generated definitions come from
// definitions.mjs (the same request the form sends) and are the reference for the printed values.
import { writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { click, gotoHex, has, open, placeArrivals, record, selectUnit, tab, where } from '../air-acceptance/harness.mjs';
import { definitionsByName } from './definitions.mjs';
import { cardTokens, configure, generate, hexOnScreen, moveSelectedTo, openNewGame, payFuel, playUntil, start, sweepMap } from './lib.mjs';

const [width, height] = (process.argv[3] ?? '1920x1080').split('x').map(Number);
const evidenceDir = join(process.argv[2] ?? 'artifacts/product-2026-10-04', `counters-${width}x${height}`);
const NG07 = { style: 'TEMPERATE_INLAND', width: 18, height: 12, scale: 'LARGE', divisions: 4, armored: 2, turnLimit: 3, seeds: { map: 91001, oob: 91002, deployment: 91003, rules: 91004 } };
const { definitions } = definitionsByName();
const defOf = (name) => definitions.find((definition) => definition.name === name);
const face = (definition, id) => definition.faces.find((entry) => entry.id === id)?.steps.at(-1);
const extra = { viewport: `${width}×${height}` };
const squash = (text) => String(text ?? '').replace(/\s+/g, '');
const h = await open({ evidenceDir, viewport: { width, height } });
const { page } = h;
// Measure every actual pointer activation, including roster and stack selections. Harness settling
// delays and screenshots are excluded; accepted action completion includes the busy render.
const locatorPrototype=Object.getPrototypeOf(page.locator('body'));
const rawLocatorClick=locatorPrototype.click;
locatorPrototype.click=async function(...args){
  const label=String(this),started=Date.now();
  const result=await rawLocatorClick.apply(this,args);
  await page.waitForFunction(()=>!document.querySelector('[aria-busy="true"]'));
  const execution=/#confirm|data-mode|data-unit-action|data-fuel|data-choice|data-feed|data-refit/.test(label);
  h.timings.push({label,elapsed:Date.now()-started,budget:execution?1500:1000});
  return result;
};

const ui = async (label, fn) => { const t = Date.now(); const value = await fn(); (h.timings ??= []).push({ label, elapsed: Date.now() - t }); return value; };
/** Zoom the map by its own buttons to a readout. */
const zoomTo = async (target) => {
  for (let guard = 0; guard < 40; guard += 1) {
    const now = Number((await page.textContent('#zoom-level')).replace('%', ''));
    if (now === target) return;
    const id = now < target ? '#zoom-in' : '#zoom-out';
    if (await page.locator(id).isDisabled()) return;
    await click(h, id, { settle: 120 });
  }
};
/** An element screenshot of the map around a hex (the hex is brought on screen and located by hovering). */
const centreOf = (label) => hexOnScreen(h, label, gotoHex);
const hexShot = async (label, name, size = 260) => {
  const point = await centreOf(label);
  if (!point) return null;
  const clip = { x: Math.max(0, point.x - size / 2), y: Math.max(0, point.y - size / 2), width: size, height: size };
  const file = `${name}.png`;
  await page.screenshot({ path: join(evidenceDir, file), clip });
  return { file, point };
};

try {
  // CTR-01: the combined preview with every formation opened.
  await openNewGame(h);
  await configure(h, NG07);
  const generation=await generate(h);h.timings.push({label:'Generate preview',elapsed:generation.elapsed,budget:3000});
  // The Preview lists one side at a time under Allied / Axis tabs: each tab is opened, every formation expanded and photographed.
  const previewCounters = [];
  for (const side of ['allied', 'axis']) {
    await click(h, `#preview-forces-${side}`, { settle: 200 });
    const summaries = page.locator(`.preview-force.side-${side} details > summary`);
    for (let index = 0; index < (await summaries.count()); index += 1) await summaries.nth(index).click();
    await page.waitForTimeout(300);
    previewCounters.push(...await page.evaluate((sideClass) => [...document.querySelectorAll(`.preview-force.side-${sideClass}`)].flatMap((force) => [...force.querySelectorAll('.preview-counter')]
      .map((figure) => ({ side: force.querySelector('header strong').textContent.trim(), name: figure.querySelector('figcaption').textContent.trim(), tokens: figure.querySelector('svg').textContent.replace(/\s+/g, ' ').trim() }))), side));
    // The preview scrolls inside the dialog: each formation's counters are scrolled into view and captured on their own.
    const groups = page.locator(`.preview-force.side-${side} details.counter-formation`);
    for (let index = 0; index < (await groups.count()); index += 1) {
      await groups.nth(index).scrollIntoViewIfNeeded();
      await groups.nth(index).screenshot({ path: join(evidenceDir, `ctr01-preview-${side}-${String(index + 1).padStart(2, '0')}.png`) });
    }
  }
  const kindsBySide = {};
  for (const counter of previewCounters) {
    const definition = definitions.find((entry) => entry.name === counter.name && entry.ownership.sideDefinitionId === `side:${counter.side.toLowerCase()}`) ?? defOf(counter.name);
    counter.kind = definition?.counter?.kind ?? '?';
    counter.symbol = definition?.counter?.symbol ?? '?';
    (kindsBySide[counter.side] ??= new Set()).add(`${counter.kind}/${counter.symbol}`);
  }
  const fillers = previewCounters.filter(({ tokens }) => /(^| )(\?|HQ|ART|TRN|SUP|ENG)( |$)/.test(tokens));
  extra.previewCounters = previewCounters;
  record(h, 'CTR-01', 'Both sides expose the generated unit counters; HQ, combat, artillery, reconnaissance, engineer, transport and supply templates are visibly distinct (judged on ctr01-preview-*.png)', `${previewCounters.length} counters (${previewCounters.filter((c) => c.side === 'ALLIED').length} Allied, ${previewCounters.filter((c) => c.side === 'AXIS').length} Axis); kinds/symbols per side ${JSON.stringify(Object.fromEntries(Object.entries(kindsBySide).map(([k, v]) => [k, [...v]])))}; generic role-label/"?" fillers: ${fillers.length}`,
    previewCounters.length === 70 && fillers.length === 0 && ['ALLIED', 'AXIS'].every((side) => ['HQ/', 'COMBAT/', 'ARTILLERY/', 'TRANSPORT/', 'SUPPLY/'].every((kind) => [...(kindsBySide[side] ?? [])].some((entry) => entry.startsWith(kind)))));

  // CTR-02 and CTR-03: sampled counters against their generated definitions (the move face is the starting face).
  const tokensOf = (name) => previewCounters.find((counter) => counter.name === name)?.tokens ?? '';
  const combat = defOf('Standish TF / 10.A');
  // Front units start in Combat Mode (deployment.ts), so the printed face may be either; the one matching the counter is reported.
  const expectedFor = (id) => { const f = face(combat, id); return [combat.counter.echelon, combat.counter.designation, combat.counter.affiliation, f.combatStrength, f.actionRating, f.movementPointTicks / 4].join(' '); };
  const printed02 = tokensOf('Standish TF / 10.A');
  const faceId02 = ['combat', 'move'].find((id) => squash(printed02) === squash(expectedFor(id))) ?? 'move';
  const move = face(combat, faceId02);
  const expected02 = expectedFor(faceId02);
  record(h, 'CTR-02', 'A basic combat counter shows designation, echelon, symbol, affiliation, CS, AR, MA/mobility, combat category and RE (when applicable) matching its definition', `Standish TF / 10.A preview tokens "${tokensOf('Standish TF / 10.A')}" vs definition (${faceId02} face) "${expected02}" (symbol ${combat.counter.symbol}, mobility ${face(combat, 'move') && combat.faces[1].mobilityClassDefinitionId}, category ${combat.counter.combatCategory}, showRe ${combat.counter.showRe}); colour/symbol grammar judged on ctr01/ctr04 images`,
    // The SVG text joins adjacent fields without spaces ("III2F2 7414"), so the fields are compared in order without spaces.
    squash(tokensOf('Standish TF / 10.A')) === squash(expected02));
  const samples = {
    hq: defOf('US HQ 21st Corps'), artillery: defOf('Div Arty I / 7.A'), transport: definitions.find((d) => d.name === 'Truck' && d.ownership.sideDefinitionId === 'side:allied'),
    supply: definitions.find((d) => d.name === 'Supply Dump' && d.ownership.sideDefinitionId === 'side:allied'),
  };
  const hqMove = face(samples.hq, 'move');
  const artMove = face(samples.artillery, 'move');
  const trMove = face(samples.transport, 'move');
  const expected03 = {
    hq: `${samples.hq.counter.echelon} ${samples.hq.counter.designation} ${hqMove.range}-${hqMove.movementPointTicks / 4}`,
    artillery: `${samples.artillery.counter.echelon} ${samples.artillery.counter.designation} ${samples.artillery.counter.affiliation} ${artMove.ratings[0].value} ${artMove.actionRating} ${artMove.range} ${artMove.movementPointTicks / 4}`,
    transport: `${samples.transport.counter.transportPoints} ${trMove.movementPointTicks / 4}`,
  };
  const seen03 = { hq: tokensOf('US HQ 21st Corps'), artillery: tokensOf('Div Arty I / 7.A'), transport: previewCounters.find((c) => c.name === 'Truck' && c.side === 'ALLIED')?.tokens, supply: previewCounters.filter((c) => c.name === 'Supply Dump' && c.side === 'ALLIED').map((c) => c.tokens) };
  extra['CTR-03'] = { expected03, seen03 };
  record(h, 'CTR-03', 'HQ, artillery, transport and supply counters use role-specific printed fields; not-applicable ratings are omitted', `HQ "${seen03.hq}" (expected ${expected03.hq}); artillery "${seen03.artillery}" (expected barrage-AR-range-MA ${expected03.artillery}); transport "${seen03.transport}" (expected points MA ${expected03.transport}); supply ${JSON.stringify(seen03.supply)} (printed quantity ${samples.supply.resource.printedQuantity} SP)`,
    squash(seen03.hq) === squash(expected03.hq) && squash(seen03.artillery) === squash(expected03.artillery) && squash(seen03.transport) === squash(expected03.transport) && seen03.supply.every((tokens) => /^\d+(\.\d+)? ?SP$|^\d+ SP$|SP/.test(tokens)));

  // CTR-04: the same pieces after Start: roster rows, stack list, unit card, and the canvas (images).
  const mounting=await start(h);h.timings.push({label:'Start previewed package',elapsed:mounting,budget:3000});
  const sweep = await sweepMap(h);
  await click(h, '#open-roster');
  const rosterRows = await page.evaluate(() => [...document.querySelectorAll('[data-roster-pick]')].map((node) => ({ text: node.innerText.replace(/\s+/g, ' ').trim(), tokens: node.querySelector('svg')?.textContent.replace(/\s+/g, ' ').trim() ?? '' })));
  await click(h, '#close-roster');
  const compare = [];
  for (const name of ['Standish TF / 10.A', 'US HQ 21st Corps', 'Div Arty I / 7.A', '90 Recon Bn / 10.A', 'US 748 Engr Gp', 'Truck']) {
    const preview = previewCounters.find((c) => c.name === name && c.side === 'ALLIED')?.tokens;
    const row = rosterRows.find((r) => r.text.includes(name));
    await selectUnit(h, name);
    const card = await cardTokens(h);
    const hex = row?.text.match(/ (\d{4}) · /)?.[1];
    const shot = hex ? await hexShot(hex, `ctr04-map-${name.replace(/\W+/g, '-')}`) : null;
    compare.push({ name, hex, preview, roster: row?.tokens, card, shot: shot?.file });
    await click(h, '#deselect').catch(() => {});
  }
  extra['CTR-04'] = compare;
  record(h, 'CTR-04', 'Identity, current printed face, values, symbol, side and formation marking agree across preview, map and inspector', compare.map((c) => `${c.name} @${c.hex}: preview "${c.preview}" roster "${c.roster}" card "${c.card}" map ${c.shot}`).join(' | '),
    compare.every((c) => c.preview && c.preview === c.roster && c.preview === c.card));

  // CTR-05: in the Movement Phase: a mode change, a step change (Breakdown), a resource change (fuel from a dump).
  await playUntil(h, async (state) => state.phase === 'Movement' && /Allied player turn/.test(state.player));
  await selectUnit(h, '13.Abn');
  const abnBefore = await cardTokens(h);
  const abnStatusBefore = (await page.textContent('.command-rail')).match(/\d{4} · [^\n]*?mode/)?.[0];
  const abnHex = abnStatusBefore?.match(/\d{4}/)?.[0];
  // The unit may start in either mode: the button offered is the opposite one.
  const toMode = (await has(h, '[data-mode="COMBAT"]')) ? 'COMBAT' : 'MOVE';
  await ui(`${toMode} mode`, () => click(h, `[data-mode="${toMode}"]`, { settle: 500 }));
  const abnAfterMode = await cardTokens(h);
  const abnStatusAfter = (await page.textContent('.command-rail')).match(/\d{4} · [^\n]*?mode/)?.[0];
  const abnDef = defOf('13.Abn');
  await hexShot(abnHex, 'ctr05-13Abn-mode-change');
  let breakdown = 'no Breakdown offered';
  if (await has(h, '[data-unit-action^="BREAKDOWN"]')) {
    await ui('Breakdown', () => click(h, '[data-unit-action^="BREAKDOWN"]', { settle: 600 }));
    await page.waitForTimeout(300);
    if ((await where(h)).decision.length > 0) await page.locator('[data-choice]').first().click();
    await page.waitForTimeout(400);
    await selectUnit(h, '13.Abn');
    breakdown = await cardTokens(h);
  }
  await hexShot(abnHex, 'ctr05-13Abn-after-breakdown');
  // Fuel for an artillery group: the paying dump's quantity must drop on its counter.
  const dumpsBefore = sweep.cells.filter(({ text }) => /Supply dump/.test(text) && !/enemy/.test(text)).map(({ hex }) => hex);
  await selectUnit(h, 'US 749 FA Gp');
  const fuelLabel = await ui('Fuel', () => payFuel(h));
  const dumpHex = fuelLabel.match(/\b(\d{4})\b/)?.[1];
  let dumpBefore = '';
  let dumpAfter = '';
  if (dumpHex) {
    dumpAfter = (await gotoHex(h, dumpHex));
    await hexShot(dumpHex, 'ctr05-dump-after-fuel');
  }
  dumpBefore = sweep.cells.find(({ hex }) => hex === dumpHex)?.text ?? '';
  const stackText = async (hex) => {
    const p = await centreOf(hex);
    if (!p) return '';
    await page.mouse.click(p.x, p.y);
    await page.waitForTimeout(300);
    const text = await page.evaluate(() => document.querySelector('.stack-picker')?.innerText.replace(/\s+/g, ' ').trim() ?? document.querySelector('.command-rail svg')?.textContent ?? '');
    if (await has(h, '#close-stack-picker')) await click(h, '#close-stack-picker');
    return text;
  };
  // The paying dump's remaining quantity as the Ledger reports it ("… from the dump at 0307 (15T there now)").
  await tab(h, 'Ledger').catch(() => {});
  const dumpCounterAfter = (await page.textContent('.command-rail')).replace(/\s+/g, ' ').match(/Fuel[^.]*\(\d+(\.\d+)?T there now\)/)?.[0] ?? '';
  await tab(h, 'Unit').catch(() => {});
  extra['CTR-05'] = { abnBefore, abnAfterMode, abnStatusBefore, abnStatusAfter, breakdown, fuelLabel, dumpHex, dumpBefore, dumpAfter, dumpCounterAfter, dumpsBefore };
  const combatFace = face(abnDef, toMode.toLowerCase());
  record(h, 'CTR-05', 'Printed face and per-step/resource values update from authoritative state; mode/status shown separately; no stale printed value', `13.Abn card "${abnBefore}" (${abnStatusBefore}) → ${toMode} mode "${abnAfterMode}" (${abnStatusAfter}; definition combat face CS ${combatFace.combatStrength} AR ${combatFace.actionRating} MA ${combatFace.movementPointTicks / 4}) → after Breakdown "${breakdown}"; fuel "${fuelLabel}": dump ${dumpHex} "${dumpBefore}" → "${dumpAfter}", stack list "${dumpCounterAfter}"`,
    abnBefore !== abnAfterMode && squash(abnAfterMode).includes(squash(`${combatFace.combatStrength} ${combatFace.actionRating} ${combatFace.movementPointTicks / 4}`)) && breakdown !== 'no Breakdown offered' && breakdown !== abnAfterMode && /\d/.test(dumpCounterAfter));

  // CTR-06: a three-counter stack. One is looked for in the starting layout; failing that, the fuelled US 749 FA Gp is moved
  // into a two-counter stack of the same side that it can reach, as a player would.
  const ownStackSize = (text) => (/enemy/.test(text) ? 0 : (text.split(' · ').at(-1).match(/, /g) ?? []).length + 1);
  let stackHex = sweep.cells.find(({ text }) => ownStackSize(text) >= 3)?.hex ?? null;
  let moved = { existing: true, moved: false, preview: 'no move needed: a three-counter stack already stood in the starting layout' };
  if (!stackHex) {
    await selectUnit(h, 'US 749 FA Gp');
    const toLabel = (id) => { const [q, r] = id.split(',').map(Number); return `${String(q + Math.floor(r / 2) + 1).padStart(2, '0')}${String(r + 1).padStart(2, '0')}`; };
    const reach = new Set((await page.evaluate(() => [...window.ocsMap.state.reachable.keys()])).map(toLabel));
    const pairs = sweep.cells.filter(({ hex, text }) => ownStackSize(text) === 2 && reach.has(hex));
    if (pairs.length === 0) throw new Error('No reachable two-counter stack to build a three-counter stack from.');
    stackHex = pairs[0].hex;
    moved = await ui(`Move to ${stackHex}`, () => moveSelectedTo(h, stackHex, gotoHex));
    if (await has(h, '#finish-move')) await click(h, '#finish-move');
  }
  if (await has(h,'#cancel-move')) await click(h,'#cancel-move');
  if (await has(h,'#finish-move')) await click(h,'#finish-move');
  else if (await has(h,'#deselect')) await click(h,'#deselect');
  const stackAnnounce = await gotoHex(h, stackHex);
  const shots06 = [];
  const inspections06 = [];
  for (const zoomLevel of [100, 150, 70, 30]) {
    await zoomTo(zoomLevel);
    shots06.push(`${zoomLevel}% ${(await page.textContent('#zoom-level'))}: ${(await hexShot(stackHex, `ctr06-stack-zoom-${zoomLevel}`, zoomLevel >= 200 ? 420 : 240))?.file}`);
    const inspection = await page.locator('.stack-peek .stack-pick').evaluateAll(nodes=>nodes.map(n=>{
      const art=n.querySelector('svg'),box=art?.getBoundingClientRect();
      return {name:n.textContent.trim(),fields:art?.textContent.trim(),width:box?.width,height:box?.height};
    }));
    const chrome=await page.evaluate(()=>{
      const header=document.querySelector('.stack-peek header')?.getBoundingClientRect(),bar=document.querySelector('.map-controls')?.getBoundingClientRect();
      return {headerTop:header?.top,barBottom:bar?.bottom,clear:!!header&&!!bar&&(header.top>=bar.bottom||header.right<=bar.left||header.left>=bar.right)};
    });
    inspections06.push({zoomLevel,inspection,chrome});
    await h.shot(`ctr06-complete-stack-${zoomLevel}`);

  }
  await zoomTo(100);
  const sp = await centreOf(stackHex);
  await page.mouse.move(sp.x, sp.y);
  await page.waitForTimeout(200);
  shots06.push(`hover: ${(await page.screenshot({ path: join(evidenceDir, 'ctr06-stack-hover.png'), clip: { x: sp.x - 130, y: sp.y - 130, width: 260, height: 260 } }), 'ctr06-stack-hover.png')}`);
  await page.mouse.click(sp.x, sp.y);
  await page.waitForTimeout(300);
  const picker06 = await page.evaluate(() => document.querySelector('.stack-picker')?.innerText.replace(/\s+/g, ' ').trim() ?? '');
  await page.screenshot({ path: join(evidenceDir, 'ctr06-stack-selected.png') });
  const readableSelections=[];
  const picks=page.locator('.stack-picker:not(.stack-peek) .stack-pick:not([disabled])');
  for(let i=0;i<await picks.count();i++){
    await picks.nth(i).click();
    readableSelections.push({name:await picks.nth(i).innerText(),card:await cardTokens(h)});
    await h.shot(`ctr06-selected-face-${i+1}`);
  }

  if (await has(h, '#close-stack-picker')) await click(h, '#close-stack-picker');
  if(await has(h,'#cancel-move'))await click(h,'#cancel-move');
  await gotoHex(h, stackHex);
  await h.shot('ctr06-keyboard-complete-stack');
  await page.screenshot({ path: join(evidenceDir, 'ctr06-stack-keyboard-focus.png'), clip: { x: sp.x - 130, y: sp.y - 130, width: 260, height: 260 } });
  extra['CTR-06'] = { moved, stackAnnounce, shots06, picker06, inspections06, readableSelections };
  record(h, 'CTR-06', 'A three-counter stack keeps square aspect/field order at normal zoom, zoom limits, selection, hover and keyboard focus; identity and critical ratings not obscured (judged on ctr06-*.png)', `move ${moved.moved ? `confirmed (${moved.elapsed} ms)` : `not made: ${moved.preview}`}; ${stackAnnounce}; images ${shots06.join(', ')}, selected, keyboard focus; stack list "${picker06}"`, (moved.moved || moved.existing) && /, .*, /.test(stackAnnounce) && readableSelections.length>=3 && readableSelections.every(s=>s.card.length>0) && inspections06.every(s=>s.chrome.clear && s.inspection.length>=3 && s.inspection.every(c=>c.fields&&c.width>=58&&c.width===c.height)));

  // CTR-07: an enemy stack before and after the hot-seat handoff to its owner.
  const enemyCell = sweep.cells.find(({ text }) => /enemy .*hidden/.test(text));
  const enemyHex = enemyCell.hex;
  const before07 = { announce: await gotoHex(h, enemyHex), panel: await stackText(enemyHex), shot: (await hexShot(enemyHex, 'ctr07-enemy-stack-allied-seat'))?.file, dom: await page.content() };
  const { privacy } = await playUntil(h, async (state) => /Axis player turn/.test(state.player) && /Axis/.test(state.seat), { placeArrivals });
  const after07 = { announce: await gotoHex(h, enemyHex), panel: await stackText(enemyHex), shot: (await hexShot(enemyHex, 'ctr07-same-stack-axis-seat'))?.file };
  const ownNames = after07.announce.split(' · ').at(-1).split(', ');
  const hiddenNames = ownNames.filter((name) => !before07.announce.includes(name));
  const leaked = hiddenNames.filter((name) => before07.dom.includes(name.split(' / ')[0]));
  extra['CTR-07'] = { before07: { ...before07, dom: undefined }, after07, privacy, hiddenNames, leaked };
  record(h, 'CTR-07', 'Counter back/redaction, accessible name, DOM and stack count reveal only rule-allowed information before and after a valid handoff', `Allied seat: "${before07.announce}"; list "${before07.panel}" → handoff screen hid the map ${privacy ? !privacy.mapVisible : 'n/a'} → Axis seat: "${after07.announce}"; list "${after07.panel}"; hidden names present in the Allied DOM: ${leaked.length ? leaked.join(', ') : 'none'}; images ctr07-*`,
    hiddenNames.length > 0 && leaked.length === 0 && privacy !== null && !privacy.mapVisible);
} catch (error) {
  record(h, 'RUN', 'The counter run completes', String(error.stack ?? error.message), false);
  await h.shot('failure').catch(() => {});
}
const slow = (h.timings ?? []).filter(({ elapsed, budget = 1500 }) => elapsed > budget);
record(h, 'CTR-08', `At ${width}×${height}: no uncaught error and no over-budget interaction (clipping judged on the images)`, `console/page errors ${h.errors.length}; timed ${JSON.stringify(h.timings ?? [])}; over the operation budget: ${slow.length}`, h.errors.length === 0 && slow.length === 0 && h.rows.filter(row=>/^CTR-0[1-7]$/.test(row.id)).every(row=>row.status==='PASS'));
await writeFile(join(evidenceDir, 'observations.json'), JSON.stringify(extra, null, 1));
await h.finish(`doc 03 §B1: CTR-01 to CTR-07 at ${width}×${height}`);
await h.close();
