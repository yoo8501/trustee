import { http as httpMsw, HttpResponse } from 'msw';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { ApiError, type ApiResult } from '../../../lib/api';
import { server } from '../../../test/msw-server';
import { adminApi } from './client';

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

const sampleUser = {
  id: 1,
  email: 'a@b.com',
  name: '홍길동',
  status: 'active',
  role: 'general',
  teamId: null,
  managerId: null,
  hireDate: '2026-01-01',
};

const sampleAuditRow = {
  id: 1,
  userId: 2,
  workDate: '2026-05-25',
  checkInAt: '2026-05-25T00:01:00Z',
  checkOutAt: null,
  lunchBreakMinutes: 60,
  source: 'button',
  clientIp: '10.0.0.1',
  userAgent: 'Mozilla/5.0',
  status: 'normal',
  createdAt: '2026-05-25T00:01:00Z',
};

describe('adminApi.listUsers', () => {
  beforeEach(() => window.localStorage.clear());
  afterEach(() => {
    server.resetHandlers();
    window.localStorage.clear();
  });

  it('정상 응답 → items + total', async () => {
    server.use(
      httpMsw.post('http://localhost:3000/api/users/list', () =>
        HttpResponse.json(ok([sampleUser], 1)),
      ),
    );
    const res = await adminApi.listUsers({ page: 1, size: 20 });
    expect(res.items).toHaveLength(1);
    expect(res.items[0].email).toBe('a@b.com');
    expect(res.total).toBe(1);
  });

  it('500 → ApiError', async () => {
    server.use(
      httpMsw.post('http://localhost:3000/api/users/list', () =>
        HttpResponse.json(fail('INTERNAL_ERROR'), { status: 500 }),
      ),
    );
    const err = await adminApi.listUsers().catch((e: unknown) => e);
    expect(err).toBeInstanceOf(ApiError);
    expect((err as ApiError).status).toBe(500);
  });
});

describe('adminApi.updateUser', () => {
  afterEach(() => server.resetHandlers());

  it('정상 응답 → AdminUser 반환', async () => {
    server.use(
      httpMsw.post('http://localhost:3000/api/users/update', () =>
        HttpResponse.json(ok({ ...sampleUser, role: 'team_lead' })),
      ),
    );
    const u = await adminApi.updateUser({ id: 1, role: 'team_lead' });
    expect(u.role).toBe('team_lead');
  });

  it('CANNOT_DEMOTE_SELF → ApiError + errorCode 매핑', async () => {
    server.use(
      httpMsw.post('http://localhost:3000/api/users/update', () =>
        HttpResponse.json(fail('CANNOT_DEMOTE_SELF'), { status: 400 }),
      ),
    );
    const err = await adminApi
      .updateUser({ id: 1, role: 'general' })
      .catch((e: unknown) => e);
    expect(err).toBeInstanceOf(ApiError);
    expect((err as ApiError).errorCode).toBe('CANNOT_DEMOTE_SELF');
  });
});

describe('adminApi.terminateUser', () => {
  afterEach(() => server.resetHandlers());

  it('정상 응답 → TerminateResponse', async () => {
    server.use(
      httpMsw.post('http://localhost:3000/api/users/terminate', () =>
        HttpResponse.json(
          ok({ id: 1, status: 'terminated', tokenVersion: 2 }),
        ),
      ),
    );
    const r = await adminApi.terminateUser({ userId: 1 });
    expect(r.status).toBe('terminated');
    expect(r.tokenVersion).toBe(2);
  });

  it('CANNOT_TERMINATE_SELF → ApiError', async () => {
    server.use(
      httpMsw.post('http://localhost:3000/api/users/terminate', () =>
        HttpResponse.json(fail('CANNOT_TERMINATE_SELF'), { status: 400 }),
      ),
    );
    const err = await adminApi
      .terminateUser({ userId: 1 })
      .catch((e: unknown) => e);
    expect(err).toBeInstanceOf(ApiError);
    expect((err as ApiError).errorCode).toBe('CANNOT_TERMINATE_SELF');
  });
});

describe('adminApi.listAttendanceAudit', () => {
  afterEach(() => server.resetHandlers());

  it('필터 + 페이지네이션 응답', async () => {
    let receivedBody: unknown;
    server.use(
      httpMsw.post(
        'http://localhost:3000/api/hr/audit/attendance/list',
        async ({ request }) => {
          receivedBody = await request.json();
          return HttpResponse.json(ok([sampleAuditRow], 1));
        },
      ),
    );
    const r = await adminApi.listAttendanceAudit({
      userId: 2,
      from: '2026-05-01',
      to: '2026-05-31',
      source: 'button',
      page: 1,
      size: 20,
    });
    expect(r.items).toHaveLength(1);
    expect(r.items[0].clientIp).toBe('10.0.0.1');
    expect(r.total).toBe(1);
    expect((receivedBody as { userId: number }).userId).toBe(2);
  });

  it('빈 결과 → items=[], total=0', async () => {
    server.use(
      httpMsw.post(
        'http://localhost:3000/api/hr/audit/attendance/list',
        () => HttpResponse.json(ok([], 0)),
      ),
    );
    const r = await adminApi.listAttendanceAudit();
    expect(r.items).toEqual([]);
    expect(r.total).toBe(0);
  });
});
