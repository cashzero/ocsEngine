await page.waitForTimeout(500);
await openNewGame(h);
await configure(h, { engagement: 'AXIS_ATTACKS' });
const gen = await generate(h);
const layout = await page.evaluate(() => {
  const r = (s) => { const e = document.querySelector(s); if (!e) return null; const b = e.getBoundingClientRect(); return [Math.round(b.top), Math.round(b.bottom)]; };
  return { map: r('.operation-map-wrap'), text: r('.preview-engagement'), metrics: r('.operation-metrics'), forces: r('.preview-forces') };
});
await h.shot('scn04-axis-attack-preview-fixed');
return { status: gen.state.status, layout };
