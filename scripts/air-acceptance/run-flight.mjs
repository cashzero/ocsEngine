// AIR-16: flying weather through the command deck. A January game (snow, so the 2d6 Flight roll gives None and Limited
// often) is played turn by turn. Each Movement, Reaction and Exploitation Phase of each player turn, the page's turn bar
// names the Flight result and the Air tab is read for the mission buttons it offers; the offer must match the rule
// (Normal: every phase; Limited: Movement only; None: nothing). Refits are done whenever offered.
import { join } from 'node:path';
import { advanceTo, click, has, newGame, open, record, refitAll, tab, where } from './harness.mjs';

const evidenceDir = join(process.argv[2] ?? 'artifacts/air-flight', 'air-16');
const turnLimit = Number(process.argv[3] ?? 4);
const seedBase = Number(process.argv[4] ?? 5301);
const h = await open({ evidenceDir });
const seeds = { map: seedBase, oob: seedBase + 1, deployment: seedBase + 2, rules: seedBase + 3 };
const seen = new Set();
const shots = new Set();
const observed = [];

try {
  await newGame(h, { seeds, turnLimit, month: 1 });
  h.note(`New Game: Standard scale, air forces + transports, January start, ${turnLimit} turns, seeds ${JSON.stringify(seeds)}`);
  await advanceTo(h, async () => has(h, '#download-final-save'), {
    limit: 800,
    before: async (state) => {
      const side = state.player.split(' ')[0];
      if (state.phase === 'Aircraft Refit Phase' && !seen.has(`refit|${state.turn}|${side}`)) { seen.add(`refit|${state.turn}|${side}`); await refitAll(h); return true; }
      if (!/^(Movement|Reaction|Exploitation)/.test(state.phase)) return false;
      const key = `${state.turn}|${side}|${state.phase}`;
      if (seen.has(key)) return false;
      seen.add(key);
      const label = (await h.page.locator('.turn-cell strong').innerText()).trim();
      const flight = (await h.page.locator('.rail-cap-cell', { hasText: 'Flight' }).locator('strong').innerText().catch(() => 'unnamed')).trim();
      const hasTab = (await h.page.locator('[data-deck-tab]', { hasText: /^\s*Air/u }).count()) > 0;
      if (hasTab) await tab(h, 'Air');
      const enabled = await h.page.locator('[data-air-mission]:not([disabled])').count();
      const total = await h.page.locator('[data-air-mission]').count();
      const bodyText = hasTab ? (await h.page.locator('.deck-context, .air-panel, .flight-notice').allInnerTexts()).join(' ').replace(/\s+/g, ' ') : 'no Air tab';
      const regularMovement = /^Movement/.test(state.phase);
      const expectOffered = flight === 'Normal' ? 'maybe' : flight === 'Limited' ? (regularMovement ? 'maybe' : 'no') : 'no';
      const blocked = expectOffered === 'no';
      const ok = flight !== 'unnamed' && (!blocked || (enabled === 0 && (!hasTab || /Flying weather|flying weather/.test(bodyText) || total === 0)));
      observed.push({ turn: state.turn, side, phase: state.phase, label, flight, enabled, total });
      record(h, 'AIR-16', `Turn bar names the Flight result and the Air tab follows it (${state.turn} ${side} ${state.phase})`,
        `"${label}", Flight ${flight}: ${enabled}/${total} mission buttons enabled; panel: ${bodyText.slice(0, 160)}`, ok);
      const shotKey = `${flight}|${regularMovement}`;
      if (!shots.has(shotKey)) { shots.add(shotKey); await h.shot(`${flight.toLowerCase()}-${state.phase.toLowerCase()}`); }
      return false;
    },
  });
  const flights = new Set(observed.map(({ flight }) => flight));
  h.note(`Observed ${observed.length} air-eligible phases; Flight results seen: ${[...flights].join(', ')}`);
  h.note(`Flight x phase: ${JSON.stringify(Object.entries(observed.reduce((acc, o) => { const k = o.flight + '/' + o.phase.split(' ')[0]; acc[k] = (acc[k] ?? 0) + (o.enabled > 0 ? 1 : 0) * 1000 + 1; return acc; }, {})).map(([k, v]) => k + ': ' + (v % 1000) + ' phases, ' + Math.floor(v / 1000) + ' offering missions'))}`);
  record(h, 'AIR-16', 'The game reaches Game End with no dead end', JSON.stringify(await where(h)), await has(h, '#download-final-save'));
  record(h, 'AIR-16', 'No browser console or page error during the run', `${h.errors.length} errors`, h.errors.length === 0);
} catch (error) {
  record(h, 'AIR-16', 'The scenario completes', String(error.stack ?? error.message), false);
  await h.shot('failure').catch(() => {});
}
await h.finish(`AIR-16 flying weather (${turnLimit} turns, seeds ${JSON.stringify(seeds)})`);
await h.close();
process.exitCode = h.rows.some((row) => row.status !== 'PASS') ? 1 : 0;
