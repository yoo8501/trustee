import { z } from 'zod';

/**
 * AttendanceRecord — BE `internal/hr/attendance` 출퇴근 레코드.
 *
 * - workDate: YYYY-MM-DD (KST). DB `TIMESTAMPTZ` 가 아니라 logical date.
 * - checkInAt / checkOutAt: ISO 8601 (UTC). Frontend 에서 KST 로 표시.
 * - status: BE 에서 판정 (`normal` / `late` / `early_leave` / `absent` / `auto_closed`).
 * - lunchBreakMinutes: 기본 60.
 *
 * Sprint 4 — Sprint 5 에서 일/주/월 집계 시 status 활용. 본 sprint 는 표시만.
 */
export const AttendanceStatusSchema = z.enum([
  'normal',
  'late',
  'early_leave',
  'absent',
  'auto_closed',
]);

export type AttendanceStatus = z.infer<typeof AttendanceStatusSchema>;

export const AttendanceRecordSchema = z.object({
  id: z.number(),
  workDate: z.string(),
  checkInAt: z.string().nullable(),
  checkOutAt: z.string().nullable(),
  status: AttendanceStatusSchema,
  lunchBreakMinutes: z.number(),
});

export type AttendanceRecord = z.infer<typeof AttendanceRecordSchema>;
