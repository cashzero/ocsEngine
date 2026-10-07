await click(h, '#close-new-game'); await page.reload(); await page.waitForTimeout(1500); return 'reloaded';
