package cron

import (
	"context"
	"errors"
	"log/slog"

	robfig "github.com/robfig/cron/v3"

	"github.com/sjseo/docflow/backend/internal/hr/leave"
)

// Job — robfig/cron 에 등록 가능한 job + spec + 이름.
type Job interface {
	// Spec — cron 표현식 (5 필드, 위치는 KST 로 고정).
	Spec() string
	// Name — 로그 / advisory lock 식별자.
	Name() string
	// Run — context 와 함께 실행.
	Run(ctx context.Context) error
}

// AccrualJobAdapter — AccrualJob 을 Job 인터페이스에 맞게 adapt.
//
// AccrualJob.Run 은 결과 + error 두 값을 반환하므로 cron 등록을 위해 result 를 버리고
// error 만 전파. 결과 카운트는 AccrualJob 내부 로그에 남는다.
type AccrualJobAdapter struct {
	Inner  *AccrualJob
	Locker AdvisoryLocker
	Logger *slog.Logger
}

// Spec — AccrualJob.Spec 위임.
func (a AccrualJobAdapter) Spec() string { return a.Inner.Spec() }

// Name — "accrual".
func (a AccrualJobAdapter) Name() string { return "accrual" }

// Run — advisory lock 으로 감싼 후 AccrualJob 실행.
func (a AccrualJobAdapter) Run(ctx context.Context) error {
	logger := a.Logger
	if logger == nil {
		logger = slog.Default()
	}
	err := WithLock(ctx, a.Locker, func(ctx context.Context) error {
		_, err := a.Inner.Run(ctx)
		return err
	})
	if errors.Is(err, ErrLockNotAcquired) {
		logger.Info("cron: accrual lock skipped (another instance running)")
		return nil
	}
	return err
}

// NewScheduler — robfig/cron 인스턴스를 만들고 jobs 를 등록한다 (KST 고정).
func NewScheduler(logger *slog.Logger, jobs ...Job) (*robfig.Cron, error) {
	if logger == nil {
		logger = slog.Default()
	}
	c := robfig.New(robfig.WithLocation(leave.KSTLocation()))
	for _, j := range jobs {
		spec := j.Spec()
		name := j.Name()
		captured := j
		_, err := c.AddFunc(spec, func() {
			logger.Info("cron: running", slog.String("job", name))
			if err := captured.Run(context.Background()); err != nil {
				logger.Error("cron: job failed", slog.String("job", name), slog.String("error", err.Error()))
			}
		})
		if err != nil {
			return nil, err
		}
	}
	return c, nil
}
