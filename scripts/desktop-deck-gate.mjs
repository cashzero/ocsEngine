import { mkdir, writeFile } from 'node:fs/promises';
import assert from 'node:assert/strict';

// Isolated browser fallback: the browser plugin's Node runtime cannot start.
const targets = await (await fetch('http://127.0.0.1:9223/json')).json();
const target = targets.find(t => t.url.startsWith('http://127.0.0.1:4173'));
assert(target, 'Open the isolated UI test browser');
const socket = new WebSocket(target.webSocketDebuggerUrl);
await new Promise(resolve => socket.addEventListener('open', resolve, { once: true }));
const pending = new Map(); let id = 0;
const errors = []; const evidence = [];
socket.addEventListener('message', ({ data }) => {
  const message = JSON.parse(String(data));
  if (message.method === 'Runtime.exceptionThrown') errors.push(message.params.exceptionDetails);
  if (message.method === 'Runtime.consoleAPICalled' && message.params.type === 'error') errors.push(message.params.args);
  const request = pending.get(message.id); if (!request) return;
  pending.delete(message.id);
  if (message.error) request.reject(new Error(message.error.message)); else request.resolve(message.result);
});
const send = (method, params = {}) => new Promise((resolve, reject) => {
  const current = ++id; pending.set(current, { resolve, reject }); socket.send(JSON.stringify({ id: current, method, params }));
});
const read = async expression => {
  const result = await send('Runtime.evaluate', { expression, returnByValue: true });
  assert(!result.exceptionDetails, JSON.stringify(result.exceptionDetails)); return result.result.value;
};
const wait = async expression => {
  for (let i = 0; i < 100; i++) { if (await read(expression)) return; await new Promise(resolve => setTimeout(resolve, 100)); }
  throw new Error(`Timed out: ${expression}`);
};
const click = async selector => {
  const point = await read(`(() => {const e=document.querySelector(${JSON.stringify(selector)}); if(!e || e.disabled) throw new Error('Unavailable control: '+${JSON.stringify(selector)});const r=e.getBoundingClientRect();const x=r.x+r.width/2,y=r.y+r.height/2;if(x<0||y<0||x>innerWidth||y>innerHeight||!e.contains(document.elementFromPoint(x,y))) throw new Error('Control obscured or outside viewport: '+${JSON.stringify(selector)});return{x,y};})()`);
  const start = performance.now();
  await send('Input.dispatchMouseEvent', { type: 'mousePressed', button: 'left', clickCount: 1, ...point });
  await send('Input.dispatchMouseEvent', { type: 'mouseReleased', button: 'left', clickCount: 1, ...point });
  await wait(`!document.querySelector('.deck-notice')?.textContent.includes('Preparing action')`);
  evidence.push({ operation: selector, elapsedMs: Math.round(performance.now() - start) });
};
const key = async (key, code, modifiers = 0) => {
  await send('Input.dispatchKeyEvent', { type: 'keyDown', key, windowsVirtualKeyCode: code, modifiers });
  await send('Input.dispatchKeyEvent', { type: 'keyUp', key, windowsVirtualKeyCode: code, modifiers });
};
const fill = async (selector, value) => { await click(selector); await key('a', 65, 2); await send('Input.insertText', { text: String(value) }); await key('Tab', 9); };
const select = async (selector, index) => { await click(selector); await key('Home', 36); for(let i=0;i<index;i++) await key('ArrowDown',40); await key('Enter',13); };
const directory = 'tmp/desktop-deck-gate'; await mkdir(directory, { recursive: true });
const capture = async name => {
  const layout = await read(`(() => {const selectors=['.command-rail','.deck-list','.deck-footer','#execute-action','.new-game-form','.operation-preview','.new-game-footer'];return selectors.map(selector=>{const e=document.querySelector(selector);if(!e)return null;const r=e.getBoundingClientRect();return{selector,x:r.x,y:r.y,width:r.width,height:r.height,scrollHeight:e.scrollHeight,clientHeight:e.clientHeight,bottom:r.bottom};}).filter(Boolean);})()`);
  const image = await send('Page.captureScreenshot', { format: 'png', captureBeyondViewport: false });
  await writeFile(`${directory}/${name}.png`, Buffer.from(image.data, 'base64'));
  evidence.push({ capture: name, layout });
  for(const box of layout.filter(b=>['.command-rail','.new-game-form','.operation-preview'].includes(b.selector))) assert(box.scrollHeight <= box.clientHeight + 1, `${name}: ${box.selector} overflows ${box.scrollHeight}/${box.clientHeight}`);
};
try {
  await send('Runtime.enable'); await send('Page.enable');
  for (const [width,height,scale] of [[1920,1080,'default'],[1680,1050,'large']]) {
    await send('Emulation.setDeviceMetricsOverride', { width,height,deviceScaleFactor:1,mobile:false });
    await send('Page.navigate', { url: 'http://127.0.0.1:4173/' });
    await wait(`!!document.querySelector('#open-menu')`);
    await capture(`${scale}-boot`);
    await click('#open-menu'); await click('#open-new-game');
    await click('#close-new-game'); await click('#open-menu'); await click('#open-new-game');
    if (scale === 'large') {
      await select('#new-game-style',1); await select('#new-game-scale',2); await fill('#new-game-formations',4); await fill('#new-game-turn-limit',3);
      for(const [dimension,seed] of [['map',91001],['oob',91002],['deployment',91003],['rules',91004]]) await fill(`#new-game-${dimension}-seed`,seed);
    }
    await capture(`${scale}-configure`);
    await click('button[form="new-game-form"]');
    await wait(`!!document.querySelector('#start-previewed-game')`);
    await capture(`${scale}-preview`);
    evidence.push({scale,preview:await read(`document.querySelector('.operation-metrics').innerText`)});
    await fill('#new-game-width',16);
    assert.equal(await read(`document.querySelector('#start-previewed-game').disabled`),true);
    await fill('#new-game-width',18); await click('button[form="new-game-form"]');
    await wait(`!!document.querySelector('#start-previewed-game:not(:disabled)')`);
    await click('#start-previewed-game');
    await wait(`!document.querySelector('.new-game-dialog')`);
    let moved = false; let handoffs = 0;
    for (let step=0;step<65;step++) {
      const state = await read(`({turn:document.querySelector('.turn-strip strong')?.textContent,phase:document.querySelector('.deck-phase h1')?.textContent,handoff:!!document.querySelector('#begin-required-handoff'), options:[...document.querySelector('#deck-action').options].map(o=>o.value)})`);
      if (Number(state.turn)>1) break;
      if (state.handoff) { await click('#begin-required-handoff'); assert.equal(await read(`document.querySelectorAll('.counter,.deck-unit,#hex-map').length`),0); await click('#complete-handoff'); handoffs++; continue; }
      if (!moved && state.options.includes('MOVE_PIECE')) {
        await click('#open-roster');
        await click('.roster-unit:not(:has(.concealed))');
        const index = await read(`[...document.querySelector('#deck-action').options].findIndex(o=>o.value==='MOVE_PIECE')`);
        await select('#deck-action',index);
        await wait(`!!document.querySelector('.candidate')`);
        await capture(`${scale}-move`);
        await click('#execute-action'); moved=true;
      } else await click('#end-phase');
    }
    evidence.push({scale,moved,handoffs,final:await read(`document.querySelector('.turn-strip').innerText`)});
    assert(moved, 'Whole turn needs a unit action');
    assert(Number(await read(`document.querySelector('.turn-strip strong').textContent`))>1,'Must reach turn two');
    await capture(`${scale}-turn-two`);
    assert.equal(await read(`!!document.querySelector('#toggle-pause')`),false,'A turn-based game has no Pause control');
    if (await read(`!!document.querySelector('#begin-required-handoff')`)) { await click('#begin-required-handoff'); await click('#complete-handoff'); }
    await click('#open-menu'); await click('#create-checkpoint');
    const savedRevision = await read(`document.querySelector('.turn-strip span:last-child strong').textContent`);
    await capture(`${scale}-session`);
    await click('#close-utility'); await click('#end-phase'); await click('#open-menu');
    await click('[data-checkpoint]'); // Restoring closes the menu and play goes on.
    assert.equal(await read(`document.querySelector('.turn-strip span:last-child strong').textContent`),savedRevision);
  }
  assert.equal(errors.length,0,JSON.stringify(errors));
  console.log('Desktop layout and whole-turn exploratory runs completed. This is not the entire product gate.');
} catch(error) {
  evidence.push({ failure: error.message }); await capture('failure').catch(()=>{}); throw error;
} finally {
  await writeFile(`${directory}/evidence.json`,JSON.stringify({errors,evidence},null,2));socket.close();
}
