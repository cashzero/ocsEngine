import { mkdir, writeFile } from 'node:fs/promises';
import assert from 'node:assert/strict';

// Local fallback when the browser plugin cannot initialize. Uses a separate test profile.
const targets = await (await fetch('http://127.0.0.1:9223/json')).json();
const target = targets.find(({ url }) => url === 'http://127.0.0.1:4173/');
assert(target, 'Open the isolated local UI browser first');
const socket = new WebSocket(target.webSocketDebuggerUrl);
await new Promise((resolve) => socket.addEventListener('open', resolve, { once: true }));
let sequence = 0;
const pending = new Map();
const errors = [];
socket.addEventListener('message', ({ data }) => {
  const message = JSON.parse(String(data));
  if (message.method === 'Runtime.exceptionThrown') errors.push(message.params.exceptionDetails);
  const handler = pending.get(message.id);
  if (!handler) return;
  pending.delete(message.id);
  if (message.error) handler.reject(new Error(message.error.message));
  else handler.resolve(message.result);
});
const send = (method, params = {}) => new Promise((resolve, reject) => {
  const id = ++sequence;
  pending.set(id, { resolve, reject });
  socket.send(JSON.stringify({ id, method, params }));
});
const evaluate = async (expression) => {
  const result = await send('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true });
  assert(!result.exceptionDetails, JSON.stringify(result.exceptionDetails));
  return result.result.value;
};
const wait = async (expression) => {
  for (let attempt = 0; attempt < 100; attempt++) {
    if (await evaluate(expression)) return;
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  throw new Error(`UI did not reach: ${expression}`);
};
const click = async (selector) => {
  const point = await evaluate(`(() => {
    const el = document.querySelector(${JSON.stringify(selector)});
    if (!el) throw new Error('Missing control');
    el.scrollIntoView({block:'center'});
    const r = el.getBoundingClientRect();
    return {x:r.x+r.width/2,y:r.y+r.height/2};
  })()`);
  await send('Input.dispatchMouseEvent', { type: 'mousePressed', button: 'left', clickCount: 1, ...point });
  await send('Input.dispatchMouseEvent', { type: 'mouseReleased', button: 'left', clickCount: 1, ...point });
};
const directory = 'tmp/counter-lod-gate';
await mkdir(directory, { recursive: true });
const shots = [];
const capture = async (name) => {
  const state = await evaluate(`(() => {
    const counter = document.querySelector('.counter:not([aria-label^="Enemy"])');
    const visible = (selector) => getComputedStyle(counter.querySelector(selector)).display !== 'none';
    return {lod:document.querySelector('#map-camera').dataset.counterLod,
      pixels:counter.querySelector('.counter-paper').getBoundingClientRect().width,
      identity:visible('.counter-identification'),ratings:visible('.counter-values'),
      inspector:document.querySelector('.stack-piece .counter-identification') ? getComputedStyle(document.querySelector('.stack-piece .counter-identification')).display : null,
      revision:document.querySelector('.turn-strip span:nth-child(4) strong').textContent};
  })()`);
  assert.equal(state.identity, state.lod === 'full');
  assert.equal(state.ratings, state.lod !== 'symbol');
  const image = await send('Page.captureScreenshot', {format:'png',captureBeyondViewport:false});
  await writeFile(`${directory}/${name}.png`, Buffer.from(image.data, 'base64'));
  shots.push({ name, ...state });
};
try {
  await send('Runtime.enable');
  await send('Emulation.setDeviceMetricsOverride', {width:1440,height:900,deviceScaleFactor:1,mobile:false});
  await send('Page.navigate', {url:'http://127.0.0.1:4173/'});
  await wait("document.querySelector('#open-menu')");
  await click('#open-menu');
  await click('#open-new-game');
  await click('#new-game-form button[type="submit"]');
  await wait("document.querySelector('#start-previewed-game')?.disabled === false");
  await click('#start-previewed-game');
  await wait("!document.querySelector('#new-game-form') && document.querySelector('.counter')");
  await capture('desktop-initial');
  for (let i=0;i<6;i++) { await click('#zoom-in'); await capture(`desktop-in-${i}`); }
  await click('#zoom-reset');
  for (let i=0;i<4;i++) { await click('#zoom-out'); await capture(`desktop-out-${i}`); }
  // Keyboard selection stays usable even when the map glyph is tiny or overlapping.
  await evaluate("document.querySelector('.counter:not([aria-label^=\"Enemy\"])').focus()");
  await send('Input.dispatchKeyEvent', {type:'keyDown',key:'Enter',code:'Enter',windowsVirtualKeyCode:13});
  await send('Input.dispatchKeyEvent', {type:'keyUp',key:'Enter',code:'Enter',windowsVirtualKeyCode:13});
  await wait("document.querySelector('.stack-piece .unit-counter')");
  const selectedPoint = await evaluate(`(() => {
    const el = document.querySelector('.selected-counter-layer .counter.is-selected');
    const r = el.querySelector('.counter-paper').getBoundingClientRect();
    const x = r.x+r.width/2, y = r.y+r.height/2;
    return {x,y,id:el.dataset.piece,hit:document.elementFromPoint(x,y)?.closest('.counter')?.dataset.piece};
  })()`);
  assert.equal(selectedPoint.hit, selectedPoint.id, 'Selected counter must paint and hit-test above hexes and other counters');
  await send('Input.dispatchMouseEvent', {type:'mouseMoved',x:selectedPoint.x,y:selectedPoint.y});
  await capture('desktop-selected-symbol');
  assert.notEqual(shots.at(-1).inspector, 'none');
  await evaluate("document.querySelector('.stack-panel').scrollIntoView({block:'center'})");
  await capture('desktop-inspector');
  await send('Emulation.setDeviceMetricsOverride', {width:760,height:1000,deviceScaleFactor:1,mobile:false});
  await click('#zoom-reset');
  await capture('narrow-initial');
  for (let i=0;i<6;i++) { await click('#zoom-in'); await capture(`narrow-in-${i}`); }
  await click('#zoom-reset');
  for (let i=0;i<4;i++) { await click('#zoom-out'); await capture(`narrow-out-${i}`); }
  await evaluate("document.querySelector('.stack-panel').scrollIntoView({block:'center'})");
  await capture('narrow-inspector');
  assert.deepEqual([...new Set(shots.map(({lod}) => lod))].sort(), ['full','ratings','symbol']);
  assert.equal(new Set(shots.map(({revision}) => revision)).size, 1, 'LOD must not mutate game state');
  assert.equal(errors.length, 0, 'Browser runtime errors');
  await writeFile(`${directory}/evidence.json`, JSON.stringify({shots,errors}, null, 2));
  console.log(JSON.stringify({screenshots:shots.length,levels:[...new Set(shots.map(({lod})=>lod))],errors}));
} finally { socket.close(); }
