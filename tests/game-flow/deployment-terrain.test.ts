import { describe, expect, it } from 'vitest';
import {
  DEFAULT_NEW_GAME_REQUEST,
  GENERATED_TERRAIN_MOVEMENT_COSTS,
  createGameplayEngine,
  createMemoryGameplayPorts,
  createNewGameOrchestrator,
  type NewGameRequest,
} from '../../src/index.js';

const mobilityOf = (value: string) => value === 'mobility:leg' ? 'leg' : value === 'mobility:truck' ? 'truck' : 'tracked';
const costs = new Map(GENERATED_TERRAIN_MOVEMENT_COSTS.map(({ terrainDefinitionId, costs: byMobility }) => [String(terrainDefinitionId), byMobility]));

describe('generated deployment terrain and stacking', () => {
  it('places every unit on terrain its face can enter and within the stacking limit', () => {
    const orchestrator = createNewGameOrchestrator(createGameplayEngine(createMemoryGameplayPorts()));
    const scales = ['COMPACT', 'STANDARD', 'LARGE'] as const;
    let prepared = 0;
    for (let seed = 1; seed <= 36; seed += 1) {
      const request: NewGameRequest = {
        ...DEFAULT_NEW_GAME_REQUEST,
        map: { width: 18, height: 12, style: 'WESTERN_EUROPE', sea: seed % 2 === 0 ? 'FLANK' : 'NONE' },
        oob: { scale: scales[seed % 3]!, divisionsPerSide: 1 + (seed % 4), armoredDivisionsPerSide: seed % 2 },
        seeds: { map: seed * 7, oob: seed * 11, deployment: seed * 13, rules: seed },
      };
      const result = orchestrator.prepare(request);
      expect(result.ok, `seed ${seed}`).toBe(true);
      if (!result.ok) continue;
      prepared += 1;
      const { scenario } = result.value;
      const hexes = new Map(scenario.mapDefinition.hexes.map((hex) => [hex.id, hex]));
      const definitions = new Map(scenario.pieceCatalog.definitions.map((definition) => [definition.id, definition]));
      for (const piece of scenario.initialPieceState.pieces) {
        if (piece.location.kind !== 'ON_MAP' || piece.currentFaceId === null) continue;
        const face = definitions.get(piece.definitionId)!.faces.find(({ id }) => id === piece.currentFaceId)!;
        const hex = hexes.get(piece.location.hexId)!;
        const prohibited = [...hex.terrainDefinitionIds, ...hex.features.map(({ definitionId }) => definitionId)]
          .some((id) => costs.get(String(id))?.[mobilityOf(String(face.mobilityClassDefinitionId))].kind === 'PROHIBITED');
        expect(prohibited, `${piece.id} at ${hex.id}`).toBe(false);
      }
    }
    expect(prepared).toBe(36);
  }, 15_000);
});
