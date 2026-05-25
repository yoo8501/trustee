package main

import (
	"testing"
	"time"
)

func TestCompareEvents_AllPresent(t *testing.T) {
	expected := []ExpectedEvent{
		{Kind: "holiday", ID: 1, Date: time.Date(2026, 1, 1, 0, 0, 0, 0, time.UTC)},
		{Kind: "leave", ID: 10, Date: time.Date(2026, 5, 25, 0, 0, 0, 0, time.UTC)},
	}
	observed := []ObservedEvent{
		{Kind: "holiday", ID: 1},
		{Kind: "leave", ID: 10},
	}
	miss := CompareEvents(expected, observed)
	if len(miss) != 0 {
		t.Errorf("expected 0 missing, got %d: %v", len(miss), miss)
	}
}

func TestCompareEvents_HolidayMissing(t *testing.T) {
	expected := []ExpectedEvent{
		{Kind: "holiday", ID: 1, Date: time.Date(2026, 1, 1, 0, 0, 0, 0, time.UTC), Label: "신정"},
		{Kind: "holiday", ID: 2, Date: time.Date(2026, 3, 1, 0, 0, 0, 0, time.UTC), Label: "삼일절"},
	}
	observed := []ObservedEvent{
		{Kind: "holiday", ID: 1},
	}
	miss := CompareEvents(expected, observed)
	if len(miss) != 1 {
		t.Fatalf("expected 1 missing, got %d", len(miss))
	}
	if miss[0].ID != 2 {
		t.Errorf("missing ID = %d, want 2", miss[0].ID)
	}
}

func TestCompareEvents_LeaveMissing(t *testing.T) {
	expected := []ExpectedEvent{
		{Kind: "leave", ID: 10, Date: time.Now()},
		{Kind: "leave", ID: 20, Date: time.Now()},
		{Kind: "leave", ID: 30, Date: time.Now()},
	}
	observed := []ObservedEvent{
		{Kind: "leave", ID: 10},
	}
	miss := CompareEvents(expected, observed)
	if len(miss) != 2 {
		t.Errorf("expected 2 missing, got %d", len(miss))
	}
}

func TestCompareEvents_KindMismatch(t *testing.T) {
	// 같은 ID 라도 kind 가 다르면 별개로 취급.
	expected := []ExpectedEvent{
		{Kind: "holiday", ID: 1},
	}
	observed := []ObservedEvent{
		{Kind: "leave", ID: 1},
	}
	miss := CompareEvents(expected, observed)
	if len(miss) != 1 {
		t.Errorf("expected 1 missing (holiday#1), got %d", len(miss))
	}
}

func TestSummarize_NoMissing(t *testing.T) {
	results := []UserCheckResult{
		{UserID: 1, Missing: nil},
		{UserID: 2, Missing: nil},
	}
	s := Summarize(results)
	if s.TotalMissing != 0 {
		t.Errorf("TotalMissing = %d, want 0", s.TotalMissing)
	}
	if !s.AllPass() {
		t.Errorf("AllPass should be true")
	}
}

func TestSummarize_HasMissing(t *testing.T) {
	results := []UserCheckResult{
		{UserID: 1, Missing: []ExpectedEvent{{Kind: "holiday", ID: 5}}},
		{UserID: 2, Missing: []ExpectedEvent{{Kind: "leave", ID: 10}, {Kind: "leave", ID: 11}}},
	}
	s := Summarize(results)
	if s.TotalMissing != 3 {
		t.Errorf("TotalMissing = %d, want 3", s.TotalMissing)
	}
	if s.UsersAffected != 2 {
		t.Errorf("UsersAffected = %d, want 2", s.UsersAffected)
	}
	if s.AllPass() {
		t.Errorf("AllPass should be false")
	}
}
