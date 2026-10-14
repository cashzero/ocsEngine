import {readFileSync} from 'node:fs';
import {resolve} from 'node:path';
import {pathToFileURL} from 'node:url';
const root=resolve('tmp/ai-match/vp-next-2026-10-14');
const m=await import(pathToFileURL(`${root}/candidate-v61/dist/index.js`));
for (const [group,match] of [['meeting-v61-temperate',1293016],['development-v61-temperate',1280000],['development-v61-eastern',1280100]]) {
 const save=JSON.parse(readFileSync(`${root}/${group}/match-${match}.save.json`));
 const state=m.parseGameStateJson(save.initialSnapshot).value;
 const projection=m.ruleEngine.projectForViewer(state,'player:allied');
 console.log(JSON.stringify({match,objectives:projection.objectives}));
}
