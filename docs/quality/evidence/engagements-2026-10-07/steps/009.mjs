await openNewGame(h);
await configure(h, { engagement: 'AXIS_ATTACKS' });
const gen = await generate(h);
const sig = await previewSignature(h);
const fits = await page.evaluate(() => [...document.querySelectorAll('.operation-metrics div')].every((d) => d.scrollHeight <= d.clientHeight + 1));
await h.shot('scn09-axis-attack-preview');
return { status: gen.state.status, metrics: sig.metrics, fits };
