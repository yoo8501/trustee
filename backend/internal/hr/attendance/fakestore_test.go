package attendance_test

import (
	"context"
	"sync/atomic"
	"time"

	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgtype"

	dbq "github.com/sjseo/docflow/backend/internal/db/sqlc"
)

// fakeAttendanceStore — attendance.Store 메모리 구현 (handler/service 테스트용).
type fakeAttendanceStore struct {
	// records key: user_id|work_date(YYYY-MM-DD)
	records   map[string]dbq.AttendanceRecord
	nextID    int64
	creates   atomic.Int64
	updates   atomic.Int64
	autoCloses atomic.Int64
}

func newFakeAttendanceStore() *fakeAttendanceStore {
	return &fakeAttendanceStore{records: map[string]dbq.AttendanceRecord{}}
}

func recordKey(userID int64, d time.Time) string {
	return d.Format("2006-01-02") + "|" + intToStr(userID)
}

func intToStr(v int64) string {
	if v == 0 {
		return "0"
	}
	negative := v < 0
	if negative {
		v = -v
	}
	var buf [20]byte
	i := len(buf)
	for v > 0 {
		i--
		buf[i] = byte('0' + v%10)
		v /= 10
	}
	if negative {
		i--
		buf[i] = '-'
	}
	return string(buf[i:])
}

func (f *fakeAttendanceStore) GetAttendanceByUserDate(_ context.Context, arg dbq.GetAttendanceByUserDateParams) (dbq.AttendanceRecord, error) {
	r, ok := f.records[recordKey(arg.UserID, arg.WorkDate.Time)]
	if !ok {
		return dbq.AttendanceRecord{}, pgx.ErrNoRows
	}
	if r.TenantID != arg.TenantID {
		return dbq.AttendanceRecord{}, pgx.ErrNoRows
	}
	return r, nil
}

func (f *fakeAttendanceStore) CreateAttendanceCheckIn(_ context.Context, arg dbq.CreateAttendanceCheckInParams) (dbq.AttendanceRecord, error) {
	f.creates.Add(1)
	f.nextID++
	r := dbq.AttendanceRecord{
		ID:                f.nextID,
		TenantID:          arg.TenantID,
		UserID:            arg.UserID,
		WorkDate:          arg.WorkDate,
		CheckInAt:         arg.CheckInAt,
		LunchBreakMinutes: 60,
		Source:            arg.Source,
		ClientIp:          arg.ClientIp,
		UserAgent:         arg.UserAgent,
		Status:            arg.Status,
		CreatedAt:         pgtype.Timestamptz{Time: time.Now(), Valid: true},
		UpdatedAt:         pgtype.Timestamptz{Time: time.Now(), Valid: true},
	}
	f.records[recordKey(arg.UserID, arg.WorkDate.Time)] = r
	return r, nil
}

func (f *fakeAttendanceStore) UpdateAttendanceCheckOut(_ context.Context, arg dbq.UpdateAttendanceCheckOutParams) (dbq.AttendanceRecord, error) {
	f.updates.Add(1)
	for k, r := range f.records {
		if r.ID == arg.ID && r.TenantID == arg.TenantID {
			r.CheckOutAt = arg.CheckOutAt
			r.Status = arg.Status
			r.UpdatedAt = pgtype.Timestamptz{Time: time.Now(), Valid: true}
			f.records[k] = r
			return r, nil
		}
	}
	return dbq.AttendanceRecord{}, pgx.ErrNoRows
}

// ---- cron 용 메서드 (autoclose 가 사용) ----

func (f *fakeAttendanceStore) ListOpenAttendanceForDate(_ context.Context, workDate pgtype.Date) ([]dbq.AttendanceRecord, error) {
	var out []dbq.AttendanceRecord
	target := workDate.Time.Format("2006-01-02")
	for _, r := range f.records {
		if r.WorkDate.Time.Format("2006-01-02") != target {
			continue
		}
		if r.CheckOutAt.Valid {
			continue
		}
		if r.Status == dbq.AttendanceStatusAutoClosed {
			continue
		}
		out = append(out, r)
	}
	return out, nil
}

func (f *fakeAttendanceStore) MarkAttendanceAutoClosed(_ context.Context, ids []int64) error {
	f.autoCloses.Add(int64(len(ids)))
	idset := map[int64]bool{}
	for _, id := range ids {
		idset[id] = true
	}
	for k, r := range f.records {
		if idset[r.ID] {
			r.Status = dbq.AttendanceStatusAutoClosed
			r.UpdatedAt = pgtype.Timestamptz{Time: time.Now(), Valid: true}
			f.records[k] = r
		}
	}
	return nil
}

// ---- UserStore ----

type fakeUserStore struct {
	users map[int64]dbq.User
}

func newFakeUserStore() *fakeUserStore {
	return &fakeUserStore{users: map[int64]dbq.User{}}
}

func (f *fakeUserStore) seed(u dbq.User) {
	if u.TenantID == 0 {
		u.TenantID = 1
	}
	if u.Status == "" {
		u.Status = dbq.UserStatusActive
	}
	f.users[u.ID] = u
}

func (f *fakeUserStore) GetUserByID(_ context.Context, arg dbq.GetUserByIDParams) (dbq.User, error) {
	u, ok := f.users[arg.ID]
	if !ok || u.TenantID != arg.TenantID || u.DeletedAt.Valid {
		return dbq.User{}, pgx.ErrNoRows
	}
	return u, nil
}

// ---- 시간 / pgtype helpers ----

// workTime — "HH:MM" → pgtype.Time (KST 가정).
func workTime(h, m int) pgtype.Time {
	return pgtype.Time{Microseconds: int64(h)*3600_000_000 + int64(m)*60_000_000, Valid: true}
}
