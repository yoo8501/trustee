package cron_test

import (
	"context"
	"errors"
	"log/slog"
	"testing"

	"github.com/sjseo/docflow/backend/internal/hr/cron"
)

// AccrualJobAdapter — lock 잡고 inner.Run 호출.
func TestAccrualJobAdapter_Run(t *testing.T) {
	store := newFakeAccrualStore()
	inner := cron.NewAccrualJob(cron.AccrualJobConfig{Store: store, TenantID: 1})
	l := &fakeLocker{}
	a := cron.AccrualJobAdapter{Inner: inner, Locker: l, Logger: slog.Default()}

	if a.Name() != "accrual" {
		t.Fatalf("Name=%q", a.Name())
	}
	if a.Spec() == "" {
		t.Fatal("empty spec")
	}
	if err := a.Run(context.Background()); err != nil {
		t.Fatalf("Run err=%v", err)
	}
	if l.tryCalls.Load() != 1 || l.unlockCalls.Load() != 1 {
		t.Fatalf("locker stats try=%d unlock=%d", l.tryCalls.Load(), l.unlockCalls.Load())
	}
}

// adapter — lock 잡힌 상태에서 호출되면 silent skip (nil error).
func TestAccrualJobAdapter_LockSkippedSilently(t *testing.T) {
	store := newFakeAccrualStore()
	inner := cron.NewAccrualJob(cron.AccrualJobConfig{Store: store, TenantID: 1})
	// 미리 lock 점유.
	l := &fakeLocker{}
	if _, err := l.TryAdvisoryLockAccrual(context.Background(), cron.AccrualLockID); err != nil {
		t.Fatal(err)
	}
	a := cron.AccrualJobAdapter{Inner: inner, Locker: l, Logger: slog.Default()}
	if err := a.Run(context.Background()); err != nil {
		t.Fatalf("expected nil, got %v", err)
	}
}

// NewScheduler — 정상 빌드 + Job 등록.
func TestNewScheduler_RegistersJobs(t *testing.T) {
	store := newFakeAccrualStore()
	inner := cron.NewAccrualJob(cron.AccrualJobConfig{Store: store, TenantID: 1})
	l := &fakeLocker{}
	a := cron.AccrualJobAdapter{Inner: inner, Locker: l}
	sch, err := cron.NewScheduler(slog.Default(), a)
	if err != nil {
		t.Fatal(err)
	}
	if sch == nil {
		t.Fatal("nil scheduler")
	}
	entries := sch.Entries()
	if len(entries) != 1 {
		t.Fatalf("entries=%d", len(entries))
	}
}

// NewScheduler — invalid spec 반환 시 error.
func TestNewScheduler_BadSpec(t *testing.T) {
	_, err := cron.NewScheduler(slog.Default(), &badSpecJob{})
	if err == nil {
		t.Fatal("expected error")
	}
}

type badSpecJob struct{}

func (b *badSpecJob) Spec() string                { return "not a spec" }
func (b *badSpecJob) Name() string                { return "bad" }
func (b *badSpecJob) Run(_ context.Context) error { return errors.New("nope") }
