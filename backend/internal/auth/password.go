// Package auth — 인증 / 인가 (JWT 발급/검증, password hash, 미들웨어, 핸들러).
package auth

import "golang.org/x/crypto/bcrypt"

// bcryptCost — CLAUDE.md §3.10 / plan.md 권한 보안 가이드. 12 = 운영 권장 최소치.
const bcryptCost = 12

// HashPassword 는 평문 비밀번호를 bcrypt 해시 (cost 12) 한다.
func HashPassword(plain string) (string, error) {
	if plain == "" {
		return "", ErrEmptyPassword
	}
	h, err := bcrypt.GenerateFromPassword([]byte(plain), bcryptCost)
	if err != nil {
		return "", err
	}
	return string(h), nil
}

// VerifyPassword 는 평문이 해시와 일치하는지 확인. mismatch 시 false.
func VerifyPassword(hash, plain string) bool {
	if hash == "" || plain == "" {
		return false
	}
	return bcrypt.CompareHashAndPassword([]byte(hash), []byte(plain)) == nil
}
