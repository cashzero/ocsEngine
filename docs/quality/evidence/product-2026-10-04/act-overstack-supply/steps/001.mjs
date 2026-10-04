// NG-07 package; place arrivals; Movement Phase; fuel 10.A and 7.A (whole formations); read stacks and the Trace Supply overlay.
await openNewGame(h);
await configure(h, { style: 'MEDITERRANEAN_COAST', width: 18, height: 12, scale: 'LARGE', divisions: 4, armored: 2, turnLimit: 3, seeds: { map: 91001, oob: 91002, deployment: 91003, rules: 91004 } });
await generate(h);
await start(h);
await tab(h, 'Arrivals');
await placeArrivals(h);
await click(h, '#end-phase', { settle: 600 });
const fuel = {};
for (const unit of ['Standish TF', 'Brown TF']) { await selectUnit(h, unit); fuel[unit] = await payFuel(h, 'FORMATION'); }
await click(h, '#deselect').catch(() => {});
const sweep = await sweepMap(h);
state.sweep = sweep;
await page.check('#toggle-trace-coverage');
await page.waitForTimeout(800);
await h.shot('trace-coverage');
return { w: await where(h), fuel, own: sweep.cells.filter(({ text }) => !/no units$/.test(text) && !/enemy/.test(text)).map(({ text }) => text) };
