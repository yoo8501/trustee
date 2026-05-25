package delegation_test

import (
	"bytes"
	"encoding/json"
	"io"
	"net/http"
	"net/http/httptest"
	"testing"

	"github.com/gin-gonic/gin"

	dbq "github.com/sjseo/docflow/backend/internal/db/sqlc"
	"github.com/sjseo/docflow/backend/internal/hr/delegation"
	"github.com/sjseo/docflow/backend/internal/httpx/apiresult"
	"github.com/sjseo/docflow/backend/internal/httpx/errorcode"
	"github.com/sjseo/docflow/backend/internal/permission"
)

// engineFor — actorID 를 항상 인증 context 에 주입하는 미니 라우터.
func engineFor(actorID int64, svc *delegation.Service) *gin.Engine {
	gin.SetMode(gin.TestMode)
	eng := gin.New()
	eng.Use(func(c *gin.Context) {
		c.Set("auth:user_id", actorID)
		c.Set("auth:role", permission.RoleGeneral)
		c.Set("auth:tenant_id", tenantID)
		c.Next()
	})
	h := delegation.NewHandler(svc)
	eng.POST("/api/hr/delegations", h.Create)
	eng.POST("/api/hr/delegations/me/list", h.MyList)
	eng.POST("/api/hr/delegations/delete", h.Delete)
	return eng
}

func doJSON(eng *gin.Engine, method, path string, body any) (*httptest.ResponseRecorder, []byte) {
	var buf bytes.Buffer
	if body != nil {
		_ = json.NewEncoder(&buf).Encode(body)
	}
	req := httptest.NewRequest(method, path, &buf)
	req.Header.Set("Content-Type", "application/json")
	w := httptest.NewRecorder()
	eng.ServeHTTP(w, req)
	raw, _ := io.ReadAll(w.Body)
	return w, raw
}

type delegationData struct {
	ID          int64  `json:"id"`
	DelegatorID int64  `json:"delegatorId"`
	DelegateID  int64  `json:"delegateId"`
	ValidFrom   string `json:"validFrom"`
	ValidTo     string `json:"validTo"`
}

func TestHandler_Create_Success_201(t *testing.T) {
	f := newFakeStore()
	seedDelegateUser(f)
	eng := engineFor(managerID, delegation.NewService(f))

	w, raw := doJSON(eng, http.MethodPost, "/api/hr/delegations", map[string]any{
		"delegateId": delegateID,
		"validFrom":  "2026-06-01T00:00:00+09:00",
		"validTo":    "2026-06-30T23:59:00+09:00",
		"scope":      map[string]any{"document_types": []string{"leave_request"}},
	})
	if w.Code != http.StatusCreated {
		t.Fatalf("status=%d body=%s", w.Code, raw)
	}
	var env apiresult.Envelope[delegationData]
	if err := json.Unmarshal(raw, &env); err != nil {
		t.Fatal(err)
	}
	if !env.Success {
		t.Fatalf("success=false body=%s", raw)
	}
	if env.Data == nil || env.Data.DelegateID != delegateID || env.Data.DelegatorID != managerID {
		t.Fatalf("data=%+v", env.Data)
	}
}

func TestHandler_Create_MissingDelegate_400_Validation(t *testing.T) {
	f := newFakeStore()
	seedDelegateUser(f)
	eng := engineFor(managerID, delegation.NewService(f))

	w, raw := doJSON(eng, http.MethodPost, "/api/hr/delegations", map[string]any{
		"validFrom": "2026-06-01T00:00:00+09:00",
		"validTo":   "2026-06-30T23:59:00+09:00",
	})
	if w.Code != http.StatusBadRequest {
		t.Fatalf("status=%d body=%s", w.Code, raw)
	}
	var env apiresult.Envelope[any]
	_ = json.Unmarshal(raw, &env)
	if env.Success || env.Details == nil || env.Details.ErrorCode != errorcode.ValidationFailed {
		t.Fatalf("env=%+v body=%s", env, raw)
	}
}

func TestHandler_Create_DelegateNotFound_404(t *testing.T) {
	f := newFakeStore()
	// managerID 만 시드, delegate 미존재.
	f.seedUser(dbq.User{ID: managerID, TenantID: tenantID})
	eng := engineFor(managerID, delegation.NewService(f))

	w, raw := doJSON(eng, http.MethodPost, "/api/hr/delegations", map[string]any{
		"delegateId": delegateID,
		"validFrom":  "2026-06-01T00:00:00+09:00",
		"validTo":    "2026-06-30T23:59:00+09:00",
	})
	if w.Code != http.StatusNotFound {
		t.Fatalf("status=%d body=%s", w.Code, raw)
	}
	var env apiresult.Envelope[any]
	_ = json.Unmarshal(raw, &env)
	if env.Success || env.Details == nil || env.Details.ErrorCode != errorcode.NotFound {
		t.Fatalf("env=%+v", env)
	}
}

func TestHandler_MyList_OK_200(t *testing.T) {
	f := newFakeStore()
	seedDelegateUser(f)
	f.seedDelegation(dbq.Delegation{
		TenantID: tenantID, DelegatorID: managerID, DelegateID: delegateID,
		ValidFrom: pgTS(ts(t, "2026-06-01 00:00")),
		ValidTo:   pgTS(ts(t, "2026-06-30 23:59")),
	})
	eng := engineFor(managerID, delegation.NewService(f))

	w, raw := doJSON(eng, http.MethodPost, "/api/hr/delegations/me/list", map[string]any{})
	if w.Code != http.StatusOK {
		t.Fatalf("status=%d body=%s", w.Code, raw)
	}
	var env apiresult.Envelope[[]delegationData]
	_ = json.Unmarshal(raw, &env)
	if !env.Success || env.Data == nil || len(*env.Data) != 1 {
		t.Fatalf("env=%+v body=%s", env, raw)
	}
}

func TestHandler_Delete_OK_200(t *testing.T) {
	f := newFakeStore()
	seedDelegateUser(f)
	d := f.seedDelegation(dbq.Delegation{
		TenantID: tenantID, DelegatorID: managerID, DelegateID: delegateID,
		ValidFrom: pgTS(ts(t, "2026-06-01 00:00")),
		ValidTo:   pgTS(ts(t, "2026-06-30 23:59")),
	})
	eng := engineFor(managerID, delegation.NewService(f))

	w, raw := doJSON(eng, http.MethodPost, "/api/hr/delegations/delete", map[string]any{"id": d.ID})
	if w.Code != http.StatusOK {
		t.Fatalf("status=%d body=%s", w.Code, raw)
	}
	if _, ok := f.delegations[d.ID]; ok {
		t.Errorf("delegation still present after Delete")
	}
}

func TestHandler_Delete_OtherUsersDelegation_404(t *testing.T) {
	f := newFakeStore()
	seedDelegateUser(f)
	d := f.seedDelegation(dbq.Delegation{
		TenantID: tenantID, DelegatorID: otherUserID, DelegateID: delegateID,
		ValidFrom: pgTS(ts(t, "2026-06-01 00:00")),
		ValidTo:   pgTS(ts(t, "2026-06-30 23:59")),
	})
	eng := engineFor(managerID, delegation.NewService(f))

	w, raw := doJSON(eng, http.MethodPost, "/api/hr/delegations/delete", map[string]any{"id": d.ID})
	if w.Code != http.StatusNotFound {
		t.Fatalf("status=%d body=%s", w.Code, raw)
	}
	var env apiresult.Envelope[any]
	_ = json.Unmarshal(raw, &env)
	if env.Success || env.Details == nil || env.Details.ErrorCode != errorcode.NotFound {
		t.Fatalf("env=%+v", env)
	}
}

func TestHandler_Delete_MissingID_400(t *testing.T) {
	f := newFakeStore()
	seedDelegateUser(f)
	eng := engineFor(managerID, delegation.NewService(f))

	w, raw := doJSON(eng, http.MethodPost, "/api/hr/delegations/delete", map[string]any{})
	if w.Code != http.StatusBadRequest {
		t.Fatalf("status=%d body=%s", w.Code, raw)
	}
	var env apiresult.Envelope[any]
	_ = json.Unmarshal(raw, &env)
	if env.Success || env.Details == nil || env.Details.ErrorCode != errorcode.ValidationFailed {
		t.Fatalf("env=%+v", env)
	}
}
