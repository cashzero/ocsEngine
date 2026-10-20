// Moving a stack together (6.1f) and overrunning with it (8.0-8.1), operated in the built UI in a real browser.
// Every step is a click or key press on a visible control; every observation is read from the page.
// Usage: npm run build && node scripts/stack-move-acceptance.mjs [evidenceDir]
import * as harness from './air-acceptance/harness.mjs';
import { payFuel } from './product-acceptance/lib.mjs';

const { open, newGame, where, click, has, textOf, gotoHex, record, advanceTo, settleDecisions } = harness;
const evidenceDir = process.argv[2] ?? 'tmp/stack-move-acceptance';
const h = await open({ evidenceDir });

/** Printed hex number of a hex ID, as presenter.ts prints it. */
const printed = (id) => {
  const [q, r] = id.split(',').map(Number);
  return `${String(q + Math.floor(r / 2) + 1).padStart(2, '0')}${String(r + 1).padStart(2, '0')}`;
};
const mapState = () => h.page.evaluate(() => {
  const state = window.ocsMap.state;
  return {
    counters: state.counters.map(({ pieceId, hexId, label, selected }) => ({ pieceId, hexId, label, selected })),
    reachable: [...state.reachable.entries()].map(([hexId, value]) => ({ hexId, endsMovement: value.endsMovement })),
    attack: [...state.attack],
  };
});
const stackPanel = () => textOf(h, '.stack-together');
const mates = () => h.page.evaluate(() => [...document.querySelectorAll('[data-stack-mate]')]
  .map((node) => ({ id: node.dataset.stackMate, pressed: node.getAttribute('aria-pressed') === 'true', disabled: node.disabled, text: node.textContent.trim(), title: node.title })));
const hexOfPiece = async (pieceId) => (await mapState()).counters.find((counter) => counter.pieceId === pieceId)?.hexId ?? null;
const neighbours = (id) => {
  const [q, r] = id.split(',').map(Number);
  return [[1, 0], [-1, 0], [0, 1], [0, -1], [1, -1], [-1, 1]].map(([dq, dr]) => `${q + dq},${r + dr}`);
};

try {
  // OCS_SEED and OCS_DIVISIONS pick another generated operation; the defaults are the recorded run.
  const seed = Number(process.env.OCS_SEED ?? 93001);
  await newGame(h, { style: 'WESTERN_EUROPE', width: 16, height: 12, scale: 'COMPACT', divisions: Number(process.env.OCS_DIVISIONS ?? 2), armored: 1, turnLimit: 3, seeds: { map: seed, oob: seed + 1, deployment: seed + 2, rules: Number(process.env.OCS_RULES_SEED ?? seed + 3) } });
  await advanceTo(h, (state) => /Movement/i.test(state.phase) && !state.handoff && !state.complete);
  h.note(`At ${JSON.stringify(await where(h))}`);
  await h.shot('movement-phase');

  const enemyHexes = new Set((await mapState()).counters.filter(({ label }) => label.startsWith('Enemy')).map(({ hexId }) => hexId));
  // Enter on a hex in the selected unit's range would move it there: let go of any selection first.
  const release = async () => { if (await has(h, '#finish-move')) await click(h, '#finish-move'); if (await has(h, '#deselect')) await click(h, '#deselect'); };
  const used = new Set();

  /** Select a friendly hex holding several units, fuel them (12.5a) and tick the whole stack. */
  const takeStack = async (id) => {
    const own = (await mapState()).counters.filter(({ label }) => !label.startsWith('Enemy'));
    const hexes = [...new Set(own.map(({ hexId }) => hexId))].filter((hexId) => !used.has(hexId) && own.filter((counter) => counter.hexId === hexId).length >= 2);
    for (const hexId of hexes) {
      used.add(hexId);
      await release();
      await gotoHex(h, printed(hexId), { enter: true });
      for (let guard = 0; guard < 4; guard += 1) {
        if (await has(h, '[data-fuel-method="FORMATION"]')) await payFuel(h, 'FORMATION');
        else if (await has(h, '[data-fuel-method]')) await payFuel(h, (await h.page.getAttribute('[data-fuel-method]', 'data-fuel-method')));
        const blocked = (await mates()).find(({ disabled, title }) => disabled && /fuel/i.test(title));
        if (!blocked) break;
        await click(h, '#open-roster');
        await h.page.locator(`[data-roster-pick="${blocked.id}"]`).first().click();
        await h.page.waitForTimeout(300);
      }
      await release();
      await gotoHex(h, printed(hexId), { enter: true });
      if (!(await mates()).some(({ disabled }) => !disabled) || (await mapState()).reachable.length === 0) continue;
      const leader = (await mapState()).counters.find(({ selected }) => selected)?.pieceId;
      const alone = new Set((await mapState()).reachable.map(({ hexId: reached }) => reached));
      record(h, `${id}-01`, 'A friendly hex with several units shows the Move together panel with units that can move along', `${printed(hexId)}: ${await stackPanel()}`, true);
      await click(h, '#move-whole-stack');
      const ticked = (await mates()).filter(({ pressed }) => pressed);
      const reach = (await mapState()).reachable;
      record(h, `${id}-02`, 'Whole stack ticks every unit that can go; the stack reaches no hex the selected unit alone cannot',
        `${ticked.length} ticked (${ticked.map(({ text }) => text).join('; ')}); reach ${reach.length} vs ${alone.size} alone; panel "${await stackPanel()}"`,
        ticked.length > 0 && reach.length > 0 && reach.every(({ hexId: reached }) => alone.has(reached)));
      return { origin: hexId, leader, ticked, reach };
    }
    return null;
  };

  /** Move the ticked stack to `destination` through the map popup and check every unit arrived. */
  const moveStack = async (id, stack, destination) => {
    await gotoHex(h, printed(destination), { enter: true });
    const popup = await textOf(h, '.move-popup');
    record(h, `${id}-03`, 'The move popup says the units move together and each pays from its own MA', popup, /units together/.test(popup) && /6\.1e/.test(popup));
    await h.shot(`${id.toLowerCase()}-move-popup`);
    await click(h, '#confirm-move', { settle: 600 });
    const arrived = await Promise.all([stack.leader, ...stack.ticked.map(({ id: mate }) => mate)].map(hexOfPiece));
    record(h, `${id}-04`, 'Confirming moves every ticked unit to the destination in one action',
      `destination ${printed(destination)}; units now at ${arrived.map((hexId) => hexId ? printed(hexId) : '?').join(', ')}; notice "${(await where(h)).notice}"`,
      arrived.every((hexId) => hexId === destination));
    if (!(await has(h, '#finish-move'))) {
      // Nothing left in reach: the deck lets the stack go, as it does a single unit (controller.confirmMove).
      h.note(`${id}: no hex left in reach after the move, so the selection was released; the rows after the move are not exercised.`);
      return false;
    }
    const after = await mates();
    const title = await h.page.getAttribute('#finish-move', 'title') ?? '';
    record(h, `${id}-05`, 'After the move the stack stays ticked together and Done offers to finish all of it',
      `${after.filter(({ pressed }) => pressed).length} still ticked; Done title "${title}"`,
      after.filter(({ pressed }) => pressed).length === stack.ticked.length && /units moving together/.test(title));
    await h.shot(`${id.toLowerCase()}-moved`);
    return true;
  };

  // A: move a stack together, then drop one unit off and move the rest on (6.1f). OCS_OVERRUN_FIRST=1 leaves every stack to B.
  const a = process.env.OCS_OVERRUN_FIRST ? null : await takeStack('DROP');
  if (!a && !process.env.OCS_OVERRUN_FIRST) throw new Error('No stack to move.');
  if (a) {
    const quiet = a.reach.filter(({ hexId, endsMovement }) => !endsMovement && !neighbours(hexId).some((next) => enemyHexes.has(next)));
    const stillMoving = await moveStack('DROP', a, (quiet[Math.floor(quiet.length / 4)] ?? a.reach[0]).hexId);
    const dropped = stillMoving ? (await mates()).find(({ pressed }) => pressed) : undefined;
    if (dropped && (await mapState()).reachable.length > 0) {
      const droppedHex = await hexOfPiece(dropped.id);
      await click(h, `[data-stack-mate="${dropped.id}"]`);
      const warning = await stackPanel();
      record(h, 'DROP-06', 'Unticking a unit of the moving stack warns that it is dropped off for the phase (6.1f)', warning, /drops off/.test(warning) && /6\.1f/.test(warning));
      await h.shot('drop-warning');
      const onward = (await mapState()).reachable[0].hexId;
      await gotoHex(h, printed(onward), { enter: true });
      const popup = await textOf(h, '.move-popup');
      await click(h, '#confirm-move', { settle: 600 });
      const leaderHex = await hexOfPiece(a.leader);
      record(h, 'DROP-07', 'The rest moves on; the dropped unit stays', `popup "${popup}"; leader at ${printed(leaderHex)}, dropped unit at ${printed(await hexOfPiece(dropped.id))}`,
        leaderHex === onward && (await hexOfPiece(dropped.id)) === droppedHex && /Drops off 1 unit/.test(popup));
      await release();
      await click(h, '#open-roster');
      await h.page.locator(`[data-roster-pick="${dropped.id}"]`).first().click();
      await h.page.waitForTimeout(300);
      const card = await textOf(h, '.deck-selection');
      record(h, 'DROP-08', 'The dropped unit cannot move again this phase', card, (await mapState()).reachable.length === 0 && /Already moved/.test(card));
      await h.shot('drop-dropped-unit');
    } else {
      h.note('The first stack had no MP left to move on after its first move: drop-off rows not exercised.');
    }

  }

  // B: move other stacks next to an enemy and overrun with the whole moving stack (8.0-8.1), until one has two units that
  // can overrun, so that continuing together after the overrun is seen as well.
  let exercised = false;
  for (let attempt = 1; attempt <= 4 && !exercised; attempt += 1) {
    await release();
    const id = `OVERRUN${attempt}`;
    const b = await takeStack(id);
    if (!b) { h.note('No further stack to try.'); break; }
    const contact = b.reach.find(({ hexId, endsMovement }) => !endsMovement && neighbours(hexId).some((next) => enemyHexes.has(next)));
    if (!contact) { h.note(`${id}: this stack cannot reach a hex next to the enemy.`); continue; }
    if (!(await moveStack(id, b, contact.hexId))) continue;
    const targets = (await mapState()).attack;
    if (targets.length === 0) { h.note(`${id}: no overrun target offered (too few MP left, or none can overrun).`); continue; }
    await gotoHex(h, printed(targets[0]), { enter: true });
    const participants = await h.page.evaluate(() => [...document.querySelectorAll('[data-participant]')].map((node) => ({ id: node.dataset.participant, checked: node.checked === true, disabled: node.disabled })));
    const movers = [b.leader, ...b.ticked.map(({ id: mate }) => mate)];
    // 8.1: only Attack-Capable units overrun; one that cannot (e.g. artillery) is not offered and is dropped off (8.1g).
    const offered = participants.filter(({ disabled }) => !disabled);
    record(h, `${id}-06`, 'The overrun draft offers only units of the moving stack and starts with every one of them able to overrun ticked',
      `${participants.filter(({ checked }) => checked).length} ticked of ${offered.length} offered; moving stack ${movers.length}`,
      offered.length > 0 && offered.every(({ id: unit, checked }) => checked && movers.includes(unit)));
    await h.shot(`${id.toLowerCase()}-draft`);
    await click(h, '#declare-draft', { settle: 800 });
    // Take losses as steps rather than retreats where offered, so the stack can go on (8.1f).
    await settleDecisions(h, (labels) => Math.max(0, labels.findIndex((label) => /step|loss/i.test(label) && !/retreat/i.test(label))));
    const result = await textOf(h, '.result-card');
    await h.shot(`${id.toLowerCase()}-resolved`);
    h.note(`${id} result: ${result.slice(0, 400)}`);
    if (await has(h, '#dismiss-result')) await click(h, '#dismiss-result');
    const overran = offered.map(({ id: unit }) => unit);
    const left = (await Promise.all(overran.map(async (unit) => ({ unit, hexId: await hexOfPiece(unit) })))).filter(({ hexId }) => hexId);
    if (overran.length >= 2 && left.length >= 2 && left.every(({ hexId }) => hexId === left[0].hexId)) {
      await release();
      await gotoHex(h, printed(left[0].hexId), { enter: true });
      const panel = await stackPanel();
      const card = await textOf(h, '.deck-selection');
      record(h, `${id}-07`, 'After an overrun without a retreat, the surviving overrunning units are still one moving stack (8.0, 8.1d)',
        `panel "${panel}"; card "${card}"`, /Moving \d+ units together/.test(panel) || /Done/.test(card));
      await h.shot(`${id.toLowerCase()}-continues`);
      exercised = true;
    } else {
      h.note(`${id}: continuing together not exercised (${overran.length} overran, ${left.length} still on the map together).`);
    }
  }
} catch (error) {
  h.note(`ERROR ${error.stack ?? error.message}`);
  await h.shot('error').catch(() => undefined);
} finally {
  await h.finish('Stack movement (6.1f) and stack overrun (8.0-8.1) acceptance');
  await h.close();
}
