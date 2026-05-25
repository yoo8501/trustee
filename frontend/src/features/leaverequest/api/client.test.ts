import { http as httpMsw, HttpResponse } from 'msw';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { ApiError, type ApiResult } from '../../../lib/api';
import { tokenStorage } from '../../../lib/auth';
import { server } from '../../../test/msw-server';
import { leaveRequestApi } from './client';

function ok<T>(d: T, total: number | null = null): ApiResult<T> {
  return { success: true, data: d, message: 'ok', details: null, total };
}
function fail(errorCode: string, status: number, message = 'err', details: Record<string, unknown> = {}): {
  envelope: ApiResult<null>;
  status: number;
} {
  return {
    envelope: {
      success: false,
      data: null,
      message,
      details: { errorCode, ...details },
      total: null,
    },
    status,
  };
}

const sample = {
  id: 1,
  requesterId: 10,
  leaveTypeId: 1,
  leaveTypeName: '연차',
  startAt: '2026-05-26T00:00:00+09:00',
  endAt: '2026-05-26T08:00:00+09:00',
  hours: 8,
  reason: null,
  status: 'pending',
  approverId: 5,
  approverName: '김민지',
  decidedAt: null,
  decisionComment: null,
  createdAt: '2026-05-25T10:00:00+09:00',
};

describe('leaveRequestApi', () => {
  beforeEach(() => {
    tokenStorage.set('access-1', 'refresh-1');
  });
  afterEach(() => {
    server.resetHandlers();
    tokenStorage.clear();
  });

  it('create — 성공 응답 파싱', async () => {
    server.use(
      httpMsw.post('http://localhost:3000/api/hr/leave-requests', () =>
        HttpResponse.json(ok(sample)),
      ),
    );
    const r = await leaveRequestApi.create({
      leaveTypeId: 1,
      startAt: sample.startAt,
      endAt: sample.endAt,
      hours: 8,
    });
    expect(r.id).toBe(1);
    expect(r.status).toBe('pending');
    expect(r.approverName).toBe('김민지');
  });

  it('create — INSUFFICIENT_LEAVE_BALANCE 400 → ApiError', async () => {
    const f = fail('INSUFFICIENT_LEAVE_BALANCE', 400, 'shortfall', {
      shortfallHours: 0.5,
    });
    server.use(
      httpMsw.post('http://localhost:3000/api/hr/leave-requests', () =>
        HttpResponse.json(f.envelope, { status: f.status }),
      ),
    );
    await expect(
      leaveRequestApi.create({
        leaveTypeId: 1,
        startAt: sample.startAt,
        endAt: sample.endAt,
        hours: 8,
      }),
    ).rejects.toMatchObject({
      errorCode: 'INSUFFICIENT_LEAVE_BALANCE',
      status: 400,
    });
  });

  it('create — DUPLICATE_LEAVE_DATE 400 → ApiError', async () => {
    const f = fail('DUPLICATE_LEAVE_DATE', 400);
    server.use(
      httpMsw.post('http://localhost:3000/api/hr/leave-requests', () =>
        HttpResponse.json(f.envelope, { status: f.status }),
      ),
    );
    await expect(
      leaveRequestApi.create({
        leaveTypeId: 1,
        startAt: sample.startAt,
        endAt: sample.endAt,
        hours: 8,
      }),
    ).rejects.toBeInstanceOf(ApiError);
  });

  it('create — INVALID_DATE_RANGE 400 → ApiError', async () => {
    const f = fail('INVALID_DATE_RANGE', 400);
    server.use(
      httpMsw.post('http://localhost:3000/api/hr/leave-requests', () =>
        HttpResponse.json(f.envelope, { status: f.status }),
      ),
    );
    await expect(
      leaveRequestApi.create({
        leaveTypeId: 1,
        startAt: sample.startAt,
        endAt: sample.endAt,
        hours: 8,
      }),
    ).rejects.toMatchObject({ errorCode: 'INVALID_DATE_RANGE' });
  });

  it('listMine — items + total 파싱', async () => {
    server.use(
      httpMsw.post(
        'http://localhost:3000/api/hr/leave-requests/me/list',
        () => HttpResponse.json(ok([sample, { ...sample, id: 2 }], 2)),
      ),
    );
    const r = await leaveRequestApi.listMine({ page: 1, size: 10 });
    expect(r.items).toHaveLength(2);
    expect(r.total).toBe(2);
  });

  it('listPending — items + total 파싱', async () => {
    server.use(
      httpMsw.post(
        'http://localhost:3000/api/hr/leave-requests/pending/list',
        () => HttpResponse.json(ok([sample], 1)),
      ),
    );
    const r = await leaveRequestApi.listPending();
    expect(r.items[0].status).toBe('pending');
    expect(r.total).toBe(1);
  });

  it('approve — 결재 완료 응답', async () => {
    server.use(
      httpMsw.post(
        'http://localhost:3000/api/hr/leave-requests/1/approve',
        () =>
          HttpResponse.json(
            ok({
              ...sample,
              status: 'approved',
              decidedAt: '2026-05-25T11:00:00+09:00',
            }),
          ),
      ),
    );
    const r = await leaveRequestApi.approve(1);
    expect(r.status).toBe('approved');
    expect(r.decidedAt).not.toBeNull();
  });

  it('approve — APPROVAL_INVALID_STATE 409 → ApiError', async () => {
    const f = fail('APPROVAL_INVALID_STATE', 409);
    server.use(
      httpMsw.post(
        'http://localhost:3000/api/hr/leave-requests/1/approve',
        () => HttpResponse.json(f.envelope, { status: f.status }),
      ),
    );
    await expect(leaveRequestApi.approve(1)).rejects.toMatchObject({
      errorCode: 'APPROVAL_INVALID_STATE',
      status: 409,
    });
  });

  it('reject — reason body 전송', async () => {
    let received: { reason: string } | null = null;
    server.use(
      httpMsw.post(
        'http://localhost:3000/api/hr/leave-requests/1/reject',
        async ({ request }) => {
          received = (await request.json()) as { reason: string };
          return HttpResponse.json(
            ok({
              ...sample,
              status: 'rejected',
              decisionComment: '재검토 필요',
            }),
          );
        },
      ),
    );
    await leaveRequestApi.reject(1, '재검토 필요');
    expect(received).not.toBeNull();
    expect(received!.reason).toBe('재검토 필요');
  });

  it('cancel — 본인 취소', async () => {
    server.use(
      httpMsw.post(
        'http://localhost:3000/api/hr/leave-requests/1/cancel',
        () =>
          HttpResponse.json(
            ok({
              ...sample,
              status: 'cancelled',
            }),
          ),
      ),
    );
    const r = await leaveRequestApi.cancel(1);
    expect(r.status).toBe('cancelled');
  });

  it('listMyBalances — 잔여 목록', async () => {
    server.use(
      httpMsw.post(
        'http://localhost:3000/api/hr/leave-balances/me/list',
        () =>
          HttpResponse.json(
            ok([
              {
                id: 1,
                userId: 10,
                leaveTypeId: 1,
                leaveTypeCode: 'annual',
                leaveTypeName: '연차',
                periodYear: 2026,
                grantedHours: 120,
                usedHours: 16,
                remainingHours: 104,
              },
            ]),
          ),
      ),
    );
    const r = await leaveRequestApi.listMyBalances();
    expect(r).toHaveLength(1);
    expect(r[0].remainingHours).toBe(104);
  });
});
