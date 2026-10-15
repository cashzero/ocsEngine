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

  it('documents the map and OOB generators and the studies behind them', () => {
    const outputs = [
      'docs/roadmap/05-random-map-wbs.md',
      'docs/roadmap/06-random-oob-wbs.md',
      'docs/generator/random-map.md',
      'docs/generator/map-styles.md',
      'docs/oob/random-oob.md',
      'docs/oob/counter-corpus.md',
      'docs/study/10-bcs-random-map.md',
      'docs/study/11-bcs-random-oob.md',
      'docs/study/12-btr-oob-catalog.md',
    ];
    expect(outputs.filter((path) => !existsSync(join(process.cwd(), path)))).toEqual([]);
  });
});
