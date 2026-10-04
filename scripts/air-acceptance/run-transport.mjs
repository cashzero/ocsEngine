// AIR-13 (Air Transport of a unit and supply: capacity, routes, unloading, half MA, 14.9), AIR-14 (Drop Plans made, delayed,
// cancelled and flown; parachute and glider landings on the Air Transport Success Table, 14.10) and AIR-15 (Flak over an
// enemy Patrol Zone, and the cargo a Flak hit costs, 14.9g). Allied Transports load at 0305, Axis Transports at 1407.
import { join } from 'node:path';
import { advanceTo, click, endPhase, has, newGame, open, placeArrivals, record, refitAll, selectUnit, settleDecisions, tab, textOf, timed, where } from './harness.mjs';

const rulesSeed = Number(process.argv[3] ?? 5104);
const evidenceDir = join(process.argv[2] ?? 'docs/quality/evidence/air-2026-10-03', 'air-13-15');
const h = await open({ evidenceDir });
const seeds = { map: 5101, oob: 5102, deployment: 5103, rules: rulesSeed };
const panel = () => textOf(h, '.air-panel');
const blockers = () => textOf(h, '.air-panel .rule-blockers');
const facts = () => h.page.evaluate(() => Object.fromEntries([...document.querySelectorAll('.air-panel .combat-facts > div')].map((row) => [row.querySelector('dt')?.textContent.trim(), row.querySelector('dd')?.textContent.replace(/\s+/g, ' ').trim()])));
const declareEnabled = () => h.page.evaluate(() => !document.querySelector('#declare-air-mission')?.disabled);
const at = (turn, side, phase) => (state) => state.turn.startsWith(`Turn ${turn} `) && state.player.startsWith(side) && state.phase === phase;
let flakSeen = 0;

/** Open the Air Transport or Air Drop panel on a hex (by its printed number) and load at the base holding `base`. */
const openTransport = async (kind, hex, base) => {
  await tab(h, 'Air');
  await click(h, `[data-air-mission="${kind}"]`);
  await h.page.locator('.hex-chips [data-target-hex]', { hasText: hex }).first().click();
  await h.page.waitForTimeout(400);
  const chip = h.page.locator('[data-transport-base]', { hasText: base });
  if ((await chip.count()) > 0) { await chip.first().click(); await h.page.waitForTimeout(300); }
};
const setTokens = async (tokens) => { await h.page.fill('#transport-tokens', String(tokens)); await h.page.press('#transport-tokens', 'Tab'); await h.page.waitForTimeout(300); };
const setUnit = async (pattern, on) => {
  const rows = h.page.locator('.air-panel label.participant', { hasText: pattern }).locator('[data-transport-unit]');
  if ((await rows.count()) === 0) return false;
  if ((await rows.first().isChecked()) !== on) { await rows.first().click(); await h.page.waitForTimeout(300); }
  return true;
};
const setRoute = async (route) => {
  const selects = h.page.locator('[data-transport-route]');
  for (let index = 0; index < (await selects.count()); index += 1) await selects.nth(index).selectOption(route);
  await h.page.waitForTimeout(300);
};
/** Fly the drafted mission, answer what it asks (the original Air Base first), and return the result card and decisions. */
const fly = async (label) => {
  const { elapsed } = await timed(h, label, () => click(h, '#declare-air-mission', { settle: 500 }));
  const asked = await where(h);
  const decisions = await settleDecisions(h);
  const result = await textOf(h, '.combat-summary, .combat-result, .deck-context');
  if (/Flak/.test(result)) flakSeen += 1;
  return { elapsed, asked, decisions, result };
};

try {
  await newGame(h, { seeds, turnLimit: 6 });
  h.note(`New Game: Standard scale, air forces (aircraft reinforcements built in) + transports, seeds ${JSON.stringify(seeds)}`);

  // ── Allied Turn 1 Aircraft Refit Phase: Drop Plans (14.10b, 14.10c) ──
  const refit = await where(h);
  record(h, 'AIR-14', 'The game opens in the Allied Aircraft Refit Phase, where Drop Plans are made', `${refit.turn}, ${refit.player}, ${refit.phase}`, refit.phase === 'Aircraft Refit Phase');
  await click(h, '#start-drop-plan');
  const draft = await textOf(h, '.air-panel');
  record(h, 'AIR-14', 'Plan an Air Drop lists the Para units and allows any turn in the first Refit Phase of the game', draft.slice(0, 260), /Para unit/.test(draft) && /turn 1 or later/.test(draft));
  await h.page.locator('.air-panel label.participant', { hasText: 'Parachute Infantry Battalion' }).locator('[data-drop-unit]').check();
  await h.page.fill('#drop-hex', '0306'); await h.page.press('#drop-hex', 'Tab'); await h.page.waitForTimeout(300);
  await h.page.fill('#drop-turn', '3'); await h.page.press('#drop-turn', 'Tab'); await h.page.waitForTimeout(300);
  await h.shot('allied-drop-plan-draft');
  await click(h, '#confirm-drop-plan');
  const plans = () => h.page.evaluate(() => [...document.querySelectorAll('.drop-plans .refit-base small')].map((node) => node.textContent.replace(/\s+/g, ' ').trim()));
  const planned = await plans();
  record(h, 'AIR-14', 'A Drop Plan for the US Parachute Infantry Battalion to 0306 on turn 3 is recorded', planned.join(' | '), planned.some((text) => text.includes('0306') && text.includes('turn 3')));
  await click(h, '[data-drop-change="DELAY"]');
  const delayed = await plans();
  record(h, 'AIR-14', 'Delay one turn moves the plan to turn 4 (14.10c)', delayed.join(' | '), delayed.some((text) => text.includes('turn 4')));
  await click(h, '[data-drop-change="CANCEL"]');
  const cancelled = await textOf(h, '.drop-plans');
  record(h, 'AIR-14', 'Cancel removes the plan', cancelled, /No Air Drop is planned/.test(cancelled));
  await click(h, '#start-drop-plan');
  await h.page.locator('.air-panel label.participant', { hasText: 'Parachute Infantry Battalion' }).locator('[data-drop-unit]').check();
  await h.page.fill('#drop-hex', '0306'); await h.page.press('#drop-hex', 'Tab'); await h.page.waitForTimeout(300);
  await h.page.fill('#drop-turn', '2'); await h.page.press('#drop-turn', 'Tab'); await h.page.waitForTimeout(300);
  await click(h, '#confirm-drop-plan');
  const replanned = await plans();
  record(h, 'AIR-14', 'The battalion is planned again, to drop on 0306 on turn 2', replanned.join(' | '), replanned.some((text) => text.includes('0306') && text.includes('turn 2')));
  await h.shot('allied-drop-planned');

  // ── Allied Turn 1 Movement: an unplanned combat-unit drop is refused; supply flown into an enemy Patrol Zone (14.9g) ──
  await endPhase(h); await placeArrivals(h); await endPhase(h);
  await openTransport('AIR_DROP', '0103', '0305');
  await setUnit('Parachute Infantry Battalion', true);
  const unplanned = await blockers();
  record(h, 'AIR-14', 'A combat unit cannot be Air Dropped on a hex and turn it has no Drop Plan for', unplanned || '(no blocker shown)', !(await declareEnabled()) && /plan/i.test(unplanned));
  await h.shot('allied-unplanned-drop-refused');
  await click(h, '#cancel-air-mission');

  await openTransport('AIR_TRANSPORT', '0504', '0305');
  await setUnit('Parachute Infantry Battalion', false);
  await setTokens(2);
  const supplyFacts = await facts();
  record(h, 'AIR-13', 'Air Transport of 2T by the C-47+Gldr (capacity 2T): the load, the integral-glider unloading exemption and the Flak modifier are shown', JSON.stringify(supplyFacts), /2T of 2T/.test(supplyFacts.Load ?? '') && /^0T count/.test(supplyFacts.Unloading ?? '') && /\+2/.test(supplyFacts.Flak ?? ''));
  await h.shot('allied-supply-transport-draft');
  const supply = await fly('Allied Air Transport 2T to 0504');
  record(h, 'AIR-15', 'The Transport is subject to Flak in the enemy Patrol Zone and the result is reported', `${supply.result.slice(0, 400)}; decisions: ${supply.decisions.join(' / ')} (${supply.elapsed} ms)`, /Flak/.test(supply.result));
  const hit = /step is lost/i.test(supply.result);
  h.note(`Flak on the fully loaded Allied Air Transport ${hit ? 'hit' : 'missed'}; decisions: ${supply.decisions.join(' / ') || 'none'}`);
  if (hit) record(h, 'AIR-15', 'A Flak step loss on a full Transport costs the cargo it can no longer carry (14.9g), and the result says what was lost', `${supply.result.slice(0, 400)}; decisions: ${supply.decisions.join(' / ')}`, /capacity: .* is lost|eliminated/i.test(supply.result));
  await h.shot('allied-supply-transport-flown');
  await tab(h, 'Log');
  const alliedLog = await textOf(h, '.command-rail');
  record(h, 'AIR-13', 'The Log reports the supply delivered at 0504 (or what Flak cost of it)', (alliedLog.match(/[^.]*(delivered|lost)[^.]*\./i) ?? [alliedLog.slice(0, 200)])[0], /delivered|lost/i.test(alliedLog));

  // ── Axis Turn 1: plan the Fallschirmjäger drop for turn 2, then Air Transport them with 1T to 1707 first (14.9) ──
  await advanceTo(h, at(1, 'Axis', 'Aircraft Refit Phase'));
  await click(h, '#start-drop-plan');
  await h.page.locator('.air-panel label.participant', { hasText: 'Fallschirmjäger' }).locator('[data-drop-unit]').check();
  await h.page.fill('#drop-hex', '1504'); await h.page.press('#drop-hex', 'Tab'); await h.page.waitForTimeout(300);
  await h.page.fill('#drop-turn', '2'); await h.page.press('#drop-turn', 'Tab'); await h.page.waitForTimeout(300);
  await click(h, '#confirm-drop-plan');
  const axisPlans = await plans();
  record(h, 'AIR-14', 'Axis: the Fallschirmjäger Battalion is planned to drop on 1504 on turn 2', axisPlans.join(' | '), axisPlans.some((text) => text.includes('1504') && text.includes('turn 2')));
  await advanceTo(h, at(1, 'Axis', 'Movement'));
  await openTransport('AIR_TRANSPORT', '1707', '1407');
  await setUnit('Fallschirmjäger', true);
  // A route change refills the supply to the new capacity, so the route is set before the tokens are typed.
  await setRoute('NORMAL');
  await setTokens(1);
  const over = await facts();
  const overBlock = await blockers();
  record(h, 'AIR-13', 'Normal range: the battalion (1T) and 1T of supply exceed the Ju.52\'s 1T capacity and the mission is refused', `${over.Load}; ${overBlock}`, !(await declareEnabled()) && /2T of 1T/.test(over.Load ?? ''));
  await h.shot('axis-over-capacity');
  await setRoute('HALF');
  await setTokens(1);
  const half = await facts();
  record(h, 'AIR-13', 'Half range doubles capacity (14.9e): 2T of 2T, and 2T count against the destination\'s unloading limit', `${half.Load}; ${half.Unloading}`, (await declareEnabled()) && /2T of 2T/.test(half.Load ?? '') && /^2T count/.test(half.Unloading ?? ''));
  await h.shot('axis-half-range-draft');
  const axisFlight = await fly('Axis Air Transport battalion + 1T to 1707');
  record(h, 'AIR-13', 'The Ju.52 flies the battalion and 1T to 1707, then returns (original Air Base offered first)', `${axisFlight.result.slice(0, 300)}; decisions: ${axisFlight.decisions.join(' / ')} (${axisFlight.elapsed} ms)`, /1707/.test(axisFlight.result) || axisFlight.decisions.length > 0);
  await h.shot('axis-transport-flown');
  await selectUnit(h, 'Fallschirmjäger');
  const carried = await textOf(h, '.command-rail');
  record(h, 'AIR-13', 'The carried battalion (MA 5) is at 1707 and may move only with half its MA: 2.5 MP left (14.9c)', carried.slice(0, 300), /1707/.test(carried) && /2\.5 MP left/.test(carried));
  await h.shot('axis-battalion-after-transport');

  // ── Allied Turn 2: the planned glider drop on 0306 ──
  const alliedDrop = async () => {
  await openTransport('AIR_DROP', '0306', '0305');
  await setUnit('Parachute Infantry Battalion', true);
  await setTokens(0);
  const glider = await facts();
  record(h, 'AIR-14', 'The planned battalion lands by the C-47+Gldr\'s glider: the Success Table number includes the glider +1', `${glider.Landing}; ${glider.Load}`, /Glider .*\+1 \(glider\)/.test(glider.Landing ?? '') && (await declareEnabled()));
  await h.shot('allied-glider-drop-draft');
  const gliderFlight = await fly('Allied glider drop on 0306');
  record(h, 'AIR-14', 'The glider landing is rolled and the battalion lands on 0306 or is lost as the table says', `${gliderFlight.result.slice(0, 400)}; decisions: ${gliderFlight.decisions.join(' / ')} (${gliderFlight.elapsed} ms)`, /land|lost|eliminat/i.test(gliderFlight.result));
  const previewNumber = glider.Landing?.match(/fails on (\d+)/)?.[1];
  const resultNumber = gliderFlight.result.match(/fails on (\d+)/)?.[1];
  record(h, 'AIR-14', 'The preview and the result give the same Success Table number (glider +1 on the roll)', `preview ${previewNumber}, result ${resultNumber}`, previewNumber !== undefined && previewNumber === resultNumber);
  await h.shot('allied-glider-drop-flown');
  };

  // ── Axis Turn 2: the planned parachute drop on 1504 by the Ju.52s at 1707 ──
  const axisDrop = async () => {
  await openTransport('AIR_DROP', '1504', '1707');
  await setUnit('Fallschirmjäger', true);
  await setTokens(0);
  const para = await facts();
  record(h, 'AIR-14', 'The Fallschirmjäger drop by parachute from 1707 shows the Success Table number for 1504', `${para.Landing}; ${para.Load}; Flak ${para.Flak}`, /Parachute/.test(para.Landing ?? '') && (await declareEnabled()));
  await h.shot('axis-parachute-drop-draft');
  const paraFlight = await fly('Axis parachute drop on 1504');
  record(h, 'AIR-14', 'The parachute landing is rolled and reported', `${paraFlight.result.slice(0, 400)}; decisions: ${paraFlight.decisions.join(' / ')} (${paraFlight.elapsed} ms)`, /land|lost|eliminat/i.test(paraFlight.result));
  await h.shot('axis-parachute-drop-flown');
  };

  // Either side may win the Turn 2 initiative and move first, so each drop is flown when its side reaches Movement.
  const refitted = new Set();
  const flown = new Set();
  await advanceTo(h, () => flown.size === 2, {
    before: async (state) => {
      const key = `${state.turn}|${state.player}`;
      if (state.phase === 'Aircraft Refit Phase' && !refitted.has(key)) { refitted.add(key); await refitAll(h); return true; }
      const side = state.player.split(' ')[0];
      if (state.turn.startsWith('Turn 2 ') && state.phase === 'Movement' && !flown.has(side)) {
        flown.add(side);
        h.note(`Turn 2: ${side} moves ${flown.size === 1 ? 'first' : 'second'}`);
        await (side === 'Allied' ? alliedDrop() : axisDrop());
        return true;
      }
      return false;
    },
  });
  await tab(h, 'Log');
  const axisLog = await textOf(h, '.command-rail');
  h.note(`Axis log after the drop: ${axisLog.slice(0, 600)}`);
  record(h, 'AIR-13', 'No browser console or page error during the run', `${h.errors.length} errors`, h.errors.length === 0);
} catch (error) {
  record(h, 'AIR-13', 'The scenario completes', String(error.message), false);
  await h.shot('failure').catch(() => {});
}
h.note(`Flak was reported on ${flakSeen} flight(s).`);
await h.finish(`AIR-13 / AIR-14 / AIR-15 Air Transport, Drop Plans and Air Drops (rules seed ${rulesSeed})`);
await h.close();
process.exitCode = h.rows.some((row) => row.status !== 'PASS') ? 1 : 0;
