import { join } from 'node:path';
import { open, advanceTo, selectUnit, tab, click, textOf, has, record, where, gotoHex } from './air-acceptance/harness.mjs';
import { openNewGame, configure, generate, previewSignature, start, deckText, sha, moveSelectedTo } from './product-acceptance/lib.mjs';
const h = await open({ evidenceDir: process.argv[2] ?? join('artifacts/garrison-supply-2026-10-13/isolated-vp') });
try {
  const options = { engagement: 'AXIS_ATTACKS', style: 'EASTERN_EUROPE', width: 24, height: 16, scale: 'COMPACT', divisions: 3, armored: 1, air: 'NONE', turnLimit: 3,
    seeds: { map: 14, oob: 8802, deployment: 8803, rules: 8804 } };
  h.note(`Inputs: ${JSON.stringify(options)}`);
  await openNewGame(h); await configure(h, options);
  const generated = await generate(h); h.note(`Generate: ${JSON.stringify(generated)}`);
  h.timings.push({ label: 'generate', elapsed: generated.elapsed });
  const signature = await previewSignature(h);
  h.note(`Preview: ${JSON.stringify({ metrics: signature.metrics, terrainHash: sha(signature.terrain), deploymentHash: sha(signature.deployment), warnings: signature.warnings })}`);
  await h.shot('preview');
  h.timings.push({ label: 'start', elapsed: await start(h) });
  await h.shot('started');
  await advanceTo(h, (s) => s.player.startsWith('Allied') && s.phase === 'Supply');
  await tab(h, 'Supply');
  h.note(await deckText(h));
  const feed = h.page.locator('[data-feed]');
  const offered = await feed.allTextContents();
  record(h, 'GS-FEED', 'Isolated VP garrisons have an available feeding payment', offered.join(' | '), offered.length > 0);
  await h.shot('supply-before');
  if (offered.length > 0) {
    const before = await h.page.locator('.supply-need').count();
    const ownStock = feed.filter({ hasText: 'Feed from 1T at 1015' }).first();
    await ownStock.click(); await h.page.waitForTimeout(400);
    const after = await h.page.locator('.supply-need').count();
    record(h, 'GS-CONSUME', 'Feeding from the 1T emergency stock removes one garrison from the unfed list', `${before} → ${after}`, after === before - 1);
    const stockRemains = (await h.page.locator('[data-feed]').allTextContents()).some((text) => /1T at 1015/.test(text));
    record(h, 'GS-STOCK', 'The consumed 1T stock is no longer offered', `${stockRemains}`, !stockRemains);
    if (await has(h, '[data-feed]')) {
      await h.page.locator('[data-feed]').filter({ hasText: 'Feed from 1T at 1214' }).first().click();
      await h.page.waitForTimeout(400);
    }
    h.note(await deckText(h));
    await h.shot('supply-after');
  }
  await advanceTo(h, (s) => s.turn.startsWith('Turn 2'));
  record(h, 'GS-TURN', 'The same generated package reaches Turn 2 through legal supply payments and handoffs', JSON.stringify(await where(h)), true);
  await h.shot('turn2');
  if ((await where(h)).decision.length > 0) {
    await h.page.locator('[data-choice]').first().click(); await h.page.waitForTimeout(400);
    record(h, 'GS-DECISION', 'The next first-player decision resolves through its visible choice', JSON.stringify(await where(h)), (await where(h)).decision.length === 0);
  }
  await advanceTo(h, (s) => s.turn.startsWith('Turn 2') && s.player.startsWith('Allied') && s.phase === 'Movement');
  await selectUnit(h, 'Truck'); await tab(h, 'Unit');
  const fetch = await moveSelectedTo(h, '0813', gotoHex);
  h.note(`Truck to rear dump: ${JSON.stringify(fetch)}`);
  if (!fetch.moved) throw new Error('Truck cannot reach the rear dump in Turn 2.');
  const load = h.page.locator('.transfer-row').filter({ has: h.page.locator('[data-transfer="LOAD"]') }).first();
  await load.locator('.transfer-tokens').fill('1');
  await load.locator('[data-transfer="LOAD"]').click(); await h.page.waitForTimeout(350);
  h.note(await textOf(h, '.transport-panel')); await h.shot('truck-loaded');
  const delivery = await moveSelectedTo(h, '1015', gotoHex);
  h.note(`Truck to isolated VP: ${JSON.stringify(delivery)}`);
  if (!delivery.moved) throw new Error('Loaded truck cannot reach the VP with its remaining MP.');
  const unload = h.page.locator('.transfer-row').filter({ has: h.page.locator('[data-transfer="UNLOAD"]') });
  await unload.locator('.transfer-tokens').fill('1');
  await unload.locator('[data-transfer="UNLOAD"]').click(); await h.page.waitForTimeout(350);
  record(h, 'GS-DELIVERY', 'A truck loads existing rear supply, moves to the isolated VP and unloads 1T', await textOf(h, '.transport-panel'), true);
  await h.shot('truck-delivered');
  await advanceTo(h, (s) => s.turn.startsWith('Turn 2') && s.player.startsWith('Allied') && s.phase === 'Supply');
  await tab(h, 'Supply');
  const delivered = h.page.locator('[data-feed]').filter({ hasText: 'Feed from 1T at 1015' }).first();
  await delivered.waitFor({ state: 'visible' });
  const beforeResupply = await h.page.locator('.supply-need').count();
  await delivered.click(); await h.page.waitForTimeout(350);
  record(h, 'GS-RESUPPLY', 'After its emergency stock is exhausted, the VP garrison can eat delivered supply',
    `${beforeResupply} → ${await h.page.locator('.supply-need').count()}`, (await h.page.locator('.supply-need').count()) === beforeResupply - 1);
  await h.shot('resupplied');
  record(h, 'GS-ERRORS', 'No console or page errors', `${h.errors.length}`, h.errors.length === 0);
} catch (error) {
  record(h, 'GS-FLOW', 'Isolated objective supply flow is operable', String(error.stack), false);
  await h.shot('failure');
}
await h.finish('Garrison emergency supply UI');
await h.close();
process.exitCode = h.rows.some(({ status }) => status !== 'PASS') ? 1 : 0;
