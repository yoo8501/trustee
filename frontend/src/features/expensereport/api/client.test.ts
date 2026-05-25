import { http as httpMsw, HttpResponse } from 'msw';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { ApiError, type ApiResult } from '../../../lib/api';
import { tokenStorage } from '../../../lib/auth';
import { server } from '../../../test/msw-server';
import { expenseReportApi } from './client';

function ok<T>(d: T, total: number | null = null): ApiResult<T> {
  return { success: true, data: d, message: 'ok', details: null, total };
}
function fail(
  errorCode: string,
  status: number,
  message = 'err',
  details: Record<string, unknown> = {},
): { envelope: ApiResult<null>; status: number } {
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
  requesterName: '홍길동',
  amountWon: 12000,
  vendor: '식당',
  purpose: '점심 식대',
  paidAt: '2026-05-25',
  attachmentUrl: null,
  attachmentMime: null,
  status: 'pending',
  approverId: 5,
  approverName: '김민지',
  decidedAt: null,
  decisionComment: null,
  createdAt: '2026-05-25T10:00:00+09:00',
};

describe('expenseReportApi', () => {
  beforeEach(() => {
    tokenStorage.set('access-1', 'refresh-1');
  });
  afterEach(() => {
    server.resetHandlers();
    tokenStorage.clear();
  });

  it('create — 성공 응답 파싱', async () => {
    server.use(
      httpMsw.post('http://localhost:3000/api/hr/expense-reports', () =>
        HttpResponse.json(ok(sample)),
      ),
    );
    const r = await expenseReportApi.create({
      amountWon: 12000,
      vendor: '식당',
      purpose: '점심 식대',
      paidAt: '2026-05-25',
    });
    expect(r.id).toBe(1);
    expect(r.status).toBe('pending');
    expect(r.amountWon).toBe(12000);
  });

  it('create — VALIDATION_FAILED 400 → ApiError', async () => {
    const f = fail('VALIDATION_FAILED', 400);
    server.use(
      httpMsw.post('http://localhost:3000/api/hr/expense-reports', () =>
        HttpResponse.json(f.envelope, { status: f.status }),
      ),
    );
    await expect(
      expenseReportApi.create({
        amountWon: 12000,
        vendor: '식당',
        purpose: '점심',
        paidAt: '2026-05-25',
      }),
    ).rejects.toBeInstanceOf(ApiError);
  });

  it('listMine — items + total 파싱', async () => {
    server.use(
      httpMsw.post(
        'http://localhost:3000/api/hr/expense-reports/me/list',
        () => HttpResponse.json(ok([sample, { ...sample, id: 2 }], 2)),
      ),
    );
    const r = await expenseReportApi.listMine({ page: 1, size: 10 });
    expect(r.items).toHaveLength(2);
    expect(r.total).toBe(2);
  });

  it('listPending — items + total 파싱', async () => {
    server.use(
      httpMsw.post(
        'http://localhost:3000/api/hr/expense-reports/pending/list',
        () => HttpResponse.json(ok([sample], 1)),
      ),
    );
    const r = await expenseReportApi.listPending();
    expect(r.items[0].status).toBe('pending');
    expect(r.total).toBe(1);
  });

  it('approve — 결재 완료 응답', async () => {
    server.use(
      httpMsw.post(
        'http://localhost:3000/api/hr/expense-reports/1/approve',
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
    const r = await expenseReportApi.approve(1);
    expect(r.status).toBe('approved');
  });

  it('approve — APPROVAL_INVALID_STATE 409 → ApiError', async () => {
    const f = fail('APPROVAL_INVALID_STATE', 409);
    server.use(
      httpMsw.post(
        'http://localhost:3000/api/hr/expense-reports/1/approve',
        () => HttpResponse.json(f.envelope, { status: f.status }),
      ),
    );
    await expect(expenseReportApi.approve(1)).rejects.toMatchObject({
      errorCode: 'APPROVAL_INVALID_STATE',
      status: 409,
    });
  });

  it('reject — reason body 전송', async () => {
    let received: { reason: string } | null = null;
    server.use(
      httpMsw.post(
        'http://localhost:3000/api/hr/expense-reports/1/reject',
        async ({ request }) => {
          received = (await request.json()) as { reason: string };
          return HttpResponse.json(
            ok({ ...sample, status: 'rejected', decisionComment: '영수증 누락' }),
          );
        },
      ),
    );
    await expenseReportApi.reject(1, '영수증 누락');
    expect(received).not.toBeNull();
    expect(received!.reason).toBe('영수증 누락');
  });

  it('cancel — 본인 취소', async () => {
    server.use(
      httpMsw.post(
        'http://localhost:3000/api/hr/expense-reports/1/cancel',
        () => HttpResponse.json(ok({ ...sample, status: 'cancelled' })),
      ),
    );
    const r = await expenseReportApi.cancel(1);
    expect(r.status).toBe('cancelled');
  });

  it('uploadAttachment — multipart 응답 파싱', async () => {
    server.use(
      httpMsw.post(
        'http://localhost:3000/api/hr/expense-reports/attachment',
        () =>
          HttpResponse.json(
            ok({
              attachmentUrl: '/uploads/abc.pdf',
              attachmentMime: 'application/pdf',
              sizeBytes: 5000,
            }),
          ),
      ),
    );
    const file = new File(['x'], 'r.pdf', { type: 'application/pdf' });
    const r = await expenseReportApi.uploadAttachment(file);
    expect(r.attachmentUrl).toBe('/uploads/abc.pdf');
    expect(r.attachmentMime).toBe('application/pdf');
  });

  it('uploadAttachment — FILE_TOO_LARGE 400 → ApiError', async () => {
    const f = fail('FILE_TOO_LARGE', 400);
    server.use(
      httpMsw.post(
        'http://localhost:3000/api/hr/expense-reports/attachment',
        () => HttpResponse.json(f.envelope, { status: f.status }),
      ),
    );
    const file = new File(['x'], 'big.pdf', { type: 'application/pdf' });
    await expect(
      expenseReportApi.uploadAttachment(file),
    ).rejects.toMatchObject({ errorCode: 'FILE_TOO_LARGE' });
  });
});
