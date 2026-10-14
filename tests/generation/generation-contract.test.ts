import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const sourceFiles = (directory: string): readonly string[] => readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
  const path = join(directory, entry.name);
  return entry.isDirectory() ? sourceFiles(path) : entry.name.endsWith('.ts') ? [path] : [];
});

describe('M6 generator boundary and study contract', () => {
  it('keeps generation independent of rules, gameplay, UI, and AI', () => {
    const violations = sourceFiles(join(process.cwd(), 'src', 'generation')).flatMap((path) => {
      const source = readFileSync(path, 'utf8');
      return [...source.matchAll(/from\s+['"][^'"]*(?:rules|gameplay|ui|(?:^|\/)ai(?:\/|['"]))/giu)]
        .map((match) => ({ path, import: match[0] }));
    });
    expect(violations).toEqual([]);
  });

  it('ships every M6 study output and final gate report', () => {
    const outputs = [
      'docs/roadmap/05-random-map-wbs.md',
      'docs/generator-study/01-bcs-random-map.md',
      ...Array.from({ length: 10 }, (_, index) => `docs/generator/${String(index).padStart(2, '0')}-${[
        'scope-options-and-output-contract', 'seed-rng-and-determinism', 'noise-and-terrain-classification',
        'coast-and-hydrology', 'settlements-and-strategic-regions', 'connected-road-network',
        'topology-and-quality-validation', 'serialization-and-package-boundary',
        'ui-preview-and-download', 'seed-sweep-protocol',
      ][index]}.md`),
      'docs/generator/M6-random-map-gate.md',
    ];
    expect(outputs.filter((path) => !existsSync(join(process.cwd(), path)))).toEqual([]);
  });

  it('ships every M7 study output and final gate report', () => {
    const outputs = [
      'docs/roadmap/06-random-oob-wbs.md',
      'docs/generator-study/02-bcs-random-oob.md',
      'docs/generator-study/03-btr-oob-catalog.md',
      'docs/oob/M7-btr-extraction-report.md',
      'docs/oob/M7-normalization-decisions.md',
      'docs/oob/M7-generator-archetypes.md',
      'docs/generator/M7-random-oob-spec.md',
      'docs/oob/M7-formation-package-policy.md',
      'docs/oob/M7-support-logistics-policy.md',
      'docs/oob/M7-validation-contract.md',
      'docs/oob/M7-serialization-and-boundary.md',
      'docs/oob/M7-ui-preview-and-download.md',
      'docs/oob/M7-oob-seed-sweep.md',
      'docs/oob/M7-random-oob-gate.md',
    ];
    expect(outputs.filter((path) => !existsSync(join(process.cwd(), path)))).toEqual([]);
  });
});
