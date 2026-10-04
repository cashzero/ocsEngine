// ACT-05 PLACE_REINFORCEMENT: select the first arrival, try a hex that is not an entry hex (keyboard Enter on 0808), then
// click an offered entry hex chip. The Log and the roster must show the unit at that hex.
const rows = page.locator('.arrivals .deck-unit[data-piece]');
const before = await rows.count();
const name = (await rows.first().innerText()).split('\n').map((s) => s.trim()).filter(Boolean).find((s) => /[A-Za-z]{3}/.test(s));
await rows.first().click();
await page.waitForTimeout(300);
const chips = await page.evaluate(() => [...document.querySelectorAll('.hex-chips [data-target-hex]')].map((n) => n.textContent.trim()));
const announceEntry = chips.length ? await gotoHex(h, chips[0]) : '';
await gotoHex(h, '0808', { enter: true });
const afterWrong = { arrivals: await rows.count(), notice: (await where(h)).notice };
await h.shot('act05-arrival-selected');
// Re-select (a click elsewhere may have cleared it) and place on the first chip.
if ((await page.locator('.hex-chips [data-target-hex]').count()) === 0) { await rows.first().click(); await page.waitForTimeout(300); }
const t = Date.now();
await page.locator('.hex-chips [data-target-hex]').first().click();
await page.waitForFunction((n) => document.querySelectorAll('.arrivals .deck-unit[data-piece]').length < n, before, { timeout: 5000 });
const elapsed = Date.now() - t;
await page.waitForTimeout(300);
const placedAt = await gotoHex(h, chips[0]);
await tab(h, 'Log');
const log = await textOf(h, '.command-rail');
await h.shot('act05-placed');
const ok = afterWrong.arrivals === before && placedAt.includes(name.split(' / ')[0]) && elapsed <= 1500;
record(h, 'ACT-05', 'An off-map reinforcement is placed only on a legal entry Hex', `"${name}": entry hexes offered ${chips.join(', ')} (cursor: "${announceEntry}"); Enter on non-entry 0808 left ${afterWrong.arrivals}/${before} arrivals waiting (notice "${afterWrong.notice}"); clicking ${chips[0]} placed it in ${elapsed} ms → "${placedAt}"; Log: "${log.slice(0, 300)}"`, ok);
return { name, chips, afterWrong, elapsed, placedAt, log: log.slice(0, 600) };
