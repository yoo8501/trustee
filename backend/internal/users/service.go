// Package users — 사용자 관련 service / handler.
package users

import (
	"context"
	"errors"

	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgtype"

	dbq "github.com/sjseo/docflow/backend/internal/db/sqlc"
	"github.com/sjseo/docflow/backend/internal/permission"
)

// Sentinel errors.
var (
	ErrNotFound        = errors.New("users: not found")
	ErrCannotDemoteSelf = errors.New("users: cannot demote self")
	ErrInvalidRole     = errors.New("users: invalid role")
)

// Store — users 서비스의 DB 의존성. sqlc Querier 부분 집합.
type Store interface {
	GetUserByID(ctx context.Context, arg dbq.GetUserByIDParams) (dbq.User, error)
	ListUsers(ctx context.Context, arg dbq.ListUsersParams) ([]dbq.User, error)
	CountUsers(ctx context.Context, tenantID int64) (int64, error)
	UpdateUser(ctx context.Context, arg dbq.UpdateUserParams) (dbq.User, error)
	IncrementUserTokenVersion(ctx context.Context, arg dbq.IncrementUserTokenVersionParams) (int32, error)
}

var _ Store = (*dbq.Queries)(nil)

// Service — 사용자 비즈니스 로직.
type Service struct {
	store Store
}

// NewService — store 주입.
func NewService(store Store) *Service {
	return &Service{store: store}
}

// Me — 본인 정보 조회.
func (s *Service) Me(ctx context.Context, userID, tenantID int64) (dbq.User, error) {
	u, err := s.store.GetUserByID(ctx, dbq.GetUserByIDParams{ID: userID, TenantID: tenantID})
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			return dbq.User{}, ErrNotFound
		}
		return dbq.User{}, err
	}
	return u, nil
}

// ListInput — 목록 입력 (1-based page).
type ListInput struct {
	Page int32
	Size int32
}

// ListResult — 목록 결과.
type ListResult struct {
	Items []dbq.User
	Total int64
}

// List — 사용자 목록 (tenant scoped).
func (s *Service) List(ctx context.Context, tenantID int64, in ListInput) (ListResult, error) {
	if in.Page < 1 {
		in.Page = 1
	}
	if in.Size < 1 || in.Size > 200 {
		in.Size = 20
	}
	offset := (in.Page - 1) * in.Size

	items, err := s.store.ListUsers(ctx, dbq.ListUsersParams{
		TenantID: tenantID,
		Limit:    in.Size,
		Offset:   offset,
	})
	if err != nil {
		return ListResult{}, err
	}
	total, err := s.store.CountUsers(ctx, tenantID)
	if err != nil {
		return ListResult{}, err
	}
	return ListResult{Items: items, Total: total}, nil
}

// UpdateInput — 사용자 수정 입력. 옵셔널 필드는 nil 로 전달.
type UpdateInput struct {
	TargetID int64
	ActorID  int64 // 작업자 본인 id — 본인 role 강등 검증용.
	TenantID int64

	Name   *string
	Role   *permission.Role
	Status *dbq.UserStatus
	// TeamID *int64 (nil 그대로 두면 미변경, nil pointer 전달은 unset 의도와 충돌하므로 별도 플래그 사용)
	TeamIDSet bool
	TeamID    *int64

	ManagerIDSet bool
	ManagerID    *int64
}

// Update — 사용자 수정. role 강등 시 본인 검증.
//
// 비즈니스 룰:
//   - role 이 invalid 면 ErrInvalidRole.
//   - actor == target 이고 새 role 의 rank < 현 role rank → ErrCannotDemoteSelf.
//   - role 변경 시 token_version +1 → 기존 토큰 즉시 무효.
func (s *Service) Update(ctx context.Context, in UpdateInput) (dbq.User, error) {
	current, err := s.store.GetUserByID(ctx, dbq.GetUserByIDParams{
		ID: in.TargetID, TenantID: in.TenantID,
	})
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			return dbq.User{}, ErrNotFound
		}
		return dbq.User{}, err
	}

	if in.Role != nil {
		if !permission.IsValid(*in.Role) {
			return dbq.User{}, ErrInvalidRole
		}
		if in.ActorID == in.TargetID {
			currentRole := permission.Role(current.Role)
			if permission.Rank(*in.Role) < permission.Rank(currentRole) {
				return dbq.User{}, ErrCannotDemoteSelf
			}
		}
	}

	params := dbq.UpdateUserParams{
		ID:       in.TargetID,
		TenantID: in.TenantID,
	}
	if in.Name != nil {
		params.Name = pgtype.Text{String: *in.Name, Valid: true}
	}
	if in.Role != nil {
		params.Role = dbq.NullUserRole{UserRole: dbq.UserRole(*in.Role), Valid: true}
	}
	if in.Status != nil {
		params.Status = dbq.NullUserStatus{UserStatus: *in.Status, Valid: true}
	}
	if in.TeamIDSet {
		params.TeamIDSet = true
		if in.TeamID != nil {
			params.TeamID = pgtype.Int8{Int64: *in.TeamID, Valid: true}
		} else {
			params.TeamID = pgtype.Int8{Valid: false}
		}
	}
	if in.ManagerIDSet {
		params.ManagerIDSet = true
		if in.ManagerID != nil {
			params.ManagerID = pgtype.Int8{Int64: *in.ManagerID, Valid: true}
		} else {
			params.ManagerID = pgtype.Int8{Valid: false}
		}
	}

	updated, err := s.store.UpdateUser(ctx, params)
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			return dbq.User{}, ErrNotFound
		}
		return dbq.User{}, err
	}

	// role 변경 시 token_version 증가 → 기존 토큰 무효.
	if in.Role != nil && permission.Role(current.Role) != *in.Role {
		if _, err := s.store.IncrementUserTokenVersion(ctx, dbq.IncrementUserTokenVersionParams{
			ID: in.TargetID, TenantID: in.TenantID,
		}); err != nil {
			return dbq.User{}, err
		}
	}

	return updated, nil
}
