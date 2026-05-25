package stats

import "time"

// AttendanceRate — 출근율 (0.0 ~ 1.0).
//
// plan.md §출근율 80% 분모/분자 정의:
//   - 분모 = 영업일 (주말/공휴일 제외) − 결근일
//   - 분자 = 출근일 (정상/지각/조퇴 포함, 결근 제외; 병가/공가/특별휴가는 별도 처리)
//
// 분모 0 (전부 결근 또는 영업일 0) → 1.0 으로 정의 (UI 표시 정책 — 0/0 은
// "측정 불가" 가 아니라 "이슈 없음" 으로 노출).
// presentDays > 분모인 비정상 데이터 → 1.0 clamp.
func AttendanceRate(businessDays, presentDays, absentDays int) float64 {
	denom := businessDays - absentDays
	if denom <= 0 {
		return 1.0
	}
	rate := float64(presentDays) / float64(denom)
	if rate > 1.0 {
		return 1.0
	}
	if rate < 0 {
		return 0
	}
	return rate
}

// CountBusinessDays — [from, to] inclusive 범위 안의 영업일 수.
//
//   - 주말 (토/일) 제외.
//   - holidays 에 포함된 평일 추가 제외 (주말과 겹치면 중복 차감하지 않음).
//   - holidays 의 시각 부분은 무시 (Year-Month-Day 만 비교).
//   - from > to → 0.
func CountBusinessDays(from, to time.Time, holidays []time.Time) int {
	if from.After(to) {
		return 0
	}
	holSet := map[string]bool{}
	for _, h := range holidays {
		holSet[h.Format("2006-01-02")] = true
	}
	count := 0
	for d := from; !d.After(to); d = d.AddDate(0, 0, 1) {
		wd := d.Weekday()
		if wd == time.Saturday || wd == time.Sunday {
			continue
		}
		if holSet[d.Format("2006-01-02")] {
			continue
		}
		count++
	}
	return count
}
