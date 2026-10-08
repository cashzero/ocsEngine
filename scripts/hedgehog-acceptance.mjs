// NG-13 (docs/quality/03-product-operation-verification-plan.md, docs/roadmap/14-hedgehogs-wbs.md): hedgehogs operated through
// the real page in a real browser. Every step is a click, a key or a selection on the page; every observation is read from it.
//   npm run build && node scripts/hedgehog-acceptance.mjs [evidence-dir]
import { join } from 'node:path';
import { advanceTo, click, endPhase, gotoHex, handoff, has, hexDistance, newGame, open, record, tab, textOf, where } from './air-acceptance/harness.mjs';

const evidenceDir = process.argv[2] ?? join('docs', 'quality', 'evidence', 'hedgehogs-2026-10-08');
const h = await open({ evidenceDir });
const { page } = h;
const seeds = { map: 8801, oob: 8802, deployment: 8803, rules: 8804 };
const ROW = 'NG-13';

/** Hedgehog counters the map draws, with their Level and hex, as the active seat sees them. */
const mapHedgehogs = () => page.evaluate(() => window.ocsMap.state.counters
  .map(({ label }) => label.match(/^(Enemy )?Hedgehog Level (\d), hex (\d{4})$/u))
  .filter(Boolean).map(([, enemy, level, hex]) => ({ enemy: !!enemy, level: Number(level), hex })));
const unitText = () => textOf(h, '.command-rail');
const hedgehogButtons = () => page.evaluate(() => [...document.querySelectorAll('.unit-actions')]
  .filter((block) => block.querySelector('strong')?.textContent.trim() === 'Hedgehog')
  .flatMap((block) => [...block.querySelectorAll('button')].map((button) => button.textContent.replace(/\s+/g, ' ').trim())));
/** Rows of the roster ("All units") by their accessible names. */
const rosterRows = async () => {
  await click(h, '#open-roster');
  const names = await page.evaluate(() => [...document.querySelectorAll('[data-roster-pick]')].map((node) => node.getAttribute('aria-label') ?? ''));
  await page.keyboard.press('Escape');
  await page.waitForTimeout(150);
  return names;
};
const pickRow = async (index) => {
  await click(h, '#open-roster');
  await page.locator('[data-roster-pick]').nth(index).click();
  await page.waitForTimeout(300);
};
/** The first own roster row whose Unit tab offers a Hedgehog action matching `wanted`. */
const findHedgehogAction = async (wanted, skip = () => false) => {
  const names = await rosterRows();
  for (const [index, name] of names.entries()) {
    if (skip(name)) continue;
    await pickRow(index);
    await tab(h, 'Unit').catch(() => {});
    const buttons = await hedgehogButtons();
    const match = buttons.find((text) => wanted.test(text));
    if (match) return { index, name, button: match, buttons };
  }
  return null;
};
const pressHedgehog = async (text) => {
  const started = Date.now();
  await page.locator('.unit-actions button', { hasText: text.slice(0, 40) }).first().click();
  await page.waitForTimeout(500);
  return Date.now() - started;
};

try {
  let preview = '';
  await newGame(h, { engagement: 'AXIS_ATTACKS', width: 24, height: 16, scale: 'COMPACT', divisions: 3, armored: 1, air: 'NONE', turnLimit: 3, seeds, onPreview: (text) => { preview = text; } });
  h.note(`New Game: Axis attack, 24×16, Compact, 3 divisions (1 armored), no air forces (the attacker's off-map air comes with the situation), 3 turns, seeds ${JSON.stringify(seeds)}`);
  // The help under the Situation choice, as the preview showed it before Start.
  const help = preview.match(/[^.]*dug into hedgehogs[^;]*;/u)?.[0]?.trim() ?? '';
  record(h, ROW, 'The New Game help names the defender\'s hedgehogs and their Levels', help || preview.slice(0, 300),
    /hedgehogs on its objectives \(Level 2\) and on key rail towns and road junctions \(Level 1\)/u.test(help));
  await h.shot('started');

  // Turn 1 opens with the attacker (Axis). It sees every Allied garrison dug in, with the Level on the counter (4.9a).
  await handoff(h);
  const axisView = await mapHedgehogs();
  record(h, ROW, 'The attacker sees the defender\'s hedgehogs with their Level on the map', `${axisView.length} enemy hedgehogs: ${axisView.map(({ level, hex }) => `L${level}@${hex}`).join(' ')}`,
    axisView.length > 0 && axisView.every(({ enemy }) => enemy) && axisView.some(({ level }) => level === 2) && axisView.some(({ level }) => level === 1));
  await h.shot('attacker-sees-hedgehogs');

  // Hand over to the defender's Movement Phase.
  await advanceTo(h, (state) => state.player.startsWith('Allied') && state.phase === 'Movement');
  const allied = await mapHedgehogs();
  record(h, ROW, 'The defender sees the same hedgehogs as its own', `${allied.length} own hedgehogs`, allied.length === axisView.length && allied.every(({ enemy }) => !enemy));

  // 16.0b: dig in with one RE of Combat Mode units that have not moved (2 SP).
  const dig = await findHedgehogAction(/^Build a Level 1 hedgehog at/u, (name) => /Hedgehog|Supply dump|Truck/u.test(name));
  record(h, ROW, 'A unit\'s Unit tab offers digging in with its cost, dumps and crew', dig ? `${dig.name}: "${dig.button}"` : 'no unit offered it', !!dig && /2 SP from .+; crew .+ cannot move this phase/u.test(dig.button));
  if (dig) {
    const site = dig.button.match(/at (\d{4})/u)[1];
    await h.shot('dig-in-offered');
    const elapsed = await pressHedgehog(dig.button);
    const state = await where(h);
    const after = await mapHedgehogs();
    record(h, ROW, 'Digging in puts a Level 1 hedgehog on the map at once', `notice "${state.notice}" (${elapsed} ms); map ${after.filter(({ hex }) => hex === site).map(({ level }) => `L${level}`).join(' ') || 'none'} at ${site}`,
      after.some(({ hex, level }) => hex === site && level === 1));
    await tab(h, 'Ledger').catch(() => {});
    const ledger = await unitText();
    record(h, ROW, 'The supply ledger shows the 8T (2 SP) paid', ledger.match(/\d+T paid/u)?.[0] ?? ledger.slice(0, 160), /\b8T paid|\b\d+T paid/u.test(ledger));
    await h.shot('dug-in');
  }

  // 13.8d: an HQ in Combat Mode builds one within 2 hexes through its Construction plan.
  const names = await rosterRows();
  const hqIndex = names.findIndex((name) => /\bHQ\b/u.test(name));
  if (hqIndex >= 0) {
    await pickRow(hqIndex);
    await tab(h, 'Unit').catch(() => {});
    if (await has(h, '[data-mode="COMBAT"]')) await click(h, '[data-mode="COMBAT"]');
    const offered = await has(h, '#plan-construction');
    const label = offered ? await textOf(h, '#plan-construction') : '';
    record(h, ROW, 'An Engineer-Capable HQ offers to build a hedgehog within 2 hexes', `${names[hqIndex]}: ${label || 'no Construction section'}`, /hedgehog/u.test(label));
    if (offered) {
      await click(h, '#plan-construction');
      const hexes = await page.evaluate(() => [...document.querySelectorAll('.hex-chips [data-target-hex]')].map((node) => node.textContent.trim()));
      let built = false;
      for (const hex of hexes) {
        await page.locator('.hex-chips [data-target-hex]', { hasText: hex }).first().click();
        await page.waitForTimeout(250);
        const options = await page.evaluate(() => [...document.querySelectorAll('[data-build-facility]')].map((node) => `${node.dataset.buildFacility}: ${node.textContent.replace(/\s+/g, ' ').trim()}`));
        const option = options.find((text) => text.startsWith('HEDGEHOG:'));
        if (!option) continue;
        record(h, ROW, 'The Construction plan prices the hedgehog at 8T (2 SP)', `${hex}: ${options.join(' | ')}`, /8T \(2 SP\)/u.test(option));
        await h.shot('engineer-hedgehog-option');
        await click(h, '[data-build-facility="HEDGEHOG"]');
        const after = await mapHedgehogs();
        record(h, ROW, 'The engineer\'s hedgehog appears on the map', after.filter((entry) => entry.hex === hex).map(({ level }) => `L${level}@${hex}`).join(' ') || `none at ${hex}`, after.some((entry) => entry.hex === hex));
        built = true;
        break;
      }
      if (!built) record(h, ROW, 'The engineer can build a hedgehog in one of its hexes', `${hexes.length} hexes, none offered a hedgehog`, false);
    }
  } else {
    record(h, ROW, 'An HQ exists to test engineer construction', 'no HQ in the roster', false);
  }

  // The rest of the Game Turn; Turn 2 starts with the attacker again (first-player roll), whoever moves first.
  await advanceTo(h, (state) => state.turn.startsWith('Turn 2'));
  const turn2 = await where(h);
  record(h, ROW, 'Game Turn 1 ends and Turn 2 begins', `${turn2.turn}, ${turn2.player}, ${turn2.phase}`, turn2.turn.startsWith('Turn 2'));

  // 16.0c: in the defender's next Movement Phase the crew that dug in reduces its own hedgehog, which is removed below Level 1.
  await advanceTo(h, (state) => state.turn.startsWith('Turn 2') && state.player.startsWith('Allied') && state.phase === 'Movement');
  const reduce = await findHedgehogAction(/^Reduce the hedgehog at/u, (name) => /Supply dump|Truck/u.test(name));
  record(h, ROW, 'A unit in a hedgehog hex offers reducing it, free, with the crew named', reduce ? `${reduce.name}: "${reduce.button}"` : 'not offered', !!reduce && /\((no SP; crew .+|engineer work, no SP; .+) cannot move/u.test(reduce.button));
  if (reduce) {
    const site = reduce.button.match(/at (\d{4})/u)[1];
    const expected = reduce.button.match(/to Level (\d)/u)?.[1];
    await h.shot('reduce-offered');
    await pressHedgehog(reduce.button);
    const after = await mapHedgehogs();
    const at = after.filter(({ hex }) => hex === site);
    record(h, ROW, `The reduced hedgehog at ${site} ${expected ? `shows Level ${expected}` : 'is removed'} on the map`, at.map(({ level }) => `L${level}`).join(' ') || 'no hedgehog', expected ? at.some(({ level }) => level === Number(expected)) : at.length === 0);
    await h.shot('reduced');
  }

  // Attack a hedgehog: in the Axis Movement Phase move a unit next to an Allied hedgehog, then plan the attack in Combat.
  await advanceTo(h, (state) => state.player.startsWith('Axis') && state.phase === 'Movement');
  const targets = (await mapHedgehogs()).map(({ hex }) => hex);
  const axisRows = await rosterRows();
  let attacker = null;
  for (const [index, name] of axisRows.entries()) {
    if (!/,/.test(name) || /HQ|Truck|Supply|Arty|Art\b/u.test(name)) continue;
    await pickRow(index);
    if (await has(h, '[data-fuel-method="SINGLE_UNIT"]')) {
      await click(h, '[data-fuel-method="SINGLE_UNIT"]');
      const option = page.locator('.fuel-panel [data-unit-action]').first();
      if (await option.count()) { await option.click(); await page.waitForTimeout(400); }
    }
    const reach = await page.evaluate(() => [...window.ocsMap.state.reachable.keys()].map((id) => {
      const [q, r] = id.split(',').map(Number);
      return `${String(q + Math.floor(r / 2) + 1).padStart(2, '0')}${String(r + 1).padStart(2, '0')}`;
    }));
    const destination = reach.find((hex) => targets.some((target) => hexDistance(hex, target) === 1));
    if (!destination) continue;
    await gotoHex(h, destination, { enter: true });
    if (!(await has(h, '#confirm-move'))) continue;
    await click(h, '#confirm-move', { settle: 500 });
    attacker = { name, destination, target: targets.find((target) => hexDistance(destination, target) === 1) };
    break;
  }
  record(h, ROW, 'An attacking unit can reach a hex next to a hedgehog', attacker ? `${attacker.name} to ${attacker.destination}, next to ${attacker.target}` : 'none could', !!attacker);
  if (attacker) {
    await advanceTo(h, (state) => state.player.startsWith('Axis') && state.phase === 'Combat' && !state.phase.includes('Barrage'), { limit: 20 });
    await gotoHex(h, attacker.destination, { enter: true });
    await gotoHex(h, attacker.target, { enter: true });
    const sheet = await page.evaluate(() => document.querySelector('.combat-facts')?.innerText.replace(/\s+/g, ' ').trim() ?? '');
    const hedgehogLine = sheet.match(/Hedgehog Level \d: −\d combat roll, −1 Surprise, Heavy AT/u)?.[0] ?? '';
    record(h, ROW, 'The attack sheet names the hedgehog\'s −Level combat DRM, −1 Surprise and Heavy AT', hedgehogLine || sheet.slice(0, 220) || 'no attack sheet', hedgehogLine.length > 0);
    await h.shot('attack-sheet');
    if (await has(h, '#declare-draft')) {
      await click(h, '#declare-draft', { settle: 400 });
      for (let guard = 0; guard < 30; guard += 1) {
        await handoff(h);
        const state = await where(h);
        if (state.decision.length === 0) break;
        await page.locator('[data-choice]').first().click();
        await page.waitForTimeout(300);
      }
      const summary = await page.evaluate(() => document.querySelector('.combat-summary')?.innerText.replace(/\s+/g, ' ').trim()
        ?? document.querySelector('.feed-entry, .history-entry')?.innerText.replace(/\s+/g, ' ').trim() ?? '');
      h.note(`attack resolved: ${summary}`);
      await h.shot('attack-resolved');
    }
  }
  await endPhase(h).catch(() => {});
  record(h, ROW, 'No browser console or page error during the run', `${h.errors.length} errors`, h.errors.length === 0);
} catch (error) {
  record(h, ROW, 'The scenario completes', String(error.message), false);
  await h.shot('failure').catch(() => {});
}
await h.finish('NG-13 Hedgehogs');
await h.close();
process.exitCode = h.rows.some((row) => row.status !== 'PASS') ? 1 : 0;
