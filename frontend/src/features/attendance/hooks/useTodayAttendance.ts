import { useQuery } from '@tanstack/react-query';
import { attendanceApi } from '../api';
import type { AttendanceRecord } from '../types';
import { attendanceKeys } from './keys';

/**
 * 오늘 출퇴근 기록 조회 — 단건 (Sprint 4 대시보드 카드용).
 *
 * data: null = 오늘 아직 출근 안 함.
 * data: AttendanceRecord = 이미 출근 (혹은 퇴근까지).
 *
 * frontend/CLAUDE.md §5 — single-record fetch 는 useQuery.
 */
export function useTodayAttendance() {
  return useQuery<AttendanceRecord | null>({
    queryKey: attendanceKeys.today(),
    queryFn: () => attendanceApi.getToday(),
    staleTime: 30_000,
    retry: 1,
  });
}
