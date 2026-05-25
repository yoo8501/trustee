import type { ReactNode } from 'react';
import { Navigate } from 'react-router';
import { useAuth } from '../features/auth';

interface PublicOnlyRouteProps {
  children: ReactNode;
}

/**
 * 이미 로그인된 사용자가 /login 또는 /register 에 접근하면 / 로 보낸다.
 */
export function PublicOnlyRoute({ children }: PublicOnlyRouteProps) {
  const { isAuthenticated } = useAuth();
  if (isAuthenticated) {
    return <Navigate to="/" replace />;
  }
  return <>{children}</>;
}
