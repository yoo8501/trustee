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
import { draftStorage } from '../lib/draftStorage';
import { useCreateLeaveRequest } from './useCreateLeaveRequest';

function ok<T>(d: T): ApiResult<T> {
  return { success: true, data: d, message: 'ok', details: null, total: null };
}

function wrap() {
  const qc = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  return {
    Wrapper: ({ children }: { children: ReactNode }) => (
      <I18nextProvider i18n={i18n}>
        <QueryClientProvider client={qc}>{children}</QueryClientProvider>
      </I18nextProvider>
    ),
    qc,
  };
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
  status: 'pending',
  approverId: 5,
  approverName: '김민지',
  decidedAt: null,
  decisionComment: null,
  createdAt: '2026-05-25T10:00:00+09:00',
};

describe('useCreateLeaveRequest', () => {
  beforeEach(() => {
    tokenStorage.set('access-1', 'refresh-1');
    window.localStorage.removeItem('docflow.leave-request.draft');
  });
  afterEach(() => {
    server.resetHandlers();
    tokenStorage.clear();
    window.localStorage.removeItem('docflow.leave-request.draft');
  });

  it('성공 → draft 클리어 + mine invalidated', async () => {
    server.use(
      httpMsw.post('http://localhost:3000/api/hr/leave-requests', () =>
        HttpResponse.json(ok(sample)),
      ),
    );
    draftStorage.save({ hours: 8 });
    const { Wrapper } = wrap();

    const { result } = renderHook(() => useCreateLeaveRequest(), {
      wrapper: Wrapper,
    });

    await result.current.mutateAsync({
      leaveTypeId: 1,
      startAt: sample.startAt,
      endAt: sample.endAt,
      hours: 8,
    });

    await waitFor(() => {
      expect(draftStorage.load()).toBeNull();
    });
    expect(result.current.isSuccess).toBe(true);
  });

  it('INSUFFICIENT_LEAVE_BALANCE → ApiError 전달', async () => {
    server.use(
      httpMsw.post('http://localhost:3000/api/hr/leave-requests', () =>
        HttpResponse.json(
          {
            success: false,
            data: null,
            message: 'shortfall',
            details: {
              errorCode: 'INSUFFICIENT_LEAVE_BALANCE',
              shortfallHours: 0.5,
            },
            total: null,
          },
          { status: 400 },
        ),
      ),
    );
    const { Wrapper } = wrap();
    const { result } = renderHook(() => useCreateLeaveRequest(), {
      wrapper: Wrapper,
    });

    await expect(
      result.current.mutateAsync({
        leaveTypeId: 1,
        startAt: sample.startAt,
        endAt: sample.endAt,
        hours: 8,
      }),
    ).rejects.toMatchObject({ errorCode: 'INSUFFICIENT_LEAVE_BALANCE' });
  });
});
