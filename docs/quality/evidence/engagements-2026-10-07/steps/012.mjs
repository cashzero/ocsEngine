await openNewGame(h);
await configure(h, { engagement: 'AXIS_ATTACKS' });
await generate(h);
const ms = await start(h);
const at = await where(h);
await h.shot('scn12-started-axis-first');
return { ms, at };
