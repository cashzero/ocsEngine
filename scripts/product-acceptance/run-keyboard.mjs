// UI-05: actual keyboard-only New Game, modal confinement, selection, action, decisions and hot-seat turn.
// Usage: node scripts/product-acceptance/run-keyboard.mjs [artifactDir]
import { open, where, record } from '../air-acceptance/harness.mjs';
const h=await open({evidenceDir:process.argv[2]??'artifacts/operations/keyboard'}),{page}=h;
const focusLog=[];
const focus=()=>page.evaluate(()=>{const e=document.activeElement,b=e?.getBoundingClientRect(),s=e?getComputedStyle(e):null;return{id:e?.id,tag:e?.tagName,text:e?.textContent?.trim().slice(0,80),inside:!!e?.closest('[role="dialog"]'),outline:s?.outlineStyle,width:s?.outlineWidth,box:b?{width:b.width,height:b.height}:null};});
const tabTo=async(selector)=>{
 for(let i=0;i<180;i++){
  if(await page.evaluate(sel=>document.activeElement?.matches(sel)??false,selector)){const f=await focus();focusLog.push({selector,...f});return;}
  await page.keyboard.press('Tab');
 }
 throw new Error(`Keyboard cannot reach ${selector}; focus ${JSON.stringify(await focus())}`);
};
const activate=async(selector)=>{await tabTo(selector);const t=Date.now();await page.keyboard.press('Enter');await page.waitForTimeout(120);h.timings.push({label:`Keyboard ${selector}`,elapsed:Date.now()-t});};
const set=async(selector,value)=>{await tabTo(selector);await page.keyboard.press('ControlOrMeta+A');await page.keyboard.type(String(value));await page.keyboard.press('Tab');};
const confined=async(n)=>{for(let i=0;i<n;i++){await page.keyboard.press(i%3===0?'Shift+Tab':'Tab');if(!(await focus()).inside)throw new Error('Tab escaped the modal into game content.');}};
const gotoByKeys=async(label)=>{
 await tabTo('#hex-map');await page.keyboard.press('ArrowRight');await page.keyboard.press('ArrowLeft');
 const at=(await page.locator('#hex-map ~ [aria-live], [aria-live].visually-hidden').first().textContent()).match(/\b(\d{4})\b/)?.[1];
 if(!at)throw new Error('Keyboard cursor has no announced hex');
 const dr=Number(label.slice(2))-Number(at.slice(2)),dc=Number(label.slice(0,2))-Number(at.slice(0,2));
 for(let i=0;i<Math.abs(dr);i++)await page.keyboard.press(dr>0?'ArrowDown':'ArrowUp');
 for(let i=0;i<Math.abs(dc);i++)await page.keyboard.press(dc>0?'ArrowRight':'ArrowLeft');
};
try{
 await activate('#open-menu');await confined(40);await h.shot('menu-focus-trap');
 await activate('#open-new-game');await confined(50);await h.shot('settings-focus-trap');
 await set('#new-game-width',18);await set('#new-game-height',12);await set('#new-game-divisions',2);await set('#new-game-armored',1);await set('#new-game-turn-limit',2);
 for(const [key,value] of Object.entries({map:7101,oob:7102,deployment:7103,rules:7104}))await set(`#new-game-${key}-seed`,value);
 await activate('button[form="new-game-form"]');await page.waitForSelector('#start-previewed-game:not([disabled])');
 await confined(30);await h.shot('preview-focus-trap');await activate('#start-previewed-game');await page.waitForSelector('#new-game-form',{state:'hidden'});
 await activate('#open-roster');
 const row=await page.locator('[data-roster-pick]').evaluateAll(nodes=>nodes.map(n=>({id:n.dataset.rosterPick,label:n.innerText})).find(r=>/\b\d+\.(?:Inf|Abn)\b/.test(r.label)));
 if(!row)throw new Error('No foot division in the generated roster');
 await activate(`[data-roster-pick="${row.id}"]`);
 if(await page.locator('[data-mode="MOVE"]').count())await activate('[data-mode="MOVE"]');
 const target=await page.evaluate(()=>[...window.ocsMap.state.reachable.keys()].find(id=>id!==window.ocsMap.state.selectedHexId));
 if(!target)throw new Error('Selected foot division has no legal move');
 const [q,r]=target.split(',').map(Number),printed=`${String(q+Math.floor(r/2)+1).padStart(2,'0')}${String(r+1).padStart(2,'0')}`;
 await gotoByKeys(printed);await page.keyboard.press('Enter');await page.waitForSelector('#confirm-move');await h.shot('keyboard-move-confirmation');await activate('#confirm-move');
 await h.shot('keyboard-move-completed');
 let handoff=false;
 for(let i=0;i<110;i++){
  const w=await where(h);
  if(/Turn 2/.test(w.turn)&&!w.handoff&&!w.complete&&!w.decision.length)break;
  if(w.complete){await tabTo('#complete-handoff');await h.shot('keyboard-private-handoff');if(await page.locator('#hex-map').count())throw new Error('Private map remains during handoff');await activate('#complete-handoff');handoff=true;continue;}
  if(w.handoff){await activate('#begin-required-handoff');continue;}
  if(w.decision.length){await activate('[data-choice]');continue;}
  if(await page.locator('#dismiss-away').count()){await activate('#dismiss-away');continue;}
  if(w.endDisabled)throw new Error(`Cannot continue by keyboard: ${JSON.stringify(w)}`);
  await activate('#end-phase');
 }
 const final=await where(h);await h.shot('keyboard-whole-turn');
 record(h,'UI-05','Keyboard traverses New Game, map selection/actions, modals and private handoffs through a whole turn',JSON.stringify({row,target:printed,final,focusLog,errors:h.errors}),handoff&&/Turn 2/.test(final.turn)&&focusLog.every(f=>f.box?.width>0&&f.outline!=='none')&&h.errors.length===0);
}catch(error){record(h,'UI-05','Keyboard flow completes',String(error.stack??error),false);await h.shot('failure');}
await h.finish('UI-05: keyboard product operation');const failed=h.rows.some(r=>r.status==='FAIL')||h.errors.length;
await h.close();
if(failed)process.exitCode=1;
