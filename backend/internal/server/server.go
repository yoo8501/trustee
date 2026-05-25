// Package server — Sprint 1 Red 단계 stub. 구현은 Green 커밋에서 채운다.
package server

import (
	"errors"

	"github.com/gin-gonic/gin"
)

// Config — 서버 부트스트랩 설정.
type Config struct {
	TenantID int64
}

// NewEngine — Red stub: 아직 구현되지 않음.
func NewEngine(_ Config) (*gin.Engine, error) {
	return nil, errors.New("server.NewEngine: not yet implemented")
}
