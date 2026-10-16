import { compareText, type HexId, type PlayerId } from '../../core/index.js';
import { upsertPieceState, type PieceState } from '../../domain/piece/index.js';
import type { GameState, RuleEvent } from '../kernel/model.js';
import { rollDie } from '../kernel/rng.js';
import { damagePort } from '../port/port.js';
import { portAt } from '../port/state.js';
import { FACILITY_TABLE_COLUMNS, FACILITY_TABLE_ROWS, PORT_MAXIMUM_HITS, facilityColumnIndex, parseFacilityResult } from '../tables/ocs-4.3.js';
import { airBaseAt, airBaseLevel, aircraftAt, aircraftName, aircraftStepLoss, isAirStrip, withAirBaseLevel } from '../air/aircraft.js';

export const enemyAirBaseAt = (state: GameState, playerId: PlayerId, hexId: HexId): PieceState | undefined => {
  const base = airBaseAt(state, hexId);
  return base && base.ownerId !== playerId ? base : undefined;
};

/** 10.0c: a port the other side holds that can still take a hit (19.0b: never more than four). */
export const enemyPortTarget = (state: GameState, playerId: PlayerId, hexId: HexId): boolean => {
  const port = portAt(state, hexId);
  return port !== undefined && port.controllerId !== null && port.controllerId !== playerId && port.damage < PORT_MAXIMUM_HITS;
};

interface FacilityResolution {
  readonly state: GameState;
  readonly text: string;
}

const finish = (state: GameState, text: string): FacilityResolution => ({
  state: state.activeTransaction!.kind === 'BARRAGE' ? { ...state, activeTransaction: { ...state.activeTransaction!, result: text } } : state, text,
});

/** Shared 10.0c facility effects for aircraft and artillery, with one unshifted die. */
export const resolveFacilityBarrage = (input: GameState, target: 'AIR_BASE' | 'PORT' | 'TRAINBUSTING', strength: number, events: RuleEvent[]): FacilityResolution => {
  let state = input;
  const transaction = state.activeTransaction!;
  if (strength < 1) return { state, text: 'The barrage has no strength left and has no effect.' };
  const column = facilityColumnIndex(strength);
  const die = rollDie(state.rng);
  state = { ...state, rng: die.rng };
  events.push({ kind: 'FACILITY_DIE_ROLLED', sequence: events.length, transactionId: transaction.id, value: die.value, purpose: 'FACILITY', pieceId: null });
  const cell = FACILITY_TABLE_ROWS[die.value]![column]!;
  const result = parseFacilityResult(cell);
  state = { ...state, activeTransaction: { ...state.activeTransaction!, result: cell, facilityDie: transaction.kind === 'BARRAGE' ? die.value : null } };
  const label = `Barrage vs Facility ${strength} (${FACILITY_TABLE_COLUMNS[column]!.label}): die ${die.value}, ${cell === '-' ? 'no effect' : cell}`;
  if (target === 'TRAINBUSTING') {
    if (!result.trainbusting) return finish(state, `${label}; no Trainbusting.`);
    events.push({ kind: 'TRAINBUSTING_CHANGED', sequence: events.length, hexId: transaction.targetHexId, ownerId: transaction.ownerId, placed: true });
    state = { ...state, air: { ...state.air, trainbusting: [...state.air.trainbusting, { hexId: transaction.targetHexId, ownerId: transaction.ownerId }] } };
    return finish(state, `${label}; a Trainbusting marker is placed.`);
  }
  if (target === 'PORT') {
    if (result.levels === 0) return finish(state, `${label}; the port takes no damage.`);
    const before = portAt(state, transaction.targetHexId)?.damage ?? 0;
    state = damagePort(state, transaction.targetHexId, result.levels, 'BARRAGE', events);
    const after = portAt(state, transaction.targetHexId)?.damage ?? before;
    return finish(state, `${label}; the port takes ${after - before} hit${after - before === 1 ? '' : 's'} (now ${after} of ${PORT_MAXIMUM_HITS}).`);
  }
  let lines = label;
  const base = enemyAirBaseAt(state, transaction.ownerId, transaction.targetHexId);
  if (result.aircraftCheck !== null) {
    for (const plane of aircraftAt(state, transaction.targetHexId).filter((piece) => piece.ownerId === transaction.defenderOwnerId).sort((left, right) => compareText(left.id, right.id))) {
      const check = rollDie(state.rng);
      state = { ...state, rng: check.rng };
      events.push({ kind: 'FACILITY_DIE_ROLLED', sequence: events.length, transactionId: transaction.id, value: check.value, purpose: 'AIRCRAFT_CHECK', pieceId: plane.id });
      if (check.value >= result.aircraftCheck) {
        state = aircraftStepLoss(state, plane.id, events);
        lines += `; ${aircraftName(state, plane)} loses a step (${check.value})`;
      }
    }
  }
  if (result.levels > 0 && base && !isAirStrip(state, base)) {
    const level = Math.max(1, airBaseLevel(state, base) - result.levels);
    if (level !== airBaseLevel(state, base)) {
      state = { ...state, pieceState: upsertPieceState(state.pieceState, withAirBaseLevel(base, level)) };
      events.push({ kind: 'AIR_BASE_LEVEL_CHANGED', sequence: events.length, pieceId: base.id, level });
      lines += `; the Air Base drops to Level ${level}`;
    }
  }
  return finish(state, `${lines}.`);
};
