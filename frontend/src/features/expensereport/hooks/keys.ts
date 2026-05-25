/**
 * ExpenseReport query key factory — Sprint 7.
 *
 * frontend/CLAUDE.md §5 — 도메인별 namespace 로 invalidation 안전.
 */
export const expenseReportKeys = {
  all: ['expenseReports'] as const,
  mine: () => [...expenseReportKeys.all, 'mine'] as const,
  mineList: (filter: object = {}) =>
    [...expenseReportKeys.mine(), 'list', filter] as const,
  pending: () => [...expenseReportKeys.all, 'pending'] as const,
  pendingList: (filter: object = {}) =>
    [...expenseReportKeys.pending(), 'list', filter] as const,
};
