package config_test

import (
	"testing"

	"github.com/sjseo/docflow/backend/internal/config"
)

// TestLoad_Defaults: 모든 env 미설정 시 안전한 기본값.
func TestLoad_Defaults(t *testing.T) {
	t.Setenv("DOCFLOW_ADDR", "")
	t.Setenv("DATABASE_URL", "")
	t.Setenv("DOCFLOW_TENANT_ID", "")
	t.Setenv("DOCFLOW_ENV", "")

	cfg := config.Load()
	if cfg.Addr != ":8080" {
		t.Fatalf("Addr default = %q, want \":8080\"", cfg.Addr)
	}
	if cfg.DatabaseURL != "" {
		t.Fatalf("DatabaseURL default = %q, want \"\"", cfg.DatabaseURL)
	}
	if cfg.TenantID != 1 {
		t.Fatalf("TenantID default = %d, want 1", cfg.TenantID)
	}
	if cfg.Env != "dev" {
		t.Fatalf("Env default = %q, want \"dev\"", cfg.Env)
	}
}

// TestLoad_FromEnv: env 우선.
func TestLoad_FromEnv(t *testing.T) {
	t.Setenv("DOCFLOW_ADDR", ":9090")
	t.Setenv("DATABASE_URL", "postgres://x")
	t.Setenv("DOCFLOW_TENANT_ID", "7")
	t.Setenv("DOCFLOW_ENV", "staging")

	cfg := config.Load()
	if cfg.Addr != ":9090" || cfg.DatabaseURL != "postgres://x" || cfg.TenantID != 7 || cfg.Env != "staging" {
		t.Fatalf("cfg = %+v", cfg)
	}
}

// TestLoad_InvalidTenantIDFallsBack: 파싱 실패 시 기본값.
func TestLoad_InvalidTenantIDFallsBack(t *testing.T) {
	t.Setenv("DOCFLOW_TENANT_ID", "not-a-number")
	cfg := config.Load()
	if cfg.TenantID != 1 {
		t.Fatalf("TenantID = %d, want 1 (fallback)", cfg.TenantID)
	}
}
