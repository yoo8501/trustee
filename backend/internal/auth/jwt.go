package auth

import (
	"errors"
	"fmt"
	"time"

	"github.com/golang-jwt/jwt/v5"
	"github.com/google/uuid"

	"github.com/sjseo/docflow/backend/internal/permission"
)

// 토큰 type 식별자 — claims.typ 필드에 들어간다.
const (
	TokenTypeAccess  = "access"
	TokenTypeRefresh = "refresh"
)

// 기본 TTL.
const (
	AccessTokenTTL  = 1 * time.Hour
	RefreshTokenTTL = 30 * 24 * time.Hour
)

// Claims — DocFlow access / refresh 공통 claims.
//
// 표준 RegisteredClaims (exp, iat, jti, sub) + 도메인 필드 (tenant_id, role, token_version, typ).
// access 와 refresh 는 typ 으로만 구분한다.
type Claims struct {
	TenantID     int64           `json:"tenant_id"`
	Role         permission.Role `json:"role"`
	TokenVersion int32           `json:"token_version"`
	Type         string          `json:"typ"`
	jwt.RegisteredClaims
}

// UserID 는 sub 를 int64 로 파싱. 실패 시 0, error.
func (c *Claims) UserID() (int64, error) {
	if c == nil || c.Subject == "" {
		return 0, errors.New("claims: sub missing")
	}
	var id int64
	if _, err := fmt.Sscanf(c.Subject, "%d", &id); err != nil {
		return 0, fmt.Errorf("claims: sub parse: %w", err)
	}
	return id, nil
}

// TokenIssuer — access / refresh 토큰 발급.
type TokenIssuer struct {
	secret []byte
	now    func() time.Time
}

// NewTokenIssuer 는 HMAC-SHA256 서명용 secret 으로 issuer 를 만든다.
// secret 이 비어 있으면 panic — 운영 안전.
func NewTokenIssuer(secret string) *TokenIssuer {
	if secret == "" {
		panic("auth.NewTokenIssuer: secret must be non-empty")
	}
	return &TokenIssuer{secret: []byte(secret), now: time.Now}
}

// WithClock 은 테스트용 — issuer 의 시계를 교체한다.
func (i *TokenIssuer) WithClock(now func() time.Time) *TokenIssuer {
	cp := *i
	cp.now = now
	return &cp
}

// IssueAccess — access 토큰 발급. TTL=AccessTokenTTL.
func (i *TokenIssuer) IssueAccess(userID, tenantID int64, role permission.Role, tokenVersion int32) (string, error) {
	now := i.now()
	c := Claims{
		TenantID:     tenantID,
		Role:         role,
		TokenVersion: tokenVersion,
		Type:         TokenTypeAccess,
		RegisteredClaims: jwt.RegisteredClaims{
			Subject:   fmt.Sprintf("%d", userID),
			IssuedAt:  jwt.NewNumericDate(now),
			ExpiresAt: jwt.NewNumericDate(now.Add(AccessTokenTTL)),
		},
	}
	return i.sign(c)
}

// IssueRefresh — refresh 토큰 발급. jti 를 새로 생성하여 같이 반환한다
// (호출자가 refresh_tokens 테이블에 저장).
func (i *TokenIssuer) IssueRefresh(userID, tenantID int64, role permission.Role, tokenVersion int32) (token string, jti uuid.UUID, expiresAt time.Time, err error) {
	now := i.now()
	jti = uuid.New()
	expiresAt = now.Add(RefreshTokenTTL)
	c := Claims{
		TenantID:     tenantID,
		Role:         role,
		TokenVersion: tokenVersion,
		Type:         TokenTypeRefresh,
		RegisteredClaims: jwt.RegisteredClaims{
			Subject:   fmt.Sprintf("%d", userID),
			IssuedAt:  jwt.NewNumericDate(now),
			ExpiresAt: jwt.NewNumericDate(expiresAt),
			ID:        jti.String(),
		},
	}
	token, err = i.sign(c)
	return
}

func (i *TokenIssuer) sign(c Claims) (string, error) {
	t := jwt.NewWithClaims(jwt.SigningMethodHS256, c)
	return t.SignedString(i.secret)
}

// Verify — 서명 / 만료 / typ 검증. 성공 시 *Claims 반환.
// expectedType 이 ""(빈문자열) 이면 typ 검증을 건너뛴다.
func (i *TokenIssuer) Verify(tokenStr, expectedType string) (*Claims, error) {
	if tokenStr == "" {
		return nil, ErrTokenInvalid
	}

	parser := jwt.NewParser(jwt.WithTimeFunc(i.now))
	tok, err := parser.ParseWithClaims(tokenStr, &Claims{}, func(t *jwt.Token) (any, error) {
		if _, ok := t.Method.(*jwt.SigningMethodHMAC); !ok {
			return nil, ErrTokenInvalid
		}
		return i.secret, nil
	})
	if err != nil {
		if errors.Is(err, jwt.ErrTokenExpired) {
			return nil, ErrTokenExpired
		}
		return nil, ErrTokenInvalid
	}
	if !tok.Valid {
		return nil, ErrTokenInvalid
	}
	claims, ok := tok.Claims.(*Claims)
	if !ok {
		return nil, ErrTokenInvalid
	}
	if expectedType != "" && claims.Type != expectedType {
		return nil, ErrTokenTypeMismatch
	}
	return claims, nil
}
