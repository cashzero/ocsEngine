/**
 * OCS v4.3 series charts (Multi-Man Publishing, "v4.3 Charts and Tables", 2018), transcribed from
 * the chart images shipped in the Beyond the Rhine VASSAL module 1.27.0 that the user supplied
 * (`images/v4.3 Charts (final)-2|3|4 1000.png`). See `docs/rules/ocs-4.3-charts.md` for hashes,
 * the transcription notes, and the cross-checks against the rulebook examples.
 */

export type CombatLine = 'OPEN' | 'CLOSE' | 'VERY_CLOSE' | 'EXTREMELY_CLOSE';

export const COMBAT_LINES: readonly CombatLine[] = ['OPEN', 'CLOSE', 'VERY_CLOSE', 'EXTREMELY_CLOSE'];

/** Odds ratio of one Combat Table column, attacker:defender. */
export interface OddsColumn {
  readonly attacker: number;
  readonly defender: number;
}

const odds = (text: string): readonly OddsColumn[] => text.split(' ').map((entry) => {
  const [attacker, defender] = entry.split(':').map(Number);
  return { attacker: attacker!, defender: defender! };
});

/** 9.7a: one row of column headings per terrain category (13 columns each). */
export const COMBAT_TABLE_COLUMNS: Readonly<Record<CombatLine, readonly OddsColumn[]>> = {
  OPEN: odds('1:5 1:4 1:3 1:2 1:1 2:1 3:1 4:1 5:1 7:1 9:1 11:1 13:1'),
  CLOSE: odds('1:4 1:3 1:2 1:1 2:1 3:1 4:1 6:1 8:1 10:1 12:1 15:1 18:1'),
  VERY_CLOSE: odds('1:3 1:2 1:1 2:1 3:1 4:1 6:1 9:1 12:1 15:1 18:1 21:1 24:1'),
  EXTREMELY_CLOSE: odds('1:2 1:1 2:1 3:1 4:1 8:1 12:1 16:1 20:1 28:1 36:1 44:1 52:1'),
};

export const COMBAT_TABLE_COLUMN_COUNT = 13;

/**
 * 9.9 Combat Table. Row 0 is a modified roll of "1 or less", rows 1-13 are 2-14, row 14 is
 * "15 or more". Each cell is `attacker/defender` in chart notation.
 */
export const COMBAT_TABLE_ROWS: readonly (readonly string[])[] = [
  'AL2/- AL2/- AL2/- AL2/- AL2/- AL2/- AL2/- AL1o1/- AL1o1/Do1 AL1o1/Do1 AL1/Do1 AL1/Do1 AL1/DL1o1',
  'AL2/- AL2/- AL2/- AL2/- AL2/- AL2/- AL1o1/- AL1o1/Do1 AL1o1/Do1 AL1/Do1 AL1/Do1 Ao1/DL1o1 Ao1/DL1o1',
  'AL2/- AL2/- AL2/- AL2/- AL2/- AL1o1/- AL1o1/Do1 AL1o1/Do1 AL1/Do1 AL1/Do1 Ao1/DL1o1 Ao1/DL1o1 Ao1/DL1o1',
  'AL2/- AL2/- AL2/- AL2/- AL1o1/- AL1o1/Do1 AL1o1/Do1 AL1/Do1 Ao1/Do1 Ao1/DL1o1 Ao1/DL1o1 Ao1/DL1o1 Ao1e4/DL1o2',
  'AL2/- AL2/- AL2/- AL1o1/- AL1o1/Do1 AL1o1/Do1 AL1/Do1 AL1/Do1 Ao1/Do1 Ao1/DL1o1 Ao1/DL1o1 Ao1e4/DL1o2 Ae4/DL1o2',
  'AL2/- AL2/- AL1o1/- AL1o1/Do1 AL1o1/Do1 AL1/Do1 AL1/Do1 Ao1/Do1 Ao1/DL1o1 Ao1/DL1o1 Ao1/DL1o1 Ae4/DL1o2 Ae4/DL1o2',
  'AL1o1/- AL1o1/- AL1o1/Do1 AL1o1/Do1 AL1o1/Do1 AL1/Do1 Ao1/Do1 Ao1/DL1o1 Ao1/DL1o1 Ao1/DL1o1 Ao1e4/DL1o2 Ae4/DL1o2 Ae3/DL2o2DG',
  'AL1o1/- AL1o1/Do1 AL1o1/Do1 AL1o1/Do1 AL1/Do1 Ao1/Do1 Ao1/DL1o1 Ao1/DL1o1 Ao1/DL1o1 Ao1e4/DL1o2 Ae4/DL1o2 Ae4/DL1o2 Ae3/DL2o2DG',
  'AL1o1/Do1 AL1o1/Do1 AL1o1/Do1 AL1/Do1 Ao1/Do1 Ao1/Do1 Ao1/DL1o1 Ao1/DL1o1 Ao1e4/DL1o2 Ae4/DL1o2 Ae4/DL1o2 Ae3/DL2o2DG Ae3/DL2o2DG',
  'AL1o1/Do1 AL1o1/Do1 AL1/Do1 Ao1/Do1 Ao1/Do1 Ao1/DL1o1 Ao1/DL1o1 Ao1e4/DL1o2 Ae4/DL1o2 Ae4/DL1o2 Ae3/DL2o2DG Ae3/DL2o2DG Ae2/DL2o3DG',
  'AL1o1/Do1 AL1/Do1 Ao1/Do1 Ao1/Do1 Ao1/DL1o1 Ao1/DL1o1 Ao1/DL1o1 Ae4/DL1o2 Ae4/DL1o2 Ae3/DL2o2DG Ae3/DL2o2DG Ae3/DL2o2DG Ae2/DL2o3DG',
  'AL1o1/Do1 Ao1/Do1 Ao1/Do1 Ao1/DL1o1 Ao1/DL1o1 Ao1/DL1o1 Ao1e4/DL1o2 Ae4/DL1o2 Ae3/DL2o2DG Ae3/DL2o2DG Ae3/DL2o2DG Ae2/DL2o3DG Ae2/DL2o3DG',
  'Ao1/Do1 Ao1/Do1 Ao1/DL1o1 Ao1/DL1o1 Ao1/DL1o2 Ao1e4/DL1o2 Ae4/DL1o2 Ae3/DL2o2DG Ae3/DL2o2DG Ae2/DL2o3DG Ae2/DL2o3DG Ae2/DL2o3DG Ae2/DL2o3DG',
  'Ao1/DL1o1 Ao1/DL1o1 Ao1/DL1o1 Ao1e4/DL1o2 Ao1e4/DL1o2 Ae4/DL1o2 Ae3/DL2o2DG Ae3/DL2o2DG Ae3/DL2o2DG Ae2/DL2o3DG Ae2/DL2o3DG Ae2/DL2o3DG Ae2/DL2o3DG',
  'Ao1/DL1o1 Ao1/DL1o1 Ao1e4/DL1o2 Ae4/DL1o2 Ae4/DL1o2 Ae3/DL2o2DG Ae3/DL2o2DG Ae2/DL2o3DG Ae2/DL2o3DG Ae2/DL2o3DG Ae2/DL2o3DG Ae2/DL2o3DG Ae2/DL2o3DG',
].map((row) => row.split(' '));

export interface CombatSideResult {
  /** "L#": required step losses. */
  readonly loss: number;
  /** "o#": option points, each a step loss or a hex of retreat. */
  readonly option: number;
}

export interface CombatResult {
  readonly text: string;
  readonly attacker: CombatSideResult;
  /** "e#": attacking units with this Action Rating or higher may enter Exploit Mode (9.13). */
  readonly exploitRating: number | null;
  readonly defender: CombatSideResult;
  readonly defenderDisorganized: boolean;
}

const sideResult = (text: string): CombatSideResult => ({
  loss: Number(/L(\d)/u.exec(text)?.[1] ?? 0),
  option: Number(/o(\d)/u.exec(text)?.[1] ?? 0),
});

export const parseCombatResult = (text: string): CombatResult => {
  const [attacker = '', defender = ''] = text.split('/');
  return {
    text,
    attacker: sideResult(attacker),
    exploitRating: /e(\d)/u.exec(attacker) ? Number(/e(\d)/u.exec(attacker)![1]) : null,
    defender: sideResult(defender),
    defenderDisorganized: defender.includes('DG'),
  };
};

/** Row index for a modified 2d6 roll (9.9): 1 or less → 0, 2..14 → 1..13, 15 or more → 14. */
export const combatTableRowIndex = (modifiedRoll: number): number =>
  Math.max(0, Math.min(14, modifiedRoll - 1));

/** 9.8 Surprise thresholds on the modified 2d6 roll. */
export const SURPRISE_THRESHOLDS: Readonly<Record<'OVERRUN' | 'REGULAR', { readonly attacker: number; readonly defender: number }>> = {
  OVERRUN: { attacker: 9, defender: 6 },
  REGULAR: { attacker: 10, defender: 5 },
};

/** 12.4 combat supply costs, in Tokens. */
export const COMBAT_SUPPLY = {
  attackerTokensPerStep: 1,
  defenderTokens: 2,
  /** Defender cost when the defending hex holds 1 RE or less. */
  smallDefenderTokens: 1,
  smallDefenderMaximumReTicks: 4,
} as const;

export type BarrageResultKind = 'NONE' | 'DG' | 'BRACKETED_HALF' | 'HALF' | 'STEPS';

export interface BarrageResult {
  readonly text: string;
  readonly kind: BarrageResultKind;
  readonly steps: number;
}

export interface BarrageColumn {
  readonly label: string;
  readonly minimumStrength: number;
  readonly supplyTokens: number;
}

/** 10.0a Barrage Table columns and the artillery supply cost printed under each (10.1b). */
export const BARRAGE_TABLE_COLUMNS: readonly BarrageColumn[] = [
  { label: '1 or less', minimumStrength: 1, supplyTokens: 1 },
  { label: '2', minimumStrength: 2, supplyTokens: 1 },
  { label: '3-4', minimumStrength: 3, supplyTokens: 2 },
  { label: '5-7', minimumStrength: 5, supplyTokens: 2 },
  { label: '8-11', minimumStrength: 8, supplyTokens: 2 },
  { label: '12-16', minimumStrength: 12, supplyTokens: 3 },
  { label: '17-24', minimumStrength: 17, supplyTokens: 3 },
  { label: '25-40', minimumStrength: 25, supplyTokens: 4 },
  { label: '41-68', minimumStrength: 41, supplyTokens: 6 },
  { label: '69-116', minimumStrength: 69, supplyTokens: 8 },
  { label: '117+', minimumStrength: 117, supplyTokens: 10 },
];

/** Barrage Table rows for 2d6 totals 2 through 12. */
export const BARRAGE_TABLE_ROWS: Readonly<Record<number, readonly string[]>> = Object.fromEntries([
  '- - - - - - - - - DG DG',
  '- - - - - - - - DG DG DG',
  '- - - - - - - DG DG DG DG',
  '- - - - - - DG DG DG DG [1/2]',
  '- - - - - DG DG DG DG [1/2] [1/2]',
  '- - - - DG DG DG DG [1/2] [1/2] 1/2',
  '- - - DG DG DG DG [1/2] [1/2] 1/2 1/2',
  '- - DG DG DG [1/2] [1/2] [1/2] 1/2 1/2 1/2',
  '- DG DG DG [1/2] [1/2] 1/2 1/2 1/2 1 1',
  'DG DG DG 1/2 1/2 1/2 1/2 1/2 1 1 2',
  'DG 1/2 1/2 1/2 1/2 1 1 1 1 2 3',
].map((row, index) => [index + 2, row.split(' ')]));

export const parseBarrageResult = (text: string): BarrageResult => {
  if (text === '-') return { text, kind: 'NONE', steps: 0 };
  if (text === 'DG') return { text, kind: 'DG', steps: 0 };
  if (text === '[1/2]') return { text, kind: 'BRACKETED_HALF', steps: 0 };
  if (text === '1/2') return { text, kind: 'HALF', steps: 0 };
  return { text, kind: 'STEPS', steps: Number(text) };
};

/** Initial Barrage Table column for a rounded barrage strength (10.0). Strength below 1 cannot fire. */
export const barrageColumnIndex = (strength: number): number => {
  let index = 0;
  for (const [position, column] of BARRAGE_TABLE_COLUMNS.entries()) if (strength >= column.minimumStrength) index = position;
  return index;
};

/** Density shift (10.0a) from the combat-unit RE in the target hex (not rounded). */
export const barrageDensityShift = (reTicks: number): number => {
  if (reTicks <= 4) return -1;
  if (reTicks <= 12) return 0;
  if (reTicks <= 16) return 1;
  if (reTicks <= 20) return 2;
  if (reTicks <= 24) return 3;
  return 4;
};

/** 4.1 rounding rule: fractions of .5 or more round up. */
export const roundOcs = (value: number): number => Math.floor(value + 0.5 + 1e-9);

/**
 * 12.8b Attrition Table (chart page 2). Columns are the best Action Rating among the Out of Supply
 * units (5 or more uses the "5" column); each entry is the lowest modified 2d6 total that produces
 * the result. `null` means the column never produces it.
 */
export type AttritionResult = 'NO_LOSS' | 'ONE_STEP' | 'TWO_STEPS' | 'FOUR_STEPS' | 'ALL_STEPS';

const ATTRITION_MINIMUMS: Readonly<Record<number, readonly [number, number, number, number]>> = {
  // [-1 Step, -2 Steps, -4 Steps, All Steps]
  5: [9, 11, 12, 13],
  4: [8, 10, 11, 12],
  3: [6, 8, 10, 12],
  2: [4, 6, 8, 10],
  1: [3, 5, 7, 9],
  0: [2, 4, 6, 8],
};

/** 12.8b: +3 when five or more Out of Supply steps are in the Hex. */
export const ATTRITION_LARGE_STACK_STEPS = 5;
export const ATTRITION_LARGE_STACK_DRM = 3;

export const attritionResult = (actionRating: number, modifiedRoll: number): AttritionResult => {
  const column = ATTRITION_MINIMUMS[Math.max(0, Math.min(5, actionRating))]!;
  if (modifiedRoll >= column[3]) return 'ALL_STEPS';
  if (modifiedRoll >= column[2]) return 'FOUR_STEPS';
  if (modifiedRoll >= column[1]) return 'TWO_STEPS';
  if (modifiedRoll >= column[0]) return 'ONE_STEP';
  return 'NO_LOSS';
};

export const attritionSteps = (result: AttritionResult, availableSteps: number): number => {
  switch (result) {
    case 'NO_LOSS': return 0;
    case 'ONE_STEP': return Math.min(1, availableSteps);
    case 'TWO_STEPS': return Math.min(2, availableSteps);
    case 'FOUR_STEPS': return Math.min(4, availableSteps);
    case 'ALL_STEPS': return availableSteps;
  }
};

/** 12.11a Dump Blowing Table: one die gives the percentage of the chosen SP destroyed. */
export const DUMP_BLOWING_PERCENT: Readonly<Record<number, number>> = { 1: 25, 2: 50, 3: 50, 4: 75, 5: 75, 6: 100 };

/** 9.14b/c Capture Table (chart page 2): percentage captured by one die. */
export const CAPTURE_PERCENT: Readonly<Record<'DUMP' | 'TRUCKS' | 'WAGONS', readonly number[]>> = {
  DUMP: [0, 0, 25, 25, 50, 50, 75],
  TRUCKS: [0, 0, 0, 25, 50, 50, 75],
  WAGONS: [0, 0, 0, 25, 50, 75, 100],
};

/** 12.8e Breakout: 5-6 succeeds; the first turn out of trace adds +1. */
export const BREAKOUT_SUCCESS_MINIMUM = 5;
export const BREAKOUT_MAXIMUM_DISTANCE = 15;

/** 12.10e: recovering internal stocks costs 2T per unit, or per RE of a multi-step unit, per level. */
export const INTERNAL_RECOVERY_TOKENS_PER_LEVEL = 2;

/** 12.5c fuel costs in Tokens. */
export const FUEL_COSTS = { formation: 4, hq: 4, singleUnit: 1 } as const;

// ─── Air power (chart page 1 "Air", and the Barrage vs Facility Table on page 4) ──────────────────

/** 14.3e Air Combat Table: modified 2d6 (attacker ACR added, defender ACR subtracted). */
export type AirCombatResult = 'ATTACKER_ABORTS' | 'BOTH_ABORT' | 'DEFENDER_ABORTS';

export const airCombatResult = (modifiedRoll: number): AirCombatResult =>
  modifiedRoll <= 6 ? 'ATTACKER_ABORTS' : modifiedRoll === 7 ? 'BOTH_ABORT' : 'DEFENDER_ABORTS';

/** 14.3e loss die: aborted aircraft also lose a step on 5-6. */
export const AIR_COMBAT_LOSS_MINIMUM = 5;

/** 14.4e Flak: a modified 2d6 of 11 or more kills one mission aircraft step. */
export const FLAK_HIT_MINIMUM = 11;

/** 14.4e Flak Roll Modifiers. Air Base Level and printed/ship Flak are added as their values. */
export const FLAK_MODIFIERS = {
  threeOrMoreAircraft: 1,
  headquarters: 1,
  patrolZoneWithFighter: 1,
  patrolZoneWithoutFighter: 2,
  patrolZoneTrainbusting: 1,
} as const;

/** 14.4c: a Patrol Zone extends 10 hexes from an Air Base with an Active Fighter. */
export const PATROL_ZONE_HEXES = 10;

/** 14.7c: the short-range shift applies when every aircraft is within 10 hexes of its base. */
export const SHORT_RANGE_HEXES = 10;

/**
 * 14.4f Mission Loss Table by the number of mission aircraft, indexed by one die (1-6): `#n` is the
 * n-th aircraft of the mission stack, `W` the weakest and `S` the strongest in Barrage Strength.
 */
export const MISSION_LOSS_TABLE: Readonly<Record<2 | 3 | 4, readonly string[]>> = {
  2: ['#1', '#1', '#1', '#2', '#2', '#2'],
  3: ['#1', '#1', '#2', '#2', '#3', '#3'],
  4: ['#1', '#2', '#3', '#4', 'W', 'S'],
};

/** 9.14f Air Base Capture Table: 2d6 per aircraft, 6 or less loses a step. */
export const AIR_BASE_CAPTURE = { stepLossMaximum: 6, activeModifier: 2, advanceModifier: 2 } as const;

/**
 * 14.10d Air Transport Success Table: the highest failing modified 2d6 by hex status and terrain.
 * Transcribed for the air transport slice; nothing consumes it until Air Drop is implemented.
 */
export const AIR_TRANSPORT_FAILURE_MAXIMUM: Readonly<Record<'FRIENDLY' | 'ENEMY', Readonly<Record<'CLEAR' | 'CLOSED', number>>>> = {
  FRIENDLY: { CLEAR: 4, CLOSED: 5 },
  ENEMY: { CLEAR: 5, CLOSED: 6 },
};

export interface FacilityColumn {
  readonly label: string;
  readonly minimumStrength: number;
}

/** 10.0c Barrage vs Facility Table columns (the printed costs apply to artillery only). */
export const FACILITY_TABLE_COLUMNS: readonly FacilityColumn[] = [
  { label: '1 or less', minimumStrength: 1 },
  { label: '2', minimumStrength: 2 },
  { label: '3-4', minimumStrength: 3 },
  { label: '5-10', minimumStrength: 5 },
  { label: '11-20', minimumStrength: 11 },
  { label: '21-40', minimumStrength: 21 },
  { label: '41-80', minimumStrength: 41 },
  { label: '81+', minimumStrength: 81 },
];

/** Barrage vs Facility Table rows for one die (1-6); `*` is a successful Trainbusting. */
export const FACILITY_TABLE_ROWS: Readonly<Record<number, readonly string[]>> = Object.fromEntries([
  '- - - - - - (5) 1(5)',
  '- - - - - (5) 1(4) 1(4)',
  '- - - - (5) 1(5) 1(4) 1(4)',
  '- - - *(6) 1*(5) 1*(4) 1*(4) 2*(4)',
  '- (6) *(6) 1*(5) 1*(4) 2*(4) 2*(4) 2*(3)',
  '(6) *(5) 1*(5) 1*(4) 1*(4) 2*(4) 2*(3) 2*(3)',
].map((row, index) => [index + 1, row.split(' ')]));

export const facilityColumnIndex = (strength: number): number =>
  FACILITY_TABLE_COLUMNS.reduce((index, column, current) => strength >= column.minimumStrength ? current : index, 0);

export interface FacilityResult {
  readonly text: string;
  /** "1"/"2": Air Base Levels lost (or Port hits). */
  readonly levels: number;
  /** "*": a Trainbusting barrage succeeds. */
  readonly trainbusting: boolean;
  /** "(#)": each aircraft at a targeted Air Base loses a step on one die of this number or more. */
  readonly aircraftCheck: number | null;
}

export const parseFacilityResult = (text: string): FacilityResult => ({
  text,
  levels: Number(/^([12])/u.exec(text)?.[1] ?? 0),
  trainbusting: text.includes('*'),
  aircraftCheck: /\((\d)\)/u.test(text) ? Number(/\((\d)\)/u.exec(text)![1]) : null,
});
