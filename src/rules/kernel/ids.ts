import {
  err,
  ok,
  parseStableIdValue,
  type Brand,
  type Result,
  type StableIdValueError,
} from '../../core/index.js';

export type RuleActionId = Brand<string, 'RuleActionId'>;
export type RuleTransactionId = Brand<string, 'RuleTransactionId'>;
export type RuleDecisionId = Brand<string, 'RuleDecisionId'>;

export interface RuleLocalIdError {
  readonly code: 'INVALID_RULE_LOCAL_ID';
  readonly kind: 'ACTION' | 'TRANSACTION' | 'DECISION';
  readonly value: string;
  readonly reason: StableIdValueError['reason'];
}

const parse = <T extends string>(
  kind: RuleLocalIdError['kind'],
  value: string,
): Result<T, RuleLocalIdError> => {
  const parsed = parseStableIdValue(value);
  return parsed.ok
    ? ok(parsed.value as T)
    : err({ code: 'INVALID_RULE_LOCAL_ID', kind, value, reason: parsed.error.reason });
};

export const parseRuleActionId = (value: string): Result<RuleActionId, RuleLocalIdError> =>
  parse<RuleActionId>('ACTION', value);
export const parseRuleTransactionId = (
  value: string,
): Result<RuleTransactionId, RuleLocalIdError> => parse<RuleTransactionId>('TRANSACTION', value);
export const parseRuleDecisionId = (
  value: string,
): Result<RuleDecisionId, RuleLocalIdError> => parse<RuleDecisionId>('DECISION', value);
