package stats_test

import (
	"testing"
	"time"

	"github.com/sjseo/docflow/backend/internal/hr/attendance/stats"
	"github.com/sjseo/docflow/backend/internal/hr/leave"
)

// kst — 테스트 헬퍼: KST 기준 시각 생성.
func kst(t *testing.T, ymdHM string) time.Time {
	t.Helper()
	parsed, err := time.ParseInLocation("2006-01-02 15:04", ymdHM, leave.KSTLocation())
	if err != nil {
		t.Fatal(err)
	}
	return parsed
}

// kstDate — KST 기준 날짜 (00:00).
func kstDate(t *testing.T, ymd string) time.Time {
	t.Helper()
	d, err := time.ParseInLocation("2006-01-02", ymd, leave.KSTLocation())
	if err != nil {
		t.Fatal(err)
	}
	return d
}

// 정시 9-18 근무 → user_expected=480, actual=480, overtime=0.
func TestComputeRecord_Normal_8h(t *testing.T) {
	in := kst(t, "2026-05-25 09:00")
	out := kst(t, "2026-05-25 18:00")
	rec := stats.Record{
		WorkDate:          kstDate(t, "2026-05-25"),
		CheckIn:           &in,
		CheckOut:          &out,
		LunchBreakMinutes: 60,
		Status:            "normal",
	}
	user := stats.UserSchedule{WorkStartMinutes: 9 * 60, WorkEndMinutes: 18 * 60}

	got := stats.ComputeRecord(rec, user, stats.LeaveAdjustment{})

	if got.ExpectedMinutes != 480 {
		t.Errorf("ExpectedMinutes=%d want 480", got.ExpectedMinutes)
	}
	if got.ActualWorkMinutes != 480 {
		t.Errorf("ActualWorkMinutes=%d want 480", got.ActualWorkMinutes)
	}
	if got.AdjustedExpectedMinutes != 480 {
		t.Errorf("AdjustedExpectedMinutes=%d want 480", got.AdjustedExpectedMinutes)
	}
	if got.OvertimeMinutes != 0 {
		t.Errorf("OvertimeMinutes=%d want 0", got.OvertimeMinutes)
	}
}

// 9-21 근무 (12h - 1h lunch = 11h actual) → expected 8h → overtime 3h.
func TestComputeRecord_Overtime_3h(t *testing.T) {
	in := kst(t, "2026-05-25 09:00")
	out := kst(t, "2026-05-25 21:00")
	rec := stats.Record{
		WorkDate:          kstDate(t, "2026-05-25"),
		CheckIn:           &in,
		CheckOut:          &out,
		LunchBreakMinutes: 60,
	}
	user := stats.UserSchedule{WorkStartMinutes: 9 * 60, WorkEndMinutes: 18 * 60}

	got := stats.ComputeRecord(rec, user, stats.LeaveAdjustment{})

	if got.ActualWorkMinutes != 11*60 {
		t.Errorf("actual=%d want 660", got.ActualWorkMinutes)
	}
	if got.OvertimeMinutes != 3*60 {
		t.Errorf("overtime=%d want 180", got.OvertimeMinutes)
	}
}

// 반차 (오전 4시간 휴가) + 오후 4시간 근무 → adjusted_expected=240, actual=240, overtime=0.
func TestComputeRecord_HalfDay_NoOvertime(t *testing.T) {
	in := kst(t, "2026-05-25 13:00")
	out := kst(t, "2026-05-25 18:00")
	rec := stats.Record{
		WorkDate:          kstDate(t, "2026-05-25"),
		CheckIn:           &in,
		CheckOut:          &out,
		LunchBreakMinutes: 60,
	}
	user := stats.UserSchedule{WorkStartMinutes: 9 * 60, WorkEndMinutes: 18 * 60}

	got := stats.ComputeRecord(rec, user, stats.LeaveAdjustment{Hours: 4})

	if got.AdjustedExpectedMinutes != 240 {
		t.Errorf("adjusted=%d want 240", got.AdjustedExpectedMinutes)
	}
	if got.ActualWorkMinutes != 240 {
		t.Errorf("actual=%d want 240 (5h - 1h lunch)", got.ActualWorkMinutes)
	}
	if got.OvertimeMinutes != 0 {
		t.Errorf("overtime=%d want 0", got.OvertimeMinutes)
	}
}

// leave_adjustment 가 user_expected 보다 크면 adjusted=0 (clamp).
func TestComputeRecord_LeaveExceedsExpected_ClampZero(t *testing.T) {
	in := kst(t, "2026-05-25 09:00")
	out := kst(t, "2026-05-25 09:30")
	rec := stats.Record{
		WorkDate: kstDate(t, "2026-05-25"), CheckIn: &in, CheckOut: &out, LunchBreakMinutes: 0,
	}
	user := stats.UserSchedule{WorkStartMinutes: 9 * 60, WorkEndMinutes: 18 * 60}

	got := stats.ComputeRecord(rec, user, stats.LeaveAdjustment{Hours: 100})
	if got.AdjustedExpectedMinutes != 0 {
		t.Errorf("adjusted=%d want 0 (clamp)", got.AdjustedExpectedMinutes)
	}
	if got.OvertimeMinutes != 30 {
		t.Errorf("overtime=%d want 30 (30m actual > 0 adjusted)", got.OvertimeMinutes)
	}
}

// 퇴근 안 한 record (check_out NULL) → actual=0, overtime=0.
func TestComputeRecord_NoCheckOut_ActualZero(t *testing.T) {
	in := kst(t, "2026-05-25 09:00")
	rec := stats.Record{
		WorkDate: kstDate(t, "2026-05-25"), CheckIn: &in, CheckOut: nil, LunchBreakMinutes: 60,
		Status: "auto_closed",
	}
	user := stats.UserSchedule{WorkStartMinutes: 9 * 60, WorkEndMinutes: 18 * 60}

	got := stats.ComputeRecord(rec, user, stats.LeaveAdjustment{})
	if got.ActualWorkMinutes != 0 {
		t.Errorf("actual=%d want 0 (no checkout)", got.ActualWorkMinutes)
	}
	if got.OvertimeMinutes != 0 {
		t.Errorf("overtime=%d want 0", got.OvertimeMinutes)
	}
}

// 점심시간이 actual 보다 크면 actual=0 (음수 방지).
func TestComputeRecord_ShortDay_LunchExceedsDuration(t *testing.T) {
	in := kst(t, "2026-05-25 09:00")
	out := kst(t, "2026-05-25 09:30")
	rec := stats.Record{
		WorkDate: kstDate(t, "2026-05-25"), CheckIn: &in, CheckOut: &out, LunchBreakMinutes: 60,
	}
	user := stats.UserSchedule{WorkStartMinutes: 9 * 60, WorkEndMinutes: 18 * 60}

	got := stats.ComputeRecord(rec, user, stats.LeaveAdjustment{})
	if got.ActualWorkMinutes != 0 {
		t.Errorf("actual=%d want 0 (clamp negative)", got.ActualWorkMinutes)
	}
}

// 회계 검증 (Critical Path): 임의 records 합계 = 개별 ComputeRecord 합계, diff 0.
// Property: AggregatePeriod(records).TotalActualMinutes = Σ ComputeRecord(r).ActualWorkMinutes.
func TestAggregatePeriod_AccountingInvariant_DiffZero(t *testing.T) {
	user := stats.UserSchedule{WorkStartMinutes: 9 * 60, WorkEndMinutes: 18 * 60}

	cases := [][2]string{
		{"2026-05-18 09:00", "2026-05-18 18:00"},
		{"2026-05-19 08:30", "2026-05-19 19:30"}, // 11h - 1h = 10h actual, 2h overtime
		{"2026-05-20 10:30", "2026-05-20 18:00"}, // late 7h30m - 1h = 6h30m
		{"2026-05-21 09:00", "2026-05-21 17:00"}, // early 8h - 1h = 7h
		{"2026-05-22 09:00", "2026-05-22 22:00"}, // 13h - 1h = 12h actual, 4h overtime
	}

	var records []stats.RecordStats
	var manualSum int
	var manualOvertimeSum int
	for _, c := range cases {
		in := kst(t, c[0])
		out := kst(t, c[1])
		date := kstDate(t, c[0][:10])
		rec := stats.Record{
			WorkDate: date, CheckIn: &in, CheckOut: &out,
			LunchBreakMinutes: 60, Status: "normal",
		}
		rs := stats.ComputeRecord(rec, user, stats.LeaveAdjustment{})
		records = append(records, rs)
		manualSum += rs.ActualWorkMinutes
		manualOvertimeSum += rs.OvertimeMinutes
	}

	period := stats.AggregatePeriod(records, stats.AggregateInput{
		BusinessDays: 5,
	})

	if period.TotalActualMinutes != manualSum {
		t.Fatalf("ACCOUNTING DIFF: total=%d sum=%d diff=%d",
			period.TotalActualMinutes, manualSum, period.TotalActualMinutes-manualSum)
	}
	if period.TotalOvertimeMinutes != manualOvertimeSum {
		t.Fatalf("OVERTIME DIFF: total=%d sum=%d", period.TotalOvertimeMinutes, manualOvertimeSum)
	}
}

// 상태 카운트: normal/late/early_leave/auto_closed/absent 5종.
func TestAggregatePeriod_StatusCounts(t *testing.T) {
	in := kst(t, "2026-05-25 09:00")
	out := kst(t, "2026-05-25 18:00")
	mk := func(status string) stats.RecordStats {
		return stats.ComputeRecord(stats.Record{
			WorkDate: kstDate(t, "2026-05-25"), CheckIn: &in, CheckOut: &out,
			LunchBreakMinutes: 60, Status: status,
		}, stats.UserSchedule{WorkStartMinutes: 540, WorkEndMinutes: 1080}, stats.LeaveAdjustment{})
	}
	recs := []stats.RecordStats{
		mk("normal"), mk("normal"),
		mk("late"),
		mk("early_leave"),
		mk("auto_closed"),
	}
	period := stats.AggregatePeriod(recs, stats.AggregateInput{BusinessDays: 5})
	if period.DaysPresent != 5 {
		t.Errorf("present=%d want 5 (모든 상태 카운트)", period.DaysPresent)
	}
	if period.DaysLate != 1 {
		t.Errorf("late=%d want 1", period.DaysLate)
	}
	if period.DaysEarlyLeave != 1 {
		t.Errorf("early=%d want 1", period.DaysEarlyLeave)
	}
	if period.DaysAutoClosed != 1 {
		t.Errorf("auto=%d want 1", period.DaysAutoClosed)
	}
}

// PeriodRange — period=day → from==to==date.
func TestPeriodRange_Day(t *testing.T) {
	date := kstDate(t, "2026-05-25")
	from, to, err := stats.PeriodRange("day", date)
	if err != nil {
		t.Fatal(err)
	}
	if from.Format("2006-01-02") != "2026-05-25" {
		t.Errorf("day from=%s want 2026-05-25", from.Format("2006-01-02"))
	}
	if to.Format("2006-01-02") != "2026-05-25" {
		t.Errorf("day to=%s want 2026-05-25", to.Format("2006-01-02"))
	}
}

// PeriodRange — period=week → 월요일~일요일 (ISO 기준).
func TestPeriodRange_Week_MondayToSunday(t *testing.T) {
	// 2026-05-25 (월요일) 기준.
	mon := kstDate(t, "2026-05-25")
	from, to, err := stats.PeriodRange("week", mon)
	if err != nil {
		t.Fatal(err)
	}
	if from.Format("2006-01-02") != "2026-05-25" {
		t.Errorf("week from=%s want 2026-05-25 (월)", from.Format("2006-01-02"))
	}
	if to.Format("2006-01-02") != "2026-05-31" {
		t.Errorf("week to=%s want 2026-05-31 (일)", to.Format("2006-01-02"))
	}

	// 수요일 입력해도 같은 주.
	wed := kstDate(t, "2026-05-27")
	from2, to2, _ := stats.PeriodRange("week", wed)
	if from2.Format("2006-01-02") != from.Format("2006-01-02") ||
		to2.Format("2006-01-02") != to.Format("2006-01-02") {
		t.Errorf("week from wed: %v ~ %v want %v ~ %v", from2, to2, from, to)
	}
}

// PeriodRange — period=month → 1일~말일.
func TestPeriodRange_Month(t *testing.T) {
	date := kstDate(t, "2026-05-25")
	from, to, err := stats.PeriodRange("month", date)
	if err != nil {
		t.Fatal(err)
	}
	if from.Format("2006-01-02") != "2026-05-01" {
		t.Errorf("month from=%s want 2026-05-01", from.Format("2006-01-02"))
	}
	if to.Format("2006-01-02") != "2026-05-31" {
		t.Errorf("month to=%s want 2026-05-31", to.Format("2006-01-02"))
	}
}

func TestPeriodRange_Invalid(t *testing.T) {
	_, _, err := stats.PeriodRange("year", kstDate(t, "2026-05-25"))
	if err == nil {
		t.Fatal("want err for invalid period")
	}
}
