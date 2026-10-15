// UI-02: accepted roster ellipsis must expose the complete name on hover and keyboard focus.
// Usage: node scripts/product-acceptance/run-roster-tooltip.mjs [artifactRoot] [WIDTHxHEIGHT]
import { writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { open, click, newGame, where, record, placeArrivals } from '../air-acceptance/harness.mjs';
import { playUntil } from './lib.mjs';
const [width,height]=(process.argv[3]??'1680x1050').split('x').map(Number);
const evidenceDir=join(process.argv[2]??'artifacts/roster-tooltip',`${width}x${height}`);
const h=await open({evidenceDir,viewport:{width,height}}),{page}=h;
const observations={};
const tooltip=()=>page.locator('#roster-name-tooltip');
const layout=()=>page.evaluate(()=>{
  const rail=document.querySelector('.command-rail'),end=document.querySelector('#end-phase'),phase=document.querySelector('.phase-picker');
  const reachable=e=>{const r=e?.getBoundingClientRect();return !!r&&r.width>0&&r.height>0&&r.bottom<=innerHeight&&r.right<=innerWidth;};
  return {pageOverflow:document.scrollingElement.scrollWidth>innerWidth||document.scrollingElement.scrollHeight>innerHeight,
    deckScrolls:rail.scrollHeight>rail.clientHeight+1,mapVisible:!!document.querySelector('#hex-map')?.getClientRects().length,
    endVisible:reachable(end),phaseVisible:reachable(phase)};
});
const readTooltip=()=>tooltip().evaluate(e=>{
  const r=e.getBoundingClientRect();return {text:e.textContent,visible:!e.hidden,unclipped:e.scrollWidth<=e.clientWidth+1&&e.scrollHeight<=e.clientHeight+1,
    insideViewport:r.left>=0&&r.top>=0&&r.right<=innerWidth&&r.bottom<=innerHeight,rect:{x:r.x,y:r.y,width:r.width,height:r.height}};
});
try{
  await newGame(h,{width:16,height:12,scale:'COMPACT',divisions:1,armored:0,air:'NONE',turnLimit:2,seeds:{map:23111,oob:23112,deployment:23113,rules:23114},onPreview:async()=>{await h.shot('small-preview');}});
  await newGame(h,{width:18,height:12,scale:'LARGE',divisions:4,armored:2,air:'NONE',turnLimit:3,seeds:{map:91001,oob:91002,deployment:91003,rules:91004},onPreview:async()=>{await h.shot('ng07-preview');}});
  observations.mounted=await layout();await click(h,'#open-roster');
  observations.rosterLayout=await layout();
  const names=await page.locator('[data-roster-name]').evaluateAll(nodes=>nodes.map(e=>{
    const text=e.querySelector('.roster-text');return {id:e.dataset.rosterPick,name:e.dataset.rosterName,clipped:text.scrollWidth>text.clientWidth+1};
  }));
  // Check every actually clipped row, plus the previously reported name even if this viewport fits it.
  const selected=names.filter(n=>n.clipped||n.name==='Chmbln TF (Det. 2) / 10.A');
  if(!selected.length)throw Error('The frozen NG-07 witness is missing.');
  observations.names=names;observations.hover=[];
  for(const name of selected){
    const started=Date.now();await page.locator(`[data-roster-pick="${name.id}"]`).hover();
    await tooltip().waitFor({state:'visible'});const tip=await readTooltip();
    h.timings.push({label:`Hover ${name.name}`,elapsed:Date.now()-started,budget:1000});
    observations.hover.push({name:name.name,...tip});await h.shot('full-name-hover');
    if(tip.text!==name.name||!tip.unclipped||!tip.insideViewport)throw Error('Hover tooltip did not show the complete name.');
  }
  await page.mouse.move(0,0);
  if(await tooltip().isVisible())throw Error('Tooltip remains after leaving the row.');
  const target=selected[0];
  // Tab from the roster search to the actual row, rather than setting focus through an API.
  let reached=false;
  for(let i=0;i<150;i++){
    if(await page.evaluate(id=>document.activeElement?.getAttribute('data-roster-pick')===id,target.id)){reached=true;break;}
    await page.keyboard.press('Tab');
  }
  if(!reached)throw Error('Cannot reach the named row by keyboard.');
  observations.keyboard=await readTooltip();
  observations.accessibleName=await page.locator(`[data-roster-pick="${target.id}"]`).getAttribute('aria-label');
  await h.shot('full-name-keyboard');
  if(observations.keyboard.text!==target.name||!observations.keyboard.visible||!observations.keyboard.insideViewport||!observations.accessibleName.includes(target.name))throw Error('Keyboard full name is missing.');
  await page.keyboard.press('Escape');
  observations.escape={tooltipVisible:await tooltip().isVisible(),rosterVisible:await page.locator('.roster-popup').isVisible()};
  if(observations.escape.tooltipVisible||!observations.escape.rosterVisible)throw Error('Escape did not dismiss only the tooltip.');
  await page.keyboard.press('Enter');
  if(await page.locator('.roster-popup').count()||await tooltip().isVisible())throw Error('Selection left a tooltip or roster behind.');
  observations.selected=await page.locator('.selected-unit').innerText().catch(()=>page.locator('.command-rail').innerText());
  await h.shot('selected-name');
  // Exercise a legal action, all required decisions/handoffs and the whole Game Turn.
  if(await page.locator('[data-mode="MOVE"]').count())await click(h,'[data-mode="MOVE"]');
  else if(await page.locator('[data-mode="COMBAT"]').count())await click(h,'[data-mode="COMBAT"]');
  await playUntil(h,async(s)=>/Turn 2/.test(s.turn)&&!s.handoff&&!s.complete&&s.decision.length===0,{placeArrivals});
  observations.final={where:await where(h),layout:await layout(),tooltipVisible:await tooltip().isVisible()};
  await h.shot('whole-turn-complete');
  const healthy=[observations.mounted,observations.rosterLayout,observations.final.layout].every(l=>!l.pageOverflow&&!l.deckScrolls&&l.mapVisible&&l.endVisible&&l.phaseVisible);
  record(h,'UI-02','At 1680x1050, roster ellipses expose full names on hover and keyboard focus; no page overflow or whole-deck scrolling, map and commands reachable',JSON.stringify(observations),healthy&&!observations.final.tooltipVisible&&h.errors.length===0);
}catch(error){record(h,'UI-02','Roster full-name tooltip and integrated flow complete',String(error.stack??error),false);await h.shot('failure');}
await writeFile(join(evidenceDir,'observations.json'),JSON.stringify(observations,null,2));
await h.finish(`Roster full-name tooltip at ${width}x${height}`);
const failed=h.rows.some(r=>r.status==='FAIL')||h.errors.length;
await h.close();if(failed)process.exitCode=1;
