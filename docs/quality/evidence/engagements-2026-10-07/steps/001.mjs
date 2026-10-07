await page.waitForTimeout(500);
await openNewGame(h);
const options = await page.evaluate(() => [...document.querySelectorAll('#new-game-engagement option')].map((o) => `${o.value}=${o.textContent.trim()}${o.selected ? ' (selected)' : ''}`));
const help = await page.evaluate(() => document.querySelector('#new-game-engagement')?.closest('fieldset')?.querySelector('.field-help')?.textContent.trim());
await h.shot('scn01-dialog-meeting');
return { options, help, errors: h.errors };
