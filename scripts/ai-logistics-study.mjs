#!/usr/bin/env node
// Does the bot use rail and trucks correctly? Replays saved ai-match games (docs/quality/evidence/rail-cap-plan-2026-10-08/README.md §7). Build first.
//
//   node scripts/ai-logistics-study.mjs tmp/ai-match/a tmp/ai-match/b [--out tmp/logistics]
//
// Per side role (attacker / defender, or allied / axis in a meeting engagement), averaged over every player turn from Game
// Turn 3 on: Rail Cap used of what was given; SP loaded per on-map truck point; trucks that did nothing in the Movement
// Segment although a rear dump (>= 6 hexes from the enemy, not a garrison stock) still held a full load when it ended;
// rear SP left when it ended; loads or rail moves taken from garrison stocks (should be 0); arriving trucks placed late;
// SP near the enemy (<= 4 hexes) at its start; and the attacker's result. Writes logistics.json.
// Each role is split by policy (from summary.json) when the two sides played different policies.
//
// Rail Cap used of what could carry SP forward: legal RAIL_MOVEs at the start of the Movement Segment whose SP end at least
// 3 hexes nearer the enemy and at least 3 hexes from it; SP railed in those phases ÷ min(Rail Cap, that SP).
//
//   --gate <policy>  checks the attacker gate registered in docs/ai/evaluation.md for <policy> against the other policy
//                    of the same batch, and exits 1 when it fails.
import { existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const root = resolve(fileURLToPath(new URL('..', import.meta.url)));
const argv = process.argv.slice(2);
const outIndex = argv.indexOf('--out');
const out = outIndex >= 0 ? argv[outIndex + 1] : join('tmp', 'logistics');
const list = argv.includes('--list');
const gateIndex = argv.indexOf('--gate');
const gatePolicy = gateIndex >= 0 ? argv[gateIndex + 1] : null;
const flagged = new Set([outIndex, outIndex + 1, gateIndex, gateIndex + 1].filter((index) => index >= 0));
const dirs = argv.filter((arg, index) => arg !== '--list' && !flagged.has(index));
const m = await import(pathToFileURL(join(root, 'dist', 'index.js')).href);
const FROM_TURN = 3;
const LOAD_TOKENS = 8;
const RAIL_GAIN = 3;
const RAIL_SAFE = 3;

const sides = {};
const result = { games: 0, attackerWins: 0, defenderWins: 0, draws: 0 };
const bump = (role, key, value) => { sides[role] ??= {}; sides[role][key] = (sides[role][key] ?? 0) + value; };

for (const dir of dirs) {
  const records = existsSync(join(dir, 'summary.json')) ? JSON.parse(readFileSync(join(dir, 'summary.json'), 'utf8')).records : [];
  for (const file of readdirSync(dir).filter((name) => name.endsWith('.save.json'))) {
    const save = JSON.parse(readFileSync(join(dir, file), 'utf8'));
    let state = m.parseGameStateJson(save.initialSnapshot).value;
    result.games += 1;
    const attackerId = state.configuration.attackVictory?.attackerId ?? null;
    const record = records.find(({ match }) => file === `match-${match}.save.json`);
    const sideOf = (playerId) => (String(playerId).endsWith('axis') ? 'axis' : 'allied');
    const split = record && record.sides.allied.policy !== record.sides.axis.policy;
    const role = (playerId) => {
      const base = attackerId === null ? sideOf(playerId) : playerId === attackerId ? 'attacker' : 'defender';
      return split ? `${base} ${record.sides[sideOf(playerId)].policy}` : base;
    };
    const definitions = new Map(state.scenario.pieceCatalog.definitions.map((definition) => [definition.id, definition]));
    const isDump = (piece) => definitions.get(piece.definitionId)?.family === 'RESOURCE';
    const isTruck = (current, piece) => m.isTransportPoint(current, piece);
    const isGarrisonStock = (id) => String(id).includes('-stock-');
    const capOf = (playerId) => state.configuration.railCapacity?.find((entry) => entry.playerId === playerId)?.points ?? 0;
    // Per player turn: what the phasing side's trucks did, measured at the start of its Movement Phase.
    let turnKey = null;
    let acted = new Set();
    let snapshot = null;
    /** Rear SP of `playerId` in `current`: Tokens in dumps at least 6 hexes from enemy combat units, and whether one holds a load. */
    const rearOf = (current, playerId) => {
      const enemy = current.pieceState.pieces.filter((piece) => piece.ownerId !== playerId && m.isOnMapCombatUnit(current, piece) && !/garrison/u.test(String(piece.definitionId)));
      let tokens = 0; let load = false; const dumps = [];
      for (const piece of current.pieceState.pieces) {
        if (piece.ownerId !== playerId || piece.location.kind !== 'ON_MAP' || !isDump(piece) || !(piece.resourceQuantity > 0) || isGarrisonStock(piece.id)) continue;
        const distance = Math.min(99, ...enemy.map((other) => m.hexDistanceBetween(other.location.hexId, piece.location.hexId)));
        if (distance < 6) continue;
        tokens += piece.resourceQuantity;
        if (piece.resourceQuantity >= LOAD_TOKENS) { load = true; dumps.push(`${piece.location.hexId}:${piece.resourceQuantity}T`); }
      }
      return { tokens, load, dumps };
    };
    const closeTurn = (current) => {
      if (!snapshot) return;
      const { playerId, trucks } = snapshot;
      const rear = rearOf(current, playerId);
      const idleIds = trucks.filter((id) => !acted.has(id));
      if (rear.load) {
        bump(role(playerId), 'idleTruckTurns', idleIds.length);
        // An idle truck still carrying SP is a dump the army draws from; an empty one could have fetched the rear stock.
        const empty = idleIds.filter((id) => { const truck = current.pieceState.pieces.find((piece) => piece.id === id); return truck && m.loadedTokens(current, truck) === 0; }).length;
        bump(role(playerId), 'idleEmptyTruckTurns', empty);
        if (list && empty > 0) {
          const where = idleIds.map((id) => current.pieceState.pieces.find((piece) => piece.id === id)).filter((truck) => truck && m.loadedTokens(current, truck) === 0)
            .map((truck) => `${String(truck.id).replace(/^.*transport-/u, 'T').replace(':unit', '')}@${truck.location.hexId}`);
          console.log(`  ${file} ${turnKey} ${role(playerId)}: idle empty ${where.join(' ')}; rear ${rear.dumps.join(' ')}`);
        }
      }
      bump(role(playerId), 'rearLeftSp', rear.tokens / 4);
      bump(role(playerId), 'truckTurns', trucks.length);
      snapshot = null;
    };
    for (const action of save.acceptedActions) {
      const before = state;
      const { gameTurn, playerTurnIndex, phase, segment, phasingPlayerId } = before.sequence;
      const key = `${gameTurn}:${playerTurnIndex}`;
      // The Movement Segment just ended: what was left behind, and which trucks never moved.
      if (snapshot && !(phase === 'MOVEMENT' && segment === 'MOVEMENT')) closeTurn(before);
      if (phase === 'MOVEMENT' && segment === 'MOVEMENT' && key !== turnKey) {
        turnKey = key;
        acted = new Set();
        if (gameTurn >= FROM_TURN) {
          const own = before.pieceState.pieces.filter((piece) => piece.ownerId === phasingPlayerId && piece.location.kind === 'ON_MAP');
          const enemy = before.pieceState.pieces.filter((piece) => piece.ownerId !== phasingPlayerId && m.isOnMapCombatUnit(before, piece) && !/garrison/u.test(String(piece.definitionId)));
          const trucks = own.filter((piece) => isTruck(before, piece) && !m.isExtender(before, piece));
          const truckPoints = trucks.reduce((total, piece) => total + m.transportPointsOf(before, piece), 0);
          let near = 0; let far = 0; let rearLoad = false;
          for (const piece of own.filter((candidate) => isDump(candidate) && (candidate.resourceQuantity ?? 0) > 0)) {
            const distance = Math.min(99, ...enemy.map((other) => m.hexDistanceBetween(other.location.hexId, piece.location.hexId)));
            if (distance <= 4) near += piece.resourceQuantity / 4;
            if (distance >= 9) far += piece.resourceQuantity / 4;
            if (distance >= 6 && !isGarrisonStock(piece.id) && piece.resourceQuantity >= LOAD_TOKENS) rearLoad = true;
          }
          const r = role(phasingPlayerId);
          bump(r, 'turns', 1); bump(r, 'nearSp', near); bump(r, 'farSp', far); bump(r, 'truckPoints', truckPoints);
          bump(r, 'railCapQuarters', capOf(phasingPlayerId) * 4);
          const enemyDistance = (hexId) => Math.min(99, ...enemy.map((other) => m.hexDistanceBetween(other.location.hexId, hexId)));
          const railable = new Map();
          for (const rail of m.ruleEngine.getActionCandidates(before, { actorId: phasingPlayerId, kind: 'RAIL_MOVE', pieceId: null, budget: 2000 }).actions) {
            const to = enemyDistance(rail.toHexId);
            if (to < RAIL_SAFE || enemyDistance(rail.fromHexId) - to < RAIL_GAIN) continue;
            for (const { sourcePieceId, tokens } of rail.supply) if (!isGarrisonStock(sourcePieceId)) railable.set(sourcePieceId, Math.max(tokens, railable.get(sourcePieceId) ?? 0));
          }
          const railableTokens = [...railable.values()].reduce((total, tokens) => total + tokens, 0);
          if (railableTokens > 0) { bump(r, 'railablePhases', 1); bump(r, 'railableQuarters', Math.min(capOf(phasingPlayerId) * 4, railableTokens)); }
          snapshot = { playerId: phasingPlayerId, trucks: trucks.map(({ id }) => id), loadAvailable: rearLoad, railable: railableTokens > 0 };
        }
      }
      const next = m.ruleEngine.applyAction(state, action);
      state = next.state;
      const r = role(action.actorId);
      const counted = before.sequence.gameTurn >= FROM_TURN;
      if (['MOVE_PIECE', 'LOAD_SUPPLY', 'UNLOAD_SUPPLY', 'RAIL_MOVE'].includes(action.kind)) {
        for (const id of [action.pieceId, action.truckId, ...(action.unitIds ?? [])]) if (id) acted.add(id);
      }
      if (action.kind === 'LOAD_SUPPLY') {
        if (counted) bump(r, 'truckLoadedSp', action.tokens / 4);
        if (isGarrisonStock(action.dumpId)) bump(r, 'stockLoads', 1);
      }
      if (action.kind === 'RAIL_MOVE') {
        const event = next.events.find(({ kind }) => kind === 'RAIL_MOVED');
        if (counted && event) bump(r, 'railQuarters', event.quarters);
        if (counted && snapshot?.railable && action.actorId === snapshot.playerId) bump(r, 'railableUsedQuarters', action.supply.reduce((total, { tokens }) => total + tokens, 0));
        if (action.supply.some(({ sourcePieceId }) => isGarrisonStock(sourcePieceId))) bump(r, 'stockRails', 1);
      }
      if (action.kind === 'PLACE_REINFORCEMENT') {
        const piece = before.pieceState.pieces.find(({ id }) => id === action.pieceId);
        const due = piece?.statuses.find(({ statusDefinitionId }) => statusDefinitionId === 'status:return-turn')?.value?.value ?? null;
        if (piece && isTruck(before, piece)) { bump(r, 'trucksArrived', 1); if (due !== null && before.sequence.gameTurn > due) bump(r, 'trucksLate', 1); }
      }
    }
    closeTurn(state);
    const winner = state.victory.winnerId;
    if (winner === null) result.draws += 1;
    else if (attackerId === null) result[`${role(winner)}Wins`] = (result[`${role(winner)}Wins`] ?? 0) + 1;
    else if (winner === attackerId) result.attackerWins += 1;
    else result.defenderWins += 1;
  }
}

const summary = Object.fromEntries(Object.entries(sides).map(([r, s]) => [r, {
  railCapUsed: s.railCapQuarters ? (s.railQuarters ?? 0) / s.railCapQuarters : null,
  railablePhases: s.railablePhases ?? 0,
  railUsedOfRailable: s.railableQuarters ? Math.min(1, (s.railableUsedQuarters ?? 0) / s.railableQuarters) : null,
  truckSpPerPointTurn: s.truckPoints ? (s.truckLoadedSp ?? 0) / s.truckPoints : null,
  idleTruckShare: s.truckTurns ? (s.idleTruckTurns ?? 0) / s.truckTurns : null,
  idleEmptyTruckShare: s.truckTurns ? (s.idleEmptyTruckTurns ?? 0) / s.truckTurns : null,
  stockLoads: s.stockLoads ?? 0,
  stockRails: s.stockRails ?? 0,
  trucksArrived: s.trucksArrived ?? 0,
  trucksLate: s.trucksLate ?? 0,
  nearSp: (s.nearSp ?? 0) / (s.turns || 1),
  farSp: (s.farSp ?? 0) / (s.turns || 1),
  rearLeftSp: (s.rearLeftSp ?? 0) / (s.turns || 1),
}]));
mkdirSync(out, { recursive: true });
writeFileSync(join(out, 'logistics.json'), JSON.stringify({ dirs, result, sides: summary }, null, 2));
console.log(`${result.games} games; ${Object.entries(result).filter(([key]) => key.endsWith('Wins') && (result[key] > 0 || key.startsWith('attacker') || key.startsWith('defender'))).map(([key, value]) => `${key.replace('Wins', '')} ${value}`).join(', ')}, draws ${result.draws}`);
for (const [r, s] of Object.entries(summary)) {
  const pct = (value) => value === null ? '-' : `${Math.round(value * 100)}%`;
  console.log(`${r.padEnd(9)} rail used ${pct(s.railCapUsed)} (of SP railable forward ${pct(s.railUsedOfRailable)} in ${s.railablePhases} phases) · truck SP/point/turn ${s.truckSpPerPointTurn?.toFixed(2) ?? '-'} · idle trucks ${pct(s.idleTruckShare)} (empty ${pct(s.idleEmptyTruckShare)})`
    + ` · stock loads ${s.stockLoads}, stock rails ${s.stockRails} · trucks arrived ${s.trucksArrived} (late ${s.trucksLate}) · SP near ${s.nearSp.toFixed(1)}, rear at start ${s.farSp.toFixed(1)}, rear left after moving ${s.rearLeftSp.toFixed(1)}`);
}

if (gatePolicy !== null) {
  const attacker = Object.entries(summary).filter(([key]) => key.startsWith('attacker '));
  const candidate = attacker.find(([key]) => key === `attacker ${gatePolicy}`)?.[1];
  const baseline = attacker.find(([key]) => key !== `attacker ${gatePolicy}`)?.[1];
  if (!candidate || !baseline) { console.log(`GATE ERROR: need attacker games of ${gatePolicy} and of another policy`); process.exit(1); }
  const checks = [
    ['truck haul >= 60% of capacity', candidate.truckSpPerPointTurn >= 0.6, candidate.truckSpPerPointTurn.toFixed(2)],
    ['Rail Cap >= 70% of SP railable forward', candidate.railUsedOfRailable === null || candidate.railUsedOfRailable >= 0.7, candidate.railUsedOfRailable === null ? 'no railable phase' : candidate.railUsedOfRailable.toFixed(2)],
    ['rear SP left after moving <= half the baseline', candidate.rearLeftSp <= baseline.rearLeftSp / 2, `${candidate.rearLeftSp.toFixed(1)} vs ${baseline.rearLeftSp.toFixed(1)}`],
    ['no garrison stock loaded or railed', candidate.stockLoads === 0 && candidate.stockRails === 0, `${candidate.stockLoads}/${candidate.stockRails}`],
  ];
  for (const [name, pass, value] of checks) console.log(`GATE ${pass ? 'PASS' : 'FAIL'} ${name}: ${value}`);
  writeFileSync(join(out, 'logistics-gate.json'), JSON.stringify({ policy: gatePolicy, checks: checks.map(([name, pass, value]) => ({ name, pass, value })) }, null, 2));
  if (checks.some(([, pass]) => !pass)) process.exit(1);
}
