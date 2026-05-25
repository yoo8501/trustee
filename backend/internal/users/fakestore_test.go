package users_test

import (
	"context"
	"time"

	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgtype"

	dbq "github.com/sjseo/docflow/backend/internal/db/sqlc"
	"github.com/sjseo/docflow/backend/internal/users"
)

// fakeStore — users.Store 메모리 구현 (testcontainers 불필요).
type fakeStore struct {
	users  map[int64]dbq.User
	nextID int64
}

func newFakeStore() *fakeStore {
	return &fakeStore{users: map[int64]dbq.User{}}
}

func (f *fakeStore) seed(u dbq.User) dbq.User {
	if u.ID == 0 {
		f.nextID++
		u.ID = f.nextID
	}
	if u.Status == "" {
		u.Status = dbq.UserStatusActive
	}
	if u.Role == "" {
		u.Role = dbq.UserRoleGeneral
	}
	if u.TenantID == 0 {
		u.TenantID = 1
	}
	if !u.CreatedAt.Valid {
		u.CreatedAt = pgtype.Timestamptz{Time: time.Now(), Valid: true}
	}
	if !u.UpdatedAt.Valid {
		u.UpdatedAt = pgtype.Timestamptz{Time: time.Now(), Valid: true}
	}
	f.users[u.ID] = u
	if u.ID > f.nextID {
		f.nextID = u.ID
	}
	return u
}

func (f *fakeStore) GetUserByID(ctx context.Context, arg dbq.GetUserByIDParams) (dbq.User, error) {
	u, ok := f.users[arg.ID]
	if !ok || u.TenantID != arg.TenantID || u.DeletedAt.Valid {
		return dbq.User{}, pgx.ErrNoRows
	}
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

var _ users.Store = (*fakeStore)(nil)
