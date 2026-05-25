import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { renderHook, waitFor } from '@testing-library/react';
import { http as httpMsw, HttpResponse } from 'msw';
import type { ReactNode } from 'react';
import { afterEach, describe, expect, it } from 'vitest';
import { type ApiResult } from '../../../lib/api';
import { server } from '../../../test/msw-server';
import { useUsersList } from './useUsersList';

function ok<T>(d: T, total: number | null = null): ApiResult<T> {
  return { success: true, data: d, message: 'ok', details: null, total };
}

function wrap(): React.FC<{ children: ReactNode }> {
  const qc = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  return ({ children }) => (
    <QueryClientProvider client={qc}>{children}</QueryClientProvider>
  );
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

describe('useUsersList', () => {
  afterEach(() => server.resetHandlers());

  it('정상 응답 → items + total', async () => {
    server.use(
      httpMsw.post('http://localhost:3000/api/users/list', () =>
        HttpResponse.json(ok([sampleUser], 1)),
      ),
    );
    const { result } = renderHook(() => useUsersList(), { wrapper: wrap() });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data?.items[0].email).toBe('a@b.com');
    expect(result.current.data?.total).toBe(1);
  });

  it('500 → isError', async () => {
    server.use(
      httpMsw.post('http://localhost:3000/api/users/list', () =>
        HttpResponse.json(
          {
            success: false,
            data: null,
            message: 'err',
            details: { errorCode: 'INTERNAL_ERROR' },
            total: null,
          },
          { status: 500 },
        ),
      ),
    );
    // 훅 내부 retry:1 + 1초 backoff → waitFor timeout 을 넉넉히 (3s)
    const { result } = renderHook(() => useUsersList(), { wrapper: wrap() });
    await waitFor(() => expect(result.current.isError).toBe(true), {
      timeout: 3000,
    });
  });
});
