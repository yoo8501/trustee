import { useQuery } from '@tanstack/react-query';
import { expenseReportApi } from '../api';
import type { ExpenseReport } from '../schemas';
import { expenseReportKeys } from './keys';

export function usePendingExpenses(opts: { enabled?: boolean } = {}) {
  return useQuery<{ items: ExpenseReport[]; total: number }>({
    queryKey: expenseReportKeys.pendingList(),
    queryFn: () => expenseReportApi.listPending(),
    enabled: opts.enabled ?? true,
    staleTime: 15_000,
    retry: 1,
  });
}
