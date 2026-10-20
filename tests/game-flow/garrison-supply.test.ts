import { describe, expect, it } from 'vitest';
import { DEFAULT_NEW_GAME_REQUEST, createInitialGameState, prepareNewGame, pieceHasTrace, type Engagement } from '../../src/index.js';

describe('garrison emergency supply allocation', () => {
  it('funds only isolated VP stocks from each side’s existing SP budget across engagements and map themes', () => {
    let isolatedCount = 0;
    let tracedCount = 0;
    for (const engagement of ['MEETING', 'AXIS_ATTACKS', 'ALLIED_ATTACKS'] as Engagement[]) {
      for (const [style, sea] of [['WESTERN_EUROPE', 'NONE'], ['EASTERN_EUROPE', 'NONE'], ['WESTERN_EUROPE', 'FLANK']] as const) {
        const prepared = prepareNewGame({ ...DEFAULT_NEW_GAME_REQUEST, engagement, map: { ...DEFAULT_NEW_GAME_REQUEST.map, style, sea, width: 24, height: 16 }, oob: { ...DEFAULT_NEW_GAME_REQUEST.oob, divisionsPerSide: 3, armoredDivisionsPerSide: 1 }, seeds: { map: 14, oob: 8802, deployment: 8803, rules: 8804 } });
        if (!prepared.ok) throw new Error(JSON.stringify(prepared.error));
        const { scenario, configuration, generatedOob, deployment } = prepared.value;
        const created = createInitialGameState(scenario, configuration, 1);
        if (!created.ok) throw new Error(JSON.stringify(created.error));
        const state = created.value;
        expect(deployment.initialPieceState).toEqual(scenario.initialPieceState);
        expect(deployment.metrics.pieces).toBe(state.pieceState.pieces.length);
        const garrisonIds = new Set(generatedOob.sides.map(({ garrisonDefinitionId }) => garrisonDefinitionId));
        const stocks = state.pieceState.pieces.filter(({ id }) => String(id).includes('-stock-'));
        for (const piece of state.pieceState.pieces.filter(({ definitionId }) => garrisonIds.has(definitionId))) {
          if (piece.location.kind !== 'ON_MAP') throw new Error('garrison off map');
          const hex = piece.location.hexId;
          const stock = stocks.filter((s) => s.ownerId === piece.ownerId && s.location.kind === 'ON_MAP' && s.location.hexId === hex);
          if (pieceHasTrace(state, piece)) {
            tracedCount++;
            expect(stock).toEqual([]);
          } else {
            isolatedCount++;
            expect(deployment.objectiveHexIds).toContain(hex);
            expect(stock).toHaveLength(1);
            expect(stock[0]!.resourceQuantity).toBe(1);
          }
        }
        for (const side of generatedOob.sides) {
          const units = [...side.formations.flatMap(({ units }) => units), ...side.independentUnits];
          const originalTokens = units.filter(({ role }) => role === 'SUPPLY').reduce((sum, unit) => sum + (scenario.pieceCatalog.definitions.find(({ id }) => id === unit.definitionId)?.resource?.printedQuantity ?? 0), 0);
          const owner = scenario.players.find(({ sideDefinitionId }) => sideDefinitionId === `side:${side.side.toLowerCase()}`)!.id;
          const deployedTokens = state.pieceState.pieces.filter((piece) => piece.ownerId === owner
            && scenario.pieceCatalog.definitions.find(({ id }) => id === piece.definitionId)?.resource?.resourceDefinitionId === 'resource:supply')
            .reduce((sum, piece) => sum + (piece.resourceQuantity ?? 0), 0);
          expect(deployedTokens).toBe(originalTokens);
        }
      }
    }
    expect(isolatedCount).toBeGreaterThan(0);
    expect(tracedCount).toBeGreaterThan(0);
  });
});
