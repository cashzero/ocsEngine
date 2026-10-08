import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

describe('U0-U10 operable UI contract', () => {
  it('keeps the 13px floor outside the user-authorized counter artwork exception', () => {
    const css = readFileSync(join(process.cwd(), 'web/styles.css'), 'utf8');
    const interfaceCss = css.replace(/\.counter \.counter-state text, \.unit-counter \.counter-state text\s*\{[^}]*\}/gu, '');
    const pixelSizes = [...interfaceCss.matchAll(/font-size:\s*([\d.]+)px/giu)].map((match) => Number(match[1]));
    expect(pixelSizes.length).toBeGreaterThan(10);
    expect(Math.min(...pixelSizes)).toBeGreaterThanOrEqual(13);
    expect(css).toContain('font-size: 16px');
    expect(css).toContain(':focus-visible');
    expect(css).toContain('prefers-reduced-motion');
  });
});
