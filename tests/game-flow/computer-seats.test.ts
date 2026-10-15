import { describe, expect, it } from 'vitest';
import { DEFAULT_NEW_GAME_REQUEST, createGameplayEngine, createMemoryGameplayPorts, createNewGameOrchestrator, defaultBotSeed, validateNewGameRequest } from '../../src/index.js';

const small = { ...DEFAULT_NEW_GAME_REQUEST, map: { ...DEFAULT_NEW_GAME_REQUEST.map, width: 16, height: 12 }, oob: { ...DEFAULT_NEW_GAME_REQUEST.oob, divisionsPerSide: 2, armoredDivisionsPerSide: 1 }, turnLimit: 3 };

describe('New Game seats', () => {
  it('names a computer seat in the package bindings and the opened session', async () => {
    const request = { ...small, seats: { allied: { kind: 'HUMAN' as const }, axis: { kind: 'BOT' as const, policyId: 'heuristic', seed: 99 } } };
    const orchestrator = createNewGameOrchestrator(createGameplayEngine(createMemoryGameplayPorts()));
    const prepared = orchestrator.prepare(request);
    expect(prepared.ok).toBe(true);
    if (!prepared.ok) return;
    expect(prepared.value.bindings.map(({ label, controller }) => [label, controller?.kind ?? 'HUMAN'])).toEqual([['Allied commander', 'HUMAN'], ['Axis computer', 'BOT']]);
    const created = await orchestrator.start(prepared.value);
    expect(created.ok).toBe(true);
    if (created.ok) expect(created.value.session.getBindings()[1]!.controller).toEqual({ kind: 'BOT', policyId: 'heuristic', seed: 99 });
  });

  it('does not change the generated game: the same seeds give the same scenario whoever plays', () => {
    const orchestrator = createNewGameOrchestrator(createGameplayEngine(createMemoryGameplayPorts()));
    const people = orchestrator.prepare(small);
    const computers = orchestrator.prepare({ ...small, seats: { allied: { kind: 'BOT', policyId: 'heuristic', seed: 1 }, axis: { kind: 'BOT', policyId: 'heuristic', seed: 2 } } });
    if (!people.ok || !computers.ok) throw new Error('both must prepare');
    expect(computers.value.scenario).toEqual(people.value.scenario);
  });

  it('refuses a computer seat without a policy or with a seed outside uint32', () => {
    expect(validateNewGameRequest({ ...small, seats: { allied: { kind: 'BOT', policyId: '', seed: 1 }, axis: { kind: 'HUMAN' } } }).map(({ code }) => code)).toEqual(['INVALID_COMPUTER_SEAT']);
    expect(validateNewGameRequest({ ...small, seats: { allied: { kind: 'HUMAN' }, axis: { kind: 'BOT', policyId: 'heuristic', seed: 2 ** 32 } } }).map(({ code }) => code)).toEqual(['INVALID_COMPUTER_SEAT']);
  });

  it('derives each side\'s default computer seed from the rules seed, apart from the other side', () => {
    expect(defaultBotSeed(small, 'ALLIED')).not.toBe(defaultBotSeed(small, 'AXIS'));
    expect(defaultBotSeed(small, 'ALLIED')).toBe(defaultBotSeed(small, 'ALLIED'));
    expect(defaultBotSeed({ ...small, seeds: { ...small.seeds, rules: 5 } }, 'ALLIED')).not.toBe(defaultBotSeed(small, 'ALLIED'));
  });
});
