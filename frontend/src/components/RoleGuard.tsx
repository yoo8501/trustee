import { useEffect, useRef, type ReactNode } from 'react';
import { useSnackbar } from 'notistack';
import { useTranslation } from 'react-i18next';
import { Navigate } from 'react-router';
import { useAuth } from '../features/auth';

const ROLE_RANK: Record<string, number> = {
  general: 0,
  team_lead: 1,
  dept_head: 2,
  hr_manager: 3,
  super_admin: 4,
};

interface RoleGuardProps {
  /** 최소 통과 role. 본 role 이상이어야 children 렌더. */
  minRole: keyof typeof ROLE_RANK;
  children: ReactNode;
}

/**
 * RoleGuard — 역할 기반 라우트 가드.
 *
 * AdminGuard 가 HR/super_admin 만 다뤘던 것과 달리, team_lead+ 등 일반 위계
 * 비교가 필요한 라우트(예: `/leave/approvals`)에서 사용.
 *
 * 동작:
 *  - 토큰 검증 중이면 children 그대로 (children 내부 user-null guard 가정).
 *  - 미인증 → /login.
 *  - 권한 부족 → toast (한 번) + / 로 replace.
 */
export function RoleGuard({ minRole, children }: RoleGuardProps) {
  const { user, isLoading, isAuthenticated } = useAuth();
  const { enqueueSnackbar } = useSnackbar();
  const { t } = useTranslation();
  const toastShownRef = useRef(false);

  const required = ROLE_RANK[minRole];
  const allowed = !!user && (ROLE_RANK[user.role] ?? -1) >= required;

  useEffect(() => {
    if (isLoading) return;
    if (!isAuthenticated) return;
    if (!user) return;
    if (!allowed && !toastShownRef.current) {
      toastShownRef.current = true;
      enqueueSnackbar(t('admin.forbidden'), { variant: 'error' });
    }
  }, [allowed, enqueueSnackbar, isAuthenticated, isLoading, t, user]);

  if (isLoading) return <>{children}</>;
  if (!isAuthenticated) return <Navigate to="/login" replace />;
  if (!user) return <>{children}</>;
  if (!allowed) return <Navigate to="/" replace />;
  return <>{children}</>;
}
