package delegation_test

import (
	"context"
	"errors"
	"testing"

	dbq "github.com/sjseo/docflow/backend/internal/db/sqlc"
	"github.com/sjseo/docflow/backend/internal/hr/delegation"
)

func seedDelegateUser(f *fakeStore) {
	f.seedUser(dbq.User{ID: managerID, TenantID: tenantID})
	f.seedUser(dbq.User{ID: delegateID, TenantID: tenantID})
}

func TestService_Create_Success(t *testing.T) {
	f := newFakeStore()
	seedDelegateUser(f)
	svc := delegation.NewService(f)

	v, err := svc.Create(context.Background(), delegation.CreateInput{
		TenantID:   tenantID,
		ActorID:    managerID,
		DelegateID: delegateID,
		ValidFrom:  ts(t, "2026-06-01 00:00"),
		ValidTo:    ts(t, "2026-06-30 23:59"),
		Scope:      map[string]any{"document_types": []any{"leave_request"}},
	})
	if err != nil {
		t.Fatalf("Create err=%v", err)
	}
	if v.DelegatorID != managerID || v.DelegateID != delegateID {
		t.Errorf("View=%+v", v)
	}
	if len(f.delegations) != 1 {
		t.Errorf("stored=%d want 1", len(f.delegations))
	}
}

func TestService_Create_SelfDelegation_Invalid(t *testing.T) {
	f := newFakeStore()
	seedDelegateUser(f)
	svc := delegation.NewService(f)

	_, err := svc.Create(context.Background(), delegation.CreateInput{
		TenantID:   tenantID,
		ActorID:    managerID,
		DelegateID: managerID, // 본인을 본인에게 위임
		ValidFrom:  ts(t, "2026-06-01 00:00"),
		ValidTo:    ts(t, "2026-06-30 23:59"),
	})
	if !errors.Is(err, delegation.ErrDelegationInvalidInput) {
		t.Fatalf("err=%v want ErrDelegationInvalidInput", err)
	}
}

func TestService_Create_InvalidDateRange(t *testing.T) {
	f := newFakeStore()
	seedDelegateUser(f)
	svc := delegation.NewService(f)

	_, err := svc.Create(context.Background(), delegation.CreateInput{
		TenantID:   tenantID,
		ActorID:    managerID,
		DelegateID: delegateID,
		ValidFrom:  ts(t, "2026-06-30 23:59"),
		ValidTo:    ts(t, "2026-06-01 00:00"), // 역순
	})
	if !errors.Is(err, delegation.ErrDelegationInvalidInput) {
		t.Fatalf("err=%v want ErrDelegationInvalidInput", err)
	}
}

func TestService_Create_DelegateNotFound(t *testing.T) {
	f := newFakeStore()
	// delegate 미시드.
	f.seedUser(dbq.User{ID: managerID, TenantID: tenantID})
	svc := delegation.NewService(f)

	_, err := svc.Create(context.Background(), delegation.CreateInput{
		TenantID:   tenantID,
		ActorID:    managerID,
		DelegateID: delegateID,
		ValidFrom:  ts(t, "2026-06-01 00:00"),
		ValidTo:    ts(t, "2026-06-30 23:59"),
	})
	if !errors.Is(err, delegation.ErrDelegateUserNotFound) {
		t.Fatalf("err=%v want ErrDelegateUserNotFound", err)
	}
}

func TestService_Create_NilScope_DefaultsToEmpty(t *testing.T) {
	f := newFakeStore()
	seedDelegateUser(f)
	svc := delegation.NewService(f)

	v, err := svc.Create(context.Background(), delegation.CreateInput{
		TenantID:   tenantID,
		ActorID:    managerID,
		DelegateID: delegateID,
		ValidFrom:  ts(t, "2026-06-01 00:00"),
		ValidTo:    ts(t, "2026-06-30 23:59"),
		Scope:      nil,
	})
	if err != nil {
		t.Fatalf("Create err=%v", err)
	}
	if len(v.Scope) != 0 {
		t.Errorf("Scope=%+v want empty map", v.Scope)
	}
}

func TestService_ListMy_OnlyMine(t *testing.T) {
	f := newFakeStore()
	seedDelegateUser(f)
	f.seedDelegation(dbq.Delegation{
		TenantID: tenantID, DelegatorID: managerID, DelegateID: delegateID,
		ValidFrom: pgTS(ts(t, "2026-06-01 00:00")),
		ValidTo:   pgTS(ts(t, "2026-06-30 23:59")),
	})
	f.seedDelegation(dbq.Delegation{
		TenantID: tenantID, DelegatorID: otherUserID, DelegateID: delegateID,
		ValidFrom: pgTS(ts(t, "2026-06-01 00:00")),
		ValidTo:   pgTS(ts(t, "2026-06-30 23:59")),
	})
	svc := delegation.NewService(f)

	list, err := svc.ListMy(context.Background(), managerID, tenantID)
	if err != nil {
		t.Fatalf("ListMy err=%v", err)
	}
	if len(list) != 1 {
		t.Fatalf("len=%d want 1", len(list))
	}
	if list[0].DelegatorID != managerID {
		t.Errorf("DelegatorID=%d want %d", list[0].DelegatorID, managerID)
	}
}

func TestService_Delete_OwnDelegation_OK(t *testing.T) {
	f := newFakeStore()
	seedDelegateUser(f)
	d := f.seedDelegation(dbq.Delegation{
		TenantID: tenantID, DelegatorID: managerID, DelegateID: delegateID,
		ValidFrom: pgTS(ts(t, "2026-06-01 00:00")),
		ValidTo:   pgTS(ts(t, "2026-06-30 23:59")),
	})
	svc := delegation.NewService(f)

	if err := svc.Delete(context.Background(), d.ID, managerID, tenantID); err != nil {
		t.Fatalf("Delete err=%v", err)
	}
	if _, ok := f.delegations[d.ID]; ok {
		t.Errorf("delegation still exists after Delete")
	}
}

func TestService_Delete_OtherUsersDelegation_NotFound(t *testing.T) {
	f := newFakeStore()
	seedDelegateUser(f)
	d := f.seedDelegation(dbq.Delegation{
		TenantID: tenantID, DelegatorID: otherUserID, DelegateID: delegateID,
		ValidFrom: pgTS(ts(t, "2026-06-01 00:00")),
		ValidTo:   pgTS(ts(t, "2026-06-30 23:59")),
	})
	svc := delegation.NewService(f)

	err := svc.Delete(context.Background(), d.ID, managerID, tenantID)
	if !errors.Is(err, delegation.ErrDelegationNotFound) {
		t.Fatalf("err=%v want ErrDelegationNotFound", err)
	}
}

func TestService_Delete_Missing_NotFound(t *testing.T) {
	f := newFakeStore()
	seedDelegateUser(f)
	svc := delegation.NewService(f)
	err := svc.Delete(context.Background(), 9999, managerID, tenantID)
	if !errors.Is(err, delegation.ErrDelegationNotFound) {
		t.Fatalf("err=%v want ErrDelegationNotFound", err)
	}
}
