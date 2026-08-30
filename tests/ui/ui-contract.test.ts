import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

describe('U0-U10 operable UI contract', () => {
  it('ships the browser entry, styles, server, studies, and integration report', () => {
    const outputs = [
      'web/index.html', 'web/styles.css', 'scripts/serve-ui.mjs',
      ...Array.from({ length: 10 }, (_, index) => `docs/ui/${String(index).padStart(2, '0')}-${[
        'scope-boundaries-and-acceptance', 'shell-typography-and-accessibility',
        'session-bootstrap-and-lifecycle', 'hex-map-pan-and-zoom',
        'counter-and-stack-inspection', 'legal-action-and-explanation-flow',
        'pending-decision-flow', 'history-save-load-and-checkpoints',
        'hotseat-privacy-and-recovery', 'browser-playthrough',
      ][index]}.md`),
      'docs/reports/U10-operable-ui-gate.md',
    ];
    expect(outputs.filter((path) => !existsSync(join(process.cwd(), path)))).toEqual([]);
  });

  it('never renders CSS text below the requested 13px floor', () => {
    const css = readFileSync(join(process.cwd(), 'web/styles.css'), 'utf8');
    const pixelSizes = [...css.matchAll(/font-size:\s*([\d.]+)px/giu)].map((match) => Number(match[1]));
    expect(pixelSizes.length).toBeGreaterThan(10);
    expect(Math.min(...pixelSizes)).toBeGreaterThanOrEqual(13);
    expect(css).toContain('font-size: 16px');
    expect(css).toContain(':focus-visible');
    expect(css).toContain('prefers-reduced-motion');
  });

  it('keeps UI downstream from Gameplay and free of rule mutation calls', () => {
    const controller = readFileSync(join(process.cwd(), 'src/ui/controller.ts'), 'utf8');
    expect(controller).not.toMatch(/applyAction|validateGameAction|Math\.random/gu);
    expect(controller).toMatch(/session\.dispatch|session\.getActionCandidates|session\.getView/gu);
  });
});
