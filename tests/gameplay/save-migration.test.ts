import { describe, expect, it } from 'vitest';
import {
  GAMEPLAY_SAVE_VERSION,
  canonicalJson,
  createGameplayFixture,
  gameplayRequestId,
  parseRuleActionId,
  type GameAction,
} from '../../src/index.js';

const sha256 = async (text: string): Promise<string> => {
  const digest = await globalThis.crypto.subtle.digest('SHA-256', new TextEncoder().encode(text));
  return `sha256:${[...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, '0')).join('')}`;
};

/** A snapshot as the 0.2.0 build wrote it: no air bookkeeping and no `air` on transactions. */
const legacySnapshot = (text: string): string => {
  const { air: _air, ...rest } = JSON.parse(text) as Record<string, unknown>;
  const transaction = rest.activeTransaction as Record<string, unknown> | null;
  if (transaction) delete transaction.air;
  const serialized = canonicalJson(rest);
  if (!serialized.ok) throw new Error('Legacy snapshot could not be serialized.');
  return serialized.value;
};

describe('gameplay save 0.2.0 migration (air power)', () => {
  it('loads a 0.2.0 save, upgrades its snapshots, and replays to the same game', async () => {
    const fixture = await createGameplayFixture();
    fixture.session.start();
    for (const suffix of ['one', 'two']) {
      const actionId = parseRuleActionId(`gameplay:migration:${suffix}`);
      if (!actionId.ok) throw new Error('Invalid Action ID.');
      const action: GameAction = { actionId: actionId.value, actorId: fixture.players[0], expectedRevision: fixture.session.getRevision(), kind: 'ADVANCE_SEQUENCE' };
      expect((await fixture.session.dispatch({ requestId: gameplayRequestId(`migration-${suffix}`), seatId: fixture.seats[0], action })).status).toBe('ACCEPTED');
    }
    fixture.session.createCheckpoint('before legacy');
    const current = JSON.parse(fixture.session.serializeSave()) as Record<string, unknown>;
    expect(current.gameplayVersion).toBe(GAMEPLAY_SAVE_VERSION);
    const initialSnapshot = legacySnapshot(current.initialSnapshot as string);
    const currentSnapshot = legacySnapshot(current.currentSnapshot as string);
    const checkpoints = await Promise.all((current.checkpoints as Record<string, unknown>[]).map(async (checkpoint) => {
      const snapshot = legacySnapshot(checkpoint.snapshot as string);
      return { ...checkpoint, snapshot, stateHash: await sha256(snapshot) };
    }));
    const legacy = {
      ...current, gameplayVersion: '0.2.0',
      initialSnapshot, initialStateHash: await sha256(initialSnapshot),
      currentSnapshot, finalStateHash: await sha256(currentSnapshot),
      checkpoints,
    };
    const loaded = await fixture.engine.loadSession(JSON.stringify(legacy));
    expect(loaded.getRevision()).toBe(fixture.session.getRevision());
    expect(loaded.getMetadata().stateHash).toBe(fixture.session.getMetadata().stateHash);
    expect(JSON.parse(loaded.serializeSave()).gameplayVersion).toBe(GAMEPLAY_SAVE_VERSION);

    // A tampered legacy snapshot no longer matches its recorded hash.
    await expect(fixture.engine.loadSession(JSON.stringify({ ...legacy, currentSnapshot: currentSnapshot.replace('"revision":2', '"revision":3') })))
      .rejects.toMatchObject({ detail: { code: 'SAVE_REPLAY_MISMATCH' } });
  });
});
