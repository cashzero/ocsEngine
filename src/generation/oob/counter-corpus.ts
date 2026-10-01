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
const hq = (combat: Values, move: Values): SourceCounter => ({ ...basic('HQ', 'XXX', 'OTHER', combat, move, ['truck', 'truck']), kind: 'HQ' });
const artillery = (symbol: SourceCounter['symbol'], combat: Values, move: Values, mobility: SourceCounter['mobility']): SourceCounter => ({ ...basic(symbol, 'III', 'OTHER', combat, move, mobility), kind: 'ARTILLERY' });
export const COUNTER_CORPUS: Readonly<Record<number, SourceCounter>> = {
  319: hq([0,0,0,14], [0,0,16,9]),
  160: basic('ARMOR', 'III', 'MECH', [14,4,6,0], [7,4,14,0], ['tracked','tracked'], 1, 1),
  339: basic('INFANTRY', 'XX', 'OTHER', [24,4,3,0], [12,4,10,0], ['leg','truck'], 4, 4),
  385: basic('GLIDER', 'III', 'OTHER', [4,4,3,0], [2,4,5,0], ['leg','leg'], 1, 1),
  164: artillery('SP_ARTILLERY', [17,3,5,2], [9,3,14,2], ['tracked','tracked']),
  163: basic('RECON', 'II', 'MECH', [5,4,7,0], [3,4,16,0], ['tracked','tracked']),
  466: basic('ENGINEER', 'X', 'OTHER', [1,0,0,0], [0,0,12,0], ['truck','truck'], 1, 1),
  1103: hq([0,0,0,10], [0,0,14,7]),
  733: basic('ARMOR', 'II', 'ARMOR', [6,5,7,0], [3,5,14,0], ['tracked','tracked']),
  826: basic('INFANTRY', 'XX', 'OTHER', [16,3,3,0], [8,3,4,0], ['leg','leg'], 4, 4),
  806: basic('INFANTRY', 'III', 'OTHER', [7,4,3,0], [4,4,14,0], ['leg','truck'], 1, 1),
  // US 159 Inf Rgt: images/BTR S02 R06 C19.png (4-3-3) and C19B.png (2-3-14).
  408: basic('INFANTRY', 'III', 'OTHER', [4,3,3,0], [2,3,14,0], ['leg','truck'], 1, 1),
  739: artillery('ARTILLERY', [25,3,3,2], [13,3,14,2], ['leg','truck']),
  737: basic('RECON', 'II', 'MECH', [3,5,8,0], [2,5,18,0], ['tracked','tracked']),
  713: basic('ENGINEER', 'X', 'OTHER', [1,0,0,0], [0,0,12,0], ['truck','truck'], 1, 1),
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
    designation, affiliation, nationality, formationColor, echelon: echelon ?? source?.echelon ?? '',
    combatCategory: source?.category ?? 'OTHER', defensiveOnly: source?.symbol === 'ENGINEER',
    rebuildable: true, showRe: (source?.steps ?? 0) > 1,
    transportPoints: source?.kind === 'TRANSPORT' ? TRUCK_COUNTER_POINTS : null,
  };
};
