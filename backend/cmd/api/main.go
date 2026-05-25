// docflow-api — Gin HTTP 서버 진입점.
//
// 절차:
//  1. slog 기본 logger 를 JSON handler 로 교체
//  2. 환경 변수에서 Config 로드
//  3. (있다면) PostgreSQL ping — 실패해도 서버 기동은 막지 않음 (Sprint 1)
//  4. server.NewEngine 으로 라우터 구성 후 ListenAndServe
package main

import (
	"context"
	"errors"
	"log/slog"
	"net/http"
	"os"
	"os/signal"
	"syscall"
	"time"

	"github.com/jackc/pgx/v5"

	"github.com/sjseo/docflow/backend/internal/config"
	"github.com/sjseo/docflow/backend/internal/server"
)

func main() {
	logger := slog.New(slog.NewJSONHandler(os.Stdout, &slog.HandlerOptions{Level: slog.LevelInfo}))
	slog.SetDefault(logger)

	cfg := config.Load()
	logger.Info("docflow-api starting",
		slog.String("addr", cfg.Addr),
		slog.String("env", cfg.Env),
		slog.Int64("tenant_id", cfg.TenantID),
		slog.Bool("db_configured", cfg.DatabaseURL != ""),
	)

	// DB ping — 실패는 경고만. Sprint 1 헬스체크는 DB 무관.
	if cfg.DatabaseURL != "" {
		pingDB(logger, cfg.DatabaseURL)
	}

	eng, err := server.NewEngine(server.Config{
		TenantID: cfg.TenantID,
		Logger:   logger,
	})
	if err != nil {
		logger.Error("server.NewEngine failed", slog.String("error", err.Error()))
		os.Exit(1)
	}

	srv := &http.Server{
		Addr:              cfg.Addr,
		Handler:           eng,
		ReadHeaderTimeout: 10 * time.Second,
	}

	// graceful shutdown.
	go func() {
		if err := srv.ListenAndServe(); err != nil && !errors.Is(err, http.ErrServerClosed) {
			logger.Error("http server crashed", slog.String("error", err.Error()))
			os.Exit(1)
		}
	}()
	logger.Info("docflow-api listening", slog.String("addr", cfg.Addr))

	stop := make(chan os.Signal, 1)
	signal.Notify(stop, syscall.SIGINT, syscall.SIGTERM)
	<-stop

	shutdownCtx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
	defer cancel()
	if err := srv.Shutdown(shutdownCtx); err != nil {
		logger.Error("shutdown error", slog.String("error", err.Error()))
	}
	logger.Info("docflow-api stopped")
}

// pingDB 는 시작 시 한 번만 DB 연결을 확인한다. 실패는 경고로만 남기고 서버는 계속 기동한다.
// Sprint 2 이후 도메인 핸들러가 DB 의존 시 이 정책을 재검토한다.
func pingDB(logger *slog.Logger, dsn string) {
	ctx, cancel := context.WithTimeout(context.Background(), 3*time.Second)
	defer cancel()

	conn, err := pgx.Connect(ctx, dsn)
	if err != nil {
		logger.Warn("db connect failed (will continue)", slog.String("error", err.Error()))
		return
	}
	defer func() { _ = conn.Close(ctx) }()

	if err := conn.Ping(ctx); err != nil {
		logger.Warn("db ping failed (will continue)", slog.String("error", err.Error()))
		return
	}
	logger.Info("db ping ok")
}
