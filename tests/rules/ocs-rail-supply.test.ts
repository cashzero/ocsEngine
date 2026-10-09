import { describe, expect, it } from 'vitest';
import {
  ALLIED,
  AXIS,
  applyRuleAction,
  atStep,
  buildGeneratedRuleState,
  featuresAlong,
  friendlySupplySources,
  generatedPieceId,
  movementCostModel,
  parseGameStateJson,
  pieceHasTrace,
  RULE_FIXTURE_NEW_GAME_REQUEST,
  queryTraceCoverage,
  serializeGameState,
  validateRuleConfiguration,
  type GameState,
  type MapAdditions,
  type NewGameRequest,
  type Placement,
} from '../../src/index.js';

/**
 * Railroads in trace supply (12.6a, 13.3c, 13.3h, 13.8c, 12.7a). The rule fixture's Allied map-edge
 * source is -3,6; a railroad runs east along row 6, far beyond the 5 MP draw range of that source.
 */
const U = {
  alLeg: generatedPieceId('allied:f2-combat-1'), alTrk: generatedPieceId('allied:f1-combat-1'), alTrk2: generatedPieceId('allied:f1-combat-2'),
  alHq: generatedPieceId('allied:independent-hq-1'), alTruck: generatedPieceId('allied:independent-transport-1'),
  axTrk: generatedPieceId('axis:f1-combat-1'),
};
const row = (from: number, to: number): string[] => Array.from({ length: to - from + 1 }, (_, index) => `${from + index},6`);
const MAIN_LINE = featuresAlong(row(-3, 12));
const VILLAGE = 'settlement:village';
const piece = (state: GameState, id: string) => state.pieceState.pieces.find((candidate) => candidate.id === id)!;
const sources = (state: GameState, playerId = ALLIED) => friendlySupplySources(state, playerId);
const kindAt = (state: GameState, hexId: string) => sources(state).find((source) => source.hexId === hexId)?.kind ?? null;
const state = (placement: Placement, additions: MapAdditions, terrain: Readonly<Record<string, string>> = {}): GameState =>
  buildGeneratedRuleState(placement, terrain, additions);
/** The Allied infantry regiment far down the line, out of reach of the map-edge source. */
const FAR = { [U.alLeg]: ['11,6', 'COMBAT', 'combat'] } as const satisfies Placement;

describe('OCS 4.3 railroads in trace supply (12.6a, 13.3c, 13.3h)', () => {
  it('makes a controlled village on a railroad back to a source a Supply Source', () => {
    const noRail = state(FAR, { features: { '10,6': [VILLAGE] }, control: { '10,6': ALLIED } });
    expect(kindAt(noRail, '10,6')).toBeNull();
    expect(pieceHasTrace(noRail, piece(noRail, U.alLeg))).toBe(false);

    const railed = state(FAR, { hexsides: MAIN_LINE, features: { '10,6': [VILLAGE] }, control: { '10,6': ALLIED } });
    expect(kindAt(railed, '-3,6')).toBe('MAP_EDGE');
    expect(kindAt(railed, '10,6')).toBe('DETRAINABLE');
    expect(pieceHasTrace(railed, piece(railed, U.alLeg))).toBe(true);
    expect(queryTraceCoverage(railed, ALLIED, null).value?.hexIds).toContain('11,6');
    // Traced straight to the rail source, not through an HQ throw.
    expect(queryTraceCoverage(railed, ALLIED, null).value?.directHexIds).toContain('11,6');
  });

  it('needs a village, city or port (or an HQ) to detrain: bare rail Hexes are not sources', () => {
    const bare = state(FAR, { hexsides: MAIN_LINE, control: { '10,6': ALLIED } });
    expect(sources(bare).filter(({ kind }) => kind === 'DETRAINABLE')).toEqual([]);
    expect(pieceHasTrace(bare, piece(bare, U.alLeg))).toBe(false);
  });

  it('requires the detrainable Hex to be controlled, and rail paths only pass stations the player controls (13.3h)', () => {
    const uncontrolled = state(FAR, { hexsides: MAIN_LINE, features: { '10,6': [VILLAGE] } });
    expect(kindAt(uncontrolled, '10,6')).toBeNull();
    const enemyStation = state(FAR, {
      hexsides: MAIN_LINE, features: { '6,6': [VILLAGE], '10,6': [VILLAGE] }, control: { '6,6': AXIS, '10,6': ALLIED },
    });
    expect(kindAt(enemyStation, '6,6')).toBeNull();
    expect(kindAt(enemyStation, '10,6')).toBeNull();
    // Each player traces only to his own stations; the Axis line from 14,6 is cut by the Allied one at 10,6.
    expect(sources(enemyStation, AXIS).some(({ hexId }) => hexId === '6,6')).toBe(false);
  });

  it('is cut by an enemy ZOC unless a friendly combat unit negates it, and by an enemy combat unit on the line (13.3c, 13.3e)', () => {
    const additions: MapAdditions = { hexsides: MAIN_LINE, features: { '10,6': [VILLAGE] }, control: { '10,6': ALLIED } };
    // An Axis regiment at 5,5 exerts ZOC into rail Hexes 4,6 and 5,6.
    const zoc = state({ ...FAR, [U.axTrk]: ['5,5', 'COMBAT', 'combat'] }, additions);
    expect(kindAt(zoc, '10,6')).toBeNull();
    const negated = state({
      ...FAR, [U.axTrk]: ['5,5', 'COMBAT', 'combat'], [U.alTrk]: ['4,6', 'COMBAT', 'combat'], [U.alTrk2]: ['5,6', 'COMBAT', 'combat'],
    }, additions);
    expect(kindAt(negated, '10,6')).toBe('DETRAINABLE');
    const blocked = state({ ...FAR, [U.axTrk]: ['7,6', 'MOVE'] }, additions);
    expect(kindAt(blocked, '10,6')).toBeNull();
  });
});

describe('OCS 4.3 HQ-made detrainable Hexes (13.8c) and Extender links (12.7a)', () => {
  it('makes the rail Hex of a Combat Mode HQ detrainable, but not a Move Mode one', () => {
    const additions: MapAdditions = { hexsides: MAIN_LINE, control: { '9,6': ALLIED } };
    const combat = state({ [U.alHq]: ['9,6', 'COMBAT', 'combat'] }, additions);
    expect(kindAt(combat, '9,6')).toBe('DETRAINABLE');
    const moving = state({ [U.alHq]: ['9,6', 'MOVE', 'move'] }, additions);
    expect(kindAt(moving, '9,6')).toBeNull();
  });

  it('joins a separate rail line to a source through an Extender, making its stations detrainable (12.7a B/C, 12.7g)', () => {
    // A second line, 8,5 eastwards, has no rail connection to any source; an Extender at 8,6 is adjacent to it.
    const branch = featuresAlong(['8,5', '9,5', '10,5', '11,5']);
    const additions: MapAdditions = { hexsides: branch, features: { '11,5': [VILLAGE] }, control: { '11,5': ALLIED } };
    const before = atStep(state({ [U.alTruck]: ['8,6', null] }, additions), 'MOVEMENT', 'MOVEMENT', ALLIED);
    expect(kindAt(before, '11,5')).toBeNull();
    const formed = applyRuleAction(before, ALLIED, { kind: 'FORM_EXTENDER', truckId: U.alTruck });
    expect(formed.ok).toBe(true);
    if (!formed.ok) return;
    expect(kindAt(formed.state, '8,6')).toBe('EXTENDER');
    expect(kindAt(formed.state, '11,5')).toBe('DETRAINABLE');
  });
});

/**
 * 12.7a B needs a map wider than an Extender's 20 MP range: on the rule fixture's 18 columns any Extender beside a railroad
 * reaches a Supply Source along it (rail counts as road, 6.2a), so a link through the rail line itself never shows.
 */
const WIDE: NewGameRequest = { ...RULE_FIXTURE_NEW_GAME_REQUEST, map: { ...RULE_FIXTURE_NEW_GAME_REQUEST.map, width: 40 } };

describe('OCS 4.3 Extender joining two rail lines (12.7a B) on a wide map', () => {
  const truck = generatedPieceId('allied:independent-transport-1', WIDE);
  // The back line runs bare (no station) from the Allied map-edge source -3,6 to 30,6; the forward branch 28,4-33,4 has a
  // village at its end. The Extender at 28,5 is beside both lines and more than 20 MP from any source or station.
  const backLine = featuresAlong(Array.from({ length: 34 }, (_, index) => `${index - 3},6`));
  const branch = featuresAlong(['28,4', '29,4', '30,4', '31,4', '32,4', '33,4']);
  const wide = (placement: Placement): GameState => buildGeneratedRuleState(placement, {}, {
    request: WIDE, hexsides: [...backLine, ...branch], features: { '33,4': [VILLAGE] }, control: { '33,4': ALLIED },
  });

  it('makes the forward line detrainable when the back line leads to a source, though no source is in range', () => {
    const before = wide({});
    expect(kindAt(before, '-3,6')).toBe('MAP_EDGE');
    expect(kindAt(before, '33,4')).toBeNull();
    const linked = wide({ [truck]: ['28,5', null, 'extender'] });
    expect(kindAt(linked, '33,4')).toBe('DETRAINABLE');
  });

  it('does not join a back line that is itself cut from every source', () => {
    // An Axis combat unit on the back line at 2,6 cuts it (13.3e): what still leads to the source ends at 1,6, beyond the
    // Extender's 20 MP, so it has nothing to join. (Cut nearer, the stub left would still be in range and join.)
    const axis = generatedPieceId('axis:f1-combat-1', WIDE);
    const cut = wide({ [truck]: ['28,5', null, 'extender'], [axis]: ['2,6', 'MOVE'] });
    expect(kindAt(cut, '33,4')).toBeNull();
  });
});

describe('OCS 4.3 railroads as roads (6.2a) and in saved games', () => {
  it('moves along a railroad at the BtR Railroad cost, ignoring the terrain beside it', () => {
    const woods = Object.fromEntries(row(-3, 14).map((hexId) => [hexId, 'terrain:woods']));
    const railed = state({}, { hexsides: MAIN_LINE }, woods);
    const truck = movementCostModel(railed, 'truck');
    const along = truck.evaluate('0,6' as never, '1,6' as never);
    expect(along.kind === 'COST' && along.cost).toMatchObject({ road: true, totalTicks: 4 });
    const beside = truck.evaluate('0,6' as never, '0,7' as never);
    expect(beside.kind === 'COST' && beside.cost.road).toBe(false);
  });

  it('keeps the railroad configuration through a save, and rejects a railroad with no road cost', () => {
    const railed = state(FAR, { hexsides: MAIN_LINE, features: { '10,6': [VILLAGE] }, control: { '10,6': ALLIED } });
    const saved = serializeGameState(railed);
    expect(saved.ok).toBe(true);
    if (!saved.ok) return;
    const loaded = parseGameStateJson(saved.value);
    expect(loaded.ok).toBe(true);
    if (!loaded.ok) return;
    expect(loaded.value.configuration.railroads?.lines.map(({ featureDefinitionId }) => featureDefinitionId)).toEqual(['edge:multi-track-rail', 'edge:rail']);
    expect(kindAt(loaded.value, '10,6')).toBe('DETRAINABLE');
    const broken = { ...railed.configuration, railroads: { ...railed.configuration.railroads!, lines: [{ featureDefinitionId: 'edge:monorail' as never, multiTrack: false }] } };
    expect(validateRuleConfiguration(broken).map(({ code }) => code)).toContain('RAILROAD_WITHOUT_ROAD_COST');
  });
});
