import { describe, expect, it } from 'vitest';
import {
  requireImplementedRuleFeature,
} from '../../src/index.js';

describe('R0 Rule manifest and provenance', () => {
  it('fail-fast rejects deferred and unknown features', () => {
    expect(requireImplementedRuleFeature('movement.ground').ok).toBe(true);
    expect(requireImplementedRuleFeature('naval-shipping')).toMatchObject({
      ok: false,
      error: { code: 'UNSUPPORTED_RULE_FEATURE', status: 'DEFERRED' },
    });
    expect(requireImplementedRuleFeature('unknown')).toMatchObject({
      ok: false,
      error: { status: 'UNKNOWN' },
    });
  });
});
