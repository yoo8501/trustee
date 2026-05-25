package teams_test

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
	"github.com/sjseo/docflow/backend/internal/teams"
)

func init() {
	gin.SetMode(gin.TestMode)
}

func fakeAuth(role permission.Role) gin.HandlerFunc {
	return func(c *gin.Context) {
		c.Set("auth:user_id", int64(1))
		c.Set("auth:tenant_id", int64(1))
		c.Set("auth:role", role)
		c.Next()
	}
}

func newHandlerEng(store teams.Store, role permission.Role) *gin.Engine {
	svc := teams.NewService(store)
	h := teams.NewHandler(svc)
	eng := gin.New()
	eng.GET("/api/teams/:id", fakeAuth(role), h.Get)
	eng.POST("/api/teams/list", fakeAuth(role), h.List)
	eng.POST("/api/teams", fakeAuth(role), h.Create)
	eng.POST("/api/teams/update", fakeAuth(role), h.Update)
	eng.POST("/api/teams/delete", fakeAuth(role), h.Delete)
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

type teamResp struct {
	ID   int64  `json:"id"`
	Name string `json:"name"`
}

func TestHandler_Get_Success(t *testing.T) {
	store := newFakeStore()
	store.seed(dbq.Team{Name: "엔지니어링"})
	eng := newHandlerEng(store, permission.RoleGeneral)

	w, raw := doJSON(t, eng, http.MethodGet, "/api/teams/1", nil)
	if w.Code != http.StatusOK {
		t.Fatalf("status = %d body=%s", w.Code, raw)
	}
	var env apiresult.Envelope[teamResp]
	_ = json.Unmarshal(raw, &env)
	if env.Data == nil || env.Data.Name != "엔지니어링" {
		t.Fatalf("env=%+v", env)
	}
}

func TestHandler_Get_NotFound(t *testing.T) {
	store := newFakeStore()
	eng := newHandlerEng(store, permission.RoleGeneral)

	w, raw := doJSON(t, eng, http.MethodGet, "/api/teams/99", nil)
	if w.Code != http.StatusNotFound {
		t.Fatalf("status = %d body=%s", w.Code, raw)
	}
	var env apiresult.Envelope[any]
	_ = json.Unmarshal(raw, &env)
	if env.Details == nil || env.Details.ErrorCode != errorcode.NotFound {
		t.Fatalf("env=%+v", env)
	}
}

func TestHandler_Get_BadID(t *testing.T) {
	store := newFakeStore()
	eng := newHandlerEng(store, permission.RoleGeneral)
	w, raw := doJSON(t, eng, http.MethodGet, "/api/teams/abc", nil)
	if w.Code != http.StatusBadRequest {
		t.Fatalf("status = %d body=%s", w.Code, raw)
	}
}

func TestHandler_List(t *testing.T) {
	store := newFakeStore()
	store.seed(dbq.Team{Name: "T1"})
	store.seed(dbq.Team{Name: "T2"})
	eng := newHandlerEng(store, permission.RoleGeneral)

	w, raw := doJSON(t, eng, http.MethodPost, "/api/teams/list", map[string]any{})
	if w.Code != http.StatusOK {
		t.Fatalf("status = %d body=%s", w.Code, raw)
	}
	var env apiresult.Envelope[[]teamResp]
	_ = json.Unmarshal(raw, &env)
	if env.Total == nil || *env.Total != 2 {
		t.Fatalf("total = %v", env.Total)
	}
}

func TestHandler_Create_Success(t *testing.T) {
	store := newFakeStore()
	eng := newHandlerEng(store, permission.RoleHRManager)

	w, raw := doJSON(t, eng, http.MethodPost, "/api/teams", map[string]any{"name": "신규팀"})
	if w.Code != http.StatusCreated {
		t.Fatalf("status = %d body=%s", w.Code, raw)
	}
	var env apiresult.Envelope[teamResp]
	_ = json.Unmarshal(raw, &env)
	if env.Data == nil || env.Data.Name != "신규팀" {
		t.Fatalf("env=%+v", env)
	}
}

func TestHandler_Create_NameRequired(t *testing.T) {
	store := newFakeStore()
	eng := newHandlerEng(store, permission.RoleHRManager)
	w, raw := doJSON(t, eng, http.MethodPost, "/api/teams", map[string]any{})
	if w.Code != http.StatusBadRequest {
		t.Fatalf("status = %d body=%s", w.Code, raw)
	}
}

func TestHandler_Update_Success(t *testing.T) {
	store := newFakeStore()
	store.seed(dbq.Team{Name: "Old"})
	eng := newHandlerEng(store, permission.RoleHRManager)

	w, raw := doJSON(t, eng, http.MethodPost, "/api/teams/update", map[string]any{
		"id": 1, "name": "NewName",
	})
	if w.Code != http.StatusOK {
		t.Fatalf("status = %d body=%s", w.Code, raw)
	}
	if store.teams[1].Name != "NewName" {
		t.Fatalf("name = %q", store.teams[1].Name)
	}
}

func TestHandler_Update_NotFound(t *testing.T) {
	store := newFakeStore()
	eng := newHandlerEng(store, permission.RoleHRManager)
	w, _ := doJSON(t, eng, http.MethodPost, "/api/teams/update", map[string]any{
		"id": 99, "name": "x",
	})
	if w.Code != http.StatusNotFound {
		t.Fatalf("status = %d", w.Code)
	}
}

func TestHandler_Delete_Success(t *testing.T) {
	store := newFakeStore()
	store.seed(dbq.Team{Name: "ToDelete"})
	eng := newHandlerEng(store, permission.RoleHRManager)

	w, raw := doJSON(t, eng, http.MethodPost, "/api/teams/delete", map[string]any{"id": 1})
	if w.Code != http.StatusOK {
		t.Fatalf("status = %d body=%s", w.Code, raw)
	}
	if !store.teams[1].DeletedAt.Valid {
		t.Fatal("deleted_at not set")
	}
}

func TestHandler_Delete_NotFound(t *testing.T) {
	store := newFakeStore()
	eng := newHandlerEng(store, permission.RoleHRManager)
	w, _ := doJSON(t, eng, http.MethodPost, "/api/teams/delete", map[string]any{"id": 99})
	if w.Code != http.StatusNotFound {
		t.Fatalf("status = %d", w.Code)
	}
}
