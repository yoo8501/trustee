import { useMutation, useQueryClient } from '@tanstack/react-query';
import { ApiError } from '../../../lib/api';
import { expenseReportApi } from '../api';
import type { ExpenseReport } from '../schemas';
import { expenseReportKeys } from './keys';

/**
 * 지출결의서 취소 — pending only.
 *
 * 5초 Undo UX 는 useUndoableMutation 헬퍼와 조합해서 컴포넌트에서 구성.
 */
export function useCancelExpense() {
  const qc = useQueryClient();
  return useMutation<ExpenseReport, ApiError, number>({
    mutationFn: (id) => expenseReportApi.cancel(id),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: expenseReportKeys.mine() });
    },
  });
}
