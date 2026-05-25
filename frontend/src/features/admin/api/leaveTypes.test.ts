import { http as httpMsw, HttpResponse } from 'msw';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { ApiError, type ApiResult } from '../../../lib/api';
import { server } from '../../../test/msw-server';
import { leaveBalancesApi, leaveTypesApi } from './leaveTypes';

function ok<T>(d: T, total?: number): ApiResult<T> {
  return {
    success: true,
    data: d,
    message: 'ok',
    details: null,
    total: total ?? null,
  };
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

const sampleLeaveType = {
  id: 1,
  code: 'annual',
  name: '연차',
  defaultHours: 8,
  accrualPolicy: {
    type: 'annual_hire_anniversary',
    base_days: 15,
    tenure_cap_days: 25,
  },
  isPaid: true,
  isActive: true,
};

describe('leaveTypesApi', () => {
  beforeEach(() => window.localStorage.clear());
  afterEach(() => {
    server.resetHandlers();
    window.localStorage.clear();
  });

  it('list — items + total', async () => {
    server.use(
      httpMsw.post('http://localhost:3000/api/hr/leave-types/list', () =>
        HttpResponse.json(ok([sampleLeaveType], 1)),
      ),
    );
    const r = await leaveTypesApi.list();
    expect(r.items).toHaveLength(1);
    expect(r.items[0].code).toBe('annual');
    expect(r.total).toBe(1);
  });

  it('create — LeaveType 반환', async () => {
    server.use(
      httpMsw.post('http://localhost:3000/api/hr/leave-types', () =>
        HttpResponse.json(ok(sampleLeaveType), { status: 201 }),
      ),
    );
    const lt = await leaveTypesApi.create({
      code: 'annual',
      name: '연차',
      defaultHours: 8,
      accrualPolicy: {
        type: 'annual_hire_anniversary',
        base_days: 15,
        tenure_cap_days: 25,
      },
    });
    expect(lt.id).toBe(1);
  });

  it('create — INVALID_ACCRUAL_POLICY → ApiError', async () => {
    server.use(
      httpMsw.post('http://localhost:3000/api/hr/leave-types', () =>
        HttpResponse.json(fail('INVALID_ACCRUAL_POLICY'), { status: 400 }),
      ),
    );
    const err = await leaveTypesApi
      .create({
        code: 'x',
        name: 'y',
        defaultHours: 8,
        accrualPolicy: { type: 'fixed' },
      })
      .catch((e: unknown) => e);
    expect(err).toBeInstanceOf(ApiError);
    expect((err as ApiError).errorCode).toBe('INVALID_ACCRUAL_POLICY');
  });

  it('update — LeaveType 반환', async () => {
    server.use(
      httpMsw.post('http://localhost:3000/api/hr/leave-types/update', () =>
        HttpResponse.json(ok({ ...sampleLeaveType, name: '연차(개정)' })),
      ),
    );
    const lt = await leaveTypesApi.update({ id: 1, name: '연차(개정)' });
    expect(lt.name).toBe('연차(개정)');
  });

  it('delete — status ok', async () => {
    server.use(
      httpMsw.post('http://localhost:3000/api/hr/leave-types/delete', () =>
        HttpResponse.json(ok({ status: 'ok' })),
      ),
    );
    const r = await leaveTypesApi.delete(1);
    expect(r.status).toBe('ok');
  });
});

describe('leaveBalancesApi.adjust', () => {
  afterEach(() => server.resetHandlers());

  it('정상 → AdjustResponse', async () => {
    server.use(
      httpMsw.post(
        'http://localhost:3000/api/hr/leave-balances/2/adjust',
        async ({ request }) => {
          const body = (await request.json()) as { reason: string };
          expect(body.reason).toBe('특별 휴가 지급');
          return HttpResponse.json(
            ok({
              adjustmentId: 5,
              deltaHours: 8,
              balance: {
                id: 1,
                userId: 2,
                leaveTypeId: 1,
                periodYear: 2026,
                grantedHours: 120,
                usedHours: 0,
                remainingHours: 128,
              },
            }),
          );
        },
      ),
    );
    const r = await leaveBalancesApi.adjust({
      userId: 2,
      leaveTypeId: 1,
      deltaHours: 8,
      reason: '특별 휴가 지급',
    });
    expect(r.adjustmentId).toBe(5);
    expect(r.balance.remainingHours).toBe(128);
  });

  it('reason 빈칸 → 함수 호출 단계에서 Error', async () => {
    await expect(
      leaveBalancesApi.adjust({
        userId: 2,
        leaveTypeId: 1,
        deltaHours: 8,
        reason: '',
      }),
    ).rejects.toThrow(/validation/i);
  });

  it('BE CONFLICT (음수 결과) → ApiError', async () => {
    server.use(
      httpMsw.post(
        'http://localhost:3000/api/hr/leave-balances/2/adjust',
        () =>
          HttpResponse.json(fail('CONFLICT', '음수'), { status: 409 }),
      ),
    );
    const err = await leaveBalancesApi
      .adjust({
        userId: 2,
        leaveTypeId: 1,
        deltaHours: -100,
        reason: '회수',
      })
      .catch((e: unknown) => e);
    expect(err).toBeInstanceOf(ApiError);
    expect((err as ApiError).status).toBe(409);
  });
});
