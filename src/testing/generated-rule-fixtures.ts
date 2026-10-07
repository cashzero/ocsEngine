import { findNeighborDirection, parseHexCoordinateId, type HexId, type PieceId, type PlayerId } from '../core/index.js';
import { canonicalizeHexside, directedHexside, type HexsideFeatureCollection } from '../domain/map/index.js';
import type { OcsMode } from '../domain/piece/index.js';
import { prepareNewGame } from '../game-flow/index.js';
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
  oob: { scale: 'COMPACT', divisionsPerSide: 1, armoredDivisionsPerSide: 1 },
  seeds: { map: 92_001, oob: 92_002, deployment: 92_003, rules: 92_004 },
  turnLimit: 2,
  // September: the BTR Weather Table gives Dry ground automatically, so tests see normal terrain.
  startMonth: 9,
};

/**
 * Fixed package for rule tests and the conformance probe (the former UI default). Kept separate
 * from DEFAULT_NEW_GAME_REQUEST so changing what players are offered never moves rule baselines.
 */
export const RULE_FIXTURE_NEW_GAME_REQUEST: NewGameRequest = {
  templateId: 'GROUND_DUEL',
  map: { width: 18, height: 12, style: 'TEMPERATE_INLAND' },
  oob: { scale: 'COMPACT', divisionsPerSide: 2, armoredDivisionsPerSide: 1 },
  seeds: { map: 0x0c500001, oob: 0x0c5041b0, deployment: 0x0c500003, rules: 0x0c500004 },
  turnLimit: 2,
  startMonth: 10,
};

export const ALLIED = 'player:allied' as PlayerId;
export const AXIS = 'player:axis' as PlayerId;

/** The rule fixture scenario with air forces (each side: Fighters, Tactical Bombers, an Air Base). */
export const AIR_NEW_GAME_REQUEST: NewGameRequest = {
  ...RULE_FIXTURE_NEW_GAME_REQUEST,
  oob: { ...RULE_FIXTURE_NEW_GAME_REQUEST.oob, air: 'STANDARD' },
};

/** The air scenario with transports, paratroops, the Eq allotment and aircraft reinforcements as well. */
export const FULL_AIR_NEW_GAME_REQUEST: NewGameRequest = {
  ...RULE_FIXTURE_NEW_GAME_REQUEST,
  oob: { ...RULE_FIXTURE_NEW_GAME_REQUEST.oob, air: 'STANDARD', airTransport: 'STANDARD' },
};

/** A placement that keeps the Piece's scenario location (e.g. an off-map box) instead of putting it on a hex. */
export const KEEP_LOCATION = 'KEEP';

/** Tokens in every placed supply dump of a rule fixture, whatever the OOB generator starts a game with. */
export const RULE_FIXTURE_DUMP_TOKENS = 4;

const preparedCache = new Map<NewGameRequest, ReturnType<typeof prepareNewGame>>();
const prepared = (request: NewGameRequest = RULE_FIXTURE_NEW_GAME_REQUEST) => {
  let entry = preparedCache.get(request);
  if (!entry) { entry = prepareNewGame(request); preparedCache.set(request, entry); }
  if (!entry.ok) throw new Error('Generated rule scenario failed to prepare.');
  return entry.value;
};

/** Piece ID in the rule fixture scenario whose ID contains `fragment`. */
export const generatedPieceId = (fragment: string, request: NewGameRequest = RULE_FIXTURE_NEW_GAME_REQUEST): PieceId => {
  const piece = prepared(request).scenario.initialPieceState.pieces.find(({ id }) => id.includes(fragment));
  if (!piece) throw new Error(`No generated Piece matches ${fragment}.`);
  return piece.id;
};

export type Placement = Readonly<Record<string, readonly [HexId | string, OcsMode | null, string?]>>;

/**
 * Initial state with only the listed Pieces on the map (others eliminated), terrain set to Clear
 * except `terrain`, no hexside features, and the default Supply Sources unless replaced. Pax and Eq
 * (13.5) arrive only with `replacements`: every generated game has them, but a test of another rule
 * should not have to place them each Reinforcement Phase.
 */
export interface GeneratedRuleScenario {
  readonly scenario: GameState['scenario'];
  readonly configuration: GameState['configuration'];
}

/**
 * Map additions for a rule test: extra hexside features (e.g. railroads), printed Hex features (e.g. a
 * village), and initial Hex control.
 */
export interface MapAdditions {
  readonly hexsides?: readonly HexsideFeatureCollection[];
  readonly features?: Readonly<Record<string, readonly string[]>>;
  readonly control?: Readonly<Record<string, PlayerId | null>>;
}

/** Hexside features along a path of adjacent Hexes, e.g. a railroad line. */
export const featuresAlong = (hexIds: readonly string[], featureDefinitionId = 'edge:rail'): readonly HexsideFeatureCollection[] =>
  hexIds.slice(1).map((hexId, index) => {
    const from = parseHexCoordinateId(hexIds[index]!);
    const to = parseHexCoordinateId(hexId);
    const direction = from.ok && to.ok ? findNeighborDirection(from.value, to.value) : null;
    if (!from.ok || !direction) throw new Error(`Hexes ${hexIds[index]} and ${hexId} are not adjacent.`);
    const canonical = canonicalizeHexside(directedHexside(from.value, direction));
    if (!canonical.ok) throw new Error('Hexside is invalid.');
    return { hexsideId: canonical.value.id, featureDefinitionIds: [featureDefinitionId as never] };
  });

export const buildGeneratedRuleScenario = (
  placement: Placement,
  terrain: Readonly<Record<string, string>> = {},
  options: { readonly sources?: GameState['scenario']['sources']; readonly keepHexsides?: boolean; readonly request?: NewGameRequest; readonly replacements?: boolean } & MapAdditions = {},
): GeneratedRuleScenario => {
  const source = prepared(options.request);
  const orders = new Map<string, number>();
  const pieces = source.scenario.initialPieceState.pieces.map((piece) => {
    const spec = placement[piece.id];
    if (!spec) return { ...piece, location: { kind: 'ELIMINATED' as const }, stackOrder: 0 };
    const [hexId, mode, face] = spec;
    // KEEP leaves an off-map Piece (an off-map airfield and its aircraft) where the scenario put it.
    if (hexId === KEEP_LOCATION) return { ...piece, ...(piece.resourceQuantity !== null ? { resourceQuantity: RULE_FIXTURE_DUMP_TOKENS } : {}) };
    return {
      ...piece,
      location: { kind: 'ON_MAP' as const, hexId: hexId as HexId },
      stackOrder: (() => { const next = orders.get(hexId) ?? 0; orders.set(hexId, next + 1); return next; })(),
      mode: mode === null ? piece.mode : mode,
      currentFaceId: (face ?? piece.currentFaceId) as typeof piece.currentFaceId,
      // Rule tests count Tokens in a 4T dump; the generator's starting dumps grew with OOB 0.4.0 supply scaling.
      ...(piece.resourceQuantity !== null ? { resourceQuantity: RULE_FIXTURE_DUMP_TOKENS } : {}),
    };
  });
  const mapDefinition = {
    ...source.scenario.mapDefinition,
    hexes: source.scenario.mapDefinition.hexes.map((hex) => ({
      ...hex,
      terrainDefinitionIds: [(terrain[hex.id] ?? 'terrain:clear') as never],
      features: [
        ...hex.features.filter(({ kind }) => kind !== 'PRINTED_FEATURE'),
        ...(options.features?.[hex.id] ?? []).map((definitionId) => ({ kind: 'PRINTED_FEATURE' as const, definitionId: definitionId as never })),
      ],
    })),
    hexsides: [...(options.keepHexsides ? source.scenario.mapDefinition.hexsides : []), ...(options.hexsides ?? [])],
  };
  const control = new Map(source.scenario.initialMapState.hexControl.map((entry) => [String(entry.hexId), entry.controllerId]));
  for (const [hexId, controllerId] of Object.entries(options.control ?? {})) control.set(hexId, controllerId);
  const initialMapState = {
    ...source.scenario.initialMapState,
    hexControl: [...control.entries()].sort(([left], [right]) => left.localeCompare(right))
      .map(([hexId, controllerId]) => ({ hexId: hexId as HexId, controllerId })),
  };
  return {
    scenario: {
      ...source.scenario,
      mapDefinition,
      initialMapState,
      initialPieceState: { ...source.scenario.initialPieceState, pieces },
      pieceCatalog: options.replacements ? source.scenario.pieceCatalog : {
        ...source.scenario.pieceCatalog,
        definitions: source.scenario.pieceCatalog.definitions.filter(({ family }) => family !== 'REPLACEMENT'),
      },
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
  options: { readonly sources?: GameState['scenario']['sources']; readonly keepHexsides?: boolean; readonly fueled?: boolean; readonly request?: NewGameRequest; readonly replacements?: boolean } & MapAdditions = {},
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

/** The same position on another Game Turn; arrivals (13.6) start on Game Turn 2. */
export const onGameTurn = (state: GameState, gameTurn: number): GameState => ({ ...state, sequence: { ...state.sequence, gameTurn } });

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
