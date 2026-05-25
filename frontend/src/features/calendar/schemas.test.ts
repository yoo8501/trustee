import { describe, expect, it } from 'vitest';
import {
  CalendarAttendanceSchema,
  CalendarHolidaySchema,
  CalendarLeaveSchema,
  CalendarResponseSchema,
} from './schemas';

describe('CalendarLeaveSchema', () => {
  const base = {
    id: 1,
    requesterId: 10,
    requesterName: '홍길동',
    leaveTypeCode: 'annual',
    leaveTypeName: '연차',
    startAt: '2026-05-25T00:00:00+09:00',
    endAt: '2026-05-25T23:59:59+09:00',
    status: 'approved' as const,
    reason: null,
  };

  it('정상 입력 — 파싱 성공', () => {
    const r = CalendarLeaveSchema.safeParse(base);
    expect(r.success).toBe(true);
  });

  it('reason null 허용 (권한 없을 때 BE 마스킹)', () => {
    const r = CalendarLeaveSchema.safeParse({ ...base, reason: null });
    expect(r.success).toBe(true);
  });

  it('reason 문자열도 허용', () => {
    const r = CalendarLeaveSchema.safeParse({ ...base, reason: '가족 행사' });
    expect(r.success).toBe(true);
    if (r.success) expect(r.data.reason).toBe('가족 행사');
  });

  it('status enum 위반 → 실패', () => {
    const r = CalendarLeaveSchema.safeParse({ ...base, status: 'unknown' });
    expect(r.success).toBe(false);
  });

  it('id 누락 → 실패', () => {
    const { id: _omit, ...rest } = base;
    void _omit;
    const r = CalendarLeaveSchema.safeParse(rest);
    expect(r.success).toBe(false);
  });
});

describe('CalendarHolidaySchema', () => {
  it('정상 입력', () => {
    expect(
      CalendarHolidaySchema.safeParse({
        date: '2026-05-25',
        name: '부처님오신날 대체공휴일',
      }).success,
    ).toBe(true);
  });
  it('name 누락 → 실패', () => {
    expect(
      CalendarHolidaySchema.safeParse({ date: '2026-05-25' }).success,
    ).toBe(false);
  });
});

describe('CalendarAttendanceSchema', () => {
  it('checkInAt/checkOutAt null 허용', () => {
    const r = CalendarAttendanceSchema.safeParse({
      workDate: '2026-05-25',
      checkInAt: null,
      checkOutAt: null,
      status: 'working',
    });
    expect(r.success).toBe(true);
  });
});

describe('CalendarResponseSchema', () => {
  it('leaves + holidays + attendances 조합', () => {
    const r = CalendarResponseSchema.safeParse({
      leaves: [],
      holidays: [],
      attendances: [],
    });
    expect(r.success).toBe(true);
  });
});
