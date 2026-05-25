import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { http as httpMsw, HttpResponse } from 'msw';
import { SnackbarProvider } from 'notistack';
import { I18nextProvider } from 'react-i18next';
import { MemoryRouter, Route, Routes } from 'react-router';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { ApiResult } from '../../../lib/api';
import { tokenStorage } from '../../../lib/auth';
import i18n from '../../../lib/i18n';
import { server } from '../../../test/msw-server';
import { draftStorage } from '../lib/draftStorage';
import { LeaveRequestForm } from './LeaveRequestForm';

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
  {
    id: 2,
    code: 'half_am',
    name: '반차',
    defaultHours: 4,
    accrualPolicy: { type: 'fixed', base_days: 15 },
    isPaid: true,
    isActive: true,
  },
];

const BALANCES_FULL = [
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

const BALANCES_LOW = [
  {
    id: 100,
    userId: 10,
    leaveTypeId: 1,
    leaveTypeCode: 'annual',
    leaveTypeName: '연차',
    periodYear: 2026,
    grantedHours: 8,
    usedHours: 6,
    remainingHours: 2,
    expiresAt: null,
  },
];

function setupHandlers(opts: {
  balances?: typeof BALANCES_FULL;
  myItems?: unknown[];
  createResponse?: (body: unknown) => Response;
}) {
  const balances = opts.balances ?? BALANCES_FULL;
  const myItems = opts.myItems ?? [];

  server.use(
    httpMsw.post('http://localhost:3000/api/hr/leave-types/list', () =>
      HttpResponse.json(envelope(LEAVE_TYPES, LEAVE_TYPES.length)),
    ),
    httpMsw.post('http://localhost:3000/api/hr/leave-balances/me/list', () =>
      HttpResponse.json(envelope(balances, balances.length)),
    ),
    httpMsw.post('http://localhost:3000/api/hr/leave-requests/me/list', () =>
      HttpResponse.json(envelope(myItems, myItems.length)),
    ),
    httpMsw.post(
      'http://localhost:3000/api/hr/leave-requests',
      async ({ request }) => {
        const body = await request.json();
        if (opts.createResponse) {
          return opts.createResponse(body);
        }
        const b = body as {
          leaveTypeId: number;
          startAt: string;
          endAt: string;
          hours: number;
          reason?: string;
        };
        return HttpResponse.json(
          envelope({
            id: 999,
            requesterId: 10,
            leaveTypeId: b.leaveTypeId,
            leaveTypeName: '연차',
            startAt: b.startAt,
            endAt: b.endAt,
            hours: b.hours,
            reason: b.reason ?? null,
            status: 'pending',
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
}

function renderForm() {
  const qc = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  const navigateSpy = vi.fn();
  function NavCapture() {
    return null;
  }
  // useNavigate 는 MemoryRouter 내에서 동작. 실제 이동은 라우트로 캡처.
  return {
    qc,
    navigateSpy,
    ...render(
      <I18nextProvider i18n={i18n}>
        <QueryClientProvider client={qc}>
          <SnackbarProvider maxSnack={3}>
            <MemoryRouter initialEntries={['/leave/new']}>
              <Routes>
                <Route path="/leave/new" element={<LeaveRequestForm />} />
                <Route
                  path="/leave/my"
                  element={<div data-testid="leave-my-stub">my</div>}
                />
              </Routes>
              <NavCapture />
            </MemoryRouter>
          </SnackbarProvider>
        </QueryClientProvider>
      </I18nextProvider>,
    ),
  };
}

describe('LeaveRequestForm', () => {
  beforeEach(async () => {
    tokenStorage.set('access-1', 'refresh-1');
    window.localStorage.removeItem('docflow.leave-request.draft');
    await i18n.changeLanguage('ko');
  });
  afterEach(() => {
    server.resetHandlers();
    tokenStorage.clear();
    window.localStorage.removeItem('docflow.leave-request.draft');
  });

  it('활성 휴가 종류 로드 시 기본값으로 연차 + 8시간 노출', async () => {
    setupHandlers({});
    renderForm();
    await waitFor(() => {
      expect(screen.getByTestId('leave-type-option-annual')).toBeInTheDocument();
    });
    const hoursInput = screen.getByTestId('leave-form-hours').querySelector(
      'input',
    ) as HTMLInputElement;
    expect(Number(hoursInput.value)).toBe(8);
  });

  it('잔여 부족 → submit 비활성 + 부족 사유 inline 노출', async () => {
    setupHandlers({ balances: BALANCES_LOW });
    renderForm();

    // 사이드바 잔여 2시간 로드 대기
    await waitFor(() =>
      expect(screen.getByTestId('leave-balance-row-1')).toBeInTheDocument(),
    );

    // hours 기본값 8 > remaining 2 → blocked
    await waitFor(() => {
      const submit = screen.getByTestId('leave-form-submit');
      expect(submit).toBeDisabled();
    });
    const reason = screen.getByTestId('leave-form-blocked-reason');
    expect(reason.textContent).toMatch(/부족/);
  });

  it('중복 날짜 → submit 비활성 + 중복 사유 노출', async () => {
    // 기본 startAt 이 "다음 영업일 9시" 이므로, my list 의 기존 신청과 같은 날짜로 만들어서 중복 유발
    const range = (() => {
      // 다음 영업일 계산을 그대로 재현하긴 복잡 — 365일 윈도우 모두 cover 하는 방식으로 광범위 set
      const dates: string[] = [];
      const cursor = new Date();
      for (let i = 1; i <= 14; i++) {
        const d = new Date(cursor);
        d.setDate(d.getDate() + i);
        d.setHours(9, 0, 0, 0);
        dates.push(d.toISOString());
      }
      return dates;
    })();
    // 다음 영업일이 다음 14일 안에 있으므로 모두 신청해둔 것으로 시뮬레이트
    const myItems = range.map((iso, idx) => ({
      id: 100 + idx,
      requesterId: 10,
      leaveTypeId: 1,
      leaveTypeName: '연차',
      startAt: iso,
      endAt: iso.replace('T09:', 'T18:'),
      hours: 8,
      reason: null,
      status: 'approved',
      approverId: 5,
      approverName: '김민지',
      decidedAt: null,
      decisionComment: null,
      createdAt: '2026-05-20T10:00:00+09:00',
    }));
    setupHandlers({ myItems });
    renderForm();

    await waitFor(() =>
      expect(screen.getByTestId('leave-type-option-annual')).toBeInTheDocument(),
    );

    await waitFor(
      () => {
        const reason = screen.queryByTestId('leave-form-blocked-reason');
        expect(reason?.textContent ?? '').toMatch(/중복|날짜에 이미/);
      },
      { timeout: 2000 },
    );
  });

  it('Cmd+Enter 로 폼 제출 + 성공 후 draft 클리어', async () => {
    setupHandlers({});
    const user = userEvent.setup();
    renderForm();

    await waitFor(() =>
      expect(screen.getByTestId('leave-type-option-annual')).toBeInTheDocument(),
    );
    // submit 활성 대기
    await waitFor(() =>
      expect(screen.getByTestId('leave-form-submit')).toBeEnabled(),
    );

    // 사유 입력란에 포커스 후 Cmd+Enter — keydown 이 폼 onKeyDown 에 bubbling.
    const reasonField = screen
      .getByTestId('leave-form-reason')
      .querySelector('textarea') as HTMLTextAreaElement;
    reasonField.focus();
    await user.keyboard('{Meta>}{Enter}{/Meta}');

    // /leave/my 로 이동
    await waitFor(() =>
      expect(screen.getByTestId('leave-my-stub')).toBeInTheDocument(),
    );

    // draft 클리어 확인
    expect(draftStorage.load()).toBeNull();
  });

  it('INSUFFICIENT_LEAVE_BALANCE 서버 응답 → form error + server banner', async () => {
    setupHandlers({
      createResponse: () =>
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
    });
    const user = userEvent.setup();
    renderForm();
    await waitFor(() =>
      expect(screen.getByTestId('leave-type-option-annual')).toBeInTheDocument(),
    );
    await waitFor(() =>
      expect(screen.getByTestId('leave-form-submit')).toBeEnabled(),
    );

    await user.click(screen.getByTestId('leave-form-submit'));

    await waitFor(() =>
      expect(
        screen.getByTestId('leave-form-server-error'),
      ).toBeInTheDocument(),
    );
    expect(screen.getByTestId('leave-form-server-error').textContent).toMatch(
      /잔여/,
    );
  });
});
