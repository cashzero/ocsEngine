import { describe, expect, it } from 'vitest';
import {
  createPieceStateIndex,
  createRuleGameStateFixture,
  createRulesRng,
  queryBarrage,
  queryCombat,
  ruleActionBase,
  ruleEngine,
  setRuleSequenceFixture,
  type GameAction,
  type GameState,
} from '../../src/index.js';

const declareCombat = (state: GameState, kind: 'REGULAR' | 'OVERRUN'): GameState => {
  const actor = state.scenario.players[0]!.id;
  const action: GameAction = {
    ...ruleActionBase(state, actor, `declare:${kind}`),
    kind: 'DECLARE_COMBAT', combatKind: kind,
    attackerIds: ['piece:multi-step' as never],
    defenderIds: ['piece:ground' as never],
    targetHexId: '3,1' as never,
  };
  const result = ruleEngine.applyAction(state, action);
  expect(result.ok).toBe(true);
  if (!result.ok) throw new Error('Combat declaration failed.');
  return result.state;
};

const chooseResource = (state: GameState): GameState => {
  const actor = state.pendingDecision!.ownerId;
  const resourceChoice = state.pendingDecision!.options.find(({ id }) => id.startsWith('resource:'))!;
  const action: GameAction = {
    ...ruleActionBase(state, actor, 'resource'), kind: 'RESPOND_DECISION',
    decisionId: state.pendingDecision!.id, choiceId: resourceChoice.id,
  };
  const result = ruleEngine.applyAction(state, action);
  expect(result.ok).toBe(true);
  if (!result.ok) throw new Error('Resource choice failed.');
  return result.state;
};

const commit = (state: GameState): { state: GameState; kinds: readonly string[] } => {
  const action: GameAction = {
    ...ruleActionBase(state, state.activeTransaction!.ownerId, 'commit'),
    kind: 'COMMIT_TRANSACTION', transactionId: state.activeTransaction!.id,
  };
  const result = ruleEngine.applyAction(state, action);
  expect(result.ok).toBe(true);
  if (!result.ok) throw new Error('Commit failed.');
  return { state: result.state, kinds: result.events.map(({ kind }) => kind) };
};

const respondFirst = (state: GameState, preferred?: (id: string) => boolean): GameState => {
  const option = preferred
    ? state.pendingDecision!.options.find(({ id }) => preferred(id))!
    : state.pendingDecision!.options[0]!;
  const action: GameAction = {
    ...ruleActionBase(state, state.pendingDecision!.ownerId, `respond:${state.pendingDecision!.kind}`),
    kind: 'RESPOND_DECISION', decisionId: state.pendingDecision!.id, choiceId: option.id,
  };
  const result = ruleEngine.applyAction(state, action);
  expect(result.ok).toBe(true);
  if (!result.ok) throw new Error('Result response failed.');
  return result.state;
};

describe('R8 combat and Overrun', () => {
  it('explains strength, odds, AR modifier, and terrain before declaration', () => {
    const source = createRuleGameStateFixture();
    const actor = source.scenario.players[0]!.id;
    const state = setRuleSequenceFixture(source, 'COMBAT', 'COMBAT', actor);
    const result = queryCombat(
      state, actor, ['piece:multi-step' as never], ['piece:ground' as never],
      '3,1' as never, 'REGULAR', true,
    );

    expect(result.allowed).toBe(true);
    expect(result.value).toMatchObject({
      attackerStrength: 4, defenderStrength: 2, odds: 2, actionRatingModifier: 1,
      terrainDefinitionIds: ['terrain:plain'],
    });
    expect(result.reasons.at(-1)?.rule).toBe('9.1-9.8');
  });

  it('commits supply/RNG once, retreats, then advances and closes exactly once', () => {
    const source = createRuleGameStateFixture({ rng: createRulesRng(6) });
    const actor = source.scenario.players[0]!.id;
    let state = setRuleSequenceFixture(source, 'COMBAT', 'COMBAT', actor);
    state = chooseResource(declareCombat(state, 'REGULAR'));
    const committed = commit(state);
    state = committed.state;

    expect(committed.kinds).toEqual(['RESOURCE_CONSUMED', 'DICE_ROLLED', 'DECISION_REQUESTED']);
    expect(state.activeTransaction).toMatchObject({ result: 'DEFENDER_RETREAT', step: 'AWAITING_RETREAT' });
    expect(state.rng.draws).toBe(2);
    expect(createPieceStateIndex(state.pieceState).get('piece:supply-dump' as never)?.resourceQuantity).toBe(3);

    state = respondFirst(state);
    const defender = createPieceStateIndex(state.pieceState).get('piece:ground' as never)!;
    expect(defender.location.kind).toBe('ON_MAP');
    expect(defender.location).not.toEqual({ kind: 'ON_MAP', hexId: '3,1' });
    expect(defender.mode).toBe('DG');
    expect(state.pendingDecision?.kind).toBe('ADVANCE_HEX');

    state = respondFirst(state, (id) => id === 'piece:piece:multi-step');
    expect(createPieceStateIndex(state.pieceState).get('piece:multi-step' as never)?.location)
      .toEqual({ kind: 'ON_MAP', hexId: '3,1' });
    expect(state.activeTransaction).toBeNull();
    expect(state.pendingDecision).toBeNull();
  });

  it('uses the combat transaction for Overrun and clears mover suspension on cancel', () => {
    const source = createRuleGameStateFixture();
    const actor = source.scenario.players[0]!.id;
    let state = setRuleSequenceFixture(source, 'MOVEMENT', 'MOVEMENT', actor);
    state = declareCombat(state, 'OVERRUN');
    expect(state.currentMoverId).toBe('piece:multi-step');
    const cancel: GameAction = {
      ...ruleActionBase(state, actor, 'cancel-overrun'),
      kind: 'CANCEL_TRANSACTION', transactionId: state.activeTransaction!.id,
    };
    const result = ruleEngine.applyAction(state, cancel);
    expect(result.ok && result.state.currentMoverId).toBeNull();
  });

  it('converts an impossible retreat into a non-empty forced step-loss decision', () => {
    const source = createRuleGameStateFixture({ rng: createRulesRng(6) });
    const actor = source.scenario.players[0]!.id;
    const cornered = {
      ...source,
      pieceState: {
        ...source.pieceState,
        pieces: source.pieceState.pieces.map((piece) => {
          if (piece.id === 'piece:ground') return { ...piece, location: { kind: 'ON_MAP' as const, hexId: '0,0' as never } };
          if (piece.id === 'piece:multi-step') return { ...piece, location: { kind: 'ON_MAP' as const, hexId: '1,0' as never } };
          return piece;
        }),
      },
    };
    let state = setRuleSequenceFixture(cornered, 'COMBAT', 'COMBAT', actor);
    const declared = ruleEngine.applyAction(state, {
      ...ruleActionBase(state, actor, 'cornered'), kind: 'DECLARE_COMBAT',
      combatKind: 'REGULAR', attackerIds: ['piece:multi-step' as never],
      defenderIds: ['piece:ground' as never], targetHexId: '0,0' as never,
    });
    expect(declared.ok).toBe(true);
    if (!declared.ok) return;
    state = chooseResource(declared.state);
    state = commit(state).state;

    expect(state.activeTransaction).toMatchObject({ result: 'DEFENDER_STEP_LOSS', step: 'AWAITING_LOSS' });
    expect(state.pendingDecision).toMatchObject({ kind: 'STEP_LOSS' });
    expect(state.pendingDecision?.options.length).toBeGreaterThan(0);
  });
});

describe('R8 artillery barrage', () => {
  it('validates capability/range and resolves DG plus step loss through a decision', () => {
    const source = createRuleGameStateFixture();
    const actor = source.scenario.players[0]!.id;
    let state = setRuleSequenceFixture(source, 'COMBAT', 'BARRAGE', actor);
    const query = queryBarrage(
      state, actor, ['piece:artillery' as never], ['piece:ground' as never], '3,1' as never,
    );
    expect(query.allowed).toBe(true);
    expect(query.value).toMatchObject({ strength: 2, distance: 2, maximumRange: 4, supplyTokenCost: 1 });

    const declare: GameAction = {
      ...ruleActionBase(state, actor, 'declare-barrage'),
      kind: 'DECLARE_BARRAGE', firerIds: ['piece:artillery' as never],
      targetPieceIds: ['piece:ground' as never], targetHexId: '3,1' as never,
    };
    const declared = ruleEngine.applyAction(state, declare);
    expect(declared.ok).toBe(true);
    if (!declared.ok) return;
    state = chooseResource(declared.state);
    state = commit(state).state;
    expect(state.activeTransaction).toMatchObject({ result: 'STEP_LOSS_AND_DG', step: 'AWAITING_LOSS' });
    expect(createPieceStateIndex(state.pieceState).get('piece:ground' as never)?.mode).toBe('DG');

    state = respondFirst(state);
    expect(createPieceStateIndex(state.pieceState).get('piece:ground' as never)?.location.kind)
      .toBe('ELIMINATED');
    expect(state.activeTransaction).toBeNull();
    expect(state.usage.find(({ pieceId }) => pieceId === 'piece:artillery')).toMatchObject({
      fired: true, barraged: true,
    });
  });

  it('rejects a barrage when the selected table band costs more supply than exists', () => {
    const source = createRuleGameStateFixture();
    const actor = source.scenario.players[0]!.id;
    const state = setRuleSequenceFixture({
      ...source,
      configuration: {
        ...source.configuration,
        barrageTable: source.configuration.barrageTable.map((band) => ({ ...band, supplyTokenCost: 5 })),
      },
    }, 'COMBAT', 'BARRAGE', actor);
    const action: GameAction = {
      ...ruleActionBase(state, actor, 'expensive-barrage'), kind: 'DECLARE_BARRAGE',
      firerIds: ['piece:artillery' as never], targetPieceIds: ['piece:ground' as never],
      targetHexId: '3,1' as never,
    };

    expect(ruleEngine.validateAction(state, action).violations.map(({ code }) => code))
      .toContain('BARRAGE_SUPPLY_UNAVAILABLE');
    expect(ruleEngine.applyAction(state, action)).toMatchObject({ ok: false, state, events: [] });
  });
});
