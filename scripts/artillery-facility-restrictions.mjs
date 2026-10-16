import { readFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { click, gotoHex, has, newGame, open, record, tab, textOf, where } from './air-acceptance/harness.mjs';

const positions = resolve(process.argv[2] ?? 'artifacts/artillery-facility/positions');
const h = await open({ evidenceDir: process.argv[3] ?? 'artifacts/artillery-facility/restrictions', viewport: { width: Number(process.argv[4] ?? 1680), height: Number(process.argv[5] ?? 1050) } });
const facts = JSON.parse(await readFile(join(positions, 'facts.json'), 'utf8'));
try {
  await newGame(h, {
    ...facts.request.map, scale: facts.request.oob.scale, divisions: facts.request.oob.divisionsPerSide,
    armored: facts.request.oob.armoredDivisionsPerSide, air: 'STANDARD', transport: 'NONE', turnLimit: 3,
    seeds: facts.request.seeds, onSettings: () => h.page.selectOption('#new-game-sea', 'FLANK'),
  });
  for (const kind of ['movement', 'out-of-range', 'no-supply', 'hex-used', 'unit-used', 'other-gun-ready', 'other-target-ready']) {
    await click(h, '#open-menu');
    const [chooser] = await Promise.all([h.page.waitForEvent('filechooser'), click(h, '#load-game')]);
    await chooser.setFiles(join(positions, `${kind}.json`));
    await h.page.waitForTimeout(500);
    const loaded = await textOf(h, '.deck-notice');
    if (!/Save loaded/.test(loaded)) throw new Error(`Could not load ${kind}: ${loaded}`);
    if (await has(h, '#close-utility')) await click(h, '#close-utility');
    if (await h.page.locator('[data-deck-tab]', { hasText: /^\s*Targets(?:\s|$)/u }).count()) await tab(h, 'Targets');
    if (kind === 'other-gun-ready' || kind === 'other-target-ready') {
      const hex = kind === 'other-gun-ready' ? facts.target : facts.alternateTarget;
      const hint = await textOf(h, '.deck-objective');
      const target = h.page.locator(`[data-target-hex="${hex}"]`);
      const offered = await target.count() > 0;
      if (offered) {
        await target.click();
        await h.page.waitForSelector('#barrage-target');
      }
      const draft = await has(h, '#barrage-target');
      const allowed = draft && !await h.page.locator('#declare-draft').isDisabled();
      record(h, 'ACT-19', `${kind} keeps the remaining legal artillery attack operable without a global blocker`, JSON.stringify({ hint, offered, draft, allowed }), offered && draft && allowed && !/No legal artillery/.test(hint));
      await h.shot(kind);
      if (draft) await click(h, '#cancel-draft');
      continue;
    }
    const highlighted = await h.page.evaluate((target) => window.ocsMap.state.barrage.has(target), facts.target);
    const offered = await has(h, `[data-target-hex="${facts.target}"]`);
    const hint = await textOf(h, '.deck-objective');
    const targets = await textOf(h, '.deck-context');
    const required = {
      'out-of-range': /outside artillery range/i,
      'no-supply': /insufficient barrage supply/i,
      'hex-used': /target hex already barraged/i,
      'unit-used': /artillery already fired/i,
    }[kind];
    await gotoHex(h, facts.targetLabel, { enter: true });
    const draft = await has(h, '#barrage-target');
    const observed = { state: await where(h), highlighted, offered, draft, hint, targets, panel: await textOf(h, '.command-rail') };
    const reasonMatches = !required || required.test(hint) && required.test(targets);
    record(h, 'ACT-19', `${kind} prevents artillery fire on ${facts.targetLabel} and both hints name its actual cause`, JSON.stringify(observed), !highlighted && !offered && !draft && reasonMatches);
    await h.shot(kind);
  }
  record(h, 'ACT-19', 'No browser errors while the UI enforces restrictions', JSON.stringify(h.errors), h.errors.length === 0);
} catch (error) {
  record(h, 'ACT-19', 'Artillery restrictions can be exercised through the UI', String(error.stack ?? error), false);
  await h.shot('failure').catch(() => {});
}
await h.finish('Artillery facility restrictions through the mounted game');
const failed = h.rows.some((row) => row.status !== 'PASS');
await h.close();
if (failed) process.exitCode = 1;
