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
      'docs/ui/10-play-first-generated-operation.md',
      'docs/quality/01-delivery-status-and-todo-policy.md',
      'AGENTS.md',
    ];
    expect(outputs.filter((path) => !existsSync(join(process.cwd(), path)))).toEqual([]);
  });

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

  it('keeps UI downstream from Gameplay and free of rule mutation calls', () => {
    const controller = readFileSync(join(process.cwd(), 'src/ui/controller.ts'), 'utf8');
    expect(controller).not.toMatch(/applyAction|validateGameAction|Math\.random/gu);
    expect(controller).toMatch(/session\.dispatch|session\.getActionCandidates|session\.getView/gu);
  });

  it('previews map, OOB, and deployment as one New Game package', () => {
    const browser = readFileSync(join(process.cwd(), 'src/ui/browser.ts'), 'utf8');
    expect(browser).toContain('newGameOrchestrator.prepare');
    expect(browser).toContain('operationPreviewHtml(newGamePreview)');
    expect(browser).toContain('buildGeneratedMapPreview(prepared.generatedMap');
    expect(browser).toContain('buildGeneratedOobPreview(prepared.generatedOob)');
    expect(browser).toContain('prepared.deployment.metrics.occupiedHexes');
    expect(browser).toContain('schedulePreview');
    expect(browser).toContain('Start this operation');
    expect(browser).not.toContain("'#random-map'");
    expect(browser).not.toContain("'#random-oob'");
    expect(browser).not.toContain('terrain-label');
  });

  it('uses the integrated New Game orchestrator and renders an authoritative Game End', () => {
    const browser = readFileSync(join(process.cwd(), 'src/ui/browser.ts'), 'utf8');
    expect(browser).toContain('createNewGameOrchestrator');
    expect(browser).toContain('schedulePreview');
    expect(browser).toContain('Start this operation');
    expect(browser).toContain('2 Map');
    expect(browser).toContain('3 OOB');
    expect(browser).toContain('4 Deployment');
    expect(browser).toContain("lifecycle !== 'FINISHED'");
    expect(browser).toContain('Download final save');
    expect(browser).toContain('Download replay');
    expect(browser).not.toContain('createRuleGameStateFixture');
    expect(browser).not.toContain('createRuleConfigurationFixture');
  });
});
