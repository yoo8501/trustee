import { useMutation, useQueryClient } from '@tanstack/react-query';
import { ApiError } from '../../../lib/api';
import { leaveRequestApi } from '../api';
import type { LeaveRequest } from '../schemas';
import { leaveBalancesKeys, leaveRequestKeys } from './keys';

/**
 * 휴가 취소 — pending only.
 *
 * 본 hook 은 "실제 cancel 호출" 만 담당한다. 5초 Undo UX 는 `useUndoableMutation`
 * 헬퍼와 조합해서 컴포넌트에서 구성한다 (호출부에서 mutateAsync 를 mutationFn 으로 전달).
 *
 * onSuccess 시 내 목록 + 잔여 invalidate.
 */
export function useCancel() {
  const qc = useQueryClient();
  return useMutation<LeaveRequest, ApiError, number>({
    mutationFn: (id) => leaveRequestApi.cancel(id),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: leaveRequestKeys.mine() });
      void qc.invalidateQueries({ queryKey: leaveBalancesKeys.mine() });
    },
  });
}
