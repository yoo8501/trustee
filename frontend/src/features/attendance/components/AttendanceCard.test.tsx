import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { http as httpMsw, HttpResponse } from 'msw';
import { SnackbarProvider } from 'notistack';
import { I18nextProvider } from 'react-i18next';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { ReactNode } from 'react';
import type { ApiResult } from '../../../lib/api';
import i18n from '../../../lib/i18n';
import { server } from '../../../test/msw-server';
import { attendanceKeys } from '../hooks';
import type { AttendanceRecord } from '../types';
import { AttendanceCard } from './AttendanceCard';

function ok<T>(d: T): ApiResult<T> {
  return { success: true, data: d, message: 'ok', details: null, total: null };
}

function createClient(initial: AttendanceRecord | null | undefined = null) {
  const qc = new QueryClient({
    defaultOptions: {
      queries: { retry: false, staleTime: Infinity },
      mutations: { retry: false },
    },
  });
  if (initial !== undefined) {
    qc.setQueryData(attendanceKeys.today(), initial);
  }
  return qc;
}

function wrap(qc: QueryClient) {
  return function Wrapper({ children }: { children: ReactNode }) {
    return (
      <I18nextProvider i18n={i18n}>
        <QueryClientProvider client={qc}>
          <SnackbarProvider>{children}</SnackbarProvider>
        </QueryClientProvider>
      </I18nextProvider>
    );
  };
}

const checkedInRecord: AttendanceRecord = {
  id: 1,
  workDate: '2026-05-25',
  checkInAt: '2026-05-25T00:01:00Z', // 09:01 KST
  checkOutAt: null,
  status: 'normal',
  lunchBreakMinutes: 60,
};

const checkedOutRecord: AttendanceRecord = {
  ...checkedInRecord,
  checkOutAt: '2026-05-25T09:30:00Z', // 18:30 KST
};

describe('AttendanceCard', () => {
  beforeEach(async () => {
    await i18n.changeLanguage('ko');
  });
  afterEach(() => server.resetHandlers());

  it('출근 전 (record=null) — 출근 활성, 퇴근 비활성 + hint', () => {
    const qc = createClient(null);
    const Wrapper = wrap(qc);
    render(
      <Wrapper>
        <AttendanceCard />
      </Wrapper>,
    );
    expect(screen.getByTestId('check-in-button')).toBeEnabled();
    expect(screen.getByTestId('check-out-button')).toBeDisabled();
    expect(screen.getByTestId('checkout-requirement-hint')).toHaveTextContent(
      '출근 체크',
    );
  });

  it('출근 중 (checkedIn 있음, checkOut 없음) — "출근 중" 배지 + 퇴근 활성', () => {
    const qc = createClient(checkedInRecord);
    const Wrapper = wrap(qc);
    render(
      <Wrapper>
        <AttendanceCard />
      </Wrapper>,
    );
    expect(screen.getByTestId('check-in-button')).toBeDisabled();
    expect(screen.getByTestId('check-out-button')).toBeEnabled();
    expect(screen.getByTestId('attendance-status-badge')).toHaveTextContent(
      '출근 중',
    );
    // hint 는 사라짐
    expect(
      screen.queryByTestId('checkout-requirement-hint'),
    ).not.toBeInTheDocument();
  });

  it('퇴근 완료 — 둘 다 비활성 + status 배지 (정상)', () => {
    const qc = createClient(checkedOutRecord);
    const Wrapper = wrap(qc);
    render(
      <Wrapper>
        <AttendanceCard />
      </Wrapper>,
    );
    expect(screen.getByTestId('check-in-button')).toBeDisabled();
    expect(screen.getByTestId('check-out-button')).toBeDisabled();
    expect(screen.getByTestId('attendance-status-badge')).toHaveTextContent(
      '정상',
    );
  });

  it('auto_closed 상태 → 경고 Alert 표시 (placeholder 알림)', () => {
    const qc = createClient({
      ...checkedInRecord,
      status: 'auto_closed',
    });
    const Wrapper = wrap(qc);
    render(
      <Wrapper>
        <AttendanceCard />
      </Wrapper>,
    );
    expect(screen.getByTestId('auto-closed-alert')).toHaveTextContent(
      /퇴근 체크가 누락/,
    );
  });

  it('loading 상태 — spinner 표시 (today fetch 진행 중)', async () => {
    // 캐시를 비우고 BE 응답 매우 지연
    server.use(
      httpMsw.post('http://localhost:3000/api/hr/attendance/me/today', async () => {
        await new Promise((r) => setTimeout(r, 500));
        return HttpResponse.json(ok({ record: null }));
      }),
    );
    const qc = new QueryClient({
      defaultOptions: {
        queries: { retry: false },
        mutations: { retry: false },
      },
    });
    const Wrapper = wrap(qc);
    render(
      <Wrapper>
        <AttendanceCard />
      </Wrapper>,
    );
    expect(screen.getByTestId('attendance-card-loading')).toBeInTheDocument();
    await waitFor(
      () =>
        expect(
          screen.queryByTestId('attendance-card-loading'),
        ).not.toBeInTheDocument(),
      { timeout: 1500 },
    );
  });

  it('키보드 Enter 로 출근 버튼 활성화 가능 (focus → Enter)', async () => {
    server.use(
      httpMsw.post('http://localhost:3000/api/hr/attendance/check-in', () =>
        HttpResponse.json(ok(checkedInRecord), { status: 201 }),
      ),
      // mutation 후 invalidateQueries 로 today refetch 가 일어남
      httpMsw.post('http://localhost:3000/api/hr/attendance/me/today', () =>
        HttpResponse.json(ok({ record: checkedInRecord })),
      ),
    );
    const qc = createClient(null);
    const Wrapper = wrap(qc);
    render(
      <Wrapper>
        <AttendanceCard />
      </Wrapper>,
    );
    const btn = screen.getByTestId('check-in-button');
    act(() => {
      btn.focus();
    });
    expect(btn).toHaveFocus();
    const user = userEvent.setup();
    await user.keyboard('{Enter}');
    // optimistic 으로 즉시 cache 가 바뀌어 버튼 비활성
    await waitFor(() => expect(btn).toBeDisabled());
  });

  it('키보드 Space 로 퇴근 버튼 활성화 가능', async () => {
    server.use(
      httpMsw.post('http://localhost:3000/api/hr/attendance/check-out', () =>
        HttpResponse.json(ok(checkedOutRecord)),
      ),
      httpMsw.post('http://localhost:3000/api/hr/attendance/me/today', () =>
        HttpResponse.json(ok({ record: checkedOutRecord })),
      ),
    );
    const qc = createClient(checkedInRecord);
    const Wrapper = wrap(qc);
    render(
      <Wrapper>
        <AttendanceCard />
      </Wrapper>,
    );
    const btn = screen.getByTestId('check-out-button');
    act(() => {
      btn.focus();
    });
    expect(btn).toHaveFocus();
    const user = userEvent.setup();
    await user.keyboard(' '); // Space
    await waitFor(() => expect(btn).toBeDisabled());
  });

  it('aria-label — 두 버튼 모두 가짐', () => {
    const qc = createClient(null);
    const Wrapper = wrap(qc);
    render(
      <Wrapper>
        <AttendanceCard />
      </Wrapper>,
    );
    expect(screen.getByTestId('check-in-button')).toHaveAttribute(
      'aria-label',
    );
    expect(screen.getByTestId('check-out-button')).toHaveAttribute(
      'aria-label',
    );
  });
});
