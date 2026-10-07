// AIR-OM5: the aircraft are Inactive after the mission; in Axis's next Aircraft Refit Phase the off-map airfield refits all of them, no SP.
const before = await page.evaluate(() => document.querySelector('#hex-map ~ [aria-live], [aria-live].visually-hidden')?.textContent ?? '');
const result = await playUntil(h, async (s) => /Refit/i.test(s.phase) && /Axis/.test(s.player) && /Turn 2/.test(s.turn), { limit: 240, placeArrivals });
const panel = await page.evaluate(() => document.querySelector('.air-panel')?.innerText.replace(/\n+/g, ' | ') ?? '');
await h.shot('o05-refit-panel');
const refitted = await refitAll(h);
await page.waitForTimeout(400);
const after = await page.evaluate(() => document.querySelector('.air-panel')?.innerText.replace(/\n+/g, ' | ') ?? '');
await h.shot('o05-refitted');
return { before, at: result.state, panel, refitted, after, notice: (await where(h)).notice };
