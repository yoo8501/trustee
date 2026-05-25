package teams_test

import (
	"bytes"
	"context"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"testing"

	"github.com/jackc/pgx/v5/pgtype"

	dbq "github.com/sjseo/docflow/backend/internal/db/sqlc"
	"github.com/sjseo/docflow/backend/internal/httpx/apiresult"
	"github.com/sjseo/docflow/backend/internal/httpx/errorcode"
	"github.com/sjseo/docflow/backend/internal/permission"
	"github.com/sjseo/docflow/backend/internal/teams"
)

func TestHandler_Create_InvalidJSON(t *testing.T) {
	store := newFakeStore()
	eng := newHandlerEng(store, permission.RoleHRManager)
	req := httptest.NewRequest(http.MethodPost, "/api/teams", bytes.NewBufferString("{bad"))
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

func TestHandler_Create_WithParentLeadHR(t *testing.T) {
	store := newFakeStore()
	eng := newHandlerEng(store, permission.RoleHRManager)

	parentID := int64(1)
	leadID := int64(2)
	hrID := int64(3)
	body := map[string]any{
		"name":         "팀A",
		"parentTeamId": parentID,
		"teamLeadId":   leadID,
		"hrManagerId":  hrID,
	}
	w, raw := doJSON(t, eng, http.MethodPost, "/api/teams", body)
	if w.Code != http.StatusCreated {
		t.Fatalf("status = %d body=%s", w.Code, raw)
	}
}

func TestHandler_Update_AllSetFields(t *testing.T) {
	store := newFakeStore()
	store.seed(dbq.Team{Name: "Old"})
	eng := newHandlerEng(store, permission.RoleHRManager)

	body := map[string]any{
		"id":           1,
		"name":         "NewName",
		"parentSet":    true,
		"parentTeamId": 99,
		"leadSet":      true,
		"teamLeadId":   100,
		"hrSet":        true,
		"hrManagerId":  101,
	}
	w, raw := doJSON(t, eng, http.MethodPost, "/api/teams/update", body)
	if w.Code != http.StatusOK {
		t.Fatalf("status = %d body=%s", w.Code, raw)
	}
	t1 := store.teams[1]
	if !t1.ParentTeamID.Valid || t1.ParentTeamID.Int64 != 99 {
		t.Fatalf("parent = %+v", t1.ParentTeamID)
	}
	if !t1.TeamLeadID.Valid || t1.TeamLeadID.Int64 != 100 {
		t.Fatalf("lead = %+v", t1.TeamLeadID)
	}
	if !t1.HrManagerID.Valid || t1.HrManagerID.Int64 != 101 {
		t.Fatalf("hr = %+v", t1.HrManagerID)
	}
}

func TestHandler_Update_UnsetParent(t *testing.T) {
	store := newFakeStore()
	store.seed(dbq.Team{Name: "X", ParentTeamID: pgtype.Int8{Int64: 9, Valid: true}})
	eng := newHandlerEng(store, permission.RoleHRManager)

	body := map[string]any{
		"id":           1,
		"parentSet":    true,
		"parentTeamId": nil,
	}
	w, _ := doJSON(t, eng, http.MethodPost, "/api/teams/update", body)
	if w.Code != http.StatusOK {
		t.Fatalf("status = %d", w.Code)
	}
	if store.teams[1].ParentTeamID.Valid {
		t.Fatalf("parent should be unset, got %+v", store.teams[1].ParentTeamID)
	}
}

func TestHandler_Update_InvalidJSON(t *testing.T) {
	store := newFakeStore()
	eng := newHandlerEng(store, permission.RoleHRManager)
	req := httptest.NewRequest(http.MethodPost, "/api/teams/update", bytes.NewBufferString("{bad"))
	req.Header.Set("Content-Type", "application/json")
	w := httptest.NewRecorder()
	eng.ServeHTTP(w, req)
	if w.Code != http.StatusBadRequest {
		t.Fatalf("status = %d", w.Code)
	}
}

func TestHandler_Update_MissingID(t *testing.T) {
	store := newFakeStore()
	eng := newHandlerEng(store, permission.RoleHRManager)
	w, _ := doJSON(t, eng, http.MethodPost, "/api/teams/update", map[string]any{})
	if w.Code != http.StatusBadRequest {
		t.Fatalf("status = %d", w.Code)
	}
}

func TestHandler_Delete_InvalidJSON(t *testing.T) {
	store := newFakeStore()
	eng := newHandlerEng(store, permission.RoleHRManager)
	req := httptest.NewRequest(http.MethodPost, "/api/teams/delete", bytes.NewBufferString("{bad"))
	req.Header.Set("Content-Type", "application/json")
	w := httptest.NewRecorder()
	eng.ServeHTTP(w, req)
	if w.Code != http.StatusBadRequest {
		t.Fatalf("status = %d", w.Code)
	}
}

func TestHandler_Delete_MissingID(t *testing.T) {
	store := newFakeStore()
	eng := newHandlerEng(store, permission.RoleHRManager)
	w, _ := doJSON(t, eng, http.MethodPost, "/api/teams/delete", map[string]any{})
	if w.Code != http.StatusBadRequest {
		t.Fatalf("status = %d", w.Code)
	}
}

// service-level: Create with empty name returns error (service.Create 의 분기).
func TestService_Create_EmptyName(t *testing.T) {
	store := newFakeStore()
	svc := teams.NewService(store)
	_, err := svc.Create(context.Background(), teams.CreateInput{TenantID: 1, Name: ""})
	if err == nil {
		t.Fatal("expected error for empty name")
	}
}

func TestHandler_Get_ResponseFields(t *testing.T) {
	store := newFakeStore()
	store.seed(dbq.Team{
		Name:         "A",
		ParentTeamID: pgtype.Int8{Int64: 7, Valid: true},
		TeamLeadID:   pgtype.Int8{Int64: 8, Valid: true},
		HrManagerID:  pgtype.Int8{Int64: 9, Valid: true},
	})
	eng := newHandlerEng(store, permission.RoleGeneral)
	w, raw := doJSON(t, eng, http.MethodGet, "/api/teams/1", nil)
	if w.Code != http.StatusOK {
		t.Fatalf("status = %d", w.Code)
	}
	var generic map[string]any
	_ = json.Unmarshal(raw, &generic)
	data := generic["data"].(map[string]any)
	if data["parentTeamId"].(float64) != 7 {
		t.Fatalf("parentTeamId = %v", data["parentTeamId"])
	}
}
