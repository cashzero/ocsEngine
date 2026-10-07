// SCN-R7 on the final build: the three situations, their help text, and the Allied attack preview.
await page.waitForTimeout(500);
await openNewGame(h);
const options = await page.evaluate(() => [...document.querySelectorAll('#new-game-engagement option')].map((o) => `${o.value}=${o.textContent.trim()}${o.selected ? ' (selected)' : ''}`));
const helpOf = () => page.evaluate(() => document.querySelector('#new-game-engagement')?.closest('fieldset')?.querySelector('.field-help')?.textContent.trim());
const meetingHelp = await helpOf();
await configure(h, { engagement: 'ALLIED_ATTACKS' });
const alliedHelp = await helpOf();
const gen = await generate(h);
const sig = await previewSignature(h);
const fits = await page.evaluate(() => [...document.querySelectorAll('.operation-metrics div')].every((d) => d.scrollHeight <= d.clientHeight + 1));
const objectivesOwned = await page.evaluate(() => document.querySelectorAll('.preview-objective').length);
await h.shot('f01-allied-attack-preview');
return { options, meetingHelp, alliedHelp, status: gen.state.status, ms: gen.elapsed, metrics: sig.metrics, fits, objectivesOwned, errors: h.errors };
