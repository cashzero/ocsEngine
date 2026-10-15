import { describe, expect, it } from 'vitest';
import {
  createGameplayEngine,
  createGameplayFixture,
  createMemoryGameplayPorts,
  parseGameplaySave,
  type SeatBinding,
} from '../../src/index.js';

describe('seat controllers in the Gameplay session', () => {
  it('stores a computer seat in the save and restores it on load', async () => {
    const fixture = await createGameplayFixture();
    const [first, second] = fixture.seats;
    fixture.session.setSeatController(second!, { kind: 'BOT', policyId: 'heuristic', seed: 7 }, 'Second computer');
    const saved = fixture.session.serializeSave();
    const parsed = parseGameplaySave(saved);
    expect(parsed.ok).toBe(true);
    const bindings = parsed.ok ? parsed.value.bindings : [];
    expect(bindings.find(({ seatId }) => seatId === second)).toMatchObject({ label: 'Second computer', controller: { kind: 'BOT', policyId: 'heuristic', seed: 7 } });
    expect(bindings.find(({ seatId }) => seatId === first)?.controller).toBeUndefined();

    const loaded = await fixture.engine.loadSession(saved);
    expect(loaded.getBindings().find(({ seatId }) => seatId === second)?.controller).toEqual({ kind: 'BOT', policyId: 'heuristic', seed: 7 });
  });

  it('writes a person as no controller, so a game without computers saves as it always did', async () => {
    const fixture = await createGameplayFixture();
    expect(fixture.session.serializeSave()).not.toContain('"controller"');
    fixture.session.setSeatController(fixture.seats[0]!, { kind: 'BOT', policyId: 'heuristic', seed: 1 });
    expect(fixture.session.serializeSave()).toContain('"controller"');
    fixture.session.setSeatController(fixture.seats[0]!, { kind: 'HUMAN' });
    expect(fixture.session.serializeSave()).not.toContain('"controller"');
  });

  it('tells subscribers when a seat changes hands', async () => {
    const fixture = await createGameplayFixture();
    const seen: string[] = [];
    fixture.session.subscribe((notification) => { if (notification.kind === 'SEAT_CONTROLLER_CHANGED') seen.push(`${notification.seatId}:${notification.controller.kind}`); });
    fixture.session.setSeatController(fixture.seats[1]!, { kind: 'BOT', policyId: 'heuristic', seed: 3 });
    expect(seen).toEqual([`${fixture.seats[1]}:BOT`]);
  });

  it('rejects a save with a malformed controller', async () => {
    const fixture = await createGameplayFixture();
    const save = JSON.parse(fixture.session.serializeSave()) as { bindings: (SeatBinding & { controller?: unknown })[] };
    save.bindings[0]!.controller = { kind: 'BOT', policyId: 'heuristic', seed: -5 };
    const result = parseGameplaySave(JSON.stringify(save));
    expect(result.ok).toBe(false);
    expect(createGameplayEngine(createMemoryGameplayPorts())).toBeDefined();
  });
});
