package audit_test

import (
	"context"
	"net/netip"
	"sort"
	"time"

	"github.com/jackc/pgx/v5/pgtype"

	"github.com/sjseo/docflow/backend/internal/hr/audit"
	dbq "github.com/sjseo/docflow/backend/internal/db/sqlc"
)

// fakeAuditStore — attendance_records 메모리 구현. 필터 조합을 SQL 과 동일 의미로 구현.
type fakeAuditStore struct {
	records []dbq.AttendanceRecord
	nextID  int64
}

func newFakeAuditStore() *fakeAuditStore {
	return &fakeAuditStore{}
}

func (f *fakeAuditStore) seed(r dbq.AttendanceRecord) dbq.AttendanceRecord {
	if r.ID == 0 {
		f.nextID++
		r.ID = f.nextID
	}
	if r.TenantID == 0 {
		r.TenantID = 1
	}
	if r.Status == "" {
		r.Status = dbq.AttendanceStatusNormal
	}
	if r.Source == "" {
		r.Source = dbq.AttendanceSourceButton
	}
	if !r.CreatedAt.Valid {
		r.CreatedAt = pgtype.Timestamptz{Time: time.Now(), Valid: true}
	}
	if !r.UpdatedAt.Valid {
		r.UpdatedAt = pgtype.Timestamptz{Time: time.Now(), Valid: true}
	}
	f.records = append(f.records, r)
	if r.ID > f.nextID {
		f.nextID = r.ID
	}
	return r
}

func mustParseIP(s string) *netip.Addr {
	a, err := netip.ParseAddr(s)
	if err != nil {
		panic(err)
	}
	return &a
}

func mustDate(s string) pgtype.Date {
	t, err := time.Parse("2006-01-02", s)
	if err != nil {
		panic(err)
	}
	return pgtype.Date{Time: t, Valid: true}
}

func (f *fakeAuditStore) match(r dbq.AttendanceRecord, arg dbq.SearchAttendanceAuditParams) bool {
	if r.TenantID != arg.TenantID {
		return false
	}
	if arg.UserID.Valid && r.UserID != arg.UserID.Int64 {
		return false
	}
	if arg.FromDate.Valid && r.WorkDate.Time.Before(arg.FromDate.Time) {
		return false
	}
	if arg.ToDate.Valid && r.WorkDate.Time.After(arg.ToDate.Time) {
		return false
	}
	if arg.Source.Valid && string(r.Source) != arg.Source.String {
		return false
	}
	if arg.ClientIp.Valid {
		if r.ClientIp == nil {
			return false
		}
		if r.ClientIp.String() != arg.ClientIp.String {
			return false
		}
	}
	return true
}

func (f *fakeAuditStore) SearchAttendanceAudit(_ context.Context, arg dbq.SearchAttendanceAuditParams) ([]dbq.AttendanceRecord, error) {
	var matched []dbq.AttendanceRecord
	for _, r := range f.records {
		if f.match(r, arg) {
			matched = append(matched, r)
		}
	}
	// ORDER BY work_date DESC, user_id ASC, id ASC
	sort.SliceStable(matched, func(i, j int) bool {
		di := matched[i].WorkDate.Time
		dj := matched[j].WorkDate.Time
		if !di.Equal(dj) {
			return di.After(dj)
		}
		if matched[i].UserID != matched[j].UserID {
			return matched[i].UserID < matched[j].UserID
		}
		return matched[i].ID < matched[j].ID
	})
	// pagination
	from := int(arg.Off)
	if from > len(matched) {
		from = len(matched)
	}
	to := from + int(arg.Lim)
	if to > len(matched) {
		to = len(matched)
	}
	out := append([]dbq.AttendanceRecord(nil), matched[from:to]...)
	return out, nil
}

func (f *fakeAuditStore) CountAttendanceAudit(_ context.Context, arg dbq.CountAttendanceAuditParams) (int64, error) {
	var n int64
	// SearchAttendanceAuditParams 와 동일 필드 → 변환.
	sa := dbq.SearchAttendanceAuditParams{
		TenantID: arg.TenantID,
		UserID:   arg.UserID,
		FromDate: arg.FromDate,
		ToDate:   arg.ToDate,
		Source:   arg.Source,
		ClientIp: arg.ClientIp,
	}
	for _, r := range f.records {
		if f.match(r, sa) {
			n++
		}
	}
	return n, nil
}

var _ audit.Store = (*fakeAuditStore)(nil)
