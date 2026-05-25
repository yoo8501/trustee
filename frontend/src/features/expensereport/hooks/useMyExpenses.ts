import { useQuery } from '@tanstack/react-query';
import { expenseReportApi } from '../api';
import type { ExpenseReport } from '../schemas';
import { expenseReportKeys } from './keys';

interface MyExpenseListQuery {
  page?: number;
  size?: number;
}

export function useMyExpenses(filter: MyExpenseListQuery = {}) {
  return useQuery<{ items: ExpenseReport[]; total: number }>({
    queryKey: expenseReportKeys.mineList(filter),
    queryFn: () => expenseReportApi.listMine(filter),
    staleTime: 30_000,
    retry: 1,
  });
}
