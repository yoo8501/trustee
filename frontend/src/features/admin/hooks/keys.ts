/**
 * Admin / Teams / LeaveTypes / AttendanceAudit query key factory.
 *
 * frontend/CLAUDE.md §5 — 도메인별 namespace 로 invalidation 안전.
 */
export const adminKeys = {
  all: ['admin'] as const,
  users: () => [...adminKeys.all, 'users'] as const,
  usersList: (filter: object) =>
    [...adminKeys.users(), 'list', filter] as const,
  audit: () => [...adminKeys.all, 'audit'] as const,
  auditAttendance: (filter: object) =>
    [...adminKeys.audit(), 'attendance', filter] as const,
};

export const teamsKeys = {
  all: ['teams'] as const,
  list: () => [...teamsKeys.all, 'list'] as const,
};

export const leaveTypesKeys = {
  all: ['leaveTypes'] as const,
  list: () => [...leaveTypesKeys.all, 'list'] as const,
};
