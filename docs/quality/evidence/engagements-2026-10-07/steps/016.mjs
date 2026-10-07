await openNewGame(h);
const gen = await generate(h);
const preview = await previewSignature(h);
await click(h, '#close-new-game');
const swept = await sweepMap(h);
const mismatches = swept.cells.map((cell, index) => ({ hex: cell.hex, mounted: cell.terrain, preview: preview.terrain[index], text: cell.text }))
  .filter(({ mounted, preview: p }) => `terrain-${mounted}` !== p);
const kinds = {};
for (const m of mismatches) kinds[`${m.mounted}→${m.preview}`] = (kinds[`${m.mounted}→${m.preview}`] ?? 0) + 1;
return { status: gen.state.status, cells: swept.cells.length, previewCells: preview.terrain.length, kinds, sample: mismatches.slice(0, 6) };
