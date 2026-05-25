/**
 * Critical Path 3 (FE 부분) — 휴가 신청 → /my 카드 노출 → 취소 (5초 Undo 대기) → cancel API 호출.
 *
 * 사양 (sprint-06 goal §FE Done When + UX §2):
 *  - 신청 폼 제출 시 200 응답을 받으면 /leave/my 로 이동한다.
 *  - /leave/my 에 새 신청이 pending 상태로 카드로 표시된다.
 *  - "취소" 버튼은 5초 Undo snackbar 를 띄우고, 사용자가 Undo 안 하면 5초 후 실제 cancel API 호출.
 *
 * 본 테스트는 라우터·queryClient·MSW 를 함께 mount 한 통합 테스트.
 */
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { http as httpMsw, HttpResponse } from 'msw';
import { SnackbarProvider } from 'notistack';
import { I18nextProvider } from 'react-i18next';
import { MemoryRouter, Route, Routes } from 'react-router';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { ApiResult } from '../../lib/api';
import { tokenStorage } from '../../lib/auth';
import i18n from '../../lib/i18n';
import { server } from '../../test/msw-server';
import { LeaveRequestForm } from './components/LeaveRequestForm';
import { LeaveMyPage } from '../../routes/leave/my';

function envelope<T>(data: T, total: number | null = null): ApiResult<T> {
  return { success: true, data, message: 'ok', details: null, total };
}

const LEAVE_TYPES = [
  {
    id: 1,
    code: 'annual',
    name: '연차',
    defaultHours: 8,
    accrualPolicy: { type: 'fixed', base_days: 15 },
    isPaid: true,
    isActive: true,
  },
];

const BALANCES = [
  {
    id: 100,
    userId: 10,
    leaveTypeId: 1,
    leaveTypeCode: 'annual',
    leaveTypeName: '연차',
    periodYear: 2026,
    grantedHours: 120,
    usedHours: 0,
    remainingHours: 120,
    expiresAt: null,
  },
];

function renderApp() {
  const qc = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  return render(
    <I18nextProvider i18n={i18n}>
      <QueryClientProvider client={qc}>
        <SnackbarProvider maxSnack={3}>
          <MemoryRouter initialEntries={['/leave/new']}>
            <Routes>
              <Route path="/leave/new" element={<LeaveRequestForm />} />
              <Route path="/leave/my" element={<LeaveMyPage />} />
            </Routes>
          </MemoryRouter>
        </SnackbarProvider>
      </QueryClientProvider>
    </I18nextProvider>,
  );
}

describe('Critical Path 3 — 신청 → /my 카드 → 취소 (5초 Undo)', () => {
  beforeEach(async () => {
    tokenStorage.set('access-1', 'refresh-1');
    window.localStorage.removeItem('docflow.leave-request.draft');
    await i18n.changeLanguage('ko');
  });
  afterEach(() => {
    server.resetHandlers();
    tokenStorage.clear();
    window.localStorage.removeItem('docflow.leave-request.draft');
    vi.useRealTimers();
  });

  it('휴가 신청 → /leave/my 이동 → 카드 표시 → 취소 5초 대기 → cancel API 호출', async () => {
    let createCalls = 0;
    let cancelCalls = 0;
    let createdId = 0;
    const createdItems: unknown[] = [];

    server.use(
      httpMsw.post('http://localhost:3000/api/hr/leave-types/list', () =>
        HttpResponse.json(envelope(LEAVE_TYPES, LEAVE_TYPES.length)),
      ),
      httpMsw.post(
        'http://localhost:3000/api/hr/leave-balances/me/list',
        () => HttpResponse.json(envelope(BALANCES, BALANCES.length)),
      ),
      httpMsw.post(
        'http://localhost:3000/api/hr/leave-requests/me/list',
        () =>
          HttpResponse.json(envelope(createdItems, createdItems.length)),
      ),
      httpMsw.post(
        'http://localhost:3000/api/hr/leave-requests',
        async ({ request }) => {
          createCalls += 1;
          const body = (await request.json()) as {
            leaveTypeId: number;
            startAt: string;
            endAt: string;
            hours: number;
            reason?: string;
          };
          createdId = 999;
          const created = {
            id: createdId,
            requesterId: 10,
            leaveTypeId: body.leaveTypeId,
            leaveTypeName: '연차',
            startAt: body.startAt,
            endAt: body.endAt,
            hours: body.hours,
            reason: body.reason ?? null,
            status: 'pending',
            approverId: 5,
            approverName: '김민지',
            decidedAt: null,
            decisionComment: null,
            createdAt: '2026-05-25T10:00:00+09:00',
          };
          createdItems.push(created);
          return HttpResponse.json(envelope(created));
        },
      ),
      httpMsw.post(
        'http://localhost:3000/api/hr/leave-requests/999/cancel',
        () => {
          cancelCalls += 1;
          return HttpResponse.json(
            envelope({
              id: 999,
              requesterId: 10,
              leaveTypeId: 1,
              leaveTypeName: '연차',
              startAt: '',
              endAt: '',
              hours: 8,
              reason: null,
              status: 'cancelled',
              approverId: 5,
              approverName: '김민지',
              decidedAt: null,
              decisionComment: null,
              createdAt: '2026-05-25T10:00:00+09:00',
            }),
          );
        },
      ),
    );

    const user = userEvent.setup();
    renderApp();

    // 폼 로드 + submit 활성 대기
    await waitFor(() =>
      expect(screen.getByTestId('leave-type-option-annual')).toBeInTheDocument(),
    );
    await waitFor(() =>
      expect(screen.getByTestId('leave-form-submit')).toBeEnabled(),
    );

    await user.click(screen.getByTestId('leave-form-submit'));

    // /leave/my 로 이동 후 신청 카드 노출
    await waitFor(() => expect(createCalls).toBe(1));
    await waitFor(
      () =>
        expect(
          screen.getByTestId(`leave-request-card-${createdId}`),
        ).toBeInTheDocument(),
      { timeout: 3000 },
    );

    // 이제 fake timers 켜고 취소 → 5초 후 실제 호출 확인
    vi.useFakeTimers({ shouldAdvanceTime: true });
    const user2 = userEvent.setup({
      advanceTimers: vi.advanceTimersByTime,
    });
    await user2.click(
      screen.getByTestId(`leave-request-cancel-${createdId}`),
    );

    // snackbar 노출
    await waitFor(() =>
      expect(screen.getByText(/5초 안 되돌리기/)).toBeInTheDocument(),
    );
    expect(cancelCalls).toBe(0);

    // 5.5s 경과 → cancel API 호출
    vi.advanceTimersByTime(5500);
    await waitFor(() => expect(cancelCalls).toBe(1));
  });
});
