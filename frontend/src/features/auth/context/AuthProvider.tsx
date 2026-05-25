import { useQuery, useQueryClient } from '@tanstack/react-query';
import {
  useCallback,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react';
import {
  AUTH_EXPIRED_EVENT,
  tokenStorage,
} from '../../../lib/auth';
import { authApi, type CurrentUser } from '../api';
import type { LoginInput, RegisterInput } from '../schemas';
import { AuthContext, type AuthContextValue } from './AuthContext';

interface AuthProviderProps {
  children: ReactNode;
  /** 로그아웃/세션 만료 시 호출. 일반적으로 navigate('/login'). */
  onUnauthenticated?: () => void;
  /** 로그인/회원가입 성공 시 호출. 일반적으로 navigate('/'). */
  onAuthenticated?: () => void;
}

const ME_QUERY_KEY = ['auth', 'me'] as const;

export function AuthProvider({
  children,
  onUnauthenticated,
  onAuthenticated,
}: AuthProviderProps) {
  const queryClient = useQueryClient();
  const [hasToken, setHasToken] = useState<boolean>(
    () => tokenStorage.getAccess() !== null,
  );

  const meQuery = useQuery<CurrentUser>({
    queryKey: ME_QUERY_KEY,
    queryFn: () => authApi.me(),
    enabled: hasToken,
    retry: false,
    staleTime: 60_000,
  });

  // 토큰 갱신/제거 시 user 쿼리 무효화.
  useEffect(() => {
    if (!hasToken) {
      queryClient.removeQueries({ queryKey: ME_QUERY_KEY });
    }
  }, [hasToken, queryClient]);

  // 다른 탭에서 logout/login 발생 → 본 탭에도 반영.
  useEffect(() => {
    return tokenStorage.onAccessChange((nextHas) => {
      setHasToken(nextHas);
      if (!nextHas) {
        queryClient.removeQueries({ queryKey: ME_QUERY_KEY });
        onUnauthenticated?.();
      }
    });
  }, [queryClient, onUnauthenticated]);

  // http interceptor 가 refresh 실패 시 발행 — 강제 로그아웃 흐름.
  useEffect(() => {
    const handler = () => {
      tokenStorage.clear();
      setHasToken(false);
      queryClient.removeQueries({ queryKey: ME_QUERY_KEY });
      onUnauthenticated?.();
    };
    window.addEventListener(AUTH_EXPIRED_EVENT, handler);
    return () => window.removeEventListener(AUTH_EXPIRED_EVENT, handler);
  }, [queryClient, onUnauthenticated]);

  const login = useCallback(
    async (input: LoginInput) => {
      const pair = await authApi.login(input);
      tokenStorage.set(pair.accessToken, pair.refreshToken);
      setHasToken(true);
      await queryClient.invalidateQueries({ queryKey: ME_QUERY_KEY });
      onAuthenticated?.();
    },
    [queryClient, onAuthenticated],
  );

  const register = useCallback(
    async (input: RegisterInput) => {
      await authApi.register(input);
      // 가입 후 즉시 로그인 — UX §결과 명확화 (가입 후 또 로그인 시키지 않음).
      const pair = await authApi.login({
        email: input.email,
        password: input.password,
      });
      tokenStorage.set(pair.accessToken, pair.refreshToken);
      setHasToken(true);
      await queryClient.invalidateQueries({ queryKey: ME_QUERY_KEY });
      onAuthenticated?.();
    },
    [queryClient, onAuthenticated],
  );

  const logout = useCallback(async () => {
    try {
      await authApi.logout();
    } catch {
      // BE 호출 실패해도 클라이언트는 로그아웃 처리.
    } finally {
      tokenStorage.clear();
      setHasToken(false);
      queryClient.removeQueries({ queryKey: ME_QUERY_KEY });
      onUnauthenticated?.();
    }
  }, [queryClient, onUnauthenticated]);

  const value = useMemo<AuthContextValue>(
    () => ({
      user: meQuery.data ?? null,
      isLoading: hasToken && meQuery.isLoading,
      isAuthenticated: hasToken && meQuery.data !== undefined,
      login,
      register,
      logout,
    }),
    [
      meQuery.data,
      meQuery.isLoading,
      hasToken,
      login,
      register,
      logout,
    ],
  );

  return (
    <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
  );
}
