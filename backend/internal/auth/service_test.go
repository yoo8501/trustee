package auth_test

import (
	"context"
	"errors"
	"testing"
	"time"

	"github.com/sjseo/docflow/backend/internal/auth"
	dbq "github.com/sjseo/docflow/backend/internal/db/sqlc"
)

func newService(t *testing.T) (*auth.Service, *fakeStore) {
	t.Helper()
	store := newFakeStore()
	issuer := auth.NewTokenIssuer(testSecret)
	return auth.NewService(store, issuer, 1), store
}

func TestService_Register_Success(t *testing.T) {
	svc, store := newService(t)
	u, err := svc.Register(context.Background(), auth.RegisterInput{
		Email: "Alice@example.com", Password: "Sup3rSecret!", Name: "Alice",
	})
	if err != nil {
		t.Fatalf("Register failed: %v", err)
	}
	if u.ID == 0 {
		t.Fatal("ID = 0")
	}
	if u.Email != "alice@example.com" {
		t.Fatalf("Email lowercased? got %q", u.Email)
	}
	if u.Role != dbq.UserRoleGeneral {
		t.Fatalf("default role should be general, got %q", u.Role)
	}
	if u.Status != dbq.UserStatusActive {
		t.Fatalf("default status should be active, got %q", u.Status)
	}
	if !auth.VerifyPassword(u.PasswordHash, "Sup3rSecret!") {
		t.Fatal("password not hashed correctly")
	}

	if len(store.users) != 1 {
		t.Fatalf("expected 1 user in store, got %d", len(store.users))
	}
}

func TestService_Register_DuplicateEmail(t *testing.T) {
	svc, _ := newService(t)
	in := auth.RegisterInput{Email: "dup@example.com", Password: "Pass1234", Name: "Dup"}
	if _, err := svc.Register(context.Background(), in); err != nil {
		t.Fatalf("first register failed: %v", err)
	}
	_, err := svc.Register(context.Background(), in)
	if !errors.Is(err, auth.ErrEmailDuplicate) {
		t.Fatalf("err = %v, want ErrEmailDuplicate", err)
	}
}

func TestService_Login_Success(t *testing.T) {
	svc, _ := newService(t)
	_, _ = svc.Register(context.Background(), auth.RegisterInput{
		Email: "u@example.com", Password: "Pass1234", Name: "U",
	})

	pair, user, err := svc.Login(context.Background(), "u@example.com", "Pass1234")
	if err != nil {
		t.Fatalf("Login failed: %v", err)
	}
	if pair.AccessToken == "" || pair.RefreshToken == "" {
		t.Fatal("token pair empty")
	}
	if pair.ExpiresIn <= 0 {
		t.Fatal("expires_in should be positive")
	}
	if user.Email != "u@example.com" {
		t.Fatalf("user email = %q", user.Email)
	}
}

func TestService_Login_InvalidPassword(t *testing.T) {
	svc, _ := newService(t)
	_, _ = svc.Register(context.Background(), auth.RegisterInput{
		Email: "u@example.com", Password: "Pass1234", Name: "U",
	})

	_, _, err := svc.Login(context.Background(), "u@example.com", "wrong")
	if !errors.Is(err, auth.ErrInvalidCredentials) {
		t.Fatalf("err = %v, want ErrInvalidCredentials", err)
	}
}

func TestService_Login_UnknownEmail(t *testing.T) {
	svc, _ := newService(t)
	_, _, err := svc.Login(context.Background(), "nope@example.com", "whatever")
	if !errors.Is(err, auth.ErrInvalidCredentials) {
		t.Fatalf("err = %v, want ErrInvalidCredentials", err)
	}
}

func TestService_Login_Terminated(t *testing.T) {
	svc, store := newService(t)
	u, _ := svc.Register(context.Background(), auth.RegisterInput{
		Email: "ex@example.com", Password: "Pass1234", Name: "Ex",
	})
	// 직접 terminated 로 변경 (UpdateUser).
	stored := store.users[u.ID]
	stored.Status = dbq.UserStatusTerminated
	store.users[u.ID] = stored

	_, _, err := svc.Login(context.Background(), "ex@example.com", "Pass1234")
	if !errors.Is(err, auth.ErrUserTerminated) {
		t.Fatalf("err = %v, want ErrUserTerminated", err)
	}
}

func TestService_Refresh_RotatesAndInvalidatesOld(t *testing.T) {
	svc, _ := newService(t)
	_, _ = svc.Register(context.Background(), auth.RegisterInput{
		Email: "u@example.com", Password: "Pass1234", Name: "U",
	})
	pair, _, err := svc.Login(context.Background(), "u@example.com", "Pass1234")
	if err != nil {
		t.Fatal(err)
	}

	// 첫 번째 refresh 호출 — 성공.
	newPair, err := svc.Refresh(context.Background(), pair.RefreshToken)
	if err != nil {
		t.Fatalf("first Refresh failed: %v", err)
	}
	if newPair.RefreshToken == pair.RefreshToken {
		t.Fatal("new refresh equals old (rotation failed)")
	}
	// access 토큰은 같은 초에 발급되면 jti 없으므로 동일한 페이로드 → 같은 문자열일 수 있다.
	// 핵심 invariant 는 refresh 회전. access 동일성 자체는 의미 없음.

	// 같은 refresh 토큰을 다시 사용 → reuse 감지.
	_, err = svc.Refresh(context.Background(), pair.RefreshToken)
	if !errors.Is(err, auth.ErrRefreshReused) {
		t.Fatalf("err = %v, want ErrRefreshReused", err)
	}

	// reuse 감지 후 token_version 증가 → 새 refresh 도 무효화되어야 함.
	_, err = svc.Refresh(context.Background(), newPair.RefreshToken)
	if !errors.Is(err, auth.ErrTokenRevoked) {
		t.Fatalf("err = %v, want ErrTokenRevoked", err)
	}
}

func TestService_Refresh_AccessTokenRejected(t *testing.T) {
	svc, _ := newService(t)
	_, _ = svc.Register(context.Background(), auth.RegisterInput{
		Email: "u@example.com", Password: "Pass1234", Name: "U",
	})
	pair, _, _ := svc.Login(context.Background(), "u@example.com", "Pass1234")
	_, err := svc.Refresh(context.Background(), pair.AccessToken)
	if !errors.Is(err, auth.ErrTokenTypeMismatch) {
		t.Fatalf("err = %v, want ErrTokenTypeMismatch", err)
	}
}

func TestService_Refresh_Expired(t *testing.T) {
	store := newFakeStore()
	past := func() time.Time { return time.Now().Add(-31 * 24 * time.Hour) }
	issuer := auth.NewTokenIssuer(testSecret).WithClock(past)
	svc := auth.NewService(store, issuer, 1).WithClock(past)

	_, _ = svc.Register(context.Background(), auth.RegisterInput{
		Email: "u@example.com", Password: "Pass1234", Name: "U",
	})
	pair, _, _ := svc.Login(context.Background(), "u@example.com", "Pass1234")

	// 현재 시계로 verify — refresh TTL 30d 이미 초과.
	freshIssuer := auth.NewTokenIssuer(testSecret)
	freshSvc := auth.NewService(store, freshIssuer, 1)
	_, err := freshSvc.Refresh(context.Background(), pair.RefreshToken)
	if !errors.Is(err, auth.ErrTokenExpired) {
		t.Fatalf("err = %v, want ErrTokenExpired", err)
	}
}

func TestService_Logout_InvalidatesAllTokens(t *testing.T) {
	svc, store := newService(t)
	user, _ := svc.Register(context.Background(), auth.RegisterInput{
		Email: "u@example.com", Password: "Pass1234", Name: "U",
	})
	pair, _, _ := svc.Login(context.Background(), "u@example.com", "Pass1234")

	if err := svc.Logout(context.Background(), user.ID, 1); err != nil {
		t.Fatalf("Logout failed: %v", err)
	}

	// 같은 refresh 사용 시 token_version mismatch → ErrTokenRevoked.
	_, err := svc.Refresh(context.Background(), pair.RefreshToken)
	if !errors.Is(err, auth.ErrTokenRevoked) {
		t.Fatalf("err = %v, want ErrTokenRevoked", err)
	}

	// store 의 token_version 이 0 → 1 로 증가.
	if store.users[user.ID].TokenVersion != 1 {
		t.Fatalf("token_version = %d, want 1", store.users[user.ID].TokenVersion)
	}
}
