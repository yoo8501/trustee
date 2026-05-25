import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { http as httpMsw, HttpResponse } from 'msw';
import { SnackbarProvider } from 'notistack';
import { I18nextProvider } from 'react-i18next';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { ApiResult } from '../../../lib/api';
import { tokenStorage } from '../../../lib/auth';
import i18n from '../../../lib/i18n';
import { server } from '../../../test/msw-server';
import type { LeaveRequest } from '../schemas';
import { LeaveRequestCard } from './LeaveRequestCard';

function envelope<T>(data: T): ApiResult<T> {
  return { success: true, data, message: 'ok', details: null, total: null };
}

const pendingReq: LeaveRequest = {
  id: 7,
  requesterId: 10,
  leaveTypeId: 1,
  leaveTypeName: '연차',
  startAt: '2026-05-27T09:00:00+09:00',
  endAt: '2026-05-27T18:00:00+09:00',
  hours: 8,
  reason: null,
  status: 'pending',
  approverId: 5,
  approverName: '김민지',
  decidedAt: null,
  decisionComment: null,
  createdAt: '2026-05-25T10:00:00+09:00',
};

function renderCard(req: LeaveRequest) {
  const qc = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  return {
    qc,
    ...render(
      <I18nextProvider i18n={i18n}>
        <QueryClientProvider client={qc}>
          <SnackbarProvider maxSnack={3}>
            <LeaveRequestCard request={req} />
          </SnackbarProvider>
        </QueryClientProvider>
      </I18nextProvider>,
    ),
  };
}

describe('LeaveRequestCard', () => {
  beforeEach(async () => {
    tokenStorage.set('access-1', 'refresh-1');
    await i18n.changeLanguage('ko');
  });
  afterEach(() => {
    server.resetHandlers();
    tokenStorage.clear();
    vi.useRealTimers();
  });

  it('pending 상태 → 휴가종류/시간/상태칩 + 취소 버튼 표시', () => {
    renderCard(pendingReq);
    expect(screen.getByText('연차')).toBeInTheDocument();
    expect(screen.getByTestId('leave-status-chip-pending')).toBeInTheDocument();
    expect(screen.getByTestId('leave-request-cancel-7')).toBeInTheDocument();
  });

  it('approved 상태 → 취소 버튼 없음', () => {
    renderCard({ ...pendingReq, status: 'approved' });
    expect(screen.queryByTestId('leave-request-cancel-7')).toBeNull();
  });

  it('취소 클릭 → 5초 Undo snackbar 노출, 5초 이후 cancel API 호출', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    let cancelCalls = 0;
    server.use(
      httpMsw.post(
        'http://localhost:3000/api/hr/leave-requests/7/cancel',
        () => {
          cancelCalls += 1;
          return HttpResponse.json(
            envelope({ ...pendingReq, status: 'cancelled' }),
          );
        },
      ),
    );

    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
    renderCard(pendingReq);

    await user.click(screen.getByTestId('leave-request-cancel-7'));

    // Undo snackbar 노출 확인
    await waitFor(() =>
      expect(
        screen.getByText(/5초 안 되돌리기/),
      ).toBeInTheDocument(),
    );

    // 아직 호출 안 됨
    expect(cancelCalls).toBe(0);

    // 5초 경과
    vi.advanceTimersByTime(5500);
    await waitFor(() => expect(cancelCalls).toBe(1));
  });

  it('취소 클릭 후 5초 안 Undo → cancel API 호출 안 됨', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    let cancelCalls = 0;
    server.use(
      httpMsw.post(
        'http://localhost:3000/api/hr/leave-requests/7/cancel',
        () => {
          cancelCalls += 1;
          return HttpResponse.json(
            envelope({ ...pendingReq, status: 'cancelled' }),
          );
        },
      ),
    );

    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
    renderCard(pendingReq);

    await user.click(screen.getByTestId('leave-request-cancel-7'));
    await waitFor(() =>
      expect(screen.getByTestId('undoable-undo-button')).toBeInTheDocument(),
    );

    await user.click(screen.getByTestId('undoable-undo-button'));

    vi.advanceTimersByTime(6000);
    await Promise.resolve();
    expect(cancelCalls).toBe(0);
  });
});
