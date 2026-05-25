package leave_test

import (
	"errors"
	"testing"
	"time"

	"github.com/sjseo/docflow/backend/internal/hr/leave"
)

// Validate 검증 — type 누락 / 잘못된 type / 음수 / annual_hire_anniversary 의 cap 비교.
func TestAccrualPolicy_Validate(t *testing.T) {
	cases := []struct {
		name    string
		policy  leave.AccrualPolicy
		wantErr bool
	}{
		{"empty type rejected", leave.AccrualPolicy{}, true},
		{"unknown type rejected", leave.AccrualPolicy{Type: "wat"}, true},
		{"fixed ok", leave.AccrualPolicy{Type: leave.PolicyTypeFixed}, false},
		{"carryover ok", leave.AccrualPolicy{Type: leave.PolicyTypeCarryoverOvertime}, false},
		{
			"annual ok",
			leave.AccrualPolicy{Type: leave.PolicyTypeAnnualHireAnniversary, BaseDays: 15, TenureBonusPer2Y: 1, TenureCapDays: 25},
			false,
		},
		{
			"annual base_days=0 rejected",
			leave.AccrualPolicy{Type: leave.PolicyTypeAnnualHireAnniversary, TenureCapDays: 25},
			true,
		},
		{
			"annual cap < base rejected",
			leave.AccrualPolicy{Type: leave.PolicyTypeAnnualHireAnniversary, BaseDays: 15, TenureCapDays: 10},
			true,
		},
		{"monthly ok", leave.AccrualPolicy{Type: leave.PolicyTypeMonthlyLtOneYear, BaseDays: 1}, false},
		{"monthly base_days=0 rejected", leave.AccrualPolicy{Type: leave.PolicyTypeMonthlyLtOneYear}, true},
		{
			"negative field rejected",
			leave.AccrualPolicy{Type: leave.PolicyTypeFixed, BaseDays: -1},
			true,
		},
	}
	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			err := tc.policy.Validate()
			if tc.wantErr && err == nil {
				t.Fatalf("want error, got nil")
			}
			if !tc.wantErr && err != nil {
				t.Fatalf("unexpected error: %v", err)
			}
			if tc.wantErr && err != nil && !errors.Is(err, leave.ErrInvalidAccrualPolicy) {
				t.Fatalf("want ErrInvalidAccrualPolicy, got %v", err)
			}
		})
	}
}

// 표준 연차 (annual) — hire_date 2024-01-15.
// 2025-01-15 anniversary 가 1주년 → 15일 = 120h.
// 2026-01-15 → 2주년 → 여전히 15일 (3년차부터 가산).
// 2026-05-25 → anniversary 가 아님 → 0.
func TestAccrualPolicy_GrantHours_Annual(t *testing.T) {
	pol := leave.AccrualPolicy{
		Type: leave.PolicyTypeAnnualHireAnniversary, BaseDays: 15,
		TenureBonusPer2Y: 1, TenureCapDays: 25,
	}
	hire := mustDate(t, "2024-01-15")

	cases := []struct {
		name string
		now  string
		want float64
	}{
		{"first anniversary (1y) = 15d", "2025-01-15", 15 * 8},
		{"second anniversary (2y) still 15d", "2026-01-15", 15 * 8},
		{"third anniversary (3y) = 16d", "2027-01-15", 16 * 8},
		{"fifth anniversary (5y) = 17d", "2029-01-15", 17 * 8},
		{"21st anniversary = 25d (cap)", "2045-01-15", 25 * 8},
		{"23rd anniversary still capped at 25d", "2047-01-15", 25 * 8},
		{"not anniversary date", "2026-05-25", 0},
		{"before 1y", "2024-12-31", 0},
	}
	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			got := pol.GrantHours(hire, mustDate(t, tc.now))
			if got != tc.want {
				t.Fatalf("GrantHours(%s) = %v, want %v", tc.now, got, tc.want)
			}
		})
	}
}

// 1년 미만 월차 — hire_date 2026-01-15.
// 2026-02-01 → 입사 후 1개월 안 됨 (1개월 = 2026-02-15) → 0.
// 2026-03-01 → 1개월 경과, 매월 1일 → 1일=8h.
// 2026-05-25 → 매월 1일 아님 → 0.
// 2027-01-15 → 1년 됨 → 0 (annual policy 의 영역).
// 2027-02-01 → 1년 초과 → 0.
func TestAccrualPolicy_GrantHours_Monthly(t *testing.T) {
	pol := leave.AccrualPolicy{Type: leave.PolicyTypeMonthlyLtOneYear, BaseDays: 1}
	hire := mustDate(t, "2026-01-15")

	cases := []struct {
		name string
		now  string
		want float64
	}{
		{"before 1 month elapsed", "2026-02-01", 0},
		{"first eligible month", "2026-03-01", 1 * 8},
		{"mid year ok", "2026-09-01", 1 * 8},
		{"not first of month", "2026-05-25", 0},
		{"first month after 1y boundary excluded", "2027-02-01", 0},
	}
	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			got := pol.GrantHours(hire, mustDate(t, tc.now))
			if got != tc.want {
				t.Fatalf("GrantHours(%s) = %v, want %v", tc.now, got, tc.want)
			}
		})
	}
}

// fixed / carryover — cron 적립 대상 아님 → 항상 0.
func TestAccrualPolicy_GrantHours_FixedAndCarryover(t *testing.T) {
	hire := mustDate(t, "2024-01-15")
	now := mustDate(t, "2026-01-15")
	for _, typ := range []leave.PolicyType{leave.PolicyTypeFixed, leave.PolicyTypeCarryoverOvertime} {
		t.Run(string(typ), func(t *testing.T) {
			pol := leave.AccrualPolicy{Type: typ}
			if got := pol.GrantHours(hire, now); got != 0 {
				t.Fatalf("want 0 grant, got %v", got)
			}
		})
	}
}

// 2/29 입사자 평년 anniversary → 2/28 도 anniversary 로 인정.
func TestAccrualPolicy_GrantHours_LeapDayAnniversary(t *testing.T) {
	pol := leave.AccrualPolicy{
		Type: leave.PolicyTypeAnnualHireAnniversary, BaseDays: 15,
		TenureBonusPer2Y: 1, TenureCapDays: 25,
	}
	hire := mustDate(t, "2024-02-29")
	got := pol.GrantHours(hire, mustDate(t, "2025-02-28"))
	if got != 15*8 {
		t.Fatalf("leap-day anniversary fallback = %v, want %v", got, 15*8)
	}
}

func TestParseAccrualPolicy_EmptyAndNull(t *testing.T) {
	for _, raw := range [][]byte{nil, []byte(""), []byte("null")} {
		p, err := leave.ParseAccrualPolicy(raw)
		if err != nil {
			t.Fatalf("ParseAccrualPolicy(%q) err=%v", raw, err)
		}
		if p.Type != leave.PolicyTypeFixed {
			t.Fatalf("want fixed fallback, got %q", p.Type)
		}
	}
}

func TestParseAccrualPolicy_BadJSON(t *testing.T) {
	if _, err := leave.ParseAccrualPolicy([]byte(`{not json`)); err == nil {
		t.Fatal("expected error")
	}
}

func TestRoundHours(t *testing.T) {
	cases := []struct{ in, want float64 }{
		{8.0, 8.0},
		{8.04, 8.0},
		{8.06, 8.1},
		{8.15, 8.2}, // banker's rounding 안 함 — math.Round 는 0.5 절상.
	}
	for _, c := range cases {
		if got := leave.RoundHours(c.in); got != c.want {
			t.Fatalf("RoundHours(%v)=%v want %v", c.in, got, c.want)
		}
	}
}

func TestParseAccrualPolicy_Roundtrip(t *testing.T) {
	in := leave.AccrualPolicy{
		Type: leave.PolicyTypeAnnualHireAnniversary, BaseDays: 15,
		TenureBonusPer2Y: 1, TenureCapDays: 25, ExpiresAfterMonths: 12,
	}
	raw, err := leave.MarshalAccrualPolicy(in)
	if err != nil {
		t.Fatal(err)
	}
	out, err := leave.ParseAccrualPolicy(raw)
	if err != nil {
		t.Fatal(err)
	}
	if out != in {
		t.Fatalf("roundtrip mismatch in=%+v out=%+v", in, out)
	}
}

func mustDate(t *testing.T, s string) time.Time {
	t.Helper()
	d, err := time.Parse("2006-01-02", s)
	if err != nil {
		t.Fatal(err)
	}
	return d
}
