import { http as httpMsw, HttpResponse } from 'msw';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { ApiResult } from '../../../lib/api';
import { ApiError } from '../../../lib/api';
import { server } from '../../../test/msw-server';
import type { AttendanceRecord } from '../types';
import { attendanceApi } from './client';

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

const sampleRecord: AttendanceRecord = {
  id: 1,
  workDate: '2026-05-25',
  checkInAt: '2026-05-25T00:01:00Z',
  checkOutAt: null,
  status: 'normal',
  lunchBreakMinutes: 60,
};

describe('attendanceApi', () => {
  beforeEach(() => window.localStorage.clear());
  afterEach(() => {
    server.resetHandlers();
    window.localStorage.clear();
  });

  it('getToday — record 있을 때 AttendanceRecord 반환', async () => {
    server.use(
      httpMsw.post('http://localhost:3000/api/hr/attendance/me/today', () =>
        HttpResponse.json(ok({ record: sampleRecord })),
      ),
    );
    const r = await attendanceApi.getToday();
    expect(r).toEqual(sampleRecord);
  });

  it('getToday — record 없으면 null', async () => {
    server.use(
      httpMsw.post('http://localhost:3000/api/hr/attendance/me/today', () =>
        HttpResponse.json(ok({ record: null })),
      ),
    );
    const r = await attendanceApi.getToday();
    expect(r).toBeNull();
  });

  it('checkIn — 새 record 생성 → AttendanceRecord 반환', async () => {
    server.use(
      httpMsw.post('http://localhost:3000/api/hr/attendance/check-in', () =>
        HttpResponse.json(ok(sampleRecord), { status: 201 }),
      ),
    );
    const r = await attendanceApi.checkIn();
    expect(r).toEqual(sampleRecord);
  });

  it('checkIn — 같은 날 두 번째 호출은 첫 record 그대로 (200)', async () => {
    server.use(
      httpMsw.post('http://localhost:3000/api/hr/attendance/check-in', () =>
        HttpResponse.json(ok(sampleRecord), { status: 200 }),
      ),
    );
    const r = await attendanceApi.checkIn();
    expect(r.id).toBe(1);
    expect(r.checkInAt).toBe('2026-05-25T00:01:00Z');
  });

  it('checkOut — 정상 → checkOutAt 채워진 record 반환', async () => {
    const closed: AttendanceRecord = {
      ...sampleRecord,
      checkOutAt: '2026-05-25T09:00:00Z',
    };
    server.use(
      httpMsw.post('http://localhost:3000/api/hr/attendance/check-out', () =>
        HttpResponse.json(ok(closed)),
      ),
    );
    const r = await attendanceApi.checkOut();
    expect(r.checkOutAt).toBe('2026-05-25T09:00:00Z');
  });

  it('checkOut — 출근 안 했으면 ApiError errorCode=CHECK_IN_REQUIRED', async () => {
    server.use(
      httpMsw.post('http://localhost:3000/api/hr/attendance/check-out', () =>
        HttpResponse.json(fail('CHECK_IN_REQUIRED', '출근 먼저'), {
          status: 400,
        }),
      ),
    );
    const err = await attendanceApi
      .checkOut()
      .catch((e: unknown) => e);
    expect(err).toBeInstanceOf(ApiError);
    expect((err as ApiError).errorCode).toBe('CHECK_IN_REQUIRED');
    expect((err as ApiError).status).toBe(400);
  });

  it('checkIn — 5xx 는 ApiError 로 전파', async () => {
    server.use(
      httpMsw.post('http://localhost:3000/api/hr/attendance/check-in', () =>
        HttpResponse.json(fail('INTERNAL_ERROR'), { status: 500 }),
      ),
    );
    const err = await attendanceApi
      .checkIn()
      .catch((e: unknown) => e);
    expect(err).toBeInstanceOf(ApiError);
    expect((err as ApiError).status).toBe(500);
  });
});
