// Package leaverequest — 휴가 신청 도메인 (Sprint 6).
//
// plan.md §데이터 모델 LeaveRequest:
//
//	requester_id, leave_type_id, start_at, end_at, hours, reason, status,
//	approver_id, decided_at, decision_comment.
//
// 결재 상태의 단일 진실은 leave_requests.status (Sprint 6 P1 — 단일 결재).
// 다단계 결재 (P2) 도입 시 별도 approvals 테이블로 이관 가능하지만, P1 에서는
// 1:1 매핑이라 status 컬럼을 본 테이블에 둔다.
//
// 핵심 트랜잭션:
//   - Approve: SELECT FOR UPDATE → IncrementLeaveBalanceUsed → UpdateLeaveRequestDecision.
//     세 step 이 원자적이어야 동시 승인 / 잔여 race 방지.
package leaverequest

import (
	"context"

	dbq "github.com/sjseo/docflow/backend/internal/db/sqlc"
)

// Store — Service 가 트랜잭션 외부에서 사용하는 read-only / 단일 호출 쿼리.
// dbq.Queries 가 만족한다.
type Store interface {
	GetLeaveRequestByID(ctx context.Context, arg dbq.GetLeaveRequestByIDParams) (dbq.LeaveRequest, error)
	CreateLeaveRequest(ctx context.Context, arg dbq.CreateLeaveRequestParams) (dbq.LeaveRequest, error)
	FindOverlappingLeaveRequests(ctx context.Context, arg dbq.FindOverlappingLeaveRequestsParams) ([]dbq.LeaveRequest, error)
	CancelLeaveRequest(ctx context.Context, arg dbq.CancelLeaveRequestParams) (dbq.LeaveRequest, error)
	ListLeaveRequestsByRequester(ctx context.Context, arg dbq.ListLeaveRequestsByRequesterParams) ([]dbq.LeaveRequest, error)
	CountLeaveRequestsByRequester(ctx context.Context, arg dbq.CountLeaveRequestsByRequesterParams) (int64, error)
	ListPendingLeaveRequestsByApprover(ctx context.Context, arg dbq.ListPendingLeaveRequestsByApproverParams) ([]dbq.LeaveRequest, error)
	CountPendingLeaveRequestsByApprover(ctx context.Context, arg dbq.CountPendingLeaveRequestsByApproverParams) (int64, error)
	GetLeaveBalanceForUserTypeYear(ctx context.Context, arg dbq.GetLeaveBalanceForUserTypeYearParams) (dbq.LeaveBalance, error)
	GetUserByID(ctx context.Context, arg dbq.GetUserByIDParams) (dbq.User, error)
	GetTeamByID(ctx context.Context, arg dbq.GetTeamByIDParams) (dbq.Team, error)
	GetLeaveTypeByID(ctx context.Context, arg dbq.GetLeaveTypeByIDParams) (dbq.LeaveType, error)
}

// TxStore — Approve 트랜잭션 내부에서 사용하는 쿼리 (SELECT FOR UPDATE + UPSERT + UPDATE).
// dbq.Queries 가 만족하므로 (TxManager.WithTx 가 *dbq.Queries 를 넘김) 별도 구현 불필요.
type TxStore interface {
	GetLeaveRequestForUpdate(ctx context.Context, arg dbq.GetLeaveRequestForUpdateParams) (dbq.LeaveRequest, error)
	IncrementLeaveBalanceUsed(ctx context.Context, arg dbq.IncrementLeaveBalanceUsedParams) (dbq.LeaveBalance, error)
	UpdateLeaveRequestDecision(ctx context.Context, arg dbq.UpdateLeaveRequestDecisionParams) (dbq.LeaveRequest, error)
	GetLeaveBalanceForUserTypeYear(ctx context.Context, arg dbq.GetLeaveBalanceForUserTypeYearParams) (dbq.LeaveBalance, error)
}

// TxManager — 트랜잭션 추상화.
//
// 프로덕션 구현은 pgxpool.Pool 위에서 Begin → 커밋/롤백 → *dbq.Queries 로 wrap.
// 테스트는 fake store 가 (1) WithTx 가 호출자 콜백을 그대로 실행 + 자기 자신을 TxStore 로
// 전달, (2) 콜백 에러 시 in-memory rollback 시뮬레이션, 으로 구현한다.
type TxManager interface {
	WithTx(ctx context.Context, fn func(TxStore) error) error
}

// compile-time check
var _ Store = (*dbq.Queries)(nil)
var _ TxStore = (*dbq.Queries)(nil)
