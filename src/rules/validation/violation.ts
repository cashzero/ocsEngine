import type { RuleViolation } from '../kernel/model.js';

export const violation = (
  code: string,
  path: readonly (string | number)[],
  message: string,
  rule: string,
): RuleViolation => ({ code, path, message, rule });
