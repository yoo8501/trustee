package leaverequest

import (
	"context"
	"errors"
	"math/big"
	"strconv"
	"strings"
	"time"

	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgtype"

	dbq "github.com/sjseo/docflow/backend/internal/db/sqlc"
	"github.com/sjseo/docflow/backend/internal/hr/leave"
)

// Sentinel errors. handler 가 ErrorCode 매핑에 사용.
var (
	// ErrInvalidDateRange — start_at > end_at, 또는 hours <= 0.
	ErrInvalidDateRange = errors.New("leave_request: invalid date range")
	// ErrDuplicateLeaveDate — 같은 requester 의 pending|approved 신청과 [start_at, end_at] 겹침.
	ErrDuplicateLeaveDate = errors.New("leave_request: duplicate date")
	// ErrLeaveTypeNotFound — 지정한 leave_type 이 없거나 비활성.
	ErrLeaveTypeNotFound = errors.New("leave_request: leave type not found")
	// ErrRequesterNotFound — requester user 가 없음 (race).
	ErrRequesterNotFound = errors.New("leave_request: requester not found")
	// ErrApproverUnassigned — manager 도 team lead 도 지정되지 않음 → 결재자 없음.
	ErrApproverUnassigned = errors.New("leave_request: approver unassigned")
	// ErrLeaveRequestNotFound — 단건 조회 / 결재 / 취소 시 미존재.
	ErrLeaveRequestNotFound = errors.New("leave_request: not found")
	// ErrApprovalInvalidState — 이미 결재 완료된 신청을 재승인/재반려/취소 시도.
	ErrApprovalInvalidState = errors.New("leave_request: approval invalid state")
	// ErrForbidden — 다른 사람의 결재함을 건드리거나, 본인 외 cancel 시도.
	ErrForbidden = errors.New("leave_request: forbidden")
	// ErrRejectReasonRequired — Reject 시 comment 가 빈 문자열.
	ErrRejectReasonRequired = errors.New("leave_request: reject reason required")
)

// InsufficientBalanceError — 잔여 부족 에러. shortfall_hours 동봉.
// handler 가 errors.As 로 추출해서 details.shortfall_hours 로 반환.
type InsufficientBalanceError struct {
	ShortfallHours float64
}

func (e *InsufficientBalanceError) Error() string {
	return "leave_request: insufficient balance"
}

// IsInsufficientBalance — errors.As wrapper.
func IsInsufficientBalance(err error) (*InsufficientBalanceError, bool) {
	var ibe *InsufficientBalanceError
	if errors.As(err, &ibe) {
		return ibe, true
	}
	return nil, false
}

// ApproverResolver — Service.Create 가 approver_id 결정 시점에 호출.
//
// Resolve(ctx, baseApprover, at, docType) → 활성 위임이 있으면 delegate, 없으면 baseApprover.
// IsDelegate(ctx, originalApprover, actorID, at, docType) → actor 가 위임자/원결재자 여부.
//
// delegation.Resolver 가 만족.
type ApproverResolver interface {
	Resolve(ctx context.Context, baseApprover int64, at time.Time, docType string) int64
	IsDelegate(ctx context.Context, originalApprover, actorID int64, at time.Time, docType string) bool
}

// noopResolver — Sprint 6 default. Resolve 는 baseApprover 그대로, IsDelegate 는 동일성만.
type noopResolver struct{}

func (noopResolver) Resolve(_ context.Context, baseApprover int64, _ time.Time, _ string) int64 {
	return baseApprover
}
func (noopResolver) IsDelegate(_ context.Context, originalApprover, actorID int64, _ time.Time, _ string) bool {
	return originalApprover == actorID
}

// NewNotification — 외부 notification 패키지의 payload 와 동일 shape.
//
// 본 패키지가 notification 패키지에 의존하지 않도록 (cycle 방지 + test fake 주입
// 용이) 동일 필드만 다시 정의. server.go 가 어댑터로 두 타입을 연결한다.
type NewNotification struct {
	Type       string
	Title      string
	Body       string
	RelatedURL string
}

// Notifier — leaverequest 가 의존하는 알림 트리거 인터페이스.
// notification.Notifier 와 시그니처가 동일하므로 어댑터로 연결.
type Notifier interface {
	Notify(ctx context.Context, tenantID, userID int64, n NewNotification) error
}

// noopNotifier — Notifier 가 주입되지 않은 경우 사용. 호출은 모두 nil 반환.
type noopNotifier struct{}

func (noopNotifier) Notify(_ context.Context, _, _ int64, _ NewNotification) error { return nil }

// Service — 휴가 신청 도메인 service.
type Service struct {
	store    Store
	tx       TxManager
	resolver ApproverResolver
	notifier Notifier
	clock    func() time.Time // 테스트 주입. nil → time.Now().In(KST).
}

// NewService — 의존성 주입. resolver==nil 이면 noopResolver (위임 미적용).
// notifier 는 SetNotifier 로 별도 주입 (Sprint 8 도입; 기존 호출자 호환성 유지).
func NewService(store Store, tx TxManager, resolver ApproverResolver) *Service {
	if resolver == nil {
		resolver = noopResolver{}
	}
	return &Service{store: store, tx: tx, resolver: resolver, notifier: noopNotifier{}}
}

// SetNotifier — Sprint 8 notification 트리거용. server.go 가 부트 시점에 주입.
// nil 호출은 무시 (현재 noop 유지).
func (s *Service) SetNotifier(n Notifier) {
	if n == nil {
		return
	}
	s.notifier = n
}

// NewServiceWithClock — 테스트 전용.
func NewServiceWithClock(store Store, tx TxManager, resolver ApproverResolver, clock func() time.Time) *Service {
	s := NewService(store, tx, resolver)
	s.clock = clock
	return s
}

func (s *Service) now() time.Time {
	if s.clock != nil {
		return s.clock()
	}
	return time.Now().In(leave.KSTLocation())
}

// ---------- View ----------

// View — service/handler 도메인 표현.
type View struct {
	ID              int64
	TenantID        int64
	RequesterID     int64
	LeaveTypeID     int64
	StartAt         time.Time
	EndAt           time.Time
	Hours           float64
	Reason          string
	Status          string
	ApproverID      int64 // 0 if NULL
	DecidedAt       *time.Time
	DecisionComment string
	CreatedAt       time.Time
	UpdatedAt       time.Time
}

func toView(r dbq.LeaveRequest) View {
	v := View{
		ID:          r.ID,
		TenantID:    r.TenantID,
		RequesterID: r.RequesterID,
		LeaveTypeID: r.LeaveTypeID,
		Hours:       numericToFloat(r.Hours),
		Status:      string(r.Status),
	}
	if r.StartAt.Valid {
		v.StartAt = r.StartAt.Time
	}
	if r.EndAt.Valid {
		v.EndAt = r.EndAt.Time
	}
	if r.Reason.Valid {
		v.Reason = r.Reason.String
	}
	if r.ApproverID.Valid {
		v.ApproverID = r.ApproverID.Int64
	}
	if r.DecidedAt.Valid {
		t := r.DecidedAt.Time
		v.DecidedAt = &t
	}
	if r.DecisionComment.Valid {
		v.DecisionComment = r.DecisionComment.String
	}
	if r.CreatedAt.Valid {
		v.CreatedAt = r.CreatedAt.Time
	}
	if r.UpdatedAt.Valid {
		v.UpdatedAt = r.UpdatedAt.Time
	}
	return v
}

// ---------- Create ----------

// CreateInput — 휴가 신청 입력.
type CreateInput struct {
	TenantID    int64
	RequesterID int64
	LeaveTypeID int64
	StartAt     time.Time
	EndAt       time.Time
	Hours       float64
	Reason      string
}

// Create — 휴가 신청 등록.
//
// 검증 순서 (FE 친화 — 가장 빠르게 fail 우선):
//  1. start_at > end_at → ErrInvalidDateRange.
//  2. hours <= 0 → ErrInvalidDateRange.
//  3. leave_type 존재 / 활성 검증 → ErrLeaveTypeNotFound.
//  4. requester 존재 → ErrRequesterNotFound.
//  5. 같은 날 중복 (pending|approved) → ErrDuplicateLeaveDate.
//  6. 잔여 부족 → *InsufficientBalanceError{ShortfallHours}.
//  7. baseApprover 결정 (manager > team_lead) → 위임 매칭.
//  8. INSERT.
//
// 트랜잭션은 사용하지 않음 — INSERT 한 번이므로 race 가 발생해도
// (idx_leave_requests_range partial index 가 unique 가 아니라) 두 row 가 들어갈 수 있지만
// (1) 검증 시점과 INSERT 시점 사이의 race 는 매우 드물고 (2) approve 단계에서
// SELECT FOR UPDATE + balance check 로 잡힌다.
func (s *Service) Create(ctx context.Context, in CreateInput) (View, error) {
	if in.StartAt.IsZero() || in.EndAt.IsZero() || in.EndAt.Before(in.StartAt) {
		return View{}, ErrInvalidDateRange
	}
	if in.Hours <= 0 {
		return View{}, ErrInvalidDateRange
	}
	// 의미 없는 과도한 값 방지 — NUMERIC(4,1) 범위 한도 + 한 신청에 9999h 신청 불가.
	if in.Hours > 999.9 {
		return View{}, ErrInvalidDateRange
	}

	lt, err := s.store.GetLeaveTypeByID(ctx, dbq.GetLeaveTypeByIDParams{
		ID: in.LeaveTypeID, TenantID: in.TenantID,
	})
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			return View{}, ErrLeaveTypeNotFound
		}
		return View{}, err
	}
	if !lt.IsActive {
		return View{}, ErrLeaveTypeNotFound
	}

	requester, err := s.store.GetUserByID(ctx, dbq.GetUserByIDParams{
		ID: in.RequesterID, TenantID: in.TenantID,
	})
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			return View{}, ErrRequesterNotFound
		}
		return View{}, err
	}

	// 중복 검증.
	overlap, err := s.store.FindOverlappingLeaveRequests(ctx, dbq.FindOverlappingLeaveRequestsParams{
		RequesterID: in.RequesterID,
		TenantID:    in.TenantID,
		StartAt:     pgTimestamptz(in.StartAt),
		EndAt:       pgTimestamptz(in.EndAt),
	})
	if err != nil {
		return View{}, err
	}
	if len(overlap) > 0 {
		return View{}, ErrDuplicateLeaveDate
	}

	// 잔여 검증 (단, accrual_policy.fixed 이고 is_paid=false 등 일부 type 은 잔여 안 봐도 됨 —
	// 단순화를 위해 항상 검증 + 잔여 row 없으면 0 으로 간주).
	year := int32(in.StartAt.In(leave.KSTLocation()).Year())
	balance, err := s.store.GetLeaveBalanceForUserTypeYear(ctx, dbq.GetLeaveBalanceForUserTypeYearParams{
		UserID:      in.RequesterID,
		LeaveTypeID: in.LeaveTypeID,
		PeriodYear:  year,
		TenantID:    in.TenantID,
	})
	var granted, used float64
	if err == nil {
		granted = numericToFloat(balance.GrantedHours)
		used = numericToFloat(balance.UsedHours)
	} else if !errors.Is(err, pgx.ErrNoRows) {
		return View{}, err
	}
	available := granted - used
	if available < in.Hours {
		return View{}, &InsufficientBalanceError{ShortfallHours: roundHours(in.Hours - available)}
	}

	// approver 결정.
	baseApprover := resolveBaseApprover(ctx, s.store, requester, in.TenantID)
	if baseApprover == 0 {
		return View{}, ErrApproverUnassigned
	}
	approverID := s.resolver.Resolve(ctx, baseApprover, s.now(), "leave_request")
	if approverID == 0 {
		approverID = baseApprover
	}

	// INSERT.
	reasonText := pgtype.Text{}
	if strings.TrimSpace(in.Reason) != "" {
		reasonText = pgtype.Text{String: strings.TrimSpace(in.Reason), Valid: true}
	}
	created, err := s.store.CreateLeaveRequest(ctx, dbq.CreateLeaveRequestParams{
		TenantID:    in.TenantID,
		RequesterID: in.RequesterID,
		LeaveTypeID: in.LeaveTypeID,
		StartAt:     pgTimestamptz(in.StartAt),
		EndAt:       pgTimestamptz(in.EndAt),
		Hours:       numericFromFloat(in.Hours),
		Reason:      reasonText,
		ApproverID:  pgtype.Int8{Int64: approverID, Valid: true},
	})
	if err != nil {
		return View{}, err
	}

	// Sprint 8: 결재자에게 알림 (best-effort — 실패해도 비즈니스 로직 통과).
	_ = s.notifier.Notify(ctx, in.TenantID, approverID, NewNotification{
		Type:       "leave_request_submitted",
		Title:      "휴가 결재 요청",
		Body:       requester.Name + " 님의 휴가 신청이 도착했습니다.",
		RelatedURL: "/approvals/leave-requests/" + strconv.FormatInt(created.ID, 10),
	})

	return toView(created), nil
}

// resolveBaseApprover — manager_id 우선, 없으면 team.team_lead_id.
// 본인 위임은 무시 — 본인이 본인 결재 불가능하면 0 (Forbidden 으로 변환됨).
func resolveBaseApprover(ctx context.Context, store Store, requester dbq.User, tenantID int64) int64 {
	if requester.ManagerID.Valid && requester.ManagerID.Int64 != requester.ID {
		return requester.ManagerID.Int64
	}
	if requester.TeamID.Valid {
		team, err := store.GetTeamByID(ctx, dbq.GetTeamByIDParams{
			ID: requester.TeamID.Int64, TenantID: tenantID,
		})
		if err == nil && team.TeamLeadID.Valid && team.TeamLeadID.Int64 != requester.ID {
			return team.TeamLeadID.Int64
		}
	}
	return 0
}

// ---------- Get / List ----------

// Get — 단건 조회. 본인 / 결재자 / HR+ 만 가능.
func (s *Service) Get(ctx context.Context, id, actorID, tenantID int64, hrOrAbove bool) (View, error) {
	r, err := s.store.GetLeaveRequestByID(ctx, dbq.GetLeaveRequestByIDParams{
		ID: id, TenantID: tenantID,
	})
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			return View{}, ErrLeaveRequestNotFound
		}
		return View{}, err
	}
	if hrOrAbove {
		return toView(r), nil
	}
	if r.RequesterID == actorID {
		return toView(r), nil
	}
	if r.ApproverID.Valid && r.ApproverID.Int64 == actorID {
		return toView(r), nil
	}
	// 위임자도 조회 가능 — IsDelegate 로 검증.
	originalApprover := int64(0)
	if r.ApproverID.Valid {
		originalApprover = r.ApproverID.Int64
	}
	if originalApprover != 0 && s.resolver.IsDelegate(ctx, originalApprover, actorID, s.now(), "leave_request") {
		return toView(r), nil
	}
	return View{}, ErrForbidden
}

// ListInput — 본인 신청 / 결재 대기 목록 공통 입력.
type ListInput struct {
	Page int32
	Size int32
}

// ListResult — 목록 결과.
type ListResult struct {
	Items []View
	Total int64
}

// MyList — 본인 신청 목록.
func (s *Service) MyList(ctx context.Context, requesterID, tenantID int64, in ListInput) (ListResult, error) {
	page, size := normalizePagination(in.Page, in.Size)
	offset := (page - 1) * size

	rows, err := s.store.ListLeaveRequestsByRequester(ctx, dbq.ListLeaveRequestsByRequesterParams{
		RequesterID: requesterID,
		TenantID:    tenantID,
		Limit:       size,
		Offset:      offset,
	})
	if err != nil {
		return ListResult{}, err
	}
	total, err := s.store.CountLeaveRequestsByRequester(ctx, dbq.CountLeaveRequestsByRequesterParams{
		RequesterID: requesterID, TenantID: tenantID,
	})
	if err != nil {
		return ListResult{}, err
	}
	out := make([]View, 0, len(rows))
	for _, r := range rows {
		out = append(out, toView(r))
	}
	return ListResult{Items: out, Total: total}, nil
}

// PendingList — 결재자 대기함 (approver_id == actorID + status='pending').
func (s *Service) PendingList(ctx context.Context, approverID, tenantID int64, in ListInput) (ListResult, error) {
	page, size := normalizePagination(in.Page, in.Size)
	offset := (page - 1) * size

	rows, err := s.store.ListPendingLeaveRequestsByApprover(ctx, dbq.ListPendingLeaveRequestsByApproverParams{
		ApproverID: pgtype.Int8{Int64: approverID, Valid: true},
		TenantID:   tenantID,
		Limit:      size,
		Offset:     offset,
	})
	if err != nil {
		return ListResult{}, err
	}
	total, err := s.store.CountPendingLeaveRequestsByApprover(ctx, dbq.CountPendingLeaveRequestsByApproverParams{
		ApproverID: pgtype.Int8{Int64: approverID, Valid: true},
		TenantID:   tenantID,
	})
	if err != nil {
		return ListResult{}, err
	}
	out := make([]View, 0, len(rows))
	for _, r := range rows {
		out = append(out, toView(r))
	}
	return ListResult{Items: out, Total: total}, nil
}

// ---------- Approve ----------

// Approve — 결재 승인.
//
// 트랜잭션:
//  1. SELECT FOR UPDATE leave_request.
//  2. status == 'pending' 검증 → 아니면 ErrApprovalInvalidState.
//  3. approver_id == actorID 또는 actorID 가 활성 위임자 → 아니면 ErrForbidden.
//  4. balance.granted - balance.used >= hours 재확인 (Create 이후 차감 race) → 부족하면 InsufficientBalance.
//  5. IncrementLeaveBalanceUsed (UPSERT).
//  6. UpdateLeaveRequestDecision — status='approved', approver_id=actorID (위임자 반영), decided_at=now, comment.
func (s *Service) Approve(ctx context.Context, id, actorID, tenantID int64, comment string) (View, error) {
	var out View
	var requesterID int64
	err := s.tx.WithTx(ctx, func(tx TxStore) error {
		r, err := tx.GetLeaveRequestForUpdate(ctx, dbq.GetLeaveRequestForUpdateParams{
			ID: id, TenantID: tenantID,
		})
		if err != nil {
			if errors.Is(err, pgx.ErrNoRows) {
				return ErrLeaveRequestNotFound
			}
			return err
		}
		if r.Status != dbq.LeaveRequestStatusPending {
			return ErrApprovalInvalidState
		}

		originalApprover := int64(0)
		if r.ApproverID.Valid {
			originalApprover = r.ApproverID.Int64
		}
		if !(originalApprover == actorID || s.resolver.IsDelegate(ctx, originalApprover, actorID, s.now(), "leave_request")) {
			return ErrForbidden
		}

		// 잔여 재확인 (트랜잭션 내부 — Create 와 Approve 사이 다른 Approve 가 차감했을 수 있음).
		year := int32(r.StartAt.Time.In(leave.KSTLocation()).Year())
		balance, err := tx.GetLeaveBalanceForUserTypeYear(ctx, dbq.GetLeaveBalanceForUserTypeYearParams{
			UserID:      r.RequesterID,
			LeaveTypeID: r.LeaveTypeID,
			PeriodYear:  year,
			TenantID:    tenantID,
		})
		var granted, used float64
		if err == nil {
			granted = numericToFloat(balance.GrantedHours)
			used = numericToFloat(balance.UsedHours)
		} else if !errors.Is(err, pgx.ErrNoRows) {
			return err
		}
		hours := numericToFloat(r.Hours)
		if granted-used < hours {
			return &InsufficientBalanceError{ShortfallHours: roundHours(hours - (granted - used))}
		}

		// balance 차감.
		if _, err := tx.IncrementLeaveBalanceUsed(ctx, dbq.IncrementLeaveBalanceUsedParams{
			TenantID:    tenantID,
			UserID:      r.RequesterID,
			LeaveTypeID: r.LeaveTypeID,
			PeriodYear:  year,
			UsedHours:   numericFromFloat(hours),
		}); err != nil {
			return err
		}

		// status update.
		now := s.now()
		commentText := pgtype.Text{}
		if strings.TrimSpace(comment) != "" {
			commentText = pgtype.Text{String: strings.TrimSpace(comment), Valid: true}
		}
		updated, err := tx.UpdateLeaveRequestDecision(ctx, dbq.UpdateLeaveRequestDecisionParams{
			ID:              id,
			TenantID:        tenantID,
			Status:          dbq.LeaveRequestStatusApproved,
			ApproverID:      pgtype.Int8{Int64: actorID, Valid: true},
			DecidedAt:       pgtype.Timestamptz{Time: now, Valid: true},
			DecisionComment: commentText,
		})
		if err != nil {
			return err
		}
		out = toView(updated)
		requesterID = updated.RequesterID
		return nil
	})
	if err != nil {
		return View{}, err
	}

	// Sprint 8: 신청자에게 알림 (tx commit 이후 best-effort).
	if requesterID != 0 {
		_ = s.notifier.Notify(ctx, tenantID, requesterID, NewNotification{
			Type:       "leave_request_approved",
			Title:      "휴가 신청이 승인되었습니다",
			Body:       "신청하신 휴가가 승인되었습니다.",
			RelatedURL: "/my/leave-requests/" + strconv.FormatInt(id, 10),
		})
	}

	return out, nil
}

// ---------- Reject ----------

// Reject — 결재 반려. comment 필수.
//
// 트랜잭션으로 처리 — SELECT FOR UPDATE 로 동시 승인/반려 race 방지.
// 잔여 차감 없음.
func (s *Service) Reject(ctx context.Context, id, actorID, tenantID int64, comment string) (View, error) {
	trimmed := strings.TrimSpace(comment)
	if trimmed == "" {
		return View{}, ErrRejectReasonRequired
	}

	var out View
	var requesterID int64
	err := s.tx.WithTx(ctx, func(tx TxStore) error {
		r, err := tx.GetLeaveRequestForUpdate(ctx, dbq.GetLeaveRequestForUpdateParams{
			ID: id, TenantID: tenantID,
		})
		if err != nil {
			if errors.Is(err, pgx.ErrNoRows) {
				return ErrLeaveRequestNotFound
			}
			return err
		}
		if r.Status != dbq.LeaveRequestStatusPending {
			return ErrApprovalInvalidState
		}
		originalApprover := int64(0)
		if r.ApproverID.Valid {
			originalApprover = r.ApproverID.Int64
		}
		if !(originalApprover == actorID || s.resolver.IsDelegate(ctx, originalApprover, actorID, s.now(), "leave_request")) {
			return ErrForbidden
		}

		now := s.now()
		updated, err := tx.UpdateLeaveRequestDecision(ctx, dbq.UpdateLeaveRequestDecisionParams{
			ID:              id,
			TenantID:        tenantID,
			Status:          dbq.LeaveRequestStatusRejected,
			ApproverID:      pgtype.Int8{Int64: actorID, Valid: true},
			DecidedAt:       pgtype.Timestamptz{Time: now, Valid: true},
			DecisionComment: pgtype.Text{String: trimmed, Valid: true},
		})
		if err != nil {
			return err
		}
		out = toView(updated)
		requesterID = updated.RequesterID
		return nil
	})
	if err != nil {
		return View{}, err
	}

	// Sprint 8: 신청자에게 알림.
	if requesterID != 0 {
		_ = s.notifier.Notify(ctx, tenantID, requesterID, NewNotification{
			Type:       "leave_request_rejected",
			Title:      "휴가 신청이 반려되었습니다",
			Body:       "신청하신 휴가가 반려되었습니다. 사유: " + trimmed,
			RelatedURL: "/my/leave-requests/" + strconv.FormatInt(id, 10),
		})
	}

	return out, nil
}

// ---------- Cancel ----------

// Cancel — 본인이 pending 상태일 때만.
//
//   - 본인 외 → ErrForbidden.
//   - pending 아님 → ErrApprovalInvalidState (이미 결재 완료된 건은 별도 결재 필요, P1 미지원).
//   - 미존재 → ErrLeaveRequestNotFound.
func (s *Service) Cancel(ctx context.Context, id, actorID, tenantID int64) (View, error) {
	r, err := s.store.GetLeaveRequestByID(ctx, dbq.GetLeaveRequestByIDParams{
		ID: id, TenantID: tenantID,
	})
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			return View{}, ErrLeaveRequestNotFound
		}
		return View{}, err
	}
	if r.RequesterID != actorID {
		return View{}, ErrForbidden
	}
	if r.Status != dbq.LeaveRequestStatusPending {
		return View{}, ErrApprovalInvalidState
	}

	updated, err := s.store.CancelLeaveRequest(ctx, dbq.CancelLeaveRequestParams{
		ID: id, TenantID: tenantID, RequesterID: actorID,
	})
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			// race — 동시에 결재된 케이스.
			return View{}, ErrApprovalInvalidState
		}
		return View{}, err
	}
	return toView(updated), nil
}

// ---------- helpers ----------

func normalizePagination(page, size int32) (int32, int32) {
	if page < 1 {
		page = 1
	}
	if size < 1 || size > 200 {
		size = 50
	}
	return page, size
}

func pgTimestamptz(t time.Time) pgtype.Timestamptz {
	if t.IsZero() {
		return pgtype.Timestamptz{}
	}
	return pgtype.Timestamptz{Time: t, Valid: true}
}

// numericFromFloat — leave 패키지와 동일 시맨틱 (0.1 단위 반올림).
func numericFromFloat(v float64) pgtype.Numeric {
	rounded := roundHours(v)
	scaled := int64(rounded * 10)
	if rounded < 0 && float64(scaled)/10 != rounded {
		scaled--
	}
	return pgtype.Numeric{Int: big.NewInt(scaled), Exp: -1, Valid: true}
}

func numericToFloat(n pgtype.Numeric) float64 {
	if !n.Valid || n.NaN {
		return 0
	}
	f, err := n.Float64Value()
	if err == nil && f.Valid {
		return f.Float64
	}
	return 0
}

// roundHours — 0.1 단위로 반올림 (NUMERIC(4,1)).
func roundHours(v float64) float64 {
	r := v * 10
	if r >= 0 {
		r += 0.5
	} else {
		r -= 0.5
	}
	return float64(int64(r)) / 10
}
