import { describe, expect, it, vi } from 'vitest';
import {
  DEFAULT_NEW_GAME_REQUEST,
  COMPUTER_PLAYERS,
  createGameplayEngine,
  createMemoryGameplayPorts,
  createNewGameOrchestrator,
  createUiController,
  parseGameplaySave,
  type NewGameRequest,
  type UiController,
} from '../../src/index.js';

vi.setConfig({ testTimeout: 180_000 });

/** A short game: two Game Turns keep a whole computer-against-computer match within a few seconds. */
const SHORT: NewGameRequest = { ...DEFAULT_NEW_GAME_REQUEST, turnLimit: 2, oob: { ...DEFAULT_NEW_GAME_REQUEST.oob, divisionsPerSide: 3, armoredDivisionsPerSide: 1 } };
const bot = (seed: number, policyId = 'heuristic') => ({ kind: 'BOT' as const, policyId, seed });
const human = { kind: 'HUMAN' as const };

const open = async (seats: NewGameRequest['seats'], request: NewGameRequest = SHORT) => {
  const engine = createGameplayEngine(createMemoryGameplayPorts());
  const created = await createNewGameOrchestrator(engine).create({ ...request, ...(seats === undefined ? {} : { seats }) });
  if (!created.ok) throw new Error(`New Game failed: ${JSON.stringify(created.error)}`);
  const { session, scenario } = created.value;
  const controller = createUiController({ engine, session, scenario, bindings: created.value.bindings, turnLimit: request.turnLimit, computers: COMPUTER_PLAYERS });
  return { engine, controller, created: created.value };
};

const until = async (controller: UiController, done: (snapshot: ReturnType<UiController['getSnapshot']>) => boolean, label: string, ms = 150_000) => {
  const deadline = Date.now() + ms;
  while (Date.now() < deadline) {
    if (done(controller.getSnapshot())) return;
    await new Promise((resolve) => setTimeout(resolve, 20));
  }
  const snapshot = controller.getSnapshot();
  throw new Error(`Timed out waiting for ${label}: ${snapshot.notice} ${JSON.stringify(snapshot.automation?.stuck ?? null)}`);
};

describe('New Game with computer players', () => {
  it('binds the seat the request names to a computer and keeps the other a person', async () => {
    const { controller, created } = await open({ allied: bot(11), axis: human });
    const [allied, axis] = created.bindings;
    expect(allied!.controller).toEqual({ kind: 'BOT', policyId: 'heuristic', seed: 11 });
    expect(allied!.label).toBe('Allied computer');
    expect(axis!.controller).toBeUndefined();
    controller.dispose();
  });

  it('keeps today’s two-person bindings when the request names no seats', async () => {
    const { controller, created } = await open(undefined);
    expect(created.bindings.every((binding) => binding.controller === undefined)).toBe(true);
    expect(controller.getSnapshot().automation).toBeNull();
    controller.dispose();
  });
});

describe('a person against the computer', () => {
  it('shows the person’s seat, never a hand-over, and plays the computer’s turn by itself', async () => {
    const { controller } = await open({ allied: bot(21), axis: human });
    controller.setPlaybackSpeed('INSTANT');
    // Allied (the computer) opens: the screen is the Axis person's from the start.
    const first = controller.getSnapshot();
    expect(first.view.seatId).toBe(first.bindings[1]!.seatId);
    expect(first.automation?.spectating).toBe(false);
    await until(controller, (snapshot) => snapshot.automation!.computerToAct === null && snapshot.automation!.played > 0, 'the computer to finish its turn');
    const snapshot = controller.getSnapshot();
    expect(snapshot.handoff).toBeNull();
    expect(snapshot.view.privacyLocked).toBe(false);
    expect(snapshot.automation!.last?.text).toBeTruthy();
    // The person acts now: the Axis seat is the one the game waits for.
    expect(snapshot.requiredSeatId).toBe(snapshot.view.seatId);
    // What the computer did is in the person's log, in the person's words.
    expect(snapshot.feed.some(({ actorId }) => actorId === snapshot.bindings[0]!.playerId)).toBe(true);
    controller.dispose();
  });

  it('answers a decision at once when the person attacks the computer', async () => {
    // The computer defends: its answers are given by the computer, with no hand-over to it.
    const { controller } = await open({ allied: human, axis: bot(31) });
    controller.setPlaybackSpeed('INSTANT');
    const snapshot = controller.getSnapshot();
    expect(snapshot.view.seatId).toBe(snapshot.bindings[0]!.seatId);
    expect(snapshot.handoff).toBeNull();
    controller.dispose();
  });
});

describe('computers against each other', () => {
  it('plays to Game End with nobody operating, can be viewed from either side, and replays to the same state', async () => {
    const { controller, engine } = await open({ allied: bot(41), axis: bot(42) });
    controller.setPlaybackSpeed('INSTANT');
    const first = controller.getSnapshot();
    expect(first.automation?.spectating).toBe(true);
    controller.viewAs(first.bindings[1]!.seatId);
    expect(controller.getSnapshot().view.seatId).toBe(first.bindings[1]!.seatId);
    expect(controller.getSnapshot().view.privacyLocked).toBe(false);
    await until(controller, (snapshot) => snapshot.view.metadata.lifecycle === 'FINISHED', 'Game End');
    const finished = controller.getSnapshot();
    expect(finished.automation!.stuck).toBeNull();
    expect(finished.automation!.played).toBeGreaterThan(100);
    // The save replays to the same final state, and carries the computers' seats.
    const saved = controller.serializeSave();
    const reloaded = await engine.loadSession(saved);
    expect(reloaded.getMetadata().stateHash).toBe(finished.view.metadata.stateHash);
    expect(reloaded.getBindings().every((binding) => binding.controller?.kind === 'BOT')).toBe(true);
    controller.dispose();
  });

  it('pauses, plays one action per Step, and goes on at Play', async () => {
    const { controller } = await open({ allied: bot(51), axis: bot(52) });
    controller.pauseComputer();
    const revision = controller.getSnapshot().view.stateRevision;
    await new Promise((resolve) => setTimeout(resolve, 400));
    expect(controller.getSnapshot().view.stateRevision).toBe(revision);
    expect(controller.getSnapshot().automation!.playing).toBe(false);
    controller.stepComputer();
    await until(controller, (snapshot) => snapshot.automation!.played === 1, 'one stepped action', 10_000);
    await new Promise((resolve) => setTimeout(resolve, 400));
    expect(controller.getSnapshot().automation!.played).toBe(1);
    controller.setPlaybackSpeed('INSTANT');
    controller.playComputer();
    await until(controller, (snapshot) => snapshot.automation!.played > 10, 'play to resume', 20_000);
    controller.dispose();
  });
});

describe('saving and loading with computers', () => {
  it('has the computers go on from the loaded position', async () => {
    const first = await open({ allied: bot(61), axis: bot(62) });
    first.controller.setPlaybackSpeed('INSTANT');
    await until(first.controller, (snapshot) => snapshot.automation!.played >= 30, 'some play');
    first.controller.pauseComputer();
    await new Promise((resolve) => setTimeout(resolve, 100));
    const saved = first.controller.serializeSave();
    const savedRevision = Number(first.controller.getSnapshot().view.stateRevision);
    expect(parseGameplaySave(saved).ok).toBe(true);
    first.controller.dispose();

    // A page that starts afresh (its own request numbers begin again) loads the save; the computers resume.
    const second = await open(undefined);
    await second.controller.loadSave(saved);
    expect(second.controller.getSnapshot().automation?.spectating).toBe(true);
    second.controller.setPlaybackSpeed('INSTANT');
    await until(second.controller, (snapshot) => Number(snapshot.view.stateRevision) > savedRevision + 10, 'the computers to resume after load');
    expect(second.controller.getSnapshot().automation!.stuck).toBeNull();
    second.controller.dispose();
  });

  it('loads a save made before computer players existed as two persons', async () => {
    const first = await open(undefined);
    const saved = first.controller.serializeSave();
    expect(saved).not.toContain('"controller"');
    const second = await open({ allied: bot(1), axis: bot(2) });
    second.controller.pauseComputer();
    await second.controller.loadSave(saved);
    expect(second.controller.getSnapshot().automation).toBeNull();
    first.controller.dispose();
    second.controller.dispose();
  });
});

describe('a computer that cannot go on', () => {
  it('stops with a visible reason, never passes the phase for it, and lets the person take the seat over', async () => {
    const { controller } = await open({ allied: bot(71, 'test-stall:6'), axis: human });
    controller.setPlaybackSpeed('INSTANT');
    await until(controller, (snapshot) => snapshot.automation!.stuck !== null, 'the computer to stall', 30_000);
    const stuck = controller.getSnapshot();
    expect(stuck.automation!.stuck!.code).toBe('BOT_STALLED');
    expect(stuck.automation!.stuck!.seatLabel).toBe('Allied computer');
    const stalledAt = stuck.view.stateRevision;
    await new Promise((resolve) => setTimeout(resolve, 300));
    expect(controller.getSnapshot().view.stateRevision, 'a stuck computer plays nothing more').toBe(stalledAt);

    controller.takeOverSeat(stuck.bindings[0]!.seatId);
    const taken = controller.getSnapshot();
    expect(taken.automation).toBeNull();
    expect(taken.bindings[0]!.label).toBe('Allied commander');
    // Both seats are people now: the Allied seat acts, and the game goes on by hand.
    expect(taken.requiredSeatId).toBe(taken.bindings[0]!.seatId);
    expect(taken.view.seatId).toBe(taken.bindings[0]!.seatId);
    await controller.endStep();
    expect(controller.getSnapshot().notice).not.toMatch(/Not allowed/u);
    controller.dispose();
  });

  it('reports a policy this version does not know instead of guessing', async () => {
    const { controller } = await open({ allied: bot(81, 'no-such-policy'), axis: human });
    const snapshot = controller.getSnapshot();
    expect(snapshot.automation!.stuck?.code).toBe('UNKNOWN_POLICY');
    controller.dispose();
  });
});
