// Move one Axis (attacker) combat unit toward the defender through the roster, the fuel panel and the map cursor.
await click(h, '#open-roster');
const rows = await page.evaluate(() => [...document.querySelectorAll('[data-roster-pick]')].map((node) => node.textContent.replace(/\s+/g, ' ').trim()).slice(0, 40));
await click(h, '#close-roster');
const pick = rows.find((text) => /Pz|PG|SS/.test(text) && !/Arty|HQ|Truck|Dump/.test(text)) ?? rows[0];
await selectUnit(h, pick.split(' ').slice(0, 3).join(' '));
const card = await cardTokens(h);
let fuel = null;
if (await has(h, '[data-fuel-method]')) fuel = await payFuel(h, (await has(h, '[data-fuel-method="FORMATION"]')) ? 'FORMATION' : 'SINGLE_UNIT');
const label = (id) => { const [q, r] = id.split(',').map(Number); return `${String(q + Math.floor(r / 2) + 1).padStart(2, '0')}${String(r + 1).padStart(2, '0')}`; };
const reach = await page.evaluate(() => [...window.ocsMap.state.reachable.keys()]);
// Westward is toward the Allied defender: the reachable hex with the smallest column.
const target = reach.map((id) => ({ id, text: label(id) })).sort((a, b) => Number(a.text.slice(0, 2)) - Number(b.text.slice(0, 2)))[0];
const before = await page.evaluate(() => window.ocsMap.state.selectedHexId);
const moved = target ? await moveSelectedTo(h, target.text, gotoHex) : { moved: false };
await h.shot('scn13-axis-moved');
const log = await page.evaluate(() => [...document.querySelectorAll('.history li, .log li, [data-log] li')].slice(-3).map((n) => n.textContent.trim()));
return { pick, card, fuel, reachable: reach.length, before, target, moved, log, at: await where(h) };
