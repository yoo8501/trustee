package auth_test

import (
	"context"
	"errors"
	"strings"
	"time"

	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgconn"
	"github.com/jackc/pgx/v5/pgtype"

	"github.com/sjseo/docflow/backend/internal/auth"
	dbq "github.com/sjseo/docflow/backend/internal/db/sqlc"
)

// fakeStore — auth.Store 를 메모리로 구현. testcontainers 없이 핸들러/서비스 단위 테스트.
//
// unique 제약 (tenant_id, email) 도 흉내내며, refresh_tokens 의 1회용 회전도 시뮬레이션한다.
type fakeStore struct {
	users         map[int64]dbq.User
	usersByEmail  map[string]int64 // key = tenant:email
	nextID        int64
	refreshTokens map[[16]byte]dbq.RefreshToken

	// 의도된 실패 트리거.
	FailCreateUser bool
}

func newFakeStore() *fakeStore {
	return &fakeStore{
		users:         map[int64]dbq.User{},
		usersByEmail:  map[string]int64{},
		nextID:        0,
		refreshTokens: map[[16]byte]dbq.RefreshToken{},
	}
}

func (f *fakeStore) emailKey(tenantID int64, email string) string {
	return joinKey(tenantID, strings.ToLower(email))
}

func joinKey(tid int64, email string) string {
	return string(rune(tid)) + ":" + email
}

func (f *fakeStore) GetUserByEmail(ctx context.Context, arg dbq.GetUserByEmailParams) (dbq.User, error) {
	id, ok := f.usersByEmail[f.emailKey(arg.TenantID, arg.Email)]
	if !ok {
		return dbq.User{}, pgx.ErrNoRows
	}
	u := f.users[id]
	if u.DeletedAt.Valid {
		return dbq.User{}, pgx.ErrNoRows
	}
	return u, nil
}

func (f *fakeStore) GetUserByID(ctx context.Context, arg dbq.GetUserByIDParams) (dbq.User, error) {
	u, ok := f.users[arg.ID]
	if !ok || u.TenantID != arg.TenantID || u.DeletedAt.Valid {
		return dbq.User{}, pgx.ErrNoRows
	}
	return u, nil
}

func (f *fakeStore) CreateUser(ctx context.Context, arg dbq.CreateUserParams) (dbq.User, error) {
	if f.FailCreateUser {
		return dbq.User{}, errors.New("fakeStore: forced fail")
	}
	key := f.emailKey(arg.TenantID, arg.Email)
	if _, exists := f.usersByEmail[key]; exists {
		// Postgres unique violation 흉내 — 23505.
		return dbq.User{}, &pgconn.PgError{Code: "23505", ConstraintName: "users_tenant_email_uniq"}
	}
	f.nextID++
	u := dbq.User{
		ID:           f.nextID,
		TenantID:     arg.TenantID,
		Email:        strings.ToLower(arg.Email),
		PasswordHash: arg.PasswordHash,
		Name:         arg.Name,
		Status:       dbq.UserStatusActive,
		TeamID:       arg.TeamID,
		ManagerID:    arg.ManagerID,
		HireDate:     arg.HireDate,
		Role:         arg.Role,
		TokenVersion: 0,
		CreatedAt:    pgtype.Timestamptz{Time: time.Now(), Valid: true},
		UpdatedAt:    pgtype.Timestamptz{Time: time.Now(), Valid: true},
	}
	f.users[u.ID] = u
	f.usersByEmail[key] = u.ID
	return u, nil
}

func (f *fakeStore) ListUsers(ctx context.Context, arg dbq.ListUsersParams) ([]dbq.User, error) {
	var out []dbq.User
	for _, u := range f.users {
		if u.TenantID == arg.TenantID && !u.DeletedAt.Valid {
			out = append(out, u)
		}
	}
	return out, nil
}

func (f *fakeStore) CountUsers(ctx context.Context, tenantID int64) (int64, error) {
	var n int64
	for _, u := range f.users {
		if u.TenantID == tenantID && !u.DeletedAt.Valid {
			n++
		}
	}
	return n, nil
}

func (f *fakeStore) UpdateUser(ctx context.Context, arg dbq.UpdateUserParams) (dbq.User, error) {
	u, ok := f.users[arg.ID]
	if !ok || u.TenantID != arg.TenantID || u.DeletedAt.Valid {
		return dbq.User{}, pgx.ErrNoRows
	}
	if arg.Name.Valid {
		u.Name = arg.Name.String
	}
	if arg.Role.Valid {
		u.Role = arg.Role.UserRole
	}
	if arg.TeamIDSet {
		u.TeamID = arg.TeamID
	}
	if arg.ManagerIDSet {
		u.ManagerID = arg.ManagerID
	}
	if arg.Status.Valid {
		u.Status = arg.Status.UserStatus
	}
	u.UpdatedAt = pgtype.Timestamptz{Time: time.Now(), Valid: true}
	f.users[u.ID] = u
	return u, nil
}

func (f *fakeStore) IncrementUserTokenVersion(ctx context.Context, arg dbq.IncrementUserTokenVersionParams) (int32, error) {
	u, ok := f.users[arg.ID]
	if !ok || u.TenantID != arg.TenantID || u.DeletedAt.Valid {
		return 0, pgx.ErrNoRows
	}
	u.TokenVersion++
	f.users[u.ID] = u
	return u.TokenVersion, nil
}

func (f *fakeStore) GetUserTokenVersion(ctx context.Context, arg dbq.GetUserTokenVersionParams) (dbq.GetUserTokenVersionRow, error) {
	u, ok := f.users[arg.ID]
	if !ok || u.TenantID != arg.TenantID || u.DeletedAt.Valid {
		return dbq.GetUserTokenVersionRow{}, pgx.ErrNoRows
	}
	return dbq.GetUserTokenVersionRow{
		TokenVersion: u.TokenVersion,
		Status:       u.Status,
		Role:         u.Role,
	}, nil
}

func (f *fakeStore) CreateRefreshToken(ctx context.Context, arg dbq.CreateRefreshTokenParams) error {
	rec := dbq.RefreshToken{
		Jti:       arg.Jti,
		UserID:    arg.UserID,
		TenantID:  arg.TenantID,
		IssuedAt:  arg.IssuedAt,
		ExpiresAt: arg.ExpiresAt,
	}
	f.refreshTokens[arg.Jti.Bytes] = rec
	return nil
}

func (f *fakeStore) GetRefreshToken(ctx context.Context, jti pgtype.UUID) (dbq.RefreshToken, error) {
	rec, ok := f.refreshTokens[jti.Bytes]
	if !ok {
		return dbq.RefreshToken{}, pgx.ErrNoRows
	}
	return rec, nil
}

func (f *fakeStore) MarkRefreshTokenUsed(ctx context.Context, jti pgtype.UUID) (dbq.RefreshToken, error) {
	rec, ok := f.refreshTokens[jti.Bytes]
	if !ok {
		return dbq.RefreshToken{}, pgx.ErrNoRows
	}
	if rec.UsedAt.Valid {
		// 이미 used — sqlc 의 RETURNING 0 rows 시나리오 (1회용 회전 위반).
		return dbq.RefreshToken{}, pgx.ErrNoRows
	}
	rec.UsedAt = pgtype.Timestamptz{Time: time.Now(), Valid: true}
	f.refreshTokens[jti.Bytes] = rec
	return rec, nil
}

// 보장: fakeStore 가 auth.Store / users.Store / teams.Store 의 합집합을 만족하는지는
// 각 패키지에서 별도 어설션. 여기서는 auth.Store 만 확인.
var _ auth.Store = (*fakeStore)(nil)
