package cron_test

import (
	"context"
	"errors"
	"sync/atomic"
	"testing"

	"github.com/sjseo/docflow/backend/internal/hr/cron"
)

// fakeLocker — 메모리 기반 advisory lock 모사.
// 같은 process 안에서 두 호출이 동시 진입하려고 할 때 한쪽만 acquired=true 를 받는다.
type fakeLocker struct {
	held       atomic.Bool
	tryCalls   atomic.Int64
	unlockCalls atomic.Int64
}

func (f *fakeLocker) TryAdvisoryLockAccrual(_ context.Context, _ int64) (bool, error) {
	f.tryCalls.Add(1)
	return f.held.CompareAndSwap(false, true), nil
}

func (f *fakeLocker) ReleaseAdvisoryLockAccrual(_ context.Context, _ int64) (bool, error) {
	f.unlockCalls.Add(1)
	f.held.Store(false)
	return true, nil
}

// WithLock 의 happy path — lock 잡고, fn 실행, unlock.
func TestWithLock_Success(t *testing.T) {
	l := &fakeLocker{}
	called := false
	err := cron.WithLock(context.Background(), l, func(ctx context.Context) error {
		called = true
		return nil
	})
	if err != nil {
		t.Fatalf("WithLock err = %v", err)
	}
	if !called {
		t.Fatal("fn was not called")
	}
	if l.tryCalls.Load() != 1 || l.unlockCalls.Load() != 1 {
		t.Fatalf("try=%d unlock=%d", l.tryCalls.Load(), l.unlockCalls.Load())
	}
}

// 두 번째 호출은 lock 을 잡을 수 없어 ErrLockNotAcquired.
func TestWithLock_Contention(t *testing.T) {
	l := &fakeLocker{}
	// 첫 호출은 lock 을 잡고 fn 안에서 두 번째 호출 — 두 번째는 ErrLockNotAcquired.
	var innerErr error
	outerErr := cron.WithLock(context.Background(), l, func(ctx context.Context) error {
		innerErr = cron.WithLock(ctx, l, func(ctx context.Context) error {
			t.Fatal("inner fn should not be called")
			return nil
		})
		return nil
	})
	if outerErr != nil {
		t.Fatalf("outer err = %v", outerErr)
	}
	if !errors.Is(innerErr, cron.ErrLockNotAcquired) {
		t.Fatalf("want ErrLockNotAcquired, got %v", innerErr)
	}
}

// fn 의 에러는 그대로 전달.
func TestWithLock_FnErrorPropagates(t *testing.T) {
	l := &fakeLocker{}
	want := errors.New("boom")
	got := cron.WithLock(context.Background(), l, func(ctx context.Context) error { return want })
	if !errors.Is(got, want) {
		t.Fatalf("err = %v, want %v", got, want)
	}
	// unlock 은 defer 로 호출됨.
	if l.unlockCalls.Load() != 1 {
		t.Fatalf("unlock not called: %d", l.unlockCalls.Load())
	}
}

// lock id 는 고정 — 멀티 인스턴스가 같은 키를 본다.
func TestAccrualLockID_Stable(t *testing.T) {
	if cron.AccrualLockID == 0 {
		t.Fatal("AccrualLockID is zero")
	}
}
