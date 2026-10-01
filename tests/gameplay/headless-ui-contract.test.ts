import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  createAutoplaySource,
  createGameplayFixture,
  runHeadlessSession,
} from '../../src/index.js';

const sourceFiles = (directory: string): readonly string[] => readdirSync(
  directory, { withFileTypes: true },
).flatMap((entry) => {
  const path = join(directory, entry.name);
  return entry.isDirectory() ? sourceFiles(path) : entry.name.endsWith('.ts') ? [path] : [];
});

describe('G9-G10 headless and UI contract gate', () => {
  it('plays a full deterministic game through the public session contract and reloads it', async () => {
    const fixture = await createGameplayFixture();
    fixture.session.start();
    const source = createAutoplaySource([
      { seatId: fixture.seats[0], playerId: fixture.players[0] },
      { seatId: fixture.seats[1], playerId: fixture.players[1] },
    ]);
    const run = await runHeadlessSession(fixture.session, source, 600);
    expect(run).toMatchObject({ stopReason: 'FINISHED', rejected: 0 });
    const kinds = fixture.session.getHistory({ offset: 0, limit: 600, actionKind: null })
      .records.map(({ action }) => action.kind);
    expect(new Set(kinds)).toEqual(expect.objectContaining(new Set([
      'ADVANCE_SEQUENCE', 'DECLARE_COMBAT', 'RESPOND_DECISION',
    ])));
    const serialized = fixture.session.serializeSave();
    const loaded = await fixture.engine.loadSession(serialized);
    expect(loaded.getMetadata()).toMatchObject({ lifecycle: 'FINISHED', stateHash: run.finalStateHash });
    expect(loaded.exportReplay()).toEqual(fixture.session.exportReplay());
  });

  it('exposes the complete UI-facing surface without raw state or forbidden dependencies', async () => {
    const fixture = await createGameplayFixture();
    const methods = [
      'getMetadata', 'getRevision', 'getView', 'getActionFamilies', 'getActionCandidates',
      'createDraft', 'validateDraft', 'getPendingDecision', 'respondToPendingDecision',
      'dispatch', 'subscribe', 'getHistory', 'getDiagnostics', 'start', 'pause', 'resume',
      'beginHandoff', 'completeHandoff', 'createCheckpoint', 'listCheckpoints', 'removeCheckpoint', 'undoTo', 'getMovementRange',
      'save', 'serializeSave', 'exportReplay', 'close',
    ];
    expect(methods.filter((method) => typeof (fixture.session as unknown as Record<string, unknown>)[method] !== 'function')).toEqual([]);
    expect('state' in fixture.session.getView(fixture.seats[0])).toBe(false);
    expect('snapshot' in fixture.session.createCheckpoint('public descriptor')).toBe(false);

    const gameplayRoot = join(process.cwd(), 'src', 'gameplay');
    const forbidden = /from\s+['"][^'"]*(?:react|ui|generation|generator|(?:^|\/)ai(?:\/|['"])|node:fs|node:path|browser)/giu;
    expect(sourceFiles(gameplayRoot).flatMap((path) =>
      [...readFileSync(path, 'utf8').matchAll(forbidden)].map((match) => ({ path, text: match[0] })))).toEqual([]);
    const ruleLeaks = sourceFiles(join(process.cwd(), 'src', 'rules')).flatMap((path) =>
      [...readFileSync(path, 'utf8').matchAll(/from\s+['"][^'"]*gameplay/giu)]
        .map((match) => ({ path, text: match[0] })));
    expect(ruleLeaks).toEqual([]);

    const outputs = [
      ...Array.from({ length: 10 }, (_, index) => `docs/gameplay/${String(index).padStart(2, '0')}-${[
        'boundaries-ports-and-session-api', 'scenario-bootstrap-and-lifecycle',
        'dispatch-and-concurrency', 'action-discovery-and-drafts',
        'pending-decision-coordinator', 'projection-access-and-hotseat',
        'history-timeline-diagnostics', 'save-load-checkpoint-replay',
        'recovery-and-observability', 'headless-driver',
      ][index]}.md`),
      'docs/reports/G10-gameplay-ui-contract-gate.md',
    ];
    expect(outputs.filter((path) => !existsSync(join(process.cwd(), path)))).toEqual([]);
  });
});
