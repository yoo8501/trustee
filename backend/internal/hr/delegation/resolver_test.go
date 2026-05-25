package delegation_test

import (
	"context"
	"testing"
	"time"

	"github.com/jackc/pgx/v5/pgtype"

	dbq "github.com/sjseo/docflow/backend/internal/db/sqlc"
	"github.com/sjseo/docflow/backend/internal/hr/delegation"
)

const (
	tenantID    = int64(1)
	managerID   = int64(20)
	delegateID  = int64(30)
	otherUserID = int64(40)
)

func ts(t *testing.T, s string) time.Time {
	t.Helper()
	loc, _ := time.LoadLocation("Asia/Seoul")
	out, err := time.ParseInLocation("2006-01-02 15:04", s, loc)
	if err != nil {
		t.Fatalf("parse %s: %v", s, err)
	}
	return out
}

func pgTS(t time.Time) pgtype.Timestamptz {
	if t.IsZero() {
		return pgtype.Timestamptz{}
	}
	return pgtype.Timestamptz{Time: t, Valid: true}
}

func TestResolver_Resolve_NoDelegation_ReturnsBase(t *testing.T) {
	f := newFakeStore()
	r := delegation.NewResolver(f, tenantID)

	got := r.Resolve(context.Background(), managerID, ts(t, "2026-06-01 10:00"), "leave_request")
	if got != managerID {
		t.Errorf("Resolve=%d want %d", got, managerID)
	}
}

func TestResolver_Resolve_BaseZero_ReturnsZero(t *testing.T) {
	f := newFakeStore()
	r := delegation.NewResolver(f, tenantID)

	if got := r.Resolve(context.Background(), 0, time.Now(), "leave_request"); got != 0 {
		t.Errorf("Resolve(0)=%d want 0", got)
	}
}

func TestResolver_Resolve_ActiveDelegationEmptyScope_Routes(t *testing.T) {
	f := newFakeStore()
	f.seedDelegation(dbq.Delegation{
		TenantID: tenantID, DelegatorID: managerID, DelegateID: delegateID,
		ValidFrom: pgTS(ts(t, "2026-05-01 00:00")),
		ValidTo:   pgTS(ts(t, "2026-12-31 23:59")),
		Scope:     []byte(`{}`),
	})
	r := delegation.NewResolver(f, tenantID)

	at := ts(t, "2026-06-01 10:00")
	if got := r.Resolve(context.Background(), managerID, at, "leave_request"); got != delegateID {
		t.Errorf("Resolve=%d want delegate=%d", got, delegateID)
	}
}

func TestResolver_Resolve_ScopeMatch_Routes(t *testing.T) {
	f := newFakeStore()
	f.seedDelegation(dbq.Delegation{
		TenantID: tenantID, DelegatorID: managerID, DelegateID: delegateID,
		ValidFrom: pgTS(ts(t, "2026-05-01 00:00")),
		ValidTo:   pgTS(ts(t, "2026-12-31 23:59")),
		Scope:     []byte(`{"document_types":["leave_request"]}`),
	})
	r := delegation.NewResolver(f, tenantID)

	at := ts(t, "2026-06-01 10:00")
	if got := r.Resolve(context.Background(), managerID, at, "leave_request"); got != delegateID {
		t.Errorf("Resolve scope-match=%d want %d", got, delegateID)
	}
}

func TestResolver_Resolve_ScopeMismatch_ReturnsBase(t *testing.T) {
	f := newFakeStore()
	f.seedDelegation(dbq.Delegation{
		TenantID: tenantID, DelegatorID: managerID, DelegateID: delegateID,
		ValidFrom: pgTS(ts(t, "2026-05-01 00:00")),
		ValidTo:   pgTS(ts(t, "2026-12-31 23:59")),
		Scope:     []byte(`{"document_types":["expense_request"]}`),
	})
	r := delegation.NewResolver(f, tenantID)

	at := ts(t, "2026-06-01 10:00")
	if got := r.Resolve(context.Background(), managerID, at, "leave_request"); got != managerID {
		t.Errorf("Resolve scope-mismatch=%d want base=%d", got, managerID)
	}
}

func TestResolver_Resolve_BeforeValidFrom_ReturnsBase(t *testing.T) {
	f := newFakeStore()
	f.seedDelegation(dbq.Delegation{
		TenantID: tenantID, DelegatorID: managerID, DelegateID: delegateID,
		ValidFrom: pgTS(ts(t, "2026-06-01 00:00")),
		ValidTo:   pgTS(ts(t, "2026-06-30 23:59")),
		Scope:     []byte(`{}`),
	})
	r := delegation.NewResolver(f, tenantID)

	at := ts(t, "2026-05-31 23:00")
	if got := r.Resolve(context.Background(), managerID, at, "leave_request"); got != managerID {
		t.Errorf("Resolve before-valid_from=%d want base=%d", got, managerID)
	}
}

func TestResolver_Resolve_AfterValidTo_ReturnsBase(t *testing.T) {
	f := newFakeStore()
	f.seedDelegation(dbq.Delegation{
		TenantID: tenantID, DelegatorID: managerID, DelegateID: delegateID,
		ValidFrom: pgTS(ts(t, "2026-06-01 00:00")),
		ValidTo:   pgTS(ts(t, "2026-06-30 23:59")),
		Scope:     []byte(`{}`),
	})
	r := delegation.NewResolver(f, tenantID)

	at := ts(t, "2026-07-01 00:00")
	if got := r.Resolve(context.Background(), managerID, at, "leave_request"); got != managerID {
		t.Errorf("Resolve after-valid_to=%d want base=%d", got, managerID)
	}
}

func TestResolver_IsDelegate_Self_True(t *testing.T) {
	f := newFakeStore()
	r := delegation.NewResolver(f, tenantID)
	if !r.IsDelegate(context.Background(), managerID, managerID, time.Now(), "leave_request") {
		t.Errorf("IsDelegate(self)=false want true")
	}
}

func TestResolver_IsDelegate_ActiveScopeMatch_True(t *testing.T) {
	f := newFakeStore()
	f.seedDelegation(dbq.Delegation{
		TenantID: tenantID, DelegatorID: managerID, DelegateID: delegateID,
		ValidFrom: pgTS(ts(t, "2026-05-01 00:00")),
		ValidTo:   pgTS(ts(t, "2026-12-31 23:59")),
		Scope:     []byte(`{"document_types":["leave_request"]}`),
	})
	r := delegation.NewResolver(f, tenantID)
	at := ts(t, "2026-06-01 10:00")
	if !r.IsDelegate(context.Background(), managerID, delegateID, at, "leave_request") {
		t.Errorf("IsDelegate(scope-match)=false want true")
	}
}

func TestResolver_IsDelegate_NotMatchingUser_False(t *testing.T) {
	f := newFakeStore()
	f.seedDelegation(dbq.Delegation{
		TenantID: tenantID, DelegatorID: managerID, DelegateID: delegateID,
		ValidFrom: pgTS(ts(t, "2026-05-01 00:00")),
		ValidTo:   pgTS(ts(t, "2026-12-31 23:59")),
		Scope:     []byte(`{}`),
	})
	r := delegation.NewResolver(f, tenantID)
	at := ts(t, "2026-06-01 10:00")
	if r.IsDelegate(context.Background(), managerID, otherUserID, at, "leave_request") {
		t.Errorf("IsDelegate(other)=true want false")
	}
}

func TestResolver_IsDelegate_ZeroActor_False(t *testing.T) {
	f := newFakeStore()
	r := delegation.NewResolver(f, tenantID)
	if r.IsDelegate(context.Background(), managerID, 0, time.Now(), "leave_request") {
		t.Errorf("IsDelegate(actor=0)=true want false")
	}
}
