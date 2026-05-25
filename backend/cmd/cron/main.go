// docflow-cron — 연차 발생 / 출퇴근 자동 마감 등 정기 작업 진입점.
//
// 사용 예:
//
//	# daemon 모드 (cron 표현식 따라 영속 실행, 모든 job 등록)
//	go run ./cmd/cron --job=all
//
//	# 한 번 실행 후 종료 (CI / 수동 백필)
//	go run ./cmd/cron --job=accrual --once
//	go run ./cmd/cron --job=auto-close --once
//
//	# dry-run: write 없이 로그만
//	go run ./cmd/cron --job=auto-close --once --dry-run
package main

import (
	"context"
	"flag"
	"fmt"
	"log/slog"
	"os"
	"os/signal"
	"syscall"

	"github.com/jackc/pgx/v5/pgxpool"

	"github.com/sjseo/docflow/backend/internal/config"
	dbq "github.com/sjseo/docflow/backend/internal/db/sqlc"
	"github.com/sjseo/docflow/backend/internal/hr/cron"
	"github.com/sjseo/docflow/backend/internal/hr/notification"
)

// autoCloseNotifierAdapter — notification.Service 를 cron.Notifier 로 어댑팅.
//
// cron 패키지는 cycle 회피를 위해 notification 패키지를 import 하지 않고 자체
// [cron.Notifier] 인터페이스를 정의한다. 본 어댑터가 main 부트스트랩 시점에
// 두 타입을 연결.
type autoCloseNotifierAdapter struct{ svc *notification.Service }

func (a autoCloseNotifierAdapter) Notify(ctx context.Context, tenantID, userID int64, n cron.AutoCloseNotification) error {
	return a.svc.Notify(ctx, tenantID, userID, notification.NewNotification{
		Type:       n.Type,
		Title:      n.Title,
		Body:       n.Body,
		RelatedURL: n.RelatedURL,
	})
}

func main() {
	logger := slog.New(slog.NewJSONHandler(os.Stdout, &slog.HandlerOptions{Level: slog.LevelInfo}))
	slog.SetDefault(logger)

	var (
		job    = flag.String("job", "all", "job name: accrual|auto-close|all")
		dryRun = flag.Bool("dry-run", false, "조회만 수행 + 예상 결과 로그 (write 안 함)")
		once   = flag.Bool("once", false, "한 번 실행 후 종료 (기본 false: daemon)")
	)
	flag.Parse()

	cfg := config.Load()
	logger.Info("docflow-cron starting",
		slog.String("env", cfg.Env),
		slog.Int64("tenant_id", cfg.TenantID),
		slog.String("job", *job),
		slog.Bool("dry_run", *dryRun),
		slog.Bool("once", *once),
	)

	if cfg.DatabaseURL == "" {
		logger.Error("DATABASE_URL is required for cron")
		os.Exit(1)
	}

	ctx, cancel := context.WithCancel(context.Background())
	defer cancel()

	pool, err := pgxpool.New(ctx, cfg.DatabaseURL)
	if err != nil {
		logger.Error("db pool open failed", slog.String("error", err.Error()))
		os.Exit(1)
	}
	defer pool.Close()
	if err := pool.Ping(ctx); err != nil {
		logger.Error("db ping failed", slog.String("error", err.Error()))
		os.Exit(1)
	}
	queries := dbq.New(pool)

	// Job 빌더 — flag --job 값에 따라 등록할 job 선택.
	type registeredJob struct {
		name    string
		adapter cron.Job
	}
	var jobs []registeredJob

	if *job == "accrual" || *job == "all" {
		accrualJob := cron.NewAccrualJob(cron.AccrualJobConfig{
			Store: queries, Logger: logger, TenantID: cfg.TenantID, DryRun: *dryRun,
		})
		jobs = append(jobs, registeredJob{
			name:    "accrual",
			adapter: cron.AccrualJobAdapter{Inner: accrualJob, Locker: queries, Logger: logger},
		})
	}
	if *job == "auto-close" || *job == "all" {
		// Sprint 8: notification service 주입 — 마감된 row 마다 본인에게 인앱 알림.
		notifSvc := notification.NewService(queries)
		autoCloseJob := cron.NewAutoCloseJob(cron.AutoCloseJobConfig{
			Store: queries, Logger: logger, TenantID: cfg.TenantID, DryRun: *dryRun,
			Notifier: autoCloseNotifierAdapter{svc: notifSvc},
		})
		jobs = append(jobs, registeredJob{
			name:    "auto-close",
			adapter: cron.AutoCloseJobAdapter{Inner: autoCloseJob, Locker: queries, Logger: logger},
		})
	}

	if len(jobs) == 0 {
		logger.Error("unknown job", slog.String("job", *job))
		os.Exit(1)
	}

	if *once {
		for _, j := range jobs {
			logger.Info("cron: once-run", slog.String("job", j.name))
			if err := j.adapter.Run(ctx); err != nil {
				logger.Error("cron: once-run failed", slog.String("job", j.name), slog.String("error", err.Error()))
				os.Exit(1)
			}
		}
		logger.Info("docflow-cron once-run done")
		return
	}

	// daemon 모드 — scheduler 에 등록 후 SIGTERM 까지 대기.
	adapters := make([]cron.Job, 0, len(jobs))
	for _, j := range jobs {
		adapters = append(adapters, j.adapter)
	}
	scheduler, err := cron.NewScheduler(logger, adapters...)
	if err != nil {
		logger.Error("scheduler build failed", slog.String("error", err.Error()))
		os.Exit(1)
	}
	scheduler.Start()
	logger.Info(fmt.Sprintf("docflow-cron daemon started (%d jobs)", len(jobs)))

	stop := make(chan os.Signal, 1)
	signal.Notify(stop, syscall.SIGINT, syscall.SIGTERM)
	<-stop

	logger.Info("docflow-cron stopping")
	stopCtx := scheduler.Stop()
	<-stopCtx.Done()
	logger.Info("docflow-cron stopped")
}
