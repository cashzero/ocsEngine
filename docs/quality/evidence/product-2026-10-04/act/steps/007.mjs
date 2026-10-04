// Read, with the map cursor, what each hex near the enemy engineer at 1410 costs Brown TF (the announcement names the MP).
await selectUnit(h, 'Brown TF');
const out = {};
for (const hex of ['1209', '1210', '1211', '1309', '1310', '1311', '1409', '1411', '1312']) out[hex] = await gotoHex(h, hex);
return out;
