import { useQuery } from '@tanstack/react-query';
import { notificationApi } from '../api';
import type { Notification } from '../schemas';
import { notificationKeys } from './keys';

/**
 * 알림 목록 — 헤더 종 아이콘 + 드롭다운에서 사용.
 *
 * staleTime 30s 라 같은 세션에서 자주 polling 안 함. 의도적 새로고침은 invalidate.
 */
export function useNotifications(opts: { enabled?: boolean } = {}) {
  return useQuery<Notification[]>({
    queryKey: notificationKeys.list(),
    queryFn: () => notificationApi.list(),
    enabled: opts.enabled ?? true,
    staleTime: 30_000,
    retry: 1,
  });
}
