import { describe, expect, it } from 'vitest';
import {
  RULE_FEATURE_MANIFEST,
  RULE_TABLE_PROVENANCE,
  requireImplementedRuleFeature,
} from '../../src/index.js';

describe('R0 Rule manifest and provenance', () => {
  it('requires every implemented feature to own rules, API surface, and tests', () => {
    const implemented = RULE_FEATURE_MANIFEST.filter(({ status }) => status === 'IMPLEMENTED');
    expect(implemented.length).toBeGreaterThan(0);
    for (const entry of implemented) {
      expect(entry.rules.length, entry.id).toBeGreaterThan(0);
      expect(entry.owner, entry.id).toMatch(/^rules\//);
      expect(entry.tests.length, entry.id).toBeGreaterThan(0);
      expect(entry.actions.length + entry.queries.length, entry.id).toBeGreaterThan(0);
    }
  });

  it('fail-fast rejects deferred and unknown features', () => {
    expect(requireImplementedRuleFeature('movement.ground').ok).toBe(true);
    expect(requireImplementedRuleFeature('air.transport-and-drop')).toMatchObject({
      ok: false,
      error: { code: 'UNSUPPORTED_RULE_FEATURE', status: 'DEFERRED' },
    });
    expect(requireImplementedRuleFeature('unknown')).toMatchObject({
      ok: false,
      error: { status: 'UNKNOWN' },
    });
  });

  it('pins every Rule table to a source, locator, version, and resolution priority', () => {
    for (const table of RULE_TABLE_PROVENANCE) {
      expect(table.sourceDocument).not.toBe('');
      expect(table.locator).not.toBe('');
      expect(table.rulesVersion).not.toBe('');
      expect(table.sourceSha256).not.toBe('');
      expect(table.resolutionPriority).toBeGreaterThan(0);
    }
  });
});
