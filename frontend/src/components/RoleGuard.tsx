import type { ReactNode } from 'react';

/**
 * RoleGuard — 역할 기반 라우트 가드. team_lead+ 등 위계 비교에 사용.
 * 구현 예정 (Green commit).
 */
export function RoleGuard(_props: {
  minRole: 'general' | 'team_lead' | 'dept_head' | 'hr_manager' | 'super_admin';
  children: ReactNode;
}): React.ReactElement {
  throw new Error('RoleGuard not implemented');
}
