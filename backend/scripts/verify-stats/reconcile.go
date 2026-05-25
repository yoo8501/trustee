package main

import "time"

// UserStats — ReconcileUser 입력.
//
// RawMinutes : attendance_records 직접 SUM (DB raw).
// ServiceMinutes : stats.Service 가 lazy compute 로 집계한 합계.
//
// 둘은 정확히 일치해야 한다 (회계 invariant — Sprint 5 TestAggregatePeriod_AccountingInvariant_DiffZero 회귀).
type UserStats struct {
	UserID         int64
	Period         string // "day" | "week" | "month"
	Date           time.Time
	RawMinutes     int
	ServiceMinutes int
}

// ReconcileResult — 단일 user 비교 결과.
type ReconcileResult struct {
	UserID     int64
	Period     string
	Date       time.Time
	Diff       int // |raw - svc|. 0 이면 일치.
	Mismatched bool
}

// ReconcileUser — raw vs service 차이를 계산.
//
// Diff 는 절대값. 1분 이상 차이나면 Mismatched=true.
// (lazy compute 가 분 단위 round 하므로 0 분 차이가 정상.)
func ReconcileUser(s UserStats) ReconcileResult {
	diff := s.RawMinutes - s.ServiceMinutes
	if diff < 0 {
		diff = -diff
	}
	return ReconcileResult{
		UserID:     s.UserID,
		Period:     s.Period,
		Date:       s.Date,
		Diff:       diff,
		Mismatched: diff > 0,
	}
}

// SummaryStats — 전체 reconcile 결과 요약.
type SummaryStats struct {
	UsersChecked  int
	MismatchCount int
	TotalDiff     int
}

// AllPass — Mismatch 0 건이면 true.
func (s SummaryStats) AllPass() bool {
	return s.MismatchCount == 0
}

// Summarize — 다수 user 결과를 합산.
func Summarize(results []ReconcileResult) SummaryStats {
	s := SummaryStats{UsersChecked: len(results)}
	for _, r := range results {
		if r.Mismatched {
			s.MismatchCount++
			s.TotalDiff += r.Diff
		}
	}
	return s
}
