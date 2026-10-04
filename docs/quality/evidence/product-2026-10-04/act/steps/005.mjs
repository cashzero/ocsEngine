// ACT-02 MOVE_PIECE: Chap TF / 7.A (tracked, needs fuel 12.5): fuel the whole 7.A formation from a dump, then move it toward
// the enemy with the map cursor (Enter = click) and Confirm. Times: selection, fuel, move preview, confirm.
let t = Date.now();
await selectUnit(h, 'Chap TF');
const selectMs = Date.now() - t;
const needs = (await page.textContent('.command-rail')).replace(/\s+/g, ' ').match(/Needs fuel[^.]*\)|\d+ MP left · \d+ hexes reachable/)?.[0];
t = Date.now();
const paidFrom = await payFuel(h, 'FORMATION');
const fuelMs = Date.now() - t;
const afterFuel = (await page.textContent('.command-rail')).replace(/\s+/g, ' ').match(/[\d.]+ MP left · \d+ hexes reachable/)?.[0];
t = Date.now();
await gotoHex(h, '1206', { enter: true });
const previewMs = Date.now() - t;
const preview = await page.evaluate(() => document.querySelector('.move-preview, .move-popup, [class*=preview]')?.innerText.replace(/\s+/g, ' ').trim().slice(0, 300) ?? '');
await h.shot('act02-move-preview');
t = Date.now();
await click(h, '#confirm-move', { settle: 50 });
await page.waitForFunction(() => !document.querySelector('#confirm-move'), null, { timeout: 5000 });
const confirmMs = Date.now() - t;
await page.waitForTimeout(300);
const at = await gotoHex(h, '1206');
const from = await gotoHex(h, '0107');
const card = (await page.textContent('.command-rail')).replace(/\s+/g, ' ').slice(0, 300);
await tab(h, 'Log');
const log = (await textOf(h, '.command-rail')).slice(-300);
await h.shot('act02-moved');
record(h, 'ACT-02', 'Candidate list is bounded/responsive; counter changes Hex; movement usage and history update', `select Chap TF ${selectMs} ms ("${needs}"); fuel whole 7.A ${fuelMs} ms from "${paidFrom}" → "${afterFuel}"; Enter on 1206 → preview in ${previewMs} ms: "${preview.slice(0, 160)}"; Confirm ${confirmMs} ms; 1206 now "${at}", 0107 now "${from}"; card "${card.slice(0, 160)}"; Log tail "${log}"`,
  at.includes('Chap TF') && !from.includes('Chap TF') && Math.max(selectMs, previewMs) <= 1000 && Math.max(fuelMs, confirmMs) <= 1500);
return { selectMs, needs, paidFrom, fuelMs, afterFuel, previewMs, preview, confirmMs, at, from, card, log };
