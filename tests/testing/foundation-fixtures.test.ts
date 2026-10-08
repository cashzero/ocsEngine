import { describe, expect, it } from 'vitest';
import {
  createMalformedFoundationFixtures,
  validateScenarioDefinition,
} from '../../src/index.js';

describe('Foundation fixture kit', () => {
  it('provides named malformed fixtures with stable expected issue codes', () => {
    for (const fixture of createMalformedFoundationFixtures()) {
      const codes = validateScenarioDefinition(fixture.scenario).map(({ code }) => code);
      expect(codes, fixture.name).toContain(fixture.expectedCode);
    }
  });
});
