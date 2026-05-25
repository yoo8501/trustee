package users_test

import (
	"bytes"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"testing"

	"github.com/gin-gonic/gin"
	"github.com/jackc/pgx/v5/pgtype"

	dbq "github.com/sjseo/docflow/backend/internal/db/sqlc"
	"github.com/sjseo/docflow/backend/internal/httpx/apiresult"
	"github.com/sjseo/docflow/backend/internal/httpx/errorcode"
	"github.com/sjseo/docflow/backend/internal/permission"
	"github.com/sjseo/docflow/backend/internal/users"
)

func TestHandler_Me_Unauthenticated(t *testing.T) {
	// fakeAuth 없이 등록 → context 미주입 → 401.
	store := newFakeStore()
	svc := users.NewService(store)
	h := users.NewHandler(svc)
	eng := gin.New()
	eng.GET("/api/users/me", h.Me)

	req := httptest.NewRequest(http.MethodGet, "/api/users/me", nil)
	w := httptest.NewRecorder()
	eng.ServeHTTP(w, req)
	if w.Code != http.StatusUnauthorized {
		t.Fatalf("status = %d", w.Code)
	}
}

func TestHandler_Update_InvalidJSON(t *testing.T) {
	store := newFakeStore()
	store.seed(dbq.User{Email: "x", Role: dbq.UserRoleSuperAdmin})
	eng := newHandlerEng(store, 1, permission.RoleSuperAdmin)

	req := httptest.NewRequest(http.MethodPost, "/api/users/update", bytes.NewBufferString("{bad"))
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

func TestHandler_Update_SetTeamAndManager(t *testing.T) {
	store := newFakeStore()
	store.seed(dbq.User{Email: "admin", Role: dbq.UserRoleSuperAdmin})
	store.seed(dbq.User{Email: "target"})
	eng := newHandlerEng(store, 1, permission.RoleSuperAdmin)

	teamID := int64(7)
	mgrID := int64(1)
	body := map[string]any{
		"id":           2,
		"name":         "이름변경",
		"teamIdSet":    true,
		"teamId":       teamID,
		"managerIdSet": true,
		"managerId":    mgrID,
	}
	w, raw := doJSON(t, eng, http.MethodPost, "/api/users/update", body)
	if w.Code != http.StatusOK {
		t.Fatalf("status = %d body=%s", w.Code, raw)
	}
	if !store.users[2].TeamID.Valid || store.users[2].TeamID.Int64 != teamID {
		t.Fatalf("team_id = %+v", store.users[2].TeamID)
	}
	if !store.users[2].ManagerID.Valid || store.users[2].ManagerID.Int64 != mgrID {
		t.Fatalf("manager_id = %+v", store.users[2].ManagerID)
	}
	if store.users[2].Name != "이름변경" {
		t.Fatalf("name = %q", store.users[2].Name)
	}
}

func TestHandler_Update_UnsetTeam(t *testing.T) {
	store := newFakeStore()
	store.seed(dbq.User{Email: "admin", Role: dbq.UserRoleSuperAdmin})
	store.seed(dbq.User{Email: "target", TeamID: pgtype.Int8{Int64: 5, Valid: true}})

	eng := newHandlerEng(store, 1, permission.RoleSuperAdmin)
	body := map[string]any{
		"id":        2,
		"teamIdSet": true,
		"teamId":    nil,
	}
	w, raw := doJSON(t, eng, http.MethodPost, "/api/users/update", body)
	if w.Code != http.StatusOK {
		t.Fatalf("status = %d body=%s", w.Code, raw)
	}
	if store.users[2].TeamID.Valid {
		t.Fatalf("team_id should be unset, got %+v", store.users[2].TeamID)
	}
}

func TestHandler_Me_Success_ResponseIncludesTeam(t *testing.T) {
	store := newFakeStore()
	store.seed(dbq.User{
		Email: "u@x", Role: dbq.UserRoleHrManager,
		TeamID:    pgtype.Int8{Int64: 9, Valid: true},
		ManagerID: pgtype.Int8{Int64: 3, Valid: true},
		HireDate:  pgtype.Date{Valid: true},
	})
	eng := newHandlerEng(store, 1, permission.RoleHRManager)

	w, raw := doJSON(t, eng, http.MethodGet, "/api/users/me", nil)
	if w.Code != http.StatusOK {
		t.Fatalf("status = %d body=%s", w.Code, raw)
	}
	var generic map[string]any
	_ = json.Unmarshal(raw, &generic)
	data := generic["data"].(map[string]any)
	if data["teamId"].(float64) != 9 {
		t.Fatalf("teamId = %v", data["teamId"])
	}
	if data["managerId"].(float64) != 3 {
		t.Fatalf("managerId = %v", data["managerId"])
	}
}
