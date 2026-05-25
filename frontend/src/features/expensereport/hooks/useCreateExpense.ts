import { useMutation, useQueryClient } from '@tanstack/react-query';
import { ApiError } from '../../../lib/api';
import { expenseReportApi } from '../api';
import { expenseDraftStorage } from '../lib/draftStorage';
import type { CreateExpenseInput, ExpenseReport } from '../schemas';
import { expenseReportKeys } from './keys';

/**
 * 지출결의서 신청 mutation — Sprint 7.
 *
 * onSuccess 에서:
 *  - draft 클리어 (UX §2)
 *  - 내 신청 목록 invalidate
 */
export function useCreateExpense() {
  const qc = useQueryClient();

  return useMutation<ExpenseReport, ApiError, CreateExpenseInput>({
    mutationFn: (input) => expenseReportApi.create(input),
    onSuccess: () => {
      expenseDraftStorage.clear();
      void qc.invalidateQueries({ queryKey: expenseReportKeys.mine() });
    },
  });
}
