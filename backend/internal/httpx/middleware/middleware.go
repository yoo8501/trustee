// Package middleware — Sprint 1 Red 단계 stub. 구현은 Green 커밋에서 채운다.
package middleware

import (
	"context"
	"log/slog"

	"github.com/gin-gonic/gin"
)

// RequestID — Red stub: no-op middleware.
func RequestID() gin.HandlerFunc {
	return func(c *gin.Context) {
		c.Next()
	}
}

// RequestIDFrom — Red stub: always "".
func RequestIDFrom(_ context.Context) string {
	return ""
}

// Tenant — Red stub: no-op.
func Tenant(_ int64) gin.HandlerFunc {
	return func(c *gin.Context) {
		c.Next()
	}
}

// TenantIDFrom — Red stub: always 0.
func TenantIDFrom(_ context.Context) int64 {
	return 0
}

// Logger — Red stub: no-op.
func Logger(_ *slog.Logger) gin.HandlerFunc {
	return func(c *gin.Context) {
		c.Next()
	}
}

// Recover — Red stub: no-op (so panic propagates).
func Recover() gin.HandlerFunc {
	return func(c *gin.Context) {
		c.Next()
	}
}
