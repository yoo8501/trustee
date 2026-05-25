package stats_test

import (
	"context"
	"testing"

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
