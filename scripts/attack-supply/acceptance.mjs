// Attack supply declared with the attack (9.5, 12.4, 12.10a, 12.10c), operated through the real page in a real browser.
// Every step is a click, a key or a file chosen on the page; every observation is read from the page.
//   npm run build && node scripts/attack-supply/make-saves.mjs && node scripts/attack-supply/acceptance.mjs [evidence-dir]
// Part A: a fresh New Game, played to the first attack, which is declared and resolved, then on to the next Game Turn.
// Part B: test positions (tmp/attack-supply) where the SP in reach covers one attacker only, and where one attacker is Exhausted.
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { advanceTo, click, endPhase, gotoHex, handoff, has, hexDistance, newGame, open, record, textOf, timed, where } from '../air-acceptance/harness.mjs';

const evidenceDir = process.argv[2] ?? join('docs', 'quality', 'evidence', 'attack-supply-2026-10-09');
const h = await open({ evidenceDir });
const { page } = h;
const ROW = 'CMB-SUP';
const units = JSON.parse(await readFile('tmp/attack-supply/units.json', 'utf8'));

/** The attack plan's unit rows as the deck shows them: ticked, disabled, name and the supply line or choices. */
const planRows = () => page.evaluate(() => [...document.querySelectorAll('.combat-draft .participant-row')].map((row) => {
  const box = row.querySelector('[data-participant]');
  const supply = row.querySelector('.attack-supply');
  return {
    id: box?.dataset.participant ?? '', checked: !!box?.checked, disabled: !!box?.disabled,
    name: row.querySelector('.participant span')?.innerText.replace(/\s+/g, ' ').trim() ?? '',
    supply: supply?.tagName === 'SELECT' ? [...supply.options].map((option) => `${option.selected ? '[x] ' : ''}${option.textContent.trim()}`).join(' | ')
      : supply?.innerText.replace(/\s+/g, ' ').trim() ?? '',
  };
}));
/** Every row's box agrees with its payment order: numbered rows are ticked, the others are not. */
const boxesAgree = (rows) => rows.every((row) => row.checked === /^\d+\. /u.test(row.name));
const rowsText = (rows) => rows.map((row) => `${row.checked ? '☑' : row.disabled ? '⊘' : '☐'} ${row.name} — ${row.supply}`).join('; ');
/** A plan row by unit name; a ticked row's name carries its payment order ("2. "), and every row its hex. */
const rowOf = (rows, name) => rows.find((row) => row.name.replace(/^\d+\. /u, '').startsWith(name));
const toggle = async (name) => {
  const row = rowOf(await planRows(), name);
  if (!row) throw new Error(`No plan row for ${name}`);
  await page.locator(`[data-participant="${row.id}"]`).click();
  await page.waitForTimeout(300);
};
/** Printed hex label of an engine hex ID ("q,r"), as presenter.ts prints it. */
const printed = (id) => { const [q, r] = id.split(',').map(Number); return `${String(q + Math.floor(r / 2) + 1).padStart(2, '0')}${String(r + 1).padStart(2, '0')}`; };
/** Printed hexes holding enemy units, as the map labels its counters for the active seat. */
const enemyHexes = () => page.evaluate(() => [...new Set(window.ocsMap.state.counters
  .map(({ label }) => label.match(/^Enemy (?!Hedgehog)(?!.*(?:Supply|dump|Truck)).*, hex (\d{4})$/u)?.[1]).filter(Boolean))]);
/**
 * In the attacker's Movement Phase, move up to `count` combat units next to one enemy hex, as a player does: pick the
 * unit in the roster, pay single-unit fuel when asked, move the cursor to a reachable hex beside the target, confirm.
 */
const closeIn = async (count) => {
  const enemies = await enemyHexes();
  await click(h, '#open-roster');
  const names = await page.evaluate(() => [...document.querySelectorAll('[data-roster-pick]')].map((node) => node.getAttribute('aria-label') ?? node.textContent ?? ''));
  await page.keyboard.press('Escape');
  let target = null;
  const moved = [];
  for (const [index, name] of names.entries()) {
    if (moved.length >= count) break;
    if (/HQ|Truck|Supply|dump|Arty|Art\b|Hedgehog|Brkdwn/u.test(name)) continue;
    await click(h, '#open-roster');
    await page.locator('[data-roster-pick]').nth(index).click();
    await page.waitForTimeout(300);
    if (await has(h, '[data-fuel-method="SINGLE_UNIT"]')) {
      await click(h, '[data-fuel-method="SINGLE_UNIT"]');
      const option = page.locator('.fuel-panel [data-unit-action]').first();
      if (await option.count()) { await option.click(); await page.waitForTimeout(400); }
    }
    const reach = await page.evaluate(() => [...window.ocsMap.state.reachable.keys()].map((id) => {
      const [q, r] = id.split(',').map(Number);
      return `${String(q + Math.floor(r / 2) + 1).padStart(2, '0')}${String(r + 1).padStart(2, '0')}`;
    }));
    const goals = target ? [target] : enemies;
    const destination = reach.find((hex) => goals.some((enemy) => hexDistance(hex, enemy) === 1));
    if (!destination) continue;
    await gotoHex(h, destination, { enter: true });
    if (!(await has(h, '#confirm-move'))) continue;
    await click(h, '#confirm-move', { settle: 500 });
    target ??= goals.find((enemy) => hexDistance(destination, enemy) === 1);
    moved.push(`${name.split(',')[0]} → ${destination}`);
  }
  return { target, moved };
};
const loadSave = async (file) => {
  await click(h, '#open-menu');
  const [chooser] = await Promise.all([page.waitForEvent('filechooser'), page.click('#load-game')]);
  await chooser.setFiles(file);
  await page.waitForFunction(() => document.querySelector('.deck-notice')?.textContent?.includes('Save loaded'), null, { timeout: 30000 });
  await page.keyboard.press('Escape').catch(() => {});
  await page.waitForTimeout(400);
  await handoff(h);
};
/** After Declare: every prompt until the combat resolves, with the seat that answered. */
const resolveCombat = async () => {
  const prompts = [];
  for (let guard = 0; guard < 30; guard += 1) {
    const handed = (await has(h, '#begin-required-handoff')) || (await has(h, '#complete-handoff'));
    await handoff(h);
    const state = await where(h);
    if (state.decision.length === 0) break;
    const prompt = await textOf(h, '.decision-panel h2');
    prompts.push({ seat: state.seat, handed, prompt, options: state.decision });
    await page.locator('[data-choice]').first().click();
    await page.waitForTimeout(300);
  }
  return prompts;
};
const attackerPrompt = (prompts, attackerSeat) => prompts.find(({ seat, prompt, options }) => seat === attackerSeat && (/combat supply/iu.test(prompt) || options.some((option) => /internal stocks/iu.test(option) && !/Defenders/u.test(option))));
/** The unit card's supply line after selecting the unit through the roster. */
const unitCard = async (name) => {
  await click(h, '#open-roster');
  await page.locator('[data-roster-pick]', { hasText: name }).first().click();
  await page.waitForTimeout(300);
  return textOf(h, '.command-rail');
};

try {
  // ─── Part A: a fresh New Game, to the first attack, then the next Game Turn ───────────────────────────────────────
  const seeds = { map: 9101, oob: 9102, deployment: 9103, rules: 9104 };
  await newGame(h, { engagement: 'AXIS_ATTACKS', width: 20, height: 14, scale: 'COMPACT', divisions: 3, armored: 1, air: 'NONE', turnLimit: 3, seeds });
  h.note(`Part A New Game: Axis attack, 20×14, Compact, 3 divisions (1 armored), no air, 3 turns, seeds ${JSON.stringify(seeds)}`);
  await advanceTo(h, (state) => state.player.startsWith('Axis') && state.phase === 'Movement', { limit: 60 });
  const approach = await closeIn(3);
  h.note(`Part A Axis Movement: ${approach.moved.join('; ') || 'nothing could close in'}${approach.target ? `, next to ${approach.target}` : ''}`);
  const combat = await advanceTo(h, async (state) => state.phase === 'Combat' && (await page.evaluate(() => window.ocsMap.state.attack.size)) > 0
    || state.turn.startsWith('Turn 3'), { limit: 60 });
  const targets = await page.evaluate(() => [...window.ocsMap.state.attack]);
  record(h, ROW, 'A fresh New Game reaches a Combat Segment with an attack target', `${combat.turn}, ${combat.player}, ${combat.phase}; ${targets.length} targets`, targets.length > 0);
  if (targets.length > 0) {
    const attackerSeat = combat.seat;
    // The target with most eligible attackers makes the order matter most.
    let best = null;
    for (const target of targets.slice(0, 12)) {
      await gotoHex(h, printed(target), { enter: true });
      const rows = await planRows();
      if (!best || rows.length > best.rows.length) best = { target, rows };
      if (await has(h, '#cancel-draft')) await click(h, '#cancel-draft');
    }
    const { value: rows, elapsed } = await timed(h, 'open attack plan', async () => { await gotoHex(h, printed(best.target), { enter: true }); return planRows(); });
    h.note(`Part A plan for ${printed(best.target)} (${elapsed} ms): ${rowsText(rows)}`);
    const ticked = rows.filter(({ checked }) => checked);
    record(h, ROW, 'Each ticked attacker shows its declared combat supply in the plan before Declare', rowsText(ticked),
      ticked.length > 0 && ticked.every(({ supply }) => /from the dump|Internal stocks/u.test(supply)));
    // 12.10a: with SP in reach a unit is not offered internal stocks.
    const withDump = ticked.filter(({ supply }) => /from the dump/u.test(supply));
    record(h, ROW, 'A unit with SP in reach is not offered internal stocks', rowsText(withDump), withDump.every(({ supply }) => !/Internal stocks/u.test(supply)));
    const untickedNote = rows.filter(({ checked }) => !checked);
    if (untickedNote.length > 0) h.note(`unticked: ${rowsText(untickedNote)}`);
    await h.shot('fresh-game-attack-plan');
    await click(h, '#declare-draft', { settle: 400 });
    const prompts = await resolveCombat();
    h.note(`Part A prompts after Declare: ${prompts.map(({ seat, handed, prompt }) => `${seat}${handed ? ' (after hand-over)' : ''}: ${prompt}`).join(' / ') || 'none'}`);
    const asked = attackerPrompt(prompts, attackerSeat);
    record(h, ROW, 'After Declare the attacker is not asked for its supply again', asked ? `asked: ${asked.prompt}` : `${prompts.length} prompts, none to the attacker about supply`, !asked);
    const ledger = await page.evaluate(() => document.querySelector('.combat-summary')?.innerText.replace(/\s+/g, ' ').trim() ?? '');
    h.note(`Part A combat summary: ${ledger}`);
    await h.shot('fresh-game-attack-resolved');
    const next = await advanceTo(h, (state) => state.turn.startsWith('Turn 2') || state.turn.startsWith('Turn 3'), { limit: 200 });
    record(h, ROW, 'The Game Turn with the attack finishes', `${next.turn}, ${next.player}, ${next.phase}`, true);
  }

  // ─── Part B1: the SP in reach covers one attacker only ─────────────────────────────────────────────────────────
  // The page accepts saves of its loaded scenario only: reload it, which boots the default New Game the saves were made from.
  await page.goto(page.url());
  await page.waitForSelector('#open-menu', { timeout: 30000 });
  await loadSave('tmp/attack-supply/save-short.json');
  const b1 = await where(h);
  h.note(`Part B1 loaded: ${b1.turn}, ${b1.player}, ${b1.phase}; attackers ${units.first} and ${units.second} in 1612 with a 1T dump, ${units.defender} in 1712`);
  await gotoHex(h, '1712', { enter: true });
  const opened = await planRows();
  h.note(`B1 plan as opened: ${rowsText(opened)}`);
  // Start from nothing ticked, then tick in a known order.
  for (const row of opened.filter(({ checked }) => checked)) await toggle(row.name.replace(/^\d+\. /u, '').replace(/ \d{4}$/u, ''));
  await toggle(units.first);
  const afterFirst = await planRows();
  record(h, ROW, 'The first ticked unit draws the 1T in reach; internal stocks are not offered to it (12.10a)', rowsText(afterFirst),
    /from the dump at 1612/u.test(rowOf(afterFirst, units.first)?.supply ?? '') && !/Internal/u.test(rowOf(afterFirst, units.first)?.supply ?? ''));
  record(h, ROW, 'The unticked unit shows it would have to use internal stocks', rowOf(afterFirst, units.second)?.supply ?? '',
    /^Would use: Internal stocks \(marked Low\)$/u.test(rowOf(afterFirst, units.second)?.supply ?? ''));
  await toggle(units.second);
  const both = await planRows();
  const sheet = await page.evaluate(() => document.querySelector('.combat-facts')?.innerText.replace(/\s+/g, ' ').trim() ?? '');
  record(h, ROW, 'Ticked second, it declares internal stocks; the plan says one unit is on internal stocks', `${rowsText(both)}; ${sheet.match(/Your supply cost[^A-Z]*?(?=$|[A-Z][a-z]+ [a-z])/u)?.[0] ?? sheet}`,
    /^Supply: Internal stocks \(marked Low\)$/u.test(rowOf(both, units.second)?.supply ?? '') && /1 on internal stocks/u.test(sheet) && boxesAgree(both));
  await h.shot('short-first-dump-second-internal');
  // Untick the first: the second now reaches the 1T, so it must draw it and loses the internal option.
  await toggle(units.first);
  const swapped = await planRows();
  record(h, ROW, 'Unticking the first moves the 1T to the second, whose internal option disappears', rowsText(swapped),
    /from the dump at 1612/u.test(rowOf(swapped, units.second)?.supply ?? '') && !/Internal/u.test(rowOf(swapped, units.second)?.supply ?? '') && boxesAgree(swapped));
  await toggle(units.first);
  const reordered = await planRows();
  record(h, ROW, 'Ticked again, the first unit comes second and is left internal stocks only', rowsText(reordered),
    /^2\. /u.test(rowOf(reordered, units.first)?.name ?? '') && /^Supply: Internal stocks/u.test(rowOf(reordered, units.first)?.supply ?? '') && boxesAgree(reordered));
  await h.shot('short-reordered');
  const { elapsed: declareMs } = await timed(h, 'declare B1', () => click(h, '#declare-draft', { settle: 400 }));
  const b1Prompts = await resolveCombat();
  h.note(`B1 prompts after Declare (${declareMs} ms): ${b1Prompts.map(({ seat, handed, prompt }) => `${seat}${handed ? ' (after hand-over)' : ''}: ${prompt}`).join(' / ') || 'none'}`);
  record(h, ROW, 'After Declare the attacker is not asked for its supply; the defender decides after a hand-over', b1Prompts.map(({ seat, prompt }) => `${seat}: ${prompt}`).join(' / '),
    !attackerPrompt(b1Prompts, b1.seat) && b1Prompts.some(({ seat, handed }) => seat !== b1.seat && handed));
  await h.shot('short-resolved');
  // 4.9a: only the owner sees internal stocks, so look when the screen is the Allied seat's again.
  await advanceTo(h, (state) => state.seat === b1.seat && state.decision.length === 0 && !state.handoff && !state.complete, { limit: 80 });
  const firstCard = await unitCard(units.first);
  const secondCard = await unitCard(units.second);
  record(h, ROW, 'The unit that used internal stocks is marked Low; the one that drew SP is not', `${units.first}: ${firstCard.match(/Internal stocks \w+/u)?.[0] ?? 'no marker'}; ${units.second}: ${secondCard.match(/Internal stocks \w+/u)?.[0] ?? 'no marker'}`,
    /Internal stocks Low/u.test(firstCard) && !/Internal stocks/u.test(secondCard));
  await h.shot('short-low-marker');

  // ─── Part B2: the second attacker's internal stocks are Exhausted ───────────────────────────────────────────────
  await loadSave('tmp/attack-supply/save-exhausted.json');
  await gotoHex(h, '1712', { enter: true });
  for (const row of (await planRows()).filter(({ checked }) => checked)) await toggle(row.name.replace(/^\d+\. /u, '').replace(/ \d{4}$/u, ''));
  await toggle(units.first);
  const blocked = await planRows();
  const blockedRow = rowOf(blocked, units.second);
  record(h, ROW, 'With the 1T taken, the Exhausted unit cannot be ticked and the plan says why (12.10c)', rowsText(blocked),
    !!blockedRow?.disabled && /Exhausted \(12\.10c\)/u.test(blockedRow?.supply ?? ''));
  await h.shot('exhausted-blocked');
  await toggle(units.first);
  await toggle(units.second);
  await toggle(units.first);
  const exhaustedFirst = await planRows();
  record(h, ROW, 'Ticked first, the Exhausted unit draws the 1T and the other uses internal stocks', rowsText(exhaustedFirst),
    /from the dump at 1612/u.test(rowOf(exhaustedFirst, units.second)?.supply ?? '') && /^Supply: Internal stocks/u.test(rowOf(exhaustedFirst, units.first)?.supply ?? '') && boxesAgree(exhaustedFirst));
  await h.shot('exhausted-first');
  await click(h, '#declare-draft', { settle: 400 });
  const b2Prompts = await resolveCombat();
  record(h, ROW, 'The attack declares and resolves without asking the attacker for supply', b2Prompts.map(({ seat, prompt }) => `${seat}: ${prompt}`).join(' / '),
    !attackerPrompt(b2Prompts, 'seat:allied') && b2Prompts.length > 0);
  // Finish this Game Turn from the test position.
  const done = await advanceTo(h, (state) => state.turn.startsWith('Turn 2'), { limit: 200 });
  record(h, ROW, 'Game Turn 1 of the test position ends', `${done.turn}, ${done.player}, ${done.phase}`, done.turn.startsWith('Turn 2'));
  await endPhase(h).catch(() => {});
  record(h, ROW, 'No browser console or page error during the run', h.errors.join(' | ') || '0 errors', h.errors.length === 0);
} catch (error) {
  record(h, ROW, 'The scenario completes', String(error.stack ?? error.message), false);
  await h.shot('failure').catch(() => {});
}
await h.finish('Attack supply declared with the attack (9.5, 12.10a)');
await h.close();
process.exitCode = h.rows.some((row) => row.status !== 'PASS') ? 1 : 0;
