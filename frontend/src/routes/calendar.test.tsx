import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, waitFor } from '@testing-library/react';
import { http as httpMsw, HttpResponse } from 'msw';
import { I18nextProvider } from 'react-i18next';
import { MemoryRouter } from 'react-router';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { ApiResult } from '../lib/api';
import { tokenStorage } from '../lib/auth';
import i18n from '../lib/i18n';
import { AppThemeProvider } from '../lib/theme';
import { server } from '../test/msw-server';
import { CalendarRoute } from './calendar';

function ok<T>(d: T): ApiResult<T> {
  return { success: true, data: d, message: 'ok', details: null, total: null };
}

function renderCalendar() {
  const qc = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  return render(
    <I18nextProvider i18n={i18n}>
      <AppThemeProvider initialMode="light">
        <QueryClientProvider client={qc}>
          <MemoryRouter>
            <CalendarRoute />
          </MemoryRouter>
        </QueryClientProvider>
      </AppThemeProvider>
    </I18nextProvider>,
  );
}

describe('CalendarRoute — 노출 누락 0건', () => {
  beforeEach(async () => {
    window.localStorage.clear();
    // 마지막 본 달을 2026-05 로 고정 → MSW 응답과 매칭
    window.localStorage.setItem(
      'docflow-calendar-state',
      JSON.stringify({ view: 'month', month: '2026-05' }),
    );
    await i18n.changeLanguage('ko');
    tokenStorage.set('A', 'R');
  });

  afterEach(() => {
    server.resetHandlers();
    tokenStorage.clear();
    window.localStorage.clear();
  });

  it('Holiday + LeaveRequest 모두 노출 (자동 비교 — 누락 0건)', async () => {
    server.use(
      httpMsw.post('http://localhost:3000/api/hr/calendar/list', () =>
        HttpResponse.json(
          ok({
            leaves: [
              {
                id: 1,
                requesterId: 10,
                requesterName: '홍길동',
                leaveTypeCode: 'annual',
                leaveTypeName: '연차',
                startAt: '2026-05-25T00:00:00+09:00',
                endAt: '2026-05-25T23:59:59+09:00',
                status: 'approved' as const,
                reason: null,
              },
              {
                id: 2,
                requesterId: 11,
                requesterName: '김민지',
                leaveTypeCode: 'comp_leave',
                leaveTypeName: '보상휴가',
                startAt: '2026-05-20T00:00:00+09:00',
                endAt: '2026-05-20T23:59:59+09:00',
                status: 'pending' as const,
                reason: null,
              },
            ],
            holidays: [{ date: '2026-05-25', name: '부처님오신날 대체공휴일' }],
            attendances: [],
          }),
        ),
      ),
    );
    renderCalendar();

    // 모든 휴가와 공휴일이 빠짐없이 노출되는지 확인
    await waitFor(() =>
      expect(screen.getAllByText('연차 · 홍길동').length).toBeGreaterThan(0),
    );
    expect(screen.getAllByText('보상휴가 · 김민지').length).toBeGreaterThan(0);
    expect(
      screen.getByText('부처님오신날 대체공휴일'),
    ).toBeInTheDocument();
  });

  it('빈 응답 — 월 그리드는 그대로 렌더', async () => {
    server.use(
      httpMsw.post('http://localhost:3000/api/hr/calendar/list', () =>
        HttpResponse.json(
          ok({ leaves: [], holidays: [], attendances: [] }),
        ),
      ),
    );
    renderCalendar();
    await waitFor(() =>
      expect(screen.getByTestId('calendar-month-view')).toBeInTheDocument(),
    );
    expect(screen.getByTestId('calendar-cell-2026-05-01')).toBeInTheDocument();
  });

  it('휴가 사유 — 권한 없을 때 reason=null 그대로 노출 안 됨 (마스킹)', async () => {
    server.use(
      httpMsw.post('http://localhost:3000/api/hr/calendar/list', () =>
        HttpResponse.json(
          ok({
            leaves: [
              {
                id: 99,
                requesterId: 77,
                requesterName: '타팀원',
                leaveTypeCode: 'annual',
                leaveTypeName: '연차',
                startAt: '2026-05-25T00:00:00+09:00',
                endAt: '2026-05-25T23:59:59+09:00',
                status: 'approved' as const,
                reason: null,
              },
            ],
            holidays: [],
            attendances: [],
          }),
        ),
      ),
    );
    renderCalendar();
    await waitFor(() =>
      expect(screen.getAllByText('연차 · 타팀원').length).toBeGreaterThan(0),
    );
    // 사유 텍스트가 화면에 노출되면 안 된다
    expect(screen.queryByText(/가족 행사/)).not.toBeInTheDocument();
  });
});
