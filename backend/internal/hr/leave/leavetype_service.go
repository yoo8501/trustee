package leave

import (
	"context"
	"errors"
	"strings"

	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgtype"

	dbq "github.com/sjseo/docflow/backend/internal/db/sqlc"
)

// Sentinel errors (LeaveType).
var (
	// ErrLeaveTypeNotFound — 단건 조회 / 수정 / 삭제 시 미존재.
	ErrLeaveTypeNotFound = errors.New("leave_type: not found")
	// ErrLeaveTypeCodeDuplicate — tenant 내 같은 code 가 이미 존재.
	ErrLeaveTypeCodeDuplicate = errors.New("leave_type: code duplicate")
	// ErrLeaveTypeInvalidInput — code/name/default_hours 등 기본 입력 검증 실패.
	ErrLeaveTypeInvalidInput = errors.New("leave_type: invalid input")
)

// LeaveTypeStore — leave_type service 의 DB 의존성. sqlc Querier 부분 집합.
type LeaveTypeStore interface {
	GetLeaveTypeByID(ctx context.Context, arg dbq.GetLeaveTypeByIDParams) (dbq.LeaveType, error)
	GetLeaveTypeByCode(ctx context.Context, arg dbq.GetLeaveTypeByCodeParams) (dbq.LeaveType, error)
	ListLeaveTypes(ctx context.Context, arg dbq.ListLeaveTypesParams) ([]dbq.LeaveType, error)
	CountLeaveTypes(ctx context.Context, tenantID int64) (int64, error)
	CreateLeaveType(ctx context.Context, arg dbq.CreateLeaveTypeParams) (dbq.LeaveType, error)
	UpdateLeaveType(ctx context.Context, arg dbq.UpdateLeaveTypeParams) (dbq.LeaveType, error)
	SoftDeleteLeaveType(ctx context.Context, arg dbq.SoftDeleteLeaveTypeParams) error
}

// 컴파일타임 만족 검증.
var _ LeaveTypeStore = (*dbq.Queries)(nil)

// LeaveTypeService — 휴가 종류 CRUD.
type LeaveTypeService struct {
	store LeaveTypeStore
}

// NewLeaveTypeService — store 주입.
func NewLeaveTypeService(store LeaveTypeStore) *LeaveTypeService {
	return &LeaveTypeService{store: store}
}

// LeaveTypeView — service / handler 가 주고받는 도메인 표현.
type LeaveTypeView struct {
	ID            int64
	TenantID      int64
	Code          string
	Name          string
	DefaultHours  float64
	AccrualPolicy AccrualPolicy
	IsPaid        bool
	IsActive      bool
}

func toView(t dbq.LeaveType) (LeaveTypeView, error) {
	pol, err := ParseAccrualPolicy(t.AccrualPolicy)
	if err != nil {
		return LeaveTypeView{}, err
	}
	return LeaveTypeView{
		ID:            t.ID,
		TenantID:      t.TenantID,
		Code:          t.Code,
		Name:          t.Name,
		DefaultHours:  numericToFloat(t.DefaultHours),
		AccrualPolicy: pol,
		IsPaid:        t.IsPaid,
		IsActive:      t.IsActive,
	}, nil
}

// Get — 단건 조회.
func (s *LeaveTypeService) Get(ctx context.Context, id, tenantID int64) (LeaveTypeView, error) {
	t, err := s.store.GetLeaveTypeByID(ctx, dbq.GetLeaveTypeByIDParams{ID: id, TenantID: tenantID})
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			return LeaveTypeView{}, ErrLeaveTypeNotFound
		}
		return LeaveTypeView{}, err
	}
	return toView(t)
}

// ListInput — 목록 입력 (1-based page).
type ListLeaveTypeInput struct {
	Page int32
	Size int32
}

// ListResult — 목록 결과.
type ListLeaveTypeResult struct {
	Items []LeaveTypeView
	Total int64
}

// List — 휴가 종류 목록 (tenant scoped, soft-deleted 제외).
func (s *LeaveTypeService) List(ctx context.Context, tenantID int64, in ListLeaveTypeInput) (ListLeaveTypeResult, error) {
	if in.Page < 1 {
		in.Page = 1
	}
	if in.Size < 1 || in.Size > 200 {
		in.Size = 50
	}
	offset := (in.Page - 1) * in.Size

	items, err := s.store.ListLeaveTypes(ctx, dbq.ListLeaveTypesParams{
		TenantID: tenantID, Limit: in.Size, Offset: offset,
	})
	if err != nil {
		return ListLeaveTypeResult{}, err
	}
	total, err := s.store.CountLeaveTypes(ctx, tenantID)
	if err != nil {
		return ListLeaveTypeResult{}, err
	}
	out := make([]LeaveTypeView, 0, len(items))
	for _, t := range items {
		v, err := toView(t)
		if err != nil {
			return ListLeaveTypeResult{}, err
		}
		out = append(out, v)
	}
	return ListLeaveTypeResult{Items: out, Total: total}, nil
}

// CreateInput — 생성 입력.
type CreateLeaveTypeInput struct {
	TenantID      int64
	Code          string
	Name          string
	DefaultHours  float64
	AccrualPolicy AccrualPolicy
	IsPaid        bool
	IsActive      bool
}

// Create — 휴가 종류 생성.
func (s *LeaveTypeService) Create(ctx context.Context, in CreateLeaveTypeInput) (LeaveTypeView, error) {
	in.Code = strings.TrimSpace(in.Code)
	in.Name = strings.TrimSpace(in.Name)
	if in.Code == "" || in.Name == "" {
		return LeaveTypeView{}, ErrLeaveTypeInvalidInput
	}
	if in.DefaultHours <= 0 || in.DefaultHours > 24 {
		return LeaveTypeView{}, ErrLeaveTypeInvalidInput
	}
	if err := in.AccrualPolicy.Validate(); err != nil {
		return LeaveTypeView{}, err
	}

	// code duplicate 사전 검사 — UNIQUE constraint 위반은 다른 에러로 변환.
	existing, err := s.store.GetLeaveTypeByCode(ctx, dbq.GetLeaveTypeByCodeParams{
		Code: in.Code, TenantID: in.TenantID,
	})
	if err != nil && !errors.Is(err, pgx.ErrNoRows) {
		return LeaveTypeView{}, err
	}
	if err == nil && existing.ID != 0 {
		return LeaveTypeView{}, ErrLeaveTypeCodeDuplicate
	}

	policyJSON, err := MarshalAccrualPolicy(in.AccrualPolicy)
	if err != nil {
		return LeaveTypeView{}, err
	}

	created, err := s.store.CreateLeaveType(ctx, dbq.CreateLeaveTypeParams{
		TenantID:      in.TenantID,
		Code:          in.Code,
		Name:          in.Name,
		DefaultHours:  numericFromFloat(in.DefaultHours),
		AccrualPolicy: policyJSON,
		IsPaid:        in.IsPaid,
		IsActive:      in.IsActive,
	})
	if err != nil {
		return LeaveTypeView{}, err
	}
	return toView(created)
}

// UpdateInput — 수정 입력. nil 필드는 미변경.
type UpdateLeaveTypeInput struct {
	ID            int64
	TenantID      int64
	Name          *string
	DefaultHours  *float64
	AccrualPolicy *AccrualPolicy
	IsPaid        *bool
	IsActive      *bool
}

// Update — 휴가 종류 수정.
func (s *LeaveTypeService) Update(ctx context.Context, in UpdateLeaveTypeInput) (LeaveTypeView, error) {
	params := dbq.UpdateLeaveTypeParams{ID: in.ID, TenantID: in.TenantID}
	if in.Name != nil {
		name := strings.TrimSpace(*in.Name)
		if name == "" {
			return LeaveTypeView{}, ErrLeaveTypeInvalidInput
		}
		params.Name = pgtype.Text{String: name, Valid: true}
	}
	if in.DefaultHours != nil {
		if *in.DefaultHours <= 0 || *in.DefaultHours > 24 {
			return LeaveTypeView{}, ErrLeaveTypeInvalidInput
		}
		params.DefaultHours = numericFromFloat(*in.DefaultHours)
	}
	if in.AccrualPolicy != nil {
		if err := in.AccrualPolicy.Validate(); err != nil {
			return LeaveTypeView{}, err
		}
		raw, err := MarshalAccrualPolicy(*in.AccrualPolicy)
		if err != nil {
			return LeaveTypeView{}, err
		}
		params.AccrualPolicy = raw
	}
	if in.IsPaid != nil {
		params.IsPaid = pgtype.Bool{Bool: *in.IsPaid, Valid: true}
	}
	if in.IsActive != nil {
		params.IsActive = pgtype.Bool{Bool: *in.IsActive, Valid: true}
	}
	t, err := s.store.UpdateLeaveType(ctx, params)
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			return LeaveTypeView{}, ErrLeaveTypeNotFound
		}
		return LeaveTypeView{}, err
	}
	return toView(t)
}

// Delete — soft delete.
func (s *LeaveTypeService) Delete(ctx context.Context, id, tenantID int64) error {
	// 존재 확인 — SoftDelete 만으로는 0-row 판별 불가.
	if _, err := s.Get(ctx, id, tenantID); err != nil {
		return err
	}
	return s.store.SoftDeleteLeaveType(ctx, dbq.SoftDeleteLeaveTypeParams{ID: id, TenantID: tenantID})
}
