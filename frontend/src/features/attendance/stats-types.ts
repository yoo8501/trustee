import { z } from 'zod';

/**
 * Sprint 5 — 통계 응답 Zod schema.
 *
 * BE 응답 shape (POST /api/hr/attendance/me/stats, /team/:id/stats, /all/stats).
 * 모든 시간 단위는 분(minutes). 날짜는 YYYY-MM-DD (KST), 시각은 ISO 8601 (UTC).
 *
 * - `expectedMinutes`: user 의 기본 근무 시간 (예: 480분 = 8h).
 * - `adjustedExpected`: 휴가 차감 후 기준 (반차 4h 사용 → 480 - 240 = 240).
 * - `overtimeMinutes`: max(0, actualWork - adjustedExpected).
 * - `weeklyTotalMinutes`: 주 누적 근로 (48h / 52h 임계 판정 기반).
 */

export const StatsPeriodSchema = z.enum(['day', 'week', 'month']);
export type StatsPeriod = z.infer<typeof StatsPeriodSchema>;

export const StatsStatusSchema = z.enum([
  'normal',
  'late',
  'early_leave',
  'absent',
  'auto_closed',
]);
export type StatsStatus = z.infer<typeof StatsStatusSchema>;

export const RecordStatsSchema = z.object({
  date: z.string(),
  checkInAt: z.string().nullable(),
  checkOutAt: z.string().nullable(),
  actualWorkMinutes: z.number().int().min(0),
  expectedMinutes: z.number().int().min(0),
  adjustedExpected: z.number().int().min(0),
  overtimeMinutes: z.number().int().min(0),
  status: StatsStatusSchema,
  leaveHours: z.number().min(0),
});
export type RecordStats = z.infer<typeof RecordStatsSchema>;

export const PeriodSummarySchema = z.object({
  totalActualMinutes: z.number().int().min(0),
  totalOvertimeMinutes: z.number().int().min(0),
  daysPresent: z.number().int().min(0),
  daysLate: z.number().int().min(0),
  daysEarlyLeave: z.number().int().min(0),
  daysAutoClosed: z.number().int().min(0),
  daysAbsent: z.number().int().min(0),
  attendanceRate: z.number().min(0).max(1),
  weeklyOvertimeMinutes: z.number().int().min(0),
  weeklyTotalMinutes: z.number().int().min(0),
});
export type PeriodSummary = z.infer<typeof PeriodSummarySchema>;

export const StatsResponseSchema = z.object({
  period: StatsPeriodSchema,
  from: z.string(),
  to: z.string(),
  records: z.array(RecordStatsSchema),
  summary: PeriodSummarySchema,
});
export type StatsResponse = z.infer<typeof StatsResponseSchema>;

export interface StatsQuery {
  period: StatsPeriod;
  date: string; // YYYY-MM-DD (KST)
}
