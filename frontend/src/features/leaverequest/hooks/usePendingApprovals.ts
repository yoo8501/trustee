import { useQuery } from '@tanstack/react-query';
import { leaveRequestApi } from '../api';
import type { LeaveRequest } from '../schemas';
import { leaveRequestKeys } from './keys';

/**
 * 결재 대기 목록 (team_lead+ 권한 필요).
 *
 * 사이드바/헤더 배지 카운트로도 활용 — 결재 후 invalidate 되면 자동 갱신.
 */
export function usePendingApprovals(opts: { enabled?: boolean } = {}) {
  return useQuery<{ items: LeaveRequest[]; total: number }>({
    queryKey: leaveRequestKeys.pendingList(),
    queryFn: () => leaveRequestApi.listPending(),
    enabled: opts.enabled ?? true,
    staleTime: 15_000,
    retry: 1,
  });
}
