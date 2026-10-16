#!/usr/bin/env node
// Does the attacker mass its strength where it attacks? Replays saved ai-match attack games run with --trace. Build first.
//
//   node scripts/ai-concentration-study.mjs <attack match directory> [...] [--out <dir>]
//
// Each attacker Combat Phase from Game Turn 2 (docs/ai/heuristic-policy.md, known gap bot-force-concentration):
// - Strength: printed Combat-side strength of the attacker's combat units (HQs and artillery excluded) by distance to the
//   nearest enemy combat unit, and by the task its last move this turn named in the trace (units that did not move: stayed).
// - Spread: distinct targets each task named this turn.
// - Odds: for every enemy hex the attacker can attack, the best legal regular attack's Combat Table column index after the
//   terrain line (Open 3:1 is index 6; Close needs 4:1, Very Close 6:1, Extremely Close 12:1 for it), and the declared attacks'.
// - Assault groups: units whose move named "assault <hex>", how many stand next to that hex, and each target's history.
// - Barrage: guns by mode in the Barrage Segment, barrages declared, attacks on a hex barraged in the same phase.
// Each is split by policy when the two sides played different policies (summary.json). Writes concentration.json.
import { existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const root = resolve(fileURLToPath(new URL('..', import.meta.url)));
const argv = process.argv.slice(2);
const outIndex = argv.indexOf('--out');
const out = outIndex >= 0 ? argv[outIndex + 1] : join('tmp', 'concentration');
const dirs = argv.filter((_, index) => outIndex < 0 || (index !== outIndex && index !== outIndex + 1));
const m = await import(pathToFileURL(join(root, 'dist', 'index.js')).href);
const FROM_TURN = 2;
const TASK_RE = /^combat to \S+ \((\w+) (-?\d+,-?\d+)\)/;

const sides = {};
const side = (role) => (sides[role] ??= { counts: {}, assault: {} });
const bump = (role, key, value = 1) => { const s = side(role).counts; s[key] = (s[key] ?? 0) + value; };
const bandOf = (distance) => (distance <= 1 ? 'adjacent' : distance <= 3 ? '2-3' : distance <= 6 ? '4-6' : '7+');

for (const dir of dirs) {
  const records = existsSync(join(dir, 'summary.json')) ? JSON.parse(readFileSync(join(dir, 'summary.json'), 'utf8')).records : [];
  for (const file of readdirSync(dir).filter((name) => name.endsWith('.save.json'))) {
    const save = JSON.parse(readFileSync(join(dir, file), 'utf8'));
    let state = m.parseGameStateJson(save.initialSnapshot).value;
    const attackerId = state.configuration.attackVictory?.attackerId ?? null;
    if (attackerId === null) continue;
    const sideName = String(attackerId).endsWith('axis') ? 'axis' : 'allied';
    const record = records.find(({ match }) => file === `match-${match}.save.json`);
    const role = record && record.sides.allied.policy !== record.sides.axis.policy ? `attacker ${record.sides[sideName].policy}` : 'attacker';
    bump(role, 'games');
    const tasks = new Map();
    const tracePath = join(dir, file.replace('.save.json', '.trace.jsonl'));
    for (const line of readFileSync(tracePath, 'utf8').split('\n')) {
      if (!line) continue;
      const entry = JSON.parse(line);
      const match = entry.seatId === `seat:${sideName}` && entry.status === 'ACCEPTED' && entry.action?.kind === 'MOVE_PIECE' ? TASK_RE.exec(entry.intent) : null;
      const [turn, playerTurn, phase, segment] = String(entry.stepKey).split(':');
      if (!match || phase !== 'MOVEMENT' || segment !== 'MOVEMENT') continue;
      const key = `${turn}:${playerTurn}`;
      if (!tasks.has(key)) tasks.set(key, new Map());
      tasks.get(key).set(String(entry.action.pieceId), { task: match[1], target: match[2] });
    }
    const definitions = new Map(state.scenario.pieceCatalog.definitions.map((definition) => [definition.id, definition]));
    const category = (piece) => String(definitions.get(piece.definitionId)?.categoryDefinitionId);
    const isArtillery = (piece) => category(piece).endsWith(':artillery');
    const combatStrength = (piece) => definitions.get(piece.definitionId)?.faces.find(({ id }) => id === 'combat')?.steps
      .find(({ remainingSteps }) => remainingSteps === piece.remainingSteps)?.combatStrength ?? 0;
    const objectiveHexes = new Set(state.configuration.objectives.map(({ hexId }) => String(hexId)));
    const history = new Map();
    let seen = null;
    let oddsSeen = null;
    let groups = new Set();
    let barraged = new Set();
    for (const action of save.acceptedActions) {
      const { gameTurn, playerTurnIndex, phase, segment, phasingPlayerId } = state.sequence;
      const key = `${gameTurn}:${playerTurnIndex}`;
      const inCombat = phase === 'COMBAT' && phasingPlayerId === attackerId && gameTurn >= FROM_TURN;
      if (inCombat && key !== seen) {
        seen = key;
        barraged = new Set();
        bump(role, 'phases');
        const plan = tasks.get(key) ?? new Map();
        const onMap = state.pieceState.pieces.filter((piece) => piece.location.kind === 'ON_MAP');
        const enemyHexes = [...new Set(onMap.filter((piece) => piece.ownerId !== attackerId && m.isOnMapCombatUnit(state, piece)).map((piece) => String(piece.location.hexId)))];
        const nearest = (hexId) => Math.min(99, ...enemyHexes.map((other) => m.hexDistanceBetween(other, hexId)));
        const own = onMap.filter((piece) => piece.ownerId === attackerId && m.isOnMapCombatUnit(state, piece) && !isArtillery(piece) && !category(piece).endsWith(':hq'));
        for (const piece of own) {
          const task = plan.get(String(piece.id))?.task ?? 'stayed';
          const band = bandOf(nearest(String(piece.location.hexId)));
          bump(role, `strength ${band}`, combatStrength(piece));
          bump(role, `task ${task}`, combatStrength(piece));
          bump(role, `task ${task} ${band}`, combatStrength(piece));
        }
        const targetsByTask = {};
        for (const { task, target } of plan.values()) (targetsByTask[task] ??= new Set()).add(target);
        for (const [task, targets] of Object.entries(targetsByTask)) bump(role, `targets ${task}`, targets.size);
        for (const gun of onMap.filter((piece) => piece.ownerId === attackerId && isArtillery(piece))) bump(role, `guns ${gun.mode}`);
        groups = new Set();
        for (const { task, target } of plan.values()) if (task === 'assault') groups.add(target);
        for (const target of groups) {
          const members = own.filter((piece) => plan.get(String(piece.id))?.task === 'assault' && plan.get(String(piece.id))?.target === target);
          const adjacent = members.filter((piece) => m.hexDistanceBetween(String(piece.location.hexId), target) === 1);
          bump(role, 'groups');
          bump(role, 'group units', members.length);
          bump(role, 'group units adjacent', adjacent.length);
          bump(role, 'group strength', members.reduce((total, piece) => total + combatStrength(piece), 0));
          bump(role, 'group strength adjacent', adjacent.reduce((total, piece) => total + combatStrength(piece), 0));
          const entry = history.get(target) ?? { turns: 0, attacked: 0 };
          entry.turns += 1;
          history.set(target, entry);
        }
      }
      if (inCombat && segment === 'COMBAT' && key !== oddsSeen) {
        oddsSeen = key;
        const best = new Map();
        for (const candidate of m.ruleEngine.getActionCandidates(state, { actorId: attackerId, kind: 'DECLARE_COMBAT', pieceId: null, budget: 400 }).actions) {
          if (candidate.combatKind === 'OVERRUN') continue;
          const explanation = m.ruleEngine.explain(state, candidate);
          const forecast = explanation.allowed ? m.forecastCombat(explanation.facts) : null;
          if (!forecast) continue;
          const hexId = String(candidate.targetHexId);
          if ((best.get(hexId) ?? -1) < forecast.columnIndex) best.set(hexId, forecast.columnIndex);
        }
        for (const [hexId, column] of best) {
          bump(role, `best column ${column}`);
          if (objectiveHexes.has(hexId)) bump(role, `best column on an objective ${column}`);
        }
      }
      if (inCombat && action.actorId === attackerId && action.kind === 'DECLARE_BARRAGE') {
        bump(role, 'barrages');
        barraged.add(String(action.targetHexId));
      }
      if (inCombat && action.actorId === attackerId && action.kind === 'DECLARE_COMBAT' && action.combatKind !== 'OVERRUN') {
        const forecast = m.forecastCombat(m.ruleEngine.explain(state, action).facts);
        const hexId = String(action.targetHexId);
        bump(role, `declared column ${forecast?.columnIndex ?? -1}`);
        bump(role, 'attacks');
        if (barraged.has(hexId)) bump(role, 'attacks on a barraged hex');
        if (groups.has(hexId)) { bump(role, 'attacks on an assault target'); history.get(hexId).attacked += 1; }
      }
      state = m.ruleEngine.applyAction(state, action).state;
    }
    for (const [hexId, { attacked }] of history) {
      bump(role, 'assault targets');
      if (attacked > 0) bump(role, 'assault targets attacked');
      if (state.mapState.hexControl.find((entry) => String(entry.hexId) === hexId)?.controllerId === attackerId) bump(role, 'assault targets held at the end');
    }
  }
}

const histogram = (counts, prefix) => Object.fromEntries(Object.entries(counts).filter(([key]) => key.startsWith(prefix) && /^-?\d+$/.test(key.slice(prefix.length)))
  .map(([key, value]) => [Number(key.slice(prefix.length)), value]).sort((a, b) => a[0] - b[0]));
const summary = Object.fromEntries(Object.entries(sides).map(([role, { counts: c }]) => {
  const per = (key) => (c[key] ?? 0) / Math.max(1, c.phases);
  const perGroup = (key) => (c[key] ?? 0) / Math.max(1, c.groups);
  const tasks = ['assault', 'capture', 'hunt', 'garrison', 'resupply', 'front', 'stayed'];
  return [role, {
    games: c.games, combatPhases: c.phases,
    strength: Object.fromEntries(['adjacent', '2-3', '4-6', '7+'].map((band) => [band, per(`strength ${band}`)])),
    strengthByTask: Object.fromEntries(tasks.filter((task) => c[`task ${task}`]).map((task) => [task, per(`task ${task}`)])),
    targetsByTask: Object.fromEntries(tasks.filter((task) => c[`targets ${task}`]).map((task) => [task, per(`targets ${task}`)])),
    bestColumn: histogram(c, 'best column '), bestColumnOnObjectives: histogram(c, 'best column on an objective '), declaredColumn: histogram(c, 'declared column '),
    attacksPerPhase: per('attacks'),
    group: { perPhase: per('groups'), units: perGroup('group units'), adjacent: perGroup('group units adjacent'), strength: perGroup('group strength'), strengthAdjacent: perGroup('group strength adjacent') },
    assaultTargets: { total: c['assault targets'] ?? 0, attacked: c['assault targets attacked'] ?? 0, heldAtEnd: c['assault targets held at the end'] ?? 0, attacks: c['attacks on an assault target'] ?? 0 },
    barrage: { gunsByMode: Object.fromEntries(Object.entries(c).filter(([key]) => key.startsWith('guns ')).map(([key, value]) => [key.slice(5), value])), perPhase: per('barrages'), attacksOnBarragedHex: c['attacks on a barraged hex'] ?? 0, attacks: c.attacks ?? 0 },
  }];
}));
mkdirSync(out, { recursive: true });
writeFileSync(join(out, 'concentration.json'), JSON.stringify({ dirs, sides: summary }, null, 2));
const f = (value) => value.toFixed(1);
const columns = (h) => Object.entries(h).map(([column, n]) => `${column}:${n}`).join(' ');
for (const [role, s] of Object.entries(summary)) {
  console.log(`${role}: ${s.games} games, ${s.combatPhases} Combat Phases from Turn ${FROM_TURN}`);
  console.log(`  strength by distance to the enemy ${Object.entries(s.strength).map(([band, v]) => `${band} ${f(v)}`).join(', ')}`);
  console.log(`  strength by task ${Object.entries(s.strengthByTask).map(([task, v]) => `${task} ${f(v)}`).join(', ')}; targets ${Object.entries(s.targetsByTask).map(([task, v]) => `${task} ${f(v)}`).join(', ')}`);
  console.log(`  best column per attackable hex ${columns(s.bestColumn)}; on objectives ${columns(s.bestColumnOnObjectives)}; declared ${columns(s.declaredColumn)} (${f(s.attacksPerPhase)} a phase)`);
  console.log(`  assault groups ${f(s.group.perPhase)} a phase: ${f(s.group.units)} units (${f(s.group.adjacent)} adjacent to the target), strength ${f(s.group.strength)} (${f(s.group.strengthAdjacent)} adjacent); targets ${s.assaultTargets.total}, attacked ${s.assaultTargets.attacked}, held at the end ${s.assaultTargets.heldAtEnd}`);
  console.log(`  guns in the Combat Phase ${Object.entries(s.barrage.gunsByMode).map(([mode, n]) => `${mode} ${n}`).join(', ')}; barrages ${f(s.barrage.perPhase)} a phase; attacks on a barraged hex ${s.barrage.attacksOnBarragedHex} of ${s.barrage.attacks}`);
}
