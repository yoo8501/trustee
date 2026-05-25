package cron_test

import (
	"context"
	"sync/atomic"
	"testing"
	"time"

	"github.com/jackc/pgx/v5/pgtype"

	dbq "github.com/sjseo/docflow/backend/internal/db/sqlc"
	"github.com/sjseo/docflow/backend/internal/hr/cron"
	"github.com/sjseo/docflow/backend/internal/hr/leave"
)

// fakeAutoCloseStore — AttendanceAutoCloseStore 메모리 구현.
type fakeAutoCloseStore struct {
	records   []dbq.AttendanceRecord
	listCalls atomic.Int64
	marked    atomic.Int64
	markCalls atomic.Int64
}

func (f *fakeAutoCloseStore) ListOpenAttendanceForDate(_ context.Context, workDate pgtype.Date) ([]dbq.AttendanceRecord, error) {
	f.listCalls.Add(1)
	target := workDate.Time.Format("2006-01-02")
	var out []dbq.AttendanceRecord
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

func (f *fakeAutoCloseStore) MarkAttendanceAutoClosed(_ context.Context, ids []int64) error {
	f.markCalls.Add(1)
	f.marked.Add(int64(len(ids)))
	idset := map[int64]bool{}
	for _, id := range ids {
		idset[id] = true
	}
	for i, r := range f.records {
		if idset[r.ID] {
			r.Status = dbq.AttendanceStatusAutoClosed
			f.records[i] = r
		}
	}
	return nil
}

// kstAt — KST 기준 시각 helper.
func kstAt(t *testing.T, ymdHM string) time.Time {
	t.Helper()
	parsed, err := time.ParseInLocation("2006-01-02 15:04", ymdHM, leave.KSTLocation())
	if err != nil {
		t.Fatal(err)
	}
	return parsed
}

func makeOpenRecord(id, userID int64, workDate time.Time) dbq.AttendanceRecord {
	return dbq.AttendanceRecord{
		ID: id, TenantID: 1, UserID: userID,
		WorkDate:  pgtype.Date{Time: workDate, Valid: true},
		CheckInAt: pgtype.Timestamptz{Time: workDate.Add(9 * time.Hour), Valid: true},
		Status:    dbq.AttendanceStatusNormal,
		Source:    dbq.AttendanceSourceButton,
	}
}

// 0 candidates → no-op (MarkAttendanceAutoClosed 호출 안 됨).
func TestAutoCloseJob_NoOpen_NoMark(t *testing.T) {
	store := &fakeAutoCloseStore{}
	now := kstAt(t, "2026-05-26 00:00")
	job := cron.NewAutoCloseJob(cron.AutoCloseJobConfig{
		Store: store, TenantID: 1,
		Clock: func() time.Time { return now },
	})
	res, err := job.Run(context.Background())
	if err != nil {
		t.Fatal(err)
	}
	if res.Candidates != 0 || res.Marked != 0 {
		t.Fatalf("res=%+v want zero", res)
	}
	if store.markCalls.Load() != 0 {
		t.Fatalf("mark called %d times want 0", store.markCalls.Load())
	}
}

// open record 3개 → 3개 마킹.
func TestAutoCloseJob_MarksAllOpenForYesterday(t *testing.T) {
	yesterday := kstAt(t, "2026-05-25 00:00")
	store := &fakeAutoCloseStore{
		records: []dbq.AttendanceRecord{
			makeOpenRecord(101, 7, yesterday),
			makeOpenRecord(102, 8, yesterday),
			makeOpenRecord(103, 9, yesterday),
		},
	}
	now := kstAt(t, "2026-05-26 00:00")
	job := cron.NewAutoCloseJob(cron.AutoCloseJobConfig{
		Store: store, TenantID: 1,
		Clock: func() time.Time { return now },
	})
	res, err := job.Run(context.Background())
	if err != nil {
		t.Fatal(err)
	}
	if res.Candidates != 3 || res.Marked != 3 {
		t.Fatalf("res=%+v want candidates=3 marked=3", res)
	}
	if store.marked.Load() != 3 {
		t.Fatalf("marked=%d want 3", store.marked.Load())
	}
	for _, r := range store.records {
		if r.Status != dbq.AttendanceStatusAutoClosed {
			t.Fatalf("record %d not marked: %s", r.ID, r.Status)
		}
		if r.CheckOutAt.Valid {
			t.Fatalf("record %d check_out_at must remain NULL", r.ID)
		}
	}
}

// dryRun=true → MarkAttendanceAutoClosed 호출 안 됨.
func TestAutoCloseJob_DryRun_NoWrite(t *testing.T) {
	yesterday := kstAt(t, "2026-05-25 00:00")
	store := &fakeAutoCloseStore{
		records: []dbq.AttendanceRecord{
			makeOpenRecord(101, 7, yesterday),
			makeOpenRecord(102, 8, yesterday),
		},
	}
	now := kstAt(t, "2026-05-26 00:00")
	job := cron.NewAutoCloseJob(cron.AutoCloseJobConfig{
		Store: store, TenantID: 1, DryRun: true,
		Clock: func() time.Time { return now },
	})
	res, err := job.Run(context.Background())
	if err != nil {
		t.Fatal(err)
	}
	if !res.Dryrun {
		t.Fatal("Dryrun flag not propagated")
	}
	if res.Candidates != 2 {
		t.Fatalf("candidates=%d want 2 (dry-run still counts)", res.Candidates)
	}
	if res.Marked != 0 {
		t.Fatalf("Marked=%d want 0 in dry-run", res.Marked)
	}
	if store.markCalls.Load() != 0 {
		t.Fatalf("mark call=%d want 0 in dry-run", store.markCalls.Load())
	}
}

// 이미 check_out_at 있는 record / 이미 auto_closed 인 record 는 제외.
func TestAutoCloseJob_SkipsClosedAndAlreadyAutoClosed(t *testing.T) {
	yesterday := kstAt(t, "2026-05-25 00:00")
	closed := makeOpenRecord(101, 7, yesterday)
	closed.CheckOutAt = pgtype.Timestamptz{Time: yesterday.Add(18 * time.Hour), Valid: true}
	closed.Status = dbq.AttendanceStatusNormal

	already := makeOpenRecord(102, 8, yesterday)
	already.Status = dbq.AttendanceStatusAutoClosed

	open := makeOpenRecord(103, 9, yesterday)

	store := &fakeAutoCloseStore{records: []dbq.AttendanceRecord{closed, already, open}}
	now := kstAt(t, "2026-05-26 00:00")
	job := cron.NewAutoCloseJob(cron.AutoCloseJobConfig{
		Store: store, TenantID: 1, Clock: func() time.Time { return now },
	})
	res, err := job.Run(context.Background())
	if err != nil {
		t.Fatal(err)
	}
	if res.Candidates != 1 || res.Marked != 1 {
		t.Fatalf("res=%+v want only open record 103 processed", res)
	}
}

// 오늘 record 는 절대 마킹 안 함 (어제만 대상).
func TestAutoCloseJob_DoesNotTouchToday(t *testing.T) {
	today := kstAt(t, "2026-05-26 00:00")
	store := &fakeAutoCloseStore{
		records: []dbq.AttendanceRecord{
			makeOpenRecord(200, 7, today),
		},
	}
	now := kstAt(t, "2026-05-26 00:01")
	job := cron.NewAutoCloseJob(cron.AutoCloseJobConfig{
		Store: store, TenantID: 1, Clock: func() time.Time { return now },
	})
	res, err := job.Run(context.Background())
	if err != nil {
		t.Fatal(err)
	}
	if res.Candidates != 0 {
		t.Fatalf("today's record was processed: candidates=%d", res.Candidates)
	}
}

// Spec — "0 0 * * *" (KST scheduler 가 로케일 적용).
func TestAutoCloseJob_Spec(t *testing.T) {
	job := cron.NewAutoCloseJob(cron.AutoCloseJobConfig{Store: &fakeAutoCloseStore{}})
	if got := job.Spec(); got != "0 0 * * *" {
		t.Fatalf("spec=%s want 0 0 * * *", got)
	}
}

// AutoCloseJobAdapter — advisory lock 동작 (lock 잡고 fn 호출 + unlock).
func TestAutoCloseAdapter_RunWithLock_Success(t *testing.T) {
	yesterday := kstAt(t, "2026-05-25 00:00")
	store := &fakeAutoCloseStore{
		records: []dbq.AttendanceRecord{makeOpenRecord(101, 7, yesterday)},
	}
	locker := &fakeLocker{}
	job := cron.NewAutoCloseJob(cron.AutoCloseJobConfig{
		Store: store, TenantID: 1,
		Clock: func() time.Time { return kstAt(t, "2026-05-26 00:00") },
	})
	adapter := cron.AutoCloseJobAdapter{Inner: job, Locker: locker}
	if err := adapter.Run(context.Background()); err != nil {
		t.Fatalf("err=%v", err)
	}
	if locker.tryCalls.Load() != 1 || locker.unlockCalls.Load() != 1 {
		t.Fatalf("try=%d unlock=%d", locker.tryCalls.Load(), locker.unlockCalls.Load())
	}
	if store.marked.Load() != 1 {
		t.Fatalf("marked=%d want 1", store.marked.Load())
	}
}

// 다른 인스턴스가 lock 잡고 있으면 skip (nil 반환).
func TestAutoCloseAdapter_LockNotAcquired_Skip(t *testing.T) {
	locker := &fakeLocker{}
	locker.held.Store(true) // 이미 다른 인스턴스가 잡고 있음.
	store := &fakeAutoCloseStore{}
	job := cron.NewAutoCloseJob(cron.AutoCloseJobConfig{
		Store: store, TenantID: 1,
		Clock: func() time.Time { return kstAt(t, "2026-05-26 00:00") },
	})
	adapter := cron.AutoCloseJobAdapter{Inner: job, Locker: locker}
	if err := adapter.Run(context.Background()); err != nil {
		t.Fatalf("err=%v want nil (skip)", err)
	}
	if store.listCalls.Load() != 0 {
		t.Fatalf("list called %d times despite no lock", store.listCalls.Load())
	}
}

// AutoCloseLockID 와 AccrualLockID 가 달라야 두 cron 이 동시에 실행 가능.
func TestAutoCloseLockID_DifferentFromAccrual(t *testing.T) {
	if cron.AutoCloseLockID == cron.AccrualLockID {
		t.Fatalf("AutoCloseLockID == AccrualLockID; locks must be independent")
	}
}

// Adapter Spec/Name — scheduler 등록 시 사용되는 진입점 smoke.
func TestAutoCloseAdapter_SpecAndName(t *testing.T) {
	job := cron.NewAutoCloseJob(cron.AutoCloseJobConfig{Store: &fakeAutoCloseStore{}})
	adapter := cron.AutoCloseJobAdapter{Inner: job, Locker: &fakeLocker{}}
	if adapter.Spec() != "0 0 * * *" {
		t.Fatalf("spec=%s", adapter.Spec())
	}
	if adapter.Name() != "attendance-autoclose" {
		t.Fatalf("name=%s", adapter.Name())
	}
}
