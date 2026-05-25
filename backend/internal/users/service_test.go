package users_test

import (
	"context"
	"errors"
	"testing"

	dbq "github.com/sjseo/docflow/backend/internal/db/sqlc"
	"github.com/sjseo/docflow/backend/internal/permission"
	"github.com/sjseo/docflow/backend/internal/users"
)

func TestService_Me_NotFound(t *testing.T) {
	svc := users.NewService(newFakeStore())
	_, err := svc.Me(context.Background(), 99, 1)
	if !errors.Is(err, users.ErrNotFound) {
		t.Fatalf("err = %v, want ErrNotFound", err)
	}
}

func TestService_Me_Success(t *testing.T) {
	store := newFakeStore()
	store.seed(dbq.User{Email: "u@x", Name: "U", Role: dbq.UserRoleHrManager})
	svc := users.NewService(store)
	u, err := svc.Me(context.Background(), 1, 1)
	if err != nil {
		t.Fatal(err)
	}
	if u.Email != "u@x" {
		t.Fatalf("email = %q", u.Email)
	}
}

func TestService_List(t *testing.T) {
	store := newFakeStore()
	for i := 0; i < 3; i++ {
		store.seed(dbq.User{Email: "x"})
	}
	svc := users.NewService(store)
	res, err := svc.List(context.Background(), 1, users.ListInput{})
	if err != nil {
		t.Fatal(err)
	}
	if res.Total != 3 {
		t.Fatalf("total = %d", res.Total)
	}
	if len(res.Items) != 3 {
		t.Fatalf("items = %d", len(res.Items))
	}
}

func TestService_Update_CannotDemoteSelf(t *testing.T) {
	store := newFakeStore()
	store.seed(dbq.User{Email: "boss@x", Role: dbq.UserRoleSuperAdmin})
	svc := users.NewService(store)

	demote := permission.RoleGeneral
	_, err := svc.Update(context.Background(), users.UpdateInput{
		TargetID: 1, ActorID: 1, TenantID: 1, Role: &demote,
	})
	if !errors.Is(err, users.ErrCannotDemoteSelf) {
		t.Fatalf("err = %v, want ErrCannotDemoteSelf", err)
	}
}

func TestService_Update_PromoteSelfAllowed(t *testing.T) {
	store := newFakeStore()
	store.seed(dbq.User{Email: "x", Role: dbq.UserRoleGeneral})
	svc := users.NewService(store)

	promote := permission.RoleHRManager
	updated, err := svc.Update(context.Background(), users.UpdateInput{
		TargetID: 1, ActorID: 1, TenantID: 1, Role: &promote,
	})
	if err != nil {
		t.Fatalf("Update failed: %v", err)
	}
	if updated.Role != dbq.UserRoleHrManager {
		t.Fatalf("role = %q", updated.Role)
	}
	// role 변경 시 token_version 증가 (기존 토큰 무효).
	if store.users[1].TokenVersion != 1 {
		t.Fatalf("token_version = %d, want 1", store.users[1].TokenVersion)
	}
}

func TestService_Update_DemoteOther_OK(t *testing.T) {
	store := newFakeStore()
	store.seed(dbq.User{Email: "admin@x", Role: dbq.UserRoleSuperAdmin}) // ID=1
	store.seed(dbq.User{Email: "victim@x", Role: dbq.UserRoleHrManager}) // ID=2
	svc := users.NewService(store)

	demote := permission.RoleGeneral
	updated, err := svc.Update(context.Background(), users.UpdateInput{
		TargetID: 2, ActorID: 1, TenantID: 1, Role: &demote,
	})
	if err != nil {
		t.Fatal(err)
	}
	if updated.Role != dbq.UserRoleGeneral {
		t.Fatalf("role = %q", updated.Role)
	}
}

func TestService_Update_InvalidRole(t *testing.T) {
	store := newFakeStore()
	store.seed(dbq.User{Email: "u@x"})
	svc := users.NewService(store)

	bogus := permission.Role("god_mode")
	_, err := svc.Update(context.Background(), users.UpdateInput{
		TargetID: 1, ActorID: 1, TenantID: 1, Role: &bogus,
	})
	if !errors.Is(err, users.ErrInvalidRole) {
		t.Fatalf("err = %v, want ErrInvalidRole", err)
	}
}

func TestService_Update_NotFound(t *testing.T) {
	svc := users.NewService(newFakeStore())
	_, err := svc.Update(context.Background(), users.UpdateInput{
		TargetID: 99, ActorID: 1, TenantID: 1,
	})
	if !errors.Is(err, users.ErrNotFound) {
		t.Fatalf("err = %v, want ErrNotFound", err)
	}
}
