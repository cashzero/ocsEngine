import { parseContentHash, type ContentHash } from '../core/index.js';
import { hashGameState, parseGameState, serializeGameState, upgradeLegacyGameStateInput } from '../rules/index.js';
import { GAMEPLAY_SAVE_VERSION } from './persistence.js';
import { GameplayFailure } from './session.js';
import type { GameplaySaveEnvelope } from './model.js';

const failure = (message: string, path: readonly (string | number)[] = []): GameplayFailure =>
  new GameplayFailure({ code: 'SAVE_REPLAY_MISMATCH', message, path });

const sha256 = async (text: string): Promise<ContentHash> => {
  const digest = await globalThis.crypto.subtle.digest('SHA-256', new TextEncoder().encode(text));
  const parsed = parseContentHash(`sha256:${[...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, '0')).join('')}`);
  if (!parsed.ok) throw failure('SHA-256 output is invalid.');
  return parsed.value;
};

/**
 * Upgrade one 0.2.0 or 0.3.0 snapshot. Its text must still hash to the hash recorded beside it, so a
 * tampered save is rejected exactly as before; the upgraded snapshot gets its new canonical hash.
 */
const upgradeSnapshot = async (text: string, recorded: ContentHash, path: readonly (string | number)[]) => {
  if (await sha256(text) !== recorded) throw failure('Save snapshot does not match its recorded hash.', path);
  let input: unknown;
  try { input = JSON.parse(text) as unknown; }
  catch { throw failure('Save snapshot is not valid JSON.', path); }
  const parsed = parseGameState(upgradeLegacyGameStateInput(input));
  if (!parsed.ok) throw failure(`Save snapshot cannot be upgraded: ${parsed.error[0]?.message ?? 'invalid state'}.`, path);
  const serialized = serializeGameState(parsed.value);
  const hash = await hashGameState(parsed.value);
  if (!serialized.ok || !hash.ok) throw failure('Upgraded snapshot cannot be serialized.', path);
  return { snapshot: serialized.value, hash: hash.value };
};

/**
 * 0.2.0 saves were made before air power. Air adds only empty bookkeeping to a game without aircraft,
 * so their snapshots upgrade losslessly and their action logs replay unchanged; the normal load then
 * verifies that replay against the upgraded snapshots.
 */
export const migrateLegacySave = async (save: GameplaySaveEnvelope): Promise<GameplaySaveEnvelope> => {
  const initial = await upgradeSnapshot(save.initialSnapshot, save.initialStateHash, ['initialSnapshot']);
  const current = await upgradeSnapshot(save.currentSnapshot, save.finalStateHash, ['currentSnapshot']);
  const checkpoints = [];
  for (const [index, checkpoint] of save.checkpoints.entries()) {
    const upgraded = await upgradeSnapshot(checkpoint.snapshot, checkpoint.stateHash, ['checkpoints', index, 'snapshot']);
    checkpoints.push({ ...checkpoint, snapshot: upgraded.snapshot, stateHash: upgraded.hash });
  }
  return {
    ...save,
    gameplayVersion: GAMEPLAY_SAVE_VERSION,
    initialSnapshot: initial.snapshot, initialStateHash: initial.hash,
    currentSnapshot: current.snapshot, finalStateHash: current.hash,
    checkpoints,
  };
};
