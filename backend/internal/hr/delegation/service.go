package delegation

import (
	"context"
	"encoding/json"
	"errors"
	"time"

	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgtype"

	dbq "github.com/sjseo/docflow/backend/internal/db/sqlc"
)

// Sentinel errors.
var (
	// ErrDelegationInvalidInput — validation 실패 (자기 자신, 기간 역순 등).
	ErrDelegationInvalidInput = errors.New("delegation: invalid input")
	// ErrDelegationNotFound — 단건 조회/삭제 시 미존재.
	ErrDelegationNotFound = errors.New("delegation: not found")
	// ErrDelegationForbidden — delegator_id 가 본인이 아닌 경우 (관리자 강제 위임 미지원).
	ErrDelegationForbidden = errors.New("delegation: forbidden")
	// ErrDelegateUserNotFound — delegate_id 가 존재하지 않거나 tenant 불일치.
	ErrDelegateUserNotFound = errors.New("delegation: delegate user not found")
)

// Store — Service 의 DB 의존성. dbq.Queries 가 만족.
type Store interface {
	ResolverStore // ListActiveDelegationsByDelegator 재사용.
	CreateDelegation(ctx context.Context, arg dbq.CreateDelegationParams) (dbq.Delegation, error)
	GetDelegationByID(ctx context.Context, arg dbq.GetDelegationByIDParams) (dbq.Delegation, error)
	DeleteDelegation(ctx context.Context, arg dbq.DeleteDelegationParams) error
	ListDelegationsByDelegator(ctx context.Context, arg dbq.ListDelegationsByDelegatorParams) ([]dbq.Delegation, error)
	GetUserByID(ctx context.Context, arg dbq.GetUserByIDParams) (dbq.User, error)
}

// Service — 위임 CRUD.
type Service struct {
	store Store
}

// NewService — store 주입.
func NewService(store Store) *Service {
	return &Service{store: store}
}

// View — service / handler 가 주고받는 도메인 표현.
type View struct {
	ID          int64
	TenantID    int64
	DelegatorID int64
	DelegateID  int64
	ValidFrom   time.Time
	ValidTo     time.Time
	Scope       map[string]any // 빈 map = 전체 위임.
	CreatedAt   time.Time
}

func toView(d dbq.Delegation) View {
	v := View{
		ID:          d.ID,
		TenantID:    d.TenantID,
		DelegatorID: d.DelegatorID,
		DelegateID:  d.DelegateID,
		Scope:       map[string]any{},
	}
	if d.ValidFrom.Valid {
		v.ValidFrom = d.ValidFrom.Time
	}
	if d.ValidTo.Valid {
		v.ValidTo = d.ValidTo.Time
	}
	if d.CreatedAt.Valid {
		v.CreatedAt = d.CreatedAt.Time
	}
	if len(d.Scope) > 0 {
		_ = json.Unmarshal(d.Scope, &v.Scope)
	}
	return v
}

// CreateInput — 본인이 자기 위임을 등록.
//
// delegator_id 는 actor 자신이어야 함 (handler 가 actor id 를 그대로 전달).
// 관리자가 다른 사람 대신 등록하는 케이스는 P1 미지원 — Forbidden.
type CreateInput struct {
	TenantID    int64
	ActorID     int64 // == delegator_id 강제
	DelegateID  int64
	ValidFrom   time.Time
	ValidTo     time.Time
	Scope       map[string]any // nil → 빈 {} (전체 위임)
}

// Create — 위임 등록.
//
//   - delegate_id == 0 또는 == actor → InvalidInput
//   - valid_from > valid_to → InvalidInput
//   - delegate_id 가 같은 tenant 의 active user 가 아님 → ErrDelegateUserNotFound
func (s *Service) Create(ctx context.Context, in CreateInput) (View, error) {
	if in.DelegateID == 0 || in.DelegateID == in.ActorID {
		return View{}, ErrDelegationInvalidInput
	}
	if in.ValidFrom.IsZero() || in.ValidTo.IsZero() || in.ValidTo.Before(in.ValidFrom) {
		return View{}, ErrDelegationInvalidInput
	}

	// delegate 존재 검증.
	if _, err := s.store.GetUserByID(ctx, dbq.GetUserByIDParams{
		ID: in.DelegateID, TenantID: in.TenantID,
	}); err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			return View{}, ErrDelegateUserNotFound
		}
		return View{}, err
	}

	scope := in.Scope
	if scope == nil {
		scope = map[string]any{}
	}
	scopeJSON, err := json.Marshal(scope)
	if err != nil {
		return View{}, ErrDelegationInvalidInput
	}

	created, err := s.store.CreateDelegation(ctx, dbq.CreateDelegationParams{
		TenantID:    in.TenantID,
		DelegatorID: in.ActorID,
		DelegateID:  in.DelegateID,
		ValidFrom:   pgTimestamptz(in.ValidFrom),
		ValidTo:     pgTimestamptz(in.ValidTo),
		Scope:       scopeJSON,
	})
	if err != nil {
		return View{}, err
	}
	return toView(created), nil
}

// ListMy — 본인이 등록한 위임 목록 (활성 + 미래 + 만료 포함).
func (s *Service) ListMy(ctx context.Context, actorID, tenantID int64) ([]View, error) {
	rows, err := s.store.ListDelegationsByDelegator(ctx, dbq.ListDelegationsByDelegatorParams{
		DelegatorID: actorID,
		TenantID:    tenantID,
	})
	if err != nil {
		return nil, err
	}
	out := make([]View, 0, len(rows))
	for _, d := range rows {
		out = append(out, toView(d))
	}
	return out, nil
}

// Delete — 본인의 위임만 삭제 가능.
//
//   - id 미존재 또는 다른 사람 위임 → ErrDelegationNotFound (정보 노출 방지로 Forbidden 대신 NotFound).
func (s *Service) Delete(ctx context.Context, id, actorID, tenantID int64) error {
	existing, err := s.store.GetDelegationByID(ctx, dbq.GetDelegationByIDParams{
		ID: id, TenantID: tenantID,
	})
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			return ErrDelegationNotFound
		}
		return err
	}
	if existing.DelegatorID != actorID {
		// 본인 위임이 아닌 경우 NotFound 로 처리 (존재 자체를 숨김).
		return ErrDelegationNotFound
	}
	return s.store.DeleteDelegation(ctx, dbq.DeleteDelegationParams{
		ID: id, TenantID: tenantID, DelegatorID: actorID,
	})
}

// pgTimestamptz — KST 시각을 그대로 TIMESTAMPTZ 로.
func pgTimestamptz(t time.Time) pgtype.Timestamptz {
	if t.IsZero() {
		return pgtype.Timestamptz{}
	}
	return pgtype.Timestamptz{Time: t, Valid: true}
}
