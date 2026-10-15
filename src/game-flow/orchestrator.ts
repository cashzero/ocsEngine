import { generateRandomMap } from '../generation/map/index.js';
import { generateRandomOob } from '../generation/oob/index.js';
import type { ValidationIssue } from '../core/index.js';
import { composeGeneratedScenario, GENERATED_PLAYERS } from './composer.js';
import { deployGeneratedForces } from './deployment.js';
import { withReinforcements } from './configuration.js';
import { attackerOf, landingEdgesOf, mapSeaPlacementOf, seaArrivalSidesOf } from './model.js';
import type {
  CreatedNewGame,
  GameFlowEngine,
  GameFlowFailure,
  NewGameOrchestrator,
  NewGamePreparationStage,
  NewGameRequest,
  PreparedNewGame,
} from './model.js';
import { validateGeneratedScenarioPackage, validateNewGameMapSize, validateNewGameRequest } from './validation.js';

const generatorFailures = (
  stage: 'MAP' | 'OOB',
  errors: readonly { readonly code: string; readonly message: string; readonly path: readonly (string | number)[]; readonly issues?: readonly ValidationIssue[] }[],
): readonly GameFlowFailure[] => errors.map((error) => ({
  stage, code: error.code, message: error.message, path: error.path,
  ...(error.issues === undefined ? {} : { issues: error.issues }),
}));

/** The package build as steps: it yields each stage before running it and returns the package or the failures. */
function* prepareNewGameSteps(request: NewGameRequest): Generator<NewGamePreparationStage, PreparedNewGame, void> {
  const optionFailures = validateNewGameRequest(request);
  if (optionFailures.length > 0) return { ok: false, error: optionFailures };
  yield 'MAP';
  const map = generateRandomMap({ ...request.map, sea: mapSeaPlacementOf(request), landingEdges: landingEdgesOf(request), seed: request.seeds.map });
  if (!map.ok) return { ok: false, error: generatorFailures('MAP', map.error) };
  yield 'OOB';
  // An attacker fields more divisions (ATTACKER_FORCE_RATIO); a meeting engagement keeps the sides equal.
  const attacker = attackerOf(request.engagement ?? 'MEETING');
  // The attacker also flies from an off-map airfield (docs/quality/evidence/engagements-plan-2026-10-07/README.md §6).
  const generatedOob = generateRandomOob({ ...request.oob, ...(attacker === null ? {} : { attacker, offMapAir: attacker }), seed: request.seeds.oob });
  if (!generatedOob.ok) return { ok: false, error: generatorFailures('OOB', generatedOob.error) };
  const oob = { ok: true as const, value: withReinforcements(request, generatedOob.value) };
  yield 'DEPLOYMENT';
  const deployment = deployGeneratedForces(map.value, oob.value, request.seeds.deployment, GENERATED_PLAYERS, request.engagement ?? 'MEETING', seaArrivalSidesOf(request));
  if (!deployment.ok) return deployment;
  yield 'SCENARIO';
  const composed = composeGeneratedScenario(request, map.value, oob.value, deployment.value);
  if (!composed.ok) return composed;
  const failures = validateGeneratedScenarioPackage(composed.value);
  return failures.length > 0 ? { ok: false, error: failures } : composed;
}

export const prepareNewGame = (request: NewGameRequest): PreparedNewGame => {
  const steps = prepareNewGameSteps(request);
  let step = steps.next();
  while (!step.done) step = steps.next();
  return step.value;
};

/** The player-facing preparation: New Game map limits first, then the full package. */
const preparePlayerNewGame: NewGameOrchestrator['prepare'] = (request) => {
  const sizeFailures = validateNewGameMapSize(request);
  return sizeFailures.length > 0 ? { ok: false, error: sizeFailures } : prepareNewGame(request);
};

const preparePlayerNewGameInStages: NewGameOrchestrator['prepareInStages'] = async (request, beforeStage) => {
  const sizeFailures = validateNewGameMapSize(request);
  if (sizeFailures.length > 0) return { ok: false, error: sizeFailures };
  const steps = prepareNewGameSteps(request);
  let step = steps.next();
  while (!step.done) {
    if (await beforeStage(step.value) === false) return null;
    step = steps.next();
  }
  return step.value;
};

export const createNewGameOrchestrator = (engine: GameFlowEngine): NewGameOrchestrator => {
  const start: NewGameOrchestrator['start'] = async (prepared) => {
    try {
      const session = await engine.createSession({
        scenario: prepared.scenario,
        configuration: prepared.configuration,
        rulesSeed: prepared.request.seeds.rules,
        bindings: prepared.bindings,
        label: `Generated ${prepared.summary.mapSize} ground duel`,
      });
      const started = session.start();
      if (!started.ok) return { ok: false as const, error: [{
        stage: 'GAMEPLAY_BOOTSTRAP' as const, code: started.code,
        message: 'Gameplay session could not enter ACTIVE lifecycle.', path: ['session', 'lifecycle'],
      }] };
      const value: CreatedNewGame = { ...prepared, session };
      return { ok: true as const, value };
    } catch (caught) {
      return { ok: false as const, error: [{
        stage: 'GAMEPLAY_BOOTSTRAP' as const,
        code: 'GAMEPLAY_BOOTSTRAP_FAILED',
        message: caught instanceof Error ? caught.message : 'Gameplay session bootstrap failed.',
        path: ['session'],
      }] };
    }
  };
  return {
    prepare: preparePlayerNewGame,
    prepareInStages: preparePlayerNewGameInStages,
    create: async (request: NewGameRequest) => {
      const prepared = preparePlayerNewGame(request);
      return prepared.ok ? start(prepared.value) : prepared;
    },
    start,
  };
};

/**
 * The operation offered when the UI opens (user decision 2026-10-01: larger map, more turns): a meeting engagement.
 * Since 2026-10-07 the armies start about ten hexes apart (they started 20-28 apart, too far for the user).
 */
export const DEFAULT_NEW_GAME_REQUEST: NewGameRequest = {
  templateId: 'GROUND_DUEL',
  map: { width: 32, height: 24, style: 'TEMPERATE_INLAND' },
  // User request 2026-10-03: more infantry divisions; the player sets the division count and how many are armored.
  oob: { scale: 'COMPACT', divisionsPerSide: 6, armoredDivisionsPerSide: 2 },
  seeds: { map: 0x0c500001, oob: 0x0c500002, deployment: 0x0c500003, rules: 0x0c500004 },
  turnLimit: 17, // defaultTurnLimit for this map and these divisions
  startMonth: 10,
};
