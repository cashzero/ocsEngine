import { open, newGame, click, advanceTo, where, gotoHex, settleDecisions, placeArrivals, has } from './air-acceptance/harness.mjs';
const h = await open({ evidenceDir: 'docs/quality/evidence/roster-arrivals-2026-10-13/run3' });
const check = (ok, message) => { h.rows.push({ expectation: message, status: ok ? 'PASS' : 'FAIL' }); h.note(`${ok ? 'PASS' : 'FAIL'} ${message}`); if (!ok) throw new Error(message); };
const roster = async () => {
  const began = Date.now();
  await click(h, '#open-roster', { settle: 0 });
  await h.page.fill('#roster-search', '');
  await h.page.waitForTimeout(50);
  h.timings.push({ label: 'Open roster and clear search', elapsed: Date.now() - began });
  return h.page.evaluate(() => ({
    header: document.querySelector('.roster-popup header strong').textContent,
    button: document.querySelector('#open-roster').textContent,
    rows: [...document.querySelectorAll('[data-roster-pick]')].map(n => ({ id: n.dataset.rosterPick, text: n.innerText })),
  }));
};
try {
  await newGame(h, { width: 32, height: 24, divisions: 6, armored: 2, air: 'NONE', seeds: { map: 9121, oob: 9122, deployment: 9123, rules: 9124 }, onPreview: async text => { h.note(text); await h.shot('first-preview'); } });
  await h.shot('first-started');
  await newGame(h, { width: 18, height: 12, style: 'EASTERN_EUROPE', divisions: 3, armored: 1, engagement: 'ALLIED_ATTACKS', air: 'STANDARD', seeds: { map: 9131, oob: 9132, deployment: 9133, rules: 9134 }, onPreview: async text => { h.note(text); await h.shot('second-preview'); } });
  await h.shot('second-started');
  await advanceTo(h, s => s.phase === 'Movement' && s.player.startsWith('Allied'));
  const before = await roster(); h.note(JSON.stringify(before));
  check(!before.rows.some(r => /off map/i.test(r.text)), 'Turn 1 roster has no reinforcement-box rows');
  check(before.rows.some(r => /off-map airfield/i.test(r.text)), 'Serving off-map aircraft remain in the roster');
  check(Number(before.header.match(/\d+$/)[0]) === before.rows.length, 'Roster count matches visible serving units');
  await h.shot('turn1-roster');
  // Operate a legal move from a visible roster row and a highlighted map hex.
  let moved = false;
  for (const row of before.rows.filter(r => /Move mode/.test(r.text))) {
    await click(h, `[data-roster-pick="${row.id}"]`);
    if (await has(h, '.fuel-panel [data-unit-action]')) await click(h, '.fuel-panel [data-unit-action]');
    const dest = await h.page.evaluate(() => [...window.ocsMap.state.reachable.keys()][0]);
    if (dest) {
      const [q,r] = dest.split(',').map(Number);
      const label = `${String(q + Math.floor(r/2)+1).padStart(2,'0')}${String(r+1).padStart(2,'0')}`;
      await gotoHex(h, label, { enter: true }); await click(h, '#confirm-move'); await settleDecisions(h);
      h.note(`Legal move: ${row.text.replace(/\n/g,' ')} → ${label}`); await h.shot('legal-move'); moved = true; break;
    }
    await roster();
  }
  check(moved, 'A legal move operated through the UI');
  await advanceTo(h, s => /Turn 2/.test(s.turn) && s.player.startsWith('Allied') && s.phase === 'Reinforcement', { limit: 160 });
  h.note(`Whole Turn 1 completed: ${JSON.stringify(await where(h))}`);
  const arrivals = await h.page.locator('.arrivals .deck-unit[data-piece]').evaluateAll(nodes => nodes.map(n => ({ id: n.dataset.piece, text: n.innerText })));
  check(arrivals.length > 0, 'Turn 2 Arrivals contains reinforcements');
  const pending = await roster();
  for (const row of arrivals) check(!pending.rows.some(r => r.id === row.id), `Awaiting entry ${row.id} absent from roster`);
  await h.page.fill('#roster-search', 'replacements');
  check(await h.page.locator('[data-roster-pick]').count() === 0, 'Searching replacements does not expose waiting arrivals');
  await h.shot('waiting-arrivals-search');
  await click(h, '#close-roster');
  await placeArrivals(h);
  const entered = await roster();
  for (const row of arrivals.filter(r => !/Supply dump/.test(r.text))) check(entered.rows.some(r => r.id === row.id), `Entered ${row.id} visible in roster`);
  check(entered.rows.length > pending.rows.length, 'Serving count grows after entry');
  check(Number(entered.header.match(/\d+$/)[0]) === entered.rows.length, 'Header count matches roster after entry');
  await h.shot('arrivals-entered');
  const selectable = arrivals.find(row => entered.rows.some(r => r.id === row.id));
  await click(h, `[data-roster-pick="${selectable.id}"]`);
  check(await h.page.locator('.roster-popup').count() === 0, 'Entered reinforcement selectable from roster');
  await h.shot('entered-selected');
  check(h.errors.length === 0, 'No browser console/page errors');
  await h.finish('All units reinforcement entry acceptance');
} catch (e) { h.note(String(e)); await h.shot('failure'); await h.finish('All units reinforcement entry acceptance'); throw e; }
finally { await h.close(); }
