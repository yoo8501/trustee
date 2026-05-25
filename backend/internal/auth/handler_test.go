package auth_test

import (
	"bytes"
	"encoding/json"
	"io"
	"net/http"
	"net/http/httptest"
	"testing"

	"github.com/gin-gonic/gin"

	"github.com/sjseo/docflow/backend/internal/auth"
	dbq "github.com/sjseo/docflow/backend/internal/db/sqlc"
	"github.com/sjseo/docflow/backend/internal/httpx/apiresult"
	"github.com/sjseo/docflow/backend/internal/httpx/errorcode"
)

func init() {
	gin.SetMode(gin.TestMode)
}

func newHandlerStack(t *testing.T) (*gin.Engine, *fakeStore, *auth.Service, *auth.Middleware) {
	t.Helper()
	store := newFakeStore()
	issuer := auth.NewTokenIssuer(testSecret)
	svc := auth.NewService(store, issuer, 1)
	h := auth.NewHandler(svc)
	mw := auth.NewMiddleware(issuer, store)

	eng := gin.New()
	eng.POST("/api/auth/register", h.Register)
	eng.POST("/api/auth/login", h.Login)
	eng.POST("/api/auth/refresh", h.Refresh)
	eng.POST("/api/auth/logout", mw.Required(), h.Logout)
	return eng, store, svc, mw
}

func doJSON(t *testing.T, eng *gin.Engine, method, path, bearer string, body any) (*httptest.ResponseRecorder, []byte) {
	t.Helper()
	var buf bytes.Buffer
	if body != nil {
		if err := json.NewEncoder(&buf).Encode(body); err != nil {
			t.Fatal(err)
		}
	}
	req := httptest.NewRequest(method, path, &buf)
	req.Header.Set("Content-Type", "application/json")
	if bearer != "" {
		req.Header.Set("Authorization", "Bearer "+bearer)
	}
	w := httptest.NewRecorder()
	eng.ServeHTTP(w, req)
	raw, _ := io.ReadAll(w.Body)
	return w, raw
}

type registerResp struct {
	ID    int64  `json:"id"`
	Email string `json:"email"`
	Name  string `json:"name"`
}

type loginResp struct {
	AccessToken  string `json:"accessToken"`
	RefreshToken string `json:"refreshToken"`
	ExpiresIn    int64  `json:"expiresIn"`
	UserID       int64  `json:"userId"`
	Role         string `json:"role"`
}

func TestHandler_Register_Success(t *testing.T) {
	eng, _, _, _ := newHandlerStack(t)
	w, raw := doJSON(t, eng, http.MethodPost, "/api/auth/register", "", map[string]any{
		"email": "alice@example.com", "password": "Pass1234", "name": "Alice",
	})
	if w.Code != http.StatusCreated {
		t.Fatalf("status = %d, body=%s", w.Code, raw)
	}
	var env apiresult.Envelope[registerResp]
	if err := json.Unmarshal(raw, &env); err != nil {
		t.Fatal(err)
	}
	if !env.Success || env.Data == nil || env.Data.Email != "alice@example.com" {
		t.Fatalf("env=%+v", env)
	}
}

func TestHandler_Register_DuplicateEmail(t *testing.T) {
	eng, _, _, _ := newHandlerStack(t)
	body := map[string]any{"email": "dup@example.com", "password": "Pass1234", "name": "Dup"}
	doJSON(t, eng, http.MethodPost, "/api/auth/register", "", body)
	w, raw := doJSON(t, eng, http.MethodPost, "/api/auth/register", "", body)

	if w.Code != http.StatusBadRequest {
		t.Fatalf("status = %d, body=%s", w.Code, raw)
	}
	var env apiresult.Envelope[any]
	if err := json.Unmarshal(raw, &env); err != nil {
		t.Fatal(err)
	}
	if env.Success || env.Details == nil || env.Details.ErrorCode != errorcode.EmailDuplicate {
		t.Fatalf("env=%+v", env)
	}
}

func TestHandler_Register_ValidationFailed(t *testing.T) {
	eng, _, _, _ := newHandlerStack(t)
	w, raw := doJSON(t, eng, http.MethodPost, "/api/auth/register", "", map[string]any{
		"email": "", "password": "short", "name": "",
	})
	if w.Code != http.StatusBadRequest {
		t.Fatalf("status = %d", w.Code)
	}
	var env apiresult.Envelope[any]
	if err := json.Unmarshal(raw, &env); err != nil {
		t.Fatal(err)
	}
	if env.Details == nil || env.Details.ErrorCode != errorcode.ValidationFailed {
		t.Fatalf("env=%+v", env)
	}
	if len(env.Details.Fields) < 2 {
		t.Fatalf("fields = %+v", env.Details.Fields)
	}
}

func TestHandler_Login_Success(t *testing.T) {
	eng, _, _, _ := newHandlerStack(t)
	doJSON(t, eng, http.MethodPost, "/api/auth/register", "", map[string]any{
		"email": "u@example.com", "password": "Pass1234", "name": "U",
	})

	w, raw := doJSON(t, eng, http.MethodPost, "/api/auth/login", "", map[string]any{
		"email": "u@example.com", "password": "Pass1234",
	})
	if w.Code != http.StatusOK {
		t.Fatalf("status = %d, body=%s", w.Code, raw)
	}
	var env apiresult.Envelope[loginResp]
	if err := json.Unmarshal(raw, &env); err != nil {
		t.Fatal(err)
	}
	if env.Data == nil || env.Data.AccessToken == "" || env.Data.RefreshToken == "" {
		t.Fatalf("env=%+v", env)
	}
	if env.Data.Role != "general" {
		t.Fatalf("role = %q", env.Data.Role)
	}
}

func TestHandler_Login_InvalidCredentials(t *testing.T) {
	eng, _, _, _ := newHandlerStack(t)
	doJSON(t, eng, http.MethodPost, "/api/auth/register", "", map[string]any{
		"email": "u@example.com", "password": "Pass1234", "name": "U",
	})
	w, raw := doJSON(t, eng, http.MethodPost, "/api/auth/login", "", map[string]any{
		"email": "u@example.com", "password": "wrong",
	})
	if w.Code != http.StatusBadRequest {
		t.Fatalf("status = %d", w.Code)
	}
	var env apiresult.Envelope[any]
	_ = json.Unmarshal(raw, &env)
	if env.Details == nil || env.Details.ErrorCode != errorcode.InvalidCredentials {
		t.Fatalf("env=%+v", env)
	}
}

func TestHandler_Login_Terminated(t *testing.T) {
	eng, store, _, _ := newHandlerStack(t)
	doJSON(t, eng, http.MethodPost, "/api/auth/register", "", map[string]any{
		"email": "u@example.com", "password": "Pass1234", "name": "U",
	})
	for id, u := range store.users {
		u.Status = dbq.UserStatusTerminated
		store.users[id] = u
	}
	w, raw := doJSON(t, eng, http.MethodPost, "/api/auth/login", "", map[string]any{
		"email": "u@example.com", "password": "Pass1234",
	})
	if w.Code != http.StatusBadRequest {
		t.Fatalf("status = %d", w.Code)
	}
	var env apiresult.Envelope[any]
	_ = json.Unmarshal(raw, &env)
	if env.Details == nil || env.Details.ErrorCode != errorcode.UserTerminated {
		t.Fatalf("env=%+v", env)
	}
}

func TestHandler_Refresh_RotateAndReuse(t *testing.T) {
	eng, _, _, _ := newHandlerStack(t)
	doJSON(t, eng, http.MethodPost, "/api/auth/register", "", map[string]any{
		"email": "u@example.com", "password": "Pass1234", "name": "U",
	})
	_, loginRaw := doJSON(t, eng, http.MethodPost, "/api/auth/login", "", map[string]any{
		"email": "u@example.com", "password": "Pass1234",
	})
	var loginEnv apiresult.Envelope[loginResp]
	if err := json.Unmarshal(loginRaw, &loginEnv); err != nil {
		t.Fatal(err)
	}
	oldRefresh := loginEnv.Data.RefreshToken

	// 1차 refresh — 성공.
	w, raw := doJSON(t, eng, http.MethodPost, "/api/auth/refresh", "", map[string]any{
		"refreshToken": oldRefresh,
	})
	if w.Code != http.StatusOK {
		t.Fatalf("status = %d body=%s", w.Code, raw)
	}

	// 2차 refresh (같은 token) — 401 + UNAUTHENTICATED (reuse 감지).
	w2, raw2 := doJSON(t, eng, http.MethodPost, "/api/auth/refresh", "", map[string]any{
		"refreshToken": oldRefresh,
	})
	if w2.Code != http.StatusUnauthorized {
		t.Fatalf("status = %d body=%s", w2.Code, raw2)
	}
	var env apiresult.Envelope[any]
	_ = json.Unmarshal(raw2, &env)
	if env.Details == nil || env.Details.ErrorCode != errorcode.Unauthenticated {
		t.Fatalf("env=%+v", env)
	}
}

func TestHandler_Logout_RequiresAuth(t *testing.T) {
	eng, _, _, _ := newHandlerStack(t)
	w, raw := doJSON(t, eng, http.MethodPost, "/api/auth/logout", "", nil)
	if w.Code != http.StatusUnauthorized {
		t.Fatalf("status = %d body=%s", w.Code, raw)
	}
}

func TestHandler_Logout_InvalidatesAccessToken(t *testing.T) {
	eng, _, _, _ := newHandlerStack(t)
	doJSON(t, eng, http.MethodPost, "/api/auth/register", "", map[string]any{
		"email": "u@example.com", "password": "Pass1234", "name": "U",
	})
	_, loginRaw := doJSON(t, eng, http.MethodPost, "/api/auth/login", "", map[string]any{
		"email": "u@example.com", "password": "Pass1234",
	})
	var loginEnv apiresult.Envelope[loginResp]
	_ = json.Unmarshal(loginRaw, &loginEnv)
	access := loginEnv.Data.AccessToken

	// 1차 logout — 성공.
	w, raw := doJSON(t, eng, http.MethodPost, "/api/auth/logout", access, nil)
	if w.Code != http.StatusOK {
		t.Fatalf("status = %d body=%s", w.Code, raw)
	}

	// 2차 access 사용 — 401 (token_version mismatch).
	w2, raw2 := doJSON(t, eng, http.MethodPost, "/api/auth/logout", access, nil)
	if w2.Code != http.StatusUnauthorized {
		t.Fatalf("status = %d body=%s", w2.Code, raw2)
	}
	var env apiresult.Envelope[any]
	_ = json.Unmarshal(raw2, &env)
	if env.Details == nil || env.Details.ErrorCode != errorcode.Unauthenticated {
		t.Fatalf("env=%+v", env)
	}
}

