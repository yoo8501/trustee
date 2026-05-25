import { useMutation, useQueryClient } from '@tanstack/react-query';
import { notificationApi } from '../api';
import type { Notification } from '../schemas';
import { notificationKeys } from './keys';

/**
 * 알림 단건 읽음 — 옵티미스틱 update (UX §1 즉각 피드백).
 *
 * 실패 시 onError에서 1초 안 원복 — 캐시 snapshot rollback.
 */
export function useReadNotification() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: number) => notificationApi.read(id),
    onMutate: async (id) => {
      await qc.cancelQueries({ queryKey: notificationKeys.list() });
      const prev = qc.getQueryData<Notification[]>(notificationKeys.list());
      if (prev !== undefined) {
        qc.setQueryData<Notification[]>(
          notificationKeys.list(),
          prev.map((n) =>
            n.id === id && n.readAt === null
              ? { ...n, readAt: new Date().toISOString() }
              : n,
          ),
        );
      }
      return { prev };
    },
    onError: (_err, _id, ctx) => {
      if (ctx?.prev !== undefined) {
        qc.setQueryData(notificationKeys.list(), ctx.prev);
      }
    },
    onSettled: () => {
      void qc.invalidateQueries({ queryKey: notificationKeys.list() });
    },
  });
}
