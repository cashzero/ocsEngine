import type { PieceId, PlayerId } from '../core/index.js';
import {
  createGameplayEngine,
  createManualClock,
  createMemorySaveRepository,
  createMemoryScenarioRepository,
  createMemorySessionLogger,
  parseDispatchRequestId,
  parseSeatId,
  type GameSession,
  type GameplayPorts,
  type HeadlessCommand,
  type MemorySaveRepository,
  type MemorySessionLogger,
  type SeatId,
} from '../gameplay/index.js';
import { hexDistanceBetween, parseRuleActionId, ruleEngine, type GameAction, type GameState } from '../rules/index.js';
import { buildGeneratedRuleScenario, generatedPieceId, type GeneratedRuleScenario } from './generated-rule-fixtures.js';

const seat = (value: string): SeatId => {
  const parsed = parseSeatId(value);
  if (!parsed.ok) throw new Error('Invalid Gameplay fixture Seat ID.');
  return parsed.value;
};

export interface GameplayFixture {
  readonly engine: ReturnType<typeof createGameplayEngine>;
  readonly session: GameSession;
  readonly ports: GameplayPorts;
  readonly saves: MemorySaveRepository;
  readonly logger: MemorySessionLogger;
  readonly seats: readonly [SeatId, SeatId];
  readonly players: readonly [PlayerId, PlayerId];
  readonly scenario: GeneratedRuleScenario;
  /** Units of the duel: an Allied armored regiment facing an Axis stack, each side with a dump. */
  readonly units: {
    readonly attacker: PieceId;
    readonly defender: PieceId;
    readonly secondDefender: PieceId;
  };
}

/**
 * A two-turn duel on the generated default map with real OCS counters: the Allied armored
 * regiment starts adjacent to a two-unit Axis stack, and each side has a dump within draw range,
 * so the first Combat Phase produces a defender decision.
 */
export const createGameplayDuelScenario = (): GeneratedRuleScenario => {
  const built = buildGeneratedRuleScenario({
    [generatedPieceId('allied:f1-combat-1')]: ['5,5', 'COMBAT', 'combat'],
    [generatedPieceId('allied:independent-supply-1')]: ['4,5', null],
    [generatedPieceId('axis:f1-combat-1')]: ['6,5', 'COMBAT', 'combat'],
    [generatedPieceId('axis:f1-combat-2')]: ['6,5', 'COMBAT', 'combat'],
    [generatedPieceId('axis:independent-supply-1')]: ['7,5', null],
  });
  // The duel exercises session mechanics: no Supply Table income, so play opens in Movement.
  return { ...built, configuration: { ...built.configuration, supplyArrivals: null } };
};

/** The duel session; pass a variant of `createGameplayDuelScenario()` to change its placements. */
export const createGameplayFixture = async (scenario: GeneratedRuleScenario = createGameplayDuelScenario()): Promise<GameplayFixture> => {
  const players = [scenario.scenario.players[0]!.id, scenario.scenario.players[1]!.id] as const;
  const seats = [seat('seat:one'), seat('seat:two')] as const;
  const saves = createMemorySaveRepository();
  const logger = createMemorySessionLogger();
  const ports: GameplayPorts = {
    rules: ruleEngine,
    scenarios: createMemoryScenarioRepository([scenario.scenario]),
    saves,
    clock: createManualClock(1_000),
    logger,
  };
  const engine = createGameplayEngine(ports);
  const session = await engine.createSession({
    scenario: scenario.scenario, configuration: scenario.configuration, rulesSeed: 6,
    bindings: [
      { seatId: seats[0], playerId: players[0], label: 'First seat' },
      { seatId: seats[1], playerId: players[1], label: 'Second seat' },
    ],
    label: 'Generated duel Gameplay fixture',
  });
  return {
    engine, session, ports, saves, logger, seats, players, scenario,
    units: {
      attacker: generatedPieceId('allied:f1-combat-1'),
      defender: generatedPieceId('axis:f1-combat-1'),
      secondDefender: generatedPieceId('axis:f1-combat-2'),
    },
  };
};

export const gameplayRequestId = (value: string) => {
  const parsed = parseDispatchRequestId(`request:${value}`);
  if (!parsed.ok) throw new Error('Invalid Gameplay fixture request ID.');
  return parsed.value;
};

const autoplayActionId = (value: string) => {
  const parsed = parseRuleActionId(`gameplay:autoplay:${value}`);
  if (!parsed.ok) throw new Error('Invalid autoplay Action ID.');
  return parsed.value;
};

/**
 * Headless command source that plays aggressively through public session queries only: answer
 * pending decisions, place reinforcements, pay supply, barrage and attack when possible, move each
 * unit once toward the nearest enemy, otherwise end the step.
 */
export const createAutoplaySource = (
  bindings: readonly { readonly seatId: SeatId; readonly playerId: PlayerId }[],
) => {
  const movedThisStep = new Set<string>();
  let stepKey = '';
  return (session: GameSession, index: number): HeadlessCommand | null => {
    const decisionSeat = bindings.find(({ seatId }) => session.getPendingDecision(seatId) !== null);
    const requestId = gameplayRequestId(`autoplay-${index}`);
    if (decisionSeat) {
      const decision = session.getPendingDecision(decisionSeat.seatId)!;
      const choice = decision.options.find(({ id }) => id === 'advance:all' || id.startsWith('pay:'))?.id ?? decision.options[0]!.id;
      return {
        requestId, seatId: decisionSeat.seatId,
        action: {
          actionId: autoplayActionId(`decision:${index}`), actorId: decisionSeat.playerId,
          expectedRevision: session.getRevision(), kind: 'RESPOND_DECISION', decisionId: decision.id as never, choiceId: choice,
        },
      };
    }
    const view = session.getView(bindings[0]!.seatId).projection!;
    const actor = view.sequence.actingPlayerId;
    const binding = bindings.find(({ playerId }) => playerId === actor)!;
    const key = `${view.sequence.gameTurn}:${view.sequence.playerTurnIndex}:${view.sequence.phase}:${view.sequence.segment}`;
    if (key !== stepKey) { movedThisStep.clear(); stepKey = key; }
    const candidates = (kind: GameAction['kind'], pieceId: PieceId | null = null, budget = 1) =>
      session.getActionCandidates(binding.seatId, { kind, pieceId, budget }).actions;
    for (const kind of ['PLACE_REINFORCEMENT', 'RECOVER_INTERNALS', 'CHECK_SUPPLY', 'DECLARE_BARRAGE', 'DECLARE_COMBAT'] as const) {
      const [first] = candidates(kind);
      if (first) return { requestId, seatId: binding.seatId, action: first };
    }
    const own = session.getView(binding.seatId).projection!;
    const enemies = own.stacks.filter(({ pieces }) => pieces.some(({ ownerId }) => ownerId !== actor))
      .flatMap(({ location }) => location.kind === 'ON_MAP' ? [location.hexId] : []);
    for (const piece of own.stacks.flatMap(({ pieces }) => pieces).filter(({ ownerId, id }) => ownerId === actor && !movedThisStep.has(id))) {
      const legal = candidates('MOVE_PIECE', piece.id, 400);
      // 12.5: fuel a Truck or Track unit before it moves.
      const [fuel] = legal.length === 0 ? candidates('PAY_FUEL', piece.id) : [];
      if (fuel) return { requestId, seatId: binding.seatId, action: fuel };
      movedThisStep.add(piece.id);
      const moves = legal.flatMap((move) => move.kind === 'MOVE_PIECE'
        ? [{ move, distance: Math.min(...enemies.map((hexId) => hexDistanceBetween(move.path.at(-1)!, hexId))) }] : []);
      const best = moves.sort((left, right) => left.distance - right.distance)[0];
      if (best && best.distance >= 1) return { requestId, seatId: binding.seatId, action: best.move };
    }
    const [advance] = candidates('ADVANCE_SEQUENCE');
    return advance ? { requestId, seatId: binding.seatId, action: advance } : null;
  };
};

export type { GameState };
