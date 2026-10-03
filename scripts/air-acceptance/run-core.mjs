// AIR-01 to AIR-06 and AIR-08 of docs/quality/03-product-operation-verification-plan.md, section F, on one generated game:
// the preview and the map from each seat, Base Transfer, a Fighter Sweep, an intercepted Air Barrage, the one-barrage-per-hex
// and one-mission-per-aircraft limits, Trainbusting, an Air Base barrage on the Facility Table, and Refit.
// Allied Air Bases are at 0305 and 0504, Axis Air Bases at 1407 and 1707 (seeds below).
import { join } from 'node:path';
import { advanceTo, click, endPhase, gotoHex, has, hexDistance, newGame, open, record, selectUnit, settleLogged, tab, textOf, timed, where } from './harness.mjs';

const evidenceDir = join(process.argv[2] ?? 'docs/quality/evidence/air-2026-10-03', `air-01-08-rules-${process.argv[3] ?? 5104}`);
const h = await open({ evidenceDir });
const seeds = { map: 5101, oob: 5102, deployment: 5103, rules: Number(process.argv[3] ?? 5104) };
const at = (turn, side, phase) => (state) => state.turn.startsWith(`Turn ${turn} `) && state.player.startsWith(side) && state.phase === phase;
const panel = () => textOf(h, '.air-panel');
const listed = () => h.page.evaluate(() => [...document.querySelectorAll('.air-panel .participant')].map((node) => node.innerText.replace(/\s+/g, ' ').trim()));
const chips = () => h.page.evaluate(() => [...document.querySelectorAll('.hex-chips [data-target-hex]')].map((node) => node.textContent.trim()));

/** Open a mission on a hex and tick exactly the aircraft whose row matches `aircraft`. Returns false when the hex is not offered. */
const draft = async (mission, hex, aircraft) => {
  await tab(h, 'Air');
  await click(h, `[data-air-mission="${mission}"]`);
  if (!(await chips()).includes(hex)) return false;
  await h.page.locator('.hex-chips [data-target-hex]', { hasText: hex }).first().click();
  await h.page.waitForTimeout(400);
  const rows = h.page.locator('.air-panel .participant');
  for (let index = 0; index < (await rows.count()); index += 1) {
    const box = rows.nth(index).locator('[data-air-aircraft]');
    if ((await box.count()) === 0) continue;
    const label = (await rows.nth(index).innerText()).replace(/s+/g, ' ').trim();
    const want = typeof aircraft === 'function' ? aircraft(label) : aircraft.test(label);
    if ((await box.isChecked()) !== want) { await box.click(); await h.page.waitForTimeout(250); }
  }
  return true;
};
/** The status line the deck prints under a unit's name (Active/Inactive for aircraft), read by selecting it in the roster. */
const statusOf = async (name) => {
  await selectUnit(h, name);
  const text = await textOf(h, '.command-rail');
  return text.match(new RegExp(`${name}[^]{0,40}?(Active|Inactive)[^]{0,30}`))?.[0] ?? text.slice(0, 160);
};
/** A matcher that accepts the first `count` rows matching `pattern`, for "any two Active Fighters". */
const firstOf = (count, pattern) => { let taken = 0; return (label) => pattern.test(label) && taken++ < count; };
/** Fuel the Allied Engineer if needed, then read the map's hover cost from it to each neighbouring hex. */
let engineerHex = null;
let trainHex = null;
let before = [];
const engineerCosts = async () => {
  await selectUnit(h, 'Engr Gp');
  if (await has(h, '.fuel-panel [data-unit-action]')) await click(h, '.fuel-panel [data-unit-action]', { settle: 500 });
  await selectUnit(h, 'Engr Gp');
  const costs = [];
  for (let dc = -1; dc <= 1; dc += 1) for (let dr = -1; dr <= 1; dr += 1) {
    const label = String(Number(engineerHex.slice(0, 2)) + dc).padStart(2, '0') + String(Number(engineerHex.slice(2, 4)) + dr).padStart(2, '0');
    if (label === engineerHex || hexDistance(label, engineerHex) !== 1) continue;
    const line = await gotoHex(h, label).catch(() => '');
    costs.push({ label, cost: Number(line.match(/ · ([\d.]+) MP, /)?.[1] ?? NaN), zone: hexDistance(label, trainHex) <= 1 });
  }
  h.note(`Engineer at ${engineerHex}: ${costs.map(({ label, cost, zone }) => `${label}${zone ? ' (zone)' : ''} ${cost} MP`).join(', ')}`);
  return costs;
};
const fly = async (label, pick) => {
  const { elapsed } = await timed(h, label, () => click(h, '#declare-air-mission', { settle: 500 }));
  const steps = await settleLogged(h, pick);
  const result = await textOf(h, '.deck-context');
  h.note(`${label}: ${result.slice(0, 500)} (${elapsed} ms to the first response)`);
  return { elapsed, steps, result };
};

try {
  // ── AIR-01: the preview ──
  let previewAir = '';
  await newGame(h, {
    seeds, turnLimit: 6,
    onPreview: async () => {
      const summaries = h.page.locator('details.counter-formation summary', { hasText: 'Air forces' });
      for (let index = 0; index < (await summaries.count()); index += 1) await summaries.nth(index).click();
      await h.page.waitForTimeout(400);
      previewAir = await h.page.evaluate(() => [...document.querySelectorAll('details.counter-formation[open]')].filter((node) => node.querySelector('summary')?.textContent.includes('Air forces')).map((node) => node.innerText.replace(/\s+/g, ' ').trim()).join(' || '));
      await h.shot('preview-air-forces');
    },
  });
  h.note(`Preview air forces: ${previewAir}`);
  record(h, 'AIR-01', 'The preview lists each side\'s aircraft and Air Bases as counters', previewAir.slice(0, 400), /Air forces: \d+ aircraft, 2 Air Base/.test(previewAir) && /P-51/.test(previewAir) && /Fw-190|Bf\.109/.test(previewAir));
  const own = { '0305': await gotoHex(h, '0305'), '0504': await gotoHex(h, '0504') };
  const enemy = { '1407': await gotoHex(h, '1407'), '1707': await gotoHex(h, '1707') };
  h.note(`Allied seat sees: ${JSON.stringify({ ...own, ...enemy })}`);
  record(h, 'AIR-01', 'Allied seat: its own Air Bases show every aircraft and unit', `${own['0305']} | ${own['0504']}`, /Allied Air Base 1/.test(own['0305']) && /P-38/.test(own['0305']) && /Allied Air Base 2/.test(own['0504']) && !/hidden/.test(own['0305']));
  const redacted = (text) => (text.match(/enemy [^,]*(Fw-190|Bf\.109|Ju\.)/g) ?? []).length <= 1 && /enemy Axis Air Base/.test(text) && /hidden/.test(text);
  record(h, 'AIR-01', 'Allied seat: an enemy Air Base shows only the base, its top Active plane and top combat unit; the rest are counted as hidden (4.9a)', `${enemy['1407']} | ${enemy['1707']}`, redacted(enemy['1407']) && redacted(enemy['1707']));
  await gotoHex(h, '1407', { enter: true });
  await h.shot('allied-view-of-axis-base-1407');

  await advanceTo(h, at(1, 'Allied', 'Movement'));

  // ── AIR-03: Fighter Sweep against the Axis Air Base at 1407 ──
  // A Fighter Sweep is flown by one Fighter here ("Choose the aircraft that flies").
  await draft('FIGHTER_SWEEP', '1407', /354th FG/);
  await h.shot('sweep-draft');
  const sweep = await fly('Fighter Sweep on 1407', (prompt, options) => Math.max(0, options.findIndex((text) => /Original Air Base/.test(text))));
  await h.shot('sweep-result');
  const seats = [...new Set(sweep.steps.map(({ seat }) => seat))];
  record(h, 'AIR-03', 'Both seats answer during the sweep, with the screen handed over between them', sweep.steps.map(({ seat, handedOver, prompt }) => `${seat}${handedOver ? ' [handoff]' : ''}: ${prompt.slice(0, 80)}`).join(' / '), seats.length === 2 && sweep.steps.some(({ handedOver }) => handedOver));
  record(h, 'AIR-03', 'Voluntary aborts are offered (14.4c)', sweep.steps.filter(({ prompt }) => /abort/i.test(prompt)).map(({ seat, options }) => `${seat}: ${options.join(' | ')}`).join(' / ') || 'no abort prompt', sweep.steps.some(({ prompt }) => /abort/i.test(prompt)));
  record(h, 'AIR-03', 'Air Combat picks alternate and each round result is shown', sweep.result.slice(0, 400), /vs .*: \d+ \(roll/.test(sweep.result));
  record(h, 'AIR-03', 'The fighters return to an Air Base (original first)', sweep.steps.filter(({ prompt }) => /return|base/i.test(prompt)).map(({ chosen }) => chosen).join(' / ') || sweep.result.slice(-200), sweep.steps.some(({ chosen }) => /Original Air Base/.test(chosen ?? '')) || /return/i.test(sweep.result));
  await draft('FIGHTER_SWEEP', '1407', /^$/);
  const afterSweep = await listed();
  await click(h, '#cancel-air-mission');
  const sweepStatus = await statusOf('354th FG');
  record(h, 'AIR-03', 'The P-38 is Inactive at its base afterwards', sweepStatus, /Inactive/.test(sweepStatus));
  record(h, 'AIR-08', 'A second mission with the same aircraft is unavailable: the P-38 is no longer offered', `offered: ${afterSweep.join(' / ')}`, !afterSweep.some((text) => /354th FG/.test(text)) && afterSweep.some((text) => /365th FG/.test(text)));

  // ── AIR-04: an Air Barrage into an enemy Patrol Zone, intercepted ──
  await endPhase(h);
  const segment = await where(h);
  record(h, 'AIR-04', 'The Barrage Segment offers Air Barrage', segment.phase, /Barrage/.test(segment.phase));
  // The two A-20s with the P-51 as escort, so that an interception can be met by the escort and the bombers go on to Flak.
  await draft('BARRAGE', '1503', /A-20|365th FG/);
  const barrageDraft = await panel();
  record(h, 'AIR-04', 'The barrage preview shows the column, shifts, Flak with its modifiers and that the hex is in an enemy Patrol Zone', barrageDraft.slice(0, 420), /Table column/.test(barrageDraft) && /Flak \+\d/.test(barrageDraft) && /Enemy Patrol Zone yes/.test(barrageDraft));
  await h.shot('barrage-draft');
  const barrage = await fly('Air Barrage on 1503', (prompt, options, seat) => {
    if (/Intercept with one Active Fighter/.test(prompt)) return Math.max(0, options.findIndex((text) => text.startsWith('Intercept with')));
    if (/Choose the aircraft that meets it/.test(prompt)) return Math.max(0, options.findIndex((text) => /FG/.test(text)));
    const original = options.findIndex((text) => /Original Air Base/.test(text));
    return original >= 0 ? original : 0;
  });
  await h.shot('barrage-result');
  const interception = barrage.steps.find(({ prompt }) => /Intercept/.test(prompt));
  record(h, 'AIR-04', 'The Axis owner decides interception after a handoff', interception ? `${interception.seat}${interception.handedOver ? ' after a handoff' : ''}: ${interception.chosen}` : 'no interception prompt', !!interception && /Axis/.test(interception.seat) && interception.handedOver);
  record(h, 'AIR-04', 'Air Combat, Flak with its roll, Mission Loss (if any) and the barrage result are shown', barrage.result.slice(0, 700), /Flak: \d+/.test(barrage.result) && /vs /.test(barrage.result) && /Barrage|barrage/.test(barrage.result));
  await tab(h, 'Air');
  await click(h, '[data-air-mission="BARRAGE"]');
  const again = await chips();
  await click(h, '#cancel-air-mission');
  record(h, 'AIR-08', 'A second barrage on 1503 in this segment is not offered (10.0e)', `targets now: ${again.join(' ')}`, !again.includes('1503'));

  // The Allied Engineer's hex: the Axis will Trainbust a hex beside it, and the Allied player will pay for it on Turn 2.
  await selectUnit(h, 'Engr Gp');
  engineerHex = (await textOf(h, '.command-rail')).match(/(\d{4}) · /)?.[1];
  h.note(`Allied Engineer at ${engineerHex}`);

  // ── Axis Turn 1: the Allied bases from the Axis seat; the Facility Table; Trainbusting ──
  await advanceTo(h, at(1, 'Axis', 'Aircraft Refit Phase'));
  const axisOwn = { '1407': await gotoHex(h, '1407') };
  const axisEnemy = { '0305': await gotoHex(h, '0305'), '0504': await gotoHex(h, '0504') };
  h.note(`Axis seat sees: ${JSON.stringify({ ...axisOwn, ...axisEnemy })}`);
  const redactedAllied = (text) => (text.match(/enemy [^,]*(P-51|P-38|A-20|C-47)/g) ?? []).length <= 1 && /enemy Allied Air Base/.test(text);
  record(h, 'AIR-01', 'Axis seat: the Allied Air Bases show only the base, the top Active plane and top combat unit (4.9a)', `${axisEnemy['0305']} | ${axisEnemy['0504']}`, redactedAllied(axisEnemy['0305']) && redactedAllied(axisEnemy['0504']));
  await advanceTo(h, at(1, 'Axis', 'Movement'));
  await endPhase(h);
  // Trainbusting first, with the two Fighters that have not flown, on a hex beside the Allied Engineer.
  await tab(h, 'Air');
  await click(h, '[data-air-mission="TRAINBUSTING"]');
  const trainChips = await chips();
  await click(h, '#cancel-air-mission');
  const beside = trainChips.filter((hex) => engineerHex && hexDistance(hex, engineerHex) === 1);
  trainHex = beside[0] ?? trainChips[0];
  h.note(`Trainbusting candidates beside the Engineer (${engineerHex}): ${beside.join(' ')}`);
  let trainbusted = false;
  if (await draft('TRAINBUSTING', trainHex, firstOf(2, /\bJG \d/))) {
    await h.shot('trainbusting-draft');
    const train = await fly(`Trainbusting on ${trainHex}`, (prompt, options) => Math.max(0, options.findIndex((text) => /Original Air Base|Do not intercept/.test(text))));
    const markerNow = await gotoHex(h, trainHex);
    trainbusted = /Trainbusting marker/.test(markerNow);
    record(h, 'AIR-05', `Axis Trainbusting on ${trainHex}, beside the Allied Engineer at ${engineerHex}: the roll and the marker`, `${train.result.slice(0, 260)} | map: ${markerNow}`, /Trainbusting/.test(train.result) && (trainbusted || /no Trainbusting/.test(train.result)));
    await h.shot('trainbusting-marker');
  } else record(h, 'AIR-05', `Trainbusting on ${trainHex} is offered`, trainChips.join(' '), false);

  // The Facility Table: the Ju.88 with an escort against 0305, where every Allied Fighter is Inactive after Turn 1.
  const baseBefore = await gotoHex(h, '0305');
  const fighter = firstOf(1, /\bJG \d/);
  const facility = await draft('BARRAGE', '0305', (label) => /\bKG \d/.test(label) || fighter(label));
  if (facility && (await has(h, '[data-air-target="AIR_BASE"]'))) await click(h, '[data-air-target="AIR_BASE"]');
  const facilityDraft = facility ? await panel() : '';
  if (/Air Base Level/.test(facilityDraft)) {
    await h.shot('facility-barrage-draft');
    const hit = await fly('Axis Air Barrage on the Allied Air Base at 0305 (Facility Table)', (prompt, options) => Math.max(0, options.findIndex((text) => /Do not intercept|Original Air Base/.test(text))));
    const levels = `${hit.result}`.match(/Level \d[^.]*/g) ?? [];
    record(h, 'AIR-06', 'An Air Base is barraged on the Facility Table; the result is shown and the Level never drops below 1', `${facilityDraft.slice(0, 220)} | result: ${hit.result.slice(0, 420)} | before: ${baseBefore}`, /Facility/.test(hit.result) && !/Level 0/.test(hit.result));
    h.note(`Facility result levels: ${levels.join(' / ') || 'none named'}`);
    await h.shot('facility-barrage-result');
  } else {
    record(h, 'AIR-06', 'An Air Barrage on the Allied Air Base at 0305 on the Facility Table is offered', facility ? facilityDraft.slice(0, 300) : (await chips()).join(' '), false);
    if (await has(h, '#cancel-air-mission')) await click(h, '#cancel-air-mission');
  }

  // ── Turn 2: Refit (AIR-02); the Allied Engineer pays +1 MP to enter the Trainbusting hex; the marker goes at the Allied Clean Up ──
  await advanceTo(h, at(2, 'Allied', 'Aircraft Refit Phase'));
  await tab(h, 'Refit');
  const refitPanel = await textOf(h, '.command-rail');
  await h.shot('refit-panel');
  record(h, 'AIR-02', 'The Refit panel shows the 1T cost per base, the 2 × Level capacity, the ZOC restriction and the Active limit', refitPanel.slice(0, 600), /1T/.test(refitPanel) && /Level/.test(refitPanel) && /ZOC/.test(refitPanel) && /Active/.test(refitPanel));
  const { elapsed } = await timed(h, 'Refit one Air Base', () => click(h, '[data-refit]:not([disabled])', { settle: 500 }));
  const refitted = await where(h);
  record(h, 'AIR-02', 'Refitting pays 1T and makes the aircraft Active', `notice "${refitted.notice}" (${elapsed} ms)`, /Refit/i.test(refitted.notice));
  await h.shot('refit-done');
  await advanceTo(h, at(2, 'Allied', 'Movement'));
  await draft('FIGHTER_SWEEP', '1407', /^$/);
  const activeAgain = await listed();
  await click(h, '#cancel-air-mission');
  record(h, 'AIR-02', 'The refitted aircraft are offered for missions again', activeAgain.join(' / '), activeAgain.some((text) => /354th FG/.test(text)));
  // ── AIR-06: Base Transfer of a Fighter within range ──
  if (await draft('BASE_TRANSFER', '0305', /48th FG/)) {
    const transfer = await fly('Base Transfer 48th FG P-51 0504 → 0305');
    const moved = await gotoHex(h, '0305');
    const status = await statusOf('48th FG');
    record(h, 'AIR-06', 'A Fighter Base Transferred within its range is at the new base and stays Active (14.11)', `${transfer.result.slice(0, 120)} | 0305: ${moved} | 48th FG: ${status}`, /48th FG/.test(moved) && /Active/.test(status) && !/Inactive/.test(status));
    await h.shot('base-transfer-active');
  } else record(h, 'AIR-06', 'Base Transfer to 0305 is offered', 'not offered', false);
  if (trainbusted) {
    const markerAllied = await gotoHex(h, trainHex);
    record(h, 'AIR-05', 'In the Allied Movement the marker is named on the map for the Allied player', markerAllied, /Trainbusting marker \(enemy\)/.test(markerAllied));
    // The Engineer is motorized (it needs fuel to move), so the marker hex and the six around it cost it +1 MP (14.8b).
    // Hover costs are path costs, so the same hexes are measured again on Turn 3, after the marker is gone.
    before = await engineerCosts();
    await gotoHex(h, trainHex);
    await h.shot('trainbusting-move-cost');
  } else h.note('The Trainbusting roll failed, so no marker was placed and the movement cost could not be observed in this run.');
  await advanceTo(h, (state) => !(state.turn.startsWith('Turn 2 ') && state.player.startsWith('Allied')));
  const markerGone = await gotoHex(h, trainHex);
  const later = await where(h);
  if (trainbusted) {
    record(h, 'AIR-05', 'After the Allied Clean Up the Trainbusting marker is gone', `${later.turn} ${later.player}: ${markerGone}`, !/Trainbusting marker/.test(markerGone));
    await advanceTo(h, at(3, 'Allied', 'Movement'));
    const after = await engineerCosts();
    const rows = before.map((entry) => ({ ...entry, after: after.find(({ label }) => label === entry.label)?.cost }));
    const text = rows.map(({ label, zone, cost, after: now }) => `${label}${zone ? ' (zone)' : ''} ${cost} → ${now} MP`).join(', ');
    const zoneRows = rows.filter(({ zone, cost, after: now }) => zone && Number.isFinite(cost) && Number.isFinite(now));
    const otherRows = rows.filter(({ zone, cost, after: now }) => !zone && Number.isFinite(cost) && Number.isFinite(now));
    record(h, 'AIR-05', `With the marker, the motorized Engineer at ${engineerHex} paid exactly 1 MP more to enter each zone hex (Turn 2 → Turn 3); a hex outside the zone changes only when its cheapest path crossed the zone`, text, zoneRows.length > 0 && zoneRows.every(({ cost, after: now }) => cost === now + 1) && otherRows.every(({ cost, after: now }) => cost - now <= 1) && otherRows.some(({ cost, after: now }) => cost === now));
  }
  record(h, 'AIR-01', 'No browser console or page error during the run', `${h.errors.length} errors`, h.errors.length === 0);
} catch (error) {
  record(h, 'AIR-01', 'The scenario completes', String(error.stack ?? error.message), false);
  await h.shot('failure').catch(() => {});
}
const final = await where(h).catch(() => ({}));
h.note(`Final: ${JSON.stringify(final)}`);
await h.finish('AIR-01 to AIR-06, AIR-08: air operations through the command deck');
await h.close();
process.exitCode = h.rows.some((row) => row.status !== 'PASS') ? 1 : 0;
