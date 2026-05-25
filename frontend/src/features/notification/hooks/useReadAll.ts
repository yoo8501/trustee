import { useMutation, useQueryClient } from '@tanstack/react-query';
import { notificationApi } from '../api';
import type { Notification } from '../schemas';
import { notificationKeys } from './keys';

export function useReadAll() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: () => notificationApi.readAll(),
    onMutate: async () => {
      await qc.cancelQueries({ queryKey: notificationKeys.list() });
      const prev = qc.getQueryData<Notification[]>(notificationKeys.list());
      if (prev !== undefined) {
        const now = new Date().toISOString();
        qc.setQueryData<Notification[]>(
          notificationKeys.list(),
          prev.map((n) => (n.readAt === null ? { ...n, readAt: now } : n)),
        );
      }
      return { prev };
    },
    onError: (_err, _vars, ctx) => {
      if (ctx?.prev !== undefined) {
        qc.setQueryData(notificationKeys.list(), ctx.prev);
      }
    },
    onSettled: () => {
      void qc.invalidateQueries({ queryKey: notificationKeys.list() });
    },
  });
}
