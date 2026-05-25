import type { StatsQuery } from '../stats-types';

/**
 * Attendance query keys — TanStack Query 표준 factory 패턴
 * (frontend/CLAUDE.md §5).
 */
export const attendanceKeys = {
  all: ['attendance'] as const,
  today: () => [...attendanceKeys.all, 'today'] as const,
  stats: () => [...attendanceKeys.all, 'stats'] as const,
  statsMe: (q: StatsQuery) => [...attendanceKeys.stats(), 'me', q] as const,
  statsTeam: (teamId: number, q: StatsQuery) =>
    [...attendanceKeys.stats(), 'team', teamId, q] as const,
  statsAll: (q: StatsQuery) =>
    [...attendanceKeys.stats(), 'all', q] as const,
};
