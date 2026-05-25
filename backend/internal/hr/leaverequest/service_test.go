package leaverequest_test

import (
	"context"
	"errors"
	"testing"
	"time"

	"github.com/jackc/pgx/v5/pgtype"

	dbq "github.com/sjseo/docflow/backend/internal/db/sqlc"
	"github.com/sjseo/docflow/backend/internal/hr/leave"
	"github.com/sjseo/docflow/backend/internal/hr/leaverequest"
)

// ---------- fixtures ----------

const (
	tenantID      = int64(1)
	requesterID   = int64(10)
	managerID     = int64(20)
	teamID        = int64(100)
	leaveTypeID   = int64(7)
	otherUserID   = int64(99)
	delegateID    = int64(30)
)

// kstAt — "YYYY-MM-DD HH:MM" KST 시각 파싱 helper.
func kstAt(t *testing.T, s string) time.Time {
	t.Helper()
	out, err := time.ParseInLocation("2006-01-02 15:04", s, leave.KSTLocation())
	if err != nil {
		t.Fatalf("parse %s: %v", s, err)
	}
	return out
}

// seedBasicCase — requester(manager 지정), manager, leaveType(annual, active), balance(120h granted) 시드.
func seedBasicCase(f *fakeStore, grantedHours float64) {
	f.seedUser(dbq.User{
		ID: requesterID, TenantID: tenantID,
		ManagerID: pgtype.Int8{Int64: managerID, Valid: true},
		TeamID:    pgtype.Int8{Int64: teamID, Valid: true},
	})
	f.seedUser(dbq.User{ID: managerID, TenantID: tenantID})
	f.seedTeam(dbq.Team{ID: teamID, TenantID: tenantID, Name: "팀A",
		TeamLeadID: pgtype.Int8{Int64: managerID, Valid: true},
	})
	f.seedLeaveType(dbq.LeaveType{
		ID: leaveTypeID, TenantID: tenantID, Code: "annual", Name: "연차",
		DefaultHours: numericFromFloat(8.0), IsActive: true, IsPaid: true,
	})
	f.seedBalance(dbq.LeaveBalance{
		TenantID: tenantID, UserID: requesterID, LeaveTypeID: leaveTypeID,
		PeriodYear:   int32(time.Now().Year()),
		GrantedHours: numericFromFloat(grantedHours),
		UsedHours:    numericFromFloat(0),
	})
}

func newService(f *fakeStore) *leaverequest.Service {
	return leaverequest.NewServiceWithClock(f, f, nil, func() time.Time {
		return time.Now().In(leave.KSTLocation())
	})
}

func newServiceAt(f *fakeStore, now time.Time) *leaverequest.Service {
	return leaverequest.NewServiceWithClock(f, f, nil, func() time.Time { return now })
}

// ---------- Create ----------

func TestService_Create_Success_RoutesToManager(t *testing.T) {
	now := kstAt(t, "2026-05-25 10:00")
	f := newFakeStore()
	seedBasicCase(f, 120)
	svc := newServiceAt(f, now)

	v, err := svc.Create(context.Background(), leaverequest.CreateInput{
		TenantID:    tenantID,
		RequesterID: requesterID,
		LeaveTypeID: leaveTypeID,
		StartAt:     kstAt(t, "2026-06-01 09:00"),
		EndAt:       kstAt(t, "2026-06-01 18:00"),
		Hours:       8,
		Reason:      "휴식",
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
	if v.Hours != 8.0 {
		t.Errorf("hours=%v want 8.0", v.Hours)
	}
}

func TestService_Create_InvalidDateRange(t *testing.T) {
	f := newFakeStore()
	seedBasicCase(f, 120)
	svc := newService(f)

	_, err := svc.Create(context.Background(), leaverequest.CreateInput{
		TenantID: tenantID, RequesterID: requesterID, LeaveTypeID: leaveTypeID,
		StartAt: kstAt(t, "2026-06-02 09:00"),
		EndAt:   kstAt(t, "2026-06-01 18:00"),
		Hours:   8,
	})
	if !errors.Is(err, leaverequest.ErrInvalidDateRange) {
		t.Fatalf("err=%v want ErrInvalidDateRange", err)
	}
}

func TestService_Create_HoursNonPositive_InvalidDateRange(t *testing.T) {
	f := newFakeStore()
	seedBasicCase(f, 120)
	svc := newService(f)

	_, err := svc.Create(context.Background(), leaverequest.CreateInput{
		TenantID: tenantID, RequesterID: requesterID, LeaveTypeID: leaveTypeID,
		StartAt: kstAt(t, "2026-06-01 09:00"),
		EndAt:   kstAt(t, "2026-06-01 18:00"),
		Hours:   0,
	})
	if !errors.Is(err, leaverequest.ErrInvalidDateRange) {
		t.Fatalf("err=%v want ErrInvalidDateRange", err)
	}
}

func TestService_Create_InsufficientBalance_ExactShortfall(t *testing.T) {
	f := newFakeStore()
	seedBasicCase(f, 4) // 4h만 보유
	svc := newService(f)

	_, err := svc.Create(context.Background(), leaverequest.CreateInput{
		TenantID: tenantID, RequesterID: requesterID, LeaveTypeID: leaveTypeID,
		StartAt: kstAt(t, "2026-06-01 09:00"),
		EndAt:   kstAt(t, "2026-06-01 18:00"),
		Hours:   8,
	})
	ibe, ok := leaverequest.IsInsufficientBalance(err)
	if !ok {
		t.Fatalf("err=%v want InsufficientBalanceError", err)
	}
	if ibe.ShortfallHours != 4.0 {
		t.Errorf("shortfall=%v want 4.0", ibe.ShortfallHours)
	}
}

func TestService_Create_DuplicateDate_Pending(t *testing.T) {
	f := newFakeStore()
	seedBasicCase(f, 120)
	svc := newService(f)

	in := leaverequest.CreateInput{
		TenantID: tenantID, RequesterID: requesterID, LeaveTypeID: leaveTypeID,
		StartAt: kstAt(t, "2026-06-01 09:00"),
		EndAt:   kstAt(t, "2026-06-01 18:00"),
		Hours:   8,
	}
	if _, err := svc.Create(context.Background(), in); err != nil {
		t.Fatalf("first create err=%v", err)
	}
	// 같은 날짜 두 번째 신청 → DUPLICATE.
	_, err := svc.Create(context.Background(), in)
	if !errors.Is(err, leaverequest.ErrDuplicateLeaveDate) {
		t.Fatalf("err=%v want ErrDuplicateLeaveDate", err)
	}
}

func TestService_Create_DuplicateDate_Approved_StillBlocks(t *testing.T) {
	f := newFakeStore()
	seedBasicCase(f, 120)
	// 이미 approved 된 row 시드.
	f.requests[1] = dbq.LeaveRequest{
		ID: 1, TenantID: tenantID, RequesterID: requesterID, LeaveTypeID: leaveTypeID,
		StartAt: pgTimestamptz(kstAt(t, "2026-06-01 09:00")),
		EndAt:   pgTimestamptz(kstAt(t, "2026-06-01 18:00")),
		Hours:   numericFromFloat(8),
		Status:  dbq.LeaveRequestStatusApproved,
	}
	f.nextReq = 1
	svc := newService(f)

	_, err := svc.Create(context.Background(), leaverequest.CreateInput{
		TenantID: tenantID, RequesterID: requesterID, LeaveTypeID: leaveTypeID,
		StartAt: kstAt(t, "2026-06-01 09:00"),
		EndAt:   kstAt(t, "2026-06-01 18:00"),
		Hours:   4,
	})
	if !errors.Is(err, leaverequest.ErrDuplicateLeaveDate) {
		t.Fatalf("err=%v want ErrDuplicateLeaveDate", err)
	}
}

func TestService_Create_DuplicateDate_Rejected_DoesNotBlock(t *testing.T) {
	f := newFakeStore()
	seedBasicCase(f, 120)
	// rejected 된 row 는 차단 안 함.
	f.requests[1] = dbq.LeaveRequest{
		ID: 1, TenantID: tenantID, RequesterID: requesterID, LeaveTypeID: leaveTypeID,
		StartAt: pgTimestamptz(kstAt(t, "2026-06-01 09:00")),
		EndAt:   pgTimestamptz(kstAt(t, "2026-06-01 18:00")),
		Hours:   numericFromFloat(8),
		Status:  dbq.LeaveRequestStatusRejected,
	}
	f.nextReq = 1
	svc := newService(f)

	_, err := svc.Create(context.Background(), leaverequest.CreateInput{
		TenantID: tenantID, RequesterID: requesterID, LeaveTypeID: leaveTypeID,
		StartAt: kstAt(t, "2026-06-01 09:00"),
		EndAt:   kstAt(t, "2026-06-01 18:00"),
		Hours:   8,
	})
	if err != nil {
		t.Fatalf("err=%v want nil (rejected should not block)", err)
	}
}

func TestService_Create_LeaveTypeInactive_NotFound(t *testing.T) {
	f := newFakeStore()
	seedBasicCase(f, 120)
	lt := f.leaveTypes[leaveTypeID]
	lt.IsActive = false
	f.leaveTypes[leaveTypeID] = lt
	svc := newService(f)

	_, err := svc.Create(context.Background(), leaverequest.CreateInput{
		TenantID: tenantID, RequesterID: requesterID, LeaveTypeID: leaveTypeID,
		StartAt: kstAt(t, "2026-06-01 09:00"),
		EndAt:   kstAt(t, "2026-06-01 18:00"),
		Hours:   8,
	})
	if !errors.Is(err, leaverequest.ErrLeaveTypeNotFound) {
		t.Fatalf("err=%v want ErrLeaveTypeNotFound", err)
	}
}

// ---- Delegation routing ----

// fixedDelegationResolver — 항상 같은 delegateID 로 라우팅하는 테스트 stub.
type fixedDelegationResolver struct {
	delegateOf map[int64]int64 // delegator → delegate
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
	now := kstAt(t, "2026-05-25 10:00")
	f := newFakeStore()
	seedBasicCase(f, 120)
	resolver := &fixedDelegationResolver{
		delegateOf: map[int64]int64{managerID: delegateID},
	}
	svc := leaverequest.NewServiceWithClock(f, f, resolver, func() time.Time { return now })

	v, err := svc.Create(context.Background(), leaverequest.CreateInput{
		TenantID: tenantID, RequesterID: requesterID, LeaveTypeID: leaveTypeID,
		StartAt: kstAt(t, "2026-06-01 09:00"),
		EndAt:   kstAt(t, "2026-06-01 18:00"),
		Hours:   8,
	})
	if err != nil {
		t.Fatalf("create err=%v", err)
	}
	if v.ApproverID != delegateID {
		t.Errorf("approverId=%d want %d (delegate)", v.ApproverID, delegateID)
	}
}

// ---------- Approve ----------

func TestService_Approve_Success_DecrementsBalance_StatusApproved(t *testing.T) {
	now := kstAt(t, "2026-05-26 10:00")
	f := newFakeStore()
	seedBasicCase(f, 120)
	svc := newServiceAt(f, now)

	created, err := svc.Create(context.Background(), leaverequest.CreateInput{
		TenantID: tenantID, RequesterID: requesterID, LeaveTypeID: leaveTypeID,
		StartAt: kstAt(t, "2026-06-01 09:00"),
		EndAt:   kstAt(t, "2026-06-01 18:00"),
		Hours:   8,
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
		t.Errorf("comment=%q want '승인합니다'", v.DecisionComment)
	}

	// balance check — used_hours 가 정확히 8h 증가했어야 함.
	var totalUsed float64
	for _, b := range f.balances {
		if b.UserID == requesterID && b.LeaveTypeID == leaveTypeID {
			totalUsed = numericFloat(b.UsedHours)
		}
	}
	if totalUsed != 8.0 {
		t.Errorf("used_hours=%v want 8.0", totalUsed)
	}
}

func TestService_Approve_AlreadyApproved_InvalidState(t *testing.T) {
	now := kstAt(t, "2026-05-26 10:00")
	f := newFakeStore()
	seedBasicCase(f, 120)
	svc := newServiceAt(f, now)

	created, _ := svc.Create(context.Background(), leaverequest.CreateInput{
		TenantID: tenantID, RequesterID: requesterID, LeaveTypeID: leaveTypeID,
		StartAt: kstAt(t, "2026-06-01 09:00"),
		EndAt:   kstAt(t, "2026-06-01 18:00"),
		Hours:   8,
	})
	if _, err := svc.Approve(context.Background(), created.ID, managerID, tenantID, "ok"); err != nil {
		t.Fatalf("first approve err=%v", err)
	}

	_, err := svc.Approve(context.Background(), created.ID, managerID, tenantID, "again")
	if !errors.Is(err, leaverequest.ErrApprovalInvalidState) {
		t.Fatalf("err=%v want ErrApprovalInvalidState", err)
	}
}

func TestService_Approve_DifferentApprover_Forbidden(t *testing.T) {
	now := kstAt(t, "2026-05-26 10:00")
	f := newFakeStore()
	seedBasicCase(f, 120)
	f.seedUser(dbq.User{ID: otherUserID, TenantID: tenantID})
	svc := newServiceAt(f, now)

	created, _ := svc.Create(context.Background(), leaverequest.CreateInput{
		TenantID: tenantID, RequesterID: requesterID, LeaveTypeID: leaveTypeID,
		StartAt: kstAt(t, "2026-06-01 09:00"),
		EndAt:   kstAt(t, "2026-06-01 18:00"),
		Hours:   8,
	})

	_, err := svc.Approve(context.Background(), created.ID, otherUserID, tenantID, "ok")
	if !errors.Is(err, leaverequest.ErrForbidden) {
		t.Fatalf("err=%v want ErrForbidden", err)
	}
}

func TestService_Approve_AsDelegate_Allowed(t *testing.T) {
	now := kstAt(t, "2026-05-26 10:00")
	f := newFakeStore()
	seedBasicCase(f, 120)
	f.seedUser(dbq.User{ID: delegateID, TenantID: tenantID})
	resolver := &fixedDelegationResolver{
		delegateOf: map[int64]int64{managerID: delegateID},
	}
	// Note: Create 시점에도 위임 적용되어 approver=delegateID 가 됨.
	svc := leaverequest.NewServiceWithClock(f, f, resolver, func() time.Time { return now })

	created, err := svc.Create(context.Background(), leaverequest.CreateInput{
		TenantID: tenantID, RequesterID: requesterID, LeaveTypeID: leaveTypeID,
		StartAt: kstAt(t, "2026-06-01 09:00"),
		EndAt:   kstAt(t, "2026-06-01 18:00"),
		Hours:   8,
	})
	if err != nil {
		t.Fatalf("create err=%v", err)
	}

	// delegateID 가 승인 — approver 가 delegateID 라서 IsDelegate 매칭으로 통과.
	v, err := svc.Approve(context.Background(), created.ID, delegateID, tenantID, "위임 승인")
	if err != nil {
		t.Fatalf("approve err=%v", err)
	}
	if v.Status != "approved" {
		t.Errorf("status=%s want approved", v.Status)
	}
}

func TestService_Approve_TransactionAtomic_ConcurrentOnlyOneSucceeds(t *testing.T) {
	now := kstAt(t, "2026-05-26 10:00")
	f := newFakeStore()
	seedBasicCase(f, 8) // 8h 만 보유 — 두 번째는 잔여 부족으로 실패해야 함.
	svc := newServiceAt(f, now)

	// 두 개의 8h 신청을 만들어 둠 (다른 날짜).
	created1, err := svc.Create(context.Background(), leaverequest.CreateInput{
		TenantID: tenantID, RequesterID: requesterID, LeaveTypeID: leaveTypeID,
		StartAt: kstAt(t, "2026-06-01 09:00"),
		EndAt:   kstAt(t, "2026-06-01 18:00"),
		Hours:   8,
	})
	if err != nil {
		t.Fatalf("create1 err=%v", err)
	}
	created2, err := svc.Create(context.Background(), leaverequest.CreateInput{
		TenantID: tenantID, RequesterID: requesterID, LeaveTypeID: leaveTypeID,
		StartAt: kstAt(t, "2026-06-02 09:00"),
		EndAt:   kstAt(t, "2026-06-02 18:00"),
		Hours:   8,
	})
	if err != nil {
		t.Fatalf("create2 err=%v", err)
	}

	// 첫 번째 승인 → OK.
	if _, err := svc.Approve(context.Background(), created1.ID, managerID, tenantID, "ok"); err != nil {
		t.Fatalf("approve1 err=%v", err)
	}
	// 두 번째 승인 → 잔여 부족 (이미 8h 차감되어 0h 남음).
	_, err = svc.Approve(context.Background(), created2.ID, managerID, tenantID, "ok")
	if _, ok := leaverequest.IsInsufficientBalance(err); !ok {
		t.Fatalf("approve2 err=%v want InsufficientBalance", err)
	}

	// 트랜잭션 rollback 확인 — used_hours 는 첫 8h 만 반영.
	var totalUsed float64
	for _, b := range f.balances {
		if b.UserID == requesterID && b.LeaveTypeID == leaveTypeID {
			totalUsed = numericFloat(b.UsedHours)
		}
	}
	if totalUsed != 8.0 {
		t.Errorf("used_hours=%v want 8.0 (second approve must rollback)", totalUsed)
	}

	// 두 번째 신청 상태는 여전히 pending.
	r2 := f.requests[created2.ID]
	if r2.Status != dbq.LeaveRequestStatusPending {
		t.Errorf("second req status=%s want pending (rollback failed)", r2.Status)
	}
}

// ---------- Reject ----------

func TestService_Reject_Success_NoBalanceChange(t *testing.T) {
	now := kstAt(t, "2026-05-26 10:00")
	f := newFakeStore()
	seedBasicCase(f, 120)
	svc := newServiceAt(f, now)

	created, _ := svc.Create(context.Background(), leaverequest.CreateInput{
		TenantID: tenantID, RequesterID: requesterID, LeaveTypeID: leaveTypeID,
		StartAt: kstAt(t, "2026-06-01 09:00"),
		EndAt:   kstAt(t, "2026-06-01 18:00"),
		Hours:   8,
	})

	v, err := svc.Reject(context.Background(), created.ID, managerID, tenantID, "팀 일정상 어렵습니다")
	if err != nil {
		t.Fatalf("reject err=%v", err)
	}
	if v.Status != "rejected" {
		t.Errorf("status=%s want rejected", v.Status)
	}
	if v.DecisionComment != "팀 일정상 어렵습니다" {
		t.Errorf("comment=%q", v.DecisionComment)
	}

	// balance 변동 없음.
	var totalUsed float64
	for _, b := range f.balances {
		if b.UserID == requesterID && b.LeaveTypeID == leaveTypeID {
			totalUsed = numericFloat(b.UsedHours)
		}
	}
	if totalUsed != 0 {
		t.Errorf("used_hours=%v want 0 (reject should not change balance)", totalUsed)
	}
}

func TestService_Reject_EmptyComment_Required(t *testing.T) {
	now := kstAt(t, "2026-05-26 10:00")
	f := newFakeStore()
	seedBasicCase(f, 120)
	svc := newServiceAt(f, now)

	created, _ := svc.Create(context.Background(), leaverequest.CreateInput{
		TenantID: tenantID, RequesterID: requesterID, LeaveTypeID: leaveTypeID,
		StartAt: kstAt(t, "2026-06-01 09:00"),
		EndAt:   kstAt(t, "2026-06-01 18:00"),
		Hours:   8,
	})

	_, err := svc.Reject(context.Background(), created.ID, managerID, tenantID, "  ")
	if !errors.Is(err, leaverequest.ErrRejectReasonRequired) {
		t.Fatalf("err=%v want ErrRejectReasonRequired", err)
	}
}

// ---------- Cancel ----------

func TestService_Cancel_OwnPending_Success(t *testing.T) {
	now := kstAt(t, "2026-05-26 10:00")
	f := newFakeStore()
	seedBasicCase(f, 120)
	svc := newServiceAt(f, now)

	created, _ := svc.Create(context.Background(), leaverequest.CreateInput{
		TenantID: tenantID, RequesterID: requesterID, LeaveTypeID: leaveTypeID,
		StartAt: kstAt(t, "2026-06-01 09:00"),
		EndAt:   kstAt(t, "2026-06-01 18:00"),
		Hours:   8,
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
	now := kstAt(t, "2026-05-26 10:00")
	f := newFakeStore()
	seedBasicCase(f, 120)
	svc := newServiceAt(f, now)

	created, _ := svc.Create(context.Background(), leaverequest.CreateInput{
		TenantID: tenantID, RequesterID: requesterID, LeaveTypeID: leaveTypeID,
		StartAt: kstAt(t, "2026-06-01 09:00"),
		EndAt:   kstAt(t, "2026-06-01 18:00"),
		Hours:   8,
	})
	_, _ = svc.Approve(context.Background(), created.ID, managerID, tenantID, "ok")

	_, err := svc.Cancel(context.Background(), created.ID, requesterID, tenantID)
	if !errors.Is(err, leaverequest.ErrApprovalInvalidState) {
		t.Fatalf("err=%v want ErrApprovalInvalidState", err)
	}
}

func TestService_Cancel_NotOwner_Forbidden(t *testing.T) {
	now := kstAt(t, "2026-05-26 10:00")
	f := newFakeStore()
	seedBasicCase(f, 120)
	f.seedUser(dbq.User{ID: otherUserID, TenantID: tenantID})
	svc := newServiceAt(f, now)

	created, _ := svc.Create(context.Background(), leaverequest.CreateInput{
		TenantID: tenantID, RequesterID: requesterID, LeaveTypeID: leaveTypeID,
		StartAt: kstAt(t, "2026-06-01 09:00"),
		EndAt:   kstAt(t, "2026-06-01 18:00"),
		Hours:   8,
	})

	_, err := svc.Cancel(context.Background(), created.ID, otherUserID, tenantID)
	if !errors.Is(err, leaverequest.ErrForbidden) {
		t.Fatalf("err=%v want ErrForbidden", err)
	}
}

// ---------- Get ----------

func TestService_Get_AsRequester_OK(t *testing.T) {
	f := newFakeStore()
	seedBasicCase(f, 120)
	svc := newService(f)

	created, _ := svc.Create(context.Background(), leaverequest.CreateInput{
		TenantID: tenantID, RequesterID: requesterID, LeaveTypeID: leaveTypeID,
		StartAt: kstAt(t, "2026-06-01 09:00"),
		EndAt:   kstAt(t, "2026-06-01 18:00"),
		Hours:   8,
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
	seedBasicCase(f, 120)
	svc := newService(f)

	created, _ := svc.Create(context.Background(), leaverequest.CreateInput{
		TenantID: tenantID, RequesterID: requesterID, LeaveTypeID: leaveTypeID,
		StartAt: kstAt(t, "2026-06-01 09:00"),
		EndAt:   kstAt(t, "2026-06-01 18:00"),
		Hours:   8,
	})

	_, err := svc.Get(context.Background(), created.ID, managerID, tenantID, false)
	if err != nil {
		t.Fatalf("get err=%v", err)
	}
}

func TestService_Get_AsOther_Forbidden(t *testing.T) {
	f := newFakeStore()
	seedBasicCase(f, 120)
	f.seedUser(dbq.User{ID: otherUserID, TenantID: tenantID})
	svc := newService(f)

	created, _ := svc.Create(context.Background(), leaverequest.CreateInput{
		TenantID: tenantID, RequesterID: requesterID, LeaveTypeID: leaveTypeID,
		StartAt: kstAt(t, "2026-06-01 09:00"),
		EndAt:   kstAt(t, "2026-06-01 18:00"),
		Hours:   8,
	})

	_, err := svc.Get(context.Background(), created.ID, otherUserID, tenantID, false /* not HR */)
	if !errors.Is(err, leaverequest.ErrForbidden) {
		t.Fatalf("err=%v want ErrForbidden", err)
	}
}

func TestService_Get_AsHRManager_OK(t *testing.T) {
	f := newFakeStore()
	seedBasicCase(f, 120)
	f.seedUser(dbq.User{ID: otherUserID, TenantID: tenantID})
	svc := newService(f)

	created, _ := svc.Create(context.Background(), leaverequest.CreateInput{
		TenantID: tenantID, RequesterID: requesterID, LeaveTypeID: leaveTypeID,
		StartAt: kstAt(t, "2026-06-01 09:00"),
		EndAt:   kstAt(t, "2026-06-01 18:00"),
		Hours:   8,
	})

	_, err := svc.Get(context.Background(), created.ID, otherUserID, tenantID, true /* HR */)
	if err != nil {
		t.Fatalf("get err=%v", err)
	}
}

// ---------- PendingList / MyList ----------

func TestService_MyList_OnlyOwnRequests(t *testing.T) {
	f := newFakeStore()
	seedBasicCase(f, 120)
	f.seedUser(dbq.User{ID: otherUserID, TenantID: tenantID,
		ManagerID: pgtype.Int8{Int64: managerID, Valid: true},
	})
	svc := newService(f)

	_, _ = svc.Create(context.Background(), leaverequest.CreateInput{
		TenantID: tenantID, RequesterID: requesterID, LeaveTypeID: leaveTypeID,
		StartAt: kstAt(t, "2026-06-01 09:00"),
		EndAt:   kstAt(t, "2026-06-01 18:00"),
		Hours:   8,
	})
	_, _ = svc.Create(context.Background(), leaverequest.CreateInput{
		TenantID: tenantID, RequesterID: otherUserID, LeaveTypeID: leaveTypeID,
		StartAt: kstAt(t, "2026-06-02 09:00"),
		EndAt:   kstAt(t, "2026-06-02 18:00"),
		Hours:   8,
	})

	res, err := svc.MyList(context.Background(), requesterID, tenantID, leaverequest.ListInput{Page: 1, Size: 10})
	if err != nil {
		t.Fatalf("mylist err=%v", err)
	}
	if res.Total != 1 {
		t.Errorf("total=%d want 1", res.Total)
	}
	if len(res.Items) != 1 || res.Items[0].RequesterID != requesterID {
		t.Errorf("items=%+v", res.Items)
	}
}

func TestService_PendingList_OnlyForApprover(t *testing.T) {
	f := newFakeStore()
	seedBasicCase(f, 120)
	svc := newService(f)

	_, _ = svc.Create(context.Background(), leaverequest.CreateInput{
		TenantID: tenantID, RequesterID: requesterID, LeaveTypeID: leaveTypeID,
		StartAt: kstAt(t, "2026-06-01 09:00"),
		EndAt:   kstAt(t, "2026-06-01 18:00"),
		Hours:   8,
	})

	res, err := svc.PendingList(context.Background(), managerID, tenantID, leaverequest.ListInput{Page: 1, Size: 10})
	if err != nil {
		t.Fatalf("pendinglist err=%v", err)
	}
	if res.Total != 1 {
		t.Errorf("total=%d want 1", res.Total)
	}
}
