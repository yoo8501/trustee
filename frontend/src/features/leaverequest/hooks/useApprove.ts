import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useSnackbar } from 'notistack';
import { useTranslation } from 'react-i18next';
import { ApiError } from '../../../lib/api';
import { resolveErrorMessage } from '../../../lib/i18n/resolveErrorMessage';
import { leaveRequestApi } from '../api';
import type { LeaveRequest } from '../schemas';
import { leaveBalancesKeys, leaveRequestKeys } from './keys';

interface ApproveArgs {
  id: number;
  comment?: string;
}

export function useApprove() {
  const qc = useQueryClient();
  const { enqueueSnackbar } = useSnackbar();
  const { t } = useTranslation();

  return useMutation<LeaveRequest, ApiError, ApproveArgs>({
    mutationFn: ({ id, comment }) => leaveRequestApi.approve(id, comment),
    onSuccess: () => {
      enqueueSnackbar(t('leave.approvals.approve.success'), {
        variant: 'success',
      });
      void qc.invalidateQueries({ queryKey: leaveRequestKeys.pending() });
      void qc.invalidateQueries({ queryKey: leaveRequestKeys.mine() });
      void qc.invalidateQueries({ queryKey: leaveBalancesKeys.mine() });
    },
    onError: (err) => {
      enqueueSnackbar(resolveErrorMessage(err, t), { variant: 'error' });
    },
  });
}
