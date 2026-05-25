import { useQuery } from '@tanstack/react-query';
import { leaveRequestApi } from '../api';
import type { LeaveRequest } from '../schemas';
import { leaveRequestKeys } from './keys';

interface MyLeaveListQuery {
  page?: number;
  size?: number;
}

export function useMyLeaveRequests(filter: MyLeaveListQuery = {}) {
  return useQuery<{ items: LeaveRequest[]; total: number }>({
    queryKey: leaveRequestKeys.mineList(filter),
    queryFn: () => leaveRequestApi.listMine(filter),
    staleTime: 30_000,
    retry: 1,
  });
}
