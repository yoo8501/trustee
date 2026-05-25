// Package leave — 휴가 종류 (LeaveType) / 잔여 (LeaveBalance) 도메인.
//
// 본 파일은 accrual_policy JSON 스키마의 Go 표현 + 검증 + 적립 시간 계산을 담는다.
// JSON 스키마는 plan.md §데이터 모델 LeaveType 에 정의되어 있고,
// 실제 enum/필드 의미는 한국 근로기준법 (1년 미만 월 1일, 1년 이상 15일 + 근속 가산
// 최대 25일) 을 따른다.
package leave

import (
	"encoding/json"
	"errors"
	"fmt"
	"math"
	"time"
)

// PolicyType — accrual_policy.type enum.
type PolicyType string

const (
	// PolicyTypeAnnualHireAnniversary — 1년 이상 직원: 입사 anniversary 마다 base + tenure bonus 적립.
	PolicyTypeAnnualHireAnniversary PolicyType = "annual_hire_anniversary"
	// PolicyTypeMonthlyLtOneYear — 1년 미만 직원: 매월 1일 base_days(=1일) 적립.
	PolicyTypeMonthlyLtOneYear PolicyType = "monthly_lt_one_year"
	// PolicyTypeFixed — 자동 적립 없음 (반차/공가/특별휴가 등 — HR 수동 부여 또는 사용 시 차감만).
	PolicyTypeFixed PolicyType = "fixed"
	// PolicyTypeCarryoverOvertime — 보상휴가 (overtime → leave). cron 변환은 P2.
	PolicyTypeCarryoverOvertime PolicyType = "carryover_from_overtime"
)

// AccrualPolicy — leave_types.accrual_policy 컬럼 (JSONB) 매핑.
//
// 각 필드의 의미:
//
//	BaseDays           — 1회 적립 일수 (annual: 15, monthly_lt_one_year: 1).
//	TenureBonusPer2Y   — 근속 2년당 가산 일수 (보통 1).
//	TenureCapDays      — 가산 포함 최대 일수 (보통 25).
//	ExpiresAfterMonths — 적립 후 만료까지 개월 수. 0 이면 만료 없음.
//	CarryoverMaxDays   — 다음 해로 이월 가능 일수 (P2 cron 에서 사용).
type AccrualPolicy struct {
	Type               PolicyType `json:"type"`
	BaseDays           int        `json:"base_days,omitempty"`
	TenureBonusPer2Y   int        `json:"tenure_bonus_per_2y,omitempty"`
	TenureCapDays      int        `json:"tenure_cap_days,omitempty"`
	ExpiresAfterMonths int        `json:"expires_after_months,omitempty"`
	CarryoverMaxDays   int        `json:"carryover_max_days,omitempty"`
}

// HoursPerDay — 1일 = 8 시간 (근로기준법 1일 8h).
// half_day / quarter_day 등 default_hours 가 다른 leave_type 은
// accrual cron 의 적립 대상이 아니므로 (PolicyTypeFixed) 본 상수만 충분.
const HoursPerDay = 8.0

// ParseAccrualPolicy — JSONB bytes 를 AccrualPolicy 로 디코드.
// 빈 bytes / null 은 fixed policy 로 안전하게 fallback.
func ParseAccrualPolicy(raw []byte) (AccrualPolicy, error) {
	if len(raw) == 0 || string(raw) == "null" {
		return AccrualPolicy{Type: PolicyTypeFixed}, nil
	}
	var p AccrualPolicy
	if err := json.Unmarshal(raw, &p); err != nil {
		return AccrualPolicy{}, fmt.Errorf("accrual_policy: invalid JSON: %w", err)
	}
	return p, nil
}

// MarshalAccrualPolicy — AccrualPolicy 를 JSONB bytes 로 직렬화 (DB 저장용).
func MarshalAccrualPolicy(p AccrualPolicy) ([]byte, error) {
	return json.Marshal(p)
}

// ErrInvalidAccrualPolicy — Validate 실패 시 반환되는 sentinel error.
var ErrInvalidAccrualPolicy = errors.New("accrual_policy: invalid")

// Validate — 스키마 적합성 검증.
//
//   - Type 누락 / unknown enum 거부.
//   - annual_hire_anniversary: BaseDays > 0, TenureCapDays >= BaseDays 필요.
//   - monthly_lt_one_year: BaseDays > 0 (보통 1).
//   - 음수 필드 거부.
func (p AccrualPolicy) Validate() error {
	switch p.Type {
	case "":
		return fmt.Errorf("%w: type required", ErrInvalidAccrualPolicy)
	case PolicyTypeAnnualHireAnniversary,
		PolicyTypeMonthlyLtOneYear,
		PolicyTypeFixed,
		PolicyTypeCarryoverOvertime:
		// ok
	default:
		return fmt.Errorf("%w: unknown type %q", ErrInvalidAccrualPolicy, p.Type)
	}

	if p.BaseDays < 0 || p.TenureBonusPer2Y < 0 || p.TenureCapDays < 0 ||
		p.ExpiresAfterMonths < 0 || p.CarryoverMaxDays < 0 {
		return fmt.Errorf("%w: negative field", ErrInvalidAccrualPolicy)
	}

	switch p.Type {
	case PolicyTypeAnnualHireAnniversary:
		if p.BaseDays <= 0 {
			return fmt.Errorf("%w: base_days required for annual_hire_anniversary", ErrInvalidAccrualPolicy)
		}
		if p.TenureCapDays > 0 && p.TenureCapDays < p.BaseDays {
			return fmt.Errorf("%w: tenure_cap_days < base_days", ErrInvalidAccrualPolicy)
		}
	case PolicyTypeMonthlyLtOneYear:
		if p.BaseDays <= 0 {
			return fmt.Errorf("%w: base_days required for monthly_lt_one_year", ErrInvalidAccrualPolicy)
		}
	}
	return nil
}

// GrantHours — 이번 cron tick 에서 적립해야 할 시간을 계산한다.
//
// 반환값이 0 이면 "이번 호출에선 적립 없음" 의미. cron 은 0 이 아닐 때만 UPSERT.
//
// 규칙:
//
//   - PolicyTypeFixed / PolicyTypeCarryoverOvertime — 항상 0 (cron 적립 대상 아님).
//   - PolicyTypeMonthlyLtOneYear — now.Day()==1 이고 (hireDate ≤ now − 1month) AND
//     (hireDate > now − 1year) 일 때만 BaseDays*HoursPerDay 적립.
//   - PolicyTypeAnnualHireAnniversary — now 의 month/day 가 hireDate 의 month/day 와 일치하고
//     근속 ≥ 1년일 때, BaseDays + tenureBonus(근속, 2년당 BonusPer2Y, cap 적용) 적립.
//     - 2/29 입사자가 평년 anniversary 를 만나지 못하는 케이스는 2/28 로 보정.
func (p AccrualPolicy) GrantHours(hireDate, now time.Time) float64 {
	hireDate = atMidnight(hireDate)
	now = atMidnight(now)

	switch p.Type {
	case PolicyTypeMonthlyLtOneYear:
		// 입사 후 1개월 경과 + 입사 1년 미만 + 매월 1일.
		if now.Day() != 1 {
			return 0
		}
		oneMonthAfterHire := hireDate.AddDate(0, 1, 0)
		oneYearAfterHire := hireDate.AddDate(1, 0, 0)
		if now.Before(oneMonthAfterHire) {
			return 0
		}
		if !now.Before(oneYearAfterHire) {
			return 0
		}
		return float64(p.BaseDays) * HoursPerDay

	case PolicyTypeAnnualHireAnniversary:
		// 근속 1년 이상 + anniversary 일자 일치.
		// (anniversary 검사 안에서 2/29 입사자 평년 2/28 보정.)
		if !isAnniversary(hireDate, now) {
			return 0
		}
		tenureYears := tenureYearsCompleted(hireDate, now)
		if tenureYears < 1 {
			return 0
		}
		days := tenureDays(p, tenureYears)
		return float64(days) * HoursPerDay

	case PolicyTypeFixed, PolicyTypeCarryoverOvertime:
		return 0
	}
	return 0
}

// tenureDays — 근속 N년 차의 적립 일수.
//
//	1년차 = base_days
//	2년차 = base_days
//	3년차 = base_days + bonus_per_2y
//	5년차 = base_days + 2*bonus
//	cap 까지만 증가.
//
// tenureYears 는 만 년수 (예: 입사 후 정확히 3년이면 3).
func tenureDays(p AccrualPolicy, tenureYears int) int {
	base := p.BaseDays
	if tenureYears <= 1 {
		return base
	}
	if p.TenureBonusPer2Y <= 0 {
		return base
	}
	// 3년차부터 +1, 5년차 +2, ... → (tenureYears - 1) / 2.
	bonus := ((tenureYears - 1) / 2) * p.TenureBonusPer2Y
	total := base + bonus
	if p.TenureCapDays > 0 && total > p.TenureCapDays {
		total = p.TenureCapDays
	}
	return total
}

// tenureYearsCompleted — hireDate 부터 now 까지 만 N년.
// (예: hireDate 2024-03-15, now 2026-03-15 → 2년)
//
// 2/29 입사자 평년 2/28 보정: 평년 2/28 은 anniversary 로 인정 (isAnniversary 참조)
// → 만 N년 카운트도 +1 하지 않으면 anniversary 인데 years=0 인 모순이 생긴다.
func tenureYearsCompleted(hireDate, now time.Time) int {
	years := now.Year() - hireDate.Year()
	leapFallback := hireDate.Month() == time.February && hireDate.Day() == 29 &&
		now.Month() == time.February && now.Day() == 28 && !isLeapYear(now.Year())
	if !leapFallback {
		if now.Month() < hireDate.Month() ||
			(now.Month() == hireDate.Month() && now.Day() < hireDate.Day()) {
			years--
		}
	}
	if years < 0 {
		years = 0
	}
	return years
}

// isAnniversary — now 가 hireDate 의 anniversary 일자인지.
// 2/29 입사자에 대해 평년 2/29 가 없는 경우 2/28 도 anniversary 로 인정.
func isAnniversary(hireDate, now time.Time) bool {
	if hireDate.Month() == now.Month() && hireDate.Day() == now.Day() {
		return true
	}
	// 2/29 입사자 평년 보정: hireDate=2/29 이고 now=2/28 이며 now 가 평년(2/29 없음).
	if hireDate.Month() == time.February && hireDate.Day() == 29 &&
		now.Month() == time.February && now.Day() == 28 &&
		!isLeapYear(now.Year()) {
		return true
	}
	return false
}

func isLeapYear(y int) bool {
	if y%400 == 0 {
		return true
	}
	if y%100 == 0 {
		return false
	}
	return y%4 == 0
}

func atMidnight(t time.Time) time.Time {
	return time.Date(t.Year(), t.Month(), t.Day(), 0, 0, 0, 0, t.Location())
}

// RoundHours — float 적립 시간을 NUMERIC(6,1) 에 맞게 0.1 단위로 반올림.
func RoundHours(v float64) float64 {
	return math.Round(v*10) / 10
}
