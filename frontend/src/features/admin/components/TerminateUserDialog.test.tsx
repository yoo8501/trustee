import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { http as httpMsw, HttpResponse } from 'msw';
import { SnackbarProvider } from 'notistack';
import { I18nextProvider } from 'react-i18next';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { type ApiResult } from '../../../lib/api';
import i18n from '../../../lib/i18n';
import { server } from '../../../test/msw-server';
import { TerminateUserDialog } from './TerminateUserDialog';

function ok<T>(d: T): ApiResult<T> {
  return { success: true, data: d, message: 'ok', details: null, total: null };
}

function renderDialog(props: Parameters<typeof TerminateUserDialog>[0]) {
  const qc = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  return render(
    <I18nextProvider i18n={i18n}>
      <QueryClientProvider client={qc}>
        <SnackbarProvider>
          <TerminateUserDialog {...props} />
        </SnackbarProvider>
      </QueryClientProvider>
    </I18nextProvider>,
  );
}

describe('TerminateUserDialog', () => {
  beforeEach(async () => {
    await i18n.changeLanguage('ko');
  });
  afterEach(() => server.resetHandlers());

  it('open=false 일 때 렌더 안 됨', () => {
    renderDialog({ open: false, userId: 1, name: '홍길동', onClose: vi.fn() });
    expect(
      screen.queryByTestId('terminate-user-dialog'),
    ).not.toBeInTheDocument();
  });

  it('open=true → 확인 메시지 + name interpolation 표시', () => {
    renderDialog({ open: true, userId: 1, name: '홍길동', onClose: vi.fn() });
    expect(
      screen.getByText(/홍길동 님을 퇴사 처리합니다/),
    ).toBeInTheDocument();
  });

  it('취소 클릭 → onClose 호출 (BE 호출 없음)', async () => {
    const onClose = vi.fn();
    renderDialog({ open: true, userId: 1, name: '홍길동', onClose });
    const user = userEvent.setup();
    await user.click(screen.getByTestId('terminate-user-cancel'));
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('확인 1차 클릭 → BE 호출 → 성공 시 onClose (추가 confirm 없음)', async () => {
    const onClose = vi.fn();
    server.use(
      httpMsw.post('http://localhost:3000/api/users/terminate', () =>
        HttpResponse.json(
          ok({ id: 1, status: 'terminated', tokenVersion: 2 }),
        ),
      ),
    );
    renderDialog({ open: true, userId: 1, name: '홍길동', onClose });
    const user = userEvent.setup();
    await user.click(screen.getByTestId('terminate-user-confirm'));
    await waitFor(() => expect(onClose).toHaveBeenCalled());
  });
});
