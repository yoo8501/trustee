import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { renderHook, waitFor } from '@testing-library/react';
import { http as httpMsw, HttpResponse } from 'msw';
import { SnackbarProvider } from 'notistack';
import { I18nextProvider } from 'react-i18next';
import type { ReactNode } from 'react';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { type ApiResult } from '../../../lib/api';
import i18n from '../../../lib/i18n';
import { server } from '../../../test/msw-server';
import { useTerminateUser } from './useTerminateUser';

function ok<T>(d: T): ApiResult<T> {
  return { success: true, data: d, message: 'ok', details: null, total: null };
}
function fail(code: string): ApiResult<null> {
  return {
    success: false,
    data: null,
    message: code,
    details: { errorCode: code },
    total: null,
  };
}

function wrap(): React.FC<{ children: ReactNode }> {
  const qc = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  return ({ children }) => (
    <I18nextProvider i18n={i18n}>
      <QueryClientProvider client={qc}>
        <SnackbarProvider>{children}</SnackbarProvider>
      </QueryClientProvider>
    </I18nextProvider>
  );
}

describe('useTerminateUser', () => {
  beforeEach(async () => {
    await i18n.changeLanguage('ko');
  });
  afterEach(() => server.resetHandlers());

  it('성공 → mutation status=success', async () => {
    server.use(
      httpMsw.post('http://localhost:3000/api/users/terminate', () =>
        HttpResponse.json(
          ok({ id: 2, status: 'terminated', tokenVersion: 2 }),
        ),
      ),
    );
    const { result } = renderHook(() => useTerminateUser(), {
      wrapper: wrap(),
    });
    result.current.mutate({ userId: 2, name: '홍길동' });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data?.tokenVersion).toBe(2);
  });

  it('CANNOT_TERMINATE_SELF → status=error + errorCode 매핑', async () => {
    server.use(
      httpMsw.post('http://localhost:3000/api/users/terminate', () =>
        HttpResponse.json(fail('CANNOT_TERMINATE_SELF'), { status: 400 }),
      ),
    );
    const { result } = renderHook(() => useTerminateUser(), {
      wrapper: wrap(),
    });
    result.current.mutate({ userId: 1, name: '본인' });
    await waitFor(() => expect(result.current.isError).toBe(true));
    expect(result.current.error?.errorCode).toBe('CANNOT_TERMINATE_SELF');
  });
});
