// AIR-OM5: the Axis attack shows the off-map airfield and its aircraft on the Axis map edge.
await page.waitForTimeout(500);
await openNewGame(h);
await configure(h, { engagement: 'AXIS_ATTACKS' });
await generate(h);
const help = await page.evaluate(() => document.querySelector('.preview-engagement')?.textContent.trim());
const forces = await page.evaluate(() => [...document.querySelectorAll('.preview-force')].map((node) => node.querySelector('header strong')?.textContent + ': ' + [...node.querySelectorAll('summary')].map((s) => s.textContent.replace(/\s+/g, ' ').trim()).filter((t) => /Air/.test(t)).join(' / ')));
await h.shot('o01-preview');
await start(h);
const swept = await sweepMap(h);
const field = swept.cells.find((cell) => /off-map airfield/i.test(cell.text));
state.fieldHex = field?.hex;
if (field) await gotoHex(h, field.hex, { enter: true });
await page.waitForTimeout(400);
const deck = await deckText(h);
await h.shot('o01-airfield-selected');
return { help, forces, field: field?.text, deck: deck.slice(0, 900), at: await where(h) };
