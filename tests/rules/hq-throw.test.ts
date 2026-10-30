import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { gunzipSync } from 'node:zlib';
import { describe, expect, it } from 'vitest';
import { parseGameStateJson, ruleEngine, type GameState, type HexId, type PieceId } from '../../src/index.js';

// Game Turn 1, the Axis Movement segment of a Western Europe Axis-attack game (P7 match 1500003).
const opening = (): GameState => {
  const stored = JSON.parse(gunzipSync(readFileSync(join(__dirname, '..', 'ai', 'fixtures', 'theater-allocation-1500003.state.json.gz'))).toString()) as { snapshot: string };
  const parsed = parseGameStateJson(stored.snapshot);
  if (!parsed.ok) throw new Error('Invalid fixture');
  return parsed.value;
};

const relocated = (state: GameState, pieceId: PieceId, hexId: HexId): GameState => ({
  ...state,
  pieceState: { ...state.pieceState, pieces: state.pieceState.pieces.map((piece) => (piece.id === pieceId ? { ...piece, location: { kind: 'ON_MAP', hexId } } : piece)) },
});

describe('HQ throw from another hex (12.3b)', () => {
  it('is the trace an HQ moved there would add, fed only where a Supply Source reaches it', () => {
    const state = opening();
    const actorId = state.sequence.actingPlayerId;
    const before = JSON.stringify(state);
    const hq = state.pieceState.pieces.find((piece) => piece.ownerId === actorId && String(piece.id).includes('independent-hq-4'))!;
    const from = hq.location.kind === 'ON_MAP' ? hq.location.hexId : null;
    const reach = ruleEngine.queryProjectedReach(state, actorId, hq.id, from!, 'MOVE').value!.map(({ hexId }) => hexId);
    let fed = 0; let unfed = 0;
    for (const hexId of [from!, ...reach.filter((_, index) => index % 15 === 0), '8,11' as HexId, '-2,11' as HexId]) {
      const result = ruleEngine.queryHqThrow(state, actorId, hq.id, hexId);
      expect(result.allowed).toBe(true);
      const trial = new Set(ruleEngine.queryTraceCoverage(relocated(state, hq.id, hexId), actorId, null).value!.hexIds.map(String));
      if (result.value!.fed) {
        fed += 1;
        expect(result.value!.hexIds.length).toBeGreaterThan(0);
        expect(result.value!.hexIds.filter((hex) => !trial.has(String(hex)))).toEqual([]);
      } else {
        unfed += 1;
        expect(result.value!.hexIds).toEqual([]);
      }
    }
    expect(fed).toBeGreaterThan(0);
    expect(unfed).toBeGreaterThan(0);
    // An independent HQ supplies every combat unit of its side (13.1d).
    expect(ruleEngine.queryHqThrow(state, actorId, hq.id, from!).value!.servableIds.length).toBeGreaterThan(10);
    expect(ruleEngine.queryHqThrow(state, actorId, state.pieceState.pieces.find((piece) => piece.ownerId === actorId && String(piece.id).includes('combat'))!.id, from!).allowed).toBe(false);
    expect(JSON.stringify(state)).toBe(before);
  });
});
