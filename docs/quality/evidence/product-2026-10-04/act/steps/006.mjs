// Look for overrun targets (ACT-08): select each mechanized unit and read the deck tabs and target chips it offers.
const out = {};
for (const name of ['Brown TF', 'Chap TF', '87 Recon Bn']) {
  await selectUnit(h, name);
  const tabs = await page.evaluate(() => [...document.querySelectorAll('[data-deck-tab]')].map((n) => n.textContent.trim()));
  let chips = [];
  if (tabs.some((t) => /Targets/.test(t))) { await tab(h, 'Targets'); chips = await page.evaluate(() => [...document.querySelectorAll('[data-target-hex]')].map((n) => n.textContent.trim())); }
  out[name] = { tabs, chips, card: (await page.textContent('.command-rail')).replace(/\s+/g, ' ').slice(90, 240) };
}
return out;
