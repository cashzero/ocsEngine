// Why is End disabled? Read the state, the deck and the tabs.
await h.shot('end-disabled');
return { w: await where(h), tabs: await page.evaluate(() => [...document.querySelectorAll('[data-deck-tab]')].map((n) => n.textContent.trim())), deck: (await page.textContent('.command-rail')).replace(/\s+/g, ' ').slice(0, 1200) };
