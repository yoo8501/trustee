import { useQuery } from '@tanstack/react-query';
import { leaveRequestApi } from '../api';
import type { LeaveBalance } from '../schemas';
import { leaveBalancesKeys } from './keys';

export function useLeaveBalances() {
  return useQuery<LeaveBalance[]>({
    queryKey: leaveBalancesKeys.mine(),
    queryFn: () => leaveRequestApi.listMyBalances(),
    staleTime: 60_000,
    retry: 1,
  });
}
