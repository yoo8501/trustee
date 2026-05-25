import { ExpenseForm } from '../../features/expensereport';

/**
 * /expense/new — 지출결의서 신청 페이지 (Sprint 7).
 *
 * ProtectedRoute 가 라우트 트리에서 감싼다.
 */
export function ExpenseNewPage() {
  return <ExpenseForm />;
}
