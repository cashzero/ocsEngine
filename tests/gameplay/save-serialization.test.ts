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

describe('declared attacker supply in saves (9.5, 12.10a)', () => {
  it('reads DECLARE_COMBAT with attackerSupply, refuses one without it as incompatible, and rejects an unknown method', async () => {
    const created = await createNewGameOrchestrator(createGameplayEngine(createMemoryGameplayPorts())).create({
      ...DEFAULT_NEW_GAME_REQUEST, map: { ...DEFAULT_NEW_GAME_REQUEST.map, width: 20, height: 16 },
    });
    if (!created.ok) throw new Error(created.error.map(({ code }) => code).join(','));
    const envelope = created.value.session.save();
    const seatId = envelope.bindings[0]!.seatId;
    const combat = (index: number, extra: Record<string, unknown>) => ({
      actionId: `action:combat-${index}`, actorId: envelope.bindings[0]!.playerId, expectedRevision: index, kind: 'DECLARE_COMBAT', combatKind: 'REGULAR',
      attackerIds: ['piece:a', 'piece:b'], defenderIds: ['piece:c'], targetHexId: '6,5', leadAttackerId: 'piece:a', ...extra,
    });
    const withActions = (actions: readonly Record<string, unknown>[]) => JSON.stringify({
      ...envelope,
      acceptedActions: actions,
      acceptedActionMetadata: actions.map((_, index) => ({ requestId: `ui:request:${String(index + 1).padStart(6, '0')}`, seatId, acceptedAtMs: 0, durationMs: 0 })),
    });
    const declared = [{ pieceId: 'piece:a', method: 'DUMPS', dumpIds: ['piece:d'] }, { pieceId: 'piece:b', method: 'INTERNAL' }];
    const parsed = parseGameplaySave(withActions([combat(1, { attackerSupply: declared })]));
    expect(parsed.ok).toBe(true);
    if (parsed.ok) expect((parsed.value.acceptedActions[0] as { attackerSupply?: unknown }).attackerSupply).toEqual(declared);
    // Written before attackers declared their supply: refused with the reason, not replayed into a different game.
    const legacy = parseGameplaySave(withActions([combat(1, {})]));
    expect(legacy.ok).toBe(false);
    if (!legacy.ok) expect(legacy.error.map(({ code }) => code)).toContain('SAVE_INCOMPATIBLE');
    expect(parseGameplaySave(withActions([combat(1, { attackerSupply: [{ pieceId: 'piece:a', method: 'BORROW' }] })])).ok).toBe(false);
  }, 60_000);
});
