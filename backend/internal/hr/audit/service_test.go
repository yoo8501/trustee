package audit_test

import (
	"context"
	"testing"
	"time"

	"github.com/jackc/pgx/v5/pgtype"

	"github.com/sjseo/docflow/backend/internal/hr/audit"
	dbq "github.com/sjseo/docflow/backend/internal/db/sqlc"
)

func seedSampleRecords(s *fakeAuditStore) {
	// 3명 사용자 × 다른 날짜 × 다른 source / ip 조합.
	s.seed(dbq.AttendanceRecord{
		UserID: 1, WorkDate: mustDate("2026-05-01"),
		ClientIp: mustParseIP("10.0.0.1"),
	})
	s.seed(dbq.AttendanceRecord{
		UserID: 2, WorkDate: mustDate("2026-05-02"),
		ClientIp: mustParseIP("10.0.0.2"),
		Source:   dbq.AttendanceSourceManualCorrection,
	})
	s.seed(dbq.AttendanceRecord{
		UserID: 1, WorkDate: mustDate("2026-05-03"),
		ClientIp: mustParseIP("10.0.0.1"),
	})
	s.seed(dbq.AttendanceRecord{
		UserID: 3, WorkDate: mustDate("2026-05-04"),
		// no client ip
	})
}

func TestService_Search_NoFilters_ReturnsAll(t *testing.T) {
	store := newFakeAuditStore()
	seedSampleRecords(store)
	svc := audit.NewService(store)

	res, err := svc.Search(context.Background(), audit.SearchInput{
		TenantID: 1, Page: 1, Size: 100,
	})
	if err != nil {
		t.Fatalf("Search failed: %v", err)
	}
	if res.Total != 4 {
		t.Fatalf("total = %d, want 4", res.Total)
	}
	if len(res.Items) != 4 {
		t.Fatalf("items = %d, want 4", len(res.Items))
	}
	// ORDER BY work_date DESC → 가장 최근 first.
	if res.Items[0].WorkDate.Format("2006-01-02") != "2026-05-04" {
		t.Fatalf("first = %s", res.Items[0].WorkDate.Format("2006-01-02"))
	}
}

func TestService_Search_FilterByUserID(t *testing.T) {
	store := newFakeAuditStore()
	seedSampleRecords(store)
	svc := audit.NewService(store)

	uid := int64(1)
	res, err := svc.Search(context.Background(), audit.SearchInput{
		TenantID: 1, UserID: &uid, Page: 1, Size: 100,
	})
	if err != nil {
		t.Fatal(err)
	}
	if res.Total != 2 {
		t.Fatalf("total = %d, want 2", res.Total)
	}
	for _, r := range res.Items {
		if r.UserID != 1 {
			t.Fatalf("got user_id=%d, want 1", r.UserID)
		}
	}
}

func TestService_Search_FilterByDateRange(t *testing.T) {
	store := newFakeAuditStore()
	seedSampleRecords(store)
	svc := audit.NewService(store)

	from := time.Date(2026, 5, 2, 0, 0, 0, 0, time.UTC)
	to := time.Date(2026, 5, 3, 0, 0, 0, 0, time.UTC)
	res, err := svc.Search(context.Background(), audit.SearchInput{
		TenantID: 1, From: &from, To: &to, Page: 1, Size: 100,
	})
	if err != nil {
		t.Fatal(err)
	}
	if res.Total != 2 {
		t.Fatalf("total = %d, want 2 (2026-05-02 ~ 2026-05-03)", res.Total)
	}
}

func TestService_Search_FilterBySource(t *testing.T) {
	store := newFakeAuditStore()
	seedSampleRecords(store)
	svc := audit.NewService(store)

	src := string(dbq.AttendanceSourceManualCorrection)
	res, err := svc.Search(context.Background(), audit.SearchInput{
		TenantID: 1, Source: &src, Page: 1, Size: 100,
	})
	if err != nil {
		t.Fatal(err)
	}
	if res.Total != 1 {
		t.Fatalf("total = %d, want 1", res.Total)
	}
	if res.Items[0].Source != string(dbq.AttendanceSourceManualCorrection) {
		t.Fatalf("source = %q", res.Items[0].Source)
	}
}

func TestService_Search_FilterByClientIP(t *testing.T) {
	store := newFakeAuditStore()
	seedSampleRecords(store)
	svc := audit.NewService(store)

	ip := "10.0.0.1"
	res, err := svc.Search(context.Background(), audit.SearchInput{
		TenantID: 1, ClientIP: &ip, Page: 1, Size: 100,
	})
	if err != nil {
		t.Fatal(err)
	}
	if res.Total != 2 {
		t.Fatalf("total = %d, want 2", res.Total)
	}
	for _, r := range res.Items {
		if r.ClientIP != "10.0.0.1" {
			t.Fatalf("clientIP = %q", r.ClientIP)
		}
	}
}

func TestService_Search_Pagination(t *testing.T) {
	store := newFakeAuditStore()
	seedSampleRecords(store)
	svc := audit.NewService(store)

	res, err := svc.Search(context.Background(), audit.SearchInput{
		TenantID: 1, Page: 1, Size: 2,
	})
	if err != nil {
		t.Fatal(err)
	}
	if res.Total != 4 {
		t.Fatalf("total = %d, want 4", res.Total)
	}
	if len(res.Items) != 2 {
		t.Fatalf("items = %d, want 2", len(res.Items))
	}

	// 2 페이지.
	res2, err := svc.Search(context.Background(), audit.SearchInput{
		TenantID: 1, Page: 2, Size: 2,
	})
	if err != nil {
		t.Fatal(err)
	}
	if len(res2.Items) != 2 {
		t.Fatalf("page 2 items = %d, want 2", len(res2.Items))
	}
	// 첫 페이지의 첫 row 와 두 번째 페이지의 첫 row 는 다른 ID 여야 함.
	if res.Items[0].ID == res2.Items[0].ID {
		t.Fatalf("pagination overlap: id=%d", res.Items[0].ID)
	}
}

func TestService_Search_DefaultsPageSize(t *testing.T) {
	store := newFakeAuditStore()
	seedSampleRecords(store)
	svc := audit.NewService(store)

	// Page=0, Size=0 → 기본값 (1, 20) 또는 비슷한 값으로 정규화.
	res, err := svc.Search(context.Background(), audit.SearchInput{TenantID: 1})
	if err != nil {
		t.Fatal(err)
	}
	if res.Total != 4 || len(res.Items) != 4 {
		t.Fatalf("defaults: total=%d items=%d", res.Total, len(res.Items))
	}
}

func TestService_Search_IncludesClientMetadata(t *testing.T) {
	store := newFakeAuditStore()
	store.seed(dbq.AttendanceRecord{
		UserID: 5, WorkDate: mustDate("2026-05-10"),
		ClientIp:  mustParseIP("192.168.1.42"),
		UserAgent: pgtype.Text{String: "Mozilla/5.0 (Macintosh)", Valid: true},
		Source:    dbq.AttendanceSourceButton,
	})
	svc := audit.NewService(store)

	res, err := svc.Search(context.Background(), audit.SearchInput{TenantID: 1})
	if err != nil {
		t.Fatal(err)
	}
	if len(res.Items) != 1 {
		t.Fatalf("items = %d", len(res.Items))
	}
	got := res.Items[0]
	if got.ClientIP != "192.168.1.42" {
		t.Fatalf("clientIP = %q", got.ClientIP)
	}
	if got.UserAgent != "Mozilla/5.0 (Macintosh)" {
		t.Fatalf("userAgent = %q", got.UserAgent)
	}
	if got.Source != "button" {
		t.Fatalf("source = %q", got.Source)
	}
}
