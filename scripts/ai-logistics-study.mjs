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
import { mkdirSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const root = resolve(fileURLToPath(new URL('..', import.meta.url)));
const argv = process.argv.slice(2);
const outIndex = argv.indexOf('--out');
const out = outIndex >= 0 ? argv[outIndex + 1] : join('tmp', 'logistics');
const list = argv.includes('--list');
const dirs = argv.filter((arg) => arg !== '--list').filter((_, index) => outIndex < 0 || (index !== outIndex && index !== outIndex + 1));
const m = await import(pathToFileURL(join(root, 'dist', 'index.js')).href);
const FROM_TURN = 3;
const LOAD_TOKENS = 8;

const sides = {};
const result = { games: 0, attackerWins: 0, defenderWins: 0, draws: 0 };
const bump = (role, key, value) => { sides[role] ??= {}; sides[role][key] = (sides[role][key] ?? 0) + value; };

for (const dir of dirs) {
  for (const file of readdirSync(dir).filter((name) => name.endsWith('.save.json'))) {
    const save = JSON.parse(readFileSync(join(dir, file), 'utf8'));
    let state = m.parseGameStateJson(save.initialSnapshot).value;
    result.games += 1;
    const attackerId = state.configuration.attackVictory?.attackerId ?? null;
    const role = (playerId) => attackerId === null ? (String(playerId).endsWith('axis') ? 'axis' : 'allied') : playerId === attackerId ? 'attacker' : 'defender';
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
          snapshot = { playerId: phasingPlayerId, trucks: trucks.map(({ id }) => id), loadAvailable: rearLoad };
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
  console.log(`${r.padEnd(9)} rail used ${pct(s.railCapUsed)} · truck SP/point/turn ${s.truckSpPerPointTurn?.toFixed(2) ?? '-'} · idle trucks ${pct(s.idleTruckShare)} (empty ${pct(s.idleEmptyTruckShare)})`
    + ` · stock loads ${s.stockLoads}, stock rails ${s.stockRails} · trucks arrived ${s.trucksArrived} (late ${s.trucksLate}) · SP near ${s.nearSp.toFixed(1)}, rear at start ${s.farSp.toFixed(1)}, rear left after moving ${s.rearLeftSp.toFixed(1)}`);
}
