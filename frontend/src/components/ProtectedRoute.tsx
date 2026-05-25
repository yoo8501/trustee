import type { ReactNode } from 'react';
import { Navigate, useLocation } from 'react-router';
import { useAuth } from '../features/auth';

interface ProtectedRouteProps {
  children: ReactNode;
}

/**
 * 토큰이 없으면 `/login` 으로 리다이렉트. 토큰은 있지만 me 로딩 중이면
 * children 그대로 렌더 (children 내부에서 user 가 null 일 수 있음을 가정).
 *
 * 토큰 유효성은 http interceptor 가 401 → refresh 흐름으로 처리한다.
 */
export function ProtectedRoute({ children }: ProtectedRouteProps) {
  const { isAuthenticated, isLoading } = useAuth();
  const location = useLocation();

  if (!isAuthenticated && !isLoading) {
    return <Navigate to="/login" state={{ from: location.pathname }} replace />;
  }

  return <>{children}</>;
}
