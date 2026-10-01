import type { HexId, PieceId, PlayerId } from '../core/index.js';
import type { OcsMode } from '../domain/piece/index.js';
import { DEFAULT_NEW_GAME_REQUEST, prepareNewGame } from '../game-flow/index.js';
import type { NewGameRequest } from '../game-flow/index.js';
import {
  createInitialGameState,
  parseRuleActionId,
  ruleEngine,
  type GameAction,
  type GameState,
  type RulePhase,
  type RuleSegment,
  type TransitionResult,
} from '../rules/index.js';

/**
 * Small-state helpers over the production generated scenario for rule tests: real OCS counters,
 * real TEC tables, and a map whose terrain can be flattened so each test isolates one rule.
 */

/** A generated 8x8 meeting engagement with units in contact within two turns. */
export const CONTACT_NEW_GAME_REQUEST: NewGameRequest = {
  templateId: 'GROUND_DUEL',
  map: { width: 8, height: 8, style: 'TEMPERATE_INLAND' },
  oob: { scale: 'COMPACT', formationsPerSide: 1 },
  seeds: { map: 92_001, oob: 92_002, deployment: 92_003, rules: 92_004 },
  turnLimit: 2,
  // September: the BTR Weather Table gives Dry ground automatically, so tests see normal terrain.
  startMonth: 9,
};

export const ALLIED = 'player:allied' as PlayerId;
export const AXIS = 'player:axis' as PlayerId;

const prepared = (() => {
  let cache: ReturnType<typeof prepareNewGame> | null = null;
  return () => {
    cache ??= prepareNewGame(DEFAULT_NEW_GAME_REQUEST);
    if (!cache.ok) throw new Error('Default generated scenario failed to prepare.');
    return cache.value;
  };
})();

/** Piece ID in the default generated scenario whose ID contains `fragment`. */
export const generatedPieceId = (fragment: string): PieceId => {
  const piece = prepared().scenario.initialPieceState.pieces.find(({ id }) => id.includes(fragment));
  if (!piece) throw new Error(`No generated Piece matches ${fragment}.`);
  return piece.id;
};

export type Placement = Readonly<Record<string, readonly [HexId | string, OcsMode | null, string?]>>;

/**
 * Initial state with only the listed Pieces on the map (others eliminated), terrain set to Clear
 * except `terrain`, no hexside features, and the default Supply Sources unless replaced.
 */
export interface GeneratedRuleScenario {
  readonly scenario: GameState['scenario'];
  readonly configuration: GameState['configuration'];
}

export const buildGeneratedRuleScenario = (
  placement: Placement,
  terrain: Readonly<Record<string, string>> = {},
  options: { readonly sources?: GameState['scenario']['sources']; readonly keepHexsides?: boolean } = {},
): GeneratedRuleScenario => {
  const source = prepared();
  const orders = new Map<string, number>();
  const pieces = source.scenario.initialPieceState.pieces.map((piece) => {
    const spec = placement[piece.id];
    if (!spec) return { ...piece, location: { kind: 'ELIMINATED' as const }, stackOrder: 0 };
    const [hexId, mode, face] = spec;
    return {
      ...piece,
      location: { kind: 'ON_MAP' as const, hexId: hexId as HexId },
      stackOrder: (() => { const next = orders.get(hexId) ?? 0; orders.set(hexId, next + 1); return next; })(),
      mode: mode === null ? piece.mode : mode,
      currentFaceId: (face ?? piece.currentFaceId) as typeof piece.currentFaceId,
    };
  });
  const mapDefinition = {
    ...source.scenario.mapDefinition,
    hexes: source.scenario.mapDefinition.hexes.map((hex) => ({
      ...hex,
      terrainDefinitionIds: [(terrain[hex.id] ?? 'terrain:clear') as never],
      features: hex.features.filter(({ kind }) => kind !== 'PRINTED_FEATURE'),
    })),
    hexsides: options.keepHexsides ? source.scenario.mapDefinition.hexsides : [],
  };
  return {
    scenario: {
      ...source.scenario,
      mapDefinition,
      initialPieceState: { ...source.scenario.initialPieceState, pieces },
      sources: options.sources ?? source.scenario.sources,
    },
    configuration: source.configuration,
  };
};

/**
 * `fueled` (default true) pre-pays fuel for every unit until Clean Up, so tests of other rules are
 * not gated by 12.5; fuel tests pass false.
 */
export const buildGeneratedRuleState = (
  placement: Placement,
  terrain: Readonly<Record<string, string>> = {},
  options: { readonly sources?: GameState['scenario']['sources']; readonly keepHexsides?: boolean; readonly fueled?: boolean } = {},
): GameState => {
  const built = buildGeneratedRuleScenario(placement, terrain, options);
  const created = createInitialGameState(built.scenario, built.configuration, 7);
  if (!created.ok) throw new Error(`Generated rule state is invalid: ${created.error.map(({ code }) => code).join(', ')}`);
  if (options.fueled === false) return created.value;
  return {
    ...created.value,
    fuel: {
      hqIds: [],
      formations: created.value.scenario.players.map(({ id }) => ({
        playerId: id, formationId: 'formation:test-fuel' as never,
        coveredPieceIds: created.value.pieceState.pieces.filter(({ ownerId }) => ownerId === id).map((piece) => piece.id),
      })),
    },
  };
};

export const atStep = (
  state: GameState,
  phase: RulePhase,
  segment: RuleSegment,
  actor: PlayerId,
  phasing: PlayerId = actor,
): GameState => ({ ...state, sequence: { ...state.sequence, phase, segment, actingPlayerId: actor, phasingPlayerId: phasing } });

type DistributiveOmit<T, K extends PropertyKey> = T extends unknown ? Omit<T, K> : never;
export type GameActionBody = DistributiveOmit<GameAction, 'actionId' | 'actorId' | 'expectedRevision'>;

let actionSequence = 0;
export const applyRuleAction = (
  state: GameState,
  actor: PlayerId,
  body: GameActionBody,
): TransitionResult => {
  const actionId = parseRuleActionId(`action:test:${actionSequence += 1}`);
  if (!actionId.ok) throw new Error('Invalid test action ID.');
  return ruleEngine.applyAction(state, { actionId: actionId.value, actorId: actor, expectedRevision: state.revision, ...body } as GameAction);
};

export const combatDefenders = (state: GameState, actor: PlayerId, hexId: string): readonly PieceId[] =>
  state.pieceState.pieces.filter((piece) => piece.ownerId !== actor && piece.location.kind === 'ON_MAP'
    && piece.location.hexId === hexId && piece.mode !== null && piece.remainingSteps !== null
    && state.scenario.pieceCatalog.definitions.find(({ id }) => id === piece.definitionId)?.counter?.kind !== 'TRANSPORT')
    .map(({ id }) => id);

export const declareTestCombat = (
  state: GameState,
  actor: PlayerId,
  combatKind: 'REGULAR' | 'OVERRUN',
  attackerIds: readonly PieceId[],
  targetHexId: string,
  leadAttackerId: PieceId = attackerIds[0]!,
): TransitionResult => applyRuleAction(state, actor, {
  kind: 'DECLARE_COMBAT', combatKind, attackerIds, defenderIds: combatDefenders(state, actor, targetHexId),
  targetHexId: targetHexId as HexId, leadAttackerId,
});

/** Answer pending decisions with `pick` (default: the first option) until none remains. */
export const settleDecisions = (
  input: GameState,
  pick: (decision: NonNullable<GameState['pendingDecision']>) => string = (decision) => decision.options[0]!.id,
): { readonly state: GameState; readonly choices: readonly string[] } => {
  let state = input;
  const choices: string[] = [];
  for (let guard = 0; state.pendingDecision && guard < 40; guard += 1) {
    const decision = state.pendingDecision;
    const choiceId = pick(decision);
    choices.push(`${decision.kind}:${choiceId}`);
    const result = applyRuleAction(state, decision.ownerId, { kind: 'RESPOND_DECISION', decisionId: decision.id, choiceId });
    if (!result.ok) throw new Error(`Decision ${decision.kind} rejected: ${result.violations.map(({ code }) => code).join(', ')}`);
    state = result.state;
  }
  return { state, choices };
};

/**
 * One step of "minimal play": answer a pending decision with `pick`, carry out mandatory actions
 * (placing arrivals, recovering internal stocks), otherwise end the step.
 */
export const autoStep = (
  state: GameState,
  pick: (decision: NonNullable<GameState['pendingDecision']>) => string = (decision) => decision.options[0]!.id,
): TransitionResult => {
  if (state.pendingDecision) {
    return applyRuleAction(state, state.pendingDecision.ownerId, { kind: 'RESPOND_DECISION', decisionId: state.pendingDecision.id, choiceId: pick(state.pendingDecision) });
  }
  const actor = state.sequence.actingPlayerId;
  for (const kind of ['PLACE_REINFORCEMENT', 'RECOVER_INTERNALS'] as const) {
    const [candidate] = ruleEngine.getActionCandidates(state, { actorId: actor, kind, pieceId: null, budget: 1 }).actions;
    if (candidate) return ruleEngine.applyAction(state, candidate);
  }
  return applyRuleAction(state, actor, { kind: 'ADVANCE_SEQUENCE' });
};
