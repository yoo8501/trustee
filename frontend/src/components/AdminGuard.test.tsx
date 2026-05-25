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
import { AdminGuard } from './AdminGuard';

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

function renderWithUser(
  role: string,
  guard: React.ReactNode,
) {
  // Provide auth token so AuthProvider triggers me query
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
          <MemoryRouter initialEntries={['/admin/users']}>
            <AuthProvider>
              <Routes>
                <Route path="/" element={<div>home-page</div>} />
                <Route path="/login" element={<div>login-page</div>} />
                <Route path="/admin/users" element={guard} />
              </Routes>
            </AuthProvider>
          </MemoryRouter>
        </SnackbarProvider>
      </QueryClientProvider>
    </I18nextProvider>,
  );
}

describe('AdminGuard', () => {
  beforeEach(async () => {
    window.localStorage.clear();
    await i18n.changeLanguage('ko');
  });
  afterEach(() => {
    server.resetHandlers();
    window.localStorage.clear();
  });

  it('일반 직원 → / 로 리다이렉트', async () => {
    renderWithUser(
      'general',
      <AdminGuard>
        <div>admin-page</div>
      </AdminGuard>,
    );
    await waitFor(() => {
      expect(screen.getByText('home-page')).toBeInTheDocument();
    });
    expect(screen.queryByText('admin-page')).not.toBeInTheDocument();
  });

  it('HR 매니저 → 통과', async () => {
    renderWithUser(
      'hr_manager',
      <AdminGuard>
        <div>admin-page</div>
      </AdminGuard>,
    );
    await waitFor(() => {
      expect(screen.getByText('admin-page')).toBeInTheDocument();
    });
  });

  it('super_admin requireSuperAdmin=true → 통과', async () => {
    renderWithUser(
      'super_admin',
      <AdminGuard requireSuperAdmin>
        <div>super-only</div>
      </AdminGuard>,
    );
    await waitFor(() => {
      expect(screen.getByText('super-only')).toBeInTheDocument();
    });
  });

  it('HR requireSuperAdmin=true → 차단 (홈)', async () => {
    renderWithUser(
      'hr_manager',
      <AdminGuard requireSuperAdmin>
        <div>super-only</div>
      </AdminGuard>,
    );
    await waitFor(() => {
      expect(screen.getByText('home-page')).toBeInTheDocument();
    });
    expect(screen.queryByText('super-only')).not.toBeInTheDocument();
  });
});
