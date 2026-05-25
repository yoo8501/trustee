import { describe, expect, it } from 'vitest';
import {
  PeriodSummarySchema,
  RecordStatsSchema,
  StatsResponseSchema,
  type PeriodSummary,
  type RecordStats,
  type StatsResponse,
} from './stats-types';

const validRecord: RecordStats = {
  date: '2026-05-25',
  checkInAt: '2026-05-25T00:01:00Z',
  checkOutAt: '2026-05-25T09:01:00Z',
  actualWorkMinutes: 480,
  expectedMinutes: 480,
  adjustedExpected: 480,
  overtimeMinutes: 0,
  status: 'normal',
  leaveHours: 0,
};

const validSummary: PeriodSummary = {
  totalActualMinutes: 2400,
  totalOvertimeMinutes: 60,
  daysPresent: 5,
  daysLate: 1,
  daysEarlyLeave: 0,
  daysAutoClosed: 0,
  daysAbsent: 0,
  attendanceRate: 1,
  weeklyOvertimeMinutes: 60,
  weeklyTotalMinutes: 2460,
};

const validResponse: StatsResponse = {
  period: 'week',
  from: '2026-05-25',
  to: '2026-05-31',
  records: [validRecord],
  summary: validSummary,
};

describe('RecordStatsSchema', () => {
  it('정상 케이스 — 모든 필드 채워진 record', () => {
    expect(RecordStatsSchema.parse(validRecord)).toEqual(validRecord);
  });

  it('정상 케이스 — checkInAt/checkOutAt null 허용 (결근 케이스)', () => {
    const absent: RecordStats = {
      ...validRecord,
      checkInAt: null,
      checkOutAt: null,
      status: 'absent',
      actualWorkMinutes: 0,
    };
    expect(RecordStatsSchema.parse(absent)).toEqual(absent);
  });

  it('필수 누락 — date 없으면 fail', () => {
    const { date: _, ...rest } = validRecord;
    expect(RecordStatsSchema.safeParse(rest).success).toBe(false);
  });

  it('타입 오류 — actualWorkMinutes 가 string 이면 fail', () => {
    const bad = { ...validRecord, actualWorkMinutes: '480' };
    expect(RecordStatsSchema.safeParse(bad).success).toBe(false);
  });

  it('도메인 규칙 — actualWorkMinutes 음수면 fail', () => {
    const bad = { ...validRecord, actualWorkMinutes: -1 };
    expect(RecordStatsSchema.safeParse(bad).success).toBe(false);
  });

  it('도메인 규칙 — status enum 외 값이면 fail', () => {
    const bad = { ...validRecord, status: 'whatever' };
    expect(RecordStatsSchema.safeParse(bad).success).toBe(false);
  });
});

describe('PeriodSummarySchema', () => {
  it('정상 케이스', () => {
    expect(PeriodSummarySchema.parse(validSummary)).toEqual(validSummary);
  });

  it('필수 누락 — attendanceRate 없으면 fail', () => {
    const { attendanceRate: _, ...rest } = validSummary;
    expect(PeriodSummarySchema.safeParse(rest).success).toBe(false);
  });

  it('타입 오류 — daysPresent 가 boolean 이면 fail', () => {
    const bad = { ...validSummary, daysPresent: true };
    expect(PeriodSummarySchema.safeParse(bad).success).toBe(false);
  });

  it('도메인 규칙 — attendanceRate 1 초과면 fail', () => {
    const bad = { ...validSummary, attendanceRate: 1.5 };
    expect(PeriodSummarySchema.safeParse(bad).success).toBe(false);
  });

  it('도메인 규칙 — weeklyTotalMinutes 음수면 fail', () => {
    const bad = { ...validSummary, weeklyTotalMinutes: -10 };
    expect(PeriodSummarySchema.safeParse(bad).success).toBe(false);
  });
});

describe('StatsResponseSchema', () => {
  it('정상 케이스 — 빈 records 허용', () => {
    const empty: StatsResponse = { ...validResponse, records: [] };
    expect(StatsResponseSchema.parse(empty)).toEqual(empty);
  });

  it('도메인 규칙 — period enum 외 값이면 fail', () => {
    const bad = { ...validResponse, period: 'year' };
    expect(StatsResponseSchema.safeParse(bad).success).toBe(false);
  });

  it('도메인 규칙 — records 안의 한 record 도 invalid 면 전체 fail', () => {
    const bad = {
      ...validResponse,
      records: [{ ...validRecord, status: 'unknown' }],
    };
    expect(StatsResponseSchema.safeParse(bad).success).toBe(false);
  });

  it('필수 누락 — summary 없으면 fail', () => {
    const { summary: _, ...rest } = validResponse;
    expect(StatsResponseSchema.safeParse(rest).success).toBe(false);
  });
});
