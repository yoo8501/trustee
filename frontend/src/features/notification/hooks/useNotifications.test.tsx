import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, renderHook, waitFor } from '@testing-library/react';
import { http as httpMsw, HttpResponse } from 'msw';
import type { ReactNode } from 'react';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { ApiResult } from '../../../lib/api';
import { tokenStorage } from '../../../lib/auth';
import { server } from '../../../test/msw-server';
import type { Notification } from '../schemas';
import { useNotifications } from './useNotifications';
import { useReadAll } from './useReadAll';
import { useReadNotification } from './useReadNotification';

function ok<T>(d: T): ApiResult<T> {
  return { success: true, data: d, message: 'ok', details: null, total: null };
}

function makeWrapper() {
  const qc = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  const Wrapper = ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={qc}>{children}</QueryClientProvider>
  );
  return { qc, Wrapper };
}

const sample: Notification = {
  id: 1,
  type: 'leave_submitted',
  title: '결재 요청',
  body: '연차 8h',
  relatedUrl: '/leave/approvals',
  readAt: null,
  createdAt: '2026-05-25T10:00:00+09:00',
};

describe('useNotifications', () => {
  beforeEach(() => tokenStorage.set('A', 'R'));
  afterEach(() => {
    server.resetHandlers();
    tokenStorage.clear();
  });

  it('성공 → data 반환', async () => {
    server.use(
      httpMsw.post('http://localhost:3000/api/hr/notifications/list', () =>
        HttpResponse.json(ok([sample])),
      ),
    );
    const { Wrapper } = makeWrapper();
    const { result } = renderHook(() => useNotifications(), {
      wrapper: Wrapper,
    });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data).toHaveLength(1);
  });
});

describe('useReadNotification — 옵티미스틱', () => {
  beforeEach(() => tokenStorage.set('A', 'R'));
  afterEach(() => {
    server.resetHandlers();
    tokenStorage.clear();
  });

  it('성공 — read_at 옵티미스틱 채워진 뒤 invalidate', async () => {
    let listCalls = 0;
    server.use(
      httpMsw.post('http://localhost:3000/api/hr/notifications/list', () => {
        listCalls++;
        // 1차 (초기 load) 는 unread, 2차 (read 후 refetch) 는 read 처리된 응답
        if (listCalls === 1) return HttpResponse.json(ok([sample]));
        return HttpResponse.json(
          ok([{ ...sample, readAt: '2026-05-25T10:01:00+09:00' }]),
        );
      }),
      httpMsw.post(
        'http://localhost:3000/api/hr/notifications/1/read',
        () => HttpResponse.json(ok(null)),
      ),
    );
    const { qc, Wrapper } = makeWrapper();
    const list = renderHook(() => useNotifications(), { wrapper: Wrapper });
    await waitFor(() => expect(list.result.current.isSuccess).toBe(true));

    const mut = renderHook(() => useReadNotification(), { wrapper: Wrapper });
    await act(async () => {
      await mut.result.current.mutateAsync(1);
    });

    // 옵티미스틱 + 서버 재조회 후 모두 read_at 채워짐
    await waitFor(() => {
      const cached = qc.getQueryData<Notification[]>(['notifications', 'list']);
      expect(cached?.[0].readAt).not.toBeNull();
    });
  });

  it('실패 — 캐시 원복 (rollback)', async () => {
    server.use(
      httpMsw.post('http://localhost:3000/api/hr/notifications/list', () =>
        HttpResponse.json(ok([sample])),
      ),
      httpMsw.post(
        'http://localhost:3000/api/hr/notifications/1/read',
        () =>
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
    const { qc, Wrapper } = makeWrapper();
    const list = renderHook(() => useNotifications(), { wrapper: Wrapper });
    await waitFor(() => expect(list.result.current.isSuccess).toBe(true));

    const mut = renderHook(() => useReadNotification(), { wrapper: Wrapper });
    await act(async () => {
      await mut.result.current.mutateAsync(1).catch(() => undefined);
    });

    const cached = qc.getQueryData<Notification[]>(['notifications', 'list']);
    expect(cached?.[0].readAt).toBeNull();
  });
});

describe('useReadAll — 옵티미스틱 전체', () => {
  beforeEach(() => tokenStorage.set('A', 'R'));
  afterEach(() => {
    server.resetHandlers();
    tokenStorage.clear();
  });

  it('성공 — 모든 미읽음 read_at 채워짐', async () => {
    let listCalls = 0;
    server.use(
      httpMsw.post('http://localhost:3000/api/hr/notifications/list', () => {
        listCalls++;
        if (listCalls === 1)
          return HttpResponse.json(ok([sample, { ...sample, id: 2 }]));
        const now = '2026-05-25T10:02:00+09:00';
        return HttpResponse.json(
          ok([
            { ...sample, readAt: now },
            { ...sample, id: 2, readAt: now },
          ]),
        );
      }),
      httpMsw.post(
        'http://localhost:3000/api/hr/notifications/read-all',
        () => HttpResponse.json(ok(null)),
      ),
    );
    const { qc, Wrapper } = makeWrapper();
    const list = renderHook(() => useNotifications(), { wrapper: Wrapper });
    await waitFor(() => expect(list.result.current.isSuccess).toBe(true));

    const mut = renderHook(() => useReadAll(), { wrapper: Wrapper });
    await act(async () => {
      await mut.result.current.mutateAsync();
    });
    await waitFor(() => {
      const cached = qc.getQueryData<Notification[]>(['notifications', 'list']);
      expect(cached?.every((n) => n.readAt !== null)).toBe(true);
    });
  });
});
