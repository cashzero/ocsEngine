// AIR-OM5 follow-up: in the Barrage Segment the hint names the Air Barrage when only aircraft can barrage.
await page.waitForTimeout(500);
await openNewGame(h);
await configure(h, { engagement: 'AXIS_ATTACKS' });
await generate(h);
await start(h);
await click(h, '#end-phase', { settle: 500 });
if (/Press again/.test((await where(h)).end)) await click(h, '#end-phase', { settle: 600 });
const hint = await page.evaluate(() => document.querySelector('.command-rail')?.innerText.split('\n').slice(0, 3).join(' | ') ?? '');
await h.shot('o20-barrage-hint');
return { at: await where(h), hint };
