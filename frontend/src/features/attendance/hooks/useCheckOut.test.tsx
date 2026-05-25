import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, renderHook, waitFor } from '@testing-library/react';
import { http as httpMsw, HttpResponse } from 'msw';
import { SnackbarProvider } from 'notistack';
import { I18nextProvider } from 'react-i18next';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { ReactNode } from 'react';
import type { ApiResult } from '../../../lib/api';
import i18n from '../../../lib/i18n';
import { server } from '../../../test/msw-server';
import type { AttendanceRecord } from '../types';
import { attendanceKeys } from './keys';
import { useCheckOut } from './useCheckOut';

function ok<T>(d: T): ApiResult<T> {
  return { success: true, data: d, message: 'ok', details: null, total: null };
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

const enqueueSpy = vi.fn();
vi.mock('notistack', async () => {
  const actual =
    await vi.importActual<typeof import('notistack')>('notistack');
  return {
    ...actual,
    useSnackbar: () => ({
      enqueueSnackbar: enqueueSpy,
      closeSnackbar: vi.fn(),
    }),
  };
});

function wrap(qc: QueryClient) {
  return ({ children }: { children: ReactNode }) => (
    <I18nextProvider i18n={i18n}>
      <QueryClientProvider client={qc}>
        <SnackbarProvider>{children}</SnackbarProvider>
      </QueryClientProvider>
    </I18nextProvider>
  );
}

const checkedIn: AttendanceRecord = {
  id: 42,
  workDate: '2026-05-25',
  checkInAt: '2026-05-25T00:01:00Z',
  checkOutAt: null,
  status: 'normal',
  lunchBreakMinutes: 60,
};

const checkedOut: AttendanceRecord = {
  ...checkedIn,
  checkOutAt: '2026-05-25T09:30:00Z',
};

describe('useCheckOut', () => {
  beforeEach(async () => {
    enqueueSpy.mockClear();
    await i18n.changeLanguage('ko');
  });
  afterEach(() => server.resetHandlers());

  it('mutate 직후 cache 의 checkOutAt 이 즉시 채워진다', async () => {
    server.use(
      httpMsw.post('http://localhost:3000/api/hr/attendance/check-out', async () => {
        await new Promise((r) => setTimeout(r, 150));
        return HttpResponse.json(ok(checkedOut));
      }),
    );

    const qc = new QueryClient({
      defaultOptions: {
        queries: { retry: false },
        mutations: { retry: false },
      },
    });
    qc.setQueryData(attendanceKeys.today(), checkedIn);

    const { result } = renderHook(() => useCheckOut(), { wrapper: wrap(qc) });
    await act(async () => {
      result.current.mutate();
      await Promise.resolve();
      await Promise.resolve();
    });
    const cached = qc.getQueryData<AttendanceRecord | null>(
      attendanceKeys.today(),
    );
    expect(cached?.checkOutAt).not.toBeNull();

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(enqueueSpy).toHaveBeenCalledWith(
      expect.stringContaining('수고'),
      expect.objectContaining({ variant: 'success' }),
    );
  });

  it('CHECK_IN_REQUIRED 실패 → 원복 + warn toast (사유 i18n)', async () => {
    server.use(
      httpMsw.post('http://localhost:3000/api/hr/attendance/check-out', () =>
        HttpResponse.json(fail('CHECK_IN_REQUIRED', '출근 먼저'), {
          status: 400,
        }),
      ),
    );

    const qc = new QueryClient({
      defaultOptions: {
        queries: { retry: false },
        mutations: { retry: false },
      },
    });
    qc.setQueryData(attendanceKeys.today(), null);

    const { result } = renderHook(() => useCheckOut(), { wrapper: wrap(qc) });
    await act(async () => {
      await result.current.mutateAsync().catch(() => undefined);
    });
    const cached = qc.getQueryData<AttendanceRecord | null>(
      attendanceKeys.today(),
    );
    expect(cached).toBeNull();
    expect(enqueueSpy).toHaveBeenCalledWith(
      expect.stringContaining('출근 체크'),
      expect.objectContaining({ variant: 'warning' }),
    );
  });
});
