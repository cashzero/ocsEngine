import { describe, expect, it } from 'vitest';
import {
  createPieceStateIndex,
  createRuleGameStateFixture,
  ruleActionBase,
  ruleEngine,
  setHexControl,
  setRuleSequenceFixture,
  type GameAction,
} from '../../src/index.js';

describe('R9 reinforcement and lifecycle', () => {
  it('places an owned reinforcement only at a matching Entry and gains control', () => {
    const source = createRuleGameStateFixture();
    const actor = source.scenario.players[0]!.id;
    const hq = source.pieceState.pieces.find(({ id }) => id === 'piece:hq')!;
    const waiting = {
      ...source,
      pieceState: {
        ...source.pieceState,
        pieces: source.pieceState.pieces.map((piece) => piece.id === hq.id
          ? { ...piece, location: { kind: 'OFF_MAP_BOX' as const, boxId: source.scenario.boxes[0]!.id } }
          : piece),
      },
    };
    const state = setRuleSequenceFixture(waiting, 'REINFORCEMENT', 'NONE', actor);
    const action: GameAction = {
      ...ruleActionBase(state, actor, 'reinforce'),
      kind: 'PLACE_REINFORCEMENT', pieceId: hq.id, hexId: '0,0' as never,
    };
    const result = ruleEngine.applyAction(state, action);

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(createPieceStateIndex(result.state.pieceState).get(hq.id)?.location)
      .toEqual({ kind: 'ON_MAP', hexId: '0,0' });
    expect(result.state.mapState.hexControl.find(({ hexId }) => hexId === '0,0')?.controllerId)
      .toBe(actor);
  });

  it('restores involuntary mode and clears only the friendly usage ledger at Clean Up', () => {
    const source = createRuleGameStateFixture();
    const actor = source.scenario.players[0]!.id;
    const friendly = source.pieceState.pieces.find(({ id }) => id === 'piece:multi-step')!;
    const enemy = source.pieceState.pieces.find(({ id }) => id === 'piece:ground')!;
    const state = setRuleSequenceFixture({
      ...source,
      pieceState: {
        ...source.pieceState,
        pieces: source.pieceState.pieces.map((piece) => piece.id === friendly.id
          ? { ...piece, mode: 'DG' as const }
          : piece),
      },
      usage: [
        { pieceId: friendly.id, movementSpentTicks: 4, moved: true, fired: false, attacked: true, barraged: false, reserveReleased: false },
        { pieceId: enemy.id, movementSpentTicks: 4, moved: true, fired: false, attacked: false, barraged: false, reserveReleased: false },
      ],
    }, 'CLEAN_UP', 'NONE', actor);
    const result = ruleEngine.applyAction(state, {
      ...ruleActionBase(state, actor, 'cleanup'), kind: 'ADVANCE_SEQUENCE',
    });

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(createPieceStateIndex(result.state.pieceState).get(friendly.id)?.mode).toBe('MOVE');
    expect(result.state.usage.map(({ pieceId }) => pieceId)).toEqual([enemy.id]);
    expect(result.events.map(({ kind }) => kind)).toEqual(['SEQUENCE_ADVANCED', 'CLEANUP_COMPLETED']);
  });

  it('scores controlled objectives and records turn-limit victory', () => {
    const source = createRuleGameStateFixture();
    const actor = source.scenario.players[0]!.id;
    const state = {
      ...setRuleSequenceFixture(source, 'TURN_END', 'NONE', actor),
      sequence: {
        ...setRuleSequenceFixture(source, 'TURN_END', 'NONE', actor).sequence,
        gameTurn: source.configuration.turnLimit,
      },
      mapState: setHexControl(source.mapState, source.configuration.objectives[0]!.hexId, actor),
    };
    const action: GameAction = {
      ...ruleActionBase(state, actor, 'victory'), kind: 'ADVANCE_SEQUENCE',
    };
    const result = ruleEngine.applyAction(state, action);

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.state.sequence.phase).toBe('COMPLETE');
    expect(result.state.victory).toMatchObject({ winnerId: actor, reason: 'TURN_LIMIT' });
    expect(result.state.victory.scores.find(({ playerId }) => playerId === actor)?.points).toBe(5);
    expect(result.events.at(-1)?.kind).toBe('VICTORY_RECORDED');
  });
});
