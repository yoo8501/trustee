package auth

import (
	"context"

	"github.com/jackc/pgx/v5/pgtype"

	dbq "github.com/sjseo/docflow/backend/internal/db/sqlc"
)

// Store — auth 패키지가 사용하는 DB 의존성 인터페이스.
//
// sqlc Querier 의 부분 집합. 테스트에서 fake store 로 교체 가능 (testcontainers 없이도 unit test).
// 실 구현은 dbq.Queries (또는 그 위의 Repository) 가 그대로 만족한다.
type Store interface {
	GetUserByEmail(ctx context.Context, arg dbq.GetUserByEmailParams) (dbq.User, error)
	GetUserByID(ctx context.Context, arg dbq.GetUserByIDParams) (dbq.User, error)
	CreateUser(ctx context.Context, arg dbq.CreateUserParams) (dbq.User, error)
	IncrementUserTokenVersion(ctx context.Context, arg dbq.IncrementUserTokenVersionParams) (int32, error)
	GetUserTokenVersion(ctx context.Context, arg dbq.GetUserTokenVersionParams) (dbq.GetUserTokenVersionRow, error)

	CreateRefreshToken(ctx context.Context, arg dbq.CreateRefreshTokenParams) error
	GetRefreshToken(ctx context.Context, jti pgtype.UUID) (dbq.RefreshToken, error)
	MarkRefreshTokenUsed(ctx context.Context, jti pgtype.UUID) (dbq.RefreshToken, error)
}

// 컴파일 타임 보장 — dbq.Queries 가 Store 를 구현해야 한다.
var _ Store = (*dbq.Queries)(nil)
