package main

import (
	"testing"
	"time"
)

func TestReconcileUser_NoDiff(t *testing.T) {
	// 단일 user — DB raw 합계 == service 집계 합계 → diff = 0.
	rawMinutes := 480 + 480 + 480 // 3 days of 8h
	svcMinutes := rawMinutes
	res := ReconcileUser(UserStats{
		UserID:        42,
		Period:        "week",
		Date:          time.Date(2026, 5, 25, 0, 0, 0, 0, time.UTC),
		RawMinutes:    rawMinutes,
		ServiceMinutes: svcMinutes,
	})
	if res.Diff != 0 {
		t.Errorf("expected diff=0, got %d", res.Diff)
	}
	if res.Mismatched {
		t.Errorf("expected not mismatched")
	}
}

func TestReconcileUser_WithDiff(t *testing.T) {
	res := ReconcileUser(UserStats{
		UserID:        42,
		Period:        "month",
		Date:          time.Date(2026, 5, 25, 0, 0, 0, 0, time.UTC),
		RawMinutes:    9600, // 20 days * 8h
		ServiceMinutes: 9540, // 1h missing
	})
	if res.Diff != 60 {
		t.Errorf("expected diff=60, got %d", res.Diff)
	}
	if !res.Mismatched {
		t.Errorf("expected mismatched=true")
	}
}

func TestReconcileUser_NegativeDiff(t *testing.T) {
	// service 가 raw 보다 큰 경우 — 절대값 사용.
	res := ReconcileUser(UserStats{
		UserID:        42,
		RawMinutes:    480,
		ServiceMinutes: 540,
	})
	if res.Diff != 60 {
		t.Errorf("expected diff=60 (abs), got %d", res.Diff)
	}
	if !res.Mismatched {
		t.Errorf("expected mismatched=true")
	}
}

func TestSummarize_AllPass(t *testing.T) {
	results := []ReconcileResult{
		{UserID: 1, Diff: 0, Mismatched: false},
		{UserID: 2, Diff: 0, Mismatched: false},
		{UserID: 3, Diff: 0, Mismatched: false},
	}
	s := Summarize(results)
	if s.MismatchCount != 0 {
		t.Errorf("MismatchCount = %d, want 0", s.MismatchCount)
	}
	if s.TotalDiff != 0 {
		t.Errorf("TotalDiff = %d, want 0", s.TotalDiff)
	}
	if !s.AllPass() {
		t.Errorf("AllPass should be true")
	}
}

func TestSummarize_HasMismatch(t *testing.T) {
	results := []ReconcileResult{
		{UserID: 1, Diff: 0, Mismatched: false},
		{UserID: 2, Diff: 30, Mismatched: true},
		{UserID: 3, Diff: 15, Mismatched: true},
	}
	s := Summarize(results)
	if s.MismatchCount != 2 {
		t.Errorf("MismatchCount = %d, want 2", s.MismatchCount)
	}
	if s.TotalDiff != 45 {
		t.Errorf("TotalDiff = %d, want 45", s.TotalDiff)
	}
	if s.AllPass() {
		t.Errorf("AllPass should be false")
	}
}
