import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, waitFor } from '@testing-library/react';
import { http as httpMsw, HttpResponse } from 'msw';
import { SnackbarProvider } from 'notistack';
import { I18nextProvider } from 'react-i18next';
import { MemoryRouter } from 'react-router';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { ApiResult } from '../lib/api';
import i18n from '../lib/i18n';
import { tokenStorage } from '../lib/auth';
import { AuthProvider } from '../features/auth';
import { server } from '../test/msw-server';
import { HomeRoute } from './home';

function ok<T>(d: T): ApiResult<T> {
  return { success: true, data: d, message: 'ok', details: null, total: null };
}

function renderHome() {
  const qc = new QueryClient({
    defaultOptions: {
      queries: { retry: false },
      mutations: { retry: false },
    },
  });
  return render(
    <I18nextProvider i18n={i18n}>
      <QueryClientProvider client={qc}>
        <MemoryRouter>
          <SnackbarProvider>
            <AuthProvider>
              <HomeRoute />
            </AuthProvider>
          </SnackbarProvider>
        </MemoryRouter>
      </QueryClientProvider>
    </I18nextProvider>,
  );
}

describe('HomeRoute (대시보드)', () => {
  beforeEach(async () => {
    window.localStorage.clear();
    await i18n.changeLanguage('ko');
    tokenStorage.set('A', 'R');
    server.use(
      httpMsw.get('http://localhost:3000/api/users/me', () =>
        HttpResponse.json(
          ok({
            id: 1,
            email: 'a@b.com',
            name: '홍길동',
            status: 'active',
            role: 'general',
            teamId: null,
            managerId: null,
            hireDate: '2026-01-01',
          }),
        ),
      ),
      httpMsw.post('http://localhost:3000/api/hr/attendance/me/today', () =>
        HttpResponse.json(ok({ record: null })),
      ),
    );
  });
  afterEach(() => {
    server.resetHandlers();
    window.localStorage.clear();
  });

  it('대시보드에 시계 + 출퇴근 카드 + 환영 메시지가 렌더된다', async () => {
    renderHome();
    expect(screen.getByTestId('dashboard-clock')).toBeInTheDocument();
    expect(screen.getByTestId('attendance-card')).toBeInTheDocument();
    await waitFor(() =>
      expect(screen.getByTestId('home-welcome')).toHaveTextContent('홍길동'),
    );
  });
});
