package auth

import (
	"errors"
	"net/http"
	"strings"

	"github.com/gin-gonic/gin"
	"github.com/jackc/pgx/v5"

	dbq "github.com/sjseo/docflow/backend/internal/db/sqlc"
	"github.com/sjseo/docflow/backend/internal/httpx/apiresult"
	"github.com/sjseo/docflow/backend/internal/httpx/errorcode"
	"github.com/sjseo/docflow/backend/internal/permission"
)

// Context keys — gin.Context 에 인증 정보를 저장한다.
const (
	ctxKeyUserID   = "auth:user_id"
	ctxKeyRole     = "auth:role"
	ctxKeyTenantID = "auth:tenant_id"
)

// Middleware — JWT access 토큰 검증 + role/tenant context 주입.
type Middleware struct {
	issuer *TokenIssuer
	store  Store
}

// NewMiddleware — issuer 와 store 로 미들웨어 생성. store 는 token_version DB lookup 용.
func NewMiddleware(issuer *TokenIssuer, store Store) *Middleware {
	return &Middleware{issuer: issuer, store: store}
}

// Required — Authorization: Bearer <token> 검증.
//
// 실패 시 401 + ErrorCode (UNAUTHENTICATED 또는 TOKEN_EXPIRED).
// 성공 시 c.Set(user_id / role / tenant_id) 후 다음 핸들러로.
func (m *Middleware) Required() gin.HandlerFunc {
	return func(c *gin.Context) {
		header := c.GetHeader("Authorization")
		token := extractBearer(header)
		if token == "" {
			respondUnauthenticated(c, "인증이 필요합니다.")
			return
		}

		claims, err := m.issuer.Verify(token, TokenTypeAccess)
		if err != nil {
			if errors.Is(err, ErrTokenExpired) {
				respondTokenExpired(c)
				return
			}
			respondUnauthenticated(c, "토큰이 유효하지 않습니다.")
			return
		}

		userID, err := claims.UserID()
		if err != nil {
			respondUnauthenticated(c, "토큰이 유효하지 않습니다.")
			return
		}

		// token_version 검증 — logout / 강제 무효화 즉시 반영.
		uv, err := m.store.GetUserTokenVersion(c.Request.Context(), dbq.GetUserTokenVersionParams{
			ID:       userID,
			TenantID: claims.TenantID,
		})
		if err != nil {
			if errors.Is(err, pgx.ErrNoRows) {
				respondUnauthenticated(c, "사용자가 존재하지 않습니다.")
				return
			}
			c.AbortWithStatusJSON(http.StatusInternalServerError, apiresult.Failure(
				"서버 오류가 발생했습니다.",
				&apiresult.ErrorDetails{ErrorCode: errorcode.InternalError},
			))
			return
		}
		if uv.Status == dbq.UserStatusTerminated {
			respondUnauthenticated(c, "비활성화된 사용자입니다.")
			return
		}
		if uv.TokenVersion != claims.TokenVersion {
			respondUnauthenticated(c, "세션이 만료되었습니다. 다시 로그인해 주세요.")
			return
		}

		c.Set(ctxKeyUserID, userID)
		c.Set(ctxKeyRole, permission.Role(uv.Role))
		c.Set(ctxKeyTenantID, claims.TenantID)
		c.Next()
	}
}

// RequireRole — 인증된 사용자 중 지정한 role 만 통과. Required() 미들웨어 뒤에 체이닝.
func (m *Middleware) RequireRole(roles ...permission.Role) gin.HandlerFunc {
	return func(c *gin.Context) {
		current, ok := RoleFrom(c)
		if !ok {
			respondUnauthenticated(c, "인증이 필요합니다.")
			return
		}
		if !permission.In(current, roles...) {
			c.AbortWithStatusJSON(http.StatusForbidden, apiresult.Failure(
				"권한이 없습니다.",
				&apiresult.ErrorDetails{ErrorCode: errorcode.Forbidden},
			))
			return
		}
		c.Next()
	}
}

// RequireAtLeast — 지정한 role 이상의 권한만 통과.
func (m *Middleware) RequireAtLeast(min permission.Role) gin.HandlerFunc {
	return func(c *gin.Context) {
		current, ok := RoleFrom(c)
		if !ok {
			respondUnauthenticated(c, "인증이 필요합니다.")
			return
		}
		if !permission.AtLeast(current, min) {
			c.AbortWithStatusJSON(http.StatusForbidden, apiresult.Failure(
				"권한이 없습니다.",
				&apiresult.ErrorDetails{ErrorCode: errorcode.Forbidden},
			))
			return
		}
		c.Next()
	}
}

// UserIDFrom — gin.Context 에 주입된 user id 조회. 없으면 (0, false).
func UserIDFrom(c *gin.Context) (int64, bool) {
	v, ok := c.Get(ctxKeyUserID)
	if !ok {
		return 0, false
	}
	id, ok := v.(int64)
	return id, ok
}

// RoleFrom — gin.Context 에 주입된 role 조회.
func RoleFrom(c *gin.Context) (permission.Role, bool) {
	v, ok := c.Get(ctxKeyRole)
	if !ok {
		return "", false
	}
	r, ok := v.(permission.Role)
	return r, ok
}

// TenantIDFrom — gin.Context 에 주입된 tenant id 조회.
func TenantIDFrom(c *gin.Context) (int64, bool) {
	v, ok := c.Get(ctxKeyTenantID)
	if !ok {
		return 0, false
	}
	id, ok := v.(int64)
	return id, ok
}

// extractBearer — "Bearer <token>" 형식 파싱. 형식이 다르면 "".
func extractBearer(header string) string {
	if header == "" {
		return ""
	}
	parts := strings.SplitN(header, " ", 2)
	if len(parts) != 2 || !strings.EqualFold(parts[0], "Bearer") {
		return ""
	}
	return strings.TrimSpace(parts[1])
}

func respondUnauthenticated(c *gin.Context, msg string) {
	c.AbortWithStatusJSON(http.StatusUnauthorized, apiresult.Failure(
		msg,
		&apiresult.ErrorDetails{ErrorCode: errorcode.Unauthenticated},
	))
}

func respondTokenExpired(c *gin.Context) {
	c.AbortWithStatusJSON(http.StatusUnauthorized, apiresult.Failure(
		"토큰이 만료되었습니다.",
		&apiresult.ErrorDetails{ErrorCode: errorcode.TokenExpired},
	))
}
