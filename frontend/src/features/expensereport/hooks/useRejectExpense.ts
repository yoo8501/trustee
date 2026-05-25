import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useSnackbar } from 'notistack';
import { useTranslation } from 'react-i18next';
import { ApiError } from '../../../lib/api';
import { resolveErrorMessage } from '../../../lib/i18n/resolveErrorMessage';
import { expenseReportApi } from '../api';
import type { ExpenseReport } from '../schemas';
import { expenseReportKeys } from './keys';

interface RejectArgs {
  id: number;
  reason: string;
}

export function useRejectExpense() {
  const qc = useQueryClient();
  const { enqueueSnackbar } = useSnackbar();
  const { t } = useTranslation();

  return useMutation<ExpenseReport, ApiError, RejectArgs>({
    mutationFn: ({ id, reason }) => expenseReportApi.reject(id, reason),
    onSuccess: () => {
      enqueueSnackbar(t('expense.approvals.reject.success'), {
        variant: 'success',
      });
      void qc.invalidateQueries({ queryKey: expenseReportKeys.pending() });
      void qc.invalidateQueries({ queryKey: expenseReportKeys.mine() });
    },
    onError: (err) => {
      enqueueSnackbar(resolveErrorMessage(err, t), { variant: 'error' });
    },
  });
}
