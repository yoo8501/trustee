package admin_test

import (
	"context"
	"time"

	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgtype"

	"github.com/sjseo/docflow/backend/internal/admin"
	dbq "github.com/sjseo/docflow/backend/internal/db/sqlc"
)

// fakeAdminStore — admin.Service 의 메모리 구현. (TerminateUser 는 status + token_version 동시 변경.)
type fakeAdminStore struct {
	users  map[int64]dbq.User
	nextID int64
}

func newFakeAdminStore() *fakeAdminStore {
	return &fakeAdminStore{users: map[int64]dbq.User{}}
}

func (f *fakeAdminStore) seed(u dbq.User) dbq.User {
	if u.ID == 0 {
		f.nextID++
		u.ID = f.nextID
	}
	if u.TenantID == 0 {
		u.TenantID = 1
	}
	if u.Status == "" {
		u.Status = dbq.UserStatusActive
	}
	if u.Role == "" {
		u.Role = dbq.UserRoleGeneral
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

func (f *fakeAdminStore) GetUserByID(_ context.Context, arg dbq.GetUserByIDParams) (dbq.User, error) {
	u, ok := f.users[arg.ID]
	if !ok || u.TenantID != arg.TenantID || u.DeletedAt.Valid {
		return dbq.User{}, pgx.ErrNoRows
	}
	return u, nil
}

func (f *fakeAdminStore) UpdateUser(_ context.Context, arg dbq.UpdateUserParams) (dbq.User, error) {
	u, ok := f.users[arg.ID]
	if !ok || u.TenantID != arg.TenantID || u.DeletedAt.Valid {
		return dbq.User{}, pgx.ErrNoRows
	}
	if arg.Status.Valid {
		u.Status = arg.Status.UserStatus
	}
	u.UpdatedAt = pgtype.Timestamptz{Time: time.Now(), Valid: true}
	f.users[u.ID] = u
	return u, nil
}

func (f *fakeAdminStore) IncrementUserTokenVersion(_ context.Context, arg dbq.IncrementUserTokenVersionParams) (int32, error) {
	u, ok := f.users[arg.ID]
	if !ok || u.TenantID != arg.TenantID || u.DeletedAt.Valid {
		return 0, pgx.ErrNoRows
	}
	u.TokenVersion++
	f.users[u.ID] = u
	return u.TokenVersion, nil
}

var _ admin.Store = (*fakeAdminStore)(nil)
