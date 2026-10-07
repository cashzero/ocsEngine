await configure(h, { engagement: 'AXIS_ATTACKS' });
const help = await page.evaluate(() => document.querySelector('#new-game-engagement')?.closest('fieldset')?.querySelector('.field-help')?.textContent.trim());
const gen = await generate(h);
const sig = await previewSignature(h);
const text = await page.evaluate(() => document.querySelector('.preview-engagement')?.textContent.trim());
const stacks = await page.evaluate(() => ({ allied: document.querySelectorAll('.preview-deployment.owner-1').length, axis: document.querySelectorAll('.preview-deployment.owner-2').length, objectives: document.querySelectorAll('.preview-objective').length }));
await h.shot('scn02-axis-attack-preview');
return { help, status: gen.state.status, ms: gen.elapsed, metrics: sig.metrics, text, stacks, sides: sig.sides, warnings: sig.warnings };
