import { canonicalJson } from '../serialization/index.js';
import type { GameFlowSeedSweepReport, NewGameRequest, SeedOrthogonalityCase } from './model.js';
import { prepareNewGame } from './orchestrator.js';

const serialized = (value: unknown): string => {
  const result = canonicalJson(value);
  if (!result.ok) throw new Error('Seed sweep could not serialize generated output.');
  return result.value;
};

export const sweepGameFlowSeedOrthogonality = (base: NewGameRequest): GameFlowSeedSweepReport => {
  const baseline = prepareNewGame(base);
  if (!baseline.ok) return { passed: false, cases: [] };
  const variants = [
    { name: 'MAP_SEED' as const, request: { ...base, seeds: { ...base.seeds, map: (base.seeds.map + 1) >>> 0 } } },
    { name: 'OOB_SEED' as const, request: { ...base, seeds: { ...base.seeds, oob: (base.seeds.oob + 1) >>> 0 } } },
    { name: 'DEPLOYMENT_SEED' as const, request: { ...base, seeds: { ...base.seeds, deployment: (base.seeds.deployment + 1) >>> 0 } } },
  ];
  const cases: SeedOrthogonalityCase[] = variants.map(({ name, request }) => {
    const generated = prepareNewGame(request);
    if (!generated.ok) return { name, passed: false, changed: [], preserved: [] };
    const mapChanged = serialized(generated.value.generatedMap) !== serialized(baseline.value.generatedMap);
    const oobChanged = serialized(generated.value.generatedOob) !== serialized(baseline.value.generatedOob);
    const deploymentChanged = serialized(generated.value.deployment.initialPieceState)
      !== serialized(baseline.value.deployment.initialPieceState);
    const changed = [mapChanged ? 'map' : null, oobChanged ? 'oob' : null, deploymentChanged ? 'deployment' : null]
      .filter((value): value is string => value !== null);
    const preserved = [!mapChanged ? 'map' : null, !oobChanged ? 'oob' : null, !deploymentChanged ? 'deployment' : null]
      .filter((value): value is string => value !== null);
    const passed = name === 'MAP_SEED'
      ? mapChanged && !oobChanged
      : name === 'OOB_SEED'
        ? oobChanged && !mapChanged
        : deploymentChanged && !mapChanged && !oobChanged;
    return { name, passed, changed, preserved };
  });
  return { passed: cases.every(({ passed }) => passed), cases };
};
