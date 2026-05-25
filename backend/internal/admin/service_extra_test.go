package admin_test

import (
	"context"
	"errors"
	"testing"

	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgtype"

	"github.com/sjseo/docflow/backend/internal/admin"
	dbq "github.com/sjseo/docflow/backend/internal/db/sqlc"
)

// 추가 테스트 — error branch 커버리지 보강 (UpdateUser 실패 / IncrementUserTokenVersion 실패).

type updateFailStore struct {
	*fakeAdminStore
}

func (s *updateFailStore) UpdateUser(_ context.Context, arg dbq.UpdateUserParams) (dbq.User, error) {
	return dbq.User{}, pgx.ErrTxClosed // 임의의 non-NoRows 에러.
}

type incrementFailStore struct {
	*fakeAdminStore
}

func (s *incrementFailStore) IncrementUserTokenVersion(_ context.Context, _ dbq.IncrementUserTokenVersionParams) (int32, error) {
	return 0, pgx.ErrTxClosed
}

type updateNoRowsStore struct {
	*fakeAdminStore
}

func (s *updateNoRowsStore) UpdateUser(_ context.Context, _ dbq.UpdateUserParams) (dbq.User, error) {
	return dbq.User{}, pgx.ErrNoRows
}

type getFailStore struct {
	*fakeAdminStore
}

func (s *getFailStore) GetUserByID(_ context.Context, _ dbq.GetUserByIDParams) (dbq.User, error) {
	return dbq.User{}, pgx.ErrTxClosed
}

func newStoreWithTwoUsers() *fakeAdminStore {
	store := newFakeAdminStore()
	store.seed(dbq.User{ID: 1, Email: "boss@x", Role: dbq.UserRoleSuperAdmin})
	store.seed(dbq.User{ID: 2, Email: "ex@x"})
	// ensure UpdatedAt valid to avoid zero compare oddities.
	for id, u := range store.users {
		u.UpdatedAt = pgtype.Timestamptz{Time: u.CreatedAt.Time, Valid: true}
		store.users[id] = u
	}
	return store
}

func TestService_Terminate_UpdateReturnsNonNoRowsError(t *testing.T) {
	store := newStoreWithTwoUsers()
	wrapped := &updateFailStore{fakeAdminStore: store}

	svc := admin.NewService(wrapped)
	_, err := svc.Terminate(context.Background(), admin.TerminateInput{
		ActorID: 1, TargetID: 2, TenantID: 1,
	})
	if err == nil {
		t.Fatal("expected error from failing UpdateUser")
	}
	// 일반 에러는 NotFound 가 아니어야 함 (전달된 그대로).
	if errors.Is(err, admin.ErrNotFound) {
		t.Fatalf("err should not be ErrNotFound, got %v", err)
	}
}

func TestService_Terminate_UpdateNoRows_ReturnsNotFound(t *testing.T) {
	store := newStoreWithTwoUsers()
	wrapped := &updateNoRowsStore{fakeAdminStore: store}

	svc := admin.NewService(wrapped)
	_, err := svc.Terminate(context.Background(), admin.TerminateInput{
		ActorID: 1, TargetID: 2, TenantID: 1,
	})
	if !errors.Is(err, admin.ErrNotFound) {
		t.Fatalf("err = %v, want ErrNotFound", err)
	}
}

func TestService_Terminate_IncrementTokenVersionFails(t *testing.T) {
	store := newStoreWithTwoUsers()
	wrapped := &incrementFailStore{fakeAdminStore: store}

	svc := admin.NewService(wrapped)
	_, err := svc.Terminate(context.Background(), admin.TerminateInput{
		ActorID: 1, TargetID: 2, TenantID: 1,
	})
	if err == nil {
		t.Fatal("expected error from failing IncrementUserTokenVersion")
	}
	if errors.Is(err, admin.ErrNotFound) {
		t.Fatalf("err should not be ErrNotFound, got %v", err)
	}
}

func TestService_Terminate_GetUserUnexpectedError(t *testing.T) {
	store := newStoreWithTwoUsers()
	wrapped := &getFailStore{fakeAdminStore: store}

	svc := admin.NewService(wrapped)
	_, err := svc.Terminate(context.Background(), admin.TerminateInput{
		ActorID: 1, TargetID: 2, TenantID: 1,
	})
	if err == nil {
		t.Fatal("expected error from failing GetUserByID")
	}
	if errors.Is(err, admin.ErrNotFound) {
		t.Fatalf("err should not be ErrNotFound, got %v", err)
	}
}
