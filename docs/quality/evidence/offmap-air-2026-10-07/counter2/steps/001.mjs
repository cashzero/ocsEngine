// AIR-OM5: the off-map airfield counter on the map (pan the map to the Axis edge by dragging it).
await page.waitForTimeout(500);
await openNewGame(h);
await configure(h, { engagement: 'AXIS_ATTACKS' });
await generate(h);
await start(h);
const box = await page.locator('#hex-map').boundingBox();
for (let i = 0; i < 1; i += 1) {
  await page.mouse.move(box.x + box.width * 0.8, box.y + box.height * 0.5);
  await page.mouse.down();
  await page.mouse.move(box.x + box.width * 0.3, box.y + box.height * 0.5, { steps: 12 });
  await page.mouse.up();
  await page.waitForTimeout(200);
}
await gotoHex(h, '3214', { enter: true });
await page.waitForTimeout(400);
const shot = await h.shot('o10-airfield-on-map');
const stack = await page.evaluate(() => document.querySelector('.stack-list, .stack-panel, .command-rail')?.innerText.replace(/\n+/g, ' | ').slice(0, 500) ?? '');
return { shot, stack };
