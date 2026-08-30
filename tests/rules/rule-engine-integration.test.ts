import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  RULE_FEATURE_MANIFEST,
  createPieceStateIndex,
  createRuleGameStateFixture,
  createRuleQueryCache,
  createRulesRng,
  hashGameState,
  parseGameStateJson,
  replayRuleActions,
  ruleActionBase,
  ruleEngine,
  ruleQueryCacheKey,
  serializeGameState,
  validateGameState,
  type GameAction,
  type GameState,
  type RuleEvent,
} from '../../src/index.js';

const sourceFiles = (directory: string): readonly string[] => readdirSync(
  directory,
  { withFileTypes: true },
).flatMap((entry) => {
  const path = join(directory, entry.name);
  return entry.isDirectory() ? sourceFiles(path) : entry.name.endsWith('.ts') ? [path] : [];
});

interface RunLog {
  state: GameState;
  readonly actions: GameAction[];
  readonly events: RuleEvent[];
}

const execute = (log: RunLog, action: GameAction): void => {
  const before = log.state;
  const result = ruleEngine.applyAction(before, action);
  expect(result.ok, result.ok ? undefined : result.violations
    .map(({ code, message, path }) => `${code}@${path.join('.')}:${message}`).join(',')).toBe(true);
  if (!result.ok) throw new Error('Integration action failed.');
  expect(result.state.revision).toBe(before.revision + 1);
  expect(validateGameState(result.state)).toEqual([]);
  log.actions.push(action);
  log.events.push(...result.events);
  log.state = result.state;
};

const advance = (log: RunLog): void => execute(log, {
  ...ruleActionBase(log.state, log.state.sequence.actingPlayerId, `advance:${log.actions.length}`),
  kind: 'ADVANCE_SEQUENCE',
});

const respond = (log: RunLog, predicate: (id: string) => boolean): void => {
  const pending = log.state.pendingDecision!;
  const option = pending.options.find(({ id }) => predicate(id));
  expect(option).toBeDefined();
  execute(log, {
    ...ruleActionBase(log.state, pending.ownerId, `decision:${log.actions.length}`),
    kind: 'RESPOND_DECISION', decisionId: pending.id, choiceId: option!.id,
  });
};

const commit = (log: RunLog): void => {
  const transaction = log.state.activeTransaction!;
  execute(log, {
    ...ruleActionBase(log.state, transaction.ownerId, `commit:${log.actions.length}`),
    kind: 'COMMIT_TRANSACTION', transactionId: transaction.id,
  });
};

const atSequence = (state: GameState, phase: string, segment?: string): boolean =>
  state.sequence.phase === phase && (segment === undefined || state.sequence.segment === segment);

describe('R10 Rule Engine integration gate', () => {
  it('runs a deterministic ground/logistics game, then reproduces it by action replay', async () => {
    const initial = createRuleGameStateFixture({ rng: createRulesRng(6) });
    const first = initial.scenario.players[0]!.id;
    const log: RunLog = { state: initial, actions: [], events: [] };

    while (!atSequence(log.state, 'MOVEMENT', 'MOVEMENT')) advance(log);
    execute(log, {
      ...ruleActionBase(log.state, first, 'move-main'), kind: 'MOVE_PIECE',
      pieceId: 'piece:multi-step' as never, path: ['2,1', '3,0'] as never,
    });
    advance(log);
    advance(log);
    expect(log.state.sequence.phase).toBe('SUPPLY');
    execute(log, {
      ...ruleActionBase(log.state, first, 'supply-main'), kind: 'CHECK_SUPPLY',
      pieceIds: ['piece:multi-step' as never], sourcePieceId: null,
    });

    while (!atSequence(log.state, 'COMBAT', 'BARRAGE')) advance(log);
    execute(log, {
      ...ruleActionBase(log.state, first, 'barrage-main'), kind: 'DECLARE_BARRAGE',
      firerIds: ['piece:artillery' as never], targetPieceIds: ['piece:ground' as never],
      targetHexId: '3,1' as never,
    });
    respond(log, (id) => id.startsWith('resource:'));
    commit(log);
    expect(log.state.activeTransaction).toBeNull();

    advance(log);
    execute(log, {
      ...ruleActionBase(log.state, first, 'combat-main'), kind: 'DECLARE_COMBAT',
      combatKind: 'REGULAR', attackerIds: ['piece:multi-step' as never],
      defenderIds: ['piece:ground' as never], targetHexId: '3,1' as never,
    });
    respond(log, (id) => id.startsWith('resource:'));
    commit(log);
    expect(log.state.pendingDecision?.kind).toBe('RETREAT_HEX');
    respond(log, (id) => id.startsWith('hex:'));
    expect(log.state.pendingDecision?.kind).toBe('ADVANCE_HEX');
    respond(log, (id) => id === 'piece:piece:multi-step');

    while (!atSequence(log.state, 'COMPLETE')) advance(log);

    const pieces = createPieceStateIndex(log.state.pieceState);
    expect(pieces.get('piece:multi-step' as never)?.location).toEqual({ kind: 'ON_MAP', hexId: '3,1' });
    expect(pieces.get('piece:supply-dump' as never)?.resourceQuantity).toBe(2);
    expect(log.state.activeTransaction).toBeNull();
    expect(log.state.pendingDecision).toBeNull();
    expect(log.state.rng.draws).toBe(4);
    expect(log.events.filter(({ kind }) => kind === 'RESOURCE_CONSUMED')).toHaveLength(2);
    expect(log.events.filter(({ kind }) => kind === 'DICE_ROLLED')).toHaveLength(2);
    expect(log.state.sequence.phase).toBe('COMPLETE');

    const replay = replayRuleActions(initial, log.actions);
    expect(replay.ok).toBe(true);
    if (!replay.ok) return;
    expect(serializeGameState(replay.state)).toEqual(serializeGameState(log.state));
    expect(replay.events).toEqual(log.events);
    expect(await hashGameState(replay.state)).toEqual(await hashGameState(log.state));
  });

  it('strictly snapshots pending transactions and rejects unknown snapshot fields', async () => {
    const source = createRuleGameStateFixture({ rng: createRulesRng(6) });
    const actor = source.scenario.players[0]!.id;
    const state = {
      ...source,
      sequence: { ...source.sequence, phase: 'COMBAT' as const, segment: 'COMBAT' as const },
    };
    const declared = ruleEngine.applyAction(state, {
      ...ruleActionBase(state, actor, 'snapshot-combat'), kind: 'DECLARE_COMBAT',
      combatKind: 'REGULAR', attackerIds: ['piece:multi-step' as never],
      defenderIds: ['piece:ground' as never], targetHexId: '3,1' as never,
    });
    expect(declared.ok).toBe(true);
    if (!declared.ok) return;
    const serialized = serializeGameState(declared.state);
    expect(serialized.ok).toBe(true);
    if (!serialized.ok) return;
    const parsed = parseGameStateJson(serialized.value);
    expect(parsed.ok).toBe(true);
    if (!parsed.ok) return;
    expect(serializeGameState(parsed.value)).toEqual(serialized);
    expect(await hashGameState(parsed.value)).toEqual(await hashGameState(declared.state));
    expect(parsed.value.pendingDecision).toEqual(declared.state.pendingDecision);

    const unknownTop = { ...(JSON.parse(serialized.value) as object), unexpected: true };
    const topResult = parseGameStateJson(JSON.stringify(unknownTop));
    expect(topResult.ok).toBe(false);
    if (!topResult.ok) expect(topResult.error.some(({ code }) => code === 'UNKNOWN_SCHEMA_FIELD')).toBe(true);
    const unknownNested = JSON.parse(serialized.value) as { configuration: Record<string, unknown> };
    unknownNested.configuration.unexpected = true;
    const nestedResult = parseGameStateJson(JSON.stringify(unknownNested));
    expect(nestedResult.ok).toBe(false);
    if (!nestedResult.ok) expect(nestedResult.error.some(({ path }) => path.join('.') === 'configuration.unexpected')).toBe(true);
  });

  it('enumerates bounded legal candidates and keeps optional query caching semantic-free', () => {
    const state = {
      ...createRuleGameStateFixture(),
      sequence: {
        ...createRuleGameStateFixture().sequence,
        phase: 'MOVEMENT' as const, segment: 'MOVEMENT' as const,
      },
    };
    const actor = state.sequence.actingPlayerId;
    const all = ruleEngine.getActionCandidates(state, {
      actorId: actor, kind: 'MOVE_PIECE', pieceId: null, budget: 100,
    });
    const bounded = ruleEngine.getActionCandidates(state, {
      actorId: actor, kind: 'MOVE_PIECE', pieceId: null, budget: 1,
    });
    expect(all.actions.length).toBeGreaterThan(1);
    expect(new Set(all.actions.map(({ actionId }) => actionId)).size).toBe(all.actions.length);
    expect(all.actions.every((action) => ruleEngine.validateAction(state, action).allowed)).toBe(true);
    expect(bounded.actions).toEqual(all.actions.slice(0, 1));
    expect(bounded.truncated).toBe(true);
    expect(ruleEngine.getActionFamilies(state, actor)).toHaveLength(11);

    const key = ruleQueryCacheKey(state, actor, 'candidate-proof');
    const enabled = createRuleQueryCache(true);
    const disabled = createRuleQueryCache(false);
    let computations = 0;
    const compute = () => ({ value: ++computations });
    expect(enabled.getOrCompute(key, compute)).toEqual(enabled.getOrCompute(key, compute));
    expect(enabled.size()).toBe(1);
    const firstDisabled = disabled.getOrCompute(key, compute);
    const secondDisabled = disabled.getOrCompute(key, compute);
    expect(firstDisabled).not.toEqual(secondDisabled);
    expect(disabled.size()).toBe(0);
  });

  it('keeps the Rule package headless and every implemented manifest row evidenced', () => {
    const rulesRoot = join(process.cwd(), 'src', 'rules');
    const prohibited = /from\s+['"][^'"]*(?:react|gameplay|generator|generation|(?:^|\/)ai(?:\/|['"])|ui)/giu;
    const leaks = sourceFiles(rulesRoot).flatMap((path) =>
      [...readFileSync(path, 'utf8').matchAll(prohibited)].map((match) => ({ path, text: match[0] })));
    expect(leaks).toEqual([]);

    const implemented = RULE_FEATURE_MANIFEST.filter(({ status }) => status === 'IMPLEMENTED');
    expect(implemented.length).toBeGreaterThanOrEqual(11);
    expect(implemented.flatMap(({ id, tests }) => tests.length === 0 ? [id] : [])).toEqual([]);
    const missing = implemented.flatMap(({ id, tests }) => tests
      .filter((test) => !existsSync(join(process.cwd(), 'tests', 'rules', test)))
      .map((test) => `${id}:${test}`));
    expect(missing).toEqual([]);

    const studyOutputs = [
      'docs/rule-engine/00-manifest-scope-and-tables.md',
      ...Array.from({ length: 9 }, (_, index) =>
        `docs/rule-engine/${String(index + 1).padStart(2, '0')}-${[
          'reducer-action-event-contract', 'sequence-and-pending-decisions',
          'query-explanation-visibility', 'mode-stacking-zoc',
          'movement-and-path-execution', 'transaction-and-reservation',
          'supply-and-logistics', 'combat-overrun-barrage-retreat',
          'lifecycle-facility-victory',
        ][index]}.md`),
      'docs/reports/R10-rule-engine-integration.md',
    ];
    expect(studyOutputs.filter((path) => !existsSync(join(process.cwd(), path)))).toEqual([]);
  });
});
