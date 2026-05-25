package expensereport

import (
	"context"
	"errors"
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
	// ErrInvalidAmount — amount_won <= 0.
	ErrInvalidAmount = errors.New("expense_report: invalid amount")
	// ErrVendorRequired — vendor 빈 문자열.
	ErrVendorRequired = errors.New("expense_report: vendor required")
	// ErrPurposeRequired — purpose 빈 문자열.
	ErrPurposeRequired = errors.New("expense_report: purpose required")
	// ErrInvalidPaidAt — paid_at zero/미래 등.
	ErrInvalidPaidAt = errors.New("expense_report: invalid paid_at")
	// ErrRequesterNotFound — requester user 가 없음.
	ErrRequesterNotFound = errors.New("expense_report: requester not found")
	// ErrApproverUnassigned — manager 도 team lead 도 지정되지 않음.
	ErrApproverUnassigned = errors.New("expense_report: approver unassigned")
	// ErrExpenseReportNotFound — 단건 조회 / 결재 / 취소 시 미존재.
	ErrExpenseReportNotFound = errors.New("expense_report: not found")
	// ErrApprovalInvalidState — 이미 결재 완료된 신청을 재승인/재반려/취소 시도.
	ErrApprovalInvalidState = errors.New("expense_report: approval invalid state")
	// ErrForbidden — 다른 사람의 결재함을 건드리거나, 본인 외 cancel 시도.
	ErrForbidden = errors.New("expense_report: forbidden")
	// ErrRejectReasonRequired — Reject 시 comment 가 빈 문자열.
	ErrRejectReasonRequired = errors.New("expense_report: reject reason required")
)

// ApproverResolver — Service.Create 가 approver_id 결정 시점에 호출.
// delegation.Resolver 가 만족.
type ApproverResolver interface {
	Resolve(ctx context.Context, baseApprover int64, at time.Time, docType string) int64
	IsDelegate(ctx context.Context, originalApprover, actorID int64, at time.Time, docType string) bool
}

// noopResolver — Sprint 7 default. Resolve 는 baseApprover 그대로, IsDelegate 는 동일성만.
type noopResolver struct{}

func (noopResolver) Resolve(_ context.Context, baseApprover int64, _ time.Time, _ string) int64 {
	return baseApprover
}
func (noopResolver) IsDelegate(_ context.Context, originalApprover, actorID int64, _ time.Time, _ string) bool {
	return originalApprover == actorID
}

// NewNotification — notification.NewNotification 미러 (cycle 방지).
type NewNotification struct {
	Type       string
	Title      string
	Body       string
	RelatedURL string
}

// Notifier — expensereport 가 의존하는 알림 트리거 (Sprint 8).
type Notifier interface {
	Notify(ctx context.Context, tenantID, userID int64, n NewNotification) error
}

type noopNotifier struct{}

func (noopNotifier) Notify(_ context.Context, _, _ int64, _ NewNotification) error { return nil }

// Service — 지출결의서 도메인 service.
type Service struct {
	store    Store
	tx       TxManager
	resolver ApproverResolver
	notifier Notifier
	clock    func() time.Time
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
	AmountWon       int64
	Vendor          string
	Purpose         string
	PaidAt          time.Time
	AttachmentURL   string
	Status          string
	ApproverID      int64 // 0 if NULL
	DecidedAt       *time.Time
	DecisionComment string
	CreatedAt       time.Time
	UpdatedAt       time.Time
}

func toView(r dbq.ExpenseReport) View {
	v := View{
		ID:          r.ID,
		TenantID:    r.TenantID,
		RequesterID: r.RequesterID,
		AmountWon:   r.AmountWon,
		Vendor:      r.Vendor,
		Purpose:     r.Purpose,
		Status:      string(r.Status),
	}
	if r.PaidAt.Valid {
		v.PaidAt = r.PaidAt.Time
	}
	if r.AttachmentUrl.Valid {
		v.AttachmentURL = r.AttachmentUrl.String
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

// CreateInput — 지출결의서 신청 입력.
type CreateInput struct {
	TenantID    int64
	RequesterID int64
	AmountWon   int64
	Vendor      string
	Purpose     string
	PaidAt      time.Time
}

// Create — 지출결의서 신청 등록.
//
// 검증 순서:
//  1. amount_won > 0.
//  2. vendor / purpose trim 후 비어있지 않음.
//  3. paid_at 유효 (zero 아님).
//  4. requester 존재.
//  5. baseApprover 결정 (manager > team_lead) → 위임 매칭.
//  6. INSERT.
func (s *Service) Create(ctx context.Context, in CreateInput) (View, error) {
	if in.AmountWon <= 0 {
		return View{}, ErrInvalidAmount
	}
	if strings.TrimSpace(in.Vendor) == "" {
		return View{}, ErrVendorRequired
	}
	if strings.TrimSpace(in.Purpose) == "" {
		return View{}, ErrPurposeRequired
	}
	if in.PaidAt.IsZero() {
		return View{}, ErrInvalidPaidAt
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

	baseApprover := resolveBaseApprover(ctx, s.store, requester, in.TenantID)
	if baseApprover == 0 {
		return View{}, ErrApproverUnassigned
	}
	approverID := s.resolver.Resolve(ctx, baseApprover, s.now(), "expense_report")
	if approverID == 0 {
		approverID = baseApprover
	}

	created, err := s.store.CreateExpenseReport(ctx, dbq.CreateExpenseReportParams{
		TenantID:    in.TenantID,
		RequesterID: in.RequesterID,
		AmountWon:   in.AmountWon,
		Vendor:      strings.TrimSpace(in.Vendor),
		Purpose:     strings.TrimSpace(in.Purpose),
		PaidAt:      pgtype.Date{Time: in.PaidAt, Valid: true},
		ApproverID:  pgtype.Int8{Int64: approverID, Valid: true},
	})
	if err != nil {
		return View{}, err
	}

	// Sprint 8: 결재자에게 알림 (best-effort).
	_ = s.notifier.Notify(ctx, in.TenantID, approverID, NewNotification{
		Type:       "expense_report_submitted",
		Title:      "지출결의 결재 요청",
		Body:       requester.Name + " 님의 지출결의가 도착했습니다.",
		RelatedURL: "/approvals/expense-reports/" + strconv.FormatInt(created.ID, 10),
	})

	return toView(created), nil
}

// resolveBaseApprover — manager_id 우선, 없으면 team.team_lead_id.
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
	r, err := s.store.GetExpenseReportByID(ctx, dbq.GetExpenseReportByIDParams{
		ID: id, TenantID: tenantID,
	})
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			return View{}, ErrExpenseReportNotFound
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
	originalApprover := int64(0)
	if r.ApproverID.Valid {
		originalApprover = r.ApproverID.Int64
	}
	if originalApprover != 0 && s.resolver.IsDelegate(ctx, originalApprover, actorID, s.now(), "expense_report") {
		return toView(r), nil
	}
	return View{}, ErrForbidden
}

// GetRaw — 첨부 핸들러가 권한 검증 + raw row 둘 다 필요해서 노출.
func (s *Service) GetRaw(ctx context.Context, id, tenantID int64) (dbq.ExpenseReport, error) {
	r, err := s.store.GetExpenseReportByID(ctx, dbq.GetExpenseReportByIDParams{
		ID: id, TenantID: tenantID,
	})
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			return dbq.ExpenseReport{}, ErrExpenseReportNotFound
		}
		return dbq.ExpenseReport{}, err
	}
	return r, nil
}

// CanView — 첨부 다운로드 권한 확인 helper.
//
// 본인 / 결재자 / HR+ / 위임자 모두 true.
func (s *Service) CanView(ctx context.Context, r dbq.ExpenseReport, actorID int64, hrOrAbove bool) bool {
	if hrOrAbove {
		return true
	}
	if r.RequesterID == actorID {
		return true
	}
	if r.ApproverID.Valid && r.ApproverID.Int64 == actorID {
		return true
	}
	originalApprover := int64(0)
	if r.ApproverID.Valid {
		originalApprover = r.ApproverID.Int64
	}
	if originalApprover != 0 && s.resolver.IsDelegate(ctx, originalApprover, actorID, s.now(), "expense_report") {
		return true
	}
	return false
}

// UpdateAttachmentURL — 첨부 업로드 후 url 갱신. handler 가 권한 검증 후 호출.
func (s *Service) UpdateAttachmentURL(ctx context.Context, id, tenantID int64, url string) (View, error) {
	updated, err := s.store.UpdateExpenseReportAttachment(ctx, dbq.UpdateExpenseReportAttachmentParams{
		ID:            id,
		TenantID:      tenantID,
		AttachmentUrl: pgtype.Text{String: url, Valid: url != ""},
	})
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			return View{}, ErrExpenseReportNotFound
		}
		return View{}, err
	}
	return toView(updated), nil
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

	rows, err := s.store.ListExpenseReportsByRequester(ctx, dbq.ListExpenseReportsByRequesterParams{
		RequesterID: requesterID,
		TenantID:    tenantID,
		Limit:       size,
		Offset:      offset,
	})
	if err != nil {
		return ListResult{}, err
	}
	total, err := s.store.CountExpenseReportsByRequester(ctx, dbq.CountExpenseReportsByRequesterParams{
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

	rows, err := s.store.ListPendingExpenseReportsByApprover(ctx, dbq.ListPendingExpenseReportsByApproverParams{
		ApproverID: pgtype.Int8{Int64: approverID, Valid: true},
		TenantID:   tenantID,
		Limit:      size,
		Offset:     offset,
	})
	if err != nil {
		return ListResult{}, err
	}
	total, err := s.store.CountPendingExpenseReportsByApprover(ctx, dbq.CountPendingExpenseReportsByApproverParams{
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
//  1. SELECT FOR UPDATE expense_report.
//  2. status == 'pending' 검증 → 아니면 ErrApprovalInvalidState.
//  3. approver_id == actorID 또는 actorID 가 활성 위임자 → 아니면 ErrForbidden.
//  4. UpdateExpenseReportDecision — status='approved', approver_id=actorID, decided_at=now, comment.
func (s *Service) Approve(ctx context.Context, id, actorID, tenantID int64, comment string) (View, error) {
	var out View
	var requesterID int64
	err := s.tx.WithTx(ctx, func(tx TxStore) error {
		r, err := tx.GetExpenseReportForUpdate(ctx, dbq.GetExpenseReportForUpdateParams{
			ID: id, TenantID: tenantID,
		})
		if err != nil {
			if errors.Is(err, pgx.ErrNoRows) {
				return ErrExpenseReportNotFound
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
		if !(originalApprover == actorID || s.resolver.IsDelegate(ctx, originalApprover, actorID, s.now(), "expense_report")) {
			return ErrForbidden
		}

		now := s.now()
		commentText := pgtype.Text{}
		if strings.TrimSpace(comment) != "" {
			commentText = pgtype.Text{String: strings.TrimSpace(comment), Valid: true}
		}
		updated, err := tx.UpdateExpenseReportDecision(ctx, dbq.UpdateExpenseReportDecisionParams{
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

	// Sprint 8: 신청자에게 알림.
	if requesterID != 0 {
		_ = s.notifier.Notify(ctx, tenantID, requesterID, NewNotification{
			Type:       "expense_report_approved",
			Title:      "지출결의가 승인되었습니다",
			Body:       "신청하신 지출결의가 승인되었습니다.",
			RelatedURL: "/my/expense-reports/" + strconv.FormatInt(id, 10),
		})
	}

	return out, nil
}

// ---------- Reject ----------

// Reject — 결재 반려. comment 필수.
func (s *Service) Reject(ctx context.Context, id, actorID, tenantID int64, comment string) (View, error) {
	trimmed := strings.TrimSpace(comment)
	if trimmed == "" {
		return View{}, ErrRejectReasonRequired
	}

	var out View
	var requesterID int64
	err := s.tx.WithTx(ctx, func(tx TxStore) error {
		r, err := tx.GetExpenseReportForUpdate(ctx, dbq.GetExpenseReportForUpdateParams{
			ID: id, TenantID: tenantID,
		})
		if err != nil {
			if errors.Is(err, pgx.ErrNoRows) {
				return ErrExpenseReportNotFound
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
		if !(originalApprover == actorID || s.resolver.IsDelegate(ctx, originalApprover, actorID, s.now(), "expense_report")) {
			return ErrForbidden
		}

		now := s.now()
		updated, err := tx.UpdateExpenseReportDecision(ctx, dbq.UpdateExpenseReportDecisionParams{
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
			Type:       "expense_report_rejected",
			Title:      "지출결의가 반려되었습니다",
			Body:       "신청하신 지출결의가 반려되었습니다. 사유: " + trimmed,
			RelatedURL: "/my/expense-reports/" + strconv.FormatInt(id, 10),
		})
	}

	return out, nil
}

// ---------- Cancel ----------

// Cancel — 본인이 pending 상태일 때만.
func (s *Service) Cancel(ctx context.Context, id, actorID, tenantID int64) (View, error) {
	r, err := s.store.GetExpenseReportByID(ctx, dbq.GetExpenseReportByIDParams{
		ID: id, TenantID: tenantID,
	})
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			return View{}, ErrExpenseReportNotFound
		}
		return View{}, err
	}
	if r.RequesterID != actorID {
		return View{}, ErrForbidden
	}
	if r.Status != dbq.LeaveRequestStatusPending {
		return View{}, ErrApprovalInvalidState
	}

	updated, err := s.store.CancelExpenseReport(ctx, dbq.CancelExpenseReportParams{
		ID: id, TenantID: tenantID, RequesterID: actorID,
	})
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
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
