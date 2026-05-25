import { http as httpMsw, HttpResponse } from 'msw';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { ApiResult } from '../../../lib/api';
import { tokenStorage } from '../../../lib/auth';
import { server } from '../../../test/msw-server';
import { calendarApi } from './client';

function ok<T>(d: T): ApiResult<T> {
  return { success: true, data: d, message: 'ok', details: null, total: null };
}

const sampleResp = {
  leaves: [
    {
      id: 1,
      requesterId: 10,
      requesterName: '홍길동',
      leaveTypeCode: 'annual',
      leaveTypeName: '연차',
      startAt: '2026-05-25T00:00:00+09:00',
      endAt: '2026-05-25T23:59:59+09:00',
      status: 'approved' as const,
      reason: null,
    },
  ],
  holidays: [{ date: '2026-05-25', name: '부처님오신날 대체공휴일' }],
  attendances: [
    {
      workDate: '2026-05-24',
      checkInAt: '2026-05-24T09:00:00+09:00',
      checkOutAt: '2026-05-24T18:05:00+09:00',
      status: 'normal',
    },
  ],
};

describe('calendarApi', () => {
  beforeEach(() => tokenStorage.set('A', 'R'));
  afterEach(() => {
    server.resetHandlers();
    tokenStorage.clear();
  });

  it('list — 성공 응답 파싱', async () => {
    let received: { from: string; to: string } | null = null;
    server.use(
      httpMsw.post(
        'http://localhost:3000/api/hr/calendar/list',
        async ({ request }) => {
          received = (await request.json()) as { from: string; to: string };
          return HttpResponse.json(ok(sampleResp));
        },
      ),
    );

    const r = await calendarApi.list({
      from: '2026-05-01',
      to: '2026-05-31',
      scope: 'all',
    });

    expect(received).not.toBeNull();
    expect(received!.from).toBe('2026-05-01');
    expect(r.leaves[0].leaveTypeCode).toBe('annual');
    expect(r.holidays[0].name).toBe('부처님오신날 대체공휴일');
    expect(r.attendances[0].status).toBe('normal');
  });

  it('list — DATE_RANGE_TOO_LARGE 400 → ApiError', async () => {
    server.use(
      httpMsw.post('http://localhost:3000/api/hr/calendar/list', () =>
        HttpResponse.json(
          {
            success: false,
            data: null,
            message: '기간이 너무 길어요',
            details: { errorCode: 'DATE_RANGE_TOO_LARGE' },
            total: null,
          },
          { status: 400 },
        ),
      ),
    );
    await expect(
      calendarApi.list({ from: '2026-01-01', to: '2026-12-31' }),
    ).rejects.toMatchObject({
      errorCode: 'DATE_RANGE_TOO_LARGE',
      status: 400,
    });
  });

  it('list — 응답 shape 불일치 → INVALID_RESPONSE', async () => {
    server.use(
      httpMsw.post('http://localhost:3000/api/hr/calendar/list', () =>
        HttpResponse.json(ok({ leaves: 'oops' })),
      ),
    );
    await expect(
      calendarApi.list({ from: '2026-05-01', to: '2026-05-31' }),
    ).rejects.toMatchObject({ errorCode: 'INVALID_RESPONSE' });
  });

  it('list — reason null 보존 (권한 없을 때 BE 마스킹)', async () => {
    server.use(
      httpMsw.post('http://localhost:3000/api/hr/calendar/list', () =>
        HttpResponse.json(
          ok({
            leaves: [
              {
                id: 1,
                requesterId: 99,
                requesterName: '타팀원',
                leaveTypeCode: 'annual',
                leaveTypeName: '연차',
                startAt: '2026-05-25T00:00:00+09:00',
                endAt: '2026-05-25T23:59:59+09:00',
                status: 'approved' as const,
                reason: null,
              },
            ],
            holidays: [],
            attendances: [],
          }),
        ),
      ),
    );
    const r = await calendarApi.list({
      from: '2026-05-01',
      to: '2026-05-31',
    });
    expect(r.leaves[0].reason).toBeNull();
  });
});
