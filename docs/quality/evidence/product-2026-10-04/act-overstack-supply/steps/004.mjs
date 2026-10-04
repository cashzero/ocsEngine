// What is on screen after the second End press (step 003 stopped on a missing Log tab)?
await h.shot('after-second-end');
const shots = await page.evaluate(() => [...document.querySelectorAll('.command-rail img, .command-rail h2')].map((n) => n.textContent));
return { w: await where(h), deck: (await page.textContent('.command-rail')).replace(/\s+/g, ' ').slice(0, 1500), shots, files: await page.evaluate(() => 0) };
