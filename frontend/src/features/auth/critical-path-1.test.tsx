/**
 * Critical Path 1 — 회원가입 → 자동 로그인 → 대시보드 진입.
 *
 * test-plan.md Critical Path 1 / sprint goal Done When (FE).
 *
 * UX 검증:
 * - 가입 폼 입력 검증이 통과해야 버튼이 활성된다.
 * - 가입 성공 시 토스트("환영합니다, ... 님")가 떠야 한다.
 * - 대시보드(/)에 사용자 이름이 표시되어야 한다.
 */
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { http as httpMsw, HttpResponse } from 'msw';
import { I18nextProvider } from 'react-i18next';
import { RouterProvider, createMemoryRouter } from 'react-router';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { ProtectedRoute, PublicOnlyRoute } from '../../components';
import type { ApiResult } from '../../lib/api';
import i18n from '../../lib/i18n';
import { AppThemeProvider } from '../../lib/theme';
import { server } from '../../test/msw-server';
import { HomeRoute } from '../../routes/home';
import { LoginRoute } from '../../routes/login';
import { RegisterRoute } from '../../routes/register';
import { RootLayout } from '../../routes/root';

function ok<T>(d: T): ApiResult<T> {
  return { success: true, data: d, message: 'ok', details: null, total: null };
}

function buildRouter(initial = '/register') {
  return createMemoryRouter(
    [
      {
        path: '/',
        Component: RootLayout,
        children: [
          {
            index: true,
            element: (
              <ProtectedRoute>
                <HomeRoute />
              </ProtectedRoute>
            ),
          },
          {
            path: 'login',
            element: (
              <PublicOnlyRoute>
                <LoginRoute />
              </PublicOnlyRoute>
            ),
          },
          {
            path: 'register',
            element: (
              <PublicOnlyRoute>
                <RegisterRoute />
              </PublicOnlyRoute>
            ),
          },
        ],
      },
    ],
    { initialEntries: [initial] },
  );
}

function renderApp(initial = '/register') {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  return render(
    <I18nextProvider i18n={i18n}>
      <QueryClientProvider client={queryClient}>
        <AppThemeProvider initialMode="light">
          <RouterProvider router={buildRouter(initial)} />
        </AppThemeProvider>
      </QueryClientProvider>
    </I18nextProvider>,
  );
}

describe('Critical Path 1 — 회원가입 → 로그인 → 대시보드', () => {
  beforeEach(async () => {
    window.localStorage.clear();
    await i18n.changeLanguage('ko');
  });
  afterEach(() => {
    server.resetHandlers();
    window.localStorage.clear();
  });

  it('회원가입 → 자동 로그인 → 홈에서 사용자 이름 노출', async () => {
    server.use(
      httpMsw.post('http://localhost:3000/api/auth/register', () =>
        HttpResponse.json(
          ok({ id: 42, email: 'newbie@docflow.dev', name: '홍길동' }),
          { status: 201 },
        ),
      ),
      httpMsw.post('http://localhost:3000/api/auth/login', () =>
        HttpResponse.json(
          ok({
            accessToken: 'access-1',
            refreshToken: 'refresh-1',
            expiresIn: 3600,
            userId: 42,
            role: 'general',
          }),
        ),
      ),
      httpMsw.get('http://localhost:3000/api/users/me', () =>
        HttpResponse.json(
          ok({
            id: 42,
            email: 'newbie@docflow.dev',
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

    const user = userEvent.setup();
    renderApp('/register');

    // 회원가입 폼 렌더 확인
    expect(
      await screen.findByRole('heading', { name: '회원가입' }),
    ).toBeInTheDocument();

    await user.type(screen.getByLabelText(/이름/), '홍길동');
    await user.type(screen.getByLabelText(/이메일/), 'newbie@docflow.dev');
    await user.type(screen.getByLabelText(/비밀번호/), 'password!');

    await waitFor(() =>
      expect(screen.getByTestId('register-submit')).toBeEnabled(),
    );
    await user.click(screen.getByTestId('register-submit'));

    // 홈으로 이동, welcome + 토스트
    await waitFor(() =>
      expect(screen.getByTestId('home-welcome')).toHaveTextContent('홍길동'),
    );
    // 토스트는 notistack — 화면에 success 텍스트 노출 확인
    await waitFor(() =>
      expect(
        screen.getByText(/환영합니다, 홍길동 님/),
      ).toBeInTheDocument(),
    );

    // 로컬스토리지에 토큰이 저장되어야 함
    expect(window.localStorage.getItem('docflow-access-token')).toBe(
      'access-1',
    );
  });
});
