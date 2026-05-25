import { useMutation, useQueryClient } from '@tanstack/react-query';
import { ApiError } from '../../../lib/api';
import { leaveRequestApi } from '../api';
import { draftStorage } from '../lib/draftStorage';
import type { CreateLeaveRequestInput, LeaveRequest } from '../schemas';
import { leaveBalancesKeys, leaveRequestKeys } from './keys';

/**
 * 휴가 신청 mutation.
 *
 * onSuccess 에서:
 *  - draft 클리어 (UX §2)
 *  - 내 신청 목록 + 잔여 목록 invalidate (잔여는 BE 가 승인 시점 차감하지만,
 *    낙관적 표시를 위해 빨리 refetch 유도)
 *
 * 호출부에서 onSuccess / onError 콜백 추가 (toast / navigate) 받는다.
 */
export function useCreateLeaveRequest() {
  const qc = useQueryClient();

  return useMutation<LeaveRequest, ApiError, CreateLeaveRequestInput>({
    mutationFn: (input) => leaveRequestApi.create(input),
    onSuccess: () => {
      draftStorage.clear();
      void qc.invalidateQueries({ queryKey: leaveRequestKeys.mine() });
      void qc.invalidateQueries({ queryKey: leaveBalancesKeys.mine() });
    },
  });
}
