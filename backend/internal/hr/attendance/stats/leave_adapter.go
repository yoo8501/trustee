package stats

import (
	"context"
	"time"

	"github.com/jackc/pgx/v5/pgtype"

	dbq "github.com/sjseo/docflow/backend/internal/db/sqlc"
)

// LeaveAdjustmentFetcher — 특정 (userIDs, from, to) 범위의 휴가 보정 데이터 조회 interface.
//
// Sprint 5 출시 시점에는 LeaveRequest 도메인이 아직 머지되지 않았으므로 [NoopLeaveAdjustmentFetcher]
// 가 default. Sprint 6 에서 [SQLLeaveAdjustmentFetcher] 로 swap (서비스 생성자에 주입).
//
// 반환되는 [LeaveAdjustment] 는 (UserID, Date) 단위 — 단일 휴가 일이 여러 시간으로
// 쪼개진 경우 (예: 반차 4h) 도 한 row 로 표현한다.
type LeaveAdjustmentFetcher interface {
	Fetch(ctx context.Context, userIDs []int64, from, to time.Time) ([]LeaveAdjustment, error)
}

// NoopLeaveAdjustmentFetcher — Sprint 5 default. 항상 빈 결과.
//
// LeaveRequest 가 머지된 후 (Sprint 6) [SQLLeaveAdjustmentFetcher] 로 교체.
type NoopLeaveAdjustmentFetcher struct{}

// Fetch — 항상 nil 반환.
func (NoopLeaveAdjustmentFetcher) Fetch(_ context.Context, _ []int64, _, _ time.Time) ([]LeaveAdjustment, error) {
	return nil, nil
}

// LeaveQuerier — SQLLeaveAdjustmentFetcher 가 필요로 하는 최소 sqlc 인터페이스.
// dbq.Queries 가 만족.
type LeaveQuerier interface {
	FetchApprovedLeaveDaysForUsers(ctx context.Context, arg dbq.FetchApprovedLeaveDaysForUsersParams) ([]dbq.FetchApprovedLeaveDaysForUsersRow, error)
}

// SQLLeaveAdjustmentFetcher — Sprint 6 swap.
//
// approved 상태의 leave_request 를 일별로 펼쳐 [LeaveAdjustment] 리스트로 변환한다.
//
//   - 휴가 기간이 N 일이면 N 개의 row 로 분리 (한 row 당 default_hours, 단 마지막 row 에 잔여).
//   - 한도 보호: requesterID == 0 / userIDs 가 비어 있으면 DB 호출 skip.
type SQLLeaveAdjustmentFetcher struct {
	q        LeaveQuerier
	tenantID int64
}

// NewSQLLeaveAdjustmentFetcher — querier 와 default tenant id 주입.
func NewSQLLeaveAdjustmentFetcher(q LeaveQuerier, tenantID int64) *SQLLeaveAdjustmentFetcher {
	if tenantID == 0 {
		tenantID = 1
	}
	return &SQLLeaveAdjustmentFetcher{q: q, tenantID: tenantID}
}

// Fetch — userIDs 범위의 approved leave 를 일별로 펼침.
//
// 단일 일자 (start.Date == end.Date) → 1 row (hours 그대로).
// 다일자 → 일별로 default_hours 씩 분배, 마지막 일에 잔여.
// 빈 userIDs → DB 호출 없이 빈 결과.
func (f *SQLLeaveAdjustmentFetcher) Fetch(ctx context.Context, userIDs []int64, from, to time.Time) ([]LeaveAdjustment, error) {
	if len(userIDs) == 0 {
		return nil, nil
	}
	rows, err := f.q.FetchApprovedLeaveDaysForUsers(ctx, dbq.FetchApprovedLeaveDaysForUsersParams{
		UserIds:  userIDs,
		TenantID: f.tenantID,
		FromDate: pgtype.Date{Time: from, Valid: true},
		ToDate:   pgtype.Date{Time: to, Valid: true},
	})
	if err != nil {
		return nil, err
	}
	out := make([]LeaveAdjustment, 0, len(rows))
	for _, r := range rows {
		expanded := expandLeaveDays(r)
		out = append(out, expanded...)
	}
	return out, nil
}

// expandLeaveDays — 단일 leave row 를 일별 LeaveAdjustment 로 펼침.
//
// 알고리즘:
//  1. days = (end.Date - start.Date) + 1 (KST 기준 일수)
//  2. perDay = default_hours (예: 8.0)
//  3. 각 day 에 perDay 씩 할당, 단 합이 total hours 를 초과하지 않도록 마지막 일에 잔여.
func expandLeaveDays(r dbq.FetchApprovedLeaveDaysForUsersRow) []LeaveAdjustment {
	if !r.StartAt.Valid || !r.EndAt.Valid {
		return nil
	}
	loc, _ := time.LoadLocation("Asia/Seoul")
	startDay := r.StartAt.Time.In(loc)
	startDay = time.Date(startDay.Year(), startDay.Month(), startDay.Day(), 0, 0, 0, 0, loc)
	endDay := r.EndAt.Time.In(loc)
	endDay = time.Date(endDay.Year(), endDay.Month(), endDay.Day(), 0, 0, 0, 0, loc)

	total := numericFloatFromPg(r.Hours)
	perDay := numericFloatFromPg(r.DefaultHours)
	if perDay <= 0 {
		perDay = 8.0
	}

	days := int(endDay.Sub(startDay).Hours()/24) + 1
	if days < 1 {
		days = 1
	}

	out := make([]LeaveAdjustment, 0, days)
	remaining := total
	cur := startDay
	for i := 0; i < days; i++ {
		hours := perDay
		if i == days-1 || remaining < perDay {
			hours = remaining
		}
		if hours < 0 {
			hours = 0
		}
		out = append(out, LeaveAdjustment{
			UserID:    r.RequesterID,
			Date:      cur,
			Hours:     hours,
			LeaveType: r.LeaveTypeCode,
		})
		remaining -= hours
		cur = cur.AddDate(0, 0, 1)
	}
	return out
}

func numericFloatFromPg(n pgtype.Numeric) float64 {
	if !n.Valid || n.NaN {
		return 0
	}
	f, err := n.Float64Value()
	if err != nil || !f.Valid {
		return 0
	}
	return f.Float64
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
