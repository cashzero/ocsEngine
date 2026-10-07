// AIR-OM5 (off-map box): no airfield or aircraft on the map; where the player sees them; a mission from the box.
await page.waitForTimeout(500);
await openNewGame(h);
await configure(h, { engagement: 'AXIS_ATTACKS' });
await generate(h);
const forces = await page.evaluate(() => [...document.querySelectorAll('.preview-force')].map((node) => node.querySelector('header strong')?.textContent + ': ' + [...node.querySelectorAll('summary')].map((s) => s.textContent.replace(/\s+/g, ' ').trim()).filter((t) => /Air/.test(t)).join(' / ')));
await start(h);
const swept = await sweepMap(h);
const onMap = swept.cells.filter((cell) => /airfield|Ju\.88|Bf\.109|Fw-190/i.test(cell.text)).map((cell) => cell.text);
await click(h, '#open-roster');
await page.waitForTimeout(300);
const roster = await page.evaluate(() => [...document.querySelectorAll('[data-roster-pick]')].map((n) => n.textContent.replace(/\s+/g, ' ').trim()).filter((t) => /Ju\.88|Bf\.109|Fw-190|airfield/i.test(t)));
await h.shot('b01-roster');
await click(h, '#close-roster');
const deckTabs = await tabs(h);
await h.shot('b01-started');
return { forces, onMap, roster, deckTabs, at: await where(h) };
