import { useEffect, useRef, type ReactNode } from 'react';
import { useSnackbar } from 'notistack';
import { useTranslation } from 'react-i18next';
import { Navigate } from 'react-router';
import { useAuth } from '../features/auth';

interface AdminGuardProps {
  children: ReactNode;
  /**
   * true 면 super_admin 만 통과. 기본은 hr_manager 이상.
   */
  requireSuperAdmin?: boolean;
}

const HR_ROLES = new Set(['hr_manager', 'super_admin']);

/**
 * AdminGuard — admin 라우트 진입 가드.
 *
 * 동작:
 *  - 토큰 검증 진행 중이면 그대로 children 렌더 (children 내부에서 user null guard).
 *  - 미인증이면 /login.
 *  - 권한 부족이면 toast (한 번) + / 로 replace.
 *
 * URL 직접 입력으로 진입한 일반 직원도 toast + 홈 리다이렉트로 처리.
 */
export function AdminGuard({ children, requireSuperAdmin = false }: AdminGuardProps) {
  const { user, isLoading, isAuthenticated } = useAuth();
  const { enqueueSnackbar } = useSnackbar();
  const { t } = useTranslation();
  const toastShownRef = useRef(false);

  const allowed = !!user && (requireSuperAdmin
    ? user.role === 'super_admin'
    : HR_ROLES.has(user.role));

  useEffect(() => {
    if (isLoading) return;
    if (!isAuthenticated) return; // ProtectedRoute 가 별도 처리
    if (!user) return; // me 아직 로드 전 (isLoading=false 인데 user null 인 짧은 갭)
    if (!allowed && !toastShownRef.current) {
      toastShownRef.current = true;
      enqueueSnackbar(t('admin.forbidden'), { variant: 'error' });
    }
  }, [allowed, enqueueSnackbar, isAuthenticated, isLoading, t, user]);

  if (isLoading) return <>{children}</>;
  if (!isAuthenticated) return <Navigate to="/login" replace />;
  // user 가 아직 도착 전이면 children 그대로 (children 내부 guard 가짐)
  if (!user) return <>{children}</>;
  if (!allowed) return <Navigate to="/" replace />;
  return <>{children}</>;
}
