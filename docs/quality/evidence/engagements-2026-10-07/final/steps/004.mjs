// Finish Game Turn 1 the plain way: end each step, take the first option of every decision, place arrivals, hand the
// screen over when the hot seat asks. Record the phases seen and the hand-over screen.
const seen = [];
const started = Date.now();
const result = await playUntil(h, async (state) => {
  const key = `${state.turn} | ${state.player} | ${state.phase}`;
  if (seen.at(-1) !== key) seen.push(key);
  return /Turn 2/.test(state.turn);
}, { limit: 200, placeArrivals });
await h.shot('scn14-turn2');
return { ms: Date.now() - started, privacy: result.privacy, at: result.state, seen };
