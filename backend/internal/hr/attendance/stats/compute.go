// Package stats — Sprint 5 출퇴근 통계 lazy compute.
//
// 본 패키지는 attendance_records 위에서 일/주/월 단위 근무시간 + 출근율을
// **쿼리 시점에 계산** (lazy compute). DB 컬럼으로 비정규화하지 않는다 (plan.md
// §아키텍처 결정 — 근무시간 계산 (lazy)).
//
// 권한 강제는 [scope.Scope] 를 통해 Repository layer 에서 적용한다 — 본 패키지의
// Store interface 는 모든 조회 메서드에서 Scope 를 입력으로 받는다.
//
// 휴가 보정 ([LeaveAdjustment]) 은 Sprint 5 에선 [NoopLeaveAdjustmentFetcher] 로
// 빈 결과를 반환하고, Sprint 6 에서 LeaveRequest 실제 쿼리하는 구현으로 swap 한다.
package stats

import (
	"errors"
	"time"

	"github.com/sjseo/docflow/backend/internal/hr/leave"
)

// Record — DB / pgtype 의존을 제거한 attendance_records row 표현. service 가 dbq → Record 변환.
type Record struct {
	ID                int64
	UserID            int64
	WorkDate          time.Time
	CheckIn           *time.Time
	CheckOut          *time.Time
	LunchBreakMinutes int
	Status            string
}

// UserSchedule — user.work_start_time / work_end_time 의 분 단위 표현.
type UserSchedule struct {
	WorkStartMinutes int // 예: 09:00 → 540
	WorkEndMinutes   int // 예: 18:00 → 1080
}

// LeaveAdjustment — 특정 (user, date) 에 사용된 휴가 시간 (시간 단위).
type LeaveAdjustment struct {
	UserID    int64
	Date      time.Time
	Hours     float64
	LeaveType string // 'annual' | 'half_day' | 'public' | ...
}

// RecordStats — 단일 record 의 계산 결과 (lazy).
type RecordStats struct {
	Date                    time.Time
	Status                  string
	CheckIn                 *time.Time
	CheckOut                *time.Time
	LunchBreakMinutes       int
	ExpectedMinutes         int  // user.work_end - user.work_start - lunch
	ActualWorkMinutes       int  // (check_out - check_in) - lunch
	LeaveAdjustmentHours    float64
	AdjustedExpectedMinutes int // max(0, expected - leave*60)
	OvertimeMinutes         int // max(0, actual - adjusted_expected)
}

// ComputeRecord — plan.md §아키텍처 결정 lazy 계산 공식.
//
//	user_expected = (user.work_end - user.work_start) - lunch_break_minutes
//	actual_work_minutes = (check_out - check_in) - lunch_break_minutes  (퇴근 없으면 0)
//	adjusted_expected = max(0, user_expected - leave_adjustment_hours * 60)
//	overtime_minutes = max(0, actual_work_minutes - adjusted_expected)
//
// 음수 결과는 0 으로 clamp (점심시간 > 실 근무 시간 같은 비정상 데이터 보호).
func ComputeRecord(r Record, u UserSchedule, leaveAdj LeaveAdjustment) RecordStats {
	expected := u.WorkEndMinutes - u.WorkStartMinutes - r.LunchBreakMinutes
	if expected < 0 {
		expected = 0
	}

	actual := 0
	if r.CheckIn != nil && r.CheckOut != nil {
		actual = int(r.CheckOut.Sub(*r.CheckIn).Minutes()) - r.LunchBreakMinutes
		if actual < 0 {
			actual = 0
		}
	}

	leaveMinutes := int(leaveAdj.Hours * 60)
	adjusted := expected - leaveMinutes
	if adjusted < 0 {
		adjusted = 0
	}

	overtime := actual - adjusted
	if overtime < 0 {
		overtime = 0
	}

	return RecordStats{
		Date:                    r.WorkDate,
		Status:                  r.Status,
		CheckIn:                 r.CheckIn,
		CheckOut:                r.CheckOut,
		LunchBreakMinutes:       r.LunchBreakMinutes,
		ExpectedMinutes:         expected,
		ActualWorkMinutes:       actual,
		LeaveAdjustmentHours:    leaveAdj.Hours,
		AdjustedExpectedMinutes: adjusted,
		OvertimeMinutes:         overtime,
	}
}

// AggregateInput — AggregatePeriod 에 주입할 외부 컨텍스트 (record 만으로 계산 불가한 값).
type AggregateInput struct {
	BusinessDays int // CountBusinessDays 결과.
}

// PeriodStats — 기간 단위 집계 결과.
type PeriodStats struct {
	From                 time.Time
	To                   time.Time
	TotalActualMinutes   int
	TotalOvertimeMinutes int
	TotalExpectedMinutes int
	DaysPresent          int // 모든 status 의 record 카운트 (auto_closed 포함).
	DaysLate             int
	DaysEarlyLeave       int
	DaysAutoClosed       int
	DaysAbsent           int
	BusinessDays         int
	AttendanceRate       float64
}

// AggregatePeriod — records 합산. 호출자가 from/to 와 BusinessDays 를 별도 주입한다.
//
// DaysPresent 정의: AttendanceRecord 가 존재하는 모든 status (normal/late/early_leave/auto_closed).
// AttendanceRate 분모/분자 정의는 plan.md §출근율 80% 분모/분자 정의 참조.
func AggregatePeriod(records []RecordStats, in AggregateInput) PeriodStats {
	out := PeriodStats{BusinessDays: in.BusinessDays}
	for _, r := range records {
		out.TotalActualMinutes += r.ActualWorkMinutes
		out.TotalOvertimeMinutes += r.OvertimeMinutes
		out.TotalExpectedMinutes += r.AdjustedExpectedMinutes

		switch r.Status {
		case "late":
			out.DaysPresent++
			out.DaysLate++
		case "early_leave":
			out.DaysPresent++
			out.DaysEarlyLeave++
		case "auto_closed":
			out.DaysPresent++
			out.DaysAutoClosed++
		case "absent":
			out.DaysAbsent++
		default: // "normal" 및 그 외 (방어적 — 새 status 추가 시 normal 로 카운트).
			out.DaysPresent++
		}
	}
	out.AttendanceRate = AttendanceRate(in.BusinessDays, out.DaysPresent, out.DaysAbsent)
	return out
}

// ErrInvalidPeriod — PeriodRange 에 day/week/month 외 값 전달 시.
var ErrInvalidPeriod = errors.New("stats: invalid period (want day|week|month)")

// PeriodRange — period + 기준 date → [from, to] (inclusive).
//
//   - day   : date 그 날.
//   - week  : ISO 주 (월요일~일요일) — Korea 관습.
//   - month : date 의 월 1일 ~ 말일.
//
// 요일/달 경계는 KST 기준으로 판정하지만 반환 값은 **UTC 자정** 으로 정규화하여
// PostgreSQL DATE 컬럼 (TZ 없음, pgtype.Date.Time = UTC midnight) 과 직접 비교 가능하게 한다.
func PeriodRange(period string, date time.Time) (time.Time, time.Time, error) {
	loc := leave.KSTLocation()
	kst := date.In(loc)
	dKST := time.Date(kst.Year(), kst.Month(), kst.Day(), 0, 0, 0, 0, loc)
	switch period {
	case "day":
		return toUTCDate(dKST), toUTCDate(dKST), nil
	case "week":
		// 월요일 = 1, 일요일 = 7 (월요일 시작 주, Korea 관습).
		weekday := int(dKST.Weekday())
		if weekday == 0 {
			weekday = 7
		}
		from := dKST.AddDate(0, 0, -(weekday - 1))
		to := from.AddDate(0, 0, 6)
		return toUTCDate(from), toUTCDate(to), nil
	case "month":
		from := time.Date(dKST.Year(), dKST.Month(), 1, 0, 0, 0, 0, loc)
		to := from.AddDate(0, 1, -1)
		return toUTCDate(from), toUTCDate(to), nil
	default:
		return time.Time{}, time.Time{}, ErrInvalidPeriod
	}
}

// toUTCDate — KST 기준 (또는 임의) 시각의 날짜 부분만 추출해 UTC 자정으로 정규화.
//
// DB DATE 컬럼 비교 호환성 + leakage 방지 (TZ 정보 들어가지 않게).
func toUTCDate(t time.Time) time.Time {
	return time.Date(t.Year(), t.Month(), t.Day(), 0, 0, 0, 0, time.UTC)
}
