// Package expensereport — 지출결의서 도메인 (Sprint 7).
//
// plan.md §데이터 모델 ExpenseReport:
//
//	requester_id, amount_won, vendor, purpose, paid_at, attachment_url, status,
//	approver_id, decided_at, decision_comment.
//
// 결재 상태의 단일 진실은 expense_reports.status (Sprint 7 P1 — 단일 결재).
// LeaveRequest 와 동일 패턴 — 단순 결재 (잔여 차감 없음) + 첨부 업로드 추가.
//
// 핵심 트랜잭션:
//   - Approve/Reject: SELECT FOR UPDATE → UpdateExpenseReportDecision.
//     단일 row 갱신이지만 동시 결재 race 방지 위해 트랜잭션 + SELECT FOR UPDATE 사용.
package expensereport

import (
	"context"

	dbq "github.com/sjseo/docflow/backend/internal/db/sqlc"
)

// Store — Service 가 트랜잭션 외부에서 사용하는 read-only / 단일 호출 쿼리.
// dbq.Queries 가 만족한다.
type Store interface {
	GetExpenseReportByID(ctx context.Context, arg dbq.GetExpenseReportByIDParams) (dbq.ExpenseReport, error)
	CreateExpenseReport(ctx context.Context, arg dbq.CreateExpenseReportParams) (dbq.ExpenseReport, error)
	CancelExpenseReport(ctx context.Context, arg dbq.CancelExpenseReportParams) (dbq.ExpenseReport, error)
	ListExpenseReportsByRequester(ctx context.Context, arg dbq.ListExpenseReportsByRequesterParams) ([]dbq.ExpenseReport, error)
	CountExpenseReportsByRequester(ctx context.Context, arg dbq.CountExpenseReportsByRequesterParams) (int64, error)
	ListPendingExpenseReportsByApprover(ctx context.Context, arg dbq.ListPendingExpenseReportsByApproverParams) ([]dbq.ExpenseReport, error)
	CountPendingExpenseReportsByApprover(ctx context.Context, arg dbq.CountPendingExpenseReportsByApproverParams) (int64, error)
	UpdateExpenseReportAttachment(ctx context.Context, arg dbq.UpdateExpenseReportAttachmentParams) (dbq.ExpenseReport, error)
	GetUserByID(ctx context.Context, arg dbq.GetUserByIDParams) (dbq.User, error)
	GetTeamByID(ctx context.Context, arg dbq.GetTeamByIDParams) (dbq.Team, error)
}

// TxStore — Approve/Reject 트랜잭션 내부에서 사용 (SELECT FOR UPDATE + UPDATE).
type TxStore interface {
	GetExpenseReportForUpdate(ctx context.Context, arg dbq.GetExpenseReportForUpdateParams) (dbq.ExpenseReport, error)
	UpdateExpenseReportDecision(ctx context.Context, arg dbq.UpdateExpenseReportDecisionParams) (dbq.ExpenseReport, error)
}

// TxManager — 트랜잭션 추상화.
type TxManager interface {
	WithTx(ctx context.Context, fn func(TxStore) error) error
}

// compile-time check
var _ Store = (*dbq.Queries)(nil)
var _ TxStore = (*dbq.Queries)(nil)
