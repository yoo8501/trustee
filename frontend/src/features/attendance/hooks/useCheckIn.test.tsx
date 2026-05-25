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
import { useCheckIn } from './useCheckIn';

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

const serverRecord: AttendanceRecord = {
  id: 42,
  workDate: '2026-05-25',
  checkInAt: '2026-05-25T00:01:00Z', // 09:01 KST
  checkOutAt: null,
  status: 'normal',
  lunchBreakMinutes: 60,
};

describe('useCheckIn', () => {
  beforeEach(async () => {
    enqueueSpy.mockClear();
    await i18n.changeLanguage('ko');
  });
  afterEach(() => server.resetHandlers());

  it('mutate 직후 cache 가 optimistic 으로 즉시 갱신된다 (≤ 100ms)', async () => {
    // BE 가 응답을 매우 늦게 주는 시나리오
    server.use(
      httpMsw.post('http://localhost:3000/api/hr/attendance/check-in', async () => {
        await new Promise((r) => setTimeout(r, 200));
        return HttpResponse.json(ok(serverRecord), { status: 201 });
      }),
    );

    const qc = new QueryClient({
      defaultOptions: {
        queries: { retry: false },
        mutations: { retry: false },
      },
    });
    qc.setQueryData(attendanceKeys.today(), null);

    const { result } = renderHook(() => useCheckIn(), { wrapper: wrap(qc) });

    const before = Date.now();
    await act(async () => {
      result.current.mutate();
      // onMutate 가 동기적으로 cache 를 갱신하도록 다음 micro-task tick 까지 대기
      await Promise.resolve();
      await Promise.resolve();
    });
    const cached = qc.getQueryData<AttendanceRecord | null>(
      attendanceKeys.today(),
    );
    const elapsed = Date.now() - before;
    expect(cached).not.toBeNull();
    expect(cached?.checkInAt).not.toBeNull();
    expect(elapsed).toBeLessThan(100);

    // BE 응답 도착 후 실제 record 로 교체 + success toast
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    const after = qc.getQueryData<AttendanceRecord | null>(
      attendanceKeys.today(),
    );
    expect(after?.id).toBe(42);
    expect(enqueueSpy).toHaveBeenCalledWith(
      expect.stringContaining('출근'),
      expect.objectContaining({ variant: 'success' }),
    );
  });

  it('실패 시 1초 안에 이전 캐시로 원복 + warn toast', async () => {
    server.use(
      httpMsw.post('http://localhost:3000/api/hr/attendance/check-in', () =>
        HttpResponse.json(fail('INTERNAL_ERROR'), { status: 500 }),
      ),
    );

    const qc = new QueryClient({
      defaultOptions: {
        queries: { retry: false },
        mutations: { retry: false },
      },
    });
    qc.setQueryData(attendanceKeys.today(), null);

    const { result } = renderHook(() => useCheckIn(), { wrapper: wrap(qc) });

    const before = Date.now();
    await act(async () => {
      await result.current.mutateAsync().catch(() => undefined);
    });

    const cached = qc.getQueryData<AttendanceRecord | null>(
      attendanceKeys.today(),
    );
    expect(cached).toBeNull();
    expect(Date.now() - before).toBeLessThan(1000);
    expect(enqueueSpy).toHaveBeenCalledWith(
      expect.any(String),
      expect.objectContaining({ variant: 'warning' }),
    );
  });
});
