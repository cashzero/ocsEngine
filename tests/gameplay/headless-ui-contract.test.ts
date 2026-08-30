import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  createGameplayFixture,
  gameplayRequestId,
  parseRuleActionId,
  runHeadlessSession,
  type GameAction,
  type GameSession,
  type HeadlessCommand,
  type SeatId,
} from '../../src/index.js';

const sourceFiles = (directory: string): readonly string[] => readdirSync(
  directory, { withFileTypes: true },
).flatMap((entry) => {
  const path = join(directory, entry.name);
  return entry.isDirectory() ? sourceFiles(path) : entry.name.endsWith('.ts') ? [path] : [];
});

const ruleId = (value: string) => {
  const parsed = parseRuleActionId(`gameplay:headless:${value}`);
  if (!parsed.ok) throw new Error('Invalid headless Action ID.');
  return parsed.value;
};

describe('G9-G10 headless and UI contract gate', () => {
  it('plays a full deterministic game through the public session contract and reloads it', async () => {
    const fixture = await createGameplayFixture();
    fixture.session.start();
    let moved = false;
    let checkedSupply = false;
    let barraged = false;
    let fought = false;
    const seatFor = (playerId: string): SeatId => playerId === fixture.players[0]
      ? fixture.seats[0] : fixture.seats[1];
    const source = (session: GameSession, index: number): HeadlessCommand | null => {
      const view = session.getView(fixture.seats[0]);
      const sequence = view.projection!.sequence;
      const actor = sequence.actingPlayerId;
      const seatId = seatFor(actor);
      const base = {
        requestId: gameplayRequestId(`headless-${index}`), seatId,
      };
      const pendingSeat = session.getPendingDecision(fixture.seats[0]) !== null
        ? fixture.seats[0]
        : session.getPendingDecision(fixture.seats[1]) !== null ? fixture.seats[1] : null;
      if (pendingSeat !== null) {
        const pending = session.getPendingDecision(pendingSeat)!;
        const choices = session.getActionCandidates(pendingSeat, {
          kind: 'RESPOND_DECISION', pieceId: null, budget: 100,
        }).actions.filter((action): action is Extract<GameAction, { kind: 'RESPOND_DECISION' }> =>
          action.kind === 'RESPOND_DECISION');
        const selected = pending.kind === 'RESOURCE_SOURCE'
          ? choices.find(({ choiceId }) => choiceId.startsWith('resource:'))
          : pending.kind === 'ADVANCE_HEX'
            ? choices.find(({ choiceId }) => choiceId === 'piece:piece:multi-step')
            : choices[0];
        return selected ? { ...base, seatId: pendingSeat, action: selected } : null;
      }
      const commits = session.getActionCandidates(seatId, {
        kind: 'COMMIT_TRANSACTION', pieceId: null, budget: 1,
      }).actions;
      if (commits[0]) return { ...base, action: commits[0] };
      if (!moved && actor === fixture.players[0]
        && sequence.phase === 'MOVEMENT' && sequence.segment === 'MOVEMENT') {
        moved = true;
        return { ...base, action: {
          actionId: ruleId(`move:${index}`), actorId: actor,
          expectedRevision: session.getRevision(), kind: 'MOVE_PIECE',
          pieceId: 'piece:multi-step' as never, path: ['2,1', '3,0'] as never,
        } };
      }
      if (!checkedSupply && actor === fixture.players[0] && sequence.phase === 'SUPPLY') {
        checkedSupply = true;
        return { ...base, action: {
          actionId: ruleId(`supply:${index}`), actorId: actor,
          expectedRevision: session.getRevision(), kind: 'CHECK_SUPPLY',
          pieceIds: ['piece:multi-step' as never], sourcePieceId: null,
        } };
      }
      if (!barraged && actor === fixture.players[0]
        && sequence.phase === 'COMBAT' && sequence.segment === 'BARRAGE') {
        barraged = true;
        return { ...base, action: {
          actionId: ruleId(`barrage:${index}`), actorId: actor,
          expectedRevision: session.getRevision(), kind: 'DECLARE_BARRAGE',
          firerIds: ['piece:artillery' as never], targetPieceIds: ['piece:ground' as never],
          targetHexId: '3,1' as never,
        } };
      }
      if (!fought && actor === fixture.players[0]
        && sequence.phase === 'COMBAT' && sequence.segment === 'COMBAT') {
        fought = true;
        return { ...base, action: {
          actionId: ruleId(`combat:${index}`), actorId: actor,
          expectedRevision: session.getRevision(), kind: 'DECLARE_COMBAT', combatKind: 'REGULAR',
          attackerIds: ['piece:multi-step' as never], defenderIds: ['piece:ground' as never],
          targetHexId: '3,1' as never,
        } };
      }
      return { ...base, action: {
        actionId: ruleId(`advance:${index}`), actorId: actor,
        expectedRevision: session.getRevision(), kind: 'ADVANCE_SEQUENCE',
      } };
    };

    const run = await runHeadlessSession(fixture.session, source, 100);
    expect(run).toMatchObject({ stopReason: 'FINISHED', rejected: 0 });
    expect(run.accepted).toBeGreaterThan(40);
    const kinds = fixture.session.getHistory({ offset: 0, limit: 200, actionKind: null })
      .records.map(({ action }) => action.kind);
    expect(new Set(kinds)).toEqual(expect.objectContaining(new Set([
      'ADVANCE_SEQUENCE', 'MOVE_PIECE', 'CHECK_SUPPLY', 'DECLARE_BARRAGE',
      'DECLARE_COMBAT', 'RESPOND_DECISION', 'COMMIT_TRANSACTION',
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
      'beginHandoff', 'completeHandoff', 'createCheckpoint', 'listCheckpoints', 'undoTo',
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
