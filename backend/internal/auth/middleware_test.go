package auth_test

import (
	"context"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"testing"
	"time"

	"github.com/gin-gonic/gin"

	"github.com/sjseo/docflow/backend/internal/auth"
	dbq "github.com/sjseo/docflow/backend/internal/db/sqlc"
	"github.com/sjseo/docflow/backend/internal/httpx/apiresult"
	"github.com/sjseo/docflow/backend/internal/httpx/errorcode"
	"github.com/sjseo/docflow/backend/internal/permission"
)

func newMWStack(t *testing.T) (*gin.Engine, *fakeStore, *auth.TokenIssuer, *auth.Middleware) {
	t.Helper()
	store := newFakeStore()
	issuer := auth.NewTokenIssuer(testSecret)
	mw := auth.NewMiddleware(issuer, store)

	eng := gin.New()
	// 보호 라우트 — 모든 정보가 context 에 들어왔는지 확인.
	eng.GET("/secured", mw.Required(), func(c *gin.Context) {
		uid, _ := auth.UserIDFrom(c)
		role, _ := auth.RoleFrom(c)
		tid, _ := auth.TenantIDFrom(c)
		c.JSON(http.StatusOK, apiresult.Success(map[string]any{
			"user_id":   uid,
			"role":      string(role),
			"tenant_id": tid,
		}))
	})
	eng.GET("/hr-only", mw.Required(),
		mw.RequireRole(permission.RoleHRManager, permission.RoleSuperAdmin),
		func(c *gin.Context) {
			c.JSON(http.StatusOK, apiresult.Success("ok"))
		},
	)
	eng.GET("/at-least-team-lead", mw.Required(),
		mw.RequireAtLeast(permission.RoleTeamLead),
		func(c *gin.Context) {
			c.JSON(http.StatusOK, apiresult.Success("ok"))
		},
	)
	return eng, store, issuer, mw
}

func bearerGet(t *testing.T, eng *gin.Engine, path, bearer string) (*httptest.ResponseRecorder, []byte) {
	t.Helper()
	req := httptest.NewRequest(http.MethodGet, path, nil)
	if bearer != "" {
		req.Header.Set("Authorization", "Bearer "+bearer)
	}
	w := httptest.NewRecorder()
	eng.ServeHTTP(w, req)
	body := w.Body.Bytes()
	return w, body
}

func registerUserAndIssueToken(
	t *testing.T,
	store *fakeStore,
	svc *auth.Service,
	email, password string,
	role permission.Role,
) string {
	t.Helper()
	u, err := svc.Register(context.Background(), auth.RegisterInput{
		Email: email, Password: password, Name: "Test",
	})
	if err != nil {
		t.Fatal(err)
	}
	// role 강제 변경.
	st := store.users[u.ID]
	st.Role = dbq.UserRole(role)
	store.users[u.ID] = st

	pair, _, err := svc.Login(context.Background(), email, password)
	if err != nil {
		t.Fatal(err)
	}
	return pair.AccessToken
}

func TestMiddleware_MissingToken_401(t *testing.T) {
	eng, _, _, _ := newMWStack(t)
	w, body := bearerGet(t, eng, "/secured", "")
	if w.Code != http.StatusUnauthorized {
		t.Fatalf("status = %d body=%s", w.Code, body)
	}
	var env apiresult.Envelope[any]
	_ = json.Unmarshal(body, &env)
	if env.Details == nil || env.Details.ErrorCode != errorcode.Unauthenticated {
		t.Fatalf("env=%+v", env)
	}
}

func TestMiddleware_MalformedAuthorization_401(t *testing.T) {
	eng, _, _, _ := newMWStack(t)
	w, body := bearerGet(t, eng, "/secured", "")
	_ = body
	if w.Code != http.StatusUnauthorized {
		t.Fatalf("status = %d", w.Code)
	}
	// Authorization: NotBearer xxxx
	req := httptest.NewRequest(http.MethodGet, "/secured", nil)
	req.Header.Set("Authorization", "Basic abcd")
	w2 := httptest.NewRecorder()
	eng.ServeHTTP(w2, req)
	if w2.Code != http.StatusUnauthorized {
		t.Fatalf("Basic header should 401, got %d", w2.Code)
	}
}

func TestMiddleware_ValidToken_PopulatesContext(t *testing.T) {
	eng, store, _, _ := newMWStack(t)
	issuer := auth.NewTokenIssuer(testSecret)
	svc := auth.NewService(store, issuer, 1)

	tok := registerUserAndIssueToken(t, store, svc, "u@example.com", "Pass1234", permission.RoleGeneral)
	w, body := bearerGet(t, eng, "/secured", tok)
	if w.Code != http.StatusOK {
		t.Fatalf("status = %d body=%s", w.Code, body)
	}
	var env apiresult.Envelope[map[string]any]
	if err := json.Unmarshal(body, &env); err != nil {
		t.Fatal(err)
	}
	if env.Data == nil {
		t.Fatal("data nil")
	}
	if int64((*env.Data)["user_id"].(float64)) == 0 {
		t.Fatalf("user_id empty: %+v", env.Data)
	}
	if (*env.Data)["role"] != "general" {
		t.Fatalf("role = %v", (*env.Data)["role"])
	}
}

func TestMiddleware_ExpiredToken_401TokenExpired(t *testing.T) {
	eng, store, _, _ := newMWStack(t)
	past := func() time.Time { return time.Now().Add(-2 * time.Hour) }
	pastIssuer := auth.NewTokenIssuer(testSecret).WithClock(past)
	svc := auth.NewService(store, pastIssuer, 1).WithClock(past)

	u, _ := svc.Register(context.Background(), auth.RegisterInput{
		Email: "u@example.com", Password: "Pass1234", Name: "U",
	})
	_ = u
	tok, err := pastIssuer.IssueAccess(u.ID, 1, permission.RoleGeneral, 0)
	if err != nil {
		t.Fatal(err)
	}

	w, body := bearerGet(t, eng, "/secured", tok)
	if w.Code != http.StatusUnauthorized {
		t.Fatalf("status = %d body=%s", w.Code, body)
	}
	var env apiresult.Envelope[any]
	_ = json.Unmarshal(body, &env)
	if env.Details == nil || env.Details.ErrorCode != errorcode.TokenExpired {
		t.Fatalf("env=%+v", env)
	}
}

func TestMiddleware_TokenVersionMismatch_401(t *testing.T) {
	eng, store, issuer, _ := newMWStack(t)
	svc := auth.NewService(store, issuer, 1)
	u, _ := svc.Register(context.Background(), auth.RegisterInput{
		Email: "u@example.com", Password: "Pass1234", Name: "U",
	})
	// 토큰을 옛 token_version(0)로 발급한 뒤 DB token_version 만 증가.
	tok, _ := issuer.IssueAccess(u.ID, 1, permission.RoleGeneral, 0)

	st := store.users[u.ID]
	st.TokenVersion = 1
	store.users[u.ID] = st

	w, body := bearerGet(t, eng, "/secured", tok)
	if w.Code != http.StatusUnauthorized {
		t.Fatalf("status = %d body=%s", w.Code, body)
	}
	var env apiresult.Envelope[any]
	_ = json.Unmarshal(body, &env)
	if env.Details == nil || env.Details.ErrorCode != errorcode.Unauthenticated {
		t.Fatalf("env=%+v", env)
	}
}

func TestMiddleware_RequireRole_ForbiddenForGeneral(t *testing.T) {
	eng, store, issuer, _ := newMWStack(t)
	svc := auth.NewService(store, issuer, 1)
	tok := registerUserAndIssueToken(t, store, svc, "u@example.com", "Pass1234", permission.RoleGeneral)

	w, body := bearerGet(t, eng, "/hr-only", tok)
	if w.Code != http.StatusForbidden {
		t.Fatalf("status = %d body=%s", w.Code, body)
	}
	var env apiresult.Envelope[any]
	_ = json.Unmarshal(body, &env)
	if env.Details == nil || env.Details.ErrorCode != errorcode.Forbidden {
		t.Fatalf("env=%+v", env)
	}
}

func TestMiddleware_RequireRole_PassesForHR(t *testing.T) {
	eng, store, issuer, _ := newMWStack(t)
	svc := auth.NewService(store, issuer, 1)
	tok := registerUserAndIssueToken(t, store, svc, "hr@example.com", "Pass1234", permission.RoleHRManager)

	w, body := bearerGet(t, eng, "/hr-only", tok)
	if w.Code != http.StatusOK {
		t.Fatalf("status = %d body=%s", w.Code, body)
	}
}

func TestMiddleware_RequireAtLeast(t *testing.T) {
	eng, store, issuer, _ := newMWStack(t)
	svc := auth.NewService(store, issuer, 1)
	tokGen := registerUserAndIssueToken(t, store, svc, "g@example.com", "Pass1234", permission.RoleGeneral)
	tokLead := registerUserAndIssueToken(t, store, svc, "l@example.com", "Pass1234", permission.RoleTeamLead)

	if w, _ := bearerGet(t, eng, "/at-least-team-lead", tokGen); w.Code != http.StatusForbidden {
		t.Fatalf("general should be forbidden, got %d", w.Code)
	}
	if w, _ := bearerGet(t, eng, "/at-least-team-lead", tokLead); w.Code != http.StatusOK {
		t.Fatalf("team_lead should pass, got %d", w.Code)
	}
}
