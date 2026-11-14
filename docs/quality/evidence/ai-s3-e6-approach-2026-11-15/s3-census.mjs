// S3.1: force concentration under heuristic@86. Replays recorded attack games where the given policy attacked. At the
// attacker's first Movement decision of each Game Turn the bot plans as it did (THEATER line: this-step defended groups
// with planned column) and we count the strength of combat units no group uses that could reach, this step in Combat
// Mode, a free hex beside a group's objective (join) or beside any defended objective it does not hold (any), in or out
// of their trace. Over the turn: the attacker's regular attacks, and for each group objective the best column actually
// declared against it, against the planned one.
//   node s3-census.mjs <root> <dir> <policy substring> [--shard i/n]   one JSON line per attacker turn
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
const args = process.argv.slice(2);
const shardArg = args.includes('--shard') ? args[args.indexOf('--shard') + 1] : '0/1';
const [shard, shards] = shardArg.split('/').map(Number);
const [root, dir, policyPart] = args.filter((a, i) => a !== '--shard' && args[i - 1] !== '--shard');
const m = await import(pathToFileURL(join(root, 'dist', 'index.js')).href);
const { analyze } = await import(pathToFileURL(join(root, 'dist', 'ai', 'analysis.js')).href);
const records = JSON.parse(readFileSync(join(dir, 'summary.json'), 'utf8')).records;
const files = readdirSync(dir).filter((f) => /^match-\d+\.save\.json$/u.test(f)).sort().filter((_, i) => i % shards === shard);
const columnIndexOf = (line, text) => m.COMBAT_TABLE_COLUMNS[line]?.findIndex((c) => `${c.attacker}:${c.defender}` === text) ?? -1;
for (const f of files) {
  const match = Number(f.match(/\d+/u)[0]);
  const save = JSON.parse(readFileSync(join(dir, f), 'utf8'));
  let state = m.parseGameStateJson(save.initialSnapshot).value;
  const attackerId = state.configuration.attackVictory.attackerId;
  const rec = records.find((r) => r.match === match);
  const policy = rec.sides[String(attackerId).endsWith('axis') ? 'axis' : 'allied'].policy;
  if (!policy.includes(policyPart)) continue;
  const facts = { scenario: state.scenario, turnLimit: 8 };
  let turn = null;
  const flush = () => { if (turn) console.log(JSON.stringify(turn)); turn = null; };
  for (const action of save.acceptedActions) {
    const s = state.sequence;
    if (s.phasingPlayerId === attackerId && s.actingPlayerId === attackerId && s.phase === 'MOVEMENT' && s.segment === 'MOVEMENT' && !state.pendingDecision && (!turn || turn.gameTurn !== s.gameTurn)) {
      flush();
      const me = attackerId;
      const access = {
        families: () => m.ruleEngine.getActionFamilies(state, me).filter((x) => x.enabled).map((x) => x.kind),
        movementRange: (p) => m.ruleEngine.queryMovementRange(state, me, p).value ?? [],
        candidates: (kind, pieceId = null, budget = 400) => m.ruleEngine.getActionCandidates(state, { actorId: me, kind, pieceId, budget }).actions,
        explain: (a) => ({ current: true, explanation: m.ruleEngine.explain(state, a) }),
        traceCoverage: (p = null) => m.ruleEngine.queryTraceCoverage(state, me, p).value ?? { hexIds: [], directHexIds: [] },
        feedCoverage: (p = null) => m.ruleEngine.queryFeedCoverage(state, me, p).value ?? [],
        drawReach: (h) => new Set((m.ruleEngine.queryDrawReach(state, me, h).value ?? []).map(String)),
        attackStrength: (a, t) => m.ruleEngine.queryAttackStrength(state, me, a, t).value,
        projectedReach: (p, fr, mode) => m.ruleEngine.queryProjectedReach(state, me, p, fr, mode).value ?? [],
        hqThrow: (h, fr) => m.ruleEngine.queryHqThrow(state, me, h, fr).value,
        railArrivalReach: (h) => (m.ruleEngine.queryRailArrivalReach(state, me, h).value ?? []).map(({ hexId }) => hexId),
        traceCut: (p, h, mode) => m.ruleEngine.queryTraceCut(state, me, p, h, mode).value?.cutIds ?? [],
      };
      const lines = [];
      const memory = { stepKey: 'x', actions: 0, notes: new Map() };
      const pol = m.createHeuristicPolicy(facts, { weights: m.heuristicWeights({ theaterAllocation: 1 }), debug: (l) => { if (l.includes('THEATER')) lines.push(l); } });
      const projection = m.ruleEngine.projectForViewer(state, me);
      pol.decide({ seatId: 'seat:x', playerId: me, memory, rng: m.createBotRng(7, 'x', 0), view: { playerId: me, projection, pendingDecision: null }, actions: access });
      const notes = memory.notes.get('heuristic') ?? {};
      const groups = [...(lines[0] ?? '').matchAll(/ (-?\d+,-?\d+):(\d+)u p([\d.]+) t(\d)(?: c(\d+)(\w+))?/g)]
        .map(([, hex, u, p, t, c, line]) => ({ hex, units: Number(u), chance: Number(p), turn: Number(t), column: c === undefined ? null : Number(c), line: line ?? null }));
      const dropped = [...(lines[0] ?? '').matchAll(/ drop=(-?\d+,-?\d+)\/(\d+)u\/p([\d.]+)\/t(\d)/g)].map(([, hex, u, p, t]) => ({ hex, units: Number(u), chance: Number(p), turn: Number(t) }));
      const situation = analyze(projection, me, facts);
      const members = new Set([...(notes.theaterObjectives?.keys() ?? []), ...(notes.stagers?.keys() ?? [])].map(String));
      const ownObjectives = new Set(situation.objectives.filter((o) => o.controllerId === me).map((o) => String(o.hexId)));
      const defended = situation.objectives.filter((o) => o.controllerId !== me && situation.enemy.get(o.hexId)?.hasCombatUnit).map((o) => String(o.hexId));
      const thisStep = groups.filter((g) => g.turn === 1 && defended.includes(g.hex)).map((g) => g.hex);
      const beside = (target) => new Set(m.adjacentHexIds(target).map(String).filter((h) => !situation.enemy.get(h)?.hasCombatUnit));
      const memberStrength = situation.own.filter((u) => members.has(String(u.piece.id))).reduce((a, u) => a + (u.profile?.strength ?? 0), 0);
      let joinStrength = 0; let joinTraced = 0; let anyStrength = 0; let idleUnits = 0;
      for (const unit of situation.own) {
        if (!situation.isCombatUnit(unit) || unit.piece.role !== 'COMBAT' || members.has(String(unit.piece.id)) || ownObjectives.has(String(unit.hexId))) continue;
        const strength = unit.profile?.strength ?? 0;
        if (strength <= 0) continue;
        const reach = new Set([String(unit.hexId), ...access.projectedReach(unit.piece.id, unit.hexId, 'COMBAT').map(({ hexId }) => String(hexId))]);
        const traced = new Set(access.traceCoverage(unit.piece.id).hexIds.map(String));
        const join = thisStep.some((t) => [...beside(t)].some((h) => reach.has(h)));
        const joinT = thisStep.some((t) => [...beside(t)].some((h) => reach.has(h) && traced.has(h)));
        const any = defended.some((t) => [...beside(t)].some((h) => reach.has(h)));
        if (join) joinStrength += strength;
        if (joinT) joinTraced += strength;
        if (any) { anyStrength += strength; idleUnits += 1; }
      }
      const approach = [];
      for (const [unitId, target] of notes.targets ?? []) {
        if (members.has(String(unitId)) || !target || !['ASSAULT', 'CAPTURE', 'HUNT'].includes(target.purpose) || !situation.enemy.get(target.hexId)?.hasCombatUnit) continue;
        const unit = situation.own.find((u) => u.piece.id === unitId);
        if (!unit || unit.piece.role !== 'COMBAT') continue;
        const reach = new Set(access.projectedReach(unit.piece.id, unit.hexId, 'COMBAT').map(({ hexId }) => String(hexId)));
        approach.push({ unitId: String(unitId), purpose: target.purpose, target: String(target.hexId), from: m.hexDistanceBetween(String(unit.hexId), String(target.hexId)),
          besideReachable: [...beside(String(target.hexId))].some((h) => reach.has(h)), strength: unit.profile?.strength ?? 0 });
      }
      turn = { match, gameTurn: s.gameTurn, groups, dropped, thisStep, memberStrength, idle: { joinStrength, joinTraced, anyStrength, idleUnits }, approach, attacks: [] };
    }
    if (turn && s.phasingPlayerId === attackerId && action.kind === 'DECLARE_COMBAT') {
      const e = m.ruleEngine.explain(state, action);
      const fact = (k) => e.facts.find((x) => x.key === k)?.value ?? null;
      const line = fact('combat.line'); const column = fact('combat.column');
      turn.attacks.push({ target: String(action.targetHexId), regular: action.combatKind === 'REGULAR', line, column, index: line ? columnIndexOf(line, String(column)) : -1, phase: s.phase });
    }
    const next = m.ruleEngine.applyAction(state, action).state;
    if (turn && !turn.ended && s.phasingPlayerId === attackerId && s.phase === 'MOVEMENT' && s.segment === 'MOVEMENT' && !(next.sequence.phase === 'MOVEMENT' && next.sequence.segment === 'MOVEMENT')) {
      turn.ended = true;
      for (const a of turn.approach) {
        const piece = next.pieceState.pieces.find((p) => String(p.id) === a.unitId);
        a.to = piece?.location.kind === 'ON_MAP' ? m.hexDistanceBetween(String(piece.location.hexId), a.target) : null;
      }
    }
    state = next;
  }
  flush();
}
