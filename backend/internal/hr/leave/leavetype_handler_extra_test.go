package leave_test

import (
	"encoding/json"
	"net/http"
	"testing"

	dbq "github.com/sjseo/docflow/backend/internal/db/sqlc"
	"github.com/sjseo/docflow/backend/internal/httpx/apiresult"
	"github.com/sjseo/docflow/backend/internal/httpx/errorcode"
	"github.com/sjseo/docflow/backend/internal/permission"
)

func permissionRoleHRForTest() permission.Role { return permission.RoleHRManager }

func TestLeaveTypeHandler_Update_NotFound(t *testing.T) {
	store := newFakeLeaveStore()
	eng := newLeaveTypeEng(store)
	w, _ := doJSON(t, eng, http.MethodPost, "/api/hr/leave-types/update", map[string]any{
		"id": 999, "name": "x",
	})
	if w.Code != http.StatusNotFound {
		t.Fatalf("code=%d", w.Code)
	}
}

func TestLeaveTypeHandler_Update_MissingID(t *testing.T) {
	store := newFakeLeaveStore()
	eng := newLeaveTypeEng(store)
	w, _ := doJSON(t, eng, http.MethodPost, "/api/hr/leave-types/update", map[string]any{
		"name": "x",
	})
	if w.Code != http.StatusBadRequest {
		t.Fatalf("code=%d", w.Code)
	}
}

func TestLeaveTypeHandler_Update_InvalidAccrualPolicy(t *testing.T) {
	store := newFakeLeaveStore()
	lt := store.seedLeaveType(dbq.LeaveType{Code: "annual", Name: "연차", IsActive: true,
		DefaultHours: numericFromFloatTest(8.0),
		AccrualPolicy: []byte(`{"type":"fixed"}`),
	})
	eng := newLeaveTypeEng(store)
	w, raw := doJSON(t, eng, http.MethodPost, "/api/hr/leave-types/update", map[string]any{
		"id": lt.ID,
		"accrualPolicy": map[string]any{"type": "garbage"},
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

func TestLeaveTypeHandler_Update_DefaultHoursAndFlags(t *testing.T) {
	store := newFakeLeaveStore()
	lt := store.seedLeaveType(dbq.LeaveType{Code: "annual", Name: "연차", IsActive: true,
		DefaultHours: numericFromFloatTest(8.0),
		AccrualPolicy: []byte(`{"type":"fixed"}`),
	})
	eng := newLeaveTypeEng(store)
	w, raw := doJSON(t, eng, http.MethodPost, "/api/hr/leave-types/update", map[string]any{
		"id": lt.ID, "defaultHours": 4.0, "isPaid": false, "isActive": false,
		"accrualPolicy": map[string]any{"type": "fixed"},
	})
	if w.Code != http.StatusOK {
		t.Fatalf("code=%d body=%s", w.Code, raw)
	}
	got := store.leaveTypes[lt.ID]
	if got.IsPaid || got.IsActive {
		t.Fatalf("flags not updated: paid=%v active=%v", got.IsPaid, got.IsActive)
	}
}

func TestLeaveTypeHandler_Update_InvalidDefaultHours(t *testing.T) {
	store := newFakeLeaveStore()
	lt := store.seedLeaveType(dbq.LeaveType{Code: "annual", Name: "연차", IsActive: true,
		DefaultHours: numericFromFloatTest(8.0),
		AccrualPolicy: []byte(`{"type":"fixed"}`),
	})
	eng := newLeaveTypeEng(store)
	w, _ := doJSON(t, eng, http.MethodPost, "/api/hr/leave-types/update", map[string]any{
		"id": lt.ID, "defaultHours": -1,
	})
	if w.Code != http.StatusBadRequest {
		t.Fatalf("code=%d", w.Code)
	}
}

func TestLeaveTypeHandler_Delete_NotFound(t *testing.T) {
	store := newFakeLeaveStore()
	eng := newLeaveTypeEng(store)
	w, _ := doJSON(t, eng, http.MethodPost, "/api/hr/leave-types/delete", map[string]any{"id": 999})
	if w.Code != http.StatusNotFound {
		t.Fatalf("code=%d", w.Code)
	}
}

func TestLeaveTypeHandler_Delete_MissingID(t *testing.T) {
	store := newFakeLeaveStore()
	eng := newLeaveTypeEng(store)
	w, _ := doJSON(t, eng, http.MethodPost, "/api/hr/leave-types/delete", map[string]any{})
	if w.Code != http.StatusBadRequest {
		t.Fatalf("code=%d", w.Code)
	}
}

func TestLeaveTypeHandler_Get_BadID(t *testing.T) {
	store := newFakeLeaveStore()
	eng := newLeaveTypeEng(store)
	w, _ := doJSON(t, eng, http.MethodGet, "/api/hr/leave-types/garbage", nil)
	if w.Code != http.StatusBadRequest {
		t.Fatalf("code=%d", w.Code)
	}
}

func TestLeaveBalanceHandler_Adjust_BadUserID(t *testing.T) {
	store := newFakeLeaveStore()
	store.seedLeaveType(dbq.LeaveType{Code: "annual", Name: "연차", IsActive: true,
		DefaultHours: numericFromFloatTest(8.0),
		AccrualPolicy: []byte(`{"type":"fixed"}`),
	})
	eng := newLeaveBalanceEng(store, 1, permissionRoleHRForTest())
	w, _ := doJSON(t, eng, http.MethodPost, "/api/hr/leave-balances/abc/adjust", map[string]any{
		"leaveTypeId": 1, "deltaHours": 8, "reason": "x",
	})
	if w.Code != http.StatusBadRequest {
		t.Fatalf("code=%d", w.Code)
	}
}
