package middleware

import (
	"net/http"

	"github.com/gin-gonic/gin"
	"github.com/google/uuid"
	"github.com/seosangjun/docflow/backend/internal/auth"
)

const (
	contextUserID   = "user_id"
	contextTenantID = "tenant_id"
	contextRole     = "role"
)

func AuthMiddleware(jwtManager *auth.JWTManager) gin.HandlerFunc {
	return func(c *gin.Context) {
		tokenStr, err := c.Cookie("access_token")
		if err != nil {
			c.AbortWithStatusJSON(http.StatusUnauthorized, gin.H{
				"error": gin.H{"code": "INVALID_TOKEN", "message": "인증이 필요합니다"},
			})
			return
		}

		claims, err := jwtManager.ValidateAccessToken(tokenStr)
		if err != nil {
			c.AbortWithStatusJSON(http.StatusUnauthorized, gin.H{
				"error": gin.H{"code": "TOKEN_EXPIRED", "message": "토큰이 만료되었습니다"},
			})
			return
		}

		c.Set(contextUserID, claims.UserID)
		c.Set(contextTenantID, claims.TenantID)
		c.Set(contextRole, claims.Role)
		c.Next()
	}
}

func GetUserID(c *gin.Context) uuid.UUID {
	val, _ := c.Get(contextUserID)
	return val.(uuid.UUID)
}

func GetTenantID(c *gin.Context) uuid.UUID {
	val, _ := c.Get(contextTenantID)
	return val.(uuid.UUID)
}

func GetRole(c *gin.Context) string {
	val, _ := c.Get(contextRole)
	return val.(string)
}
