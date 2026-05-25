import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useSnackbar } from 'notistack';
import { useTranslation } from 'react-i18next';
import { ApiError } from '../../../lib/api';
import { resolveErrorMessage } from '../../../lib/i18n/resolveErrorMessage';
import { adminApi, type UserUpdateRequest } from '../api/client';
import type { AdminUser } from '../schemas';
import { adminKeys } from './keys';

/**
 * 사용자 수정 (role / status / team / manager / name).
 *
 * - 성공 시 invalidate (목록 row 가 즉시 갱신).
 * - CANNOT_DEMOTE_SELF 같은 도메인 에러는 toast 로 표시 (UX §9 결과 명확화).
 */
export function useUpdateUser() {
  const qc = useQueryClient();
  const { enqueueSnackbar } = useSnackbar();
  const { t } = useTranslation();

  return useMutation<AdminUser, ApiError, UserUpdateRequest>({
    mutationFn: (req) => adminApi.updateUser(req),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: adminKeys.users() });
    },
    onError: (err) => {
      enqueueSnackbar(resolveErrorMessage(err, t), { variant: 'error' });
    },
  });
}
