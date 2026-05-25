import { http as httpMsw, HttpResponse } from 'msw';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { ApiResult } from '../../../lib/api';
import { tokenStorage } from '../../../lib/auth';
import { server } from '../../../test/msw-server';
import { notificationApi } from './client';

function ok<T>(d: T): ApiResult<T> {
  return { success: true, data: d, message: 'ok', details: null, total: null };
}

const sample = {
  id: 1,
  type: 'leave_submitted',
  title: '휴가 결재 요청',
  body: '홍길동 님 — 연차 8h',
  relatedUrl: '/leave/approvals',
  readAt: null,
  createdAt: '2026-05-25T10:00:00+09:00',
};

describe('notificationApi', () => {
  beforeEach(() => tokenStorage.set('A', 'R'));
  afterEach(() => {
    server.resetHandlers();
    tokenStorage.clear();
  });

  it('list — 목록 파싱', async () => {
    server.use(
      httpMsw.post(
        'http://localhost:3000/api/hr/notifications/list',
        () => HttpResponse.json(ok([sample, { ...sample, id: 2 }])),
      ),
    );
    const r = await notificationApi.list();
    expect(r).toHaveLength(2);
    expect(r[0].title).toBe('휴가 결재 요청');
    expect(r[0].relatedUrl).toBe('/leave/approvals');
  });

  it('list — 비어있어도 정상 (빈 배열)', async () => {
    server.use(
      httpMsw.post('http://localhost:3000/api/hr/notifications/list', () =>
        HttpResponse.json(ok([])),
      ),
    );
    const r = await notificationApi.list();
    expect(r).toEqual([]);
  });

  it('read — POST /:id/read', async () => {
    let called = false;
    server.use(
      httpMsw.post(
        'http://localhost:3000/api/hr/notifications/1/read',
        () => {
          called = true;
          return HttpResponse.json(ok(null));
        },
      ),
    );
    await notificationApi.read(1);
    expect(called).toBe(true);
  });

  it('readAll — POST /read-all', async () => {
    let called = false;
    server.use(
      httpMsw.post(
        'http://localhost:3000/api/hr/notifications/read-all',
        () => {
          called = true;
          return HttpResponse.json(ok(null));
        },
      ),
    );
    await notificationApi.readAll();
    expect(called).toBe(true);
  });

  it('list — 500 INTERNAL_ERROR → ApiError', async () => {
    server.use(
      httpMsw.post('http://localhost:3000/api/hr/notifications/list', () =>
        HttpResponse.json(
          {
            success: false,
            data: null,
            message: 'oops',
            details: { errorCode: 'INTERNAL_ERROR' },
            total: null,
          },
          { status: 500 },
        ),
      ),
    );
    await expect(notificationApi.list()).rejects.toMatchObject({
      errorCode: 'INTERNAL_ERROR',
    });
  });
});
