import { movementPoints, parseDefinitionId, regimentalEquivalents } from '../../core/index.js';
import { parseFaceId, type CounterDefinition, type PieceFaceDefinition } from '../../domain/piece/index.js';

// Transcribed from the module faces; see docs/oob/counter-corpus.md.
// Tuple: printed strength (barrage for artillery), AR, MA, range.
type Values = readonly [number, number, number, number];
interface SourceCounter {
  symbol: CounterDefinition['symbol'];
  kind: CounterDefinition['kind'];
  echelon: string;
  category: CounterDefinition['combatCategory'];
  combat: Values;
  move: Values;
  mobility: readonly ['leg' | 'truck' | 'tracked', 'leg' | 'truck' | 'tracked'];
  steps: number;
  re: number;
}
const basic = (symbol: SourceCounter['symbol'], echelon: string, category: SourceCounter['category'], combat: Values, move: Values, mobility: SourceCounter['mobility'], steps = 1, re = .5): SourceCounter => ({ symbol, echelon, category, combat, move, mobility, steps, re, kind: 'COMBAT' });
const hq = (combat: Values, move: Values, echelon = 'XXX'): SourceCounter => ({ ...basic('HQ', echelon, 'OTHER', combat, move, ['truck', 'truck']), kind: 'HQ' });
/** An HQ prints "range-MA" on each face (13.1a): its Combat Mode front (MA 0) and its Move Mode back. */
const hqFaces = (front: readonly [number, number], back: readonly [number, number], echelon = 'XXX'): SourceCounter =>
  hq([0, 0, front[1], front[0]], [0, 0, back[1], back[0]], echelon);
const artillery = (symbol: SourceCounter['symbol'], combat: Values, move: Values, mobility: SourceCounter['mobility']): SourceCounter => ({ ...basic(symbol, 'III', 'OTHER', combat, move, mobility), kind: 'ARTILLERY' });
/** Placeholder key for the German airborne division counter; not a real BTR GPID. */
export const AXIS_AIRBORNE_GPID = 900_001;
/** Placeholder key for the US airborne division counter; not a real BTR GPID. */
export const ALLIED_AIRBORNE_GPID = 900_002;
/** Placeholder keys (not real BTR GPIDs) of each US airborne division counter, by short formation name. */
export const ALLIED_AIRBORNE_DIVISION_GPIDS: Readonly<Record<string, number>> = {
  '82.Abn': ALLIED_AIRBORNE_GPID, '101.Abn': 900_003, '17.Abn': 900_004, '13.Abn': 900_005,
};
/**
 * Paratroop battalions for Air Drops (14.10). TODO(para-gpid): these two counters are generator-defined (a battalion, 1/2 RE,
 * leg on both faces: Move Mode MA 5, so its air transport equivalence is 1T, 14.9a/4.7b), not transcribed from a BTR counter,
 * and their keys are not BTR GPIDs. Closing evidence: the BTR battalion counters transcribed into this corpus.
 */
export const ALLIED_PARA_GPID = 900_006;
export const AXIS_PARA_GPID = 900_007;
const airborneDivision = (moveStrength: number, regiments: number, combatStrength: number): SourceCounter =>
  basic('AIRBORNE', 'XX', 'OTHER', [combatStrength, 4, 3, 0], [moveStrength, 4, 5, 0], ['leg', 'leg'], regiments, regiments);
export const COUNTER_CORPUS: Readonly<Record<number, SourceCounter>> = {
  // HQs, read from each PieceSlot's front image and its "B" back image (BTR S01 R10-R11 US, S04 R12-R14 and S05 R07 German):
  // front Combat Mode "range-0", back Move Mode "range-MA", truck MP on both faces.
  // US corps HQs: 14-0 / 9-16 (S01 R10 C01-C09, R11 C01-C04); US 18th Abn Corps: 8-0 / 6-16 (S01 R10 C10).
  ...Object.fromEntries([319, 320, 1724, 322, 323, 324, 325, 326, 327, 335, 336, 337, 338].map((gpid) => [gpid, hqFaces([14, 0], [9, 16])])),
  328: hqFaces([8, 0], [6, 16]),
  // German panzer corps HQs (39, 47, 58 Pz; S04 R12 C20, R13 C11-C12): 10-0 / 7-14.
  ...Object.fromEntries([1103, 1104, 1105].map((gpid) => [gpid, hqFaces([10, 0], [7, 14])])),
  // German corps HQs (S04 R13 C13-C20, R14 C11-C20): 8-0 / 5-10. Gruppe Hohne (S05 R07 C10) prints "Grp", not XXX.
  ...Object.fromEntries([1106, 1107, 1108, 1109, 1110, 1111, 1112, 1113, 1114, 1115, 1116, 1117, 1118, 1119, 1120, 1121, 1122, 1123]
    .map((gpid) => [gpid, hqFaces([8, 0], [5, 10])])),
  1124: hqFaces([8, 0], [5, 10], 'Grp'),
  160: basic('ARMOR', 'III', 'MECH', [14,4,6,0], [7,4,14,0], ['tracked','tracked'], 1, 1),
  339: basic('INFANTRY', 'XX', 'OTHER', [24,4,3,0], [12,4,10,0], ['leg','truck'], 4, 4),
  385: basic('GLIDER', 'III', 'OTHER', [4,4,3,0], [2,4,5,0], ['leg','leg'], 1, 1),
  164: artillery('SP_ARTILLERY', [17,3,5,2], [9,3,14,2], ['tracked','tracked']),
  163: basic('RECON', 'II', 'MECH', [5,4,7,0], [3,4,16,0], ['tracked','tracked']),
  466: basic('ENGINEER', 'X', 'OTHER', [1,0,0,0], [0,0,12,0], ['truck','truck'], 1, 1),
  733: basic('ARMOR', 'II', 'ARMOR', [6,5,7,0], [3,5,14,0], ['tracked','tracked']),
  826: basic('INFANTRY', 'XX', 'OTHER', [16,3,3,0], [8,3,4,0], ['leg','leg'], 4, 4),
  // German Fallschirmjäger division (XX, 4 steps): counter sheets 3F (18-3-3) / 3B (9-3-4), leg on both faces.
  // Synthetic key: the VASSAL GPID has not been extracted (see TODO in catalog.ts).
  [AXIS_AIRBORNE_GPID]: basic('AIRBORNE', 'XX', 'OTHER', [18,3,3,0], [9,3,4,0], ['leg','leg'], 4, 4),
  // US airborne divisions (XX, one step per regiment, leg on both faces): the sum of the regiments printed on counter
  // sheets 2F (combat faces, 4-4-3 / 5-4-3) and 2B (move faces, 2-4-5 / 3-4-5). 101.Abn's 18-4-3 / 10-4-5 was also
  // confirmed by the user.
  [ALLIED_AIRBORNE_GPID]: airborneDivision(8, 3, 14), // 82.Abn: 505 5/3, 504 5/3, 325 4/2
  900_003: airborneDivision(10, 4, 18), // 101.Abn: 506 5/3, 502 5/3, 401 4/2, 327 4/2
  900_004: airborneDivision(7, 3, 13), // 17.Abn: 513 5/3, 194 4/2, 193 4/2
  900_005: airborneDivision(7, 3, 13), // 13.Abn: 515 5/3, 517 4/2, 326 4/2
  [ALLIED_PARA_GPID]: basic('AIRBORNE', 'II', 'OTHER', [3,4,3,0], [2,4,5,0], ['leg','leg'], 1, .5),
  [AXIS_PARA_GPID]: basic('AIRBORNE', 'II', 'OTHER', [3,3,3,0], [2,3,5,0], ['leg','leg'], 1, .5),
  806: basic('INFANTRY', 'III', 'OTHER', [7,4,3,0], [4,4,14,0], ['leg','truck'], 1, 1),
  // US 159 Inf Rgt: images/BTR S02 R06 C19.png (4-3-3) and C19B.png (2-3-14).
  408: basic('INFANTRY', 'III', 'OTHER', [4,3,3,0], [2,3,14,0], ['leg','truck'], 1, 1),
  739: artillery('ARTILLERY', [25,3,3,2], [13,3,14,2], ['leg','truck']),
  737: basic('RECON', 'II', 'MECH', [3,5,8,0], [2,5,18,0], ['tracked','tracked']),
  713: basic('ENGINEER', 'X', 'OTHER', [1,0,0,0], [0,0,12,0], ['truck','truck'], 1, 1),
  // Breakdowns (20.0): 1 RE, one step, leg on both faces, "Brkdwn" on the counter. Combat / move faces read from the art:
  // US 5-4-3 (images BTR S01 R10 C16F/B.png) 3-4-5; US 5-3-3 (S01 R09 C15F/B) 3-3-5; Ge 3-4-2 (S04 R01 C01/B) 2-4-4;
  // Ge 3-3-2 (S04 R01 C09/B) 2-3-4; Ge LW 4-3-2 (S03 R07 C16/B) 2-3-4.
  88: basic('INFANTRY', 'III', 'OTHER', [5,4,3,0], [3,4,5,0], ['leg','leg'], 1, 1),
  80: basic('INFANTRY', 'III', 'OTHER', [5,3,3,0], [3,3,5,0], ['leg','leg'], 1, 1),
  709: basic('INFANTRY', 'III', 'OTHER', [3,4,2,0], [2,4,4,0], ['leg','leg'], 1, 1),
  710: basic('INFANTRY', 'III', 'OTHER', [3,3,2,0], [2,3,4,0], ['leg','leg'], 1, 1),
  1207: basic('INFANTRY', 'III', 'OTHER', [4,3,2,0], [2,3,4,0], ['leg','leg'], 1, 1),
  77: { ...basic('TRUCK', '', 'OTHER', [0,0,45,0], [0,0,45,0], ['truck','truck']), kind: 'TRANSPORT', re: 0 },
  71: { ...basic('TRUCK', '', 'OTHER', [0,0,45,0], [0,0,45,0], ['truck','truck']), kind: 'TRANSPORT', re: 0 },
};
const must = <T>(result: {ok:true; value:T} | {ok:false; error:unknown}): T => { if (!result.ok) throw new Error('Invalid counter corpus scalar'); return result.value; };
/** Generated trucks are BTR five-point counters ("5 45", images TuPTS02R08C20.png). */
export const TRUCK_COUNTER_POINTS = 5;
/** Printed on the Extender side: "Extender 20 Truck MPs" (images TuPTS02R08C20B.png). */
export const EXTENDER_RANGE_MP = 20;

export const corpusFaces = (gpid: number): readonly PieceFaceDefinition[] => {
  const source = COUNTER_CORPUS[gpid];
  if (!source) { if (gpid === 321 || gpid === 359) return []; throw new Error(`Unknown counter GPID ${gpid}`); }
  // BTR five-point trucks carry an Extender on the back (range 20 Truck MP, no MA; 12.7).
  if (source.kind === 'TRANSPORT') {
    return [
      { id: must(parseFaceId('move')), name: 'Move', mobilityClassDefinitionId: must(parseDefinitionId('mobility:truck')),
        steps: [{ remainingSteps: 1, combatStrength: null, actionRating: null, movementPointTicks: must(movementPoints(source.move[2])),
          regimentalEquivalentTicks: null, range: null, ratings: [] }] },
      { id: must(parseFaceId('extender')), name: 'Extender', mobilityClassDefinitionId: must(parseDefinitionId('mobility:truck')),
        steps: [{ remainingSteps: 1, combatStrength: null, actionRating: null, movementPointTicks: must(movementPoints(0)),
          regimentalEquivalentTicks: null, range: EXTENDER_RANGE_MP, ratings: [] }] },
    ];
  }
  return (['combat','move'] as const).map((orientation) => {
    const values = source[orientation];
    return {
      id: must(parseFaceId(orientation)), name: orientation === 'combat' ? 'Combat' : 'Move',
      mobilityClassDefinitionId: must(parseDefinitionId(`mobility:${source.mobility[orientation === 'combat' ? 0 : 1]}`)),
      steps: Array.from({length:source.steps}, (_, i) => ({
        remainingSteps: i+1,
        // 9.11d: printed strength is the same for every step; losses halve it in play.
        combatStrength: source.kind === 'COMBAT' ? values[0] : null,
        actionRating: source.kind === 'HQ' || source.kind === 'TRANSPORT' ? null : values[1],
        movementPointTicks: must(movementPoints(values[2])),
        regimentalEquivalentTicks: source.kind === 'TRANSPORT' ? null : must(regimentalEquivalents(source.re * (i+1) / source.steps)),
        range: source.kind === 'ARTILLERY' || source.kind === 'HQ' ? values[3] : null,
        ratings: source.kind === 'ARTILLERY' ? [{ ratingDefinitionId: must(parseDefinitionId('rating:barrage-strength')), value: values[0] }] : [],
      })),
    };
  });
};
export const corpusCounter = (gpid: number, designation: string, affiliation: string, nationality: CounterDefinition['nationality'], formationColor: string | null, echelon?: string): CounterDefinition => {
  const source = COUNTER_CORPUS[gpid];
  if (!source && gpid !== 321 && gpid !== 359) throw new Error(`Unknown counter GPID ${gpid}`);
  return {
    kind: source?.kind ?? 'SUPPLY', symbol: source?.symbol ?? 'SUPPLY',
    // A truck prints no designation: the board-game counter shows only its symbol, points and MPs.
    designation: source?.kind === 'TRANSPORT' ? '' : designation, affiliation, nationality, formationColor, echelon: echelon ?? source?.echelon ?? '',
    combatCategory: source?.category ?? 'OTHER', defensiveOnly: source?.symbol === 'ENGINEER',
    rebuildable: true, showRe: (source?.steps ?? 0) > 1,
    transportPoints: source?.kind === 'TRANSPORT' ? TRUCK_COUNTER_POINTS : null,
  };
};
