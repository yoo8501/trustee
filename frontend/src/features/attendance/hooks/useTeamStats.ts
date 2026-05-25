import { useQuery } from '@tanstack/react-query';
import type { ApiError } from '../../../lib/api';
import { statsApi } from '../api';
import type { StatsQuery, StatsResponse } from '../stats-types';
import { attendanceKeys } from './keys';

/**
 * 팀 통계 — team_lead+ 만. BE Scoped Querier 가 자기 팀만 허용.
 *
 * Critical Path 7: 권한 없는 팀 조회 시 BE 가 403 + FORBIDDEN 반환.
 * 페이지 레이어에서 `error.errorCode === 'FORBIDDEN'` 분기로 차단 UI 표시.
 *
 * retry 0 — 403 은 retry 의미 없음 (권한이 변하지 않으므로).
 */
export function useTeamStats(teamId: number, query: StatsQuery) {
  return useQuery<StatsResponse, ApiError>({
    queryKey: attendanceKeys.statsTeam(teamId, query),
    queryFn: () => statsApi.team(teamId, query),
    staleTime: 30_000,
    retry: 0,
  });
}
