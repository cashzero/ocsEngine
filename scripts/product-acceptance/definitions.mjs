// Reference data for the counter rows (CTR-02 to CTR-04): the generated definitions of sampled pieces in the NG-07 package,
// read from the built generator with the same request the New Game form sends. This is the "reviewed definition" side of the
// comparison; the counters themselves are read from the page.
const engine = await import(new URL('../../dist/index.js', import.meta.url));

export const NG07_REQUEST = (() => {
  const base = engine.DEFAULT_NEW_GAME_REQUEST;
  return { ...base, map: { ...base.map, style: 'WESTERN_EUROPE', width: 18, height: 12 }, oob: { ...base.oob, scale: 'LARGE', divisionsPerSide: 4, armoredDivisionsPerSide: 2 }, turnLimit: 3, seeds: { map: 91001, oob: 91002, deployment: 91003, rules: 91004 } };
})();

export const definitionsByName = (request = NG07_REQUEST) => {
  const prepared = engine.prepareNewGame(request);
  if (!prepared.ok) throw new Error(JSON.stringify(prepared.error));
  return { definitions: prepared.value.scenario.pieceCatalog.definitions, pieces: prepared.value.scenario.initialPieceState.pieces };
};

if (import.meta.url === `file:///${process.argv[1].replaceAll('\\', '/')}`) {
  const { definitions } = definitionsByName();
  for (const name of process.argv.slice(2)) console.log('====', name, JSON.stringify(definitions.find((d) => d.name.includes(name)), null, 0).slice(0, 2500));
}
