package middleware

import (
	"context"

	"github.com/gin-gonic/gin"
)

// tenantIDKey — context.Context 에서 tenant id 를 저장하는 키.
type tenantIDKey struct{}

// Tenant 미들웨어는 요청 컨텍스트에 tenant id 를 주입한다.
//
// P4 (SaaS 다조직 전환) 이전까지는 단일 조직 운영이므로 호출자가 1 을 넘긴다.
// JWT 도입(Sprint 2) 후에는 토큰의 tenant claim 값을 우선 사용하도록 확장 예정.
func Tenant(defaultTenantID int64) gin.HandlerFunc {
	return func(c *gin.Context) {
		ctx := context.WithValue(c.Request.Context(), tenantIDKey{}, defaultTenantID)
		c.Request = c.Request.WithContext(ctx)
		c.Next()
	}
}

// TenantIDFrom 은 context.Context 에서 tenant id 를 꺼낸다. 없으면 0.
func TenantIDFrom(ctx context.Context) int64 {
	if ctx == nil {
		return 0
	}
	if v, ok := ctx.Value(tenantIDKey{}).(int64); ok {
		return v
	}
	return 0
}
