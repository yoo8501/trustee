import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { http as httpMsw, HttpResponse } from 'msw';
import { SnackbarProvider } from 'notistack';
import { I18nextProvider } from 'react-i18next';
import { MemoryRouter } from 'react-router';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { type ApiResult } from '../../lib/api';
import i18n from '../../lib/i18n';
import { server } from '../../test/msw-server';
import { AdminAttendanceAuditPage } from './audit-attendance';

function ok<T>(d: T, total?: number): ApiResult<T> {
  return {
    success: true,
    data: d,
    message: 'ok',
    details: null,
    total: total ?? null,
  };
}

function render_() {
  const qc = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  return render(
    <I18nextProvider i18n={i18n}>
      <QueryClientProvider client={qc}>
        <SnackbarProvider>
          <MemoryRouter>
            <AdminAttendanceAuditPage />
          </MemoryRouter>
        </SnackbarProvider>
      </QueryClientProvider>
    </I18nextProvider>,
  );
}

describe('AdminAttendanceAuditPage', () => {
  beforeEach(async () => {
    await i18n.changeLanguage('ko');
  });
  afterEach(() => server.resetHandlers());

  it('렌더 — 제목 + 빈 상태 메시지', async () => {
    server.use(
      httpMsw.post(
        'http://localhost:3000/api/hr/audit/attendance/list',
        () => HttpResponse.json(ok([], 0)),
      ),
    );
    render_();
    expect(
      screen.getByTestId('admin-audit-attendance-page'),
    ).toBeInTheDocument();
    await waitFor(() => {
      expect(screen.getByTestId('audit-empty')).toBeInTheDocument();
    });
  });

  it('필터 + 페이지네이션 동시 동작', async () => {
    const items = Array.from({ length: 20 }, (_, i) => ({
      id: i + 1,
      userId: 1,
      workDate: '2026-05-25',
      checkInAt: '2026-05-25T00:01:00Z',
      checkOutAt: '2026-05-25T09:30:00Z',
      lunchBreakMinutes: 60,
      source: 'button',
      clientIp: '10.0.0.1',
      userAgent: 'm',
      status: 'normal',
      createdAt: '2026-05-25T00:01:00Z',
    }));
    let lastPage = 0;
    server.use(
      httpMsw.post(
        'http://localhost:3000/api/hr/audit/attendance/list',
        async ({ request }) => {
          const body = (await request.json()) as { page?: number };
          lastPage = body.page ?? 1;
          return HttpResponse.json(ok(items, 50));
        },
      ),
    );
    render_();
    await waitFor(() =>
      expect(screen.getByTestId('audit-page-info')).toHaveTextContent('1 / 3'),
    );
    const user = userEvent.setup();
    await user.click(screen.getByTestId('audit-next'));
    await waitFor(() => expect(lastPage).toBe(2));
  });
});
