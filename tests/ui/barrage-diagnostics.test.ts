// @vitest-environment happy-dom
import { describe, expect, it } from 'vitest';
import {
  AIR_NEW_GAME_REQUEST, ALLIED, AXIS, atStep, buildGeneratedRuleState, createGameplayFixture,
  createUiController, formatHexId, generatedPieceId, hashGameState, parseGameStateJson, parseHexCoordinateId, ruleEngine,
  serializeGameState, type BarrageBlocker, type GameState,
} from '../../src/index.js';
import { emptyUsage } from '../../src/rules/pieces.js';
import { selectDeckTab, stepObjective, type DeckState } from '../../src/ui/command-deck.js';
import { commandDeckHtml } from './render-view.js';

const gun = generatedPieceId('allied:f1-artillery-1', AIR_NEW_GAME_REQUEST);
const otherGun = generatedPieceId('allied:independent-artillery-1', AIR_NEW_GAME_REQUEST);
const dump = generatedPieceId('allied:independent-supply-1', AIR_NEW_GAME_REQUEST);
const base = generatedPieceId('axis:air-base-1', AIR_NEW_GAME_REQUEST);
const hex = (value: string) => {
  const parsed = parseHexCoordinateId(value);
  if (!parsed.ok) throw new Error('Invalid test hex.');
  return formatHexId(parsed.value);
};
const origin = hex('5,5');
const target = hex('6,5');
const fixture = (): GameState => atStep(buildGeneratedRuleState({
  [gun]: [origin, 'COMBAT', 'combat'], [dump]: [origin, null], [base]: [target, null],
}, {}, { request: AIR_NEW_GAME_REQUEST }), 'COMBAT', 'BARRAGE', ALLIED);
const changePiece = (state: GameState, pieceId: typeof gun, change: (piece: GameState['pieceState']['pieces'][number]) => GameState['pieceState']['pieces'][number]): GameState => ({
  ...state, pieceState: { ...state.pieceState, pieces: state.pieceState.pieces.map((piece) => piece.id === pieceId ? change(piece) : piece) },
});
const noSupply = (state: GameState) => changePiece(state, dump, (piece) => ({ ...piece, resourceQuantity: 0 }));
const usedGun = (state: GameState): GameState => ({ ...state, usage: [{ ...emptyUsage(gun, origin), barraged: true }] });
const usedHex = (state: GameState): GameState => ({ ...state, ledger: { ...state.ledger, barragedHexIds: [target] } });
const farTarget = (state: GameState) => changePiece(state, base, (piece) => ({ ...piece, location: { kind: 'ON_MAP', hexId: hex('0,0') } }));
const without = (state: GameState, pieceId: typeof gun): GameState => changePiece(state, pieceId, (piece) => ({ ...piece, location: { kind: 'ELIMINATED' }, stackOrder: 0 }));
const load = async (state: GameState) => {
  const game = await createGameplayFixture({ scenario: state.scenario, configuration: state.configuration });
  const snapshot = serializeGameState(state);
  const hash = await hashGameState(state);
  if (!snapshot.ok || !hash.ok) throw new Error('Test state must serialize.');
  const parsed = parseGameStateJson(snapshot.value);
  if (!parsed.ok) throw new Error(JSON.stringify(parsed.error));
  const save = { ...game.session.save(), initialSnapshot: snapshot.value, currentSnapshot: snapshot.value, initialStateHash: hash.value, finalStateHash: hash.value };
  const session = await game.engine.loadSession(JSON.stringify(save));
  const controller = createUiController({ engine: game.engine, session, scenario: state.scenario, bindings: save.bindings });
  controller.start();
  return { ...game, session, controller };
};

const blockedCases: readonly [string, (state: GameState) => GameState, BarrageBlocker, string][] = [
  ['range', farTarget, 'OUT_OF_RANGE', 'targets outside artillery range'],
  ['supply', noSupply, 'SUPPLY_UNAVAILABLE', 'insufficient barrage supply'],
  ['unit use', usedGun, 'UNIT_ALREADY_BARRAGED', 'artillery already fired this phase'],
  ['hex use', usedHex, 'HEX_ALREADY_BARRAGED', 'target hex already barraged this phase'],
  ['no artillery', (state) => without(state, gun), 'NO_ARTILLERY', 'no friendly artillery on the map'],
  ['no enemy targets', (state) => without(state, base), 'NO_ENEMY_TARGETS', 'no enemy combat units, Air Bases, or damageable ports'],
  ['mode', (state) => changePiece(state, gun, (piece) => ({ ...piece, mode: 'STRAT' })), 'ARTILLERY_MODE', 'artillery in Reserve or Strat Mode'],
];

describe('rule-owned artillery target diagnostics', () => {
  it.each(blockedCases)('explains %s through the loaded session and both deck surfaces', async (_name, change, code, text) => {
    const state = change(fixture());
    const result = ruleEngine.getBarrageAvailability(state, ALLIED);
    expect(result.kind).toBe('BLOCKED');
    expect(result.blockers).toContain(code);
    expect(ruleEngine.getActionCandidates(state, { actorId: ALLIED, kind: 'DECLARE_BARRAGE', pieceId: null, budget: 100 }).actions).toEqual([]);
    const { session, seats, controller } = await load(state);
    expect(session.getBarrageAvailability(seats[0]).blockers).toContain(code);
    const snapshot = controller.getSnapshot();
    expect(snapshot.barrageTargets).toEqual([]);
    expect(snapshot.barrageBlockers).toContain(code);
    const objective = stepObjective(snapshot);
    expect(objective).toContain(text);
    const deck: DeckState = { search: '', working: false };
    selectDeckTab(snapshot, deck, 'targets');
    expect(commandDeckHtml(snapshot, deck)).toContain(objective);
    if (code !== 'OUT_OF_RANGE') expect(objective).not.toContain('outside artillery range');
    controller.dispose();
  });

  it('retains multiple causes instead of inventing one global restriction', () => {
    const state = usedHex(usedGun(fixture()));
    expect(ruleEngine.getBarrageAvailability(state, ALLIED)).toEqual({ kind: 'BLOCKED', blockers: ['HEX_ALREADY_BARRAGED', 'UNIT_ALREADY_BARRAGED'] });
  });

  it('clears blockers when another gun can attack', () => {
    const start = atStep(buildGeneratedRuleState({
      [gun]: [origin, 'COMBAT', 'combat'], [otherGun]: [origin, 'COMBAT', 'combat'],
      [dump]: [origin, null], [base]: [target, null],
    }, {}, { request: AIR_NEW_GAME_REQUEST }), 'COMBAT', 'BARRAGE', ALLIED);
    const state = usedGun(start);
    expect(ruleEngine.getBarrageAvailability(state, ALLIED)).toEqual({ kind: 'AVAILABLE', blockers: [] });
    expect(ruleEngine.getActionCandidates(state, { actorId: ALLIED, kind: 'DECLARE_BARRAGE', pieceId: null, budget: 100 }).actions.length).toBeGreaterThan(0);
  });

  it('clears blockers when another target remains legal', () => {
    const ground = generatedPieceId('axis:f1-combat-1', AIR_NEW_GAME_REQUEST);
    const start = atStep(buildGeneratedRuleState({
      [gun]: [origin, 'COMBAT', 'combat'], [dump]: [origin, null], [base]: [target, null],
      [ground]: [hex('7,5'), 'COMBAT', 'combat'],
    }, {}, { request: AIR_NEW_GAME_REQUEST }), 'COMBAT', 'BARRAGE', ALLIED);
    const state = usedHex(start);
    expect(ruleEngine.getBarrageAvailability(state, ALLIED)).toEqual({ kind: 'AVAILABLE', blockers: [] });
  });

  it('reports phase and Reserve restrictions from declaration validation', () => {
    const state = fixture();
    expect(ruleEngine.getBarrageAvailability(atStep(state, 'MOVEMENT', 'BARRAGE', ALLIED), ALLIED).blockers).toContain('INVALID_PHASE');
    expect(ruleEngine.getBarrageAvailability(atStep(state, 'REACTION', 'BARRAGE', ALLIED), ALLIED).blockers).toContain('RESERVE_NOT_RELEASED');
  });

  it('reports zero barrage strength without mislabelling it as a supply or range problem', () => {
    const state = fixture();
    const noStrength = { ...state, scenario: { ...state.scenario, pieceCatalog: { ...state.scenario.pieceCatalog,
      definitions: state.scenario.pieceCatalog.definitions.map((definition) => ({ ...definition,
        faces: definition.faces.map((face) => ({ ...face,
          steps: face.steps.map((step) => ({ ...step,
            ratings: step.ratings.map((rating) => rating.ratingDefinitionId === 'rating:barrage-strength' ? { ...rating, value: 0 } : rating),
          })),
        })),
      })),
    } } };
    expect(ruleEngine.getBarrageAvailability(noStrength, ALLIED)).toEqual({ kind: 'BLOCKED', blockers: ['STRENGTH_TOO_LOW'] });
  });

  it('never returns the acting seat blockers to its opponent, a paused session, or a handoff screen', async () => {
    const { session, seats, controller } = await load(noSupply(fixture()));
    expect(ruleEngine.getBarrageAvailability(noSupply(fixture()), AXIS)).toEqual({ kind: 'UNAVAILABLE', blockers: [] });
    expect(session.getBarrageAvailability(seats[1])).toEqual({ kind: 'UNAVAILABLE', blockers: [] });
    session.pause();
    expect(session.getBarrageAvailability(seats[0])).toEqual({ kind: 'UNAVAILABLE', blockers: [] });
    session.resume();
    controller.beginHandoff();
    expect(session.getBarrageAvailability(seats[0])).toEqual({ kind: 'UNAVAILABLE', blockers: [] });
    expect(controller.getSnapshot().barrageBlockers).toEqual([]);
    controller.dispose();
  });
});
