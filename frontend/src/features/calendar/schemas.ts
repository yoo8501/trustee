import { z } from 'zod';

/**
 * Sprint 8 — Calendar 도메인 Zod 스키마.
 *
 * BE 응답 `GET /api/hr/calendar?from=&to=&scope=` 의 `data` 형태:
 * `{ leaves: CalendarLeave[], holidays: CalendarHoliday[], attendances: CalendarAttendance[] }`.
 *
 * - leaves: 결재 pending/approved 휴가 + 본인은 cancelled/rejected 까지
 * - holidays: 한국 공휴일 + 회사 휴일 (DESIGN.md §색상 토큰 holiday)
 * - attendances: 본인 출퇴근 기록만
 *
 * reason 은 권한 없을 때 BE 가 null 로 마스킹 (가시성 규칙: 휴가 사유는 본인/결재자/HR만).
 */

export const CalendarLeaveSchema = z.object({
  id: z.number().int().positive(),
  requesterId: z.number().int().positive(),
  requesterName: z.string(),
  leaveTypeCode: z.string(),
  leaveTypeName: z.string(),
  startAt: z.string(),
  endAt: z.string(),
  status: z.enum(['pending', 'approved', 'rejected', 'cancelled']),
  reason: z.string().nullable(),
});
export type CalendarLeave = z.infer<typeof CalendarLeaveSchema>;

export const CalendarHolidaySchema = z.object({
  date: z.string(),
  name: z.string(),
});
export type CalendarHoliday = z.infer<typeof CalendarHolidaySchema>;

export const CalendarAttendanceSchema = z.object({
  workDate: z.string(),
  checkInAt: z.string().nullable(),
  checkOutAt: z.string().nullable(),
  status: z.string(),
});
export type CalendarAttendance = z.infer<typeof CalendarAttendanceSchema>;

export const CalendarResponseSchema = z.object({
  leaves: z.array(CalendarLeaveSchema),
  holidays: z.array(CalendarHolidaySchema),
  attendances: z.array(CalendarAttendanceSchema),
});
export type CalendarResponse = z.infer<typeof CalendarResponseSchema>;

export type CalendarViewMode = 'month' | 'week' | 'day';
export const CalendarViewModeSchema = z.enum(['month', 'week', 'day']);
