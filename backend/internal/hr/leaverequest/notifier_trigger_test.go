package leaverequest_test

import (
	"context"
	"sync"
	"testing"

	"github.com/jackc/pgx/v5/pgtype"

	dbq "github.com/sjseo/docflow/backend/internal/db/sqlc"
	"github.com/sjseo/docflow/backend/internal/hr/leaverequest"
)

// fakeNotifier — Notify 호출 기록만.
type fakeNotifier struct {
	mu    sync.Mutex
	calls []notifyCall
}

type notifyCall struct {
	TenantID int64
	UserID   int64
	Type     string
	Title    string
}

func (f *fakeNotifier) Notify(_ context.Context, tenantID, userID int64, n leaverequest.NewNotification) error {
	f.mu.Lock()
	defer f.mu.Unlock()
	f.calls = append(f.calls, notifyCall{TenantID: tenantID, UserID: userID, Type: n.Type, Title: n.Title})
	return nil
}

func (f *fakeNotifier) byType(typ string) []notifyCall {
	f.mu.Lock()
	defer f.mu.Unlock()
	var out []notifyCall
	for _, c := range f.calls {
		if c.Type == typ {
			out = append(out, c)
		}
	}
	return out
}

func newServiceWithNotifier(f *fakeStore, n leaverequest.Notifier) *leaverequest.Service {
	svc := leaverequest.NewService(f, f, nil)
	svc.SetNotifier(n)
	return svc
}

// ---------- Trigger: Create → 결재자 알림 ----------

func TestService_Create_TriggersNotifierToApprover(t *testing.T) {
	f := newFakeStore()
	seedBasicCase(f, 120)
	notifier := &fakeNotifier{}
	svc := newServiceWithNotifier(f, notifier)

	_, err := svc.Create(t.Context(), leaverequest.CreateInput{
		TenantID:    tenantID,
		RequesterID: requesterID,
		LeaveTypeID: leaveTypeID,
		StartAt:     kstAt(t, "2026-06-01 09:00"),
		EndAt:       kstAt(t, "2026-06-01 18:00"),
		Hours:       8,
	})
	if err != nil {
		t.Fatalf("create err=%v", err)
	}

	calls := notifier.byType("leave_request_submitted")
	if len(calls) != 1 {
		t.Fatalf("submitted calls=%d want 1", len(calls))
	}
	if calls[0].UserID != managerID {
		t.Errorf("notified userId=%d want manager=%d", calls[0].UserID, managerID)
	}
	if calls[0].TenantID != tenantID {
		t.Errorf("tenantId=%d", calls[0].TenantID)
	}
}

// ---------- Trigger: Approve → 신청자 알림 ----------

func TestService_Approve_TriggersNotifierToRequester(t *testing.T) {
	f := newFakeStore()
	seedBasicCase(f, 120)
	// 기존 pending 신청 seed.
	f.requests[1] = dbq.LeaveRequest{
		ID: 1, TenantID: tenantID, RequesterID: requesterID, LeaveTypeID: leaveTypeID,
		StartAt: pgTimestamptz(kstAt(t, "2026-06-01 09:00")),
		EndAt:   pgTimestamptz(kstAt(t, "2026-06-01 18:00")),
		Hours:   numericFromFloat(8),
		Status:  dbq.LeaveRequestStatusPending,
		ApproverID: pgtype.Int8{Int64: managerID, Valid: true},
	}
	f.nextReq = 1

	notifier := &fakeNotifier{}
	svc := newServiceWithNotifier(f, notifier)

	_, err := svc.Approve(t.Context(), 1, managerID, tenantID, "ok")
	if err != nil {
		t.Fatalf("approve err=%v", err)
	}

	calls := notifier.byType("leave_request_approved")
	if len(calls) != 1 {
		t.Fatalf("approved calls=%d want 1", len(calls))
	}
	if calls[0].UserID != requesterID {
		t.Errorf("notified userId=%d want requester=%d", calls[0].UserID, requesterID)
	}
}

// ---------- Trigger: Reject → 신청자 알림 ----------

func TestService_Reject_TriggersNotifierToRequester(t *testing.T) {
	f := newFakeStore()
	seedBasicCase(f, 120)
	f.requests[1] = dbq.LeaveRequest{
		ID: 1, TenantID: tenantID, RequesterID: requesterID, LeaveTypeID: leaveTypeID,
		StartAt: pgTimestamptz(kstAt(t, "2026-06-01 09:00")),
		EndAt:   pgTimestamptz(kstAt(t, "2026-06-01 18:00")),
		Hours:   numericFromFloat(8),
		Status:  dbq.LeaveRequestStatusPending,
		ApproverID: pgtype.Int8{Int64: managerID, Valid: true},
	}
	f.nextReq = 1

	notifier := &fakeNotifier{}
	svc := newServiceWithNotifier(f, notifier)

	_, err := svc.Reject(t.Context(), 1, managerID, tenantID, "사유 부족")
	if err != nil {
		t.Fatalf("reject err=%v", err)
	}

	calls := notifier.byType("leave_request_rejected")
	if len(calls) != 1 {
		t.Fatalf("rejected calls=%d want 1", len(calls))
	}
	if calls[0].UserID != requesterID {
		t.Errorf("notified userId=%d want requester=%d", calls[0].UserID, requesterID)
	}
}

// ---------- Trigger: Cancel → 알림 없음 (본인 액션, P1 미정의) ----------

func TestService_Cancel_NoNotifierCall(t *testing.T) {
	f := newFakeStore()
	seedBasicCase(f, 120)
	f.requests[1] = dbq.LeaveRequest{
		ID: 1, TenantID: tenantID, RequesterID: requesterID, LeaveTypeID: leaveTypeID,
		StartAt: pgTimestamptz(kstAt(t, "2026-06-01 09:00")),
		EndAt:   pgTimestamptz(kstAt(t, "2026-06-01 18:00")),
		Hours:   numericFromFloat(8),
		Status:  dbq.LeaveRequestStatusPending,
		ApproverID: pgtype.Int8{Int64: managerID, Valid: true},
	}
	f.nextReq = 1

	notifier := &fakeNotifier{}
	svc := newServiceWithNotifier(f, notifier)

	_, err := svc.Cancel(t.Context(), 1, requesterID, tenantID)
	if err != nil {
		t.Fatalf("cancel err=%v", err)
	}
	if len(notifier.calls) != 0 {
		t.Errorf("expected no notifier calls on cancel, got=%d", len(notifier.calls))
	}
}
