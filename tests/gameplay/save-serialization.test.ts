import { describe, expect, it } from 'vitest';
import {
  DEFAULT_NEW_GAME_REQUEST,
  canonicalJson,
  createGameplayEngine,
  createMemoryGameplayPorts,
  createNewGameOrchestrator,
  parseGameplaySave,
  serializeGameplaySave,
} from '../../src/index.js';

/**
 * PERF-6: the save written after every action splices cached snapshot JSON into the encoded envelope instead of
 * re-encoding every snapshot. The text must stay exactly the canonical JSON of the envelope, whatever the labels say.
 */
describe('save serialization fast path (PERF-6)', () => {
  it('writes exactly the canonical JSON of the envelope, with checkpoints and awkward labels', async () => {
    const created = await createNewGameOrchestrator(createGameplayEngine(createMemoryGameplayPorts())).create({
      ...DEFAULT_NEW_GAME_REQUEST, map: { ...DEFAULT_NEW_GAME_REQUEST.map, width: 20, height: 16 },
    });
    if (!created.ok) throw new Error(created.error.map(({ code }) => code).join(','));
    const { session } = created.value;
    for (const label of ['plain', 'quote " and \\ backslash', '\u0000ocs-snapshot:abc:0', '"\\u0000ocs-snapshot:x:1"', 'Before: Moved to 0817.']) {
      session.createCheckpoint(label);
    }
    for (const envelope of [session.save(), { ...session.save(), checkpoints: [] }]) {
      const fast = serializeGameplaySave(envelope);
      const plain = canonicalJson(envelope);
      expect(fast.ok && plain.ok).toBe(true);
      expect(fast.ok && fast.value).toBe(plain.ok && plain.value);
      expect(parseGameplaySave(fast.ok ? fast.value : '').ok).toBe(true);
    }
    // Repeated saves reuse cached snapshot text and stay identical.
    expect(session.serializeSave()).toBe(session.serializeSave());
  }, 60_000);
});
