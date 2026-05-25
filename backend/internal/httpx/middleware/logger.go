package middleware

import (
	"log/slog"
	"time"

	"github.com/gin-gonic/gin"
)

// Logger 미들웨어는 매 요청을 구조화 로그로 기록한다.
//
// 필드:
//   - method, path, status, latency_ms, client_ip, request_id
//
// 본 미들웨어는 RequestID 미들웨어 뒤에 등록한다 (request_id 가 context 에 있어야 함).
func Logger(logger *slog.Logger) gin.HandlerFunc {
	if logger == nil {
		logger = slog.Default()
	}
	return func(c *gin.Context) {
		start := time.Now()
		c.Next()

		latency := time.Since(start)
		reqID := RequestIDFrom(c.Request.Context())

		path := c.Request.URL.Path
		if raw := c.Request.URL.RawQuery; raw != "" {
			path = path + "?" + raw
		}

		// Gin 의 c.Errors 에는 핸들러가 c.Error(err) 로 push 한 에러가 쌓인다.
		// 응답 body 에는 raw 에러를 노출하지 않지만, 로그에는 안전하게 남긴다.
		errMsg := ""
		if len(c.Errors) > 0 {
			errMsg = c.Errors.String()
		}

		logger.LogAttrs(c.Request.Context(), slog.LevelInfo, "http_request",
			slog.String("method", c.Request.Method),
			slog.String("path", path),
			slog.Int("status", c.Writer.Status()),
			slog.Int64("latency_ms", latency.Milliseconds()),
			slog.String("client_ip", c.ClientIP()),
			slog.String("request_id", reqID),
			slog.String("error", errMsg),
		)
	}
}
