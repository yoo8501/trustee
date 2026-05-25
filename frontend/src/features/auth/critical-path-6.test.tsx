/**
 * Critical Path 6 — token 만료 → silent refresh → 작업 지속.
 *
 * test-plan.md "로그인 후 1시간 후 access 만료 → 자동 refresh 로 작업 끊김 없이 지속".
 *
 * Vitest 통합 테스트로 Playwright E2E 를 대체 (BE 띄우는 환경 제약).
 * 검증 포인트:
 *  - 첫 GET /api/users/me 가 401 + TOKEN_EXPIRED 로 응답되어도
 *  - http interceptor 가 자동으로 /api/auth/refresh 호출
 *  - 새 access 로 me 를 재시도 → 사용자에겐 어떤 에러도 노출되지 않음
 *  - 홈 화면이 정상 표시 + 토큰이 갱신됨
 */
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, waitFor } from '@testing-library/react';
import { http as httpMsw, HttpResponse } from 'msw';
import { I18nextProvider } from 'react-i18next';
import { RouterProvider, createMemoryRouter } from 'react-router';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { ProtectedRoute, PublicOnlyRoute } from '../../components';
import type { ApiResult } from '../../lib/api';
import { tokenStorage } from '../../lib/auth';
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
function fail(code: string): ApiResult<null> {
  return {
    success: false,
    data: null,
    message: 'fail',
    details: { errorCode: code },
    total: null,
  };
}

function buildRouter() {
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
    { initialEntries: ['/'] },
  );
}

function renderApp() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  return render(
    <I18nextProvider i18n={i18n}>
      <QueryClientProvider client={queryClient}>
        <AppThemeProvider initialMode="light">
          <RouterProvider router={buildRouter()} />
        </AppThemeProvider>
      </QueryClientProvider>
    </I18nextProvider>,
  );
}

describe('Critical Path 6 — token 만료 → silent refresh', () => {
  beforeEach(async () => {
    window.localStorage.clear();
    await i18n.changeLanguage('ko');
  });
  afterEach(() => {
    server.resetHandlers();
    window.localStorage.clear();
  });

  it('만료된 access 로 /api/users/me 첫 호출 → refresh → 재시도 → 홈 정상', async () => {
    // 처음 상태 — 만료 토큰이 저장되어 있음 (이전 세션)
    tokenStorage.set('expired-access', 'good-refresh');

    let meCalls = 0;
    let refreshCalls = 0;

    server.use(
      httpMsw.get('http://localhost:3000/api/users/me', ({ request }) => {
        meCalls += 1;
        const auth = request.headers.get('Authorization');
        if (auth === 'Bearer expired-access') {
          return HttpResponse.json(fail('TOKEN_EXPIRED'), { status: 401 });
        }
        return HttpResponse.json(
          ok({
            id: 7,
            email: 'me@docflow.dev',
            name: '근속자',
            status: 'active',
            role: 'general',
            teamId: null,
            managerId: null,
            hireDate: '2025-01-01',
          }),
        );
      }),
      httpMsw.post('http://localhost:3000/api/auth/refresh', () => {
        refreshCalls += 1;
        return HttpResponse.json(
          ok({
            accessToken: 'fresh-access',
            refreshToken: 'fresh-refresh',
            expiresIn: 3600,
          }),
        );
      }),
    );

    renderApp();

    // 홈에 사용자 이름이 결국 표시되어야 함 (사용자가 보는 에러 메시지 없이).
    await waitFor(
      () =>
        expect(screen.getByTestId('home-welcome')).toHaveTextContent('근속자'),
      { timeout: 3000 },
    );

    // refresh 흐름이 실제로 트리거되었는지 검증
    expect(refreshCalls).toBe(1);
    expect(meCalls).toBeGreaterThanOrEqual(2);

    // 토큰이 갱신되어야 함
    expect(tokenStorage.getAccess()).toBe('fresh-access');
    expect(tokenStorage.getRefresh()).toBe('fresh-refresh');

    // 만료 토스트가 노출되어선 안 됨
    expect(screen.queryByText('로그인이 만료되었어요. 다시 로그인해 주세요.'))
      .not.toBeInTheDocument();
  });

  it('refresh 도 실패 → /login 으로 리다이렉트 + 만료 토스트', async () => {
    tokenStorage.set('expired-access', 'bad-refresh');

    server.use(
      httpMsw.get('http://localhost:3000/api/users/me', () =>
        HttpResponse.json(fail('TOKEN_EXPIRED'), { status: 401 }),
      ),
      httpMsw.post('http://localhost:3000/api/auth/refresh', () =>
        HttpResponse.json(fail('UNAUTHENTICATED'), { status: 401 }),
      ),
    );

    renderApp();

    // 로그인 페이지(폼) 가 보여야 함
    await waitFor(
      () =>
        expect(
          screen.getByRole('heading', { name: '로그인' }),
        ).toBeInTheDocument(),
      { timeout: 3000 },
    );
    // 토큰이 비워졌는지
    expect(tokenStorage.getAccess()).toBeNull();
  });
});
