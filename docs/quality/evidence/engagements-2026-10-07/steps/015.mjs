// Default meeting engagement: the preview and the mounted game agree (NG-06 continuity) with the new, closer deployment.
await openNewGame(h);
await configure(h, { engagement: 'MEETING' });
const gen = await generate(h);
const preview = await previewSignature(h);
const help = await page.evaluate(() => document.querySelector('.preview-engagement')?.textContent.trim());
await h.shot('scn15-meeting-preview');
await start(h);
const summary = await menuSummary(h);
const swept = await sweepMap(h);
const occupied = swept.cells.filter((cell) => !/no units$/.test(cell.text)).length;
const terrainMismatch = swept.cells.filter((cell, index) => `terrain-${cell.terrain}` !== preview.terrain[index]).length;
await h.shot('scn15-meeting-mounted');
return { status: gen.state.status, metrics: preview.metrics, help, summary, mounted: { size: `${swept.width}×${swept.height}`, occupied, terrainMismatch }, at: await where(h) };
