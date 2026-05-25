package auth_test

import (
	"bytes"
	"context"
	"encoding/json"
	"errors"
	"io"
	"net/http"
	"net/http/httptest"
	"testing"
	"time"

	"github.com/gin-gonic/gin"

	"github.com/sjseo/docflow/backend/internal/auth"
	"github.com/sjseo/docflow/backend/internal/httpx/apiresult"
	"github.com/sjseo/docflow/backend/internal/httpx/errorcode"
	"github.com/sjseo/docflow/backend/internal/permission"
)

// invalid JSON body 의 InvalidRequest 분기.
func TestHandler_Register_InvalidJSON(t *testing.T) {
	eng, _, _, _ := newHandlerStack(t)
	req := httptest.NewRequest(http.MethodPost, "/api/auth/register", bytes.NewBufferString("{not json"))
	req.Header.Set("Content-Type", "application/json")
	w := httptest.NewRecorder()
	eng.ServeHTTP(w, req)
	if w.Code != http.StatusBadRequest {
		t.Fatalf("status = %d", w.Code)
	}
	raw, _ := io.ReadAll(w.Body)
	var env apiresult.Envelope[any]
	_ = json.Unmarshal(raw, &env)
	if env.Details == nil || env.Details.ErrorCode != errorcode.InvalidRequest {
		t.Fatalf("env=%+v", env)
	}
}

func TestHandler_Login_ValidationMissingEmail(t *testing.T) {
	eng, _, _, _ := newHandlerStack(t)
	w, raw := doJSON(t, eng, http.MethodPost, "/api/auth/login", "", map[string]any{
		"email": "", "password": "x",
	})
	if w.Code != http.StatusBadRequest {
		t.Fatalf("status = %d body=%s", w.Code, raw)
	}
	var env apiresult.Envelope[any]
	_ = json.Unmarshal(raw, &env)
	if env.Details == nil || env.Details.ErrorCode != errorcode.ValidationFailed {
		t.Fatalf("env=%+v", env)
	}
}

func TestHandler_Refresh_InvalidJSON(t *testing.T) {
	eng, _, _, _ := newHandlerStack(t)
	req := httptest.NewRequest(http.MethodPost, "/api/auth/refresh", bytes.NewBufferString("xxx"))
	req.Header.Set("Content-Type", "application/json")
	w := httptest.NewRecorder()
	eng.ServeHTTP(w, req)
	if w.Code != http.StatusBadRequest {
		t.Fatalf("status = %d", w.Code)
	}
}

func TestHandler_Refresh_EmptyToken(t *testing.T) {
	eng, _, _, _ := newHandlerStack(t)
	w, raw := doJSON(t, eng, http.MethodPost, "/api/auth/refresh", "", map[string]any{"refreshToken": ""})
	if w.Code != http.StatusBadRequest {
		t.Fatalf("status = %d body=%s", w.Code, raw)
	}
	var env apiresult.Envelope[any]
	_ = json.Unmarshal(raw, &env)
	if env.Details == nil || env.Details.ErrorCode != errorcode.ValidationFailed {
		t.Fatalf("env=%+v", env)
	}
}

func TestHandler_Refresh_Expired(t *testing.T) {
	// 직접 만료된 refresh token 발급 → handler 가 401 + TOKEN_EXPIRED 반환.
	store := newFakeStore()
	past := func() time.Time { return time.Now().Add(-31 * 24 * time.Hour) }
	pastIssuer := auth.NewTokenIssuer(testSecret).WithClock(past)
	svc := auth.NewService(store, pastIssuer, 1).WithClock(past)
	_, _ = svc.Register(context.Background(), auth.RegisterInput{
		Email: "u@x", Password: "Pass1234", Name: "U",
	})
	pair, _, _ := svc.Login(context.Background(), "u@x", "Pass1234")

	// 현재 시계 issuer / service 로 handler 구성.
	freshIssuer := auth.NewTokenIssuer(testSecret)
	freshSvc := auth.NewService(store, freshIssuer, 1)
	h := auth.NewHandler(freshSvc)
	eng := newEngineWith(h, freshIssuer, store)

	w, raw := doJSON(t, eng, http.MethodPost, "/api/auth/refresh", "", map[string]any{
		"refreshToken": pair.RefreshToken,
	})
	if w.Code != http.StatusUnauthorized {
		t.Fatalf("status = %d body=%s", w.Code, raw)
	}
	var env apiresult.Envelope[any]
	_ = json.Unmarshal(raw, &env)
	if env.Details == nil || env.Details.ErrorCode != errorcode.TokenExpired {
		t.Fatalf("env=%+v", env)
	}
}

// 보조: handler / middleware 다시 묶는 헬퍼.
func newEngineWith(h *auth.Handler, issuer *auth.TokenIssuer, store auth.Store) *gin.Engine {
	mw := auth.NewMiddleware(issuer, store)
	eng := gin.New()
	eng.POST("/api/auth/register", h.Register)
	eng.POST("/api/auth/login", h.Login)
	eng.POST("/api/auth/refresh", h.Refresh)
	eng.POST("/api/auth/logout", mw.Required(), h.Logout)
	return eng
}

// Middleware Required 분기: terminated user 의 token 도 401.
func TestMiddleware_TerminatedUser_401(t *testing.T) {
	eng, store, _, _ := newMWStack(t)
	issuer := auth.NewTokenIssuer(testSecret)
	svc := auth.NewService(store, issuer, 1)
	tok := registerUserAndIssueToken(t, store, svc, "x@x", "Pass1234", permission.RoleGeneral)
	for id, u := range store.users {
		u.Status = "terminated"
		store.users[id] = u
	}
	w, _ := bearerGet(t, eng, "/secured", tok)
	if w.Code != http.StatusUnauthorized {
		t.Fatalf("status = %d", w.Code)
	}
}

// Refresh handler 의 user terminated 분기.
func TestHandler_Refresh_TerminatedUser(t *testing.T) {
	eng, store, _, _ := newHandlerStack(t)
	doJSON(t, eng, http.MethodPost, "/api/auth/register", "", map[string]any{
		"email": "u@x", "password": "Pass1234", "name": "U",
	})
	_, loginRaw := doJSON(t, eng, http.MethodPost, "/api/auth/login", "", map[string]any{
		"email": "u@x", "password": "Pass1234",
	})
	var loginEnv apiresult.Envelope[loginResp]
	_ = json.Unmarshal(loginRaw, &loginEnv)

	for id, u := range store.users {
		u.Status = "terminated"
		store.users[id] = u
	}

	w, raw := doJSON(t, eng, http.MethodPost, "/api/auth/refresh", "", map[string]any{
		"refreshToken": loginEnv.Data.RefreshToken,
	})
	if w.Code != http.StatusBadRequest {
		t.Fatalf("status = %d body=%s", w.Code, raw)
	}
	var env apiresult.Envelope[any]
	_ = json.Unmarshal(raw, &env)
	if env.Details == nil || env.Details.ErrorCode != errorcode.UserTerminated {
		t.Fatalf("env=%+v", env)
	}
}

// Login InvalidJSON 분기.
func TestHandler_Login_InvalidJSON(t *testing.T) {
	eng, _, _, _ := newHandlerStack(t)
	req := httptest.NewRequest(http.MethodPost, "/api/auth/login", bytes.NewBufferString("xxx"))
	req.Header.Set("Content-Type", "application/json")
	w := httptest.NewRecorder()
	eng.ServeHTTP(w, req)
	if w.Code != http.StatusBadRequest {
		t.Fatalf("status = %d", w.Code)
	}
}

func TestUserID_EmptyClaim(t *testing.T) {
	// claims.UserID 의 sub missing 분기.
	c := &auth.Claims{}
	_, err := c.UserID()
	if err == nil {
		t.Fatal("UserID with empty sub must error")
	}
}

func TestService_Refresh_UnknownJTI(t *testing.T) {
	// jti 가 DB 에 없는 refresh — ErrRefreshNotFound.
	store := newFakeStore()
	issuer := auth.NewTokenIssuer(testSecret)
	svc := auth.NewService(store, issuer, 1)
	_, _ = svc.Register(context.Background(), auth.RegisterInput{
		Email: "u@x", Password: "Pass1234", Name: "U",
	})

	// 직접 새로운 refresh 발급 (DB 저장은 건너뜀).
	tok, _, _, err := issuer.IssueRefresh(1, 1, permission.RoleGeneral, 0)
	if err != nil {
		t.Fatal(err)
	}
	_, err = svc.Refresh(context.Background(), tok)
	if !errors.Is(err, auth.ErrRefreshNotFound) {
		t.Fatalf("err = %v, want ErrRefreshNotFound", err)
	}
}
