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
import { expenseDraftStorage } from '../lib/draftStorage';
import { useCreateExpense } from './useCreateExpense';

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
  requesterName: '홍길동',
  amountWon: 12000,
  vendor: '식당',
  purpose: '점심',
  paidAt: '2026-05-25',
  attachmentUrl: null,
  attachmentMime: null,
  status: 'pending',
  approverId: 5,
  approverName: '김민지',
  decidedAt: null,
  decisionComment: null,
  createdAt: '2026-05-25T10:00:00+09:00',
};

describe('useCreateExpense', () => {
  beforeEach(() => {
    tokenStorage.set('access-1', 'refresh-1');
    window.localStorage.removeItem('docflow.expense-report.draft');
  });
  afterEach(() => {
    server.resetHandlers();
    tokenStorage.clear();
    window.localStorage.removeItem('docflow.expense-report.draft');
  });

  it('성공 → draft 클리어 + isSuccess', async () => {
    server.use(
      httpMsw.post('http://localhost:3000/api/hr/expense-reports', () =>
        HttpResponse.json(ok(sample)),
      ),
    );
    expenseDraftStorage.save({ amountWon: 12000 });
    const { Wrapper } = wrap();

    const { result } = renderHook(() => useCreateExpense(), {
      wrapper: Wrapper,
    });

    await result.current.mutateAsync({
      amountWon: 12000,
      vendor: '식당',
      purpose: '점심',
      paidAt: '2026-05-25',
    });

    await waitFor(() => expect(expenseDraftStorage.load()).toBeNull());
    expect(result.current.isSuccess).toBe(true);
  });

  it('VALIDATION_FAILED → ApiError 전달', async () => {
    server.use(
      httpMsw.post('http://localhost:3000/api/hr/expense-reports', () =>
        HttpResponse.json(
          {
            success: false,
            data: null,
            message: 'invalid',
            details: { errorCode: 'VALIDATION_FAILED' },
            total: null,
          },
          { status: 400 },
        ),
      ),
    );
    const { Wrapper } = wrap();
    const { result } = renderHook(() => useCreateExpense(), {
      wrapper: Wrapper,
    });

    await expect(
      result.current.mutateAsync({
        amountWon: 12000,
        vendor: '식당',
        purpose: '점심',
        paidAt: '2026-05-25',
      }),
    ).rejects.toMatchObject({ errorCode: 'VALIDATION_FAILED' });
  });
});
