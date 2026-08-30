import type { GameAction, RuleEvent } from '../rules/index.js';
import type { HistoryPage, HistoryQuery, HistoryRecord } from './model.js';

export const formatHistorySummary = (
  action: GameAction,
  events: readonly RuleEvent[],
): string => `${action.kind}: ${events.length === 0
  ? 'accepted with no emitted event'
  : events.map(({ kind }) => kind).join(', ')}`;

export const queryHistory = (
  records: readonly HistoryRecord[],
  query: HistoryQuery,
): HistoryPage => {
  const filtered = query.actionKind === null
    ? records : records.filter(({ action }) => action.kind === query.actionKind);
  const offset = Math.max(0, Math.floor(query.offset));
  const limit = Math.max(0, Math.floor(query.limit));
  return {
    records: filtered.slice(offset, offset + limit),
    total: filtered.length,
    truncated: offset + limit < filtered.length,
  };
};
