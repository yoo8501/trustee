package expensereport

import (
	"context"
	"errors"
	"time"

	dbq "github.com/sjseo/docflow/backend/internal/db/sqlc"
)

// Sprint 7 - Red 단계 skeleton. Green 단계에서 채워진다.

var (
	ErrInvalidAmount         = errors.New("expense_report: invalid amount")
	ErrVendorRequired        = errors.New("expense_report: vendor required")
	ErrPurposeRequired       = errors.New("expense_report: purpose required")
	ErrInvalidPaidAt         = errors.New("expense_report: invalid paid_at")
	ErrRequesterNotFound     = errors.New("expense_report: requester not found")
	ErrApproverUnassigned    = errors.New("expense_report: approver unassigned")
	ErrExpenseReportNotFound = errors.New("expense_report: not found")
	ErrApprovalInvalidState  = errors.New("expense_report: approval invalid state")
	ErrForbidden             = errors.New("expense_report: forbidden")
	ErrRejectReasonRequired  = errors.New("expense_report: reject reason required")

	errNotImplemented = errors.New("expense_report: not implemented (red phase)")
)

type ApproverResolver interface {
	Resolve(ctx context.Context, baseApprover int64, at time.Time, docType string) int64
	IsDelegate(ctx context.Context, originalApprover, actorID int64, at time.Time, docType string) bool
}

type Service struct{}

func NewService(_ Store, _ TxManager, _ ApproverResolver) *Service { return &Service{} }
func NewServiceWithClock(_ Store, _ TxManager, _ ApproverResolver, _ func() time.Time) *Service {
	return &Service{}
}

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
	ApproverID      int64
	DecidedAt       *time.Time
	DecisionComment string
	CreatedAt       time.Time
	UpdatedAt       time.Time
}

type CreateInput struct {
	TenantID    int64
	RequesterID int64
	AmountWon   int64
	Vendor      string
	Purpose     string
	PaidAt      time.Time
}

type ListInput struct{ Page, Size int32 }
type ListResult struct {
	Items []View
	Total int64
}

func (s *Service) Create(_ context.Context, _ CreateInput) (View, error) {
	return View{}, errNotImplemented
}
func (s *Service) Get(_ context.Context, _, _, _ int64, _ bool) (View, error) {
	return View{}, errNotImplemented
}
func (s *Service) GetRaw(_ context.Context, _, _ int64) (dbq.ExpenseReport, error) {
	return dbq.ExpenseReport{}, errNotImplemented
}
func (s *Service) CanView(_ context.Context, _ dbq.ExpenseReport, _ int64, _ bool) bool {
	return false
}
func (s *Service) UpdateAttachmentURL(_ context.Context, _, _ int64, _ string) (View, error) {
	return View{}, errNotImplemented
}
func (s *Service) MyList(_ context.Context, _, _ int64, _ ListInput) (ListResult, error) {
	return ListResult{}, errNotImplemented
}
func (s *Service) PendingList(_ context.Context, _, _ int64, _ ListInput) (ListResult, error) {
	return ListResult{}, errNotImplemented
}
func (s *Service) Approve(_ context.Context, _, _, _ int64, _ string) (View, error) {
	return View{}, errNotImplemented
}
func (s *Service) Reject(_ context.Context, _, _, _ int64, _ string) (View, error) {
	return View{}, errNotImplemented
}
func (s *Service) Cancel(_ context.Context, _, _, _ int64) (View, error) {
	return View{}, errNotImplemented
}
