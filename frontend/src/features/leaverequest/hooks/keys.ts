/**
 * LeaveRequest / Delegation / LeaveBalance query key factory.
 *
 * frontend/CLAUDE.md §5 — 도메인별 namespace 로 invalidation 안전.
 */
export const leaveRequestKeys = {
  all: ['leaveRequests'] as const,
  mine: () => [...leaveRequestKeys.all, 'mine'] as const,
  mineList: (filter: object = {}) =>
    [...leaveRequestKeys.mine(), 'list', filter] as const,
  pending: () => [...leaveRequestKeys.all, 'pending'] as const,
  pendingList: (filter: object = {}) =>
    [...leaveRequestKeys.pending(), 'list', filter] as const,
};

export const leaveBalancesKeys = {
  all: ['leaveBalances'] as const,
  mine: () => [...leaveBalancesKeys.all, 'mine'] as const,
};

export const delegationKeys = {
  all: ['delegations'] as const,
  mine: () => [...delegationKeys.all, 'mine'] as const,
};
