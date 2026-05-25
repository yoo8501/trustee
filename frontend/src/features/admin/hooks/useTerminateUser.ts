import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useSnackbar } from 'notistack';
import { useTranslation } from 'react-i18next';
import { ApiError } from '../../../lib/api';
import { resolveErrorMessage } from '../../../lib/i18n/resolveErrorMessage';
import {
  adminApi,
  type TerminateRequest,
  type TerminateResponse,
} from '../api/client';
import { adminKeys } from './keys';

/**
 * 사용자 퇴사 처리 (soft delete) — POST /api/users/terminate.
 *
 * - 성공 → toast + 목록 invalidate.
 * - CANNOT_TERMINATE_SELF → error.CANNOT_TERMINATE_SELF i18n 매핑 + toast.
 */
export function useTerminateUser(
  onSuccess?: (res: TerminateResponse, name: string) => void,
) {
  const qc = useQueryClient();
  const { enqueueSnackbar } = useSnackbar();
  const { t } = useTranslation();

  return useMutation<
    TerminateResponse,
    ApiError,
    TerminateRequest & { name: string }
  >({
    mutationFn: ({ name: _name, ...req }) => adminApi.terminateUser(req),
    onSuccess: (res, vars) => {
      enqueueSnackbar(
        t('admin.users.terminate.success', { name: vars.name }),
        { variant: 'success' },
      );
      void qc.invalidateQueries({ queryKey: adminKeys.users() });
      onSuccess?.(res, vars.name);
    },
    onError: (err) => {
      enqueueSnackbar(resolveErrorMessage(err, t), { variant: 'error' });
    },
  });
}
