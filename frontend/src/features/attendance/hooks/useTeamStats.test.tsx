import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { renderHook, waitFor } from '@testing-library/react';
import { http as httpMsw, HttpResponse } from 'msw';
import { I18nextProvider } from 'react-i18next';
import { afterEach, describe, expect, it } from 'vitest';
import type { ReactNode } from 'react';
import type { ApiResult } from '../../../lib/api';
import { ApiError } from '../../../lib/api';
import i18n from '../../../lib/i18n';
import { server } from '../../../test/msw-server';
import { useTeamStats } from './useTeamStats';

function fail(code: string): ApiResult<null> {
  return {
    success: false,
    data: null,
    message: 'denied',
    details: { errorCode: code },
    total: null,
  };
}

function wrap(qc: QueryClient) {
  return ({ children }: { children: ReactNode }) => (
    <I18nextProvider i18n={i18n}>
      <QueryClientProvider client={qc}>{children}</QueryClientProvider>
    </I18nextProvider>
  );
}

describe('useTeamStats', () => {
  afterEach(() => server.resetHandlers());

  it('Critical Path 7 — 403 응답이 ApiError 로 isError 가 된다', async () => {
    server.use(
      httpMsw.post(
        'http://localhost:3000/api/hr/attendance/team/9/stats',
        () => HttpResponse.json(fail('FORBIDDEN'), { status: 403 }),
      ),
    );

    const qc = new QueryClient({
      defaultOptions: {
        queries: { retry: false },
        mutations: { retry: false },
      },
    });

    const { result } = renderHook(
      () => useTeamStats(9, { period: 'week', date: '2026-05-25' }),
      { wrapper: wrap(qc) },
    );

    await waitFor(() => expect(result.current.isError).toBe(true));
    expect(result.current.error).toBeInstanceOf(ApiError);
    expect((result.current.error as ApiError).status).toBe(403);
    expect((result.current.error as ApiError).errorCode).toBe('FORBIDDEN');
  });
});
