package cron_test

import (
	"context"
	"sync"
	"testing"
	"time"

	dbq "github.com/sjseo/docflow/backend/internal/db/sqlc"
	"github.com/sjseo/docflow/backend/internal/hr/cron"
)

// fakeNotifier — autoclose 의 Notifier 트리거 검증용.
type fakeNotifier struct {
	mu    sync.Mutex
	calls []notifyCall
}

type notifyCall struct {
	TenantID int64
	UserID   int64
	Type     string
	Title    string
	Body     string
}

func (f *fakeNotifier) Notify(_ context.Context, tenantID, userID int64, n cron.AutoCloseNotification) error {
	f.mu.Lock()
	defer f.mu.Unlock()
	f.calls = append(f.calls, notifyCall{
		TenantID: tenantID, UserID: userID,
		Type: n.Type, Title: n.Title, Body: n.Body,
	})
	return nil
}

// 자동마감 시 각 user 에게 알림 발송.
func TestAutoCloseJob_NotifiesEachUserOnMark(t *testing.T) {
	yesterday := kstAt(t, "2026-05-25 00:00")
	store := &fakeAutoCloseStore{
		records: []dbq.AttendanceRecord{
			makeOpenRecord(101, 7, yesterday),
			makeOpenRecord(102, 8, yesterday),
		},
	}
	notifier := &fakeNotifier{}
	job := cron.NewAutoCloseJob(cron.AutoCloseJobConfig{
		Store: store, TenantID: 1,
		Clock:    func() time.Time { return kstAt(t, "2026-05-26 00:00") },
		Notifier: notifier,
	})
	_, err := job.Run(context.Background())
	if err != nil {
		t.Fatalf("run err=%v", err)
	}
	if len(notifier.calls) != 2 {
		t.Fatalf("notifier calls=%d want 2", len(notifier.calls))
	}
	gotUsers := map[int64]bool{}
	for _, c := range notifier.calls {
		gotUsers[c.UserID] = true
		if c.Type != "attendance_auto_closed" {
			t.Errorf("type=%s want attendance_auto_closed", c.Type)
		}
		if c.TenantID != 1 {
			t.Errorf("tenantId=%d", c.TenantID)
		}
	}
	if !gotUsers[7] || !gotUsers[8] {
		t.Errorf("notified users=%v want {7,8}", gotUsers)
	}
}

// dry-run 시 알림 발송 안 함.
func TestAutoCloseJob_DryRun_NoNotify(t *testing.T) {
	yesterday := kstAt(t, "2026-05-25 00:00")
	store := &fakeAutoCloseStore{
		records: []dbq.AttendanceRecord{makeOpenRecord(101, 7, yesterday)},
	}
	notifier := &fakeNotifier{}
	job := cron.NewAutoCloseJob(cron.AutoCloseJobConfig{
		Store: store, TenantID: 1, DryRun: true,
		Clock:    func() time.Time { return kstAt(t, "2026-05-26 00:00") },
		Notifier: notifier,
	})
	_, err := job.Run(context.Background())
	if err != nil {
		t.Fatalf("err=%v", err)
	}
	if len(notifier.calls) != 0 {
		t.Errorf("dry-run should not notify; calls=%d", len(notifier.calls))
	}
}

// notifier 주입 안 됐어도 (기본 noop) 정상 실행 — 후방 호환.
func TestAutoCloseJob_NoNotifier_StillWorks(t *testing.T) {
	yesterday := kstAt(t, "2026-05-25 00:00")
	store := &fakeAutoCloseStore{
		records: []dbq.AttendanceRecord{makeOpenRecord(101, 7, yesterday)},
	}
	job := cron.NewAutoCloseJob(cron.AutoCloseJobConfig{
		Store: store, TenantID: 1,
		Clock: func() time.Time { return kstAt(t, "2026-05-26 00:00") },
		// Notifier 생략.
	})
	res, err := job.Run(context.Background())
	if err != nil {
		t.Fatalf("err=%v", err)
	}
	if res.Marked != 1 {
		t.Fatalf("marked=%d want 1", res.Marked)
	}
}
