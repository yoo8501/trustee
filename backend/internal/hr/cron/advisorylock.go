// Package cron — 연차 발생 cron + advisory lock 인프라.
package cron

import (
	"context"
	"errors"
	"hash/fnv"

	dbq "github.com/sjseo/docflow/backend/internal/db/sqlc"
)

// AccrualLockName — pg_advisory_lock 의 lock id 를 결정하는 namespace 키.
// 동일 backend 가 여러 인스턴스로 떠도 같은 lock id 를 사용 → 1회만 실행.
const AccrualLockName = "docflow:accrual"

// AccrualLockID — AccrualLockName 의 64bit 해시. 이 값이 lock id.
var AccrualLockID = int64(fnv64(AccrualLockName))

// AdvisoryLocker — pg_try_advisory_lock / pg_advisory_unlock wrap.
//
// 실 구현은 sqlc 가 생성한 dbq.Queries 가 그대로 만족.
// 테스트용으로 가짜 구현을 주입할 수 있도록 인터페이스로 분리.
type AdvisoryLocker interface {
	TryAdvisoryLockAccrual(ctx context.Context, id int64) (bool, error)
	ReleaseAdvisoryLockAccrual(ctx context.Context, id int64) (bool, error)
}

var _ AdvisoryLocker = (*dbq.Queries)(nil)

// ErrLockNotAcquired — 다른 인스턴스가 lock 을 잡고 있을 때 반환.
var ErrLockNotAcquired = errors.New("cron: advisory lock not acquired")

// WithLock — fn 을 advisory lock 보호하에 실행.
//
//   - lock 획득 실패 → ErrLockNotAcquired (호출자가 skip 결정).
//   - fn 의 에러는 그대로 전달, 단 unlock 은 defer 보장.
//   - unlock 실패는 로그 목적으로 (cron 호출자) 별도 처리 — WithLock 은 fn 결과 우선.
func WithLock(ctx context.Context, locker AdvisoryLocker, fn func(ctx context.Context) error) error {
	acquired, err := locker.TryAdvisoryLockAccrual(ctx, AccrualLockID)
	if err != nil {
		return err
	}
	if !acquired {
		return ErrLockNotAcquired
	}
	defer func() {
		_, _ = locker.ReleaseAdvisoryLockAccrual(ctx, AccrualLockID)
	}()
	return fn(ctx)
}

// fnv64 — 안정적 64bit 해시.
func fnv64(s string) uint64 {
	h := fnv.New64a()
	_, _ = h.Write([]byte(s))
	return h.Sum64()
}
