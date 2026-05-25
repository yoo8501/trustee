import { http as httpMsw, HttpResponse } from 'msw';
import { afterEach, describe, expect, it } from 'vitest';
import type { ApiResult } from '../../../lib/api';
import { ApiError } from '../../../lib/api';
import { server } from '../../../test/msw-server';
import type { StatsResponse } from '../stats-types';
import { statsApi } from './stats';

function ok<T>(d: T): ApiResult<T> {
  return { success: true, data: d, message: 'ok', details: null, total: null };
}
function fail(code: string, message = 'fail'): ApiResult<null> {
  return {
    success: false,
    data: null,
    message,
    details: { errorCode: code },
    total: null,
  };
}

const sampleResponse: StatsResponse = {
  period: 'week',
  from: '2026-05-25',
  to: '2026-05-31',
  records: [
    {
      date: '2026-05-25',
      checkInAt: '2026-05-25T00:01:00Z',
      checkOutAt: '2026-05-25T09:01:00Z',
      actualWorkMinutes: 480,
      expectedMinutes: 480,
      adjustedExpected: 480,
      overtimeMinutes: 0,
      status: 'normal',
      leaveHours: 0,
    },
  ],
  summary: {
    totalActualMinutes: 480,
    totalOvertimeMinutes: 0,
    daysPresent: 1,
    daysLate: 0,
    daysEarlyLeave: 0,
    daysAutoClosed: 0,
    daysAbsent: 0,
    attendanceRate: 1,
    weeklyOvertimeMinutes: 0,
    weeklyTotalMinutes: 480,
  },
};

describe('statsApi.me', () => {
  afterEach(() => server.resetHandlers());

  it('정상 응답 → StatsResponse 반환', async () => {
    server.use(
      httpMsw.post(
        'http://localhost:3000/api/hr/attendance/me/stats',
        () => HttpResponse.json(ok(sampleResponse)),
      ),
    );
    const r = await statsApi.me({ period: 'week', date: '2026-05-25' });
    expect(r).toEqual(sampleResponse);
  });

  it('invalid shape 응답 → 던짐', async () => {
    server.use(
      httpMsw.post(
        'http://localhost:3000/api/hr/attendance/me/stats',
        () => HttpResponse.json(ok({ broken: true })),
      ),
    );
    await expect(
      statsApi.me({ period: 'week', date: '2026-05-25' }),
    ).rejects.toBeTruthy();
  });
});

describe('statsApi.team', () => {
  afterEach(() => server.resetHandlers());

  it('정상 응답', async () => {
    server.use(
      httpMsw.post(
        'http://localhost:3000/api/hr/attendance/team/7/stats',
        () => HttpResponse.json(ok(sampleResponse)),
      ),
    );
    const r = await statsApi.team(7, { period: 'week', date: '2026-05-25' });
    expect(r.period).toBe('week');
  });

  it('Critical Path 7 — 권한 없는 팀 조회 시 403 + FORBIDDEN', async () => {
    server.use(
      httpMsw.post(
        'http://localhost:3000/api/hr/attendance/team/9/stats',
        () => HttpResponse.json(fail('FORBIDDEN', '권한 없음'), { status: 403 }),
      ),
    );
    const err = await statsApi
      .team(9, { period: 'week', date: '2026-05-25' })
      .catch((e: unknown) => e);
    expect(err).toBeInstanceOf(ApiError);
    expect((err as ApiError).status).toBe(403);
    expect((err as ApiError).errorCode).toBe('FORBIDDEN');
  });
});

describe('statsApi.all', () => {
  afterEach(() => server.resetHandlers());

  it('정상 응답', async () => {
    server.use(
      httpMsw.post(
        'http://localhost:3000/api/hr/attendance/all/stats',
        () => HttpResponse.json(ok(sampleResponse)),
      ),
    );
    const r = await statsApi.all({ period: 'month', date: '2026-05-01' });
    expect(r.period).toBe('week'); // sampleResponse is 'week' — just checking shape
  });

  it('일반 직원 호출 시 403', async () => {
    server.use(
      httpMsw.post(
        'http://localhost:3000/api/hr/attendance/all/stats',
        () => HttpResponse.json(fail('FORBIDDEN'), { status: 403 }),
      ),
    );
    const err = await statsApi
      .all({ period: 'week', date: '2026-05-25' })
      .catch((e: unknown) => e);
    expect(err).toBeInstanceOf(ApiError);
    expect((err as ApiError).status).toBe(403);
  });
});
