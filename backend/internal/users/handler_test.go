package users_test

import (
	"bytes"
	"encoding/json"
	"io"
	"net/http"
	"net/http/httptest"
	"testing"

	"github.com/gin-gonic/gin"

	dbq "github.com/sjseo/docflow/backend/internal/db/sqlc"
	"github.com/sjseo/docflow/backend/internal/httpx/apiresult"
	"github.com/sjseo/docflow/backend/internal/httpx/errorcode"
	"github.com/sjseo/docflow/backend/internal/permission"
	"github.com/sjseo/docflow/backend/internal/users"
)

func init() {
	gin.SetMode(gin.TestMode)
}

// fakeAuth — 핸들러 단위 테스트에서 인증 컨텍스트를 직접 주입한다.
// auth.Middleware 의 Required() 의존성을 피하기 위함 (auth.Store 까지 흉내내야 하므로 무겁다).
// 권한 분기 검증은 server router_test 에서 통합으로 처리.
func fakeAuth(userID, tenantID int64, role permission.Role) gin.HandlerFunc {
	return func(c *gin.Context) {
		c.Set("auth:user_id", userID)
		c.Set("auth:tenant_id", tenantID)
		c.Set("auth:role", role)
		c.Next()
	}
}

func newHandlerEng(store users.Store, userID int64, role permission.Role) *gin.Engine {
	svc := users.NewService(store)
	h := users.NewHandler(svc)

	eng := gin.New()
	eng.GET("/api/users/me", fakeAuth(userID, 1, role), h.Me)
	eng.POST("/api/users/list", fakeAuth(userID, 1, role), h.List)
	eng.POST("/api/users/update", fakeAuth(userID, 1, role), h.Update)
	return eng
}

func doJSON(t *testing.T, eng *gin.Engine, method, path string, body any) (*httptest.ResponseRecorder, []byte) {
	t.Helper()
	var buf bytes.Buffer
	if body != nil {
		if err := json.NewEncoder(&buf).Encode(body); err != nil {
			t.Fatal(err)
		}
	}
	req := httptest.NewRequest(method, path, &buf)
	req.Header.Set("Content-Type", "application/json")
	w := httptest.NewRecorder()
	eng.ServeHTTP(w, req)
	raw, _ := io.ReadAll(w.Body)
	return w, raw
}

type meResp struct {
	ID    int64  `json:"id"`
	Email string `json:"email"`
	Role  string `json:"role"`
}

func TestHandler_Me_Success(t *testing.T) {
	store := newFakeStore()
	store.seed(dbq.User{Email: "u@x", Role: dbq.UserRoleHrManager})
	eng := newHandlerEng(store, 1, permission.RoleHRManager)

	w, raw := doJSON(t, eng, http.MethodGet, "/api/users/me", nil)
	if w.Code != http.StatusOK {
		t.Fatalf("status = %d body=%s", w.Code, raw)
	}
	var env apiresult.Envelope[meResp]
	_ = json.Unmarshal(raw, &env)
	if env.Data == nil || env.Data.Email != "u@x" || env.Data.Role != "hr_manager" {
		t.Fatalf("env=%+v", env)
	}
}

func TestHandler_Me_NotFound(t *testing.T) {
	store := newFakeStore() // 빈 store — me 호출 시 NotFound.
	eng := newHandlerEng(store, 99, permission.RoleGeneral)

	w, raw := doJSON(t, eng, http.MethodGet, "/api/users/me", nil)
	if w.Code != http.StatusNotFound {
		t.Fatalf("status = %d body=%s", w.Code, raw)
	}
	var env apiresult.Envelope[any]
	_ = json.Unmarshal(raw, &env)
	if env.Details == nil || env.Details.ErrorCode != errorcode.NotFound {
		t.Fatalf("env=%+v", env)
	}
}

func TestHandler_List_Success(t *testing.T) {
	store := newFakeStore()
	store.seed(dbq.User{Email: "a"})
	store.seed(dbq.User{Email: "b"})
	eng := newHandlerEng(store, 1, permission.RoleHRManager)

	w, raw := doJSON(t, eng, http.MethodPost, "/api/users/list", map[string]any{"page": 1, "size": 50})
	if w.Code != http.StatusOK {
		t.Fatalf("status = %d body=%s", w.Code, raw)
	}
	var env apiresult.Envelope[[]meResp]
	_ = json.Unmarshal(raw, &env)
	if env.Total == nil || *env.Total != 2 {
		t.Fatalf("total = %v", env.Total)
	}
	if env.Data == nil || len(*env.Data) != 2 {
		t.Fatalf("items = %+v", env.Data)
	}
}

func TestHandler_Update_CannotDemoteSelf(t *testing.T) {
	store := newFakeStore()
	store.seed(dbq.User{Email: "boss@x", Role: dbq.UserRoleSuperAdmin})
	eng := newHandlerEng(store, 1, permission.RoleSuperAdmin)

	w, raw := doJSON(t, eng, http.MethodPost, "/api/users/update", map[string]any{
		"id": 1, "role": "general",
	})
	if w.Code != http.StatusBadRequest {
		t.Fatalf("status = %d body=%s", w.Code, raw)
	}
	var env apiresult.Envelope[any]
	_ = json.Unmarshal(raw, &env)
	if env.Details == nil || env.Details.ErrorCode != errorcode.CannotDemoteSelf {
		t.Fatalf("env=%+v", env)
	}
}

func TestHandler_Update_Success(t *testing.T) {
	store := newFakeStore()
	store.seed(dbq.User{Email: "admin@x", Role: dbq.UserRoleSuperAdmin})
	store.seed(dbq.User{Email: "target@x", Role: dbq.UserRoleGeneral})
	eng := newHandlerEng(store, 1, permission.RoleSuperAdmin)

	w, raw := doJSON(t, eng, http.MethodPost, "/api/users/update", map[string]any{
		"id": 2, "role": "team_lead",
	})
	if w.Code != http.StatusOK {
		t.Fatalf("status = %d body=%s", w.Code, raw)
	}
	if store.users[2].Role != dbq.UserRoleTeamLead {
		t.Fatalf("role = %q", store.users[2].Role)
	}
	// token_version 증가 (role 변경).
	if store.users[2].TokenVersion != 1 {
		t.Fatalf("token_version = %d, want 1", store.users[2].TokenVersion)
	}
}

func TestHandler_Update_InvalidRole(t *testing.T) {
	store := newFakeStore()
	store.seed(dbq.User{Email: "x", Role: dbq.UserRoleSuperAdmin})
	store.seed(dbq.User{Email: "y"})
	eng := newHandlerEng(store, 1, permission.RoleSuperAdmin)

	w, raw := doJSON(t, eng, http.MethodPost, "/api/users/update", map[string]any{
		"id": 2, "role": "god_mode",
	})
	if w.Code != http.StatusBadRequest {
		t.Fatalf("status = %d", w.Code)
	}
	var env apiresult.Envelope[any]
	_ = json.Unmarshal(raw, &env)
	if env.Details == nil || env.Details.ErrorCode != errorcode.ValidationFailed {
		t.Fatalf("env=%+v", env)
	}
}

func TestHandler_Update_MissingID(t *testing.T) {
	store := newFakeStore()
	eng := newHandlerEng(store, 1, permission.RoleSuperAdmin)
	w, raw := doJSON(t, eng, http.MethodPost, "/api/users/update", map[string]any{})
	if w.Code != http.StatusBadRequest {
		t.Fatalf("status = %d body=%s", w.Code, raw)
	}
}

func TestHandler_Update_NotFound(t *testing.T) {
	store := newFakeStore()
	store.seed(dbq.User{Email: "admin@x", Role: dbq.UserRoleSuperAdmin})
	eng := newHandlerEng(store, 1, permission.RoleSuperAdmin)

	w, raw := doJSON(t, eng, http.MethodPost, "/api/users/update", map[string]any{
		"id": 99, "name": "noop",
	})
	if w.Code != http.StatusNotFound {
		t.Fatalf("status = %d body=%s", w.Code, raw)
	}
}

// 미들웨어 단까지 통합으로 검증되는 라우터 기반 시나리오는 server_test 에서 처리.
