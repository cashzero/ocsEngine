// Reachability of the uncovered hexes 1206–1208 for 13.Abn (leg) and for a Truck, and the Truck's options.
const out = {};
await selectUnit(h, '13.Abn');
out.abn = {};
for (const hex of ['1206', '1207', '1208', '1107', '1108']) out.abn[hex] = await gotoHex(h, hex);
await selectUnit(h, 'Truck');
out.truckCard = (await page.textContent('.command-rail')).replace(/\s+/g, ' ').slice(60, 400);
out.truck = {};
for (const hex of ['1206', '1207', '1208', '1107', '0606', '0508']) out.truck[hex] = await gotoHex(h, hex);
return out;
