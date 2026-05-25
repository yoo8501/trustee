import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useSnackbar } from 'notistack';
import { useTranslation } from 'react-i18next';
import { ApiError } from '../../../lib/api';
import { resolveErrorMessage } from '../../../lib/i18n/resolveErrorMessage';
import { expenseReportApi } from '../api';
import type { ExpenseReport } from '../schemas';
import { expenseReportKeys } from './keys';

interface ApproveArgs {
  id: number;
  comment?: string;
}

export function useApproveExpense() {
  const qc = useQueryClient();
  const { enqueueSnackbar } = useSnackbar();
  const { t } = useTranslation();

  return useMutation<ExpenseReport, ApiError, ApproveArgs>({
    mutationFn: ({ id, comment }) => expenseReportApi.approve(id, comment),
    onSuccess: () => {
      enqueueSnackbar(t('expense.approvals.approve.success'), {
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
