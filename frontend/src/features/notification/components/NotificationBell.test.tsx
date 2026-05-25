import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { http as httpMsw, HttpResponse } from 'msw';
import { I18nextProvider } from 'react-i18next';
import { MemoryRouter, Routes, Route, useLocation } from 'react-router';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { ApiResult } from '../../../lib/api';
import { tokenStorage } from '../../../lib/auth';
import i18n from '../../../lib/i18n';
import { server } from '../../../test/msw-server';
import { NotificationBell } from './NotificationBell';

function ok<T>(d: T): ApiResult<T> {
  return { success: true, data: d, message: 'ok', details: null, total: null };
}

function LocationProbe() {
  const loc = useLocation();
  return <div data-testid="probe-location">{loc.pathname}</div>;
}

function renderBell() {
  const qc = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  return render(
    <I18nextProvider i18n={i18n}>
      <QueryClientProvider client={qc}>
        <MemoryRouter initialEntries={['/']}>
          <Routes>
            <Route
              path="/"
              element={
                <>
                  <NotificationBell />
                  <LocationProbe />
                </>
              }
            />
            <Route path="/leave/approvals" element={<LocationProbe />} />
          </Routes>
        </MemoryRouter>
      </QueryClientProvider>
    </I18nextProvider>,
  );
}

const base = {
  id: 1,
  type: 'leave_submitted',
  title: '결재 요청 — 홍길동',
  body: '연차 8h',
  relatedUrl: '/leave/approvals',
  readAt: null,
  createdAt: '2026-05-25T10:00:00+09:00',
};

describe('NotificationBell', () => {
  beforeEach(async () => {
    await i18n.changeLanguage('ko');
    tokenStorage.set('A', 'R');
  });
  afterEach(() => {
    server.resetHandlers();
    tokenStorage.clear();
  });

  it('미읽음 카운트 badge 노출', async () => {
    server.use(
      httpMsw.post('http://localhost:3000/api/hr/notifications/list', () =>
        HttpResponse.json(ok([base, { ...base, id: 2 }])),
      ),
    );
    renderBell();
    await waitFor(() =>
      expect(screen.getByTestId('notification-bell-badge')).toHaveTextContent(
        '2',
      ),
    );
  });

  it('드롭다운 열림 → 알림 목록 노출', async () => {
    server.use(
      httpMsw.post('http://localhost:3000/api/hr/notifications/list', () =>
        HttpResponse.json(ok([base])),
      ),
    );
    renderBell();
    await waitFor(() =>
      expect(screen.getByTestId('notification-bell')).toBeInTheDocument(),
    );
    await userEvent.click(screen.getByTestId('notification-bell'));
    expect(
      await screen.findByTestId('notification-item-1'),
    ).toBeInTheDocument();
    expect(screen.getByText('결재 요청 — 홍길동')).toBeInTheDocument();
  });

  it('알림 클릭 → read + navigate(related_url)', async () => {
    let readCalled = false;
    server.use(
      httpMsw.post('http://localhost:3000/api/hr/notifications/list', () =>
        HttpResponse.json(ok([base])),
      ),
      httpMsw.post(
        'http://localhost:3000/api/hr/notifications/1/read',
        () => {
          readCalled = true;
          return HttpResponse.json(ok(null));
        },
      ),
    );
    renderBell();
    await userEvent.click(await screen.findByTestId('notification-bell'));
    await userEvent.click(
      await screen.findByTestId('notification-item-1'),
    );
    await waitFor(() =>
      expect(screen.getByTestId('probe-location').textContent).toBe(
        '/leave/approvals',
      ),
    );
    expect(readCalled).toBe(true);
  });

  it('빈 상태 — empty 메시지', async () => {
    server.use(
      httpMsw.post('http://localhost:3000/api/hr/notifications/list', () =>
        HttpResponse.json(ok([])),
      ),
    );
    renderBell();
    await userEvent.click(await screen.findByTestId('notification-bell'));
    expect(
      await screen.findByTestId('notification-dropdown-empty'),
    ).toBeInTheDocument();
  });
});
