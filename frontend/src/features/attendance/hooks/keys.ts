/**
 * Attendance query keys — TanStack Query 표준 factory 패턴
 * (frontend/CLAUDE.md §5).
 */
export const attendanceKeys = {
  all: ['attendance'] as const,
  today: () => [...attendanceKeys.all, 'today'] as const,
};
