import { ThemeProvider } from '@mui/material/styles';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, waitFor } from '@testing-library/react';
import { http as httpMsw, HttpResponse } from 'msw';
import { SnackbarProvider } from 'notistack';
import { I18nextProvider } from 'react-i18next';
import { MemoryRouter } from 'react-router';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { ApiResult } from '../lib/api';
import i18n from '../lib/i18n';
import { createAppTheme } from '../lib/theme';
import { server } from '../test/msw-server';
import { AttendanceRoute } from './attendance';
import type { StatsResponse } from '../features/attendance';

function ok<T>(d: T): ApiResult<T> {
  return { success: true, data: d, message: 'ok', details: null, total: null };
}

function render_() {
  const qc = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  return render(
    <I18nextProvider i18n={i18n}>
      <QueryClientProvider client={qc}>
        <ThemeProvider theme={createAppTheme('light')}>
          <SnackbarProvider>
            <MemoryRouter>
              <AttendanceRoute />
            </MemoryRouter>
          </SnackbarProvider>
        </ThemeProvider>
      </QueryClientProvider>
    </I18nextProvider>,
  );
}

const normalWeekResponse: StatsResponse = {
  period: 'week',
  from: '2026-05-25',
  to: '2026-05-31',
  records: [
    {
      date: '2026-05-25',
      checkInAt: '2026-05-25T00:01:00Z',
      checkOutAt: '2026-05-25T09:01:00Z',
      actualWorkMinutes: 480,
      expectedMinutes: 480,
      adjustedExpected: 480,
      overtimeMinutes: 0,
      status: 'normal',
      leaveHours: 0,
    },
  ],
  summary: {
    totalActualMinutes: 480,
    totalOvertimeMinutes: 0,
    daysPresent: 1,
    daysLate: 0,
    daysEarlyLeave: 0,
    daysAutoClosed: 0,
    daysAbsent: 0,
    attendanceRate: 1,
    weeklyOvertimeMinutes: 0,
    weeklyTotalMinutes: 480, // 8h
  },
};

describe('AttendanceRoute (/attendance)', () => {
  beforeEach(async () => {
    await i18n.changeLanguage('ko');
  });
  afterEach(() => server.resetHandlers());

  it('기본 — 주 탭 + 차트 + 테이블 렌더', async () => {
    server.use(
      httpMsw.post(
        'http://localhost:3000/api/hr/attendance/me/stats',
        () => HttpResponse.json(ok(normalWeekResponse)),
      ),
    );
    render_();

    expect(screen.getByTestId('attendance-page')).toBeInTheDocument();
    expect(screen.getByTestId('period-tab-week')).toHaveAttribute(
      'aria-selected',
      'true',
    );

    await waitFor(() => {
      expect(screen.getByTestId('weekly-chart-svg')).toBeInTheDocument();
    });
    expect(
      screen.getByTestId('records-table-row-2026-05-25'),
    ).toBeInTheDocument();
  });

  it('Critical Path 4 — 반차 + 4시간 출근 → adjustedExpected 240 표시', async () => {
    const halfDay: StatsResponse = {
      ...normalWeekResponse,
      records: [
        {
          date: '2026-05-25',
          checkInAt: '2026-05-25T00:01:00Z',
          checkOutAt: '2026-05-25T04:01:00Z',
          actualWorkMinutes: 240,
          expectedMinutes: 480,
          adjustedExpected: 240, // 반차 4h 차감
          overtimeMinutes: 0,
          status: 'normal',
          leaveHours: 4,
        },
      ],
    };
    server.use(
      httpMsw.post(
        'http://localhost:3000/api/hr/attendance/me/stats',
        () => HttpResponse.json(ok(halfDay)),
      ),
    );
    render_();

    await waitFor(() => {
      expect(
        screen.getByTestId('records-table-row-2026-05-25'),
      ).toBeInTheDocument();
    });
    // adjustedExpected 셀
    const expectedCell = screen.getByTestId(
      'records-table-row-2026-05-25-adjustedExpected',
    );
    expect(expectedCell.textContent).toMatch(/4\s*h|240/); // "4h" or "240m"
  });

  it('48h 이상 누적 시 OvertimeWarning 표시', async () => {
    const high: StatsResponse = {
      ...normalWeekResponse,
      summary: {
        ...normalWeekResponse.summary,
        weeklyTotalMinutes: 48 * 60, // exactly 48h
      },
    };
    server.use(
      httpMsw.post(
        'http://localhost:3000/api/hr/attendance/me/stats',
        () => HttpResponse.json(ok(high)),
      ),
    );
    render_();

    await waitFor(() => {
      const alert = screen.getByTestId('overtime-warning');
      expect(alert.getAttribute('data-severity')).toBe('warning');
    });
  });

  it('빈 응답 → Empty 상태', async () => {
    const empty: StatsResponse = {
      ...normalWeekResponse,
      records: [],
      summary: { ...normalWeekResponse.summary, daysPresent: 0 },
    };
    server.use(
      httpMsw.post(
        'http://localhost:3000/api/hr/attendance/me/stats',
        () => HttpResponse.json(ok(empty)),
      ),
    );
    render_();
    await waitFor(() => {
      expect(screen.getByTestId('records-table-empty')).toBeInTheDocument();
    });
  });
});
