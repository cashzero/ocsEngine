import { describe, expect, it } from 'vitest';
import {
  DEFAULT_NEW_GAME_REQUEST,
  createInitialGameState,
  hexDistanceBetween,
  parseHexsideId,
  prepareNewGame,
  ruleEngine,
  type Engagement,
  type GameState,
} from '../../src/index.js';

/**
 * The deployment plan (user, 2026-10-09): HQs spread over the front's main axes, the divisions and independent units shared
 * out evenly between them, the line in Combat Mode, and the supply placed last, where the troops can draw from it and the
 * enemy's first move cannot reach it (it was captured on the opening move).
 */
const ENGAGEMENTS: readonly Engagement[] = ['MEETING', 'ALLIED_ATTACKS', 'AXIS_ATTACKS'];
const SEEDS = [0, 1, 2, 3];

const opening = (engagement: Engagement, index: number) => {
  const base = 0x0a1b0000 + index * 97;
  const prepared = prepareNewGame({ ...DEFAULT_NEW_GAME_REQUEST, engagement, seeds: { map: base + 1, oob: base + 2, deployment: base + 3, rules: base + 4 } });
  if (!prepared.ok) throw new Error(`${engagement} seed ${index} did not prepare`);
  const created = createInitialGameState(prepared.value.scenario, prepared.value.configuration, 1);
  if (!created.ok) throw new Error(`${engagement} seed ${index} has no initial state`);
  const state = created.value;
  const definitions = new Map(state.scenario.pieceCatalog.definitions.map((definition) => [definition.id, definition]));
  const garrisons = new Set(prepared.value.generatedOob.sides.map(({ garrisonDefinitionId }) => garrisonDefinitionId));
  const onMap = (side: 'allied' | 'axis') => state.pieceState.pieces.filter((piece) => String(piece.ownerId) === `player:${side}` && piece.location.kind === 'ON_MAP');
  const army = (side: 'allied' | 'axis') => onMap(side).filter((piece) => definitions.get(piece.definitionId)?.family === 'GROUND'
    && piece.remainingSteps !== null && !garrisons.has(piece.definitionId));
  const dumps = (side: 'allied' | 'axis') => onMap(side).filter((piece) => definitions.get(piece.definitionId)?.family === 'RESOURCE' && !String(piece.id).includes('-stock-'));
  const isHq = (piece: GameState['pieceState']['pieces'][number]) => String(definitions.get(piece.definitionId)?.categoryDefinitionId).endsWith(':hq');
  const hexOf = (piece: GameState['pieceState']['pieces'][number]) => piece.location.kind === 'ON_MAP' ? piece.location.hexId : null;
  /** `side` in its first Movement Segment, every unit able to pay its fuel, to ask how far it could go. */
  const moving = (side: 'allied' | 'axis'): GameState => ({
    ...state,
    sequence: { ...state.sequence, phase: 'MOVEMENT', segment: 'MOVEMENT', actingPlayerId: `player:${side}` as never },
    fuel: { ...state.fuel, hqIds: army(side).map(({ id }) => id) },
  });
  const trucks = (side: 'allied' | 'axis') => onMap(side).filter((piece) => String(definitions.get(piece.definitionId)?.categoryDefinitionId).endsWith(':transport'));
  return { state, definitions, army, dumps, trucks, isHq, hexOf, moving };
};

describe('deployment plan', () => {
  it('keeps every supply dump out of reach of the enemy\'s first move', { timeout: 120_000 }, () => {
    for (const engagement of ENGAGEMENTS) {
      for (const index of SEEDS) {
        const game = opening(engagement, index);
        for (const [side, enemy] of [['allied', 'axis'], ['axis', 'allied']] as const) {
          const state = game.moving(enemy);
          const reach = new Set<string>();
          for (const piece of game.army(enemy)) {
            // A unit may switch to Move Mode before it moves (5.2), so both of its modes count.
            for (const mode of new Set([piece.mode, 'MOVE' as const])) {
              const asMode = { ...state, pieceState: { ...state.pieceState, pieces: state.pieceState.pieces.map((entry) => entry.id === piece.id ? { ...entry, mode } : entry) } };
              for (const { hexId } of ruleEngine.queryMovementRange(asMode, piece.ownerId, piece.id).value ?? []) reach.add(String(hexId));
            }
          }
          for (const dump of game.dumps(side)) {
            expect(reach.has(String(game.hexOf(dump))), `${engagement} seed ${index}: ${enemy} reaches the ${side} dump at ${game.hexOf(dump)}`).toBe(false);
          }
        }
      }
    }
  });

  it('spreads the HQs over the front and shares the units out between them', () => {
    for (const engagement of ENGAGEMENTS) {
      for (const index of SEEDS) {
        const game = opening(engagement, index);
        for (const side of ['allied', 'axis'] as const) {
          const army = game.army(side);
          const hqs = army.filter(game.isHq).map((piece) => game.hexOf(piece)!);
          if (hqs.length < 2) continue;
          for (const [order, hq] of hqs.entries()) {
            for (const other of hqs.slice(order + 1)) expect(hexDistanceBetween(hq, other), `${engagement} seed ${index} ${side} HQs ${hq} and ${other}`).toBeGreaterThanOrEqual(4);
          }
          // Each HQ has a share of the troops: the units nearest it number at least a third of an even share.
          const troops = army.filter((piece) => !game.isHq(piece));
          const shares = hqs.map(() => 0);
          for (const piece of troops) {
            const distances = hqs.map((hq) => hexDistanceBetween(hq, game.hexOf(piece)!));
            shares[distances.indexOf(Math.min(...distances))]! += 1;
          }
          for (const share of shares) expect(share, `${engagement} seed ${index} ${side} sector shares ${shares.join('/')}`).toBeGreaterThanOrEqual(troops.length / hqs.length / 3);
          // Independent units are not one group: no Hex holds more than two units (an engineer with its HQ is the HQ's).
          const perHex = new Map<string, number>();
          const hqHexes = new Set(hqs.map(String));
          const isEngineer = (piece: (typeof army)[number]) => String(game.definitions.get(piece.definitionId)?.categoryDefinitionId).endsWith(':engineer');
          for (const piece of army.filter((entry) => !(isEngineer(entry) && hqHexes.has(String(game.hexOf(entry)))))) {
            perHex.set(String(game.hexOf(piece)), (perHex.get(String(game.hexOf(piece))) ?? 0) + 1);
          }
          expect(Math.max(...perHex.values()), `${engagement} seed ${index} ${side} stack`).toBeLessThanOrEqual(2);
        }
      }
    }
  });

  it('starts each side\'s front units in Combat Mode, and every unit can be fuelled', { timeout: 120_000 }, () => {
    for (const engagement of ENGAGEMENTS) {
      for (const index of SEEDS) {
        const game = opening(engagement, index);
        for (const [side, enemy] of [['allied', 'axis'], ['axis', 'allied']] as const) {
          const army = game.army(side);
          const enemyHexes = game.army(enemy).map((piece) => game.hexOf(piece)!);
          const lineUnits = army.filter((piece) => game.definitions.get(piece.definitionId)?.faces.some(({ id }) => String(id) === 'combat')
            && !game.isHq(piece) && game.definitions.get(piece.definitionId)?.counter?.kind === 'COMBAT');
          // The line unit nearest the enemy is in Combat Mode, so the front has a ZOC on the first turn (4.5).
          const nearest = (piece: (typeof army)[number]) => Math.min(...enemyHexes.map((hexId) => hexDistanceBetween(hexId, game.hexOf(piece)!)));
          const front = [...lineUnits].sort((left, right) => nearest(left) - nearest(right))[0]!;
          expect(front.mode, `${engagement} seed ${index} ${side} front unit ${game.hexOf(front)}`).toBe('COMBAT');
          const state = { ...game.state, sequence: { ...game.state.sequence, phase: 'MOVEMENT', segment: 'MOVEMENT', actingPlayerId: `player:${side}` as never } } as GameState;
          for (const piece of army) {
            if (ruleEngine.queryFuelCoverage(state, piece.ownerId, piece.id).value === 'NOT_NEEDED') continue;
            expect((ruleEngine.queryFuelPreview(state, piece.ownerId, piece.id).value ?? []).length, `${engagement} seed ${index} ${side} ${String(piece.id)} cannot be fuelled`).toBeGreaterThan(0);
          }
        }
      }
    }
  });

  // User report 2026-10-09 (default scenario): dumps, trucks and an engineer brigade (Truck MA) stood on Hexes no road or
  // railroad touches. Every unit that starts in Move Mode with Truck MA stands on the road net; a front unit in Combat Mode
  // holds its ground wherever it is.
  it('stands every supply dump, truck and Move Mode Truck-MA unit on the road net', { timeout: 120_000 }, () => {
    for (const engagement of ENGAGEMENTS) {
      for (const index of SEEDS) {
        const game = opening(engagement, index);
        const network = new Set<string>();
        for (const { hexsideId, featureDefinitionIds } of game.state.scenario.mapDefinition.hexsides) {
          if (!featureDefinitionIds.some((id) => ['edge:primary-road', 'edge:road', 'edge:rail', 'edge:multi-track-rail'].includes(String(id)))) continue;
          const parsed = parseHexsideId(hexsideId);
          if (parsed.ok) for (const hexId of [parsed.value.firstHexId, parsed.value.secondHexId]) network.add(String(hexId));
        }
        for (const side of ['allied', 'axis'] as const) {
          const roadMovers = game.army(side).filter((piece) => {
            const definition = game.definitions.get(piece.definitionId);
            const move = definition?.faces.find(({ id }) => String(id) === 'move') ?? definition?.faces[0];
            return piece.mode !== 'COMBAT' && String(move?.mobilityClassDefinitionId) === 'mobility:truck';
          });
          for (const piece of [...game.dumps(side), ...game.trucks(side), ...roadMovers]) {
            expect(network.has(String(game.hexOf(piece))), `${engagement} seed ${index} ${side} ${String(piece.id)} at ${game.hexOf(piece)} is off the road net`).toBe(true);
          }
        }
      }
    }
  });

  // User, 2026-10-10: an engineer (a Pontoon unit: defence only, 3.2b; construction near HQs and dumps, 13.8d) does not hold
  // the line. It starts in Move Mode by its sector's HQ, on the road.
  it('keeps every engineer off the line, in Move Mode by an HQ', () => {
    for (const engagement of ENGAGEMENTS) {
      for (const index of SEEDS) {
        const game = opening(engagement, index);
        for (const side of ['allied', 'axis'] as const) {
          const hqs = game.army(side).filter(game.isHq).map((piece) => game.hexOf(piece)!);
          const engineers = game.army(side).filter((piece) => String(game.definitions.get(piece.definitionId)?.categoryDefinitionId).endsWith(':engineer'));
          expect(engineers.length, `${engagement} seed ${index} ${side} engineers`).toBeGreaterThan(0);
          for (const engineer of engineers) {
            const where = `${engagement} seed ${index} ${side} engineer at ${game.hexOf(engineer)}`;
            expect(engineer.mode, where).not.toBe('COMBAT');
            expect(Math.min(...hqs.map((hq) => hexDistanceBetween(hq, game.hexOf(engineer)!))), `${where}: distance to the nearest HQ`).toBeLessThanOrEqual(4);
          }
        }
      }
    }
  });
});
