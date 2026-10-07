import { describe, expect, it } from 'vitest';
import {
  DEFAULT_NEW_GAME_REQUEST,
  createInitialGameState,
  generateRandomOob,
  independentPackage,
  prepareNewGame,
  type GeneratedOob,
} from '../../src/index.js';
import { COUNTER_CORPUS, GARRISON_GPID } from '../../src/generation/oob/counter-corpus.js';
import { antiTankLevel, isAttackCapable } from '../../src/rules/pieces.js';
import { exertsZoc } from '../../src/rules/zoc/zoc.js';

/** OOB 0.4.0 (docs/roadmap/12-oob-revision-wbs.md): independent armor and anti-tank, garrisons, combat-value balance, supply. */

const generate = (scale: 'COMPACT' | 'STANDARD' | 'LARGE', divisionsPerSide: number, armoredDivisionsPerSide: number): GeneratedOob => {
  const result = generateRandomOob({ seed: 4242, scale, divisionsPerSide, armoredDivisionsPerSide });
  if (!result.ok) throw new Error(JSON.stringify(result.error));
  return result.value;
};

describe('OOB 0.4.0 counters (OOB-R1)', () => {
  it('prints the values transcribed from the BTR counter images', () => {
    const faces = (gpid: number) => ({ combat: COUNTER_CORPUS[gpid]!.combat.slice(0, 3), move: COUNTER_CORPUS[gpid]!.move.slice(0, 3), category: COUNTER_CORPUS[gpid]!.category, symbol: COUNTER_CORPUS[gpid]!.symbol });
    expect(faces(222)).toEqual({ combat: [6, 3, 6], move: [3, 3, 12], category: 'ARMOR', symbol: 'ARMOR' }); // US 745 Tk Bn
    expect(faces(450)).toEqual({ combat: [5, 3, 7], move: [2, 3, 14], category: 'ARMOR', symbol: 'ANTI_TANK' }); // US 803 TD Bn
    expect(faces(985)).toEqual({ combat: [4, 4, 6], move: [2, 4, 12], category: 'ARMOR', symbol: 'ASSAULT_GUN' }); // Ge 243 AG Bn
    expect(faces(996)).toEqual({ combat: [5, 4, 3], move: [3, 4, 14], category: 'OTHER', symbol: 'ANTI_TANK' }); // Ge 1 PJ Bn
    expect(COUNTER_CORPUS[996]!.defensive).toBe(true);
    expect(faces(971)).toEqual({ combat: [9, 5, 4], move: [5, 5, 8], category: 'ARMOR', symbol: 'TIGER' }); // Ge 506 Tgr Bn
    expect(faces(1015)).toEqual({ combat: [6, 5, 6], move: [3, 5, 12], category: 'ARMOR', symbol: 'ANTI_TANK' }); // Ge 654 PJ Bn
    expect(faces(GARRISON_GPID)).toEqual({ combat: [1, 1, 0], move: [1, 1, 0], category: 'OTHER', symbol: 'INFANTRY' });
  });
});

describe('OOB 0.4.0 composition', () => {
  it('fields independent armor, anti-tank and fewer artillery units per scale (OOB-R2)', () => {
    expect(independentPackage({ scale: 'COMPACT', divisionsPerSide: 6 })).toEqual({ artillery: 2, armor: 2, antiTank: 2 });
    expect(independentPackage({ scale: 'STANDARD', divisionsPerSide: 6 })).toEqual({ artillery: 2, armor: 3, antiTank: 3 });
    expect(independentPackage({ scale: 'LARGE', divisionsPerSide: 6 })).toEqual({ artillery: 3, armor: 3, antiTank: 3 });
    for (const [scale, divisions] of [['COMPACT', 6], ['STANDARD', 4], ['LARGE', 10]] as const) {
      const oob = generate(scale, divisions, 2);
      const expected = independentPackage({ scale, divisionsPerSide: divisions });
      for (const side of oob.sides) {
        const count = (role: string) => side.independentUnits.filter((unit) => unit.role === role).length;
        expect(count('ARTILLERY')).toBe(expected.artillery);
        // The weaker side may receive balancing battalions on top of the package.
        expect(count('TANK')).toBeGreaterThanOrEqual(expected.armor);
        expect(count('ANTI_TANK')).toBeGreaterThanOrEqual(expected.antiTank);
      }
    }
  });

  it('balances the sides on combat value within 10% (OOB-R3)', () => {
    for (const [scale, divisions, armored] of [['COMPACT', 6, 2], ['STANDARD', 3, 1], ['LARGE', 10, 4]] as const) {
      const oob = generate(scale, divisions, armored);
      expect(oob.metrics.balanceRatio).toBeGreaterThanOrEqual(0.9);
      expect(oob.warnings.filter((warning) => warning.startsWith('Combat value'))).toEqual([]);
    }
  });

  it('starts each side with 2 SP per division (OOB-R6)', () => {
    const oob = generate('COMPACT', 6, 2);
    const byId = new Map(oob.pieceDefinitionCatalog.definitions.map((definition) => [definition.id, definition]));
    for (const side of oob.sides) {
      const tokens = side.independentUnits.filter(({ role, staging }) => role === 'SUPPLY' && staging === undefined)
        .reduce((total, unit) => total + (byId.get(unit.definitionId)?.resource?.printedQuantity ?? 0), 0);
      expect(tokens).toBeGreaterThanOrEqual(8 * 6);
      expect(tokens).toBeLessThan(8 * 6 + 4);
    }
  });
});

describe('OOB 0.4.0 in play', () => {
  const prepared = prepareNewGame(DEFAULT_NEW_GAME_REQUEST);
  if (!prepared.ok) throw new Error('default game did not generate');
  const created = createInitialGameState(prepared.value.scenario, prepared.value.configuration, 1);
  if (!created.ok) throw new Error('default game did not start');
  const state = created.value;
  const definitionOf = (id: string) => state.scenario.pieceCatalog.definitions.find((definition) => definition.id === id)!;

  it('garrisons every objective with a unit that cannot move but exerts a ZOC (OOB-R4)', () => {
    const garrisonIds = new Set(prepared.value.generatedOob.sides.map(({ garrisonDefinitionId }) => garrisonDefinitionId));
    const garrisons = state.pieceState.pieces.filter((piece) => garrisonIds.has(piece.definitionId));
    expect(garrisons).toHaveLength(prepared.value.deployment.objectives.length);
    for (const garrison of garrisons) {
      expect(definitionOf(garrison.definitionId).faces.every((face) => face.steps.every((step) => Number(step.movementPointTicks) === 0))).toBe(true);
      expect(isAttackCapable(state, garrison)).toBe(true);
      expect(exertsZoc(state, garrison)).toBe(true);
    }
  });

  it('gives units with an Anti-Tank symbol Heavy AT effects, including the white-boxed German PJ battalion (OOB-R5, 9.4e)', () => {
    const levels = new Map<string, number>();
    for (const piece of state.pieceState.pieces) {
      const counter = definitionOf(piece.definitionId).counter;
      if (counter) levels.set(`${counter.symbol}/${counter.combatCategory}`, antiTankLevel(state, piece));
    }
    expect(levels.get('ANTI_TANK/OTHER')).toBe(2);
    expect(levels.get('ANTI_TANK/ARMOR')).toBe(2);
    expect(levels.get('ASSAULT_GUN/ARMOR')).toBe(2);
    expect(levels.get('INFANTRY/OTHER')).toBe(0);
  });
});
