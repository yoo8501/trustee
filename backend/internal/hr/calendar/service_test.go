package calendar_test

import (
	"errors"
	"testing"
	"time"

	dbq "github.com/sjseo/docflow/backend/internal/db/sqlc"
	"github.com/sjseo/docflow/backend/internal/hr/calendar"
	"github.com/sjseo/docflow/backend/internal/permission"
)

const (
	tenantID    = int64(1)
	actorID     = int64(10)
	otherUserID = int64(20)
	approverID  = int64(30)
	hrUserID    = int64(40)
	leaveTypeID = int64(7)
)

func kstAt(t *testing.T, s string) time.Time {
	t.Helper()
	loc, _ := time.LoadLocation("Asia/Seoul")
	out, err := time.ParseInLocation("2006-01-02 15:04", s, loc)
	if err != nil {
		t.Fatalf("parse %s: %v", s, err)
	}
	return out
}

func kstDay(t *testing.T, s string) time.Time {
	t.Helper()
	loc, _ := time.LoadLocation("Asia/Seoul")
	out, err := time.ParseInLocation("2006-01-02", s, loc)
	if err != nil {
		t.Fatalf("parse %s: %v", s, err)
	}
	return out
}

func newSvc(f *fakeStore) *calendar.Service {
	return calendar.NewService(f)
}

// ---------- date range validation ----------

func TestService_List_DateRangeOverThreeMonths_Rejected(t *testing.T) {
	f := newFakeStore()
	svc := newSvc(f)

	_, err := svc.List(t.Context(), calendar.ListInput{
		TenantID: tenantID,
		ActorID:  actorID,
		Role:     permission.RoleGeneral,
		From:     kstDay(t, "2026-01-01"),
		To:       kstDay(t, "2026-05-01"), // 4개월
		Scope:    "all",
	})
	if !errors.Is(err, calendar.ErrDateRangeTooLarge) {
		t.Fatalf("err=%v want ErrDateRangeTooLarge", err)
	}
}

func TestService_List_DateRangeInverted_Rejected(t *testing.T) {
	f := newFakeStore()
	svc := newSvc(f)

	_, err := svc.List(t.Context(), calendar.ListInput{
		TenantID: tenantID,
		ActorID:  actorID,
		Role:     permission.RoleGeneral,
		From:     kstDay(t, "2026-05-01"),
		To:       kstDay(t, "2026-01-01"),
		Scope:    "all",
	})
	if !errors.Is(err, calendar.ErrInvalidDateRange) {
		t.Fatalf("err=%v want ErrInvalidDateRange", err)
	}
}

func TestService_List_DateRangeExactly90Days_OK(t *testing.T) {
	f := newFakeStore()
	svc := newSvc(f)

	_, err := svc.List(t.Context(), calendar.ListInput{
		TenantID: tenantID,
		ActorID:  actorID,
		Role:     permission.RoleGeneral,
		From:     kstDay(t, "2026-01-01"),
		To:       kstDay(t, "2026-03-31"), // 89일.
		Scope:    "all",
	})
	if err != nil {
		t.Fatalf("err=%v want nil", err)
	}
}

// ---------- 가시성: reason 마스킹 ----------

func TestService_List_Reason_VisibleToRequester(t *testing.T) {
	f := newFakeStore()
	f.addLeave(dbq.ListCalendarLeavesRow{
		ID:            1,
		TenantID:      tenantID,
		RequesterID:   actorID, // 본인.
		LeaveTypeID:   leaveTypeID,
		StartAt:       pgTS(kstAt(t, "2026-06-01 09:00")),
		EndAt:         pgTS(kstAt(t, "2026-06-01 18:00")),
		Hours:         numericFromFloat(8),
		Reason:        pgText("개인 사유"),
		Status:        dbq.LeaveRequestStatusApproved,
		ApproverID:    pgInt8(approverID),
		RequesterName: "본인",
		LeaveTypeCode: "annual",
		LeaveTypeName: "연차",
	})
	svc := newSvc(f)

	out, err := svc.List(t.Context(), calendar.ListInput{
		TenantID: tenantID,
		ActorID:  actorID, // 본인.
		Role:     permission.RoleGeneral,
		From:     kstDay(t, "2026-05-25"),
		To:       kstDay(t, "2026-06-30"),
		Scope:    "all",
	})
	if err != nil {
		t.Fatalf("err=%v", err)
	}
	if len(out.Leaves) != 1 {
		t.Fatalf("leaves=%d want 1", len(out.Leaves))
	}
	if out.Leaves[0].Reason == nil || *out.Leaves[0].Reason != "개인 사유" {
		t.Errorf("requester reason=%v want '개인 사유'", out.Leaves[0].Reason)
	}
}

func TestService_List_Reason_VisibleToApprover(t *testing.T) {
	f := newFakeStore()
	f.addLeave(dbq.ListCalendarLeavesRow{
		ID:            1,
		TenantID:      tenantID,
		RequesterID:   otherUserID,
		LeaveTypeID:   leaveTypeID,
		StartAt:       pgTS(kstAt(t, "2026-06-01 09:00")),
		EndAt:         pgTS(kstAt(t, "2026-06-01 18:00")),
		Hours:         numericFromFloat(8),
		Reason:        pgText("개인 사유"),
		Status:        dbq.LeaveRequestStatusPending,
		ApproverID:    pgInt8(actorID), // actor 가 결재자.
		RequesterName: "타인",
		LeaveTypeCode: "annual",
		LeaveTypeName: "연차",
	})
	svc := newSvc(f)

	out, _ := svc.List(t.Context(), calendar.ListInput{
		TenantID: tenantID,
		ActorID:  actorID,
		Role:     permission.RoleTeamLead,
		From:     kstDay(t, "2026-05-25"),
		To:       kstDay(t, "2026-06-30"),
		Scope:    "all",
	})
	if len(out.Leaves) != 1 {
		t.Fatalf("leaves=%d", len(out.Leaves))
	}
	if out.Leaves[0].Reason == nil || *out.Leaves[0].Reason != "개인 사유" {
		t.Errorf("approver reason=%v want '개인 사유'", out.Leaves[0].Reason)
	}
}

func TestService_List_Reason_MaskedForUnauthorized(t *testing.T) {
	f := newFakeStore()
	f.addLeave(dbq.ListCalendarLeavesRow{
		ID:            1,
		TenantID:      tenantID,
		RequesterID:   otherUserID,
		LeaveTypeID:   leaveTypeID,
		StartAt:       pgTS(kstAt(t, "2026-06-01 09:00")),
		EndAt:         pgTS(kstAt(t, "2026-06-01 18:00")),
		Hours:         numericFromFloat(8),
		Reason:        pgText("개인 사유"),
		Status:        dbq.LeaveRequestStatusApproved,
		ApproverID:    pgInt8(approverID), // actor 와 무관.
		RequesterName: "타인",
		LeaveTypeCode: "annual",
		LeaveTypeName: "연차",
	})
	svc := newSvc(f)

	out, _ := svc.List(t.Context(), calendar.ListInput{
		TenantID: tenantID,
		ActorID:  actorID, // 본인도 결재자도 아님.
		Role:     permission.RoleGeneral,
		From:     kstDay(t, "2026-05-25"),
		To:       kstDay(t, "2026-06-30"),
		Scope:    "all",
	})
	if len(out.Leaves) != 1 {
		t.Fatalf("leaves=%d", len(out.Leaves))
	}
	// 날짜 + 종류는 노출.
	if out.Leaves[0].LeaveTypeCode != "annual" {
		t.Errorf("type code missing")
	}
	if out.Leaves[0].RequesterID != otherUserID {
		t.Errorf("requesterId missing")
	}
	// 사유는 마스킹.
	if out.Leaves[0].Reason != nil {
		t.Errorf("reason should be masked, got=%v", *out.Leaves[0].Reason)
	}
}

func TestService_List_Reason_VisibleToHR(t *testing.T) {
	f := newFakeStore()
	f.addLeave(dbq.ListCalendarLeavesRow{
		ID:            1,
		TenantID:      tenantID,
		RequesterID:   otherUserID,
		LeaveTypeID:   leaveTypeID,
		StartAt:       pgTS(kstAt(t, "2026-06-01 09:00")),
		EndAt:         pgTS(kstAt(t, "2026-06-01 18:00")),
		Hours:         numericFromFloat(8),
		Reason:        pgText("개인 사유"),
		Status:        dbq.LeaveRequestStatusApproved,
		ApproverID:    pgInt8(approverID),
		RequesterName: "타인",
		LeaveTypeCode: "annual",
		LeaveTypeName: "연차",
	})
	svc := newSvc(f)

	out, _ := svc.List(t.Context(), calendar.ListInput{
		TenantID: tenantID,
		ActorID:  hrUserID,
		Role:     permission.RoleHRManager,
		From:     kstDay(t, "2026-05-25"),
		To:       kstDay(t, "2026-06-30"),
		Scope:    "all",
	})
	if len(out.Leaves) != 1 || out.Leaves[0].Reason == nil || *out.Leaves[0].Reason != "개인 사유" {
		t.Errorf("HR should see reason, got=%+v", out.Leaves[0].Reason)
	}
}

// ---------- 가시성: attendances ----------

func TestService_List_Attendances_OnlyForMe(t *testing.T) {
	f := newFakeStore()
	f.addAttendance(dbq.ListCalendarAttendancesRow{
		ID:       100,
		TenantID: tenantID,
		UserID:   actorID,
		WorkDate: pgDate(kstDay(t, "2026-06-01")),
	})
	// 다른 유저 출퇴근 — 노출되면 안 됨.
	f.addAttendance(dbq.ListCalendarAttendancesRow{
		ID:       101,
		TenantID: tenantID,
		UserID:   otherUserID,
		WorkDate: pgDate(kstDay(t, "2026-06-01")),
	})
	svc := newSvc(f)

	out, _ := svc.List(t.Context(), calendar.ListInput{
		TenantID: tenantID,
		ActorID:  actorID,
		Role:     permission.RoleGeneral,
		From:     kstDay(t, "2026-05-25"),
		To:       kstDay(t, "2026-06-30"),
		Scope:    "all",
	})
	if len(out.Attendances) != 1 {
		t.Fatalf("attendances=%d want 1 (mine only)", len(out.Attendances))
	}
	if out.Attendances[0].UserID != actorID {
		t.Errorf("attendance userId=%d want actor=%d", out.Attendances[0].UserID, actorID)
	}
}

// ---------- 캘린더 노출 누락 0건 (LeaveRequest approved + Holiday 모두 응답에 포함) ----------

func TestService_List_NoMissingEvents_LeavesAndHolidaysBothIncluded(t *testing.T) {
	f := newFakeStore()
	// approved 휴가.
	f.addLeave(dbq.ListCalendarLeavesRow{
		ID:            1,
		TenantID:      tenantID,
		RequesterID:   otherUserID,
		LeaveTypeID:   leaveTypeID,
		StartAt:       pgTS(kstAt(t, "2026-06-01 09:00")),
		EndAt:         pgTS(kstAt(t, "2026-06-01 18:00")),
		Hours:         numericFromFloat(8),
		Status:        dbq.LeaveRequestStatusApproved,
		ApproverID:    pgInt8(approverID),
		RequesterName: "동료",
		LeaveTypeCode: "annual",
		LeaveTypeName: "연차",
	})
	// pending 휴가 (P1 캘린더는 pending 도 노출).
	f.addLeave(dbq.ListCalendarLeavesRow{
		ID:            2,
		TenantID:      tenantID,
		RequesterID:   actorID,
		LeaveTypeID:   leaveTypeID,
		StartAt:       pgTS(kstAt(t, "2026-06-15 09:00")),
		EndAt:         pgTS(kstAt(t, "2026-06-15 18:00")),
		Hours:         numericFromFloat(8),
		Status:        dbq.LeaveRequestStatusPending,
		ApproverID:    pgInt8(approverID),
		RequesterName: "본인",
		LeaveTypeCode: "annual",
		LeaveTypeName: "연차",
	})
	// 공휴일 (2개).
	f.addHoliday(dbq.Holiday{
		ID: 10, TenantID: tenantID, Date: pgDate(kstDay(t, "2026-06-06")),
		Name: "현충일", IsRecurring: true, CountryCode: "KR",
	})
	f.addHoliday(dbq.Holiday{
		ID: 11, TenantID: tenantID, Date: pgDate(kstDay(t, "2026-06-15")),
		Name: "회사 워크샵", IsRecurring: false, CountryCode: "KR",
	})
	// 본인 출퇴근.
	f.addAttendance(dbq.ListCalendarAttendancesRow{
		ID: 100, TenantID: tenantID, UserID: actorID, WorkDate: pgDate(kstDay(t, "2026-06-02")),
	})

	svc := newSvc(f)
	out, err := svc.List(t.Context(), calendar.ListInput{
		TenantID: tenantID,
		ActorID:  actorID,
		Role:     permission.RoleGeneral,
		From:     kstDay(t, "2026-05-25"),
		To:       kstDay(t, "2026-06-30"),
		Scope:    "all",
	})
	if err != nil {
		t.Fatalf("err=%v", err)
	}
	if len(out.Leaves) != 2 {
		t.Errorf("leaves=%d want 2 (approved + pending)", len(out.Leaves))
	}
	if len(out.Holidays) != 2 {
		t.Errorf("holidays=%d want 2", len(out.Holidays))
	}
	if len(out.Attendances) != 1 {
		t.Errorf("attendances=%d want 1", len(out.Attendances))
	}
}

// ---------- scope ----------

func TestService_List_ScopeMe_OnlyOwnLeaves(t *testing.T) {
	f := newFakeStore()
	f.addLeave(dbq.ListCalendarLeavesRow{
		ID: 1, TenantID: tenantID, RequesterID: actorID,
		LeaveTypeID:   leaveTypeID,
		StartAt:       pgTS(kstAt(t, "2026-06-01 09:00")),
		EndAt:         pgTS(kstAt(t, "2026-06-01 18:00")),
		Hours:         numericFromFloat(8),
		Status:        dbq.LeaveRequestStatusApproved,
		ApproverID:    pgInt8(approverID),
		LeaveTypeCode: "annual", LeaveTypeName: "연차",
	})
	f.addLeave(dbq.ListCalendarLeavesRow{
		ID: 2, TenantID: tenantID, RequesterID: otherUserID,
		LeaveTypeID:   leaveTypeID,
		StartAt:       pgTS(kstAt(t, "2026-06-02 09:00")),
		EndAt:         pgTS(kstAt(t, "2026-06-02 18:00")),
		Hours:         numericFromFloat(8),
		Status:        dbq.LeaveRequestStatusApproved,
		ApproverID:    pgInt8(approverID),
		LeaveTypeCode: "annual", LeaveTypeName: "연차",
	})
	svc := newSvc(f)
	out, _ := svc.List(t.Context(), calendar.ListInput{
		TenantID: tenantID, ActorID: actorID, Role: permission.RoleGeneral,
		From: kstDay(t, "2026-05-25"), To: kstDay(t, "2026-06-30"),
		Scope: "me",
	})
	if len(out.Leaves) != 1 || out.Leaves[0].RequesterID != actorID {
		t.Errorf("scope=me should only return own leaves, got=%+v", out.Leaves)
	}
}
