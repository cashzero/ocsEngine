// AIR-11 (Eq arrive and rebuild a lost aircraft, 13.5f) and AIR-12 (a reinforcing aircraft arrives Active at an Air Base, 13.6).
// Both sides play the same dull routine: refit, place arrivals beside the HQ, put the HQ in Combat Mode and send the Fighters
// against the other side's Air Base, so aircraft are lost the natural way (Air Combat) until one reaches the Dead Pile.
import { join } from 'node:path';
import { advanceTo, click, flyMission, has, hexDistance, newGame, open, placeArrivals, record, refitAll, selectUnit, tab, tabs, textOf, where } from './harness.mjs';

const rulesSeed = Number(process.argv[3] ?? 5104);
const evidenceDir = join(process.argv[2] ?? 'docs/quality/evidence/air-2026-10-03', 'air-11-12');
const h = await open({ evidenceDir });
const seeds = { map: 5101, oob: 5102, deployment: 5103, rules: rulesSeed };
const maxTurn = 8;
const done = new Set();
const hq = {};
let rebuilt = null;
let reinforced = false;
const once = (key) => { if (done.has(key)) return false; done.add(key); return true; };
try {
  await newGame(h, { seeds, turnLimit: maxTurn });
  h.note(`New Game: Standard scale, air forces + transports + support, seeds ${JSON.stringify(seeds)}`);
  const goal = (state) => rebuilt !== null && reinforced && state.phase === 'Movement';
  await advanceTo(h, goal, {
    before: async (state) => {
      const turn = Number(state.turn.match(/Turn (\d+)/)?.[1] ?? 0);
      const side = state.player.split(' ')[0];
      const key = (name) => `${turn}|${side}|${name}`;
      if (state.phase === 'Aircraft Refit Phase' && once(key('refit'))) {
        const count = await refitAll(h);
        if (count > 0) h.note(`Turn ${turn} ${side}: refitted at ${count} Air Base(s)`);
        return count > 0;
      }
      if (state.phase === 'Reinforcement' && once(key('arrivals'))) {
        const text = await textOf(h, '.command-rail');
        const aircraft = /(P-51|P-38|A-20|A-26|B-26|P-47|Bf\.109|Fw-190|Ju\.88|Ju\.52|C-47)[^]{0,60}arriving/.exec(text);
        const nearHq = (hexes) => hq[side] ? [...hexes].sort((a, b) => hexDistance(a.text, hq[side]) - hexDistance(b.text, hq[side]))[0] : hexes[0];
        if (aircraft && !reinforced && side === 'Allied') {
          await placeArrivals(h, nearHq);
          record(h, 'AIR-12', `Turn ${turn}: a reinforcing aircraft was due and arrived through the Arrivals tab`, aircraft[0], true);
          await h.shot(`turn-${turn}-air-reinforcement-placed`);
          reinforced = true;
        } else await placeArrivals(h, nearHq);
        const labels = await tabs(h);
        if (labels.some((label) => label.startsWith('Rebuild')) && rebuilt === null) {
          await tab(h, 'Rebuild');
          const panel = await textOf(h, '.command-rail');
          await h.shot(`turn-${turn}-${side}-rebuild-panel`);
          record(h, 'AIR-11', `Turn ${turn} (${side}): the Rebuild tab lists the lost aircraft and the Eq counter beside the HQ`, panel.slice(0, 280), /Dead Pile|reduced here/.test(panel));
          await click(h, '[data-rebuild]:not([disabled])');
          const after = await where(h);
          record(h, 'AIR-11', `Turn ${turn} (${side}): rebuilding spends the Eq and returns the aircraft`, `notice "${after.notice}"`, /Rebuilt/.test(after.notice));
          await h.shot(`turn-${turn}-${side}-rebuilt`);
          rebuilt = { turn, side };
        }
        return true;
      }
      if (state.phase === 'Movement' && once(key('movement'))) {
        if (!hq[side]) {
          await selectUnit(h, /HQ|command/);
          const rail = await textOf(h, '.command-rail');
          hq[side] = rail.match(/(\d{4}) · /)?.[1] ?? null;
          if (await has(h, '[data-mode="COMBAT"]')) await click(h, '[data-mode="COMBAT"]');
          h.note(`Turn ${turn} ${side}: the HQ at ${hq[side]} goes to Combat Mode (13.5a)`);
        }
        if (rebuilt === null && turn < maxTurn) {
          let flights = 0;
          for (let sweep = 0; sweep < 4; sweep += 1) {
            if (!(await flyMission(h, 'FIGHTER_SWEEP', { aircraft: /\bFG\b|\bJG\b/ }))) break;
            flights += 1;
          }
          h.note(`Turn ${turn} ${side}: ${flights} Fighter Sweep(s) flown`);
          if (flights > 0) await h.shot(`turn-${turn}-${side}-after-sweeps`);
          return true;
        }
      }
      return false;
    },
    limit: 400,
  });
} catch (error) {
  record(h, 'AIR-11', 'The scenario completes', String(error.message), false);
  await h.shot('failure').catch(() => {});
}
record(h, 'AIR-11', 'An aircraft was lost to Air Combat and rebuilt with Eq within the turn limit', rebuilt ? `Turn ${rebuilt.turn}, ${rebuilt.side}` : 'no aircraft reached the Dead Pile with an Eq beside the HQ', rebuilt !== null);
record(h, 'AIR-12', 'A reinforcing aircraft arrived Active at an Air Base on its turn', reinforced ? 'yes' : 'none arrived', reinforced);
record(h, 'AIR-11', 'No browser console or page error during the run', `${h.errors.length} errors`, h.errors.length === 0);
await h.finish(`AIR-11 / AIR-12 Eq rebuild and air reinforcements (rules seed ${rulesSeed})`);
await h.close();
process.exitCode = h.rows.some((row) => row.status !== 'PASS') ? 1 : 0;
