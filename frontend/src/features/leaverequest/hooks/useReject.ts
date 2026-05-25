import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useSnackbar } from 'notistack';
import { useTranslation } from 'react-i18next';
import { ApiError } from '../../../lib/api';
import { resolveErrorMessage } from '../../../lib/i18n/resolveErrorMessage';
import { leaveRequestApi } from '../api';
import type { LeaveRequest } from '../schemas';
import { leaveRequestKeys } from './keys';

interface RejectArgs {
  id: number;
  reason: string;
}

export function useReject() {
  const qc = useQueryClient();
  const { enqueueSnackbar } = useSnackbar();
  const { t } = useTranslation();

  return useMutation<LeaveRequest, ApiError, RejectArgs>({
    mutationFn: ({ id, reason }) => leaveRequestApi.reject(id, reason),
    onSuccess: () => {
      enqueueSnackbar(t('leave.approvals.reject.success'), {
        variant: 'success',
      });
      void qc.invalidateQueries({ queryKey: leaveRequestKeys.pending() });
      void qc.invalidateQueries({ queryKey: leaveRequestKeys.mine() });
    },
    onError: (err) => {
      enqueueSnackbar(resolveErrorMessage(err, t), { variant: 'error' });
    },
  });
}
