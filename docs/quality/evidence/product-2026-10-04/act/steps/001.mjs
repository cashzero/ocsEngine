// New Game: a 16×12 contact map (2 divisions per side, 1 armored, 2 turns, seeds 7101–7104), generated and started.
await openNewGame(h);
await configure(h, { width: 16, height: 12, scale: 'COMPACT', divisions: 2, armored: 1, turnLimit: 2, seeds: { map: 7101, oob: 7102, deployment: 7103, rules: 7104 } });
const g = await generate(h);
const mount = await start(h);
state.sweep0 = await sweepMap(h);
await h.shot('start');
return { generate: g.elapsed, mount, where: await where(h), occupied: state.sweep0.cells.filter(({ text }) => !/no units$/.test(text)).map(({ text }) => text) };
