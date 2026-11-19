import { readFileSync } from 'node:fs';
import { gunzipSync } from 'node:zlib';
import { describe, expect, it } from 'vitest';
import {
  createBotActionAccess, createBotRng, createGameplayFixture, createHeuristicPolicy, forecastCombat, gameplayRequestId,
  hashGameState, heuristicWeights, parseGameStateJson, ruleEngine, serializeGameState,
  type GameState, type HexId,
} from '../../src/index.js';
import { setModeForHex } from '../../src/rules/combat/combat.js';
import { hexDistanceBetween, hexOf, isAttackCapable, isCombatUnit, opponentOf } from '../../src/rules/pieces.js';

const target = '12,12' as HexId;
const recordedBarrage = (): GameState => {
  const { snapshot } = JSON.parse(gunzipSync(readFileSync(new URL('./fixtures/barrage-cost-1300205.state.json.gz', import.meta.url))).toString());
  const parsed = parseGameStateJson(snapshot);
  if (!parsed.ok) throw new Error('Cannot load the recorded barrage position');
  return parsed.value;
};

const harness = async (state: GameState) => {
  const actorId = state.sequence.actingPlayerId;
  const fixture = await createGameplayFixture({ scenario: state.scenario, configuration: state.configuration });
  const snapshot = serializeGameState(state);
  const hash = await hashGameState(state);
  if (!snapshot.ok) throw new Error(JSON.stringify(snapshot.error.slice(0, 5)));
  if (!hash.ok) throw new Error(JSON.stringify(hash.error.slice(0, 5)));
  const initial = { ...fixture.session.save(), initialSnapshot: snapshot.value, currentSnapshot: snapshot.value,
    initialStateHash: hash.value, finalStateHash: hash.value };
  const session = await fixture.engine.loadSession(JSON.stringify(initial));
  session.start();
  const choose = (barrageGroupsByCost = 1) => {
    const seat = initial.bindings.find(({ seatId }) => session.getPendingDecision(seatId))
      ?? initial.bindings.find(({ playerId }) => playerId === actorId)!;
    const seatId = seat.seatId;
    return createHeuristicPolicy({ scenario: state.scenario, turnLimit: state.configuration.turnLimit }, {
      weights: heuristicWeights({ barrageGroupsByCost }),
    }).decide({
      seatId, playerId: seat.playerId, view: session.getView(seatId), actions: createBotActionAccess(session, seatId),
      memory: { stepKey: 'barrage', actions: 0, notes: new Map() }, rng: createBotRng(7, hash.value, 0),
    })!;
  };
  const dispatch = async () => {
    const { action } = choose();
    const seatId = initial.bindings.find(({ playerId }) => playerId === action.actorId)!.seatId;
    const result = await session.dispatch({ requestId: gameplayRequestId(`barrage:${action.expectedRevision}`), seatId, action });
    expect(result.status).toBe('ACCEPTED');
    return result.events;
  };
  return { session, choose, dispatch, engine: fixture.engine, bindings: initial.bindings };
};

describe('ground barrage groups', () => {
  it('offers the recorded 4T group and advances directly to combat when the original salvo adds little', async () => {
    const state = recordedBarrage();
    const actorId = state.sequence.actingPlayerId;
    const { actions } = ruleEngine.getActionCandidates(state, {
      actorId, kind: 'DECLARE_BARRAGE', pieceId: null, budget: 400, groundBarrageGroupsByCost: true,
    });
    const costs = actions.flatMap((action) => action.kind === 'DECLARE_BARRAGE' && action.targetHexId === target ? [
      [action.firerIds.length, ruleEngine.explain(state, action).facts.find(({ key }) => key === 'barrage.supplyTokens')?.value],
    ] : []);
    expect(costs).toEqual([[1, 3], [2, 4], [4, 6], [6, 8]]);
    const game = await harness(state);
    expect(game.choose(0).action).toMatchObject({ kind: 'DECLARE_BARRAGE', targetHexId: target });
    expect(game.choose(0).breakdown).toContainEqual({ term: 'supply', value: -9.6 });
    expect(game.choose().action.kind).toBe('ADVANCE_SEQUENCE');
    await game.dispatch();
    expect(game.choose().action).toMatchObject({ kind: 'DECLARE_COMBAT', targetHexId: '11,15' });
    await game.dispatch();
  }, 60_000);

  it('picks and pays for the 4T group when DG enables the best follow-up, and holds fire once the same stack is DG', async () => {
    const original = recordedBarrage();
    const actor = original.sequence.actingPlayerId;
    const defenders = new Set(original.pieceState.pieces.filter((piece) =>
      piece.ownerId !== actor && hexOf(piece) === target && isCombatUnit(original, piece)).map(({ definitionId }) => definitionId));
    const state: GameState = {
      ...original,
      pieceState: { ...original.pieceState, pieces: original.pieceState.pieces.map((piece) =>
        piece.ownerId !== actor && hexOf(piece) && hexOf(piece) !== target && isCombatUnit(original, piece)
          ? { ...piece, location: { kind: 'ELIMINATED' } } : piece) },
      scenario: { ...original.scenario, pieceCatalog: { ...original.scenario.pieceCatalog,
        definitions: original.scenario.pieceCatalog.definitions.map((definition) => !defenders.has(definition.id) ? definition : {
          ...definition, faces: definition.faces.map((face) => ({ ...face, steps: face.steps.map((step) => ({
            ...step, combatStrength: step.combatStrength === null ? null : step.combatStrength * 6,
          })) })),
        }),
      } },
    };
    const game = await harness(state);
    const shot = game.choose().action;
    expect(shot).toMatchObject({ kind: 'DECLARE_BARRAGE', targetHexId: target });
    if (shot.kind !== 'DECLARE_BARRAGE') throw new Error('Expected a ground barrage');
    expect(shot.firerIds).toHaveLength(2);
    const preview = ruleEngine.explain(state, shot, 'AFTER_PAYMENT_AND_DG').barrageFollowUp!;
    expect(forecastCombat(preview.before[0]!.facts)?.odds).toBe('1:2');
    expect(forecastCombat(preview.after[0]!.facts)?.odds).toBe('1:1');
    const events = [...await game.dispatch()];
    for (let i = 0; game.bindings.some(({ seatId }) => game.session.getPendingDecision(seatId)) && i < 10; i += 1) {
      events.push(...await game.dispatch());
    }
    expect(game.bindings.every(({ seatId }) => !game.session.getPendingDecision(seatId))).toBe(true);
    expect(events.reduce((total, event) => total + (event.kind === 'RESOURCE_CONSUMED' ? event.reservation.quantity : 0), 0)).toBe(4);
    const restored = await game.engine.loadSession(game.session.serializeSave());
    const replayed = await game.engine.loadReplay(JSON.stringify(game.session.exportReplay()), game.bindings);
    expect(restored.getMetadata().stateHash).toBe(game.session.getMetadata().stateHash);
    expect(replayed.getMetadata().stateHash).toBe(game.session.getMetadata().stateHash);

    const alreadyDg = await harness(setModeForHex(state, target, opponentOf(state, actor), []));
    expect(alreadyDg.choose().action.kind).toBe('ADVANCE_SEQUENCE');

    const withoutAttackers = await harness({ ...state, pieceState: {
      ...state.pieceState, pieces: state.pieceState.pieces.map((piece) => {
        const hex = hexOf(piece);
        return piece.ownerId === actor && hex && hexDistanceBetween(hex, target) === 1 && isAttackCapable(state, piece)
          ? { ...piece, mode: 'RESERVE' } : piece;
      }),
    } });
    expect(withoutAttackers.choose().action.kind).toBe('ADVANCE_SEQUENCE');
  }, 60_000);
});
