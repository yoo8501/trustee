import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { renderHook, waitFor } from '@testing-library/react';
import { http as httpMsw, HttpResponse } from 'msw';
import { I18nextProvider } from 'react-i18next';
import type { ReactNode } from 'react';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { ApiResult } from '../../../lib/api';
import { tokenStorage } from '../../../lib/auth';
import i18n from '../../../lib/i18n';
import { server } from '../../../test/msw-server';
import { useCancel } from './useCancel';

function ok<T>(d: T): ApiResult<T> {
  return { success: true, data: d, message: 'ok', details: null, total: null };
}

function wrap() {
  const qc = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  return ({ children }: { children: ReactNode }) => (
    <I18nextProvider i18n={i18n}>
      <QueryClientProvider client={qc}>{children}</QueryClientProvider>
    </I18nextProvider>
  );
}

const sample = {
  id: 1,
  requesterId: 10,
  leaveTypeId: 1,
  leaveTypeName: '연차',
  startAt: '2026-05-26T00:00:00+09:00',
  endAt: '2026-05-26T08:00:00+09:00',
  hours: 8,
  reason: null,
  status: 'cancelled',
  approverId: 5,
  approverName: null,
  decidedAt: null,
  decisionComment: null,
  createdAt: '2026-05-25T10:00:00+09:00',
};

describe('useCancel', () => {
  beforeEach(() => tokenStorage.set('access-1', 'refresh-1'));
  afterEach(() => {
    server.resetHandlers();
    tokenStorage.clear();
  });

  it('cancel 호출 → status cancelled', async () => {
    let calls = 0;
    server.use(
      httpMsw.post(
        'http://localhost:3000/api/hr/leave-requests/1/cancel',
        () => {
          calls++;
          return HttpResponse.json(ok(sample));
        },
      ),
    );

    const { result } = renderHook(() => useCancel(), { wrapper: wrap() });

    await result.current.mutateAsync(1);
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(calls).toBe(1);
  });

  it('APPROVAL_INVALID_STATE 409 → ApiError', async () => {
    server.use(
      httpMsw.post(
        'http://localhost:3000/api/hr/leave-requests/1/cancel',
        () =>
          HttpResponse.json(
            {
              success: false,
              data: null,
              message: 'invalid state',
              details: { errorCode: 'APPROVAL_INVALID_STATE' },
              total: null,
            },
            { status: 409 },
          ),
      ),
    );
    const { result } = renderHook(() => useCancel(), { wrapper: wrap() });
    await expect(result.current.mutateAsync(1)).rejects.toMatchObject({
      errorCode: 'APPROVAL_INVALID_STATE',
    });
  });
});
