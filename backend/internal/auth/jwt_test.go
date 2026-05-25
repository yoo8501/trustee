package auth_test

import (
	"errors"
	"strings"
	"testing"
	"time"

	"github.com/sjseo/docflow/backend/internal/auth"
	"github.com/sjseo/docflow/backend/internal/permission"
)

const testSecret = "test-secret-please-ignore"

func TestNewTokenIssuer_EmptySecretPanics(t *testing.T) {
	defer func() {
		if r := recover(); r == nil {
			t.Fatal("NewTokenIssuer(\"\") must panic")
		}
	}()
	_ = auth.NewTokenIssuer("")
}

func TestIssueAndVerifyAccess(t *testing.T) {
	issuer := auth.NewTokenIssuer(testSecret)

	tok, err := issuer.IssueAccess(42, 1, permission.RoleHRManager, 7)
	if err != nil {
		t.Fatalf("IssueAccess failed: %v", err)
	}
	if tok == "" || strings.Count(tok, ".") != 2 {
		t.Fatalf("token shape invalid: %q", tok)
	}

	claims, err := issuer.Verify(tok, auth.TokenTypeAccess)
	if err != nil {
		t.Fatalf("Verify failed: %v", err)
	}
	if claims.TenantID != 1 {
		t.Fatalf("tenant_id = %d, want 1", claims.TenantID)
	}
	if claims.Role != permission.RoleHRManager {
		t.Fatalf("role = %q, want hr_manager", claims.Role)
	}
	if claims.TokenVersion != 7 {
		t.Fatalf("token_version = %d, want 7", claims.TokenVersion)
	}
	if claims.Type != auth.TokenTypeAccess {
		t.Fatalf("type = %q, want access", claims.Type)
	}
	uid, err := claims.UserID()
	if err != nil || uid != 42 {
		t.Fatalf("UserID = %d, err = %v; want 42, nil", uid, err)
	}
}

func TestIssueAndVerifyRefresh_HasJTI(t *testing.T) {
	issuer := auth.NewTokenIssuer(testSecret)
	tok, jti, exp, err := issuer.IssueRefresh(99, 1, permission.RoleGeneral, 0)
	if err != nil {
		t.Fatalf("IssueRefresh failed: %v", err)
	}
	if tok == "" {
		t.Fatal("token empty")
	}
	if jti == [16]byte{} {
		t.Fatal("jti zero")
	}
	if exp.Before(time.Now()) {
		t.Fatalf("exp in past: %v", exp)
	}

	claims, err := issuer.Verify(tok, auth.TokenTypeRefresh)
	if err != nil {
		t.Fatalf("Verify failed: %v", err)
	}
	if claims.ID == "" {
		t.Fatal("refresh claims.ID (jti) empty")
	}
	if claims.ID != jti.String() {
		t.Fatalf("claims.ID = %q, want %q", claims.ID, jti.String())
	}
}

func TestVerify_TypeMismatch(t *testing.T) {
	issuer := auth.NewTokenIssuer(testSecret)
	accessTok, err := issuer.IssueAccess(1, 1, permission.RoleGeneral, 0)
	if err != nil {
		t.Fatal(err)
	}
	if _, err := issuer.Verify(accessTok, auth.TokenTypeRefresh); !errors.Is(err, auth.ErrTokenTypeMismatch) {
		t.Fatalf("err = %v, want ErrTokenTypeMismatch", err)
	}
}

func TestVerify_Expired(t *testing.T) {
	issuer := auth.NewTokenIssuer(testSecret)
	// past 시계로 발급한 후 현재 시계로 검증.
	past := func() time.Time { return time.Now().Add(-2 * time.Hour) }
	tokenPast := issuer.WithClock(past)
	tok, err := tokenPast.IssueAccess(1, 1, permission.RoleGeneral, 0)
	if err != nil {
		t.Fatal(err)
	}

	_, err = issuer.Verify(tok, auth.TokenTypeAccess)
	if !errors.Is(err, auth.ErrTokenExpired) {
		t.Fatalf("err = %v, want ErrTokenExpired", err)
	}
}

func TestVerify_TamperedSignature(t *testing.T) {
	issuer := auth.NewTokenIssuer(testSecret)
	tok, err := issuer.IssueAccess(1, 1, permission.RoleGeneral, 0)
	if err != nil {
		t.Fatal(err)
	}
	tampered := tok + "x"
	if _, err := issuer.Verify(tampered, auth.TokenTypeAccess); !errors.Is(err, auth.ErrTokenInvalid) {
		t.Fatalf("err = %v, want ErrTokenInvalid", err)
	}
}

func TestVerify_WrongSecret(t *testing.T) {
	issuerA := auth.NewTokenIssuer(testSecret)
	issuerB := auth.NewTokenIssuer("different-secret")
	tok, err := issuerA.IssueAccess(1, 1, permission.RoleGeneral, 0)
	if err != nil {
		t.Fatal(err)
	}
	if _, err := issuerB.Verify(tok, auth.TokenTypeAccess); !errors.Is(err, auth.ErrTokenInvalid) {
		t.Fatalf("err = %v, want ErrTokenInvalid", err)
	}
}

func TestVerify_Empty(t *testing.T) {
	issuer := auth.NewTokenIssuer(testSecret)
	if _, err := issuer.Verify("", auth.TokenTypeAccess); !errors.Is(err, auth.ErrTokenInvalid) {
		t.Fatalf("err = %v, want ErrTokenInvalid", err)
	}
}
