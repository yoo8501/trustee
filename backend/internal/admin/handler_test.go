package admin_test

import (
	"bytes"
	"encoding/json"
	"io"
	"net/http"
	"net/http/httptest"
	"testing"

	"github.com/gin-gonic/gin"

	"github.com/sjseo/docflow/backend/internal/admin"
	dbq "github.com/sjseo/docflow/backend/internal/db/sqlc"
	"github.com/sjseo/docflow/backend/internal/httpx/apiresult"
	"github.com/sjseo/docflow/backend/internal/httpx/errorcode"
	"github.com/sjseo/docflow/backend/internal/permission"
)

func init() {
	gin.SetMode(gin.TestMode)
}

// fakeAuth — admin handler 단위 테스트에서 인증 컨텍스트 주입.
func fakeAuth(userID, tenantID int64, role permission.Role) gin.HandlerFunc {
	return func(c *gin.Context) {
		c.Set("auth:user_id", userID)
		c.Set("auth:tenant_id", tenantID)
		c.Set("auth:role", role)
		c.Next()
	}
}

func newAdminEng(store admin.Store, actorID int64, role permission.Role) *gin.Engine {
	svc := admin.NewService(store)
	h := admin.NewHandler(svc)
	eng := gin.New()
	eng.POST("/api/users/terminate", fakeAuth(actorID, 1, role), h.Terminate)
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

type terminateResp struct {
	ID           int64  `json:"id"`
	Status       string `json:"status"`
	TokenVersion int32  `json:"tokenVersion"`
}

func TestHandler_Terminate_Success(t *testing.T) {
	store := newFakeAdminStore()
	store.seed(dbq.User{ID: 1, Email: "boss@x", Role: dbq.UserRoleSuperAdmin})
	store.seed(dbq.User{ID: 2, Email: "ex@x"})

	eng := newAdminEng(store, 1, permission.RoleSuperAdmin)
	w, raw := doJSON(t, eng, http.MethodPost, "/api/users/terminate", map[string]any{
		"userId": 2, "reason": "퇴사",
	})
	if w.Code != http.StatusOK {
		t.Fatalf("status = %d body=%s", w.Code, raw)
	}
	var env apiresult.Envelope[terminateResp]
	if err := json.Unmarshal(raw, &env); err != nil {
		t.Fatalf("unmarshal: %v body=%s", err, raw)
	}
	if env.Data == nil || env.Data.Status != "terminated" {
		t.Fatalf("env=%+v", env)
	}
	if store.users[2].Status != dbq.UserStatusTerminated {
		t.Fatalf("status = %q", store.users[2].Status)
	}
	if store.users[2].TokenVersion != 1 {
		t.Fatalf("token_version = %d, want 1", store.users[2].TokenVersion)
	}
}

func TestHandler_Terminate_Self_BadRequest(t *testing.T) {
	store := newFakeAdminStore()
	store.seed(dbq.User{ID: 1, Email: "boss@x", Role: dbq.UserRoleSuperAdmin})

	eng := newAdminEng(store, 1, permission.RoleSuperAdmin)
	w, raw := doJSON(t, eng, http.MethodPost, "/api/users/terminate", map[string]any{
		"userId": 1,
	})
	if w.Code != http.StatusBadRequest {
		t.Fatalf("status = %d body=%s", w.Code, raw)
	}
	var env apiresult.Envelope[any]
	_ = json.Unmarshal(raw, &env)
	if env.Details == nil || env.Details.ErrorCode != errorcode.CannotTerminateSelf {
		t.Fatalf("env=%+v", env)
	}
}

func TestHandler_Terminate_NotFound(t *testing.T) {
	store := newFakeAdminStore()
	store.seed(dbq.User{ID: 1, Email: "boss@x", Role: dbq.UserRoleSuperAdmin})

	eng := newAdminEng(store, 1, permission.RoleSuperAdmin)
	w, raw := doJSON(t, eng, http.MethodPost, "/api/users/terminate", map[string]any{
		"userId": 99,
	})
	if w.Code != http.StatusNotFound {
		t.Fatalf("status = %d body=%s", w.Code, raw)
	}
	var env apiresult.Envelope[any]
	_ = json.Unmarshal(raw, &env)
	if env.Details == nil || env.Details.ErrorCode != errorcode.NotFound {
		t.Fatalf("env=%+v", env)
	}
}

func TestHandler_Terminate_MissingUserID_ValidationFailed(t *testing.T) {
	store := newFakeAdminStore()
	eng := newAdminEng(store, 1, permission.RoleSuperAdmin)

	w, raw := doJSON(t, eng, http.MethodPost, "/api/users/terminate", map[string]any{})
	if w.Code != http.StatusBadRequest {
		t.Fatalf("status = %d body=%s", w.Code, raw)
	}
	var env apiresult.Envelope[any]
	_ = json.Unmarshal(raw, &env)
	if env.Details == nil {
		t.Fatalf("env=%+v (details required)", env)
	}
	// VALIDATION_FAILED 또는 INVALID_REQUEST 둘 다 허용 — bind 실패 vs 검증 실패.
	if env.Details.ErrorCode != errorcode.ValidationFailed && env.Details.ErrorCode != errorcode.InvalidRequest {
		t.Fatalf("errorCode = %q, want VALIDATION_FAILED or INVALID_REQUEST", env.Details.ErrorCode)
	}
}

func TestHandler_Terminate_InvalidBody_InvalidRequest(t *testing.T) {
	store := newFakeAdminStore()
	eng := newAdminEng(store, 1, permission.RoleSuperAdmin)

	// 형식이 잘못된 JSON.
	req := httptest.NewRequest(http.MethodPost, "/api/users/terminate", bytes.NewBufferString(`{not json`))
	req.Header.Set("Content-Type", "application/json")
	w := httptest.NewRecorder()
	eng.ServeHTTP(w, req)
	if w.Code != http.StatusBadRequest {
		t.Fatalf("status = %d", w.Code)
	}
	var env apiresult.Envelope[any]
	_ = json.Unmarshal(w.Body.Bytes(), &env)
	if env.Details == nil || env.Details.ErrorCode != errorcode.InvalidRequest {
		t.Fatalf("env=%+v", env)
	}
}
