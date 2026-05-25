import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useSnackbar } from 'notistack';
import { useTranslation } from 'react-i18next';
import { ApiError } from '../../../lib/api';
import { attendanceApi } from '../api';
import type { AttendanceRecord } from '../types';
import { resolveErrorMessage } from '../../../lib/i18n';
import { attendanceKeys } from './keys';

interface OptimisticCtx {
  prev: AttendanceRecord | null | undefined;
}

/**
 * 퇴근 mutation — TanStack Query optimistic update.
 *
 * UX §1 즉각 피드백: 클릭 → ≤ 100ms 안에 "퇴근 완료" 로 변경.
 * onError 시 즉시 원복 + warn toast. CHECK_IN_REQUIRED 는 i18n 매핑.
 */
export function useCheckOut() {
  const qc = useQueryClient();
  const { enqueueSnackbar } = useSnackbar();
  const { t } = useTranslation();

  return useMutation<AttendanceRecord, ApiError, void, OptimisticCtx>({
    mutationFn: () => attendanceApi.checkOut(),

    onMutate: async () => {
      await qc.cancelQueries({ queryKey: attendanceKeys.today() });
      const prev = qc.getQueryData<AttendanceRecord | null>(
        attendanceKeys.today(),
      );

      if (prev) {
        const optimistic: AttendanceRecord = {
          ...prev,
          checkOutAt: new Date().toISOString(),
        };
        qc.setQueryData<AttendanceRecord | null>(
          attendanceKeys.today(),
          optimistic,
        );
      }
      return { prev };
    },

    onError: (err, _v, ctx) => {
      qc.setQueryData<AttendanceRecord | null>(
        attendanceKeys.today(),
        ctx?.prev ?? null,
      );
      // CHECK_IN_REQUIRED 같은 도메인 메시지는 i18n 매핑, fallback 은 checkout.failed
      const fallback = t('attendance.checkout.failed');
      const msg =
        err.errorCode === 'CHECK_IN_REQUIRED'
          ? t('error.CHECK_IN_REQUIRED', { defaultValue: fallback })
          : resolveErrorMessage(err, t) || fallback;
      enqueueSnackbar(msg, { variant: 'warning' });
    },

    onSuccess: (data) => {
      qc.setQueryData<AttendanceRecord | null>(attendanceKeys.today(), data);
      enqueueSnackbar(t('attendance.checkout.success'), {
        variant: 'success',
      });
    },

    onSettled: () => {
      void qc.invalidateQueries({ queryKey: attendanceKeys.today() });
    },
  });
}
