import { keepPreviousData, useQuery } from '@tanstack/react-query';
import {
  adminApi,
  type AttendanceAuditListRequest,
} from '../api/client';
import type { AttendanceAuditRow } from '../schemas';
import { adminKeys } from './keys';

/**
 * 출퇴근 감사 로그 조회. 페이지네이션 / 필터 변경 시 깜빡임 없이 다음 페이지 받기.
 */
export function useAttendanceAudit(req: AttendanceAuditListRequest = {}) {
  return useQuery<{ items: AttendanceAuditRow[]; total: number }>({
    queryKey: adminKeys.auditAttendance(req),
    queryFn: () => adminApi.listAttendanceAudit(req),
    staleTime: 30_000,
    placeholderData: keepPreviousData,
    retry: 1,
  });
}
