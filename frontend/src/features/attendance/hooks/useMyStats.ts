import { useQuery } from '@tanstack/react-query';
import type { ApiError } from '../../../lib/api';
import { statsApi } from '../api';
import type { StatsQuery, StatsResponse } from '../stats-types';
import { attendanceKeys } from './keys';

/**
 * 본인 통계 — period(day/week/month) + date 기준.
 *
 * useQuery 사용 (단건 조회 — 응답이 period 별 단일 집계 객체).
 * 권한 분기 없음: 모든 직원이 자기 통계를 본다.
 */
export function useMyStats(query: StatsQuery) {
  return useQuery<StatsResponse, ApiError>({
    queryKey: attendanceKeys.statsMe(query),
    queryFn: () => statsApi.me(query),
    staleTime: 30_000,
    retry: 1,
  });
}
