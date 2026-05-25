import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { renderHook, waitFor } from '@testing-library/react';
import { http as httpMsw, HttpResponse } from 'msw';
import { I18nextProvider } from 'react-i18next';
import { afterEach, describe, expect, it } from 'vitest';
import type { ReactNode } from 'react';
import type { ApiResult } from '../../../lib/api';
import i18n from '../../../lib/i18n';
import { server } from '../../../test/msw-server';
import type { StatsResponse } from '../stats-types';
import { useMyStats } from './useMyStats';

function ok<T>(d: T): ApiResult<T> {
  return { success: true, data: d, message: 'ok', details: null, total: null };
}

const sample: StatsResponse = {
  period: 'week',
  from: '2026-05-25',
  to: '2026-05-31',
  records: [],
  summary: {
    totalActualMinutes: 0,
    totalOvertimeMinutes: 0,
    daysPresent: 0,
    daysLate: 0,
    daysEarlyLeave: 0,
    daysAutoClosed: 0,
    daysAbsent: 0,
    attendanceRate: 0,
    weeklyOvertimeMinutes: 0,
    weeklyTotalMinutes: 0,
  },
};

function wrap(qc: QueryClient) {
  return ({ children }: { children: ReactNode }) => (
    <I18nextProvider i18n={i18n}>
      <QueryClientProvider client={qc}>{children}</QueryClientProvider>
    </I18nextProvider>
  );
}

describe('useMyStats', () => {
  afterEach(() => server.resetHandlers());

  it('성공 → data 채워짐', async () => {
    server.use(
      httpMsw.post(
        'http://localhost:3000/api/hr/attendance/me/stats',
        () => HttpResponse.json(ok(sample)),
      ),
    );

    const qc = new QueryClient({
      defaultOptions: {
        queries: { retry: false },
        mutations: { retry: false },
      },
    });
    const { result } = renderHook(
      () => useMyStats({ period: 'week', date: '2026-05-25' }),
      { wrapper: wrap(qc) },
    );

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data?.period).toBe('week');
  });
});
