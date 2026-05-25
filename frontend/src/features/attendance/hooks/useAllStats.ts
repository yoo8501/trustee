import { useQuery } from '@tanstack/react-query';
import type { ApiError } from '../../../lib/api';
import { statsApi } from '../api';
import type { StatsQuery, StatsResponse } from '../stats-types';
import { attendanceKeys } from './keys';

/**
 * 전사 통계 — HR / super_admin 만.
 * 일반 호출 시 BE 가 403 + FORBIDDEN 반환.
 */
export function useAllStats(query: StatsQuery) {
  return useQuery<StatsResponse, ApiError>({
    queryKey: attendanceKeys.statsAll(query),
    queryFn: () => statsApi.all(query),
    staleTime: 30_000,
    retry: 0,
  });
}
