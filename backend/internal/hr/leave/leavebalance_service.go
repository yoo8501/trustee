package leave

import (
	"context"
	"errors"
	"fmt"
	"strings"
	"time"

	"github.com/jackc/pgx/v5"

	dbq "github.com/sjseo/docflow/backend/internal/db/sqlc"
)

// Sentinel errors (LeaveBalance).
var (
	// ErrLeaveBalanceNotFound — 단건 / 조정 대상이 없음.
	ErrLeaveBalanceNotFound = errors.New("leave_balance: not found")
	// ErrAdjustReasonRequired — 잔여 강제 조정 시 reason 빈 문자열.
	ErrAdjustReasonRequired = errors.New("leave_balance: reason required")
	// ErrAdjustZeroDelta — delta_hours 가 0 (의미 없는 조정).
	ErrAdjustZeroDelta = errors.New("leave_balance: delta must be non-zero")
	// ErrAdjustNegativeResult — 조정 결과 granted_hours 가 음수가 되는 경우.
	ErrAdjustNegativeResult = errors.New("leave_balance: result would be negative")
	// ErrLeaveBalanceTargetUserNotFound — 조정 대상 user 자체가 없거나 tenant 가 다름.
	ErrLeaveBalanceTargetUserNotFound = errors.New("leave_balance: target user not found")
)

// LeaveBalanceStore — leave_balance service 의 DB 의존성.
type LeaveBalanceStore interface {
	GetLeaveBalanceByID(ctx context.Context, arg dbq.GetLeaveBalanceByIDParams) (dbq.LeaveBalance, error)
	GetLeaveBalanceForUserTypeYear(ctx context.Context, arg dbq.GetLeaveBalanceForUserTypeYearParams) (dbq.LeaveBalance, error)
	ListLeaveBalancesByUser(ctx context.Context, arg dbq.ListLeaveBalancesByUserParams) ([]dbq.LeaveBalance, error)
	UpsertLeaveBalanceGrant(ctx context.Context, arg dbq.UpsertLeaveBalanceGrantParams) (dbq.LeaveBalance, error)
	AdjustLeaveBalanceHours(ctx context.Context, arg dbq.AdjustLeaveBalanceHoursParams) (dbq.LeaveBalance, error)
	CreateLeaveBalanceAdjustment(ctx context.Context, arg dbq.CreateLeaveBalanceAdjustmentParams) (dbq.LeaveBalanceAdjustment, error)
	GetUserByID(ctx context.Context, arg dbq.GetUserByIDParams) (dbq.User, error)
	GetLeaveTypeByID(ctx context.Context, arg dbq.GetLeaveTypeByIDParams) (dbq.LeaveType, error)
}

var _ LeaveBalanceStore = (*dbq.Queries)(nil)

// LeaveBalanceService — 잔여 조회 + HR 강제 조정.
//
// 결재 흐름을 통한 used_hours 증가/취소는 Sprint 6 의 LeaveRequest service 가 담당한다.
// 본 service 는 (1) 본인 잔여 조회, (2) HR 강제 조정 audit 로그 작성만 다룬다.
type LeaveBalanceService struct {
	store LeaveBalanceStore
}

// NewLeaveBalanceService — store 주입.
func NewLeaveBalanceService(store LeaveBalanceStore) *LeaveBalanceService {
	return &LeaveBalanceService{store: store}
}

// LeaveBalanceView — service / handler 가 주고받는 도메인 표현.
type LeaveBalanceView struct {
	ID             int64
	UserID         int64
	LeaveTypeID    int64
	LeaveTypeCode  string // optional — set when joined for display.
	LeaveTypeName  string // optional.
	PeriodYear     int32
	GrantedHours   float64
	UsedHours      float64
	RemainingHours float64
	ExpiresAt      *time.Time
}

func toBalanceView(b dbq.LeaveBalance) LeaveBalanceView {
	granted := numericToFloat(b.GrantedHours)
	used := numericToFloat(b.UsedHours)
	v := LeaveBalanceView{
		ID:             b.ID,
		UserID:         b.UserID,
		LeaveTypeID:    b.LeaveTypeID,
		PeriodYear:     b.PeriodYear,
		GrantedHours:   granted,
		UsedHours:      used,
		RemainingHours: granted - used,
	}
	if b.ExpiresAt.Valid {
		t := b.ExpiresAt.Time
		v.ExpiresAt = &t
	}
	return v
}

// ListMyBalances — 본인 잔여 목록 (모든 회계연도, 모든 leave_type).
func (s *LeaveBalanceService) ListMyBalances(ctx context.Context, userID, tenantID int64) ([]LeaveBalanceView, error) {
	rows, err := s.store.ListLeaveBalancesByUser(ctx, dbq.ListLeaveBalancesByUserParams{
		UserID: userID, TenantID: tenantID,
	})
	if err != nil {
		return nil, err
	}
	out := make([]LeaveBalanceView, 0, len(rows))
	for _, b := range rows {
		v := toBalanceView(b)
		// leave_type 메타 결합 (best-effort, 실패는 로그만).
		lt, err := s.store.GetLeaveTypeByID(ctx, dbq.GetLeaveTypeByIDParams{
			ID: b.LeaveTypeID, TenantID: tenantID,
		})
		if err == nil {
			v.LeaveTypeCode = lt.Code
			v.LeaveTypeName = lt.Name
		}
		out = append(out, v)
	}
	return out, nil
}

// AdjustInput — HR 강제 조정 입력.
type AdjustInput struct {
	TenantID    int64
	ActorUserID int64
	TargetUser  int64
	LeaveTypeID int64
	PeriodYear  int32  // 0 이면 현재 연도 (KST) 사용.
	DeltaHours  float64
	Reason      string
}

// AdjustResult — 조정 결과.
type AdjustResult struct {
	Balance      LeaveBalanceView
	AdjustmentID int64
	DeltaHours   float64
}

// Adjust — 잔여 강제 조정 + audit log 기록.
//
//   - reason 빈 문자열 → ErrAdjustReasonRequired.
//   - delta 0 → ErrAdjustZeroDelta.
//   - target user 미존재 / tenant 불일치 → ErrLeaveBalanceTargetUserNotFound.
//   - leave_type 미존재 → ErrLeaveTypeNotFound.
//   - period_year 가 0 이면 KST 현재 연도 사용.
//   - 해당 (user, type, year) 잔여가 없으면 0 granted 로 새로 만든 뒤 조정.
//   - 조정 후 granted_hours 가 음수가 되면 거부 (ErrAdjustNegativeResult).
//
// 본 서비스는 트랜잭션 wrapper 없이 동작 — UPSERT + INSERT 두 step 이 부분 실패하면
// audit log 가 누락될 수 있다. 향후 Sprint 9 audit 정식화 시 tx 도입.
func (s *LeaveBalanceService) Adjust(ctx context.Context, in AdjustInput) (AdjustResult, error) {
	if strings.TrimSpace(in.Reason) == "" {
		return AdjustResult{}, ErrAdjustReasonRequired
	}
	if in.DeltaHours == 0 {
		return AdjustResult{}, ErrAdjustZeroDelta
	}

	// 대상 user 검증 (tenant scope).
	if _, err := s.store.GetUserByID(ctx, dbq.GetUserByIDParams{
		ID: in.TargetUser, TenantID: in.TenantID,
	}); err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			return AdjustResult{}, ErrLeaveBalanceTargetUserNotFound
		}
		return AdjustResult{}, err
	}
	// leave_type 검증.
	lt, err := s.store.GetLeaveTypeByID(ctx, dbq.GetLeaveTypeByIDParams{
		ID: in.LeaveTypeID, TenantID: in.TenantID,
	})
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			return AdjustResult{}, ErrLeaveTypeNotFound
		}
		return AdjustResult{}, err
	}

	periodYear := in.PeriodYear
	if periodYear == 0 {
		periodYear = int32(nowKST().Year())
	}

	// 기존 row 조회 → 없으면 0 granted 로 생성.
	existing, err := s.store.GetLeaveBalanceForUserTypeYear(ctx, dbq.GetLeaveBalanceForUserTypeYearParams{
		UserID: in.TargetUser, LeaveTypeID: in.LeaveTypeID, PeriodYear: periodYear, TenantID: in.TenantID,
	})
	if err != nil && !errors.Is(err, pgx.ErrNoRows) {
		return AdjustResult{}, err
	}
	if errors.Is(err, pgx.ErrNoRows) {
		// 신규 생성 (0 granted).
		existing, err = s.store.UpsertLeaveBalanceGrant(ctx, dbq.UpsertLeaveBalanceGrantParams{
			TenantID:     in.TenantID,
			UserID:       in.TargetUser,
			LeaveTypeID:  in.LeaveTypeID,
			PeriodYear:   periodYear,
			GrantedHours: numericFromFloat(0),
			// ExpiresAt: zero — adjust 자체로는 만료 설정하지 않음.
		})
		if err != nil {
			return AdjustResult{}, err
		}
	}

	// 음수 결과 거부.
	currentGranted := numericToFloat(existing.GrantedHours)
	if currentGranted+in.DeltaHours < 0 {
		return AdjustResult{}, ErrAdjustNegativeResult
	}

	// 조정.
	updated, err := s.store.AdjustLeaveBalanceHours(ctx, dbq.AdjustLeaveBalanceHoursParams{
		DeltaHours: numericFromFloat(in.DeltaHours),
		ID:         existing.ID,
		TenantID:   in.TenantID,
	})
	if err != nil {
		return AdjustResult{}, err
	}

	// audit log.
	adj, err := s.store.CreateLeaveBalanceAdjustment(ctx, dbq.CreateLeaveBalanceAdjustmentParams{
		TenantID:    in.TenantID,
		BalanceID:   updated.ID,
		ActorUserID: in.ActorUserID,
		DeltaHours:  numericFromFloat(in.DeltaHours),
		Reason:      strings.TrimSpace(in.Reason),
	})
	if err != nil {
		return AdjustResult{}, fmt.Errorf("create audit log: %w", err)
	}

	v := toBalanceView(updated)
	v.LeaveTypeCode = lt.Code
	v.LeaveTypeName = lt.Name
	return AdjustResult{Balance: v, AdjustmentID: adj.ID, DeltaHours: in.DeltaHours}, nil
}

// kstLocation — KST 단일 시간대 (CLAUDE.md §3.7).
var kstLocation = time.FixedZone("KST", 9*3600)

func nowKST() time.Time {
	return time.Now().In(kstLocation)
}

// KSTLocation — 외부 (cron 등) 에서 동일 시간대 사용을 위한 export.
func KSTLocation() *time.Location {
	return kstLocation
}
