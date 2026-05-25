package expensereport_test

import (
	"context"
	"errors"
	"testing"
	"time"

	"github.com/jackc/pgx/v5/pgtype"

	dbq "github.com/sjseo/docflow/backend/internal/db/sqlc"
	"github.com/sjseo/docflow/backend/internal/hr/expensereport"
	"github.com/sjseo/docflow/backend/internal/hr/leave"
)

// ---------- fixtures ----------

const (
	tenantID    = int64(1)
	requesterID = int64(10)
	managerID   = int64(20)
	teamID      = int64(100)
	otherUserID = int64(99)
	delegateID  = int64(30)
)

// seedBasicCase — requester(manager 지정), manager, team 시드.
func seedBasicCase(f *fakeStore) {
	f.seedUser(dbq.User{
		ID: requesterID, TenantID: tenantID,
		ManagerID: pgtype.Int8{Int64: managerID, Valid: true},
		TeamID:    pgtype.Int8{Int64: teamID, Valid: true},
	})
	f.seedUser(dbq.User{ID: managerID, TenantID: tenantID})
	f.seedTeam(dbq.Team{ID: teamID, TenantID: tenantID, Name: "팀A",
		TeamLeadID: pgtype.Int8{Int64: managerID, Valid: true},
	})
}

func newService(f *fakeStore) *expensereport.Service {
	return expensereport.NewServiceWithClock(f, f, nil, func() time.Time {
		return time.Now().In(leave.KSTLocation())
	})
}

func newServiceAt(f *fakeStore, now time.Time) *expensereport.Service {
	return expensereport.NewServiceWithClock(f, f, nil, func() time.Time { return now })
}

func kstAt(t *testing.T, s string) time.Time {
	t.Helper()
	out, err := time.ParseInLocation("2006-01-02", s, leave.KSTLocation())
	if err != nil {
		t.Fatalf("parse %s: %v", s, err)
	}
	return out
}

// ---------- Create ----------

func TestService_Create_Success_RoutesToManager(t *testing.T) {
	now := kstAt(t, "2026-05-25")
	f := newFakeStore()
	seedBasicCase(f)
	svc := newServiceAt(f, now)

	v, err := svc.Create(context.Background(), expensereport.CreateInput{
		TenantID:    tenantID,
		RequesterID: requesterID,
		AmountWon:   45000,
		Vendor:      "스타벅스 강남점",
		Purpose:     "거래처 미팅 식대",
		PaidAt:      kstAt(t, "2026-05-20"),
	})
	if err != nil {
		t.Fatalf("create err=%v", err)
	}
	if v.Status != "pending" {
		t.Errorf("status=%s want pending", v.Status)
	}
	if v.ApproverID != managerID {
		t.Errorf("approverId=%d want %d (manager)", v.ApproverID, managerID)
	}
	if v.AmountWon != 45000 {
		t.Errorf("amount=%d want 45000", v.AmountWon)
	}
}

func TestService_Create_InvalidAmount_Zero(t *testing.T) {
	f := newFakeStore()
	seedBasicCase(f)
	svc := newService(f)

	_, err := svc.Create(context.Background(), expensereport.CreateInput{
		TenantID: tenantID, RequesterID: requesterID,
		AmountWon: 0, Vendor: "v", Purpose: "p",
		PaidAt: kstAt(t, "2026-05-20"),
	})
	if !errors.Is(err, expensereport.ErrInvalidAmount) {
		t.Fatalf("err=%v want ErrInvalidAmount", err)
	}
}

func TestService_Create_InvalidAmount_Negative(t *testing.T) {
	f := newFakeStore()
	seedBasicCase(f)
	svc := newService(f)

	_, err := svc.Create(context.Background(), expensereport.CreateInput{
		TenantID: tenantID, RequesterID: requesterID,
		AmountWon: -100, Vendor: "v", Purpose: "p",
		PaidAt: kstAt(t, "2026-05-20"),
	})
	if !errors.Is(err, expensereport.ErrInvalidAmount) {
		t.Fatalf("err=%v want ErrInvalidAmount", err)
	}
}

func TestService_Create_EmptyVendor(t *testing.T) {
	f := newFakeStore()
	seedBasicCase(f)
	svc := newService(f)

	_, err := svc.Create(context.Background(), expensereport.CreateInput{
		TenantID: tenantID, RequesterID: requesterID,
		AmountWon: 1000, Vendor: "   ", Purpose: "p",
		PaidAt: kstAt(t, "2026-05-20"),
	})
	if !errors.Is(err, expensereport.ErrVendorRequired) {
		t.Fatalf("err=%v want ErrVendorRequired", err)
	}
}

func TestService_Create_EmptyPurpose(t *testing.T) {
	f := newFakeStore()
	seedBasicCase(f)
	svc := newService(f)

	_, err := svc.Create(context.Background(), expensereport.CreateInput{
		TenantID: tenantID, RequesterID: requesterID,
		AmountWon: 1000, Vendor: "v", Purpose: "",
		PaidAt: kstAt(t, "2026-05-20"),
	})
	if !errors.Is(err, expensereport.ErrPurposeRequired) {
		t.Fatalf("err=%v want ErrPurposeRequired", err)
	}
}

func TestService_Create_InvalidPaidAt(t *testing.T) {
	f := newFakeStore()
	seedBasicCase(f)
	svc := newService(f)

	_, err := svc.Create(context.Background(), expensereport.CreateInput{
		TenantID: tenantID, RequesterID: requesterID,
		AmountWon: 1000, Vendor: "v", Purpose: "p",
	})
	if !errors.Is(err, expensereport.ErrInvalidPaidAt) {
		t.Fatalf("err=%v want ErrInvalidPaidAt", err)
	}
}

// ---- Delegation routing ----

type fixedDelegationResolver struct {
	delegateOf map[int64]int64
}

func (r *fixedDelegationResolver) Resolve(_ context.Context, base int64, _ time.Time, _ string) int64 {
	if d, ok := r.delegateOf[base]; ok {
		return d
	}
	return base
}
func (r *fixedDelegationResolver) IsDelegate(_ context.Context, original, actor int64, _ time.Time, _ string) bool {
	if original == actor {
		return true
	}
	d, ok := r.delegateOf[original]
	return ok && d == actor
}

func TestService_Create_ActiveDelegation_RoutesToDelegate(t *testing.T) {
	now := kstAt(t, "2026-05-25")
	f := newFakeStore()
	seedBasicCase(f)
	resolver := &fixedDelegationResolver{
		delegateOf: map[int64]int64{managerID: delegateID},
	}
	svc := expensereport.NewServiceWithClock(f, f, resolver, func() time.Time { return now })

	v, err := svc.Create(context.Background(), expensereport.CreateInput{
		TenantID: tenantID, RequesterID: requesterID,
		AmountWon: 1000, Vendor: "v", Purpose: "p",
		PaidAt: kstAt(t, "2026-05-20"),
	})
	if err != nil {
		t.Fatalf("create err=%v", err)
	}
	if v.ApproverID != delegateID {
		t.Errorf("approverId=%d want %d (delegate)", v.ApproverID, delegateID)
	}
}

// ---------- Approve ----------

func TestService_Approve_Success_StatusApproved(t *testing.T) {
	now := kstAt(t, "2026-05-26")
	f := newFakeStore()
	seedBasicCase(f)
	svc := newServiceAt(f, now)

	created, err := svc.Create(context.Background(), expensereport.CreateInput{
		TenantID: tenantID, RequesterID: requesterID,
		AmountWon: 1000, Vendor: "v", Purpose: "p",
		PaidAt: kstAt(t, "2026-05-20"),
	})
	if err != nil {
		t.Fatalf("create err=%v", err)
	}

	v, err := svc.Approve(context.Background(), created.ID, managerID, tenantID, "승인합니다")
	if err != nil {
		t.Fatalf("approve err=%v", err)
	}
	if v.Status != "approved" {
		t.Errorf("status=%s want approved", v.Status)
	}
	if v.ApproverID != managerID {
		t.Errorf("approverId=%d want %d", v.ApproverID, managerID)
	}
	if v.DecisionComment != "승인합니다" {
		t.Errorf("comment=%q", v.DecisionComment)
	}
}

func TestService_Approve_AlreadyApproved_InvalidState(t *testing.T) {
	now := kstAt(t, "2026-05-26")
	f := newFakeStore()
	seedBasicCase(f)
	svc := newServiceAt(f, now)

	created, _ := svc.Create(context.Background(), expensereport.CreateInput{
		TenantID: tenantID, RequesterID: requesterID,
		AmountWon: 1000, Vendor: "v", Purpose: "p",
		PaidAt: kstAt(t, "2026-05-20"),
	})
	if _, err := svc.Approve(context.Background(), created.ID, managerID, tenantID, "ok"); err != nil {
		t.Fatalf("first approve err=%v", err)
	}
	_, err := svc.Approve(context.Background(), created.ID, managerID, tenantID, "again")
	if !errors.Is(err, expensereport.ErrApprovalInvalidState) {
		t.Fatalf("err=%v want ErrApprovalInvalidState", err)
	}
}

func TestService_Approve_DifferentApprover_Forbidden(t *testing.T) {
	now := kstAt(t, "2026-05-26")
	f := newFakeStore()
	seedBasicCase(f)
	f.seedUser(dbq.User{ID: otherUserID, TenantID: tenantID})
	svc := newServiceAt(f, now)

	created, _ := svc.Create(context.Background(), expensereport.CreateInput{
		TenantID: tenantID, RequesterID: requesterID,
		AmountWon: 1000, Vendor: "v", Purpose: "p",
		PaidAt: kstAt(t, "2026-05-20"),
	})

	_, err := svc.Approve(context.Background(), created.ID, otherUserID, tenantID, "ok")
	if !errors.Is(err, expensereport.ErrForbidden) {
		t.Fatalf("err=%v want ErrForbidden", err)
	}
}

func TestService_Approve_AsDelegate_Allowed(t *testing.T) {
	now := kstAt(t, "2026-05-26")
	f := newFakeStore()
	seedBasicCase(f)
	f.seedUser(dbq.User{ID: delegateID, TenantID: tenantID})
	resolver := &fixedDelegationResolver{
		delegateOf: map[int64]int64{managerID: delegateID},
	}
	svc := expensereport.NewServiceWithClock(f, f, resolver, func() time.Time { return now })

	created, err := svc.Create(context.Background(), expensereport.CreateInput{
		TenantID: tenantID, RequesterID: requesterID,
		AmountWon: 1000, Vendor: "v", Purpose: "p",
		PaidAt: kstAt(t, "2026-05-20"),
	})
	if err != nil {
		t.Fatalf("create err=%v", err)
	}

	v, err := svc.Approve(context.Background(), created.ID, delegateID, tenantID, "위임 승인")
	if err != nil {
		t.Fatalf("approve err=%v", err)
	}
	if v.Status != "approved" {
		t.Errorf("status=%s want approved", v.Status)
	}
}

// ---------- Reject ----------

func TestService_Reject_Success(t *testing.T) {
	now := kstAt(t, "2026-05-26")
	f := newFakeStore()
	seedBasicCase(f)
	svc := newServiceAt(f, now)

	created, _ := svc.Create(context.Background(), expensereport.CreateInput{
		TenantID: tenantID, RequesterID: requesterID,
		AmountWon: 1000, Vendor: "v", Purpose: "p",
		PaidAt: kstAt(t, "2026-05-20"),
	})

	v, err := svc.Reject(context.Background(), created.ID, managerID, tenantID, "증빙 부족")
	if err != nil {
		t.Fatalf("reject err=%v", err)
	}
	if v.Status != "rejected" {
		t.Errorf("status=%s want rejected", v.Status)
	}
	if v.DecisionComment != "증빙 부족" {
		t.Errorf("comment=%q", v.DecisionComment)
	}
}

func TestService_Reject_EmptyComment_Required(t *testing.T) {
	now := kstAt(t, "2026-05-26")
	f := newFakeStore()
	seedBasicCase(f)
	svc := newServiceAt(f, now)

	created, _ := svc.Create(context.Background(), expensereport.CreateInput{
		TenantID: tenantID, RequesterID: requesterID,
		AmountWon: 1000, Vendor: "v", Purpose: "p",
		PaidAt: kstAt(t, "2026-05-20"),
	})

	_, err := svc.Reject(context.Background(), created.ID, managerID, tenantID, "  ")
	if !errors.Is(err, expensereport.ErrRejectReasonRequired) {
		t.Fatalf("err=%v want ErrRejectReasonRequired", err)
	}
}

// ---------- Cancel ----------

func TestService_Cancel_OwnPending_Success(t *testing.T) {
	now := kstAt(t, "2026-05-26")
	f := newFakeStore()
	seedBasicCase(f)
	svc := newServiceAt(f, now)

	created, _ := svc.Create(context.Background(), expensereport.CreateInput{
		TenantID: tenantID, RequesterID: requesterID,
		AmountWon: 1000, Vendor: "v", Purpose: "p",
		PaidAt: kstAt(t, "2026-05-20"),
	})

	v, err := svc.Cancel(context.Background(), created.ID, requesterID, tenantID)
	if err != nil {
		t.Fatalf("cancel err=%v", err)
	}
	if v.Status != "cancelled" {
		t.Errorf("status=%s want cancelled", v.Status)
	}
}

func TestService_Cancel_Approved_InvalidState(t *testing.T) {
	now := kstAt(t, "2026-05-26")
	f := newFakeStore()
	seedBasicCase(f)
	svc := newServiceAt(f, now)

	created, _ := svc.Create(context.Background(), expensereport.CreateInput{
		TenantID: tenantID, RequesterID: requesterID,
		AmountWon: 1000, Vendor: "v", Purpose: "p",
		PaidAt: kstAt(t, "2026-05-20"),
	})
	_, _ = svc.Approve(context.Background(), created.ID, managerID, tenantID, "ok")

	_, err := svc.Cancel(context.Background(), created.ID, requesterID, tenantID)
	if !errors.Is(err, expensereport.ErrApprovalInvalidState) {
		t.Fatalf("err=%v want ErrApprovalInvalidState", err)
	}
}

func TestService_Cancel_NotOwner_Forbidden(t *testing.T) {
	now := kstAt(t, "2026-05-26")
	f := newFakeStore()
	seedBasicCase(f)
	f.seedUser(dbq.User{ID: otherUserID, TenantID: tenantID})
	svc := newServiceAt(f, now)

	created, _ := svc.Create(context.Background(), expensereport.CreateInput{
		TenantID: tenantID, RequesterID: requesterID,
		AmountWon: 1000, Vendor: "v", Purpose: "p",
		PaidAt: kstAt(t, "2026-05-20"),
	})

	_, err := svc.Cancel(context.Background(), created.ID, otherUserID, tenantID)
	if !errors.Is(err, expensereport.ErrForbidden) {
		t.Fatalf("err=%v want ErrForbidden", err)
	}
}

// ---------- Get ----------

func TestService_Get_AsRequester_OK(t *testing.T) {
	f := newFakeStore()
	seedBasicCase(f)
	svc := newService(f)

	created, _ := svc.Create(context.Background(), expensereport.CreateInput{
		TenantID: tenantID, RequesterID: requesterID,
		AmountWon: 1000, Vendor: "v", Purpose: "p",
		PaidAt: kstAt(t, "2026-05-20"),
	})

	v, err := svc.Get(context.Background(), created.ID, requesterID, tenantID, false)
	if err != nil {
		t.Fatalf("get err=%v", err)
	}
	if v.ID != created.ID {
		t.Errorf("id=%d", v.ID)
	}
}

func TestService_Get_AsApprover_OK(t *testing.T) {
	f := newFakeStore()
	seedBasicCase(f)
	svc := newService(f)

	created, _ := svc.Create(context.Background(), expensereport.CreateInput{
		TenantID: tenantID, RequesterID: requesterID,
		AmountWon: 1000, Vendor: "v", Purpose: "p",
		PaidAt: kstAt(t, "2026-05-20"),
	})

	_, err := svc.Get(context.Background(), created.ID, managerID, tenantID, false)
	if err != nil {
		t.Fatalf("get err=%v", err)
	}
}

func TestService_Get_AsOther_Forbidden(t *testing.T) {
	f := newFakeStore()
	seedBasicCase(f)
	f.seedUser(dbq.User{ID: otherUserID, TenantID: tenantID})
	svc := newService(f)

	created, _ := svc.Create(context.Background(), expensereport.CreateInput{
		TenantID: tenantID, RequesterID: requesterID,
		AmountWon: 1000, Vendor: "v", Purpose: "p",
		PaidAt: kstAt(t, "2026-05-20"),
	})

	_, err := svc.Get(context.Background(), created.ID, otherUserID, tenantID, false)
	if !errors.Is(err, expensereport.ErrForbidden) {
		t.Fatalf("err=%v want ErrForbidden", err)
	}
}

func TestService_Get_AsHRManager_OK(t *testing.T) {
	f := newFakeStore()
	seedBasicCase(f)
	f.seedUser(dbq.User{ID: otherUserID, TenantID: tenantID})
	svc := newService(f)

	created, _ := svc.Create(context.Background(), expensereport.CreateInput{
		TenantID: tenantID, RequesterID: requesterID,
		AmountWon: 1000, Vendor: "v", Purpose: "p",
		PaidAt: kstAt(t, "2026-05-20"),
	})

	_, err := svc.Get(context.Background(), created.ID, otherUserID, tenantID, true)
	if err != nil {
		t.Fatalf("get err=%v", err)
	}
}

// ---------- MyList / PendingList ----------

func TestService_MyList_OnlyOwnRequests(t *testing.T) {
	f := newFakeStore()
	seedBasicCase(f)
	f.seedUser(dbq.User{ID: otherUserID, TenantID: tenantID,
		ManagerID: pgtype.Int8{Int64: managerID, Valid: true},
	})
	svc := newService(f)

	_, _ = svc.Create(context.Background(), expensereport.CreateInput{
		TenantID: tenantID, RequesterID: requesterID,
		AmountWon: 1000, Vendor: "v", Purpose: "p",
		PaidAt: kstAt(t, "2026-05-20"),
	})
	_, _ = svc.Create(context.Background(), expensereport.CreateInput{
		TenantID: tenantID, RequesterID: otherUserID,
		AmountWon: 2000, Vendor: "v", Purpose: "p",
		PaidAt: kstAt(t, "2026-05-20"),
	})

	res, err := svc.MyList(context.Background(), requesterID, tenantID, expensereport.ListInput{Page: 1, Size: 10})
	if err != nil {
		t.Fatalf("mylist err=%v", err)
	}
	if res.Total != 1 {
		t.Errorf("total=%d want 1", res.Total)
	}
}

func TestService_PendingList_OnlyForApprover(t *testing.T) {
	f := newFakeStore()
	seedBasicCase(f)
	svc := newService(f)

	_, _ = svc.Create(context.Background(), expensereport.CreateInput{
		TenantID: tenantID, RequesterID: requesterID,
		AmountWon: 1000, Vendor: "v", Purpose: "p",
		PaidAt: kstAt(t, "2026-05-20"),
	})

	res, err := svc.PendingList(context.Background(), managerID, tenantID, expensereport.ListInput{Page: 1, Size: 10})
	if err != nil {
		t.Fatalf("pendinglist err=%v", err)
	}
	if res.Total != 1 {
		t.Errorf("total=%d want 1", res.Total)
	}
}

// ---------- UpdateAttachmentURL ----------

func TestService_UpdateAttachmentURL_Success(t *testing.T) {
	f := newFakeStore()
	seedBasicCase(f)
	svc := newService(f)

	created, _ := svc.Create(context.Background(), expensereport.CreateInput{
		TenantID: tenantID, RequesterID: requesterID,
		AmountWon: 1000, Vendor: "v", Purpose: "p",
		PaidAt: kstAt(t, "2026-05-20"),
	})

	v, err := svc.UpdateAttachmentURL(context.Background(), created.ID, tenantID, "expense/1/uuid-test.pdf")
	if err != nil {
		t.Fatalf("update err=%v", err)
	}
	if v.AttachmentURL != "expense/1/uuid-test.pdf" {
		t.Errorf("url=%q", v.AttachmentURL)
	}
}
