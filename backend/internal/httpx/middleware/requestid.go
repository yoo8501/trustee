// Package middleware — Gin 미들웨어 모음 (request_id, tenant, logger, recover).
package middleware

import (
	"context"

	"github.com/gin-gonic/gin"
	"github.com/google/uuid"
)

// requestIDHeader 는 외부와 주고받는 request id 헤더 이름.
const requestIDHeader = "X-Request-ID"

// requestIDKey 는 context.Context 에 request id 를 저장할 때 사용하는 키.
type requestIDKey struct{}

// RequestID 미들웨어는 요청마다 request id 를 보장한다.
//
//   - 요청에 X-Request-ID 헤더가 있으면 그대로 사용.
//   - 없으면 UUID v4 생성.
//
// 응답에도 동일한 헤더로 echo 하며, context.Context 에 주입하여
// 하위 핸들러/로거가 RequestIDFrom 으로 조회할 수 있게 한다.
func RequestID() gin.HandlerFunc {
	return func(c *gin.Context) {
		id := c.GetHeader(requestIDHeader)
		if id == "" {
			id = uuid.NewString()
		}
		c.Writer.Header().Set(requestIDHeader, id)

		ctx := context.WithValue(c.Request.Context(), requestIDKey{}, id)
		c.Request = c.Request.WithContext(ctx)

		c.Next()
	}
}

// RequestIDFrom 은 context.Context 에서 request id 를 꺼낸다. 없으면 "".
func RequestIDFrom(ctx context.Context) string {
	if ctx == nil {
		return ""
	}
	if v, ok := ctx.Value(requestIDKey{}).(string); ok {
		return v
	}
	return ""
}
