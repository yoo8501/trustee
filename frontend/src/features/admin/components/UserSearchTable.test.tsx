import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { http as httpMsw, HttpResponse } from 'msw';
import { SnackbarProvider } from 'notistack';
import { I18nextProvider } from 'react-i18next';
import { MemoryRouter } from 'react-router';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { type ApiResult } from '../../../lib/api';
import { tokenStorage } from '../../../lib/auth';
import i18n from '../../../lib/i18n';
import { server } from '../../../test/msw-server';
import { AuthProvider } from '../../auth';
import { UserSearchTable } from './UserSearchTable';

function ok<T>(d: T, total?: number): ApiResult<T> {
  return {
    success: true,
    data: d,
    message: 'ok',
    details: null,
    total: total ?? null,
  };
}

const userOf = (
  id: number,
  name: string,
  email: string,
  role = 'general',
  status = 'active',
) => ({
  id,
  name,
  email,
  status,
  role,
  teamId: null,
  managerId: null,
  hireDate: '2026-01-01',
});

function renderTable(meRole = 'super_admin', meId = 1, items = [userOf(1, '본인', 'me@b.com', meRole)]) {
  tokenStorage.set('a', 'r');
  server.use(
    httpMsw.get('http://localhost:3000/api/users/me', () =>
      HttpResponse.json(ok(userOf(meId, '본인', 'me@b.com', meRole))),
    ),
    httpMsw.post('http://localhost:3000/api/users/list', () =>
      HttpResponse.json(ok(items, items.length)),
    ),
  );
  const qc = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  return render(
    <I18nextProvider i18n={i18n}>
      <QueryClientProvider client={qc}>
        <SnackbarProvider>
          <MemoryRouter>
            <AuthProvider>
              <UserSearchTable />
            </AuthProvider>
          </MemoryRouter>
        </SnackbarProvider>
      </QueryClientProvider>
    </I18nextProvider>,
  );
}

describe('UserSearchTable', () => {
  beforeEach(async () => {
    window.localStorage.clear();
    await i18n.changeLanguage('ko');
  });
  afterEach(() => {
    server.resetHandlers();
    window.localStorage.clear();
  });

  it('초기 → 사용자 row 표시 (Success)', async () => {
    renderTable('super_admin', 1, [
      userOf(1, '본인', 'me@b.com', 'super_admin'),
      userOf(2, '동료', 'b@b.com', 'general'),
    ]);
    await waitFor(() =>
      expect(screen.getByTestId('user-row-2')).toBeInTheDocument(),
    );
    expect(screen.getByText('동료')).toBeInTheDocument();
  });

  it('빈 목록 → empty Alert', async () => {
    renderTable('super_admin', 1, []);
    await waitFor(() =>
      expect(screen.getByTestId('user-list-empty')).toBeInTheDocument(),
    );
  });

  it('검색 → 매칭되는 row 만 (debounced)', async () => {
    renderTable('super_admin', 1, [
      userOf(1, '본인', 'me@b.com', 'super_admin'),
      userOf(2, '김철수', 'cs@b.com', 'general'),
      userOf(3, '이영희', 'yh@b.com', 'general'),
    ]);
    await waitFor(() =>
      expect(screen.getByTestId('user-row-2')).toBeInTheDocument(),
    );
    const user = userEvent.setup();
    await user.type(screen.getByTestId('user-search-input'), '영희');
    await waitFor(
      () => {
        expect(screen.queryByTestId('user-row-2')).not.toBeInTheDocument();
        expect(screen.getByTestId('user-row-3')).toBeInTheDocument();
      },
      { timeout: 1000 },
    );
  });

  it('본인 row → role 변경 disabled', async () => {
    renderTable('super_admin', 1, [
      userOf(1, '본인', 'me@b.com', 'super_admin'),
      userOf(2, '동료', 'b@b.com', 'general'),
    ]);
    await waitFor(() =>
      expect(screen.getByTestId('user-row-1')).toBeInTheDocument(),
    );
    const selfSelect = screen.getByTestId('role-select-1');
    expect(selfSelect).toBeDisabled();
    const otherSelect = screen.getByTestId('role-select-2');
    expect(otherSelect).not.toBeDisabled();
  });

  it('HR (super_admin 아님) → role select 가 아닌 chip 표시', async () => {
    renderTable('hr_manager', 1, [
      userOf(1, '본인', 'me@b.com', 'hr_manager'),
      userOf(2, '동료', 'b@b.com', 'general'),
    ]);
    await waitFor(() =>
      expect(screen.getByTestId('user-row-2')).toBeInTheDocument(),
    );
    // role-select 없음
    expect(screen.queryByTestId('role-select-2')).not.toBeInTheDocument();
    expect(screen.getByTestId('role-chip-general')).toBeInTheDocument();
    // terminate 버튼도 없음 (super_admin only)
    expect(screen.queryByTestId('terminate-btn-2')).not.toBeInTheDocument();
  });

  it('본인 row → terminate 버튼 disabled', async () => {
    renderTable('super_admin', 1, [
      userOf(1, '본인', 'me@b.com', 'super_admin'),
    ]);
    await waitFor(() =>
      expect(screen.getByTestId('user-row-1')).toBeInTheDocument(),
    );
    expect(screen.getByTestId('terminate-btn-1')).toBeDisabled();
  });
});
