package stats_test

import (
	"context"
	"math/big"
	"testing"
	"time"

	"github.com/jackc/pgx/v5/pgtype"

	dbq "github.com/sjseo/docflow/backend/internal/db/sqlc"
	"github.com/sjseo/docflow/backend/internal/hr/attendance/stats"
)

// Noop fetcher: 항상 빈 결과 (Sprint 5 default — Sprint 6에서 swap).
func TestNoopLeaveAdjustmentFetcher_AlwaysEmpty(t *testing.T) {
	var f stats.LeaveAdjustmentFetcher = stats.NoopLeaveAdjustmentFetcher{}
	got, err := f.Fetch(context.Background(), []int64{1, 2, 3},
		mustParse(t, "2026-05-01"), mustParse(t, "2026-05-31"))
	if err != nil {
		t.Fatalf("err=%v want nil", err)
	}
	if len(got) != 0 {
		t.Errorf("len=%d want 0", len(got))
	}
}

// ---- SQL adapter (Sprint 6 swap) ----

// fakeLeaveQuerier — stats.LeaveQuerier 의 in-memory 구현 (테스트 전용).
type fakeLeaveQuerier struct {
	rows []dbq.FetchApprovedLeaveDaysForUsersRow
	err  error

	lastUserIDs  []int64
	lastTenantID int64
	callCount    int
}

func (q *fakeLeaveQuerier) FetchApprovedLeaveDaysForUsers(_ context.Context, arg dbq.FetchApprovedLeaveDaysForUsersParams) ([]dbq.FetchApprovedLeaveDaysForUsersRow, error) {
	q.callCount++
	q.lastUserIDs = arg.UserIds
	q.lastTenantID = arg.TenantID
	return q.rows, q.err
}

func numericFromHours(v float64) pgtype.Numeric {
	scaled := int64(v*10 + 0.5)
	if v < 0 {
		scaled = int64(v*10 - 0.5)
	}
	return pgtype.Numeric{Int: big.NewInt(scaled), Exp: -1, Valid: true}
}

func tsKST(t *testing.T, s string) time.Time {
	t.Helper()
	loc, _ := time.LoadLocation("Asia/Seoul")
	out, err := time.ParseInLocation("2006-01-02 15:04", s, loc)
	if err != nil {
		t.Fatalf("parse %s: %v", s, err)
	}
	return out
}

func TestSQLLeaveAdjustmentFetcher_ImplementsInterface(t *testing.T) {
	q := &fakeLeaveQuerier{}
	f := stats.NewSQLLeaveAdjustmentFetcher(q, 1)
	var _ stats.LeaveAdjustmentFetcher = f
}

func TestSQLLeaveAdjustmentFetcher_SingleDay(t *testing.T) {
	start := tsKST(t, "2026-06-01 09:00")
	end := tsKST(t, "2026-06-01 18:00")
	q := &fakeLeaveQuerier{
		rows: []dbq.FetchApprovedLeaveDaysForUsersRow{
			{
				ID: 1, RequesterID: 10,
				StartAt:       pgtype.Timestamptz{Time: start, Valid: true},
				EndAt:         pgtype.Timestamptz{Time: end, Valid: true},
				Hours:         numericFromHours(8),
				LeaveTypeCode: "annual",
				DefaultHours:  numericFromHours(8),
			},
		},
	}
	f := stats.NewSQLLeaveAdjustmentFetcher(q, 1)

	from := tsKST(t, "2026-06-01 00:00")
	to := tsKST(t, "2026-06-30 23:59")
	got, err := f.Fetch(context.Background(), []int64{10}, from, to)
	if err != nil {
		t.Fatalf("Fetch err=%v", err)
	}
	if len(got) != 1 {
		t.Fatalf("got=%d rows want 1: %+v", len(got), got)
	}
	if got[0].UserID != 10 || got[0].Hours != 8 || got[0].LeaveType != "annual" {
		t.Errorf("got[0]=%+v", got[0])
	}
}

// 다일자 휴가는 일별로 펼침. 총 시간은 보존.
func TestSQLLeaveAdjustmentFetcher_MultiDay_ExpandsPerDay(t *testing.T) {
	start := tsKST(t, "2026-06-01 09:00")
	end := tsKST(t, "2026-06-03 18:00") // 3일.
	q := &fakeLeaveQuerier{
		rows: []dbq.FetchApprovedLeaveDaysForUsersRow{
			{
				ID: 2, RequesterID: 10,
				StartAt:       pgtype.Timestamptz{Time: start, Valid: true},
				EndAt:         pgtype.Timestamptz{Time: end, Valid: true},
				Hours:         numericFromHours(24),
				LeaveTypeCode: "annual",
				DefaultHours:  numericFromHours(8),
			},
		},
	}
	f := stats.NewSQLLeaveAdjustmentFetcher(q, 1)

	from := tsKST(t, "2026-06-01 00:00")
	to := tsKST(t, "2026-06-30 23:59")
	got, err := f.Fetch(context.Background(), []int64{10}, from, to)
	if err != nil {
		t.Fatalf("Fetch err=%v", err)
	}
	if len(got) != 3 {
		t.Fatalf("rows=%d want 3 (one per day): %+v", len(got), got)
	}
	total := 0.0
	for _, a := range got {
		total += a.Hours
		if a.UserID != 10 {
			t.Errorf("UserID=%d want 10", a.UserID)
		}
	}
	if total != 24 {
		t.Errorf("totalHours=%v want 24", total)
	}
}

func TestSQLLeaveAdjustmentFetcher_EmptyUserIDs_NoDBCall(t *testing.T) {
	q := &fakeLeaveQuerier{}
	f := stats.NewSQLLeaveAdjustmentFetcher(q, 1)

	from := tsKST(t, "2026-06-01 00:00")
	to := tsKST(t, "2026-06-30 23:59")
	got, err := f.Fetch(context.Background(), nil, from, to)
	if err != nil {
		t.Fatalf("Fetch err=%v", err)
	}
	if len(got) != 0 {
		t.Errorf("got=%d want 0", len(got))
	}
	if q.callCount != 0 {
		t.Errorf("callCount=%d want 0 (no DB call when userIDs empty)", q.callCount)
	}
}
