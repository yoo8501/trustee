import { LeaveRequestForm } from '../../features/leaverequest';

/**
 * /leave/new — 휴가 신청 페이지.
 *
 * ProtectedRoute 가 라우트 트리에서 감싼다. 본 컴포넌트는 폼만 담당.
 */
export function LeaveNewPage() {
  return <LeaveRequestForm />;
}
