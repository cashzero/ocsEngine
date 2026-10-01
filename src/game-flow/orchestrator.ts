import { generateRandomMap } from '../generation/map/index.js';
import { generateRandomOob } from '../generation/oob/index.js';
import type { ValidationIssue } from '../core/index.js';
import { composeGeneratedScenario, GENERATED_PLAYERS } from './composer.js';
import { deployGeneratedForces } from './deployment.js';
import type {
  CreatedNewGame,
  GameFlowEngine,
  GameFlowFailure,
  GeneratedScenarioPackage,
  NewGameOrchestrator,
  NewGameRequest,
} from './model.js';
import { validateGeneratedScenarioPackage, validateNewGameMapSize, validateNewGameRequest } from './validation.js';

const generatorFailures = (
  stage: 'MAP' | 'OOB',
  errors: readonly { readonly code: string; readonly message: string; readonly path: readonly (string | number)[]; readonly issues?: readonly ValidationIssue[] }[],
): readonly GameFlowFailure[] => errors.map((error) => ({
  stage, code: error.code, message: error.message, path: error.path,
  ...(error.issues === undefined ? {} : { issues: error.issues }),
}));

export const prepareNewGame = (
  request: NewGameRequest,
): { readonly ok: true; readonly value: GeneratedScenarioPackage }
  | { readonly ok: false; readonly error: readonly GameFlowFailure[] } => {
  const optionFailures = validateNewGameRequest(request);
  if (optionFailures.length > 0) return { ok: false, error: optionFailures };
  const map = generateRandomMap({ ...request.map, seed: request.seeds.map });
  if (!map.ok) return { ok: false, error: generatorFailures('MAP', map.error) };
  const oob = generateRandomOob({ ...request.oob, seed: request.seeds.oob });
  if (!oob.ok) return { ok: false, error: generatorFailures('OOB', oob.error) };
  const deployment = deployGeneratedForces(map.value, oob.value, request.seeds.deployment, GENERATED_PLAYERS);
  if (!deployment.ok) return deployment;
  const composed = composeGeneratedScenario(request, map.value, oob.value, deployment.value);
  if (!composed.ok) return composed;
  const failures = validateGeneratedScenarioPackage(composed.value);
  return failures.length > 0 ? { ok: false, error: failures } : composed;
};

/** The player-facing preparation: New Game map limits first, then the full package. */
const preparePlayerNewGame: NewGameOrchestrator['prepare'] = (request) => {
  const sizeFailures = validateNewGameMapSize(request);
  return sizeFailures.length > 0 ? { ok: false, error: sizeFailures } : prepareNewGame(request);
};

export const createNewGameOrchestrator = (engine: GameFlowEngine): NewGameOrchestrator => ({
  prepare: preparePlayerNewGame,
  create: async (request: NewGameRequest) => {
    const prepared = preparePlayerNewGame(request);
    if (!prepared.ok) return prepared;
    try {
      const session = await engine.createSession({
        scenario: prepared.value.scenario,
        configuration: prepared.value.configuration,
        rulesSeed: request.seeds.rules,
        bindings: prepared.value.bindings,
        label: `Generated ${prepared.value.summary.mapSize} ground duel`,
      });
      const started = session.start();
      if (!started.ok) return { ok: false as const, error: [{
        stage: 'GAMEPLAY_BOOTSTRAP' as const, code: started.code,
        message: 'Gameplay session could not enter ACTIVE lifecycle.', path: ['session', 'lifecycle'],
      }] };
      const value: CreatedNewGame = { ...prepared.value, session };
      return { ok: true as const, value };
    } catch (caught) {
      return { ok: false as const, error: [{
        stage: 'GAMEPLAY_BOOTSTRAP' as const,
        code: 'GAMEPLAY_BOOTSTRAP_FAILED',
        message: caught instanceof Error ? caught.message : 'Gameplay session bootstrap failed.',
        path: ['session'],
      }] };
    }
  },
});

/**
 * The operation offered when the UI opens (user decision 2026-10-01: larger map, more turns).
 * Sides start 25-30 hexes apart, so contact comes around turn 2-3 with turns left to fight.
 */
export const DEFAULT_NEW_GAME_REQUEST: NewGameRequest = {
  templateId: 'GROUND_DUEL',
  map: { width: 32, height: 24, style: 'TEMPERATE_INLAND' },
  oob: { scale: 'COMPACT', formationsPerSide: 2 },
  seeds: { map: 0x0c500001, oob: 0x0c500002, deployment: 0x0c500003, rules: 0x0c500004 },
  turnLimit: 8,
  startMonth: 10,
};
