package stats_test

import (
	"testing"
	"time"

	"github.com/sjseo/docflow/backend/internal/hr/attendance/stats"
	"github.com/sjseo/docflow/backend/internal/hr/leave"
)

// 영업일 20, 결근 2 → 분모 18, 분자 18 → 100% (1.0).
func TestAttendanceRate_AllPresent(t *testing.T) {
	got := stats.AttendanceRate(20, 18, 2)
	if got != 1.0 {
		t.Errorf("rate=%f want 1.0", got)
	}
}

// 영업일 22, 결근 5, 출근 14 → 분모 17, 분자 14 → 14/17 ≈ 0.8235.
func TestAttendanceRate_BelowThreshold(t *testing.T) {
	got := stats.AttendanceRate(22, 14, 5)
	want := 14.0 / 17.0
	if abs(got-want) > 1e-9 {
		t.Errorf("rate=%f want %f", got, want)
	}
}

// 영업일 22, 결근 22 → 분모 0 → 별도 정의 (정책: 1.0).
func TestAttendanceRate_DenominatorZero_DefaultOne(t *testing.T) {
	got := stats.AttendanceRate(22, 0, 22)
	if got != 1.0 {
		t.Errorf("rate=%f want 1.0 (denom=0 fallback)", got)
	}
}

// 영업일 0 (전부 휴일/주말 가정) → 1.0.
func TestAttendanceRate_NoBusinessDays(t *testing.T) {
	got := stats.AttendanceRate(0, 0, 0)
	if got != 1.0 {
		t.Errorf("rate=%f want 1.0", got)
	}
}

// 출근일 > 분모 (정상적이지 않은 데이터) → 1.0 으로 clamp.
func TestAttendanceRate_PresentExceedsDenominator_ClampOne(t *testing.T) {
	got := stats.AttendanceRate(10, 20, 5)
	if got != 1.0 {
		t.Errorf("rate=%f want 1.0 (clamp)", got)
	}
}

// CountBusinessDays — 한 주 (월-일), 주말 제외 = 5.
func TestCountBusinessDays_OneWeek_NoHolidays(t *testing.T) {
	from := mustParse(t, "2026-05-25") // 월
	to := mustParse(t, "2026-05-31")   // 일
	got := stats.CountBusinessDays(from, to, nil)
	if got != 5 {
		t.Errorf("days=%d want 5 (mon-fri)", got)
	}
}

// CountBusinessDays — 한 주 + 공휴일 1일 → 4.
func TestCountBusinessDays_OneWeek_WithHoliday(t *testing.T) {
	from := mustParse(t, "2026-05-25") // 월
	to := mustParse(t, "2026-05-31")   // 일
	holiday := mustParse(t, "2026-05-27")
	got := stats.CountBusinessDays(from, to, []time.Time{holiday})
	if got != 4 {
		t.Errorf("days=%d want 4 (mon/tue/thu/fri)", got)
	}
}

// 공휴일이 주말과 겹치면 중복 차감하지 않음.
func TestCountBusinessDays_HolidayOnWeekend_NoDoubleCount(t *testing.T) {
	from := mustParse(t, "2026-05-25")
	to := mustParse(t, "2026-05-31")
	// 5/30 = 토요일.
	holiday := mustParse(t, "2026-05-30")
	got := stats.CountBusinessDays(from, to, []time.Time{holiday})
	if got != 5 {
		t.Errorf("days=%d want 5 (holiday on saturday → no extra deduction)", got)
	}
}

// from > to → 0.
func TestCountBusinessDays_Reversed(t *testing.T) {
	from := mustParse(t, "2026-05-31")
	to := mustParse(t, "2026-05-25")
	if got := stats.CountBusinessDays(from, to, nil); got != 0 {
		t.Errorf("days=%d want 0 (from>to)", got)
	}
}

// helpers

func abs(f float64) float64 {
	if f < 0 {
		return -f
	}
	return f
}

func mustParse(t *testing.T, ymd string) time.Time {
	t.Helper()
	v, err := time.ParseInLocation("2006-01-02", ymd, leave.KSTLocation())
	if err != nil {
		t.Fatal(err)
	}
	return v
}
