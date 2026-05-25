// Package config — Sprint 1 Red 단계 stub. 구현은 Green 커밋에서 채운다.
package config

// Config — 런타임 환경 설정.
type Config struct {
	Addr        string
	DatabaseURL string
	TenantID    int64
	Env         string
}

// Load — Red stub.
func Load() Config {
	return Config{}
}
