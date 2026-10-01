import { mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';

const baseUrl = process.env.OCS_UI_URL ?? 'http://127.0.0.1:4173/';
const port = Number(process.env.OCS_CDP_PORT ?? 9223);
const artifactDirectory = join(process.cwd(), 'tmp', 'ui-gate');

const delay = (milliseconds) => new Promise((resolve) => setTimeout(resolve, milliseconds));
const targets = await (await fetch(`http://127.0.0.1:${port}/json`)).json();
const target = targets.find(({ url }) => url === baseUrl);
if (!target) throw new Error(`No Edge DevTools target for ${baseUrl} on port ${port}.`);

const socket = new WebSocket(target.webSocketDebuggerUrl);
await new Promise((resolve, reject) => {
  socket.addEventListener('open', resolve, { once: true });
  socket.addEventListener('error', reject, { once: true });
});

let commandId = 0;
const pending = new Map();
const browserErrors = [];
socket.addEventListener('message', (event) => {
  const message = JSON.parse(String(event.data));
  if (message.method === 'Runtime.exceptionThrown') browserErrors.push(message.params.exceptionDetails.text);
  if (message.method === 'Log.entryAdded' && message.params.entry.level === 'error') browserErrors.push(message.params.entry.text);
  const handler = pending.get(message.id);
  if (!handler) return;
  pending.delete(message.id);
  if (message.error) handler.reject(new Error(message.error.message));
  else handler.resolve(message.result);
});

const send = (method, params = {}) => new Promise((resolve, reject) => {
  const id = ++commandId;
  pending.set(id, { resolve, reject });
  socket.send(JSON.stringify({ id, method, params }));
});

const evaluate = async (expression) => {
  const result = await send('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true });
  if (result.exceptionDetails) throw new Error(result.exceptionDetails.text);
  return result.result.value;
};

const waitFor = async (expression, label, timeout = 8_000) => {
  const started = Date.now();
  while (Date.now() - started < timeout) {
    if (await evaluate(expression)) return;
    await delay(100);
  }
  throw new Error(`Timed out waiting for ${label}.`);
};

const click = async (selector) => {
  const clicked = await evaluate(`(() => { const element = document.querySelector(${JSON.stringify(selector)}); if (!(element instanceof HTMLElement)) return false; element.click(); return true; })()`);
  if (!clicked) throw new Error(`Could not click ${selector}.`);
};

const capture = async (filename) => {
  const image = await send('Page.captureScreenshot', { format: 'png', captureBeyondViewport: false });
  await writeFile(join(artifactDirectory, filename), Buffer.from(image.data, 'base64'));
};

const visualContract = `(() => {
  const visibleText = [...document.querySelectorAll('body *')].filter((element) => {
    const style = getComputedStyle(element);
    const rect = element.getBoundingClientRect();
    return element.childNodes.length > 0 && [...element.childNodes].some((node) => node.nodeType === Node.TEXT_NODE && node.textContent.trim())
      && style.display !== 'none' && style.visibility !== 'hidden' && rect.width > 0 && rect.height > 0;
  });
  const sizes = visibleText.map((element) => Number.parseFloat(getComputedStyle(element).fontSize));
  return {
    width: innerWidth,
    height: innerHeight,
    scrollWidth: document.documentElement.scrollWidth,
    minimumFontSize: Math.min(...sizes),
    hexes: document.querySelectorAll('.hex-cell').length,
    roads: document.querySelectorAll('.map-edge.road, .map-edge.primary-road').length,
    rivers: document.querySelectorAll('.map-edge.river, .map-edge.major-river').length,
    settlements: document.querySelectorAll('.settlement').length,
    objectives: document.querySelectorAll('.objective-marker').length,
    counters: document.querySelectorAll('.counter').length,
    terrainNameLabels: document.querySelectorAll('.terrain-label').length,
  };
})()`;

await send('Runtime.enable');
await send('Page.enable');
await send('Log.enable');
await mkdir(artifactDirectory, { recursive: true });
await send('Emulation.setDeviceMetricsOverride', { width: 1440, height: 900, deviceScaleFactor: 1, mobile: false });
await send('Page.navigate', { url: baseUrl });
await waitFor("document.querySelectorAll('.hex-cell').length > 100", 'active generated map');

const desktop = await evaluate(visualContract);
if (desktop.minimumFontSize < 13) throw new Error(`Desktop font floor is ${desktop.minimumFontSize}px.`);
if (desktop.scrollWidth > desktop.width) throw new Error('Desktop shell has horizontal overflow.');
if (desktop.terrainNameLabels !== 0) throw new Error('Active map still contains terrain-name labels.');
if (desktop.roads === 0 || desktop.rivers === 0 || desktop.settlements === 0 || desktop.objectives === 0 || desktop.counters === 0) {
  throw new Error(`Active map feature layer is incomplete: ${JSON.stringify(desktop)}.`);
}
await capture('desktop-active-map.png');

await click('#open-new-game');
await waitFor("document.querySelector('#new-game-form') !== null", 'New Game configuration');
const buildControlVisible = await evaluate(`(() => { const rect = document.querySelector('.new-game-submit').getBoundingClientRect(); return rect.top >= 0 && rect.bottom <= innerHeight; })()`);
if (!buildControlVisible) throw new Error('Build operation preview is not visible when New Game opens.');
await click('#new-game-form button[type="submit"]');
await waitFor("document.querySelector('#start-previewed-game') !== null", 'combined operation preview');

const preview = await evaluate(`(() => ({
  map: document.querySelectorAll('.operation-map .generated-cell').length,
  roads: document.querySelectorAll('.operation-map .generated-edge.road, .operation-map .generated-edge.primary-road').length,
  rivers: document.querySelectorAll('.operation-map .generated-edge.river, .operation-map .generated-edge.major-river').length,
  forces: document.querySelectorAll('.preview-force').length,
  metrics: document.querySelectorAll('.operation-metrics > div').length,
  activeStages: document.querySelectorAll('.flow-steps .is-active').length,
  completedStages: document.querySelectorAll('.flow-steps .is-complete').length,
  startDisabled: document.querySelector('#start-previewed-game').disabled,
}))()`);
if (preview.map === 0 || preview.roads === 0 || preview.rivers === 0 || preview.forces !== 2 || preview.metrics !== 6
  || preview.activeStages !== 0 || preview.completedStages !== 4 || preview.startDisabled) {
  throw new Error(`Combined preview is incomplete: ${JSON.stringify(preview)}.`);
}
await capture('desktop-combined-preview.png');

await evaluate(`(() => { const input = document.querySelector('#new-game-width'); input.value = '16'; input.dispatchEvent(new Event('change', { bubbles: true })); })()`);
const invalidated = await evaluate("document.querySelector('#start-previewed-game').disabled");
if (!invalidated) throw new Error('Changing New Game options did not invalidate Start.');
const invalidatedStatus = await evaluate("document.querySelector('.new-game-submit strong').textContent");
if (invalidatedStatus !== 'Preview invalidated') throw new Error('Invalidated preview is not visibly identified.');
await click('#new-game-form button[type="submit"]');
await waitFor("document.querySelector('#start-previewed-game')?.disabled === false", 'rebuilt operation preview');
const rebuiltSignature = await evaluate("[...document.querySelectorAll('.operation-map .generated-cell')].map((cell) => [...cell.classList].find((name) => name.startsWith('terrain-'))).join('|')");
await click('#start-previewed-game');
await waitFor("document.querySelector('.map-card')?.getAttribute('aria-label')?.includes('16×12')", 'previewed operation mount');

const mounted = await evaluate(visualContract);
const mountedSignature = await evaluate("[...document.querySelectorAll('.hex-cell')].map((cell) => [...cell.classList].find((name) => name.startsWith('terrain-'))).join('|')");
if (mounted.hexes !== 192 || mounted.counters === 0 || mounted.terrainNameLabels !== 0) {
  throw new Error(`Mounted operation does not match the rebuilt request: ${JSON.stringify(mounted)}.`);
}
if (rebuiltSignature !== mountedSignature) throw new Error('Mounted terrain differs from the rebuilt operation preview.');

await send('Emulation.setDeviceMetricsOverride', { width: 760, height: 1000, deviceScaleFactor: 1, mobile: false });
await delay(250);
const narrow = await evaluate(`(() => {
  const contract = ${visualContract};
  const map = document.querySelector('.workspace').getBoundingClientRect();
  return { ...contract, mapWidth: map.width, mapHeight: map.height };
})()`);
if (narrow.minimumFontSize < 13) throw new Error(`Narrow font floor is ${narrow.minimumFontSize}px.`);
if (narrow.scrollWidth > narrow.width) throw new Error(`Narrow shell overflows horizontally: ${JSON.stringify(narrow)}.`);
if (narrow.mapWidth < 740 || narrow.mapHeight < 500) throw new Error(`Narrow map lost priority: ${JSON.stringify(narrow)}.`);
await capture('narrow-active-map.png');
await send('Emulation.clearDeviceMetricsOverride');
if (browserErrors.length > 0) throw new Error(`Browser errors: ${browserErrors.join(' | ')}`);

socket.close();
process.stdout.write(`${JSON.stringify({ desktop, preview, mounted, narrow, browserErrors }, null, 2)}\n`);
