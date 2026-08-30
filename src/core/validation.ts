export type ValidationSeverity = 'WARNING' | 'ERROR';

export interface ValidationIssue {
  readonly code: string;
  readonly path: readonly (string | number)[];
  readonly severity: ValidationSeverity;
  readonly message: string;
}

export const hasValidationErrors = (issues: readonly ValidationIssue[]): boolean =>
  issues.some(({ severity }) => severity === 'ERROR');
