import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, waitFor } from '@testing-library/react';
import { http as httpMsw, HttpResponse } from 'msw';
import { SnackbarProvider } from 'notistack';
import { I18nextProvider } from 'react-i18next';
import { MemoryRouter, Route, Routes } from 'react-router';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { type ApiResult } from '../lib/api';
import { tokenStorage } from '../lib/auth';
import i18n from '../lib/i18n';
import { server } from '../test/msw-server';
import { AuthProvider } from '../features/auth';
import { RoleGuard } from './RoleGuard';

function ok<T>(d: T): ApiResult<T> {
  return { success: true, data: d, message: 'ok', details: null, total: null };
}

const userOf = (role: string) => ({
  id: 1,
  email: 'a@b.com',
  name: '홍길동',
  status: 'active',
  role,
  teamId: null,
  managerId: null,
  hireDate: '2026-01-01',
});

function renderWithUser(role: string, guard: React.ReactNode) {
  tokenStorage.set('test-access', 'test-refresh');
  server.use(
    httpMsw.get('http://localhost:3000/api/users/me', () =>
      HttpResponse.json(ok(userOf(role))),
    ),
  );
  const qc = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  return render(
    <I18nextProvider i18n={i18n}>
      <QueryClientProvider client={qc}>
        <SnackbarProvider>
          <MemoryRouter initialEntries={['/leave/approvals']}>
            <AuthProvider>
              <Routes>
                <Route path="/" element={<div>home-page</div>} />
                <Route path="/login" element={<div>login-page</div>} />
                <Route path="/leave/approvals" element={guard} />
              </Routes>
            </AuthProvider>
          </MemoryRouter>
        </SnackbarProvider>
      </QueryClientProvider>
    </I18nextProvider>,
  );
}

describe('RoleGuard', () => {
  beforeEach(async () => {
    window.localStorage.clear();
    await i18n.changeLanguage('ko');
  });
  afterEach(() => {
    server.resetHandlers();
    window.localStorage.clear();
    tokenStorage.clear();
  });

  it('general role → minRole=team_lead 통과 못 함 (/ 로 리다이렉트)', async () => {
    renderWithUser(
      'general',
      <RoleGuard minRole="team_lead">
        <div>approvals-page</div>
      </RoleGuard>,
    );
    await waitFor(() => {
      expect(screen.getByText('home-page')).toBeInTheDocument();
    });
    expect(screen.queryByText('approvals-page')).not.toBeInTheDocument();
  });

  it('team_lead role → minRole=team_lead 통과', async () => {
    renderWithUser(
      'team_lead',
      <RoleGuard minRole="team_lead">
        <div>approvals-page</div>
      </RoleGuard>,
    );
    await waitFor(() => {
      expect(screen.getByText('approvals-page')).toBeInTheDocument();
    });
  });

  it('hr_manager role → minRole=team_lead 통과 (상위 role)', async () => {
    renderWithUser(
      'hr_manager',
      <RoleGuard minRole="team_lead">
        <div>approvals-page</div>
      </RoleGuard>,
    );
    await waitFor(() => {
      expect(screen.getByText('approvals-page')).toBeInTheDocument();
    });
  });
});
