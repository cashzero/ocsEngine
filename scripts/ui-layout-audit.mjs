import { mkdir, writeFile } from 'node:fs/promises';
import { chromium } from 'playwright';
import {
  DEFAULT_NEW_GAME_REQUEST, applyRuleAction, createGameplayEngine, createMemoryGameplayPorts, createNewGameOrchestrator,
  declareTestCombat, hashGameState, hashScenarioDefinition, parseGameStateJson, serializeGameState,
} from '../dist/index.js';
import { detectLayoutIssues } from './ui-layout-detector.mjs';

// Layout audit (overflow, clipped controls, cramped spacing) over every phase/segment of the sequence.
// Needs `npm run build` and the UI served (`OCS_UI_PORT=4173 node scripts/serve-ui.mjs`; override with OCS_UI_URL).
//
// Rather than clicking through a whole game, this builds one save per sequence position (units placed next to each
// other, a combat declared, each pending decision), loads each through Menu > Load save, then walks every panel the
// position offers: each deck tab, the unit roster, a selected unit and every action in its picker, the End-phase
// confirmation. Any finding fails the run. Positions the product cannot load are listed as BLOCKED and also fail it.
//
// This is layout evidence only. It does not promote any row of docs/quality/03-product-operation-verification-plan.md:
// the positions are constructed, not reached by play.
//   Usage: node scripts/ui-layout-audit.mjs [--viewports 1920x1080,1680x1050,1280x720] [--out tmp/ui-layout-audit]
const args = process.argv.slice(2);
const option = (flag, fallback) => { const i = args.indexOf(flag); return i >= 0 ? args[i + 1] : fallback; };
const baseUrl = process.env.OCS_UI_URL ?? 'http://127.0.0.1:4173/';
const out = option('--out', 'tmp/ui-layout-audit');
const viewports = option('--viewports', '1920x1080,1680x1050,1280x720').split(',').map((v) => v.split('x').map(Number)).map(([width, height]) => ({ width, height }));
await mkdir(`${out}/saves`, { recursive: true });

// ── Positions ───────────────────────────────────────────────────────────────────────────────────────
const ALLIED = 'player:allied'; const AXIS = 'player:axis';
const request = { ...DEFAULT_NEW_GAME_REQUEST, oob: { ...DEFAULT_NEW_GAME_REQUEST.oob, air: 'STANDARD' } };
const created = await createNewGameOrchestrator(createGameplayEngine(createMemoryGameplayPorts())).create(request);
if (!created.ok) throw new Error(`New Game failed: ${JSON.stringify(created.error).slice(0, 300)}`);
const base = JSON.parse(created.value.session.serializeSave());
const parsedStart = parseGameStateJson(base.currentSnapshot);
if (!parsedStart.ok) throw new Error('start snapshot');
const start = parsedStart.value;
const defs = new Map(start.scenario.pieceCatalog.definitions.map((d) => [d.id, d]));
const onMap = (owner, family) => start.pieceState.pieces.filter((p) => p.ownerId === owner && defs.get(p.definitionId)?.family === family && p.location.kind === 'ON_MAP');
// Foot divisions are the combat-capable ground units; armor and artillery would need fuel or support first.
const foot = (owner) => onMap(owner, 'GROUND').filter((p) => /\.(Inf|Abn|VG|FJ)$/u.test(defs.get(p.definitionId).name));
const allied = foot(ALLIED); const axis = foot(AXIS);
const dumps = { allied: onMap(ALLIED, 'RESOURCE')[0], axis: onMap(AXIS, 'RESOURCE')[0] };
// H1 and H2 hold Allied units, H3 an Axis unit adjacent to both, so combat and breakthrough panels have targets.
const H1 = '10,11', H2 = '11,10', H3 = '11,11';
const placement = new Map([[allied[0].id, H1], [allied[1].id, H1], [allied[2].id, H2], [axis[0].id, H3], [dumps.allied.id, H1], [dumps.axis.id, '12,11']]);
const place = (state, sequence, steps = {}) => {
  const order = new Map();
  return { ...state, sequence: { ...state.sequence, ...sequence }, pieceState: { ...state.pieceState, pieces: state.pieceState.pieces.map((p) => {
    const hexId = placement.get(p.id); if (!hexId) return p;
    const n = (order.get(hexId) ?? 100) + 1; order.set(hexId, n);
    const ground = p.remainingSteps !== null && defs.get(p.definitionId)?.family === 'GROUND';
    return { ...p, location: { kind: 'ON_MAP', hexId }, stackOrder: n, ...(ground ? { mode: 'COMBAT', currentFaceId: 'combat' } : {}), ...(steps[p.id] ? { remainingSteps: steps[p.id] } : {}) };
  }) } };
};
const turn1 = { gameTurn: 1, playerTurnIndex: 0, phasingPlayerId: ALLIED, actingPlayerId: ALLIED, firstPlayerId: ALLIED };
const positions = [];
const blocked = [];
const write = async (name, state) => {
  const text = serializeGameState(state);
  if (!text.ok) { blocked.push({ name, reason: `serialize: ${JSON.stringify(text.error).slice(0, 200)}` }); return; }
  const reparsed = parseGameStateJson(text.value);
  if (!reparsed.ok) { blocked.push({ name, reason: `reparse: ${JSON.stringify(reparsed.error).slice(0, 200)}` }); return; }
  const hash = await hashGameState(reparsed.value); const scenarioHash = await hashScenarioDefinition(reparsed.value.scenario);
  const save = { ...base, label: `Layout audit ${name}`, initialSnapshot: text.value, currentSnapshot: text.value,
    initialStateHash: hash.value, finalStateHash: hash.value, scenarioHash: scenarioHash.value, acceptedActions: [], acceptedActionMetadata: [], checkpoints: [] };
  const file = `${out}/saves/${name}.json`;
  await writeFile(file, JSON.stringify(save)); positions.push({ name, file });
};
const sequencePositions = [
  ['FIRST_PLAYER', 'NONE'], ['AIRCRAFT_REFIT', 'NONE'], ['REINFORCEMENT', 'NONE'], ['MOVEMENT', 'MOVEMENT'], ['MOVEMENT', 'BARRAGE'],
  ['MOVEMENT', 'BREAKOUT'], ['SUPPLY', 'NONE'], ['REACTION', 'MOVEMENT'], ['COMBAT', 'COMBAT'], ['COMBAT', 'BARRAGE'],
  ['EXPLOITATION', 'MOVEMENT'], ['CLEAN_UP', 'NONE'],
];
// Reaction belongs to the non-phasing player.
const sequenceFor = (phase, segment) => ({ ...turn1, phase, segment, ...(phase === 'REACTION' ? { actingPlayerId: AXIS } : {}) });
for (const [phase, segment] of sequencePositions) await write(`${phase}-${segment}`, place(start, sequenceFor(phase, segment)));

// Pending decisions: declare a combat and write a position at each new decision kind it raises.
const combatBase = place(start, { ...turn1, phase: 'COMBAT', segment: 'COMBAT' }, { [axis[0].id]: 2 });
const pick = (decision) => {
  const ids = decision.options.map(({ id }) => id);
  if (decision.kind === 'OPTION_SPLIT') return ids.find((id) => /^option:0:\d+$/u.test(id)) ?? ids[0];
  if (decision.kind === 'RETREAT_HEX') return ids.find((id) => id.startsWith('hex:')) ?? ids[0];
  return ids[0];
};
{
  const declared = declareTestCombat({ ...combatBase, rng: { state: 7, draws: 0 } }, ALLIED, 'REGULAR', [allied[0].id, allied[1].id, allied[2].id], H3, allied[0].id);
  if (!declared.ok) blocked.push({ name: 'combat-declared', reason: `declare: ${declared.violations.map(({ code }) => code).join(',')}` });
  else {
    let state = declared.state; const kinds = new Set();
    for (let guard = 0; guard < 30; guard += 1) {
      const decision = state.pendingDecision;
      if (decision && !kinds.has(decision.kind)) { kinds.add(decision.kind); await write(`decision-${decision.kind}`, state); }
      if (!decision) { await write('combat-resolved', state); break; }
      const next = applyRuleAction(state, decision.ownerId, { kind: 'RESPOND_DECISION', decisionId: decision.id, choiceId: pick(decision) });
      if (!next.ok) { blocked.push({ name: `decision-${decision.kind}-next`, reason: next.violations.map(({ code }) => code).join(',') }); break; }
      state = next.state;
    }
  }
}

// ── Browser walk ────────────────────────────────────────────────────────────────────────────────────
const browser = await chromium.launch(process.env.OCS_CHROMIUM ? { executablePath: process.env.OCS_CHROMIUM, args: ['--no-sandbox'] } : {});
const report = []; const consoleErrors = []; const coverage = []; const reached = new Set();
const safe = (s) => String(s).replace(/\W+/g, '_');
for (const viewport of viewports) {
  const page = await browser.newPage({ viewport });
  page.on('pageerror', (e) => consoleErrors.push(`${viewport.width}: ${String(e)}`));
  page.on('console', (m) => { if (m.type() === 'error') consoleErrors.push(`${viewport.width}: ${m.text()}`); });
  const label = `${viewport.width}x${viewport.height}`;
  const audit = async (position, step) => {
    await page.waitForTimeout(150);
    const issues = await page.evaluate(detectLayoutIssues);
    coverage.push({ viewport: label, position, step });
    if (issues.length > 0) { await page.screenshot({ path: `${out}/${label}-${safe(position)}-${safe(step)}.png` }); report.push(...issues.map((i) => ({ viewport: label, position, step, ...i }))); }
  };
  const idle = () => page.waitForFunction(() => !document.querySelector('.deck-notice')?.textContent?.includes('Preparing action'), null, { timeout: 30000 }).catch(() => {});
  const handOver = async () => {
    for (let i = 0; i < 6; i++) {
      let acted = false;
      for (const selector of ['#begin-required-handoff', '#complete-handoff', '#dismiss-away', '#dismiss-result']) {
        const element = await page.$(`${selector}:not(:disabled)`);
        if (element && await element.isVisible()) { await element.click(); await idle(); await page.waitForTimeout(150); acted = true; break; }
      }
      if (!acted) return;
    }
  };
  await page.goto(baseUrl); await page.waitForSelector('#open-menu', { timeout: 30000 });
  await page.click('#open-menu'); await page.click('#open-new-game'); await audit('new-game', 'configure-basic');
  await page.click('[data-settings="advanced"]'); await audit('new-game', 'configure-advanced'); await page.click('[data-settings="basic"]');
  await page.click('button[form="new-game-form"]'); await page.waitForSelector('#start-previewed-game:not(:disabled)', { timeout: 60000 }); await audit('new-game', 'preview');
  await page.click('#start-previewed-game'); await page.waitForFunction(() => !document.querySelector('.new-game-dialog'), null, { timeout: 60000 }); await idle();
  await page.click('#open-menu'); await audit('menu', 'open'); await page.click('#close-utility');

  for (const position of positions) {
    await page.click('#open-menu');
    const [chooser] = await Promise.all([page.waitForEvent('filechooser'), page.click('#load-game')]);
    await chooser.setFiles(position.file);
    const loaded = await page.waitForFunction(() => document.querySelector('.deck-notice')?.textContent?.includes('Save loaded'), null, { timeout: 15000 }).then(() => true, () => false);
    if (!loaded) { blocked.push({ name: `${position.name} @${label}`, reason: 'UI did not report "Save loaded"' }); await page.keyboard.press('Escape'); continue; }
    await idle(); await handOver();
    await audit(position.name, 'landing');
    const tabs = await page.$$eval('[data-deck-tab]', (b) => b.map((e) => e.dataset.deckTab));
    for (const tab of tabs) { await page.click(`[data-deck-tab="${tab}"]`).catch(() => {}); await audit(position.name, `tab-${tab}`); }
    if (await page.$('[data-choice]')) await audit(position.name, 'decision');
    // Roster, then a selected unit with each of its actions.
    if (await page.$('#open-roster')) {
      await page.click('#open-roster'); await audit(position.name, 'roster');
      const units = await page.$$('.roster-unit:not(:has(.concealed))');
      for (const index of [0, 2, 5].filter((i) => i < units.length)) {
        if (!(await page.$('.roster-popup'))) await page.click('#open-roster');
        const fresh = await page.$$('.roster-unit:not(:has(.concealed))');
        await fresh[index].click(); await idle(); await audit(position.name, `unit-${index}`);
        for (const value of await page.$$eval('#deck-action option', (o) => o.map((e) => e.value))) {
          await page.selectOption('#deck-action', value).catch(() => {}); await idle(); await page.waitForTimeout(200);
          await audit(position.name, `unit-${index}-action-${value}`);
        }
        await page.click('#deselect').catch(() => {});
      }
      if (await page.$('.roster-popup')) await page.click('#close-roster').catch(() => {});
    }
    // Act on a neighbouring hex with the map's keyboard cursor, from a placed unit, to reach the move preview or the
    // combat plan (whichever the phase offers). Each is cancelled again so the position stays unchanged.
    const panels = [['#confirm-move', '#cancel-move', 'move-preview'], ['#declare-draft', '#cancel-draft', 'combat-plan']];
    if (await page.$('#open-roster')) {
      for (const key of ['ArrowRight', 'ArrowLeft', 'ArrowDown', 'ArrowUp']) {
        if (!(await page.$('.roster-popup'))) await page.click('#open-roster');
        const placed = page.locator('.roster-unit', { hasText: '1612' }).first();
        if (await placed.count() === 0) { await page.click('#close-roster').catch(() => {}); break; }
        await placed.click(); await idle();
        await page.focus('#hex-map');
        // The map cursor keeps its last hex, so walk it from the corner (0101) to the placed unit's hex (1612).
        for (const [k, n] of [['ArrowLeft', 40], ['ArrowUp', 30], ['ArrowRight', 15], ['ArrowDown', 11]]) for (let i = 0; i < n; i++) await page.keyboard.press(k);
        await page.keyboard.press(key); await page.keyboard.press('Enter'); await idle(); await page.waitForTimeout(250);
        for (const [open, cancel, step] of panels) {
          if (await page.$(open)) { await audit(position.name, step); reached.add(`${position.name}:${step}`); await page.click(cancel).catch(() => {}); await idle(); break; }
        }
      }
      await page.click('#deselect').catch(() => {});
    }
    const end = await page.$('#end-phase:not(:disabled)');
    if (end) { await end.click(); await page.waitForTimeout(250); await audit(position.name, 'end-phase-prompt'); }
  }
  await page.close();
}
await browser.close();

const summary = { reachedPanels: [...reached], viewports: viewports.map((v) => `${v.width}x${v.height}`), positions: positions.map((p) => p.name), checkedStates: coverage.length, issues: report, blocked, consoleErrors };
await writeFile(`${out}/evidence.json`, JSON.stringify(summary, null, 2));
const byKind = new Map();
for (const i of report) { const k = `${i.kind} | ${i.el ?? ''}${i.other ? ' x ' + i.other : ''}`; byKind.set(k, (byKind.get(k) ?? 0) + 1); }
console.log(`Checked ${coverage.length} states across ${positions.length} positions x ${viewports.length} viewports.`);
for (const [k, n] of byKind) console.log(`  ${n}x ${k}`);
console.log(`Panels reached by cursor action: ${reached.size > 0 ? [...reached].join(', ') : 'none'}`);
for (const b of blocked) console.log(`  BLOCKED ${b.name}: ${b.reason}`);
for (const e of consoleErrors.slice(0, 5)) console.log(`  console error ${e}`);
const failed = report.length > 0 || blocked.length > 0 || consoleErrors.length > 0;
console.log(failed ? `FAIL: ${report.length} layout issue(s), ${blocked.length} blocked position(s). Evidence in ${out}/evidence.json` : 'No layout issues found in the covered states.');
process.exitCode = failed ? 1 : 0;
