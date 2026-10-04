// ACT-15: move units one at a time into 0502 (2 RE there now). Each move's preview is read before Confirm; moves that keep
// the hex within 10 RE must show no overstack warning, the one that takes it over 10 must warn and read "Confirm anyway".
const order = ['Standish TF / 10.A', 'Chmbln TF / 10.A', 'Div Arty I / 10.A', 'Div Arty II / 10.A', '90 Recon Bn', 'Rhea TF', 'Wemple TF', 'Chap TF', 'Brown TF', 'Div Arty I / 7.A', 'Div Arty II / 7.A'];
const moves = [];
for (const name of order) {
  await selectUnit(h, name);
  await gotoHex(h, '0502', { enter: true });
  await page.waitForTimeout(250);
  const preview = await page.evaluate(() => document.querySelector('.move-preview, .move-popup, [class*=preview]')?.innerText.replace(/\s+/g, ' ').trim() ?? '');
  const button = await page.evaluate(() => document.querySelector('#confirm-move')?.textContent.trim() ?? null);
  const warned = /overstack|RE/i.test(preview) && /10/.test(preview);
  moves.push({ name, preview: preview.slice(0, 300), button, warned });
  if (warned) await h.shot(`act15-preview-${moves.length}`);
  if (!button) { moves.at(-1).skipped = true; if (await has(h, '#cancel-move')) await click(h, '#cancel-move'); continue; }
  await click(h, '#confirm-move', { settle: 400 });
  if (await has(h, '#finish-move')) await click(h, '#finish-move', { settle: 300 });
  if (warned) break;
}
const stack = await gotoHex(h, '0502');
const endBefore = await page.evaluate(() => ({ end: document.querySelector('#end-phase')?.innerText.replace(/\s+/g, ' ').trim(), warning: document.querySelector('.end-warning, .overstack-warning, [class*=overstack]')?.innerText.replace(/\s+/g, ' ').trim() ?? '' }));
await h.shot('act15-after-moves');
state.moves = moves;
return { moves, stack, endBefore };
