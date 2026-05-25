package calendar_test

import (
	"context"
	"math/big"
	"sort"
	"time"

	"github.com/jackc/pgx/v5/pgtype"

	dbq "github.com/sjseo/docflow/backend/internal/db/sqlc"
)

// fakeStore — calendar.Store in-memory 구현.
type fakeStore struct {
	leaves      []dbq.ListCalendarLeavesRow
	holidays    []dbq.Holiday
	attendances []dbq.ListCalendarAttendancesRow
}

func newFakeStore() *fakeStore {
	return &fakeStore{}
}

// ---- Store impl ----

func (f *fakeStore) ListCalendarLeaves(_ context.Context, arg dbq.ListCalendarLeavesParams) ([]dbq.ListCalendarLeavesRow, error) {
	var out []dbq.ListCalendarLeavesRow
	for _, l := range f.leaves {
		if l.TenantID != arg.TenantID {
			continue
		}
		// status filter (pending|approved) 은 seed 시점에 처리 가정.
		// 범위: start_at < to AND end_at > from.
		if l.StartAt.Time.Before(arg.ToAt.Time) && l.EndAt.Time.After(arg.FromAt.Time) {
			out = append(out, l)
		}
	}
	sort.Slice(out, func(i, j int) bool {
		if out[i].StartAt.Time.Equal(out[j].StartAt.Time) {
			return out[i].ID < out[j].ID
		}
		return out[i].StartAt.Time.Before(out[j].StartAt.Time)
	})
	return out, nil
}

func (f *fakeStore) ListHolidaysInRange(_ context.Context, arg dbq.ListHolidaysInRangeParams) ([]dbq.Holiday, error) {
	var out []dbq.Holiday
	for _, h := range f.holidays {
		if h.TenantID != arg.TenantID {
			continue
		}
		if !h.Date.Time.Before(arg.Date.Time) && !h.Date.Time.After(arg.Date_2.Time) {
			out = append(out, h)
		}
	}
	sort.Slice(out, func(i, j int) bool { return out[i].Date.Time.Before(out[j].Date.Time) })
	return out, nil
}

func (f *fakeStore) ListCalendarAttendances(_ context.Context, arg dbq.ListCalendarAttendancesParams) ([]dbq.ListCalendarAttendancesRow, error) {
	var out []dbq.ListCalendarAttendancesRow
	for _, a := range f.attendances {
		if a.TenantID != arg.TenantID || a.UserID != arg.UserID {
			continue
		}
		if !a.WorkDate.Time.Before(arg.FromDate.Time) && !a.WorkDate.Time.After(arg.ToDate.Time) {
			out = append(out, a)
		}
	}
	sort.Slice(out, func(i, j int) bool { return out[i].WorkDate.Time.Before(out[j].WorkDate.Time) })
	return out, nil
}

// ---- seeders ----

func (f *fakeStore) addLeave(row dbq.ListCalendarLeavesRow) {
	f.leaves = append(f.leaves, row)
}

func (f *fakeStore) addHoliday(h dbq.Holiday) {
	f.holidays = append(f.holidays, h)
}

func (f *fakeStore) addAttendance(a dbq.ListCalendarAttendancesRow) {
	f.attendances = append(f.attendances, a)
}

// ---- helpers ----

func numericFromFloat(v float64) pgtype.Numeric {
	scaled := int64(v*10 + 0.5)
	if v < 0 {
		scaled = int64(v*10 - 0.5)
	}
	return pgtype.Numeric{Int: big.NewInt(scaled), Exp: -1, Valid: true}
}

func pgTS(t time.Time) pgtype.Timestamptz {
	return pgtype.Timestamptz{Time: t, Valid: true}
}

func pgDate(t time.Time) pgtype.Date {
	return pgtype.Date{Time: time.Date(t.Year(), t.Month(), t.Day(), 0, 0, 0, 0, t.Location()), Valid: true}
}

func pgText(s string) pgtype.Text {
	if s == "" {
		return pgtype.Text{}
	}
	return pgtype.Text{String: s, Valid: true}
}

func pgInt8(v int64) pgtype.Int8 {
	return pgtype.Int8{Int64: v, Valid: true}
}
