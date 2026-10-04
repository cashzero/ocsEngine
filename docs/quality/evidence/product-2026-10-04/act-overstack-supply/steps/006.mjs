// Which hexes does the Trace Supply overlay leave uncovered? Sample the map canvas at each hex centre with the overlay on and
// off (a read of the page); a hex whose colour does not change is outside trace coverage.
await click(h, '#deselect').catch(() => {});
const points = await screenHexes(h, { step: 26 });
const sample = () => page.evaluate((pts) => {
  const canvas = document.querySelector('#hex-map');
  const rect = canvas.getBoundingClientRect();
  const sx = canvas.width / rect.width; const sy = canvas.height / rect.height;
  const ctx = canvas.getContext('2d');
  return Object.fromEntries(pts.map(([label, p]) => {
    // Sample a point a little above the centre-left, away from a counter's printed values.
    const x = Math.round((p.x - rect.left - 18) * sx); const y = Math.round((p.y - rect.top - 18) * sy);
    const d = ctx.getImageData(x, y, 1, 1).data;
    return [label, [d[0], d[1], d[2]]];
  }));
}, [...points]);
if (!(await page.isChecked('#toggle-trace-coverage'))) await page.check('#toggle-trace-coverage');
await page.waitForTimeout(600);
const on = await sample();
await page.uncheck('#toggle-trace-coverage');
await page.waitForTimeout(600);
const off = await sample();
await page.check('#toggle-trace-coverage');
const uncovered = Object.keys(on).filter((label) => on[label].every((v, i) => Math.abs(v - off[label][i]) < 4)).sort();
state.uncovered = uncovered;
await h.shot('trace-coverage-turn2');
return { hexes: points.size, uncovered };
