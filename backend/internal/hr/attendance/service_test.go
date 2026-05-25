package attendance_test

import (
	"context"
	"errors"
	"testing"
	"time"

	dbq "github.com/sjseo/docflow/backend/internal/db/sqlc"
	"github.com/sjseo/docflow/backend/internal/hr/attendance"
	"github.com/sjseo/docflow/backend/internal/hr/leave"
)

// kstAt — KST 기준 시각 생성 helper.
func kstAt(t *testing.T, ymdHM string) time.Time {
	t.Helper()
	parsed, err := time.ParseInLocation("2006-01-02 15:04", ymdHM, leave.KSTLocation())
	if err != nil {
		t.Fatal(err)
	}
	return parsed
}

// testHarness — store/userStore 공유 + clock 가변.
type testHarness struct {
	store *fakeAttendanceStore
	users *fakeUserStore
	now   time.Time
}

func newHarness() *testHarness {
	return &testHarness{store: newFakeAttendanceStore(), users: newFakeUserStore()}
}

func (h *testHarness) svcAt(now time.Time) *attendance.Service {
	h.now = now
	return attendance.NewServiceWithClock(h.store, h.users, func() time.Time { return h.now })
}

// 신규 출근: status=normal, IP/UA 기록, work_date=KST today.
func TestService_CheckIn_New_Normal(t *testing.T) {
	h := newHarness()
	h.users.seed(dbq.User{ID: 7, WorkStartTime: workTime(9, 0), WorkEndTime: workTime(18, 0)})
	svc := h.svcAt(kstAt(t, "2026-05-25 08:50"))

	v, err := svc.CheckIn(context.Background(), attendance.CheckInInput{
		UserID: 7, TenantID: 1, ClientIP: "1.2.3.4", UserAgent: "ua/1",
	})
	if err != nil {
		t.Fatalf("err=%v", err)
	}
	if v.Status != string(dbq.AttendanceStatusNormal) {
		t.Fatalf("status=%s want normal", v.Status)
	}
	if v.ClientIP != "1.2.3.4" || v.UserAgent != "ua/1" {
		t.Fatalf("ip/ua not persisted: %+v", v)
	}
	if v.WorkDate.Format("2006-01-02") != "2026-05-25" {
		t.Fatalf("workDate=%s", v.WorkDate.Format("2006-01-02"))
	}
	if h.store.creates.Load() != 1 {
		t.Fatalf("creates=%d", h.store.creates.Load())
	}
}

// 같은 날 두 번째 출근: 첫 record 보존, create 호출 안 됨.
func TestService_CheckIn_Idempotent_PreservesFirst(t *testing.T) {
	h := newHarness()
	h.users.seed(dbq.User{ID: 7, WorkStartTime: workTime(9, 0), WorkEndTime: workTime(18, 0)})
	svc := h.svcAt(kstAt(t, "2026-05-25 08:50"))

	first, err := svc.CheckIn(context.Background(), attendance.CheckInInput{
		UserID: 7, TenantID: 1, ClientIP: "1.2.3.4", UserAgent: "ua/1",
	})
	if err != nil {
		t.Fatal(err)
	}

	// 두 번째 — 시간/IP/UA 다 다르지만 첫 row 그대로.
	h.now = kstAt(t, "2026-05-25 09:30")
	second, err := svc.CheckIn(context.Background(), attendance.CheckInInput{
		UserID: 7, TenantID: 1, ClientIP: "9.9.9.9", UserAgent: "ua/2",
	})
	if err != nil {
		t.Fatal(err)
	}

	if first.ID != second.ID {
		t.Fatalf("ID mismatch: %d vs %d", first.ID, second.ID)
	}
	if second.ClientIP != "1.2.3.4" || second.UserAgent != "ua/1" {
		t.Fatalf("first record overwritten: %+v", second)
	}
	if h.store.creates.Load() != 1 {
		t.Fatalf("creates=%d want 1 (idempotent)", h.store.creates.Load())
	}
}

// 정시 / 정확히 9시 / 1분 지각 — 상태 판정.
func TestService_CheckIn_LateDetection(t *testing.T) {
	for _, tc := range []struct {
		name       string
		now        string
		wantStatus dbq.AttendanceStatus
	}{
		{"on time (08:59)", "2026-05-25 08:59", dbq.AttendanceStatusNormal},
		{"exactly 09:00", "2026-05-25 09:00", dbq.AttendanceStatusNormal},
		{"late 09:01", "2026-05-25 09:01", dbq.AttendanceStatusLate},
	} {
		t.Run(tc.name, func(t *testing.T) {
			h := newHarness()
			h.users.seed(dbq.User{ID: 7, WorkStartTime: workTime(9, 0), WorkEndTime: workTime(18, 0)})
			svc := h.svcAt(kstAt(t, tc.now))
			v, err := svc.CheckIn(context.Background(), attendance.CheckInInput{UserID: 7, TenantID: 1})
			if err != nil {
				t.Fatal(err)
			}
			if v.Status != string(tc.wantStatus) {
				t.Fatalf("status=%s want %s", v.Status, tc.wantStatus)
			}
		})
	}
}

// 출근 → 정시 퇴근: status normal, check_out_at 채워짐.
func TestService_CheckOut_Normal(t *testing.T) {
	h := newHarness()
	h.users.seed(dbq.User{ID: 7, WorkStartTime: workTime(9, 0), WorkEndTime: workTime(18, 0)})
	svc := h.svcAt(kstAt(t, "2026-05-25 08:50"))
	if _, err := svc.CheckIn(context.Background(), attendance.CheckInInput{UserID: 7, TenantID: 1}); err != nil {
		t.Fatal(err)
	}

	h.now = kstAt(t, "2026-05-25 18:05")
	v, err := svc.CheckOut(context.Background(), attendance.CheckOutInput{UserID: 7, TenantID: 1})
	if err != nil {
		t.Fatal(err)
	}
	if v.Status != string(dbq.AttendanceStatusNormal) {
		t.Fatalf("status=%s want normal", v.Status)
	}
	if v.CheckOutAt == nil {
		t.Fatal("checkOutAt nil")
	}
}

// 출근 없이 퇴근: ErrCheckInRequired.
func TestService_CheckOut_WithoutCheckIn_ReturnsErr(t *testing.T) {
	h := newHarness()
	h.users.seed(dbq.User{ID: 7, WorkStartTime: workTime(9, 0), WorkEndTime: workTime(18, 0)})
	svc := h.svcAt(kstAt(t, "2026-05-25 18:00"))
	_, err := svc.CheckOut(context.Background(), attendance.CheckOutInput{UserID: 7, TenantID: 1})
	if !errors.Is(err, attendance.ErrCheckInRequired) {
		t.Fatalf("err=%v want ErrCheckInRequired", err)
	}
}

// 출근 후 17:00 퇴근 (work_end_time 18:00 보다 빠름) → early_leave.
func TestService_CheckOut_EarlyLeave(t *testing.T) {
	h := newHarness()
	h.users.seed(dbq.User{ID: 7, WorkStartTime: workTime(9, 0), WorkEndTime: workTime(18, 0)})
	svc := h.svcAt(kstAt(t, "2026-05-25 08:50"))
	if _, err := svc.CheckIn(context.Background(), attendance.CheckInInput{UserID: 7, TenantID: 1}); err != nil {
		t.Fatal(err)
	}
	h.now = kstAt(t, "2026-05-25 17:00")
	v, err := svc.CheckOut(context.Background(), attendance.CheckOutInput{UserID: 7, TenantID: 1})
	if err != nil {
		t.Fatal(err)
	}
	if v.Status != string(dbq.AttendanceStatusEarlyLeave) {
		t.Fatalf("status=%s want early_leave", v.Status)
	}
}

// 지각 출근 + 조기 퇴근 → late 우선.
func TestService_CheckOut_LateAndEarly_LatePriority(t *testing.T) {
	h := newHarness()
	h.users.seed(dbq.User{ID: 7, WorkStartTime: workTime(9, 0), WorkEndTime: workTime(18, 0)})
	svc := h.svcAt(kstAt(t, "2026-05-25 09:30"))
	if _, err := svc.CheckIn(context.Background(), attendance.CheckInInput{UserID: 7, TenantID: 1}); err != nil {
		t.Fatal(err)
	}
	h.now = kstAt(t, "2026-05-25 17:00")
	v, err := svc.CheckOut(context.Background(), attendance.CheckOutInput{UserID: 7, TenantID: 1})
	if err != nil {
		t.Fatal(err)
	}
	if v.Status != string(dbq.AttendanceStatusLate) {
		t.Fatalf("status=%s want late (priority)", v.Status)
	}
}

// 퇴근 두 번 호출: 두 번째가 마지막 시각으로 갱신, status 재판정.
func TestService_CheckOut_SecondClick_UpdatesTime(t *testing.T) {
	h := newHarness()
	h.users.seed(dbq.User{ID: 7, WorkStartTime: workTime(9, 0), WorkEndTime: workTime(18, 0)})
	svc := h.svcAt(kstAt(t, "2026-05-25 08:50"))
	if _, err := svc.CheckIn(context.Background(), attendance.CheckInInput{UserID: 7, TenantID: 1}); err != nil {
		t.Fatal(err)
	}

	// 첫 퇴근 17:00 (early).
	h.now = kstAt(t, "2026-05-25 17:00")
	v1, err := svc.CheckOut(context.Background(), attendance.CheckOutInput{UserID: 7, TenantID: 1})
	if err != nil {
		t.Fatal(err)
	}
	if v1.Status != string(dbq.AttendanceStatusEarlyLeave) {
		t.Fatalf("v1.status=%s want early_leave", v1.Status)
	}

	// 두 번째 퇴근 18:30 — 마지막 시각으로 갱신, status normal.
	h.now = kstAt(t, "2026-05-25 18:30")
	v2, err := svc.CheckOut(context.Background(), attendance.CheckOutInput{UserID: 7, TenantID: 1})
	if err != nil {
		t.Fatal(err)
	}
	if v2.Status != string(dbq.AttendanceStatusNormal) {
		t.Fatalf("v2.status=%s want normal (last click wins)", v2.Status)
	}
	if v2.CheckOutAt == nil || !v2.CheckOutAt.Equal(h.now) {
		t.Fatalf("checkOutAt not updated to last click: got %+v want %v", v2.CheckOutAt, h.now)
	}
}

// NewService — production 진입점이 컴파일/실행되는지 smoke.
func TestNewService_Smoke(t *testing.T) {
	if attendance.NewService(newFakeAttendanceStore(), newFakeUserStore()) == nil {
		t.Fatal("NewService returned nil")
	}
}

// 잘못된 IP 문자열은 nil 로 저장 (panic 없음, ClientIP 빈 값).
func TestService_CheckIn_InvalidIP_StoresEmpty(t *testing.T) {
	h := newHarness()
	h.users.seed(dbq.User{ID: 7, WorkStartTime: workTime(9, 0), WorkEndTime: workTime(18, 0)})
	svc := h.svcAt(kstAt(t, "2026-05-25 08:50"))
	v, err := svc.CheckIn(context.Background(), attendance.CheckInInput{
		UserID: 7, TenantID: 1, ClientIP: "not-an-ip", UserAgent: "ua/1",
	})
	if err != nil {
		t.Fatal(err)
	}
	if v.ClientIP != "" {
		t.Fatalf("ip=%s want empty (invalid IP filtered)", v.ClientIP)
	}
}
