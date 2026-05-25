// Package config — 환경 변수 기반 런타임 설정 로딩.
//
// secret 은 코드/문서/git 에 절대 커밋 금지 (CLAUDE.md §3.10).
// 본 패키지는 환경 변수에서만 읽고, 누락 시 안전한 기본값을 사용한다.
package config

import (
	"os"
	"strconv"
)

// Config — 런타임 환경 설정.
type Config struct {
	// Addr 는 HTTP 서버 bind 주소. 기본 ":8080".
	Addr string
	// DatabaseURL 은 PostgreSQL DSN. 미설정 시 빈 문자열 (Sprint 1 에선 옵셔널).
	DatabaseURL string
	// TenantID 는 단일 조직 운영 단계의 기본 tenant id. 기본 1.
	TenantID int64
	// Env 는 실행 환경 식별자 (dev / staging / prod). 기본 "dev".
	Env string
	// JWTSecret 은 access / refresh 서명 키. 운영에선 필수, 미설정 시 main start fatal.
	// 개발 편의를 위해 dev 환경에선 안전한 기본값 fallback 을 허용한다.
	JWTSecret string
}

// Load 는 환경 변수에서 Config 를 읽는다.
//
// 인식 변수:
//   - DOCFLOW_ADDR        (default ":8080")
//   - DATABASE_URL        (default "")
//   - DOCFLOW_TENANT_ID   (default 1)
//   - DOCFLOW_ENV         (default "dev")
//   - JWT_SECRET          (default "" — dev 외에는 main 에서 fatal 검증)
func Load() Config {
	return Config{
		Addr:        getEnvDefault("DOCFLOW_ADDR", ":8080"),
		DatabaseURL: os.Getenv("DATABASE_URL"),
		TenantID:    getEnvInt64Default("DOCFLOW_TENANT_ID", 1),
		Env:         getEnvDefault("DOCFLOW_ENV", "dev"),
		JWTSecret:   os.Getenv("JWT_SECRET"),
	}
}

func getEnvDefault(key, fallback string) string {
	if v := os.Getenv(key); v != "" {
		return v
	}
	return fallback
}

func getEnvInt64Default(key string, fallback int64) int64 {
	v := os.Getenv(key)
	if v == "" {
		return fallback
	}
	n, err := strconv.ParseInt(v, 10, 64)
	if err != nil {
		return fallback
	}
	return n
}
