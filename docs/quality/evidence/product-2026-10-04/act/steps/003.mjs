// Correct the ACT-05 row's unit name (step 002 read the echelon "III" as the name); the observation itself is unchanged.
const row = h.rows.find((r) => r.id === 'ACT-05');
row.observed = row.observed.replace('"III"', '"US 652 FA Gp"');
// Place the remaining arrival (the supply dump) and end the Reinforcement Phase.
await placeArrivals(h);
await click(h, '#end-phase', { settle: 600 });
const w = await where(h);
// ACT-03 CHANGE_MODE: 82.Abn to Reserve (also prepares ACT-04).
await selectUnit(h, '82.Abn');
const before = { card: await cardTokens(h), text: (await page.textContent('.command-rail')).replace(/\s+/g, ' ').slice(0, 200), modes: await page.evaluate(() => [...document.querySelectorAll('[data-mode]')].map((n) => n.textContent.trim())) };
const t = Date.now();
await click(h, '[data-mode="RESERVE"]', { settle: 100 });
await page.waitForFunction(() => /Reserve/.test(document.querySelector('.command-rail')?.textContent ?? ''), null, { timeout: 5000 });
const elapsed = Date.now() - t;
const after = { card: await cardTokens(h), text: (await page.textContent('.command-rail')).replace(/\s+/g, ' ').slice(0, 260) };
await h.shot('act03-reserve');
const announce = await gotoHex(h, '0104');
await tab(h, 'Log');
const log = (await textOf(h, '.command-rail')).slice(-400);
record(h, 'ACT-03', 'Counter/detail mode and history update; illegal modes are absent or explained', `82.Abn offered modes ${before.modes.join(', ')}; before "${before.text.slice(0, 120)}"; Reserve pressed → ${elapsed} ms → "${after.text.slice(0, 160)}"; card tokens ${before.card} → ${after.card}; map cursor "${announce}"; Log tail "${log}"`, /Reserve/.test(after.text) && /Reserve|reserve/.test(log) && elapsed <= 1500);
return { w, before, after, elapsed, log };
