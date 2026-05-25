import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { http as httpMsw, HttpResponse } from 'msw';
import { I18nextProvider } from 'react-i18next';
import { MemoryRouter, Route, Routes } from 'react-router';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import i18n from '../../../lib/i18n';
import type { ApiResult } from '../../../lib/api';
import { server } from '../../../test/msw-server';
import { AuthProvider } from '../context';
import { LoginForm } from './LoginForm';

function ok<T>(d: T): ApiResult<T> {
  return { success: true, data: d, message: 'ok', details: null, total: null };
}
function fail(code: string, msg = 'fail'): ApiResult<null> {
  return {
    success: false,
    data: null,
    message: msg,
    details: { errorCode: code },
    total: null,
  };
}

function renderForm(onSuccess?: (email: string) => void) {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  return render(
    <I18nextProvider i18n={i18n}>
      <QueryClientProvider client={queryClient}>
        <MemoryRouter initialEntries={['/login']}>
          <AuthProvider>
            <Routes>
              <Route
                path="/login"
                element={<LoginForm onSuccess={onSuccess} />}
              />
              <Route path="/register" element={<div>register-page</div>} />
            </Routes>
          </AuthProvider>
        </MemoryRouter>
      </QueryClientProvider>
    </I18nextProvider>,
  );
}

describe('LoginForm', () => {
  beforeEach(async () => {
    window.localStorage.clear();
    await i18n.changeLanguage('ko');
  });
  afterEach(() => {
    server.resetHandlers();
    window.localStorage.clear();
  });

  it('초기 렌더 — 제출 버튼은 비활성', () => {
    renderForm();
    const btn = screen.getByTestId('login-submit');
    expect(btn).toBeDisabled();
  });

  it('이메일 형식 오류 시 inline 사유 표시 + 버튼 비활성 유지', async () => {
    const user = userEvent.setup();
    renderForm();
    await user.type(screen.getByLabelText(/이메일/), 'not-email');
    await user.type(screen.getByLabelText(/비밀번호/), 'pw12345!');
    expect(screen.getByTestId('login-submit')).toBeDisabled();
    await waitFor(() =>
      expect(
        screen.getByText('올바른 이메일 형식이 아니에요'),
      ).toBeInTheDocument(),
    );
  });

  it('비밀번호 < 8자 → inline "비밀번호는 8자 이상이에요"', async () => {
    const user = userEvent.setup();
    renderForm();
    await user.type(screen.getByLabelText(/이메일/), 'a@b.com');
    await user.type(screen.getByLabelText(/비밀번호/), 'short');
    expect(screen.getByTestId('login-submit')).toBeDisabled();
    await waitFor(() =>
      expect(
        screen.getByText('비밀번호는 8자 이상이에요'),
      ).toBeInTheDocument(),
    );
  });

  it('정상 입력 → 제출 → onSuccess 콜백 호출', async () => {
    server.use(
      httpMsw.post('http://localhost:3000/api/auth/login', () =>
        HttpResponse.json(
          ok({
            accessToken: 'A',
            refreshToken: 'R',
            expiresIn: 3600,
            userId: 1,
            role: 'general',
          }),
        ),
      ),
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
    );

    const onSuccess = vi.fn();
    const user = userEvent.setup();
    renderForm(onSuccess);
    await user.type(screen.getByLabelText(/이메일/), 'a@b.com');
    await user.type(screen.getByLabelText(/비밀번호/), 'pw12345!');
    await waitFor(() =>
      expect(screen.getByTestId('login-submit')).toBeEnabled(),
    );
    await user.click(screen.getByTestId('login-submit'));
    await waitFor(() => expect(onSuccess).toHaveBeenCalledWith('a@b.com'));
  });

  it('INVALID_CREDENTIALS → 상단 banner "이메일 또는 비밀번호가 올바르지 않아요"', async () => {
    server.use(
      httpMsw.post('http://localhost:3000/api/auth/login', () =>
        HttpResponse.json(fail('INVALID_CREDENTIALS'), { status: 400 }),
      ),
    );

    const user = userEvent.setup();
    renderForm();
    await user.type(screen.getByLabelText(/이메일/), 'a@b.com');
    await user.type(screen.getByLabelText(/비밀번호/), 'pw12345!');
    await waitFor(() =>
      expect(screen.getByTestId('login-submit')).toBeEnabled(),
    );
    await user.click(screen.getByTestId('login-submit'));
    await waitFor(() =>
      expect(screen.getByTestId('login-error')).toHaveTextContent(
        '이메일 또는 비밀번호가 올바르지 않아요',
      ),
    );
  });

  it('USER_TERMINATED → banner 에 퇴사 안내', async () => {
    server.use(
      httpMsw.post('http://localhost:3000/api/auth/login', () =>
        HttpResponse.json(fail('USER_TERMINATED'), { status: 400 }),
      ),
    );

    const user = userEvent.setup();
    renderForm();
    await user.type(screen.getByLabelText(/이메일/), 'a@b.com');
    await user.type(screen.getByLabelText(/비밀번호/), 'pw12345!');
    await waitFor(() =>
      expect(screen.getByTestId('login-submit')).toBeEnabled(),
    );
    await user.click(screen.getByTestId('login-submit'));
    await waitFor(() =>
      expect(screen.getByTestId('login-error')).toHaveTextContent(
        /퇴사 처리된 계정/,
      ),
    );
  });

  it('가입 링크 제공', () => {
    renderForm();
    const link = screen.getByRole('link', { name: '계정이 없어요' });
    expect(link).toHaveAttribute('href', '/register');
  });
});
