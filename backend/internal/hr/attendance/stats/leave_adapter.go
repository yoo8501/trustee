package stats

import (
	"context"
	"time"
)

// LeaveAdjustmentFetcher — 특정 (userIDs, from, to) 범위의 휴가 보정 데이터 조회 interface.
//
// Sprint 5 출시 시점에는 LeaveRequest 도메인이 아직 머지되지 않았으므로 [NoopLeaveAdjustmentFetcher]
// 가 default. Sprint 6 에서 LeaveRequest 실제 쿼리하는 구현으로 swap (서비스 생성자에 주입).
//
// 반환되는 [LeaveAdjustment] 는 (UserID, Date) 단위 — 단일 휴가 일이 여러 시간으로
// 쪼개진 경우 (예: 반차 4h) 도 한 row 로 표현한다.
type LeaveAdjustmentFetcher interface {
	Fetch(ctx context.Context, userIDs []int64, from, to time.Time) ([]LeaveAdjustment, error)
}

// NoopLeaveAdjustmentFetcher — Sprint 5 default. 항상 빈 결과.
//
// LeaveRequest 가 머지된 후 (Sprint 6) `LeaveRequestFetcher` 같은 실제 구현으로 교체.
type NoopLeaveAdjustmentFetcher struct{}

// Fetch — 항상 nil 반환.
func (NoopLeaveAdjustmentFetcher) Fetch(_ context.Context, _ []int64, _, _ time.Time) ([]LeaveAdjustment, error) {
	return nil, nil
}

// lookupLeave — (userID, date) 에 매칭되는 LeaveAdjustment 합산 (시간 단위).
// 같은 날 여러 entry (예: 오전 반차 + 오후 공가) 가 있으면 시간 합.
func lookupLeave(adjustments []LeaveAdjustment, userID int64, date time.Time) LeaveAdjustment {
	dateStr := date.Format("2006-01-02")
	out := LeaveAdjustment{UserID: userID, Date: date}
	for _, a := range adjustments {
		if a.UserID != userID {
			continue
		}
		if a.Date.Format("2006-01-02") != dateStr {
			continue
		}
		out.Hours += a.Hours
		if out.LeaveType == "" {
			out.LeaveType = a.LeaveType
		}
	}
	return out
}
