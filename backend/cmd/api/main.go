// docflow-api — Gin HTTP 서버 진입점.
//
// 절차:
//  1. slog 기본 logger 를 JSON handler 로 교체
//  2. 환경 변수에서 Config 로드
//  3. (있다면) PostgreSQL pool 생성 + ping — 도메인 라우트 (auth/users/teams) 등록에 필수
//  4. JWT secret 검증 (운영 환경에서 비어 있으면 fatal)
//  5. server.NewEngine 으로 라우터 구성 후 ListenAndServe
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

	"github.com/jackc/pgx/v5/pgxpool"

	"github.com/sjseo/docflow/backend/internal/auth"
	"github.com/sjseo/docflow/backend/internal/config"
	dbq "github.com/sjseo/docflow/backend/internal/db/sqlc"
	"github.com/sjseo/docflow/backend/internal/server"
)

// devFallbackJWTSecret — dev 환경 전용 fallback. 운영/staging 에선 main 이 fatal.
// 운영 secret 은 반드시 환경변수 JWT_SECRET 으로 주입한다 (CLAUDE.md §3.10).
const devFallbackJWTSecret = "docflow-dev-jwt-secret-do-not-use-in-prod"

func main() {
	logger := slog.New(slog.NewJSONHandler(os.Stdout, &slog.HandlerOptions{Level: slog.LevelInfo}))
	slog.SetDefault(logger)

	cfg := config.Load()
	logger.Info("docflow-api starting",
		slog.String("addr", cfg.Addr),
		slog.String("env", cfg.Env),
		slog.Int64("tenant_id", cfg.TenantID),
		slog.Bool("db_configured", cfg.DatabaseURL != ""),
		slog.Bool("jwt_secret_configured", cfg.JWTSecret != ""),
	)

	// JWT secret 검증.
	jwtSecret := resolveJWTSecret(logger, cfg)

	// DB pool 생성 (있을 때).
	var pool *pgxpool.Pool
	if cfg.DatabaseURL != "" {
		p, err := openPool(logger, cfg.DatabaseURL)
		if err == nil {
			pool = p
			defer pool.Close()
		}
	}

	engineCfg := server.Config{
		TenantID:  cfg.TenantID,
		Logger:    logger,
		JWTIssuer: auth.NewTokenIssuer(jwtSecret),
	}
	if pool != nil {
		engineCfg.Store = dbq.New(pool)
		engineCfg.Pool = pool
	}

	eng, err := server.NewEngine(engineCfg)
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

// resolveJWTSecret — JWT_SECRET 값을 결정한다.
//
//   - 명시 secret 이 있으면 그대로 사용.
//   - 없는데 env=prod/staging 이면 즉시 os.Exit(1) (운영 안전 — CLAUDE.md §3.10).
//   - 없는데 env=dev 면 경고 + 고정 fallback 사용.
func resolveJWTSecret(logger *slog.Logger, cfg config.Config) string {
	if cfg.JWTSecret != "" {
		return cfg.JWTSecret
	}
	if cfg.Env == "prod" || cfg.Env == "staging" {
		logger.Error("JWT_SECRET is required in non-dev environments",
			slog.String("env", cfg.Env))
		os.Exit(1)
	}
	logger.Warn("JWT_SECRET not set — using insecure dev fallback (DO NOT USE IN PROD)")
	return devFallbackJWTSecret
}

// openPool 은 시작 시 한 번 DB pool 을 만들고 ping 한다. 실패는 경고만 남기고 nil 반환.
// 도메인 라우트는 pool 이 nil 이면 등록되지 않는다 (Sprint 1 호환).
func openPool(logger *slog.Logger, dsn string) (*pgxpool.Pool, error) {
	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()

	pool, err := pgxpool.New(ctx, dsn)
	if err != nil {
		logger.Warn("db pool open failed (will continue without DB)", slog.String("error", err.Error()))
		return nil, err
	}
	if err := pool.Ping(ctx); err != nil {
		logger.Warn("db ping failed (will continue without DB)", slog.String("error", err.Error()))
		pool.Close()
		return nil, err
	}
	logger.Info("db pool ready")
	return pool, nil
}
