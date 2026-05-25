package auth

import "errors"

// Sentinel error 모음. handler / 미들웨어가 ErrorCode 매핑에 사용한다.
var (
	// ErrEmptyPassword — 빈 패스워드 hash 시도.
	ErrEmptyPassword = errors.New("auth: empty password")

	// ErrEmailDuplicate — 이미 존재하는 email 회원가입.
	ErrEmailDuplicate = errors.New("auth: email already registered")

	// ErrInvalidCredentials — 로그인 시 email/password 불일치.
	ErrInvalidCredentials = errors.New("auth: invalid credentials")

	// ErrUserTerminated — terminated 상태 user 의 로그인 시도.
	ErrUserTerminated = errors.New("auth: user terminated")

	// ErrTokenInvalid — 토큰 서명/형식 불일치.
	ErrTokenInvalid = errors.New("auth: token invalid")

	// ErrTokenExpired — 토큰 만료.
	ErrTokenExpired = errors.New("auth: token expired")

	// ErrTokenRevoked — token_version mismatch (logout 등으로 무효화됨).
	ErrTokenRevoked = errors.New("auth: token revoked")

	// ErrTokenTypeMismatch — access 자리에 refresh 가, refresh 자리에 access 가 사용된 경우.
	ErrTokenTypeMismatch = errors.New("auth: token type mismatch")

	// ErrRefreshNotFound — refresh jti 가 DB 에 없음.
	ErrRefreshNotFound = errors.New("auth: refresh not found")

	// ErrRefreshReused — refresh 1회용 회전 위반 (이미 used 된 jti 재사용).
	ErrRefreshReused = errors.New("auth: refresh reused")
)
