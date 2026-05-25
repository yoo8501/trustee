package main

import "time"

// ExpectedEvent — DB 에 존재하는 event (홀리데이 또는 approved leave).
//
// Kind="holiday" 또는 Kind="leave". calendar API 응답에 반드시 포함되어야 한다.
// (Sprint 8 §TestService_List_NoMissingEvents 회귀에 해당.)
type ExpectedEvent struct {
	Kind  string // "holiday" | "leave"
	ID    int64
	Date  time.Time
	Label string // 디버깅용 (e.g. "신정", "alice@x.com 연차")
}

// ObservedEvent — calendar API 응답에서 추출한 event.
type ObservedEvent struct {
	Kind string
	ID   int64
}

// key — (kind, id) 튜플의 string key.
func key(kind string, id int64) string {
	return kind + ":" + itoa(id)
}

func itoa(n int64) string {
	if n == 0 {
		return "0"
	}
	neg := n < 0
	if neg {
		n = -n
	}
	var buf [20]byte
	i := len(buf)
	for n > 0 {
		i--
		buf[i] = byte('0' + n%10)
		n /= 10
	}
	if neg {
		i--
		buf[i] = '-'
	}
	return string(buf[i:])
}

// CompareEvents — expected 중 observed 에 없는 항목을 반환.
//
// (kind, id) 튜플 기준 일치. 같은 id 라도 kind 가 다르면 별개로 취급.
func CompareEvents(expected []ExpectedEvent, observed []ObservedEvent) []ExpectedEvent {
	seen := make(map[string]bool, len(observed))
	for _, o := range observed {
		seen[key(o.Kind, o.ID)] = true
	}
	var miss []ExpectedEvent
	for _, e := range expected {
		if !seen[key(e.Kind, e.ID)] {
			miss = append(miss, e)
		}
	}
	return miss
}

// UserCheckResult — 단일 user 의 calendar 검증 결과.
type UserCheckResult struct {
	UserID  int64
	Missing []ExpectedEvent
}

// SummaryStats — 전체 user 결과 요약.
type SummaryStats struct {
	UsersChecked  int
	UsersAffected int // Missing > 0 인 user 수
	TotalMissing  int
}

// AllPass — Missing 0 건이면 true.
func (s SummaryStats) AllPass() bool {
	return s.TotalMissing == 0
}

// Summarize — 다수 user 결과를 합산.
func Summarize(results []UserCheckResult) SummaryStats {
	s := SummaryStats{UsersChecked: len(results)}
	for _, r := range results {
		if len(r.Missing) > 0 {
			s.UsersAffected++
			s.TotalMissing += len(r.Missing)
		}
	}
	return s
}
