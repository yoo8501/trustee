import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { http as httpMsw, HttpResponse } from 'msw';
import { I18nextProvider } from 'react-i18next';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { type ApiResult } from '../../../lib/api';
import i18n from '../../../lib/i18n';
import { server } from '../../../test/msw-server';
import { AttendanceAuditTable } from './AttendanceAuditTable';

function ok<T>(d: T, total?: number): ApiResult<T> {
  return {
    success: true,
    data: d,
    message: 'ok',
    details: null,
    total: total ?? null,
  };
}

const row1 = {
  id: 1,
  userId: 2,
  workDate: '2026-05-25',
  checkInAt: '2026-05-25T00:01:00Z',
  checkOutAt: '2026-05-25T09:30:00Z',
  lunchBreakMinutes: 60,
  source: 'button',
  clientIp: '10.0.0.1',
  userAgent: 'Mozilla',
  status: 'normal',
  createdAt: '2026-05-25T00:01:00Z',
};

function renderTable() {
  const qc = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  return render(
    <I18nextProvider i18n={i18n}>
      <QueryClientProvider client={qc}>
        <AttendanceAuditTable />
      </QueryClientProvider>
    </I18nextProvider>,
  );
}

describe('AttendanceAuditTable', () => {
  beforeEach(async () => {
    await i18n.changeLanguage('ko');
  });
  afterEach(() => server.resetHandlers());

  it('loading → row 표시', async () => {
    server.use(
      httpMsw.post(
        'http://localhost:3000/api/hr/audit/attendance/list',
        () => HttpResponse.json(ok([row1], 1)),
      ),
    );
    renderTable();
    await waitFor(() =>
      expect(screen.getByTestId('audit-row-1')).toBeInTheDocument(),
    );
  });

  it('빈 응답 → empty Alert', async () => {
    server.use(
      httpMsw.post(
        'http://localhost:3000/api/hr/audit/attendance/list',
        () => HttpResponse.json(ok([], 0)),
      ),
    );
    renderTable();
    await waitFor(() =>
      expect(screen.getByTestId('audit-empty')).toBeInTheDocument(),
    );
  });

  it('필터 입력 후 조회 클릭 → BE 에 userId param 전달', async () => {
    let received: { userId?: number; page?: number } | null = null;
    server.use(
      httpMsw.post(
        'http://localhost:3000/api/hr/audit/attendance/list',
        async ({ request }) => {
          received = (await request.json()) as { userId?: number; page?: number };
          return HttpResponse.json(ok([row1], 1));
        },
      ),
    );
    renderTable();
    await waitFor(() =>
      expect(screen.getByTestId('audit-row-1')).toBeInTheDocument(),
    );
    const user = userEvent.setup();
    await user.type(screen.getByTestId('audit-filter-user'), '2');
    await user.click(screen.getByTestId('audit-search'));
    await waitFor(() => {
      expect(received).not.toBeNull();
      expect(received!.userId).toBe(2);
    });
  });

  it('페이지네이션 — total=40, size=20 → 페이지 2/2', async () => {
    const items = Array.from({ length: 20 }, (_, i) => ({
      ...row1,
      id: i + 1,
    }));
    server.use(
      httpMsw.post(
        'http://localhost:3000/api/hr/audit/attendance/list',
        () => HttpResponse.json(ok(items, 40)),
      ),
    );
    renderTable();
    await waitFor(() =>
      expect(screen.getByTestId('audit-page-info')).toHaveTextContent('1 / 2'),
    );
    const user = userEvent.setup();
    await user.click(screen.getByTestId('audit-next'));
    await waitFor(() =>
      expect(screen.getByTestId('audit-page-info')).toHaveTextContent('2 / 2'),
    );
  });
});
