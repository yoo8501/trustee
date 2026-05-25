// Package admin — 관리자 (super_admin) 전용 사용자 lifecycle service.
//
// Sprint 9: User soft delete enforcement.
//   - super_admin 만 호출 가능 (라우터 미들웨어가 강제).
//   - 본인을 terminate 처리할 수 없음 (ErrCannotTerminateSelf, 400 + CANNOT_TERMINATE_SELF).
//   - terminate 처리 시 status = 'terminated' + token_version++ 동시 적용.
//     → 해당 사용자의 모든 access/refresh 토큰 즉시 무효 (auth.Middleware 가 검증).
//   - 멱등: 이미 terminated 인 사용자도 재호출 가능 (status 그대로, token_version 만 증가).
//
// 본 패키지는 users 패키지와 분리한다 — 일반 사용자 수정과 관리자 전용 라이프사이클
// (terminate, suspend 등) 의 권한/감사 분기가 명확히 다르기 때문.
package admin

import (
	"context"
	"errors"

	"github.com/jackc/pgx/v5"

	dbq "github.com/sjseo/docflow/backend/internal/db/sqlc"
)

// Sentinel errors.
var (
	// ErrNotFound — terminate 대상 user 가 없거나 tenant 가 다름.
	ErrNotFound = errors.New("admin: user not found")
	// ErrCannotTerminateSelf — super_admin 본인이 본인 계정 terminate 시도.
	ErrCannotTerminateSelf = errors.New("admin: cannot terminate self")
)

// Store — admin service 의 DB 의존성 (sqlc Querier 의 부분 집합).
type Store interface {
	GetUserByID(ctx context.Context, arg dbq.GetUserByIDParams) (dbq.User, error)
	UpdateUser(ctx context.Context, arg dbq.UpdateUserParams) (dbq.User, error)
	IncrementUserTokenVersion(ctx context.Context, arg dbq.IncrementUserTokenVersionParams) (int32, error)
}

var _ Store = (*dbq.Queries)(nil)

// Service — admin 도메인 service.
type Service struct {
	store Store
}

// NewService — store 주입.
func NewService(store Store) *Service {
	return &Service{store: store}
}

// TerminateInput — Terminate 입력. Reason 은 optional (현재는 별도 audit log 테이블 미사용 — 향후 P3).
type TerminateInput struct {
	ActorID  int64
	TargetID int64
	TenantID int64
	Reason   string
}

// TerminateResult — terminate 처리 결과. 응답 DTO 변환은 handler 책임.
type TerminateResult struct {
	ID           int64
	Status       dbq.UserStatus
	TokenVersion int32
}

// Terminate — 사용자 soft delete (status=terminated + token_version++).
//
// 비즈니스 룰:
//   - actor == target → ErrCannotTerminateSelf.
//   - target 미존재 / tenant 불일치 → ErrNotFound.
//   - 이미 terminated 인 경우에도 멱등 처리 (token_version 증가로 세션 강제 만료).
//
// 트랜잭션 미사용 — UPDATE 와 IncrementUserTokenVersion 사이에 race 가능하지만
// 두 호출 모두 같은 user row 의 update 이고, IncrementUserTokenVersion 자체가
// race-safe 한 SQL (`SET token_version = token_version + 1`) 이므로 invariant 유지.
func (s *Service) Terminate(ctx context.Context, in TerminateInput) (TerminateResult, error) {
	if in.ActorID == in.TargetID {
		return TerminateResult{}, ErrCannotTerminateSelf
	}

	// 존재 확인 (tenant scope).
	if _, err := s.store.GetUserByID(ctx, dbq.GetUserByIDParams{
		ID: in.TargetID, TenantID: in.TenantID,
	}); err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			return TerminateResult{}, ErrNotFound
		}
		return TerminateResult{}, err
	}

	terminated := dbq.UserStatusTerminated
	updated, err := s.store.UpdateUser(ctx, dbq.UpdateUserParams{
		ID:       in.TargetID,
		TenantID: in.TenantID,
		Status:   dbq.NullUserStatus{UserStatus: terminated, Valid: true},
	})
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			return TerminateResult{}, ErrNotFound
		}
		return TerminateResult{}, err
	}

	newVer, err := s.store.IncrementUserTokenVersion(ctx, dbq.IncrementUserTokenVersionParams{
		ID:       in.TargetID,
		TenantID: in.TenantID,
	})
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			return TerminateResult{}, ErrNotFound
		}
		return TerminateResult{}, err
	}

	return TerminateResult{
		ID:           updated.ID,
		Status:       updated.Status,
		TokenVersion: newVer,
	}, nil
}
