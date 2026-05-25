package admin_test

import (
	"context"
	"errors"
	"testing"

	"github.com/sjseo/docflow/backend/internal/admin"
	dbq "github.com/sjseo/docflow/backend/internal/db/sqlc"
)

func TestService_Terminate_SetsStatusAndIncrementsTokenVersion(t *testing.T) {
	store := newFakeAdminStore()
	store.seed(dbq.User{ID: 1, Email: "boss@x", Role: dbq.UserRoleSuperAdmin})
	store.seed(dbq.User{ID: 2, Email: "ex@x", Role: dbq.UserRoleGeneral})

	svc := admin.NewService(store)
	out, err := svc.Terminate(context.Background(), admin.TerminateInput{
		ActorID: 1, TargetID: 2, TenantID: 1, Reason: "정상 퇴사",
	})
	if err != nil {
		t.Fatalf("Terminate failed: %v", err)
	}
	if out.Status != dbq.UserStatusTerminated {
		t.Fatalf("status = %q, want terminated", out.Status)
	}
	stored := store.users[2]
	if stored.Status != dbq.UserStatusTerminated {
		t.Fatalf("stored status = %q, want terminated", stored.Status)
	}
	if stored.TokenVersion != 1 {
		t.Fatalf("token_version = %d, want 1 (incremented)", stored.TokenVersion)
	}
}

func TestService_Terminate_Self_ReturnsErrCannotTerminateSelf(t *testing.T) {
	store := newFakeAdminStore()
	store.seed(dbq.User{ID: 1, Email: "boss@x", Role: dbq.UserRoleSuperAdmin})

	svc := admin.NewService(store)
	_, err := svc.Terminate(context.Background(), admin.TerminateInput{
		ActorID: 1, TargetID: 1, TenantID: 1,
	})
	if !errors.Is(err, admin.ErrCannotTerminateSelf) {
		t.Fatalf("err = %v, want ErrCannotTerminateSelf", err)
	}
	// 본인 status / token_version 모두 변하지 않았어야 함.
	stored := store.users[1]
	if stored.Status != dbq.UserStatusActive {
		t.Fatalf("status changed: %q", stored.Status)
	}
	if stored.TokenVersion != 0 {
		t.Fatalf("token_version changed: %d", stored.TokenVersion)
	}
}

func TestService_Terminate_NotFound(t *testing.T) {
	store := newFakeAdminStore()
	store.seed(dbq.User{ID: 1, Email: "boss@x", Role: dbq.UserRoleSuperAdmin})

	svc := admin.NewService(store)
	_, err := svc.Terminate(context.Background(), admin.TerminateInput{
		ActorID: 1, TargetID: 99, TenantID: 1,
	})
	if !errors.Is(err, admin.ErrNotFound) {
		t.Fatalf("err = %v, want ErrNotFound", err)
	}
}

func TestService_Terminate_AlreadyTerminated_Idempotent(t *testing.T) {
	store := newFakeAdminStore()
	store.seed(dbq.User{ID: 1, Email: "boss@x", Role: dbq.UserRoleSuperAdmin})
	store.seed(dbq.User{ID: 2, Email: "ex@x", Status: dbq.UserStatusTerminated})

	svc := admin.NewService(store)
	// 이미 terminated 상태를 다시 terminate 하면 멱등 처리 (status 그대로, token_version 증가).
	out, err := svc.Terminate(context.Background(), admin.TerminateInput{
		ActorID: 1, TargetID: 2, TenantID: 1,
	})
	if err != nil {
		t.Fatalf("Terminate failed: %v", err)
	}
	if out.Status != dbq.UserStatusTerminated {
		t.Fatalf("status = %q", out.Status)
	}
}
