import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { renderHook, waitFor } from '@testing-library/react';
import { http as httpMsw, HttpResponse } from 'msw';
import type { ReactNode } from 'react';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { ApiResult } from '../../../lib/api';
import { tokenStorage } from '../../../lib/auth';
import { server } from '../../../test/msw-server';
import { useCalendar } from './useCalendar';

function ok<T>(d: T): ApiResult<T> {
  return { success: true, data: d, message: 'ok', details: null, total: null };
}

function wrap() {
  const qc = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  return ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={qc}>{children}</QueryClientProvider>
  );
}

describe('useCalendar', () => {
  beforeEach(() => tokenStorage.set('A', 'R'));
  afterEach(() => {
    server.resetHandlers();
    tokenStorage.clear();
  });

  it('성공 → data 반환', async () => {
    server.use(
      httpMsw.post('http://localhost:3000/api/hr/calendar/list', () =>
        HttpResponse.json(
          ok({
            leaves: [],
            holidays: [{ date: '2026-05-25', name: '대체공휴일' }],
            attendances: [],
          }),
        ),
      ),
    );
    const { result } = renderHook(
      () => useCalendar({ from: '2026-05-01', to: '2026-05-31' }),
      { wrapper: wrap() },
    );
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data?.holidays).toHaveLength(1);
  });

  it('enabled=false → 호출 안 함', async () => {
    let calls = 0;
    server.use(
      httpMsw.post('http://localhost:3000/api/hr/calendar/list', () => {
        calls++;
        return HttpResponse.json(
          ok({ leaves: [], holidays: [], attendances: [] }),
        );
      }),
    );
    renderHook(
      () =>
        useCalendar(
          { from: '2026-05-01', to: '2026-05-31' },
          { enabled: false },
        ),
      { wrapper: wrap() },
    );
    await new Promise((r) => setTimeout(r, 30));
    expect(calls).toBe(0);
  });

  it('DATE_RANGE_TOO_LARGE → isError', async () => {
    server.use(
      httpMsw.post('http://localhost:3000/api/hr/calendar/list', () =>
        HttpResponse.json(
          {
            success: false,
            data: null,
            message: 'too large',
            details: { errorCode: 'DATE_RANGE_TOO_LARGE' },
            total: null,
          },
          { status: 400 },
        ),
      ),
    );
    const { result } = renderHook(
      () => useCalendar({ from: '2025-01-01', to: '2026-12-31' }),
      { wrapper: wrap() },
    );
    await waitFor(() => expect(result.current.isError).toBe(true), {
      timeout: 5000,
    });
  });
});
