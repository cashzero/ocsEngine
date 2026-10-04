// The phase track (the popup under the phase name) and the whole Log so far: where is the Supply Phase?
await page.hover('.phase-picker');
await page.waitForTimeout(300);
const track = await page.evaluate(() => [...document.querySelectorAll('.phase-track li')].map((n) => `${n.textContent.replace(/\s+/g, ' ').trim()}${n.className ? ` [${n.className}]` : ''}`));
await h.shot('phase-track');
await page.mouse.move(5, 500);
await tab(h, 'Log');
const log = await page.evaluate(() => [...document.querySelectorAll('.deck-event')].map((n) => n.innerText.replace(/\s+/g, ' ').trim()));
return { track, supplyLines: log.filter((l) => /[Ss]upply/.test(l)), count: log.length };
