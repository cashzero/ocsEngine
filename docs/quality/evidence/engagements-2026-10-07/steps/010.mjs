const ms = await start(h);
const at = await where(h);
const summary = await menuSummary(h);
await h.shot('scn10-started');
return { ms, at, summary };
