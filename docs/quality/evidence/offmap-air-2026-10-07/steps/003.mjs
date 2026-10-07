const at = await where(h);
const deckTabs = await tabs(h);
const deck = await deckText(h);
const buttons = await page.evaluate(() => [...document.querySelectorAll('[data-air-mission]')].map((b) => `${b.dataset.airMission}${b.disabled ? ' (disabled)' : ''}`));
await h.shot('o03-barrage-segment');
return { at, deckTabs, buttons, deck: deck.slice(0, 1200) };
