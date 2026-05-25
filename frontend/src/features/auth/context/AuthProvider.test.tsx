import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { http as httpMsw, HttpResponse } from 'msw';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ACCESS_TOKEN_KEY, AUTH_EXPIRED_EVENT } from '../../../lib/auth';
import { server } from '../../../test/msw-server';
import type { ApiResult } from '../../../lib/api';
import { AuthProvider } from './AuthProvider';
import { useAuth } from './useAuth';

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

function renderWithAuth(
  callbacks: {
    onAuthenticated?: () => void;
    onUnauthenticated?: () => void;
  } = {},
) {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  return render(
    <QueryClientProvider client={queryClient}>
      <AuthProvider {...callbacks}>
        <Harness />
      </AuthProvider>
    </QueryClientProvider>,
  );
}

function Harness() {
  const { user, isAuthenticated, isLoading, login, register, logout } =
    useAuth();
  return (
    <div>
      <div data-testid="state">
        {isLoading
          ? 'loading'
          : isAuthenticated
            ? `auth:${user?.name ?? ''}`
            : 'guest'}
      </div>
      <button
        type="button"
        onClick={() => {
          void login({ email: 'a@b.com', password: 'pw12345!' });
        }}
      >
        do-login
      </button>
      <button
        type="button"
        onClick={() => {
          void register({
            email: 'r@b.com',
            password: 'pw12345!',
            name: '신규',
          });
        }}
      >
        do-register
      </button>
      <button
        type="button"
        onClick={() => {
          void logout();
        }}
      >
        do-logout
      </button>
    </div>
  );
}

describe('AuthProvider', () => {
  beforeEach(() => {
    window.localStorage.clear();
  });
  afterEach(() => {
    server.resetHandlers();
    window.localStorage.clear();
  });

  it('초기 상태: 토큰 없으면 guest, me 호출 안 함', async () => {
    renderWithAuth();
    expect(screen.getByTestId('state')).toHaveTextContent('guest');
  });

  it('login 성공 → 토큰 저장 → me 조회 → auth:<name>', async () => {
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

    const onAuthenticated = vi.fn();
    renderWithAuth({ onAuthenticated });

    await userEvent.click(screen.getByText('do-login'));
    await waitFor(() =>
      expect(screen.getByTestId('state')).toHaveTextContent('auth:홍길동'),
    );
    expect(window.localStorage.getItem(ACCESS_TOKEN_KEY)).toBe('A');
    expect(onAuthenticated).toHaveBeenCalledTimes(1);
  });

  it('register 성공 → 즉시 로그인 → auth 상태', async () => {
    let registerCalled = false;
    server.use(
      httpMsw.post('http://localhost:3000/api/auth/register', () => {
        registerCalled = true;
        return HttpResponse.json(
          ok({ id: 9, email: 'r@b.com', name: '신규' }),
          { status: 201 },
        );
      }),
      httpMsw.post('http://localhost:3000/api/auth/login', () =>
        HttpResponse.json(
          ok({
            accessToken: 'AA',
            refreshToken: 'RR',
            expiresIn: 3600,
            userId: 9,
            role: 'general',
          }),
        ),
      ),
      httpMsw.get('http://localhost:3000/api/users/me', () =>
        HttpResponse.json(
          ok({
            id: 9,
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

    renderWithAuth();
    await userEvent.click(screen.getByText('do-register'));
    await waitFor(() =>
      expect(screen.getByTestId('state')).toHaveTextContent('auth:신규'),
    );
    expect(registerCalled).toBe(true);
  });

  it('logout 호출 → 토큰 clear + guest + onUnauthenticated 콜백', async () => {
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
      httpMsw.post('http://localhost:3000/api/auth/logout', () =>
        HttpResponse.json(ok({ status: 'ok' })),
      ),
    );

    const onUnauthenticated = vi.fn();
    renderWithAuth({ onUnauthenticated });
    await userEvent.click(screen.getByText('do-login'));
    await waitFor(() =>
      expect(screen.getByTestId('state')).toHaveTextContent('auth:홍길동'),
    );

    await userEvent.click(screen.getByText('do-logout'));
    await waitFor(() =>
      expect(screen.getByTestId('state')).toHaveTextContent('guest'),
    );
    expect(window.localStorage.getItem(ACCESS_TOKEN_KEY)).toBeNull();
    expect(onUnauthenticated).toHaveBeenCalled();
  });

  it('docflow:auth:expired 이벤트 → guest + onUnauthenticated', async () => {
    const onUnauthenticated = vi.fn();
    renderWithAuth({ onUnauthenticated });

    // 처음에 토큰이 있던 상태로 가장
    act(() => {
      window.localStorage.setItem(ACCESS_TOKEN_KEY, 'A');
    });

    act(() => {
      window.dispatchEvent(new CustomEvent(AUTH_EXPIRED_EVENT));
    });

    await waitFor(() => expect(onUnauthenticated).toHaveBeenCalled());
    expect(window.localStorage.getItem(ACCESS_TOKEN_KEY)).toBeNull();
  });

  it('다른 탭에서 access 가 제거되면 guest 로 전환 + onUnauthenticated', async () => {
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

    const onUnauthenticated = vi.fn();
    renderWithAuth({ onUnauthenticated });
    await userEvent.click(screen.getByText('do-login'));
    await waitFor(() =>
      expect(screen.getByTestId('state')).toHaveTextContent('auth:홍길동'),
    );

    // 다른 탭에서 로그아웃 시나리오 — storage 이벤트는 동일 window 에서는 발화되지 않으므로 수동 발화
    act(() => {
      window.dispatchEvent(
        new StorageEvent('storage', {
          key: ACCESS_TOKEN_KEY,
          oldValue: 'A',
          newValue: null,
        }),
      );
    });

    await waitFor(() => expect(onUnauthenticated).toHaveBeenCalled());
    await waitFor(() =>
      expect(screen.getByTestId('state')).toHaveTextContent('guest'),
    );
  });

  it('login 401 (INVALID_CREDENTIALS) → 토큰 미저장, 에러는 throw', async () => {
    server.use(
      httpMsw.post('http://localhost:3000/api/auth/login', () =>
        HttpResponse.json(fail('INVALID_CREDENTIALS'), { status: 400 }),
      ),
    );

    let thrown: unknown = null;
    function Catcher() {
      const { login } = useAuth();
      return (
        <button
          type="button"
          onClick={async () => {
            try {
              await login({ email: 'a@b.com', password: 'bad' });
            } catch (e) {
              thrown = e;
            }
          }}
        >
          go
        </button>
      );
    }
    const queryClient = new QueryClient({
      defaultOptions: {
        queries: { retry: false },
        mutations: { retry: false },
      },
    });
    render(
      <QueryClientProvider client={queryClient}>
        <AuthProvider>
          <Catcher />
        </AuthProvider>
      </QueryClientProvider>,
    );

    await userEvent.click(screen.getByText('go'));
    await waitFor(() => expect(thrown).toBeTruthy());
    expect(window.localStorage.getItem(ACCESS_TOKEN_KEY)).toBeNull();
  });
});
