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
import { RegisterForm } from './RegisterForm';

function ok<T>(d: T): ApiResult<T> {
  return { success: true, data: d, message: 'ok', details: null, total: null };
}
function fail(code: string): ApiResult<null> {
  return {
    success: false,
    data: null,
    message: 'fail',
    details: { errorCode: code },
    total: null,
  };
}

function renderForm(onSuccess?: (name: string) => void) {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  return render(
    <I18nextProvider i18n={i18n}>
      <QueryClientProvider client={queryClient}>
        <MemoryRouter initialEntries={['/register']}>
          <AuthProvider>
            <Routes>
              <Route
                path="/register"
                element={<RegisterForm onSuccess={onSuccess} />}
              />
              <Route path="/login" element={<div>login-page</div>} />
            </Routes>
          </AuthProvider>
        </MemoryRouter>
      </QueryClientProvider>
    </I18nextProvider>,
  );
}

describe('RegisterForm', () => {
  beforeEach(async () => {
    window.localStorage.clear();
    await i18n.changeLanguage('ko');
  });
  afterEach(() => {
    server.resetHandlers();
    window.localStorage.clear();
  });

  it('초기 — 제출 버튼 비활성', () => {
    renderForm();
    expect(screen.getByTestId('register-submit')).toBeDisabled();
  });

  it('이름 누락 시 inline "이름을 입력해 주세요"', async () => {
    const user = userEvent.setup();
    renderForm();
    // 이름을 일단 입력했다가 지우면 onChange 가 발화되며 검증 실패가 노출된다.
    const nameInput = screen.getByLabelText(/이름/);
    await user.type(nameInput, 'a');
    await user.clear(nameInput);
    await user.type(screen.getByLabelText(/이메일/), 'a@b.com');
    await user.type(screen.getByLabelText(/비밀번호/), 'pw12345!');
    expect(screen.getByTestId('register-submit')).toBeDisabled();
    await waitFor(() =>
      expect(screen.getByText('이름을 입력해 주세요')).toBeInTheDocument(),
    );
  });

  it('정상 입력 → register API 호출 → 즉시 login API 호출 → onSuccess(name)', async () => {
    let registerHit = false;
    let loginHit = false;
    server.use(
      httpMsw.post('http://localhost:3000/api/auth/register', () => {
        registerHit = true;
        return HttpResponse.json(
          ok({ id: 5, email: 'r@b.com', name: '신규' }),
          { status: 201 },
        );
      }),
      httpMsw.post('http://localhost:3000/api/auth/login', () => {
        loginHit = true;
        return HttpResponse.json(
          ok({
            accessToken: 'A',
            refreshToken: 'R',
            expiresIn: 3600,
            userId: 5,
            role: 'general',
          }),
        );
      }),
      httpMsw.get('http://localhost:3000/api/users/me', () =>
        HttpResponse.json(
          ok({
            id: 5,
            email: 'r@b.com',
            name: '신규',
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
    await user.type(screen.getByLabelText(/이름/), '신규');
    await user.type(screen.getByLabelText(/이메일/), 'r@b.com');
    await user.type(screen.getByLabelText(/비밀번호/), 'pw12345!');
    await waitFor(() =>
      expect(screen.getByTestId('register-submit')).toBeEnabled(),
    );
    await user.click(screen.getByTestId('register-submit'));
    await waitFor(() => expect(onSuccess).toHaveBeenCalledWith('신규'));
    expect(registerHit).toBe(true);
    expect(loginHit).toBe(true);
  });

  it('EMAIL_DUPLICATE → 이메일 필드 inline 에러 "이미 가입된 이메일이에요"', async () => {
    server.use(
      httpMsw.post('http://localhost:3000/api/auth/register', () =>
        HttpResponse.json(fail('EMAIL_DUPLICATE'), { status: 400 }),
      ),
    );

    const user = userEvent.setup();
    renderForm();
    await user.type(screen.getByLabelText(/이름/), '중복');
    await user.type(screen.getByLabelText(/이메일/), 'dup@b.com');
    await user.type(screen.getByLabelText(/비밀번호/), 'pw12345!');
    await waitFor(() =>
      expect(screen.getByTestId('register-submit')).toBeEnabled(),
    );
    await user.click(screen.getByTestId('register-submit'));
    await waitFor(() =>
      expect(
        screen.getByText('이미 가입된 이메일이에요'),
      ).toBeInTheDocument(),
    );
  });

  it('로그인 링크 제공', () => {
    renderForm();
    const link = screen.getByRole('link', { name: '이미 계정이 있어요' });
    expect(link).toHaveAttribute('href', '/login');
  });
});
