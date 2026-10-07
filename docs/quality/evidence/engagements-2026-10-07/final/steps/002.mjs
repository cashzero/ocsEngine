// Axis attack: preview, start, the attacker has the screen and acts first.
await configure(h, { engagement: 'AXIS_ATTACKS' });
const gen = await generate(h);
const sig = await previewSignature(h);
const text = await page.evaluate(() => document.querySelector('.preview-engagement')?.textContent.trim());
await h.shot('f02-axis-attack-preview');
const ms = await start(h);
const at = await where(h);
const summary = await menuSummary(h);
// Every objective is the defender's at the start: the map's keyboard sweep announces each objective hex.
const swept = await sweepMap(h);
const objectiveCells = swept.cells.filter((cell) => /objective/.test(cell.text)).map((cell) => cell.text);
await h.shot('f02-axis-attack-started');
return { status: gen.state.status, metrics: sig.metrics, text, startMs: ms, at, summary, objectives: objectiveCells.length, objectiveSample: objectiveCells.slice(0, 3) };
