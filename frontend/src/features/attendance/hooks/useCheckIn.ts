import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useSnackbar } from 'notistack';
import { useTranslation } from 'react-i18next';
import { ApiError } from '../../../lib/api';
import { attendanceApi } from '../api';
import type { AttendanceRecord } from '../types';
import { formatTimeKST, todayKST } from '../utils';
import { attendanceKeys } from './keys';

interface OptimisticCtx {
  prev: AttendanceRecord | null | undefined;
}

/**
 * 출근 mutation — TanStack Query optimistic update.
 *
 * UX §1 즉각 피드백: 클릭 → ≤ 100ms 안에 카드가 "출근 중" 으로 변경.
 * onError 에서 1초 안 원복 + warn toast.
 */
export function useCheckIn() {
  const qc = useQueryClient();
  const { enqueueSnackbar } = useSnackbar();
  const { t } = useTranslation();

  return useMutation<AttendanceRecord, ApiError, void, OptimisticCtx>({
    mutationFn: () => attendanceApi.checkIn(),

    onMutate: async () => {
      // 진행 중 query 캔슬 → 우리가 곧 caches 를 갈아끼울 것
      await qc.cancelQueries({ queryKey: attendanceKeys.today() });
      const prev = qc.getQueryData<AttendanceRecord | null>(
        attendanceKeys.today(),
      );

      const optimistic: AttendanceRecord = {
        id: -1, // tentative — onSuccess 에서 BE id 로 교체
        workDate: todayKST(),
        checkInAt: new Date().toISOString(),
        checkOutAt: null,
        status: 'normal',
        lunchBreakMinutes: 60,
      };
      qc.setQueryData<AttendanceRecord | null>(
        attendanceKeys.today(),
        optimistic,
      );
      return { prev };
    },

    onError: (_err, _v, ctx) => {
      // 1초 안 원복 (즉시 setQueryData) + warn toast
      qc.setQueryData<AttendanceRecord | null>(
        attendanceKeys.today(),
        ctx?.prev ?? null,
      );
      enqueueSnackbar(t('attendance.checkin.failed'), { variant: 'warning' });
    },

    onSuccess: (data) => {
      qc.setQueryData<AttendanceRecord | null>(attendanceKeys.today(), data);
      const time = data.checkInAt ? formatTimeKST(data.checkInAt) : '';
      enqueueSnackbar(t('attendance.checkin.success', { time }), {
        variant: 'success',
      });
    },

    onSettled: () => {
      void qc.invalidateQueries({ queryKey: attendanceKeys.today() });
    },
  });
}
