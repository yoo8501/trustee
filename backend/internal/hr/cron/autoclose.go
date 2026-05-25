package cron

import (
	"context"
	"errors"
	"hash/fnv"
	"log/slog"
	"time"

	"github.com/jackc/pgx/v5/pgtype"

	dbq "github.com/sjseo/docflow/backend/internal/db/sqlc"
	"github.com/sjseo/docflow/backend/internal/hr/leave"
)

// AutoCloseLockName — accrual 과 별개의 lock id. 같은 process 에 두 cron 이 떠 있어도
// 서로 다른 lock id 로 동시 실행 가능.
const AutoCloseLockName = "docflow:attendance-autoclose"

// AutoCloseLockID — AutoCloseLockName 의 64bit 해시.
var AutoCloseLockID = int64(fnvHash(AutoCloseLockName))

func fnvHash(s string) uint64 {
	h := fnv.New64a()
	_, _ = h.Write([]byte(s))
	return h.Sum64()
}

// AttendanceAutoCloseStore — autoclose cron 이 사용하는 DB 의존성.
// 실 구현은 dbq.Queries 가 그대로 만족.
type AttendanceAutoCloseStore interface {
	// 어제 (KST) 의 미마감 record 조회.
	ListOpenAttendanceForDate(ctx context.Context, workDate pgtype.Date) ([]dbq.AttendanceRecord, error)
	// 주어진 id 목록을 status=auto_closed 로 마킹 (check_out_at NULL 유지).
	MarkAttendanceAutoClosed(ctx context.Context, ids []int64) error
}

var _ AttendanceAutoCloseStore = (*dbq.Queries)(nil)

// AutoCloseJob — 자정 KST 출퇴근 자동 마감.
//
// 매일 KST 00:00 실행:
//
//	어제 (KST) work_date 중 check_out_at IS NULL → status=auto_closed.
//	check_out_at 은 NULL 그대로 두어 "퇴근 누락" 임을 표현.
//
// 알림 (인앱 노티) 은 Sprint 8 의 Notification 도메인 도입 시 정식화한다.
// 본 sprint 는 마킹된 user 별로 구조화 로그 한 줄을 남기는 것으로 stub.
type AutoCloseJob struct {
	store    AttendanceAutoCloseStore
	logger   *slog.Logger
	tenantID int64
	dryRun   bool
	clock    func() time.Time
}

// AutoCloseJobConfig — 의존성 묶음.
type AutoCloseJobConfig struct {
	Store    AttendanceAutoCloseStore
	Logger   *slog.Logger
	TenantID int64
	DryRun   bool
	// Clock 이 nil 이면 KST 현재 시각 사용.
	Clock func() time.Time
}

// NewAutoCloseJob — config 검증 후 job 생성.
func NewAutoCloseJob(cfg AutoCloseJobConfig) *AutoCloseJob {
	logger := cfg.Logger
	if logger == nil {
		logger = slog.Default()
	}
	if cfg.TenantID == 0 {
		cfg.TenantID = 1
	}
	clock := cfg.Clock
	if clock == nil {
		clock = func() time.Time { return time.Now().In(leave.KSTLocation()) }
	}
	return &AutoCloseJob{
		store:    cfg.Store,
		logger:   logger,
		tenantID: cfg.TenantID,
		dryRun:   cfg.DryRun,
		clock:    clock,
	}
}

// Spec — robfig/cron 표현식 (5 필드, KST 기준). 매일 자정.
func (j *AutoCloseJob) Spec() string {
	return "0 0 * * *"
}

// AutoCloseResult — Run 의 결과 summary.
type AutoCloseResult struct {
	Candidates int  // 발견된 미마감 row 수
	Marked     int  // 실제로 auto_closed 로 마킹된 수 (dry-run 이면 0)
	Dryrun     bool
}

// Run — 1회 실행. 호출자가 advisory lock 으로 감쌀 책임.
func (j *AutoCloseJob) Run(ctx context.Context) (AutoCloseResult, error) {
	now := j.clock()
	// "어제 KST" 의 자정.
	yesterday := time.Date(now.Year(), now.Month(), now.Day(), 0, 0, 0, 0, leave.KSTLocation()).
		AddDate(0, 0, -1)

	rows, err := j.store.ListOpenAttendanceForDate(ctx, pgtype.Date{Time: yesterday, Valid: true})
	if err != nil {
		return AutoCloseResult{}, err
	}

	res := AutoCloseResult{Candidates: len(rows), Dryrun: j.dryRun}

	if len(rows) == 0 {
		j.logger.Info("autoclose: no open attendance",
			slog.String("work_date", yesterday.Format("2006-01-02")),
		)
		return res, nil
	}

	ids := make([]int64, 0, len(rows))
	for _, r := range rows {
		ids = append(ids, r.ID)
	}

	if j.dryRun {
		j.logger.Info("autoclose: dry-run",
			slog.String("work_date", yesterday.Format("2006-01-02")),
			slog.Int("candidates", res.Candidates),
		)
		return res, nil
	}

	if err := j.store.MarkAttendanceAutoClosed(ctx, ids); err != nil {
		return res, err
	}
	res.Marked = len(ids)

	// TODO(sprint-8): Notification 도메인 도입 후 row 별로 인앱 알림 INSERT.
	// 본 sprint 는 사용자 단위 로그만 남긴다 (운영자 가시성 확보).
	for _, r := range rows {
		j.logger.Info("autoclose: marked",
			slog.Int64("attendance_id", r.ID),
			slog.Int64("user_id", r.UserID),
			slog.String("work_date", yesterday.Format("2006-01-02")),
		)
	}

	j.logger.Info("autoclose: done",
		slog.String("work_date", yesterday.Format("2006-01-02")),
		slog.Int("marked", res.Marked),
	)
	return res, nil
}

// AutoCloseJobAdapter — AutoCloseJob 을 Job 인터페이스 + advisory lock 으로 감싸 등록.
type AutoCloseJobAdapter struct {
	Inner  *AutoCloseJob
	Locker AdvisoryLocker
	Logger *slog.Logger
}

// Spec — AutoCloseJob.Spec 위임.
func (a AutoCloseJobAdapter) Spec() string { return a.Inner.Spec() }

// Name — "attendance-autoclose".
func (a AutoCloseJobAdapter) Name() string { return "attendance-autoclose" }

// Run — advisory lock (AutoCloseLockID) 으로 감싼 후 AutoCloseJob 실행.
// AdvisoryLocker 인터페이스의 메서드 이름은 "Accrual" 접미가 붙어 있으나 SQL 은 generic
// pg_(try_)advisory_(un)lock 이라 다른 lock id 로 호출하면 attendance 용으로 독립 작동.
func (a AutoCloseJobAdapter) Run(ctx context.Context) error {
	logger := a.Logger
	if logger == nil {
		logger = slog.Default()
	}
	err := withLockID(ctx, a.Locker, AutoCloseLockID, func(ctx context.Context) error {
		_, err := a.Inner.Run(ctx)
		return err
	})
	if errors.Is(err, ErrLockNotAcquired) {
		logger.Info("cron: attendance-autoclose lock skipped (another instance running)")
		return nil
	}
	return err
}

// withLockID — WithLock 의 generic 버전. 임의의 lock id 로 lock 획득.
//
// 기존 WithLock 은 AccrualLockID 고정이라 attendance cron 과 동일 lock 을 잡아 충돌하므로
// id 를 인자로 받는 helper 가 필요.
func withLockID(ctx context.Context, locker AdvisoryLocker, id int64, fn func(ctx context.Context) error) error {
	acquired, err := locker.TryAdvisoryLockAccrual(ctx, id)
	if err != nil {
		return err
	}
	if !acquired {
		return ErrLockNotAcquired
	}
	defer func() {
		_, _ = locker.ReleaseAdvisoryLockAccrual(ctx, id)
	}()
	return fn(ctx)
}
