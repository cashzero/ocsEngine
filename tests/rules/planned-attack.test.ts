import { describe, expect, it } from 'vitest';
import {
  ALLIED, buildGeneratedRuleState, generatedPieceId, hedgehogTemplate, ruleEngine, withHedgehogLevel,
  type GameState, type HexId, type PieceId,
} from '../../src/index.js';

const TANK = generatedPieceId('allied:independent-tank-1');
const FROM = '4,4' as HexId;
const TARGET = '6,4' as HexId;

const withHedgehog = (state: GameState, hexId: HexId, level: number): GameState => {
  const ownerId = state.scenario.players.find(({ id }) => id !== ALLIED)!.id;
  const template = hedgehogTemplate(state, ownerId)!;
  const hog = withHedgehogLevel({
    id: `test-hog:${hexId}` as PieceId, definitionId: template.id, ownerId, location: { kind: 'ON_MAP', hexId },
    currentFaceId: null, remainingSteps: null, mode: null, statuses: [], resourceQuantity: null, stackOrder: 99,
  }, level);
  return { ...state, pieceState: { ...state.pieceState, pieces: [...state.pieceState.pieces, hog] } };
};

const planned = (state: GameState) => ruleEngine.queryAttackStrength(state, ALLIED, [TANK], TARGET).value!;

describe('planned attack strength (9.4, 9.4b, 9.4e, 16.0e)', () => {
  it('counts the Combat side under each terrain the defender may pick, from own units and public terrain', () => {
    // The tank is still in Move Mode two hexes away: Combat side 6, Move side 3.
    const open = planned(buildGeneratedRuleState({ [TANK]: [FROM, 'MOVE', 'move'] }));
    expect(open.hedgehogLevel).toBe(0);
    // Clear: Armor attacks at x2.
    expect(open.options).toEqual([{ terrainId: 'terrain:clear', line: 'OPEN', strengths: [{ pieceId: TANK, strength: 12 }] }]);

    const town = planned(buildGeneratedRuleState({ [TANK]: [FROM, 'MOVE', 'move'] }, { [TARGET]: 'settlement:town' }));
    // A Minor City is Very Close and halves attacking Armor.
    expect(town.options.find(({ terrainId }) => terrainId === 'settlement:town')).toEqual({ terrainId: 'settlement:town', line: 'VERY_CLOSE', strengths: [{ pieceId: TANK, strength: 3 }] });

    const dug = planned(withHedgehog(buildGeneratedRuleState({ [TANK]: [FROM, 'MOVE', 'move'] }), TARGET, 2));
    // The hedgehog's Heavy AT turns the tank's x2 into x1.5, and its Level is reported.
    expect(dug.hedgehogLevel).toBe(2);
    expect(dug.options[0]!.strengths).toEqual([{ pieceId: TANK, strength: 9 }]);
  });
});
