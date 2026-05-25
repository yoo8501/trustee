package leave_test

import (
	"bytes"
	"encoding/json"
	"io"
	"net/http"
	"net/http/httptest"
	"testing"

	"github.com/gin-gonic/gin"

	dbq "github.com/sjseo/docflow/backend/internal/db/sqlc"
	"github.com/sjseo/docflow/backend/internal/hr/leave"
	"github.com/sjseo/docflow/backend/internal/httpx/apiresult"
	"github.com/sjseo/docflow/backend/internal/httpx/errorcode"
	"github.com/sjseo/docflow/backend/internal/permission"
)

func init() {
	gin.SetMode(gin.TestMode)
}

// fakeAuth — 핸들러 단위 테스트에서 인증 컨텍스트를 직접 주입.
func fakeAuth(userID, tenantID int64, role permission.Role) gin.HandlerFunc {
	return func(c *gin.Context) {
		c.Set("auth:user_id", userID)
		c.Set("auth:tenant_id", tenantID)
		c.Set("auth:role", role)
		c.Next()
	}
}

func newLeaveTypeEng(store *fakeLeaveStore) *gin.Engine {
	svc := leave.NewLeaveTypeService(store)
	h := leave.NewLeaveTypeHandler(svc)
	eng := gin.New()
	eng.GET("/api/hr/leave-types/:id", fakeAuth(1, 1, permission.RoleGeneral), h.Get)
	eng.POST("/api/hr/leave-types/list", fakeAuth(1, 1, permission.RoleGeneral), h.List)
	eng.POST("/api/hr/leave-types", fakeAuth(1, 1, permission.RoleHRManager), h.Create)
	eng.POST("/api/hr/leave-types/update", fakeAuth(1, 1, permission.RoleHRManager), h.Update)
	eng.POST("/api/hr/leave-types/delete", fakeAuth(1, 1, permission.RoleHRManager), h.Delete)
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

type leaveTypeAPI struct {
	ID           int64           `json:"id"`
	Code         string          `json:"code"`
	Name         string          `json:"name"`
	DefaultHours float64         `json:"defaultHours"`
	IsPaid       bool            `json:"isPaid"`
	IsActive     bool            `json:"isActive"`
	AccrualPolicy json.RawMessage `json:"accrualPolicy"`
}

func TestLeaveTypeHandler_List_Success(t *testing.T) {
	store := newFakeLeaveStore()
	store.seedLeaveType(dbq.LeaveType{Code: "annual", Name: "연차", IsActive: true,
		DefaultHours: numericFromFloatTest(8.0),
		AccrualPolicy: []byte(`{"type":"annual_hire_anniversary","base_days":15,"tenure_bonus_per_2y":1,"tenure_cap_days":25}`),
	})
	store.seedLeaveType(dbq.LeaveType{Code: "half_day", Name: "반차", IsActive: true,
		DefaultHours: numericFromFloatTest(4.0),
		AccrualPolicy: []byte(`{"type":"fixed"}`),
	})
	eng := newLeaveTypeEng(store)

	w, raw := doJSON(t, eng, http.MethodPost, "/api/hr/leave-types/list", map[string]any{})
	if w.Code != http.StatusOK {
		t.Fatalf("code=%d body=%s", w.Code, raw)
	}
	var env apiresult.Envelope[[]leaveTypeAPI]
	_ = json.Unmarshal(raw, &env)
	if env.Total == nil || *env.Total != 2 {
		t.Fatalf("total=%v", env.Total)
	}
}

func TestLeaveTypeHandler_Get_Success(t *testing.T) {
	store := newFakeLeaveStore()
	lt := store.seedLeaveType(dbq.LeaveType{Code: "annual", Name: "연차", IsActive: true,
		DefaultHours: numericFromFloatTest(8.0),
		AccrualPolicy: []byte(`{"type":"annual_hire_anniversary","base_days":15,"tenure_bonus_per_2y":1,"tenure_cap_days":25}`),
	})
	eng := newLeaveTypeEng(store)

	url := "/api/hr/leave-types/" + intToStr(lt.ID)
	w, raw := doJSON(t, eng, http.MethodGet, url, nil)
	if w.Code != http.StatusOK {
		t.Fatalf("code=%d body=%s", w.Code, raw)
	}
	var env apiresult.Envelope[leaveTypeAPI]
	_ = json.Unmarshal(raw, &env)
	if env.Data == nil || env.Data.Code != "annual" {
		t.Fatalf("data=%+v", env.Data)
	}
}

func TestLeaveTypeHandler_Get_NotFound(t *testing.T) {
	store := newFakeLeaveStore()
	eng := newLeaveTypeEng(store)
	w, raw := doJSON(t, eng, http.MethodGet, "/api/hr/leave-types/999", nil)
	if w.Code != http.StatusNotFound {
		t.Fatalf("code=%d body=%s", w.Code, raw)
	}
	var env apiresult.Envelope[any]
	_ = json.Unmarshal(raw, &env)
	if env.Details == nil || env.Details.ErrorCode != errorcode.NotFound {
		t.Fatalf("env=%+v", env)
	}
}

func TestLeaveTypeHandler_Create_Success(t *testing.T) {
	store := newFakeLeaveStore()
	eng := newLeaveTypeEng(store)

	w, raw := doJSON(t, eng, http.MethodPost, "/api/hr/leave-types", map[string]any{
		"code":         "sabbatical",
		"name":         "안식휴가",
		"defaultHours": 8.0,
		"accrualPolicy": map[string]any{"type": "fixed"},
		"isPaid":       true,
		"isActive":     true,
	})
	if w.Code != http.StatusCreated {
		t.Fatalf("code=%d body=%s", w.Code, raw)
	}
}

func TestLeaveTypeHandler_Create_DuplicateCode_Conflict(t *testing.T) {
	store := newFakeLeaveStore()
	store.seedLeaveType(dbq.LeaveType{Code: "annual", Name: "연차", IsActive: true,
		DefaultHours: numericFromFloatTest(8.0),
		AccrualPolicy: []byte(`{"type":"fixed"}`),
	})
	eng := newLeaveTypeEng(store)
	w, raw := doJSON(t, eng, http.MethodPost, "/api/hr/leave-types", map[string]any{
		"code": "annual", "name": "재시도", "defaultHours": 8.0,
		"accrualPolicy": map[string]any{"type": "fixed"},
	})
	if w.Code != http.StatusConflict {
		t.Fatalf("code=%d body=%s", w.Code, raw)
	}
	var env apiresult.Envelope[any]
	_ = json.Unmarshal(raw, &env)
	if env.Details == nil || env.Details.ErrorCode != errorcode.Conflict {
		t.Fatalf("env=%+v", env)
	}
}

func TestLeaveTypeHandler_Create_ValidationFailed(t *testing.T) {
	store := newFakeLeaveStore()
	eng := newLeaveTypeEng(store)
	w, raw := doJSON(t, eng, http.MethodPost, "/api/hr/leave-types", map[string]any{
		"name": "", "defaultHours": 0,
		"accrualPolicy": map[string]any{"type": "fixed"},
	})
	if w.Code != http.StatusBadRequest {
		t.Fatalf("code=%d body=%s", w.Code, raw)
	}
	var env apiresult.Envelope[any]
	_ = json.Unmarshal(raw, &env)
	if env.Details == nil || env.Details.ErrorCode != errorcode.ValidationFailed {
		t.Fatalf("env=%+v", env)
	}
}

func TestLeaveTypeHandler_Create_InvalidAccrualPolicy(t *testing.T) {
	store := newFakeLeaveStore()
	eng := newLeaveTypeEng(store)
	w, raw := doJSON(t, eng, http.MethodPost, "/api/hr/leave-types", map[string]any{
		"code": "x", "name": "x", "defaultHours": 8.0,
		"accrualPolicy": map[string]any{"type": "weird"},
	})
	if w.Code != http.StatusBadRequest {
		t.Fatalf("code=%d body=%s", w.Code, raw)
	}
	var env apiresult.Envelope[any]
	_ = json.Unmarshal(raw, &env)
	if env.Details == nil || env.Details.ErrorCode != errorcode.InvalidAccrualPolicy {
		t.Fatalf("env=%+v", env)
	}
}

func TestLeaveTypeHandler_Update_Success(t *testing.T) {
	store := newFakeLeaveStore()
	lt := store.seedLeaveType(dbq.LeaveType{Code: "annual", Name: "연차", IsActive: true,
		DefaultHours: numericFromFloatTest(8.0),
		AccrualPolicy: []byte(`{"type":"fixed"}`),
	})
	eng := newLeaveTypeEng(store)
	newName := "연차(개정)"
	w, raw := doJSON(t, eng, http.MethodPost, "/api/hr/leave-types/update", map[string]any{
		"id": lt.ID, "name": newName,
	})
	if w.Code != http.StatusOK {
		t.Fatalf("code=%d body=%s", w.Code, raw)
	}
	if store.leaveTypes[lt.ID].Name != newName {
		t.Fatalf("name not updated: %q", store.leaveTypes[lt.ID].Name)
	}
}

func TestLeaveTypeHandler_Delete_Success(t *testing.T) {
	store := newFakeLeaveStore()
	lt := store.seedLeaveType(dbq.LeaveType{Code: "annual", Name: "연차", IsActive: true,
		DefaultHours: numericFromFloatTest(8.0),
		AccrualPolicy: []byte(`{"type":"fixed"}`),
	})
	eng := newLeaveTypeEng(store)
	w, raw := doJSON(t, eng, http.MethodPost, "/api/hr/leave-types/delete", map[string]any{"id": lt.ID})
	if w.Code != http.StatusOK {
		t.Fatalf("code=%d body=%s", w.Code, raw)
	}
	if !store.leaveTypes[lt.ID].DeletedAt.Valid {
		t.Fatal("soft delete not applied")
	}
}

func intToStr(n int64) string {
	// strconv 회피, fmt 회피 — 간단 변환.
	if n == 0 {
		return "0"
	}
	neg := n < 0
	if neg {
		n = -n
	}
	var buf [20]byte
	i := len(buf)
	for n > 0 {
		i--
		buf[i] = byte('0' + n%10)
		n /= 10
	}
	s := string(buf[i:])
	if neg {
		s = "-" + s
	}
	return s
}
